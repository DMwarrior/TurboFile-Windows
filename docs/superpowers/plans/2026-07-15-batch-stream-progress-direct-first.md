# Batch Stream Progress and Direct-First Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start tar-based directory and multi-item transfers without recursive size scans, show streamed bytes/speed/elapsed time, and always try SSH-to-SSH direct routes before relay.

**Architecture:** Make unknown-total behavior authoritative in both the renderer and main process. Count tar archive bytes at the stream boundary; for remote direct pipelines, insert a lightweight `dd` counter whose marked stderr is parsed without walking either filesystem. Keep transfer-plan protocol selection intact and change route cooldowns from exclusion to ordering.

**Tech Stack:** TypeScript, Electron main process, Node.js streams, SSH2, GNU/BusyBox shell tools, VS Code Mocha unit tests.

## Global Constraints

- A single regular file keeps the existing SCP expected-size behavior.
- Any directory tar transfer or multi-item transfer starts with an unknown total.
- Unknown-total UI shows transferred bytes, current speed, and elapsed time; it does not show total, percentage-derived ETA, or a partial denominator.
- Failed or canceled move operations must never delete source items.
- Automatic SSH-to-SSH transfers try direct routes before relay; explicit relay hints remain respected.
- Preserve unrelated dirty-worktree changes and do not edit generated `out/` files manually.

---

### Task 1: Unknown-Total Batch Policy

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts:9372-9420, 9678-9780`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts:2530-2565, 3680-3762`
- Test: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts`

**Interfaces:**
- Consumes: existing `ITurboFileBatchTransferRequest` and `ITurboFileTransferProgressEvent`.
- Produces: batch requests whose request-level and item-level `expectedBytes` are `0`, plus aggregate progress events whose `totalBytes` remain `0` while running.

- [ ] **Step 1: Write failing static and display-policy tests**

Add assertions that both renderer batch request blocks set `expectedBytes: 0`, that `fillBatchDirectorySizesInBackground` is absent, and that `getBatchExpectedBytes` returns zero for more than one item. Retain the existing unknown-total formatting behavior by asserting the renderer contains the transferred-only branch.

- [ ] **Step 2: Run the targeted tests and verify RED**

Run after compiling the unchanged baseline output needed by the test runner:

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileSshMainServiceStatic|TurboFileTransferDisplay"
```

Expected: compilation succeeds; new assertions fail because batch expected sizes and the background directory scan still exist.

- [ ] **Step 3: Implement the renderer policy**

In both `transferItemsToWindows` batch handling and `transferItemsBatch`:

```ts
task.totalBytes = 0;
// ...
items: items.map(item => ({
	sourcePath: item.path!,
	targetName: item.name,
	displayName: item.name,
	sourceType: item.type,
	expectedBytes: 0
})),
expectedBytes: 0,
```

Remove `fillBatchDirectorySizesInBackground` and its call completely.

- [ ] **Step 4: Make the main process authoritative**

Change `getBatchExpectedBytes` and aggregate reporting so multi-item batches cannot regain a denominator from child transfers:

```ts
private getBatchExpectedBytes(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[]): number {
	if (items.length > 1 || items.some(item => item.sourceType === 'directory')) {
		return 0;
	}
	const explicit = Math.max(0, request.expectedBytes ?? 0);
	return explicit > 0 ? explicit : Math.max(0, items[0]?.expectedBytes ?? 0);
}
```

When the policy returns zero, `fireBatchAggregateProgress` must publish `totalBytes = 0` even if child SCP/SFTP transfers discover their individual totals.

- [ ] **Step 5: Compile and run targeted tests for GREEN**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileSshMainServiceStatic|TurboFileTransferDisplay"
```

Expected: exit code 0 and all matching tests pass.

### Task 2: Streamed Tar Progress Without Tree Scans

**Files:**
- Create: `src/vs/platform/turbofile/common/turbofileTarProgress.ts`
- Create: `src/vs/platform/turbofile/test/common/turbofileTarProgress.test.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts:1484-1610, 3267-3670, 4828-4935, 5544-5605, 9758-9785`
- Test: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`

**Interfaces:**
- Produces: `TURBOFILE_TAR_PROGRESS_MARKER: string` and `consumeTarProgressStderr(remainder: string, chunk: string): { remainder: string; transferredBytes?: number }`.
- Consumes: existing `createProgressPassThrough`, `fireTransferProgress`, and `execRemote` stderr callbacks.

- [ ] **Step 1: Write parser and no-scan failing tests**

Test split chunks, carriage-return records, unrelated stderr, and monotonically usable byte values such as:

```ts
const first = consumeTarProgressStderr('', '__TURBOFILE_TAR_BYTES__1048');
const second = consumeTarProgressStderr(first.remainder, '576 bytes copied\r');
assert.deepStrictEqual(second, { remainder: '', transferredBytes: 1048576 });
```

