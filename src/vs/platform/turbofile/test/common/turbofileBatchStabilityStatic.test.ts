/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function methodBlock(source: string, name: string, nextName: string): string {
	const start = source.indexOf(name);
	assert.ok(start >= 0, `missing ${name}`);
	const end = source.indexOf(nextName, start);
	assert.ok(end > start, `missing ${nextName}`);
	return source.slice(start, end);
}

suite('TurboFileBatchStabilityStatic', () => {
	const servicePath = () => path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');

	test('only recursively inspects known directories and unknown tar selections', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const plain = methodBlock(service, 'private async runParallelLocalBatchTarUpload', 'private async runParallelLocalBatchTarZstdUpload');
		const zstd = methodBlock(service, 'private async runParallelLocalBatchTarZstdUpload', 'private async runParallelLocalTarUpload');

		for (const block of [plain, zstd]) {
			assert.ok(block.includes('plan.fileNames && plan.directoryNames && plan.unknownNames'));
			assert.ok(block.includes('plan.unknownNames, plan.directoryNames, plan.fileNames'));
		}
		const collector = methodBlock(service, 'private async collectLocalTarRelativeEntries', 'private localTarListEncodingPromise');
		assert.ok(collector.includes('entries.push(...knownFileNames.map(normalizeTarListPath))'));
		assert.ok(collector.includes('const directoryQueue = knownDirectoryNames.map(normalizeTarListPath)'));
		assert.ok(collector.includes('mapLimit(unknownNames'));
		assert.ok(collector.includes('active < LOCAL_DIRECTORY_STAT_CONCURRENCY'));
		assert.ok(collector.includes('directoryQueue.push(...subDirectories)'));
		assert.ok(!collector.includes('mapLimit(subDirectories'));
		assert.ok(collector.includes('Cannot archive Unix socket'));
	});

	test('keeps the established high-throughput tar stream ceiling bounded', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		assert.ok(service.includes('const LOCAL_PARALLEL_TAR_CHUNK_COUNT = 12;'));
	});

	test('cleans full target paths through one null-delimited xargs process', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const prepare = methodBlock(service, 'private async prepareRemoteBatchTarTarget', 'private async runNativeLocalTarUploadChunk');
		const builder = methodBlock(service, 'function buildPrepareTarExtractToDirectoryFromListCommand', 'function buildTarSourcePushCommand');

		assert.ok(prepare.includes('targetNames.map(name => joinRemotePath(targetDirectory, name))'));
		assert.ok(builder.includes('LC_ALL=C xargs -0 -r rm -rf --'));
		assert.ok(!builder.includes('while IFS= read'));
	});

	test('aggregates fallback progress incrementally without forced per-item IPC', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const concurrent = methodBlock(service, 'private async runConcurrentBatchTransfer', 'private fireBatchAggregateProgress');
		const aggregate = methodBlock(service, 'private fireBatchAggregateProgress', 'private async deleteBatchSources');

		assert.ok(concurrent.includes('let aggregateTransferredBytes'));
		assert.ok(concurrent.includes('let aggregateTotalBytes'));
		assert.ok(!aggregate.includes('.reduce('));
		assert.ok(!concurrent.includes("'Batch transfer in progress.', completedItems, items.length, item.displayName ?? item.targetName, true"));
	});

	test('never removes move sources after a partially successful batch', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const concurrent = methodBlock(service, 'private async runConcurrentBatchTransfer', 'private fireBatchAggregateProgress');

		assert.ok(concurrent.includes("operation === 'move' && failures.length === 0 && successfulItems.length === items.length"));
		assert.ok(!concurrent.includes("operation === 'move' && successfulItems.length"));
	});

	test('streams explicit rsync source lists instead of appending paths to commands', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const local = methodBlock(service, 'private async tryLocalBatchRsyncTransfer', 'private async tryDirectBatchRsyncTransfer');
		const direct = methodBlock(service, 'private async tryDirectBatchRsyncTransferRoute', 'private async tryTunneledBatchRsyncRelayTransfer');
		const relay = methodBlock(service, 'private async tryTunneledBatchRsyncRelayTransfer', 'private async tryBatchTarTransfer');

		for (const transfer of [local, direct, relay]) {
			assert.ok(transfer.includes("'--files-from=-'"));
			assert.ok(transfer.includes("'--from0'"));
			assert.ok(transfer.includes('input:'));
		}
		assert.ok(!local.includes('const sourceArgs = items.map'));
		assert.ok(!direct.includes('const sourceArgs = items.map'));
		assert.ok(!relay.includes('const sourceArgs = items.map'));
	});

	test('limits reverse rsync workers and streams cleanup paths', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const single = methodBlock(service, 'async tryLocalToSshReverseParallelRsyncUpload', 'private async createLocalWindowsReverseRsyncItems');
		const batch = methodBlock(service, 'async tryLocalToSshReverseParallelRsyncBatchUpload', 'private async resolveLocalWindowsRsyncSourceConnection');
		const builder = methodBlock(service, 'function buildLocalWindowsReverseParallelRsyncCommand', 'function buildLocalWindowsReverseParallelRsyncInput');
		const input = methodBlock(service, 'function buildLocalWindowsReverseParallelRsyncInput', 'function getLocalWindowsRsyncConfigPaths');

		for (const transfer of [single, batch]) {
			assert.ok(transfer.includes('input,'));
		}
		assert.ok(builder.includes('TURBOFILE_REVERSE_RSYNC_WORKERS'));
		assert.ok(builder.includes("read -r -d \\'\\'"));
		assert.ok(builder.includes('--files-from='));
		assert.ok(input.includes('createTurboFileRsyncMappedGroups'));
		assert.ok(input.includes("records.push('C'"));
		assert.ok(input.includes('String(items.length + groupIndex)'));
	});

	test('keeps reverse rsync progress aggregation constant-time and preserves renamed targets', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const progress = methodBlock(service, 'private createParallelRsyncProgressReporter', 'private beginTransferGrowthTiming');
		const builder = methodBlock(service, 'function buildLocalWindowsReverseParallelRsyncCommand', 'function buildLocalWindowsReverseParallelRsyncInput');

		assert.ok(progress.includes('aggregateTransferredBytes += nextBytes - previousBytes'));
		assert.ok(progress.includes('aggregateSpeedBytesPerSecond += snapshot.speedBytesPerSecond - previousSpeed'));
		assert.ok(!progress.includes('Array.from(transferredByIndex.values()).reduce'));
		assert.ok(!progress.includes('Array.from(speedByIndex.values()).reduce'));
		assert.ok(builder.includes('staging_path=$(mktemp -d'));
		assert.ok(builder.includes('mv -n -- "$staged_source" "$target_path"'));
		assert.ok(builder.includes('then status=74'));
	});

	test('allows long rsync startup scans without changing transfer stream settings', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const direct = methodBlock(service, 'private async tryDirectBatchRsyncTransferRoute', 'private async tryTunneledBatchRsyncRelayTransfer');
		const relay = methodBlock(service, 'private async tryTunneledBatchRsyncRelayTransfer', 'private async tryBatchTarTransfer');

		assert.ok(service.includes('const DIRECT_RSYNC_STALL_TIMEOUT_MS = 10 * 60 * 1000;'));
		for (const transfer of [direct, relay]) {
			assert.ok(transfer.includes('inactivityTimeoutMs: DIRECT_RSYNC_STALL_TIMEOUT_MS'));
			assert.ok(transfer.includes('progressId: request.progressId'));
		}
	});

	test('does not serially stat known reverse rsync batch item types', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const batch = methodBlock(service, 'async tryLocalToSshReverseParallelRsyncBatchUpload', 'private async resolveLocalWindowsRsyncSourceConnection');

		assert.ok(batch.includes('item.sourceType'));
		assert.ok(batch.includes('mapLimit('));
		assert.ok(!batch.includes('for (const item of batchItems) {\n\t\t\t\tconst stat = await fsp.stat'));
	});

	test('keeps symlinks in reverse rsync splits and falls back for special entries', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const reader = methodBlock(service, 'private async readLocalRsyncSplitEntries', 'async tryLocalToSshReverseParallelRsyncBatchUpload');

		assert.ok(reader.includes('entry.isSymbolicLink()'));
		assert.ok(reader.includes('return [];'));
		assert.ok(!reader.includes('.filter(entry => entry.isDirectory() || entry.isFile())'));
	});

	test('does not force a progress IPC after every local copied item', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const local = methodBlock(service, 'private async runLocalNativeBatchTransfer', 'private async runSameRemoteNativeBatchTransfer');

		assert.ok(local.includes('index === 0'));
		assert.ok(!local.includes("'Copying locally.', true, {\n\t\t\t\t\tcompletedItems: index + 1"));
	});

	test('streams large local POSIX move selections through stdin', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const local = methodBlock(service, 'private async runLocalNativeBatchTransfer', 'private async runSameRemoteNativeBatchTransfer');

		assert.ok(local.includes('createPosixNativeBatchTransferPlan'));
		assert.ok(local.includes('input: plan.input'));
		assert.ok(!local.includes("runLocalCommand('mv', ['-f', ...sources"));
	});
});
