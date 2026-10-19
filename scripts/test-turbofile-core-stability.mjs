/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run compile-check-ts-native first. Opt in with --network [--ssh-a th_60] [--ssh-b th_64].
// --case "exact check name" reruns one failed check using fresh fixtures and a fresh service.
// Exercises the actual service; only newly created, owner-checked /tmp fixtures are removed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { build } from '../build/node_modules/esbuild/lib/main.js';

if (!process.argv.includes('--network')) {
	console.log('SKIP: --network is required to create isolated fixtures on 60 and 64. Run compile-check-ts-native first.');
	process.exit(0);
}
const argument = (name, fallback) => {
	const index = process.argv.indexOf(name);
	const value = index < 0 ? fallback : process.argv[index + 1];
	assert.ok(value && !value.startsWith('-'), `${name} requires an existing SSH alias`);
	return value;
};
const aliases = { a: argument('--ssh-a', 'th_60'), b: argument('--ssh-b', 'th_64') };
const selectedCase = process.argv.includes('--case') ? argument('--case') : undefined;
const exec = promisify(execFile);
const repo = process.cwd();
const runId = `turbofile-core-${randomUUID()}`;
const remoteRoot = `/tmp/${runId}`;
const evidenceRoot = path.join(repo, '.build', runId);
const smallBytes = 8 * 1024 ** 2;
const largeBytes = 64 * 1024 ** 2;
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const remotePath = relative => {
	const resolved = path.posix.join(remoteRoot, relative);
	assert.ok(resolved.startsWith(`${remoteRoot}/`) && !relative.split('/').includes('..'));
	return resolved;
};
const ssh = async (device, command) => (await exec('ssh', ['-n', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', aliases[device], command], { timeout: 30000, maxBuffer: 2 * 1024 * 1024 })).stdout;
const connections = {};
for (const device of ['a', 'b']) {
	const lines = (await exec('ssh', ['-G', aliases[device]], { timeout: 10000 })).stdout.split(/\r?\n/);
	const setting = name => lines.find(line => line.startsWith(`${name} `))?.slice(name.length + 1);
	assert.notEqual(setting('hostname'), '192.168.9.62', 'Server 62 must not be used by this test.');
	connections[device] = { host: setting('hostname'), port: Number(setting('port')), username: setting('user'), privateKeyPath: setting('identityfile') };
}
const endpoint = (device, relative, preferredProtocol = 'auto-fast') => ({ kind: 'ssh', connection: connections[device], path: remotePath(relative), preferredProtocol, supportsTar: true, supportsRsync: true });
await fs.mkdir(evidenceRoot, { recursive: true });
const serviceFile = path.join(evidenceRoot, 'service.mjs');
await build({ entryPoints: ['src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts'], outfile: serviceFile,
	bundle: true, platform: 'node', format: 'esm', packages: 'external', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
	plugins: [{ name: 'headless-electron', setup(builder) {
		builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'headless' }));
		builder.onLoad({ filter: /.*/, namespace: 'headless' }, () => ({ contents: `export const app={getPath:()=>${JSON.stringify(evidenceRoot)},getAppPath:()=>${JSON.stringify(repo)}}; export const BrowserWindow={},clipboard={},nativeImage={},protocol={};` }));
	} }] });
const { TurboFileSshMainService } = await import(pathToFileURL(serviceFile).href);
TurboFileSshMainService.prototype.ensureTurboFileImageProtocolRegistered = () => {};
TurboFileSshMainService.prototype.ensureWindowsDragCopyHookRegistered = async () => {};
const service = new TurboFileSshMainService({ getItem: (_key, fallback) => fallback, setItem() {}, removeItem() {} });
const created = new Set();
const results = [];
let abortRun = false;
let serial = 0;
const ownerCheck = () => `test ! -L ${quote(remoteRoot)} && test "$(realpath -- ${quote(remoteRoot)})" = ${quote(remoteRoot)} && test "$(cat ${quote(`${remoteRoot}/.owner`)})" = ${quote(runId)}`;
const hash = async (device, relative) => (await ssh(device, `sha256sum -- ${quote(remotePath(relative))}`)).trim().split(/\s/)[0];
const exists = async (device, relative) => (await ssh(device, `if [ -e ${quote(remotePath(relative))} ]; then printf yes; else printf no; fi`)) === 'yes';
const saveResults = () => fs.writeFile(path.join(evidenceRoot, 'results.json'), JSON.stringify({ remoteRoot, results }, null, 2));
async function check(name, callback) {
	if (selectedCase && name !== selectedCase) { return; }
	if (abortRun) { results.push({ name, ok: false, skipped: 'Previous operation exceeded watchdog; no further transfer was started.' }); await saveResults(); return; }
	const started = performance.now();
	try {
		const detail = await callback();
		results.push({ name, ok: true, durationMs: performance.now() - started, ...detail });
		console.log('PASS', name, JSON.stringify(detail));
	} catch (error) {
		results.push({ name, ok: false, durationMs: performance.now() - started, error: error.message });
		console.error('FAIL', name, error.message);
	}
	await saveResults();
}

