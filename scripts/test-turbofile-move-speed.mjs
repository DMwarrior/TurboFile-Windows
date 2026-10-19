/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run compile-check-ts-native first. Explicit opt-in: --network [--ssh th_60] [--mib 512].
// Uses unique, owned directories on two filesystems. Never uses device 62 or business files.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { build } from '../build/node_modules/esbuild/lib/main.js';

if (!process.argv.includes('--network')) {
	console.log('SKIP: --network is required. Run compile-check-ts-native before this validation.');
	process.exit(0);
}
const argument = (name, fallback) => {
	const index = process.argv.indexOf(name);
	const value = index < 0 ? fallback : process.argv[index + 1];
	assert.ok(value && !value.startsWith('-'), `${name} requires a value`);
	return value;
};
const alias = argument('--ssh', 'th_60');
const bytes = Number(argument('--mib', '512')) * 1024 ** 2;
assert.ok(Number.isSafeInteger(bytes) && bytes >= 256 * 1024 ** 2 && bytes <= 1024 * 1024 ** 2, '--mib must be between 256 and 1024');
const repo = process.cwd();
const runId = `turbofile-move-speed-${randomUUID()}`;
const audit = path.join(repo, '.build', runId);
const parents = { source: '/home/th/Project_ssd', target: '/tmp' };
const roots = Object.fromEntries(Object.entries(parents).map(([side, parent]) => [side, `${parent}/${runId}`]));
const exec = promisify(execFile);
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const ssh = async command => (await exec('ssh', ['-n', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', alias, command], { timeout: 90000, maxBuffer: 2 * 1024 * 1024 })).stdout;
const configuration = (await exec('ssh', ['-G', alias], { timeout: 10000 })).stdout.split(/\r?\n/);
const setting = name => configuration.find(line => line.startsWith(`${name} `))?.slice(name.length + 1);
assert.notEqual(setting('hostname'), '192.168.9.62', 'Server 62 must not be used.');
const connection = { host: setting('hostname'), port: Number(setting('port')), username: setting('user'), privateKeyPath: setting('identityfile') };
const location = (side, relative) => {
	assert.ok(relative && !relative.split('/').includes('..') && !relative.startsWith('/'));
	const resolved = path.posix.join(roots[side], relative);
	assert.ok(resolved.startsWith(`${roots[side]}/`));
	return resolved;
};
const endpoint = remotePath => ({ kind: 'ssh', connection, path: remotePath, preferredProtocol: 'auto-fast', supportsTar: true, supportsRsync: true });
await fs.mkdir(audit, { recursive: true });
const baseline = (await exec('git', ['rev-parse', 'HEAD'])).stdout.trim();
const sourceFile = 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts';
const sourceText = {
	current: await fs.readFile(path.join(repo, sourceFile), 'utf8'),
	head: (await exec('git', ['show', `${baseline}:${sourceFile}`], { maxBuffer: 4 * 1024 * 1024 })).stdout
};
async function loadService(label) {
	const outfile = path.join(audit, `${label}.mjs`);
	await build({ stdin: { contents: sourceText[label], loader: 'ts', resolveDir: path.dirname(path.join(repo, sourceFile)) }, outfile,
		bundle: true, platform: 'node', format: 'esm', packages: 'external', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
		plugins: [{ name: 'headless-electron', setup(builder) {
			builder.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'adapter' }));
			builder.onLoad({ filter: /.*/, namespace: 'adapter' }, () => ({ contents: `export const app={getPath:()=>${JSON.stringify(audit)},getAppPath:()=>${JSON.stringify(repo)}}; export const BrowserWindow={},clipboard={},nativeImage={},protocol={};` }));
		} }] });
	const { TurboFileSshMainService } = await import(pathToFileURL(outfile).href);
	TurboFileSshMainService.prototype.ensureTurboFileImageProtocolRegistered = () => {};
	TurboFileSshMainService.prototype.ensureWindowsDragCopyHookRegistered = async () => {};
	return new TurboFileSshMainService({ getItem: (_key, fallback) => fallback, setItem() {}, removeItem() {} });
}
const services = { current: await loadService('current'), head: await loadService('head') };
const results = [];
const created = new Set();
let serial = 0;
let abortRun = false;
let unsafeCleanup = false;
const saveResults = () => fs.writeFile(path.join(audit, 'results.json'), JSON.stringify({ baseline, bytes, roots, results }, null, 2));
const ownerCheck = side => `test ! -L ${quote(roots[side])} && test "$(realpath -- ${quote(roots[side])})" = ${quote(roots[side])} && test "$(cat ${quote(`${roots[side]}/.owner`)})" = ${quote(runId)}`;
async function removeOwned(side, target) {
	assert.ok(created.has(side) && /^turbofile-move-speed-[a-f0-9-]{36}$/.test(path.posix.basename(roots[side])));
	assert.equal(path.posix.dirname(roots[side]), parents[side]);
	assert.equal(path.posix.normalize(target), target);
	assert.ok(target === roots[side] || target.startsWith(`${roots[side]}/`));
	await ssh(`${ownerCheck(side)} && if [ -e ${quote(target)} ] || [ -L ${quote(target)} ]; then test ! -L ${quote(target)} && test "$(realpath -- ${quote(target)})" = ${quote(target)} && rm -rf -- ${quote(target)}; fi`);
}
const hash = async remotePath => (await ssh(`sha256sum -- ${quote(remotePath)}`)).trim().split(/\s/)[0];
async function check(name, run) {
	if (abortRun) { results.push({ name, ok: false, skipped: 'Earlier operation exceeded its watchdog.' }); await saveResults(); return; }
	try { const details = await run(); results.push({ name, ok: true, ...details }); console.log('PASS', name, JSON.stringify(details)); }
	catch (error) { results.push({ name, ok: false, error: error.stack }); console.error('FAIL', name, error.message); }
	await saveResults();
}
async function move(label, service, sourcePaths, target, batch, cancelDuring = false) {
	const progressId = `${runId}-${++serial}`;
	const began = performance.now();
	const events = [];
	let timer;
	let hardTimer;
	let timedOut = false;
	let cancellation;
	let canceledAt;
	let cancelTrigger;
	let rejectWatchdog;
	const requestCancel = trigger => {
		if (cancellation) { return; }
		canceledAt = performance.now() - began;
		cancelTrigger = trigger;
		cancellation = service.cancelTransfer(progressId);
		void cancellation.catch(() => {});
		hardTimer = setTimeout(() => {
			abortRun = true;
			unsafeCleanup = true;
			rejectWatchdog(new Error('Move did not settle within 10 seconds after cancellation. Owned fixtures are retained.'));
		}, 10000);
	};
	const watchdog = new Promise((_, reject) => {
		rejectWatchdog = reject;
		timer = setTimeout(() => {
			timedOut = true;
			abortRun = true;
			requestCancel('watchdog');
		}, 60000);
	});
	const subscription = service.onDynamicTransferProgress(progressId)(event => {
		events.push({ at: performance.now() - began, ...event });
		if (cancelDuring && event.phase === 'transfer' && event.transferredBytes > 0 && event.transferredBytes < bytes) { requestCancel('positive-incomplete-progress'); }
	});
	try {
		const operation = batch
			? service.movePathsIntoDirectory(sourcePaths.map(endpoint), target, { progressId })
			: service.renamePath(endpoint(sourcePaths[0]), target, { progressId });
		const result = await Promise.race([operation, watchdog]);
		await Promise.race([cancellation ?? Promise.resolve(), watchdog]);
		const durationMs = performance.now() - began;
		const data = { label, result, events, durationMs, canceledAt, cancelTrigger, cancellationMs: canceledAt === undefined ? undefined : durationMs - canceledAt };
		await fs.writeFile(path.join(audit, `${serial}-${label}.json`), JSON.stringify(data, null, 2));
		assert.equal(timedOut, false, 'Move exceeded the 60 second test watchdog.');
		if (cancelDuring) {
			assert.ok(cancellation, 'Move finished before a positive incomplete sample; live cancellation was not exercised.');
			assert.equal(result.canceled, true, result.message);
			assert.equal(result.ok, false);
			assert.equal(events.at(-1)?.state, 'canceled');
		} else { assert.equal(result.ok, true, result.message); }
		return data;
	} catch (error) {
		if (unsafeCleanup) { await fs.writeFile(path.join(audit, `${serial}-${label}-timeout.json`), JSON.stringify({ error: error.message, events, canceledAt, cancelTrigger, durationMs: performance.now() - began }, null, 2)); }
		throw error;
	} finally { clearTimeout(timer); clearTimeout(hardTimer); subscription.dispose(); }
}
try {
	const filesystems = {};
	for (const side of ['source', 'target']) {
		assert.equal((await ssh(`realpath -- ${quote(parents[side])}`)).trim(), parents[side], 'Parent must resolve exactly to its declared path.');
		const device = (await ssh(`stat -c %d -- ${quote(parents[side])}`)).trim();
		const df = (await ssh(`df -PTk -- ${quote(parents[side])}`)).trim();
		const fields = df.split(/\r?\n/).at(-1).trim().split(/\s+/);
		filesystems[side] = { device, type: fields[1], availableBytes: Number(fields[4]) * 1024, df };
		assert.ok(filesystems[side].availableBytes >= bytes + 1024 ** 3, 'Each filesystem needs the fixture size plus at least 1 GiB spare.');
	}
	assert.notEqual(filesystems.source.device, filesystems.target.device, 'Fixtures must be on different filesystems.');
	await fs.writeFile(path.join(audit, 'filesystems.json'), JSON.stringify(filesystems, null, 2));
	for (const side of ['source', 'target']) {
		await ssh(`test ! -e ${quote(roots[side])} && test ! -L ${quote(roots[side])} && mkdir -m 700 -- ${quote(roots[side])} && printf '%s' ${quote(runId)} > ${quote(`${roots[side]}/.owner`)}`);
		created.add(side);
	}
	for (const batch of [false, true]) {
		await check(batch ? 'cross-filesystem movePathsIntoDirectory provides byte and speed samples' : 'cross-filesystem renamePath provides byte and speed samples', async () => {
			const name = batch ? 'batch' : 'single';
			const source = location('source', name);
			const target = location('target', name);
			await ssh(`${ownerCheck('source')} && ${ownerCheck('target')} && mkdir -- ${quote(source)} ${quote(target)} && head -c ${bytes} /dev/urandom > ${quote(`${source}/data.bin`)} && printf owned > ${quote(`${source}/small.txt`)}`);
			const beforeHash = await hash(`${source}/data.bin`);
			await fs.writeFile(path.join(audit, `${name}-fixture.json`), JSON.stringify({ bytes, source, target, beforeHash }, null, 2));
			const data = await move(name, services.current, batch ? [`${source}/data.bin`, `${source}/small.txt`] : [`${source}/data.bin`], batch ? target : `${target}/data.bin`, batch);
			assert.equal(await hash(`${target}/data.bin`), beforeHash);
			await ssh(`test ! -e ${quote(`${source}/data.bin`)} && test ! -L ${quote(`${source}/data.bin`)}`);
			if (batch) { assert.equal((await ssh(`cat -- ${quote(`${target}/small.txt`)}`)).trim(), 'owned'); await ssh(`test ! -e ${quote(`${source}/small.txt`)}`); }
			const positive = data.events.filter(event => event.phase === 'transfer' && event.transferredBytes > 0 && event.transferredBytes < bytes);
			// Native move emits byte samples. The UI derives speed from their byte/time deltas.
			const speedSamples = data.events.flatMap((event, index) => {
				const previous = data.events[index - 1];
				const elapsedMs = event.at - (previous?.at ?? 0);
				const byteDelta = event.transferredBytes - (previous?.transferredBytes ?? 0);
				return positive.includes(event) && elapsedMs > 0 && byteDelta > 0 ? [{ at: event.at, bytesPerSecond: byteDelta / (elapsedMs / 1000) }] : [];
			});
			assert.ok(positive.length > 0, 'No positive byte sample arrived before the move finished.');
			assert.ok(speedSamples.length > 0, 'No positive speed sample arrived before the move finished.');
			assert.equal(data.events.at(-1)?.state, 'completed');
			assert.equal(data.events.at(-1)?.phase, 'complete');
			for (let index = 1; index < data.events.length; index++) { assert.ok(data.events[index].transferredBytes >= data.events[index - 1].transferredBytes, 'Move byte progress rewound.'); }
			await removeOwned('source', source);
			await removeOwned('target', target);
			return { durationMs: data.durationMs, fixtureBytes: bytes, positiveSamples: positive.length, derivedSpeedSamples: speedSamples,
				firstPositiveMs: positive[0].at, highestIntermediateBytes: Math.max(...positive.map(event => event.transferredBytes)),
				finalObservedBytes: data.events.at(-1)?.transferredBytes, finalTotalBytes: data.events.at(-1)?.totalBytes,
				byteAccounting: 'Observed /proc bytes only; no directory scan or exact-final-size requirement.', hashVerified: true, sourceRemovedAfterSuccess: true };
		});
	}
	for (const batch of [false, true]) {
		await check(batch ? 'cancel cross-filesystem batch stops the writer and subsequent xargs batches' : 'cancel cross-filesystem rename preserves source and stops destination growth', async () => {
			const name = batch ? 'cancel-batch' : 'cancel-single';
			const sourceDirectory = location('source', name);
			const targetDirectory = location('target', name);
			const source = `${sourceDirectory}/data.bin`;
			const target = `${targetDirectory}/data.bin`;
			await ssh(`${ownerCheck('source')} && ${ownerCheck('target')} && mkdir -- ${quote(sourceDirectory)} ${quote(targetDirectory)} && head -c ${bytes} /dev/urandom > ${quote(source)}`);
			const sourcePaths = [source];
			if (batch) {
				// Big file first, then 129 small files: the last sentinel belongs to xargs' second batch.
				await ssh(`tf_directory=${quote(sourceDirectory)}; tf_index=0; while [ "$tf_index" -lt 129 ]; do printf sentinel > "$tf_directory/small-$tf_index.txt" || exit; tf_index=$((tf_index + 1)); done`);
				for (let index = 0; index < 129; index++) { sourcePaths.push(`${sourceDirectory}/small-${index}.txt`); }
			}
			const beforeHash = await hash(source);
			await fs.writeFile(path.join(audit, `${name}-fixture.json`), JSON.stringify({ bytes, source, target, beforeHash, entries: sourcePaths.length }, null, 2));
			const data = await move(name, services.current, sourcePaths, batch ? targetDirectory : target, batch, true);
			const targetSize = async () => (await ssh(`if [ -e ${quote(target)} ]; then test ! -L ${quote(target)} && stat -c %s -- ${quote(target)}; else printf missing; fi`)).trim();
			const sizeSamples = [{ at: performance.now(), size: await targetSize() }];
			await new Promise(resolve => setTimeout(resolve, 350));
			sizeSamples.push({ at: performance.now(), size: await targetSize() });
			await fs.writeFile(path.join(audit, `${name}-destination-observation.json`), JSON.stringify(sizeSamples, null, 2));
			if (sizeSamples[1].size !== sizeSamples[0].size) { abortRun = true; unsafeCleanup = true; }
			assert.equal(sizeSamples[1].size, sizeSamples[0].size, 'Destination kept growing after cancellation.');
			assert.equal(await hash(source), beforeHash, 'Cancel must retain the complete original source.');
			if (batch) {
				assert.equal((await ssh(`cat -- ${quote(`${sourceDirectory}/small-128.txt`)}`)).trim(), 'sentinel');
				await ssh(`test ! -e ${quote(`${targetDirectory}/small-128.txt`)} && test ! -L ${quote(`${targetDirectory}/small-128.txt`)}`);
			}
			await removeOwned('source', sourceDirectory);
			await removeOwned('target', targetDirectory);
			return { cancelTrigger: data.cancelTrigger, cancellationMs: data.cancellationMs, durationMs: data.durationMs,
				finalObservedBytes: data.events.at(-1)?.transferredBytes, sourceHashVerified: true, destinationSizeSamples: sizeSamples,
				...(batch ? { batchEntries: sourcePaths.length, secondBatchSentinelPreserved: true, secondBatchTargetUntouched: true } : {}) };
		});
	}
	await check('same-filesystem atomic rename has no fixed observer delay', async () => {
		const positions = { head: false, current: false };
		const samples = { head: [], current: [] };
		for (const label of ['head', 'current']) {
			await ssh(`${ownerCheck('source')} && printf rename-fixture > ${quote(location('source', `${label}-a.txt`))}`);
			await move(`${label}-warmup`, services[label], [location('source', `${label}-a.txt`)], location('source', `${label}-b.txt`), false);
			positions[label] = true;
		}
		for (let round = 0; round < 5; round++) {
			for (const label of round % 2 ? ['current', 'head'] : ['head', 'current']) {
				const from = location('source', `${label}-${positions[label] ? 'b' : 'a'}.txt`);
				const to = location('source', `${label}-${positions[label] ? 'a' : 'b'}.txt`);
				const data = await move(`${label}-round-${round + 1}`, services[label], [from], to, false);
				positions[label] = !positions[label];
				samples[label].push(data.durationMs);
			}
		}
		for (const label of ['head', 'current']) { assert.equal((await ssh(`cat -- ${quote(location('source', `${label}-${positions[label] ? 'b' : 'a'}.txt`))}`)).trim(), 'rename-fixture'); }
		const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
		const report = { baseline, samples, headMedianMs: median(samples.head), currentMedianMs: median(samples.current) };
		report.addedMedianMs = report.currentMedianMs - report.headMedianMs;
		await fs.writeFile(path.join(audit, 'rename-benchmark.json'), JSON.stringify(report, null, 2));
		assert.ok(report.addedMedianMs < 250, 'Current rename added at least 250 ms to the baseline median.');
		return report;
	});
} catch (error) { results.push({ name: 'fixture setup or execution', ok: false, error: error.stack }); console.error(error.message); }
finally {
	for (const side of created) {
		try {
			assert.equal(unsafeCleanup, false, 'A move might still be active; retain both owned roots for inspection.');
			await removeOwned(side, roots[side]);
			results.push({ name: `cleanup ${side}`, ok: true });
		} catch (error) { results.push({ name: `cleanup ${side}`, ok: false, root: roots[side], error: error.message }); console.error('Owned fixture retained:', roots[side], error.message); }
	}
	await saveResults();
}
console.log('REPORT', audit, 'failed=', results.filter(result => !result.ok).length);
process.exit(results.some(result => !result.ok) ? 1 : 0);