Add static assertions that tar methods do not invoke `getRemotePathContentSizeByCommand`, `getRemoteBatchSourceContentSize`, `beginRemotePathGrowthTiming`, or `beginRemoteBatchTargetGrowthTiming`, and that relay pipelines contain `createProgressPassThrough`.

- [ ] **Step 2: Compile and verify RED**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileTarProgress|TurboFileSshMainServiceStatic"
```

Expected: the new parser import/function is missing or the no-scan assertions fail.

- [ ] **Step 3: Implement the marked stderr parser**

Implement a pure parser that buffers an incomplete final line, splits on `\r` or `\n`, accepts only lines beginning with `TURBOFILE_TAR_PROGRESS_MARKER`, and returns the largest `([0-9]+) bytes` value in the completed lines.

- [ ] **Step 4: Remove tar size scans and count existing streams**

For local upload/download and batch upload/download, keep `archiveBytes += delta`, always publish `totalBytes = 0`, and use `archiveBytes` as `result.bytes`. Remove all `sizePromise` and post-transfer logical-size fallbacks used only for display.

For single and batch SSH relay tar pipelines:

```ts
let archiveBytes = 0;
const onArchiveDelta = (delta: number): void => {
	archiveBytes += Math.max(0, delta);
	this.fireTransferProgress(request, archiveBytes, 0, 'relay-upload', 'Tar relay transfer in progress.', false, metadata);
};
await pipeline(
	sourceStream.stream as unknown as NodeJS.ReadableStream,
	createProgressPassThrough(onArchiveDelta),
	targetStream.stream as unknown as NodeJS.WritableStream
);
```

- [ ] **Step 5: Add direct-pipeline byte reporting**

Insert a `dd bs=4M` filter into direct tar source-push and target-pull pipelines. Run it under `bash -o pipefail`, periodically signal it with `USR1`, and prefix its stderr records with `TURBOFILE_TAR_PROGRESS_MARKER`. In `tryDirectTarTransferRoute` and `tryDirectBatchTarTransferRoute`, feed `onStderr` into `consumeTarProgressStderr`, publish parsed bytes with total zero, and remove recursive target growth probes and completion scans.

- [ ] **Step 6: Compile and run targeted tests for GREEN**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileTarProgress|TurboFileSshMainServiceStatic"
```

Expected: exit code 0 and all matching tests pass.

### Task 3: Direct Routes Always Precede Relay

**Files:**
- Modify: `src/vs/platform/turbofile/common/turbofileTransferPlan.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts:5048-5105`
- Test: `src/vs/platform/turbofile/test/common/turbofileTransferPlan.test.ts`

**Interfaces:**
- Produces: `TurboFileDirectSshRoute` and `prioritizeDirectSshRoutes(routes, isCoolingDown)`.
- Consumes: route cache entries and cooldown timestamps from the main service.

- [ ] **Step 1: Write failing route-priority tests**

Test that active routes remain first, cooling routes move to the end, both cooling routes are still returned, ordering is stable, and automatic SSH-to-SSH plans remain `[direct, relay]`.

- [ ] **Step 2: Compile and verify RED**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileTransferPlan"
```

Expected: the new exported route prioritizer does not exist.

- [ ] **Step 3: Implement stable direct-route prioritization**

Export the direction type and a stable partition helper from `turbofileTransferPlan.ts`. In `resolveDirectSshRoutes`, merge a cached successful route with `['source-push', 'target-pull']`, deduplicate, and call the helper. Do not filter cooling routes out.

- [ ] **Step 4: Compile and run route tests for GREEN**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileTransferPlan"
```

Expected: exit code 0 and all matching tests pass.

### Task 4: Full Verification

**Files:**
- Verify all files changed in Tasks 1-3.

**Interfaces:**
- Consumes: completed implementation.
- Produces: verification evidence only.

- [ ] **Step 1: Check the diff for accidental generated or unrelated edits**

```powershell
git diff --check
git status --short
git diff -- src/vs/platform/turbofile/common/turbofileTransferPlan.ts src/vs/platform/turbofile/common/turbofileTarProgress.ts src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts src/vs/platform/turbofile/test/common/turbofileTransferPlan.test.ts src/vs/platform/turbofile/test/common/turbofileTarProgress.test.ts src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts
```

Expected: no whitespace errors and only intended source/test changes in the scoped diff.

- [ ] **Step 2: Run mandatory TypeScript compilation**

```powershell
npm run compile-check-ts-native
```

Expected: exit code 0.

- [ ] **Step 3: Run all relevant TurboFile tests**

```powershell
scripts\test.bat --grep "TurboFile(TarProgress|TransferPlan|SshMainServiceStatic|TransferDisplay|BatchTarPlan|SameDeviceMergeStatic)"
```

Expected: exit code 0 with zero failures.

- [ ] **Step 4: Review requirements against implementation**

Confirm single-file SCP tests still pass, no batch or directory tar path performs a recursive size scan for progress, streamed bytes drive speed, elapsed time remains visible for unknown totals, direct routes remain ahead of relay, and source cleanup still occurs only after successful tar completion.