async function transfer(name, request, { batch = false, rename = false, cancelBefore = false, cancelDuring = false } = {}) {
	const progressId = `${runId}-${++serial}`;
	const events = [];
	const started = performance.now();
	let cancellation;
	let canceledAt;
	let cancelTrigger;
	let watchdogTimer;
	let hardTimer;
	let watchdogExpired = false;
	const requestCancel = trigger => {
		if (cancellation) { return; }
		canceledAt = performance.now() - started;
		cancelTrigger = trigger;
		cancellation = service.cancelTransfer(progressId);
		void cancellation.catch(() => {});
	};
	const watchdog = new Promise((_, reject) => {
		watchdogTimer = setTimeout(() => {
			abortRun = true;
			watchdogExpired = true;
			requestCancel('watchdog');
			hardTimer = setTimeout(() => reject(new Error('Transfer exceeded 60 seconds and did not settle after 10 seconds of cancellation.')), 10000);
		}, 60000);
	});
	const subscription = service.onDynamicTransferProgress(progressId)(event => {
		events.push({ at: performance.now() - started, ...event });
		if (cancelDuring && event.phase !== 'complete' && event.transferredBytes > 0 && event.transferredBytes < largeBytes) {
			requestCancel('positive-incomplete-progress');
		}
	});
	try {
		if (cancelBefore) { requestCancel('before-start'); await Promise.race([cancellation, watchdog]); }
		const operation = rename ? service.renamePath(request.source, request.target.path, { progressId })
			: batch ? service.transferBatch({ ...request, progressId }) : service.transferFile({ ...request, progressId });
		const result = await Promise.race([operation, watchdog]);
		await Promise.race([cancellation ?? Promise.resolve(), watchdog]);
		const durationMs = performance.now() - started;
		await fs.writeFile(path.join(evidenceRoot, `${serial}-${name}.json`), JSON.stringify({ result, events, canceledAt, cancelTrigger, durationMs }, null, 2));
		assert.equal(watchdogExpired, false, 'Transfer exceeded the test watchdog.');
		if (cancelBefore || cancelDuring) {
			assert.ok(cancellation, 'Transfer completed before a positive incomplete progress event; in-flight cancellation was not exercised.');
			assert.equal(result.canceled, true, result.message);
			assert.equal(result.ok, false);
			assert.equal(events.at(-1)?.state, 'canceled');
			assert.ok(durationMs - canceledAt < 10000, 'Cancellation took more than 10 seconds.');
		}
		return { result, events, durationMs, cancelTrigger, cancellationMs: canceledAt === undefined ? undefined : durationMs - canceledAt };
	} finally {
		clearTimeout(watchdogTimer);
		clearTimeout(hardTimer);
		subscription.dispose();
	}
}
const expectCompleted = (data, strategy) => {
	assert.equal(data.result.ok, true, data.result.message);
	assert.equal(data.result.strategy, strategy);
	assert.equal(data.events.at(-1)?.phase, 'complete');
	assert.ok(data.events.some(event => event.phase !== 'complete'), 'Task must emit running progress, even when its total is unknown.');
	assert.ok(data.events.every(event => event.state !== 'fallback'), 'Healthy operation unexpectedly fell back.');
};
const ordinaryItems = base => [
	{ sourcePath: remotePath(`${base}/nested`), targetName: 'nested', sourceType: 'directory' },
	{ sourcePath: remotePath(`${base}/empty`), targetName: 'empty', sourceType: 'directory' },
	{ sourcePath: remotePath(`${base}/small.txt`), targetName: 'small.txt', sourceType: 'file' }
];
const batchRequest = (from, to, source, target, protocol = 'auto-fast', operation = 'copy') => ({ source: endpoint(from, source, protocol), targetDirectory: endpoint(to, target, protocol), items: ordinaryItems(source), operation, expectedBytes: 0, strategyHint: 'direct' });
async function preparePair(from, to, protocol = 'auto-fast') {
	// This is the same public preparation used by the UI; no test-only credentials or capabilities are injected.
	let timer;
	try {
		await Promise.race([service.prepareTransferPair(endpoint(from, 'source', protocol), endpoint(to, 'targets', protocol)), new Promise((_, reject) => {
			timer = setTimeout(() => { abortRun = true; reject(new Error('Public transfer-pair preparation exceeded 30 seconds.')); }, 30000);
		})]);
	} finally { clearTimeout(timer); }
}

