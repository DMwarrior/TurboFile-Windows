/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run compile-check-ts-native first. Opt-in: --network [--ssh th_60] [--scratch-parent /tmp] [--benchmark].
// Copies use the real native cp/reflink path; only fresh, owned fixtures are removed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { build } from '../build/node_modules/esbuild/lib/main.js';

if (!process.argv.includes('--network')) {
	console.log('SKIP: pass --network to create isolated same-host SSH fixtures; --benchmark adds three alternating HEAD/current rounds.');
	process.exit(0);
}
const exec = promisify(execFile);
const repo = process.cwd();
const runId = `turbofile-samehost-${Date.now()}-${randomUUID().slice(0, 8)}`;
const audit = path.join(repo, '.build', runId);
const scratchIndex = process.argv.indexOf('--scratch-parent');
const scratchParent = scratchIndex < 0 ? '/tmp' : process.argv[scratchIndex + 1];
assert.ok(scratchParent && scratchParent.startsWith('/') && !/[\r\n\0]/.test(scratchParent), '--scratch-parent requires an absolute POSIX directory');
assert.ok(!scratchParent.split('/').includes('..'), '--scratch-parent must not contain ..');
assert.equal(path.posix.normalize(scratchParent), scratchParent, '--scratch-parent must already be normalized');
const remoteRoot = path.posix.join(scratchParent, runId);
const aliasIndex = process.argv.indexOf('--ssh');
const alias = aliasIndex < 0 ? process.env.TURBOFILE_TEST_SSH_A ?? 'th_60' : process.argv[aliasIndex + 1];
assert.ok(alias && !alias.startsWith('-'), '--ssh requires an existing OpenSSH alias');
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const ssh = async command => (await exec('ssh', ['-n', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', alias, command], { timeout: 180000, maxBuffer: 4 * 1024 * 1024 })).stdout;
const configuration = (await exec('ssh', ['-G', alias])).stdout.split(/\r?\n/);
const setting = name => configuration.find(line => line.startsWith(`${name} `))?.slice(name.length + 1);
const connection = { host: setting('hostname'), port: Number(setting('port')), username: setting('user'), privateKeyPath: setting('identityfile') };
const endpoint = relative => ({ kind: 'ssh', connection, path: `${remoteRoot}/${relative}`, preferredProtocol: 'auto-fast', supportsTar: true, supportsRsync: true });
await fs.mkdir(audit, { recursive: true });
const sourceFile = 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts';
const sources = { current: await fs.readFile(path.join(repo, sourceFile), 'utf8'), head: (await exec('git', ['show', `HEAD:${sourceFile}`], { maxBuffer: 4 * 1024 * 1024 })).stdout };
async function loadService(label) {
	const outfile = path.join(audit, `${label}.mjs`);
	await build({ stdin: { contents: `${sources[label]}\nexport { buildPosixCopyCommand };`, loader: 'ts', resolveDir: path.dirname(path.join(repo, sourceFile)) }, outfile,
		bundle: true, platform: 'node', format: 'esm', packages: 'external', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
		plugins: [{ name: 'headless-electron', setup(builder) {
			builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'adapter' }));
			builder.onLoad({ filter: /.*/, namespace: 'adapter' }, () => ({ contents: `export const app={getPath:()=>${JSON.stringify(audit)},getAppPath:()=>${JSON.stringify(repo)}}; export const BrowserWindow={},clipboard={},nativeImage={},protocol={};` }));
		} }] });
	const module = await import(pathToFileURL(outfile).href);
	module.TurboFileSshMainService.prototype.ensureTurboFileImageProtocolRegistered = () => {};
	module.TurboFileSshMainService.prototype.ensureWindowsDragCopyHookRegistered = async () => {};
	return { service: new module.TurboFileSshMainService({ getItem: (_key, fallback) => fallback, setItem() {}, removeItem() {} }), command: module.buildPosixCopyCommand };
}
const current = await loadService('current');
const head = await loadService('head');
const results = [];
let abortRun = false;
let unsafeCleanup = false;
async function check(name, run) {
	if (abortRun) { console.log('SKIP', name, 'an earlier transfer exceeded its watchdog'); return; }
	try { const evidence = await run(); results.push({ name, ok: true, ...evidence }); console.log('PASS', name, JSON.stringify(evidence)); }
	catch (error) { results.push({ name, ok: false, error: error.stack }); console.error('FAIL', name, error.message); }
	await fs.writeFile(path.join(audit, 'results.json'), JSON.stringify(results, null, 2));
}
let createdRoot = false;
const ownerCheck = () => `test ! -L ${quote(remoteRoot)} && test "$(realpath -- ${quote(remoteRoot)})" = ${quote(remoteRoot)} && test "$(cat ${quote(remoteRoot + '/.owner')})" = ${quote(runId)}`;
async function removeOwned(target) {
	assert.equal(unsafeCleanup, false, 'A remote writer may still be active; retain the owned fixture for inspection.');
	assert.ok(createdRoot && /^turbofile-samehost-\d+-[a-f0-9]{8}$/.test(path.posix.basename(remoteRoot)));
	assert.equal(path.posix.dirname(remoteRoot), scratchParent);
	assert.ok(target === remoteRoot || target.startsWith(remoteRoot + '/'));
	assert.equal(path.posix.normalize(target), target);
	await ssh(`${ownerCheck()} && if [ -e ${quote(target)} ] || [ -L ${quote(target)} ]; then test ! -L ${quote(target)} && test "$(realpath -- ${quote(target)})" = ${quote(target)} && rm -rf -- ${quote(target)}; fi`);
}
const hash = async relative => (await ssh(`sha256sum -- ${quote(endpoint(relative).path)}`)).trim().split(/\s/)[0];
const largeBytes = 3 * 1024 ** 3;
const smallBytes = 2 * 1024 ** 2;
let largeHash;
let smallHash;
let serial = 0;
async function transfer(label, instance, batch = false, cancel = false, strictBytes = true, largeBatch = false) {
	const name = `${label}-${++serial}`;
	const target = endpoint(name);
	const smallBatch = batch && !largeBatch;
	const source = endpoint(smallBatch ? 'small' : 'large');
	const expectedBytes = smallBatch ? smallBytes : largeBytes;
	const sourceData = smallBatch ? 'small/nested/data.bin' : 'large/data.bin';
	const expectedHash = smallBatch ? smallHash : largeHash;
	await ssh(`mkdir -- ${quote(target.path)}`);
	const progressId = `${runId}-${name}`;
	const events = [];
	const began = performance.now();
	let cancellation;
	let cancellationAt;
	let cancellationReason;
	let cancelTimer;
	let watchdogTimer;
	let hardFailureTimer;
	let watchdogExpired = false;
	const requestCancel = reason => {
		if (!cancellation) {
			cancellationAt = performance.now() - began;
			cancellationReason = reason;
			cancellation = instance.cancelTransfer(progressId);
			void cancellation.catch(() => {}); // The race below reports rejection; prevent an early unhandled rejection.
		}
	};
	const watchdog = new Promise((_, reject) => {
		watchdogTimer = setTimeout(() => {
			watchdogExpired = true;
			abortRun = true;
			hardFailureTimer = setTimeout(() => { unsafeCleanup = true; reject(new Error('Transfer exceeded 60 seconds and did not settle within 10 seconds after cancellation.')); }, 10000);
			requestCancel('watchdog-timeout');
		}, 60000);
	});
	const clearWatchdog = () => { clearTimeout(watchdogTimer); clearTimeout(hardFailureTimer); };
	const subscription = instance.onDynamicTransferProgress(progressId)(event => {
		events.push({ at: performance.now() - began, ...event });
		if (cancel && event.phase === 'transfer') {
			if (event.transferredBytes > 0) { requestCancel('positive-progress'); }
			else if (!cancelTimer) { cancelTimer = setTimeout(() => requestCancel('timeout-without-positive-progress'), 2000); }
		}
	});
	try {
		const operation = batch
			? instance.transferBatch({ source, targetDirectory: target, operation: 'copy', progressId, expectedBytes: 0,
				items: largeBatch
					? [{ sourcePath: source.path + '/data.bin', targetName: 'data.bin', sourceType: 'file' }, { sourcePath: source.path + '/empty.txt', targetName: 'empty.txt', sourceType: 'file' }]
					: [{ sourcePath: source.path + '/nested', targetName: 'nested', sourceType: 'directory' }, { sourcePath: source.path + '/empty.txt', targetName: 'empty.txt', sourceType: 'file' }] })
			: instance.transferFile({ source, target: endpoint(`${name}/copied`), sourceType: 'directory', expectedBytes: 0, progressId });
		const result = await Promise.race([operation, watchdog]);
		const durationMs = performance.now() - began;
		clearTimeout(cancelTimer);
		const cancellationResult = await Promise.race([cancellation ?? Promise.resolve(), watchdog]);
		clearWatchdog();
		await fs.writeFile(path.join(audit, `${name}.json`), JSON.stringify({ label, batch, cancel, durationMs, cancellationAt, cancellationReason, result, events }, null, 2));
		assert.equal(watchdogExpired, false, 'Transfer exceeded the 60 second watchdog and was canceled');
		if (cancel) {
			const copiedFile = largeBatch ? `${target.path}/data.bin` : `${target.path}/${batch ? 'nested' : 'copied'}/data.bin`;
			const sizeCommand = `if [ -e ${quote(copiedFile)} ]; then stat -c %s -- ${quote(copiedFile)}; else printf '0'; fi`;
			// Inspect the destination immediately: hashing a 3 GiB source first would hide a
			// detached cp that finishes in the background after cancellation returned.
			const firstSize = Number((await ssh(sizeCommand)).trim());
			await new Promise(resolve => setTimeout(resolve, 600));
			const secondSize = Number((await ssh(sizeCommand)).trim());
			await fs.writeFile(path.join(audit, `${name}-stopped.json`), JSON.stringify({ cancellationResult, firstSize, secondSize, expectedBytes, intervalMs: 600 }, null, 2));
			if (secondSize !== firstSize || !cancellationResult?.ok) {
				unsafeCleanup = true;
				abortRun = true;
			}
			assert.equal(cancellationResult?.ok, true, 'Cancellation must confirm that the remote writer stopped.');
			assert.equal(secondSize, firstSize, 'Destination continued growing after cancellation.');
			assert.ok(secondSize < expectedBytes, 'Copy finished before remote cancellation was exercised.');
			assert.equal(result.canceled, true, 'copy finished before in-flight cancellation was exercised, or cancellation failed');
			assert.equal(result.ok, false);
			assert.equal(events.at(-1)?.state, 'canceled');
			assert.equal(await hash(sourceData), expectedHash, 'source must remain intact');
			return { canceled: true, cancellationAt, cancellationReason, inFlightProgressVerified: cancellationReason === 'positive-progress', durationMs, sourceHashVerified: true, stoppedTargetBytes: secondSize, targetStoppedGrowing: true };
		}
		assert.equal(await hash(sourceData), expectedHash, 'source must remain intact');
		assert.equal(result.ok, true, result.message);
		assert.equal(result.strategy, 'remote-copy');
		assert.equal(await hash(`${name}/${batch ? 'nested' : 'copied'}/data.bin`), batch ? smallHash : largeHash);
		if (batch) { await ssh(`test -f ${quote(`${target.path}/empty.txt`)} && test ! -s ${quote(`${target.path}/empty.txt`)}`); }
		if (strictBytes) { assert.equal(result.bytes, expectedBytes, 'final logical bytes must include the complete directory'); }
		assert.equal(events.at(-1)?.phase, 'complete');
		if (strictBytes) { assert.equal(events.at(-1)?.transferredBytes, expectedBytes); }
		for (let i = 1; i < events.length; i++) { assert.ok(events[i].transferredBytes >= events[i - 1].transferredBytes, 'progress rewound'); }
		const positive = events.filter(event => event.phase !== 'complete' && event.transferredBytes > 0);
		if (strictBytes && durationMs > 3000) { assert.ok(positive.length >= 2, 'long copy has no intermediate progress'); }
		return { durationMs, strategy: result.strategy, logicalBytes: expectedBytes, reportedBytes: result.bytes,
			byteAccounting: batch && !strictBytes ? 'Unknown native batch total: a fast copy may report zero bytes.' : strictBytes ? 'Exact fixture total verified.' : 'Baseline byte reporting recorded without an exact-total assertion.',
			MiBPerSecond: expectedBytes / 1024 ** 2 / (durationMs / 1000), eventCount: events.length, intermediateEvents: positive.length,
			firstPositiveMs: positive[0]?.at ?? null, highestIntermediateBytes: Math.max(0, ...positive.map(event => event.transferredBytes)), hashVerified: true };
	} catch (error) {
		if (watchdogExpired) { await fs.writeFile(path.join(audit, `${name}-timeout.json`), JSON.stringify({ label, batch, durationMs: performance.now() - began, cancellationAt, cancellationReason, error: error.message, events }, null, 2)); }
		throw error;
	} finally { clearTimeout(cancelTimer); clearWatchdog(); subscription.dispose(); if (!unsafeCleanup) { await removeOwned(target.path); } }
}
try {
	await check('real remote awk preserves 31 GiB and the full shell numeric guard', async () => {
		const samples = [];
		for (const bytes of [2147483647, 2147483648, 31 * 1024 ** 3]) {
			const sample = { bytes };
			for (const [label, instance] of [['head', head], ['current', current]]) {
				const command = instance.command('/unused-source', '/unused-target', true);
				const program = /tf_copy_bytes=\$\(awk '([^']+)'/.exec(command)?.[1];
				assert.ok(program, 'extract the actual production awk program');
				const input = `printf '%s\\n' 'rchar: 0' 'wchar: ${bytes}' 'read_bytes: 0' 'write_bytes: 0'`;
				const output = (await ssh(`value=$(${input} | awk ${quote(program)}); printf '%s\\n' "$value"; case "$value" in ''|*[!0-9]*) value=0 ;; esac; printf '%s\\n' "$value"`)).trim().split(/\r?\n/);
				sample[label] = { raw: output[0], guardedBytes: Number(output[1]) };
			}
			assert.equal(sample.current.raw, String(bytes));
			assert.equal(sample.current.guardedBytes, bytes);
			samples.push(sample);
		}
		return { samples, oldZeroReproduced: samples.some(sample => sample.head.guardedBytes === 0) };
	});
	assert.equal((await ssh(`test -d ${quote(scratchParent)} && realpath -- ${quote(scratchParent)}`)).trim(), scratchParent, 'scratch parent must resolve to the explicitly supplied directory');
	const filesystem = (await ssh(`df -PTk -- ${quote(scratchParent)}`)).trim();
	const fields = filesystem.split(/\r?\n/).at(-1).trim().split(/\s+/);
	const availableBytes = Number(fields[4]) * 1024;
	await fs.writeFile(path.join(audit, 'filesystem.json'), JSON.stringify({ scratchParent, remoteRoot, filesystem, type: fields[1], availableBytes }, null, 2));
	assert.ok(availableBytes >= largeBytes * 2 + 1024 ** 3, `Need at least 7 GiB free in ${scratchParent}; found ${availableBytes} bytes`);
	await ssh(`mkdir -- ${quote(remoteRoot)} && printf '%s' ${quote(runId)} > ${quote(remoteRoot + '/.owner')}`);
	createdRoot = true;
	await ssh(`mkdir -- ${quote(remoteRoot + '/large')} ${quote(remoteRoot + '/small')} && mkdir -- ${quote(remoteRoot + '/small/nested')} && head -c ${largeBytes} /dev/urandom > ${quote(remoteRoot + '/large/data.bin')} && head -c ${smallBytes} /dev/urandom > ${quote(remoteRoot + '/small/nested/data.bin')} && : > ${quote(remoteRoot + '/small/empty.txt')} && : > ${quote(remoteRoot + '/large/empty.txt')}`);
	largeHash = await hash('large/data.bin');
	smallHash = await hash('small/nested/data.bin');
	await check('single directory 3 GiB, unknown total, native same-host copy', () => transfer('single-current', current.service));
	await check('small batch content and completion, unknown total may report zero', () => transfer('batch-current', current.service, true, false, false));
	await check('cancel same-host directory copy stops destination growth and preserves source content', () => transfer('cancel-current', current.service, false, true));
	await check('cancel same-host native multi-item copy stops destination growth and preserves source content', () => transfer('cancel-batch-current', current.service, true, true, false, true));
	if (process.argv.includes('--benchmark')) {
		for (let round = 0; round < 3; round++) {
			const order = round % 2 ? [['current', current], ['head', head]] : [['head', head], ['current', current]];
			for (const [label, instance] of order) { await check(`benchmark ${label} round ${round + 1}`, () => transfer(`bench-${label}-${round}`, instance.service, false, false, label === 'current')); }
		}
		const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
		const times = label => results.filter(result => result.ok && result.name.startsWith(`benchmark ${label} `)).map(result => result.durationMs);
		if (times('head').length === 3 && times('current').length === 3) {
			const summary = { headMedianMs: median(times('head')), currentMedianMs: median(times('current')) };
			summary.currentOverHead = summary.currentMedianMs / summary.headMedianMs;
			await fs.writeFile(path.join(audit, 'benchmark.json'), JSON.stringify(summary, null, 2));
			console.log('BENCHMARK', JSON.stringify(summary));
		}
	}
} catch (error) {
	results.push({ name: 'fixture setup or execution', ok: false, error: error.stack });
	console.error(error.message);
} finally {
	if (createdRoot) {
		try { await removeOwned(remoteRoot); }
		catch (error) { results.push({ name: 'fixture cleanup', ok: false, remoteRoot, error: error.message }); console.error('Cleanup failed; owned fixture retained:', remoteRoot, error.message); }
	}
	await fs.writeFile(path.join(audit, 'results.json'), JSON.stringify(results, null, 2));
}
console.log('REPORT', audit, 'failed=', results.filter(result => !result.ok).length);
// The real service keeps reusable SSH sessions and delayed cleanup timers.
process.exit(results.some(result => !result.ok) ? 1 : 0);