try {
	for (const device of ['a', 'b']) {
		await ssh(device, `test "$(realpath -- /tmp)" = /tmp && test ! -e ${quote(remoteRoot)} && test ! -L ${quote(remoteRoot)} && mkdir -m 700 -- ${quote(remoteRoot)} && printf '%s' ${quote(runId)} > ${quote(`${remoteRoot}/.owner`)}`);
		created.add(device);
		await ssh(device, `${ownerCheck()} && mkdir -p -- ${quote(remotePath('source/nested'))} ${quote(remotePath('source/empty'))} ${quote(remotePath('targets'))} && printf fixture > ${quote(remotePath('source/small.txt'))} && head -c ${smallBytes} /dev/urandom > ${quote(remotePath('source/nested/data.bin'))}`);
	}
	const sourceHash = await hash('a', 'source/nested/data.bin');
	await check('same-host single directory copy, unknown total', async () => {
		const data = await transfer('native-single', { source: endpoint('a', 'source'), target: endpoint('a', 'targets/native-single'), sourceType: 'directory', expectedBytes: 0 });
		expectCompleted(data, 'remote-copy');
		assert.equal(await hash('a', 'targets/native-single/nested/data.bin'), sourceHash);
		assert.equal(await hash('a', 'source/nested/data.bin'), sourceHash);
		return { hashVerified: true, sourcePreserved: true, events: data.events.length, reportedBytes: data.result.bytes };
	});
	await check('same-host batch copy including empty directory', async () => {
		const data = await transfer('native-batch', batchRequest('a', 'a', 'source', 'targets/native-batch'), { batch: true });
		expectCompleted(data, 'remote-copy');
		assert.equal(await hash('a', 'targets/native-batch/nested/data.bin'), sourceHash);
		assert.equal(await exists('a', 'targets/native-batch/empty'), true);
		return { hashVerified: true, events: data.events.length, reportedBytes: data.result.bytes, note: 'Unknown-total fast native batches may finish before a byte sample; no extra scan is added.' };
	});
	await check('same-host single-item move removes only the successful source', async () => {
		const source = 'targets/native-single/small.txt';
		const before = await hash('a', source);
		const data = await transfer('native-one-move', { ...batchRequest('a', 'a', 'targets/native-single', 'targets/native-one-move', 'auto-fast', 'move'), items: [{ sourcePath: remotePath(source), targetName: 'small.txt', sourceType: 'file' }] }, { batch: true });
		expectCompleted(data, 'remote-copy');
		assert.equal(await hash('a', 'targets/native-one-move/small.txt'), before);
		assert.equal(await exists('a', source), false);
		return { hashVerified: true, sourceRemovedAfterSuccess: true };
	});
	await check('same-host batch move preserves content and removes its source entries', async () => {
		const data = await transfer('native-batch-move', batchRequest('a', 'a', 'targets/native-batch', 'targets/native-moved', 'auto-fast', 'move'), { batch: true });
		expectCompleted(data, 'remote-copy');
		assert.equal(await hash('a', 'targets/native-moved/nested/data.bin'), sourceHash);
		assert.equal(await exists('a', 'targets/native-batch/nested'), false);
		assert.equal(await exists('a', 'targets/native-batch/empty'), false);
		assert.equal(await exists('a', 'targets/native-batch/small.txt'), false);
		return { hashVerified: true, sourceRemovedAfterSuccess: true };
	});
	await check('same-host confirmed single-file overwrite keeps rename semantics with progress', async () => {
		await ssh('a', `${ownerCheck()} && cp -- ${quote(remotePath('source/small.txt'))} ${quote(remotePath('targets/rename-source.txt'))} && printf old-target > ${quote(remotePath('targets/rename-target.txt'))}`);
		const before = await hash('a', 'targets/rename-source.txt');
		const data = await transfer('native-rename-overwrite', { source: endpoint('a', 'targets/rename-source.txt'), target: endpoint('a', 'targets/rename-target.txt') }, { rename: true });
		assert.equal(data.result.ok, true, data.result.message);
		assert.equal(await hash('a', 'targets/rename-target.txt'), before);
		assert.equal(await exists('a', 'targets/rename-source.txt'), false);
		assert.ok(data.events.some(event => event.phase === 'transfer'), 'Cancelable same-host rename must emit running progress.');
		assert.equal(data.events.at(-1)?.phase, 'complete');
		return { hashVerified: true, sourceRemovedAfterSuccess: true, events: data.events.length };
	});
	await check('default native batch move still refuses an existing target', async () => {
		await ssh('a', `${ownerCheck()} && mkdir -- ${quote(remotePath('targets/no-overwrite'))} && cp -- ${quote(remotePath('source/small.txt'))} ${quote(remotePath('targets/collision.txt'))} && printf old-target > ${quote(remotePath('targets/no-overwrite/collision.txt'))}`);
		const beforeSource = await hash('a', 'targets/collision.txt');
		const beforeTarget = await hash('a', 'targets/no-overwrite/collision.txt');
		const request = { ...batchRequest('a', 'a', 'targets', 'targets/no-overwrite', 'auto-fast', 'move'), items: [{ sourcePath: remotePath('targets/collision.txt'), targetName: 'collision.txt', sourceType: 'file' }] };
		const data = await transfer('native-batch-no-overwrite', request, { batch: true });
		assert.equal(data.result.ok, false, 'Default batch move must not silently overwrite.');
		assert.equal(await hash('a', 'targets/collision.txt'), beforeSource);
		assert.equal(await hash('a', 'targets/no-overwrite/collision.txt'), beforeTarget);
		return { sourcePreserved: true, targetPreserved: true };
	});
	await check('cancellation before file request prevents a late native copy', async () => {
		const data = await transfer('native-pre-cancel', { source: endpoint('a', 'source'), target: endpoint('a', 'targets/native-pre-cancel'), sourceType: 'directory' }, { cancelBefore: true });
		assert.equal(await exists('a', 'targets/native-pre-cancel'), false);
		assert.equal(await hash('a', 'source/nested/data.bin'), sourceHash);
		return { sourcePreserved: true, targetUntouched: true, cancellationMs: data.cancellationMs };
	});
	await check('cancellation before batch move preserves all source entries', async () => {
		const data = await transfer('batch-pre-cancel', batchRequest('a', 'a', 'source', 'targets/batch-pre-cancel', 'auto-fast', 'move'), { batch: true, cancelBefore: true });
		assert.equal(await exists('a', 'targets/batch-pre-cancel'), false);
		assert.equal(await hash('a', 'source/nested/data.bin'), sourceHash);
		assert.equal(await exists('a', 'source/small.txt'), true);
		return { sourcePreserved: true, targetUntouched: true, cancellationMs: data.cancellationMs };
	});
	await check('prepare the actual direct SSH route', async () => { await preparePair('a', 'b'); return { prepared: true }; });
	for (const protocol of ['tar', 'scp', 'sftp']) {
		await check(`${protocol} direct batch copy stays on its protocol`, async () => {
			await preparePair('a', 'b', protocol);
			const data = await transfer(`direct-${protocol}`, batchRequest('a', 'b', 'source', `targets/direct-${protocol}`, protocol), { batch: true });
			expectCompleted(data, `${protocol}-direct`);
			assert.equal(await hash('b', `targets/direct-${protocol}/nested/data.bin`), sourceHash);
			assert.equal(await exists('b', `targets/direct-${protocol}/empty`), true);
			assert.equal(await hash('a', 'source/nested/data.bin'), sourceHash);
			return { strategy: data.result.strategy, hashVerified: true, sourcePreserved: true, durationMs: data.durationMs };
		});
	}
	await check('direct SFTP single-file overwrite truncates a larger target', async () => {
		await ssh('b', `${ownerCheck()} && head -c ${smallBytes + 4096} /dev/zero > ${quote(remotePath('targets/overwrite.bin'))}`);
		const data = await transfer('direct-overwrite', { source: endpoint('a', 'source/nested/data.bin', 'sftp'), target: endpoint('b', 'targets/overwrite.bin', 'sftp'), sourceType: 'file', expectedBytes: smallBytes, strategyHint: 'direct', attemptProtocol: 'sftp' });
		expectCompleted(data, 'sftp-direct');
		assert.equal(await hash('b', 'targets/overwrite.bin'), sourceHash);
		return { hashVerified: true, strategy: data.result.strategy };
	});
	await check('cancel a live direct copy, preserve source, then reuse the service', async () => {
		await ssh('a', `${ownerCheck()} && head -c ${largeBytes} /dev/urandom > ${quote(remotePath('cancel.bin'))}`);
		const before = await hash('a', 'cancel.bin');
		const data = await transfer('live-cancel', { source: endpoint('a', 'cancel.bin', 'sftp'), target: endpoint('b', 'targets/canceled.bin', 'sftp'), sourceType: 'file', expectedBytes: largeBytes, strategyHint: 'direct', attemptProtocol: 'sftp' }, { cancelDuring: true });
		assert.equal(await hash('a', 'cancel.bin'), before);
		const next = await transfer('after-cancel', { source: endpoint('a', 'source/nested/data.bin', 'sftp'), target: endpoint('b', 'targets/after-cancel.bin', 'sftp'), sourceType: 'file', expectedBytes: smallBytes, strategyHint: 'direct', attemptProtocol: 'sftp' });
		expectCompleted(next, 'sftp-direct');
		assert.equal(await hash('b', 'targets/after-cancel.bin'), sourceHash);
		return { sourcePreserved: true, cancelTrigger: data.cancelTrigger, cancellationMs: data.cancellationMs, nextCopyHashVerified: true };
	});
	const uid = (await ssh('a', 'id -u')).trim();
	if (uid !== '0') {
		await ssh('a', `${ownerCheck()} && mkdir -- ${quote(remotePath('protected'))} && printf secret > ${quote(remotePath('protected/locked.bin'))} && chmod 000 -- ${quote(remotePath('protected/locked.bin'))}`);
		for (const protocol of ['tar', 'scp', 'sftp']) {
			await check(`${protocol} source permission failure does not retry another protocol or delete source`, async () => {
				const request = { ...batchRequest('a', 'b', 'protected', `targets/denied-${protocol}`, protocol, 'move'), items: [{ sourcePath: remotePath('protected'), targetName: 'protected', sourceType: 'directory' }] };
				const data = await transfer(`denied-${protocol}`, request, { batch: true });
				assert.equal(data.result.ok, false);
				assert.match(data.result.message, /denied|permission|权限/i);
				assert.ok(data.events.every(event => event.state !== 'fallback'), 'Source permission failure triggered a meaningless protocol fallback.');
				const protocols = [...new Set(data.events.filter(event => event.state === 'transferring').map(event => event.strategy).filter(Boolean))];
				assert.ok(protocols.every(strategy => strategy === `${protocol}-direct`), JSON.stringify(protocols));
				assert.equal(await exists('a', 'protected/locked.bin'), true);
				return { sourcePreserved: true, protocols, message: data.result.message };
			});
		}
	} else {
		results.push({ name: 'permission failure matrix', ok: true, skipped: 'Root account bypasses mode 000; use a non-root test alias to exercise this matrix.' });
		await saveResults();
	}
	if (selectedCase) {
		assert.ok(results.some(result => result.name === selectedCase), `Unknown or unavailable --case: ${selectedCase}`);
	}
} catch (error) {
	results.push({ name: 'fixture setup or matrix preparation', ok: false, error: error.message });
	console.error('FAIL fixture setup or matrix preparation', error.message);
} finally {
	assert.match(remoteRoot, /^\/tmp\/turbofile-core-[0-9a-f-]{36}$/);
	for (const device of created) {
		try {
			await ssh(device, `${ownerCheck()} && rm -rf -- ${quote(remoteRoot)}`);
			results.push({ name: `cleanup ${device}`, ok: true });
		} catch (error) {
			results.push({ name: `cleanup ${device}`, ok: false, error: error.message, remainingFixture: remoteRoot });
			console.error('FAIL cleanup', device, remoteRoot, error.message);
		}
	}
	await saveResults();
}
console.log('EVIDENCE', evidenceRoot);
process.exitCode = results.every(result => result.ok) ? 0 : 1;
// No further checks remain; close pooled SSH clients and idle timers with this dedicated test process.
setTimeout(() => process.exit(process.exitCode), 50);
