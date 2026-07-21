# Immediate Transfer Start and Move Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every recursive total-size discovery step from folder and multi-item transfer startup, preserve live transferred bytes/speed/time, and refresh both affected directories after every successful move.

**Architecture:** The renderer owns the selection-shape policy: exactly one ordinary file tracks a total; every other selection sends `expectedBytes: 0`. The main process starts the existing 1.148.0 data command without a preliminary walk or remote `du`, and reports real byte deltas from the existing copy/stream/growth mechanisms. Move refresh is centralized behind a small pure refresh plan and is invoked only after copy-then-delete cleanup or native move completion.

**Tech Stack:** TypeScript, VS Code workbench/editor code, Node.js filesystem/SSH transfer service, Mocha TDD tests, CSS.

## Global Constraints

- Exactly one ordinary file may display `transferred / total`; a folder or any multi-item selection displays transferred bytes only.
- Unknown-total transfers retain live speed and elapsed time.
- Drag-and-drop, Ctrl+C/V, Ctrl+X/V, same-machine, same-SSH, cross-SSH, upload, and download use the same immediate-start rule.
- Failed or canceled transfers never delete source items.
- Successful moves refresh source and target only after source cleanup or native rename/move has completed.
- Preserve the restored 1.148.0 transfer protocol order and data path; do not add staging, buffering, throttling, archive wrappers, or progress relays.
- Keep the copy/cut badge at 24 x 24 with a 24 x 18 inner label and retain all existing colors.
- Run `npm run compile-check-ts-native` before every unit-test command; never run `npm run compile`.
- The worktree already contains user-owned changes in the files below. Do not discard them, and do not stage or commit implementation files automatically.

---

### Task 1: Lock the single-file total policy and remove renderer size jobs

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Verify: `src/vs/workbench/contrib/turbofile/common/turbofileTransferDisplay.ts`

**Interfaces:**
- Consumes: `createTurboFileTransferSizePolicy(items)` and `resolveTurboFileVisibleTotalBytes(options)`.
- Produces: `task.trackTotalBytes`, `task.totalBytes`, and batch request totals that are known only for one regular file.

- [x] **Step 1: Add failing unit coverage for selection-shape totals**

Update the import and add these tests:

```ts
import { chooseDisplayTransferSpeed, createTurboFileTransferSizePolicy, getVisibleTransferStartedAt, resolveTurboFileVisibleTotalBytes, shouldStartTransferTiming } from '../../common/turbofileTransferDisplay.js';

test('tracks a total only for exactly one ordinary file', () => {
	assert.deepStrictEqual(createTurboFileTransferSizePolicy([{ directory: false, rawSize: 4096 }]), {
		trackTotalBytes: true,
		totalBytes: 4096
	});
	assert.deepStrictEqual(createTurboFileTransferSizePolicy([{ directory: true, rawSize: 0 }]), { trackTotalBytes: false });
	assert.deepStrictEqual(createTurboFileTransferSizePolicy([
		{ directory: false, rawSize: 10 },
		{ directory: false, rawSize: 20 }
	]), { trackTotalBytes: false });
});

test('never exposes a protocol-reported total for an unknown-total selection', () => {
	assert.strictEqual(resolveTurboFileVisibleTotalBytes({
		trackTotalBytes: false,
		listedTotalBytes: 0,
		reportedTotalBytes: 8192
	}), undefined);
});
```

- [x] **Step 2: Add a failing renderer regression assertion**

Extend `TurboFileDragDrop` with:

```ts
test('starts folder and multi-item transfers without renderer size discovery', () => {
	const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
	const batchStart = editor.indexOf('private async transferItemsBatch');
	const batchEnd = editor.indexOf('private insertOptimisticPaneItem', batchStart);
	const batch = editor.slice(batchStart, batchEnd);

	assert.ok(batchStart >= 0);
	assert.ok(!batch.includes('fillBatchDirectorySizesInBackground'));
	assert.ok(!batch.includes('calculatePathSize'));
	assert.ok(batch.includes('task.trackTotalBytes ? Math.max(0, item.rawSize) : 0'));
});
```

- [x] **Step 3: Type-check, emit test JavaScript, and verify RED**

Run:

```powershell
npm run compile-check-ts-native
npm run gulp compile-client
scripts\test.bat --grep "TurboFileTransferDisplay|TurboFileDragDrop"
```

Expected: type-check succeeds; tests fail because the renderer still starts `fillBatchDirectorySizesInBackground` and batch items still expose known file totals for multi-item operations.

- [x] **Step 4: Apply the selection policy when transfer tasks are primed**

Import `createTurboFileTransferSizePolicy` and extend `primeTransferTaskStrategy` before strategy selection:

```ts
const sizePolicy = createTurboFileTransferSizePolicy(sourceItems);
task.trackTotalBytes = sizePolicy.trackTotalBytes;
task.totalBytes = sizePolicy.totalBytes;
```

Call `primeTransferTaskStrategy` for the single internal clipboard path as well as the existing drag/copy paths. In both batch request builders, derive values from the task policy:

```ts
const expectedBytes = task.trackTotalBytes ? Math.max(0, task.totalBytes ?? 0) : 0;

expectedBytes: task.trackTotalBytes ? Math.max(0, item.rawSize) : 0
```

- [x] **Step 5: Remove background recursive total discovery**

Delete the call to `fillBatchDirectorySizesInBackground` and delete the entire helper. Do not replace it with a delayed or fire-and-forget scan.

- [x] **Step 6: Verify GREEN**

Run the three commands from Step 3 again.

Expected: all `TurboFileTransferDisplay` and `TurboFileDragDrop` tests pass.

---

### Task 2: Start local transfers without a first recursive traversal

**Files:**
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`

**Interfaces:**
- Consumes: `ITurboFileTransferRequest.sourceType`, `expectedBytes`, `copyLocalPath` byte deltas, and `fireTransferProgress`.
- Produces: immediate local command/copy dispatch with real transferred-byte events and unknown totals for directory/multi-item work.

- [x] **Step 1: Add failing static regression tests for local startup**

Add a small method extractor and test:

```ts
function methodBlock(source: string, name: string, nextName: string): string {
	const start = source.indexOf(name);
	return source.slice(start, source.indexOf(nextName, start));
}

test('starts local folder and batch copies without recursive size discovery', () => {
	const service = fs.readFileSync(servicePath(), 'utf8');
	const transferFile = methodBlock(service, 'async transferFile', 'async cancelTransfer');
	const localBatch = methodBlock(service, 'private async runLocalNativeBatchTransfer', 'private async runSameRemoteNativeBatchTransfer');

	assert.ok(!transferFile.includes('getLocalPathTransferSize(request.source.path'));
	assert.ok(!localBatch.includes('getLocalBatchTransferSize'));
	assert.ok(!service.includes('private async getLocalBatchTransferSize'));
	assert.ok(localBatch.includes('totalBytes > 0 ? Math.min(transferredBytes, totalBytes) : transferredBytes'));
});
```

- [x] **Step 2: Type-check, emit, and verify RED**

Run:

```powershell
npm run compile-check-ts-native
npm run gulp compile-client
scripts\test.bat --grep "TurboFileSshMainServiceStatic"
```

Expected: FAIL because `transferFile` and `runLocalNativeBatchTransfer` still await recursive size helpers.

- [x] **Step 3: Make single local transfer size resolution shallow**

Replace the recursive helper call with one shallow stat only when the request type is unavailable:

```ts
const sourceStat = request.sourceType ? undefined : await fsp.stat(request.source.path);
const sourceType = request.sourceType ?? (sourceStat?.isDirectory() ? 'directory' : 'file');
const totalBytes = sourceType === 'directory'
	? 0
	: Math.max(0, request.expectedBytes ?? sourceStat?.size ?? 0);
```

Report real deltas for unknown totals:

```ts
const progressBytes = totalBytes > 0 ? Math.min(transferredBytes, totalBytes) : transferredBytes;
this.fireTransferProgress(request, progressBytes, totalBytes, 'transfer', 'Copying locally.');
```

Complete with `bytes = Math.max(totalBytes, transferredBytes)` while leaving the progress event total at `totalBytes` rather than changing it to `bytes`.

- [x] **Step 4: Remove local batch pre-scan and preserve byte deltas**

Use the renderer-provided value directly:

```ts
const totalBytes = Math.max(0, expectedBytes);
```

In every local batch progress event use:

```ts
const progressBytes = totalBytes > 0 ? Math.min(transferredBytes, totalBytes) : transferredBytes;
```

Return the actual transferred result:

```ts
const resultBytes = operation === 'copy' ? transferredBytes : totalBytes;
```

Delete `getLocalBatchTransferSize` and delete `getLocalPathTransferSize` if it has no remaining callers. Retain explicit user-invoked size helpers used outside transfer startup.

- [x] **Step 5: Verify GREEN**

Run the commands from Step 2 again.

Expected: `TurboFileSshMainServiceStatic` passes.

---

### Task 3: Remove protocol startup totals without changing the data path

**Files:**
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Verify: `src/vs/platform/turbofile/test/common/turbofileTransfer148Baseline.test.ts`

**Interfaces:**
- Consumes: listing-provided `expectedBytes`, archive delta callbacks, rsync progress, and destination-growth callbacks that begin only after command setup.
- Produces: TAR/SCP/SFTP/same-remote strategies that never wait for a recursive source total before dispatch.

- [x] **Step 1: Add failing protocol-wide startup assertions**

Add:

```ts
test('does not discover directory totals before protocol dispatch', () => {
	const service = fs.readFileSync(servicePath(), 'utf8');
	const batchTar = methodBlock(service, 'private async tryBatchTarTransfer', 'private createRemoteBatchTarPlan');
	const sameRemote = methodBlock(service, 'private async trySameRemoteCopy', 'private async tryDirectTarTransfer');
	const directTar = methodBlock(service, 'private async tryDirectTarTransfer', 'private async tryDirectTarTransferRoute');
	const directScp = methodBlock(service, 'private async tryDirectScpTransfer', 'private async tryDirectScpTransferRoute');
	const directSftp = methodBlock(service, 'private async tryDirectSftpTransferRoute', 'private async tryTunneledRsyncRelayTransfer');
	const tarRelay = methodBlock(service, 'private async tryTarRelayTransfer', 'private async tryStreamRelayTransfer');

	assert.ok(!batchTar.includes('getLocalBatchTarBytes'));
	assert.ok(!batchTar.includes('getRemoteBatchSourceContentSize'));
	assert.ok(!sameRemote.includes("sourceType === 'directory') {\n\t\t\tbytes ="));
	assert.ok(!directTar.includes('getRemotePathContentSizeByCommand(request.source)'));
	assert.ok(!directScp.includes('|| await this.getRemotePathSizeByCommand(request.source)'));
	assert.ok(!directSftp.includes('if (bytes === 0)'));
	assert.ok(!tarRelay.includes('getRemotePathContentSizeByCommand(request.source)'));
});
```

- [x] **Step 2: Type-check, emit, and verify RED**

Run:

```powershell
npm run compile-check-ts-native
npm run gulp compile-client
scripts\test.bat --grep "TurboFileSshMainServiceStatic|TurboFileTransfer148Baseline"
```

Expected: FAIL on the new startup assertions; the 1.148.0 baseline tests remain green.

- [x] **Step 3: Remove TAR batch size promises and pre-dispatch source scans**

For local TAR upload/download, remove `sizePromise`, `getLocalBatchTarBytes`, and all awaits of that promise. Use the already-counted archive bytes at completion:

```ts
const resultBytes = Math.max(bytes, archiveBytes);
```

For SSH-to-SSH batch TAR, pass `Math.max(0, expectedBytes)` directly into direct/relay strategies. In direct and relay route callbacks retain a `transferredBytes` variable updated by destination-growth events and return `Math.max(expectedBytes, transferredBytes)` without a final target-total scan solely for progress reporting.

- [x] **Step 4: Make single-directory protocol branches type-aware**

In same-remote copy, direct SCP, direct SFTP, direct TAR, TAR relay, SCP relay, and SFTP relay:

```ts
let bytes = Math.max(0, request.expectedBytes ?? 0);
if (sourceType === 'file' && bytes <= 0) {
	bytes = await this.getRemotePathSizeByCommand(request.source).catch(() => 0);
}
```

Directory branches keep `bytes === 0` and proceed. Remove guards that reject a directory strategy solely because `bytes <= 0`. Keep connection setup, target-parent creation, cancellation, command exit handling, and known-file size verification unchanged.

Capture existing post-start stream or destination-growth callbacks into `transferredBytes` and use that value in the result for an unknown-total directory. Do not add a new stream transform, relay, wrapper, or polling loop.

- [x] **Step 5: Verify GREEN and restored baseline**

Run the commands from Step 2 again.

Expected: all selected tests pass, including both 1.148.0 baseline assertions.

---

### Task 4: Enforce delete-before-refresh for every successful move

**Files:**
- Restore/modify: `src/vs/workbench/contrib/turbofile/common/turbofileTransferRefresh.ts`
- Restore/modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileTransferRefresh.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`

**Interfaces:**
- Produces: `createTurboFilePostTransferRefreshPlan(operation, sourceSide, targetSide)` returning deduplicated pane sides.
- Consumes: `refreshPane(side, { force: true })`, `deleteInternalClipboardSources`, batch result status, and native move completion.

- [x] **Step 1: Restore the pure refresh plan and add behavior tests**

Use this focused helper:

```ts
export type TurboFilePaneSide = 'left' | 'right';

export function createTurboFilePostTransferRefreshPlan(
	operation: 'copy' | 'move',
	sourceSide: TurboFilePaneSide,
	targetSide: TurboFilePaneSide
): readonly TurboFilePaneSide[] {
	if (operation === 'copy') {
		return [targetSide];
	}
	return sourceSide === targetSide ? [targetSide] : [sourceSide, targetSide];
}
```

Test copy, cross-pane move, and same-pane deduplication with `assert.deepStrictEqual`.

- [x] **Step 2: Add a failing ordering regression test**

Extend `TurboFileDragDrop`:

```ts
test('deletes cut sources before refreshing source and target panes', () => {
	const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
	const start = editor.indexOf('private async pasteInternalTransferClipboard');
	const block = editor.slice(start, editor.indexOf('private isSameTransferTarget', start));
	const deleteIndex = block.indexOf('await this.deleteInternalClipboardSources');
	const refreshIndex = block.lastIndexOf('await this.refreshTransferPanes');

	assert.ok(deleteIndex >= 0);
	assert.ok(refreshIndex > deleteIndex);
});
```

- [x] **Step 3: Type-check, emit, and verify RED**

Run:

```powershell
npm run compile-check-ts-native
npm run gulp compile-client
scripts\test.bat --grep "TurboFileTransferRefresh|TurboFileDragDrop"
```

Expected: FAIL because the current clipboard fallback refreshes before deleting source items and has no centralized helper.

- [x] **Step 4: Centralize pane refresh and correct ordering**

Add:

```ts
private async refreshTransferPanes(operation: 'copy' | 'move', sourceSide: 'left' | 'right', targetSide: 'left' | 'right'): Promise<void> {
	const sides = createTurboFilePostTransferRefreshPlan(operation, sourceSide, targetSide);
	await Promise.all(sides.map(side => this.refreshPane(side, { force: true })));
}
```

Remove the refresh from `deleteInternalClipboardSources`. In `pasteInternalTransferClipboard`, perform successful copy, then source cleanup for move, then `refreshTransferPanes`. If transfer or cleanup fails, do not report success; refresh the target for a possible partial copy and refresh the source after a cleanup failure.

Replace scattered successful batch/native cross-pane refresh blocks with `refreshTransferPanes`. Keep same-pane folder moves using their existing source/target directory-path invalidation because both paths can belong to one pane.

For external Windows moves, wait for native move/copy-then-delete completion, then refresh the target pane and every visible local pane matching a source parent. Ensure batch external move calls this only after `transferItemsBatch` returns success.

- [x] **Step 5: Verify GREEN**

Run the commands from Step 3 again.

Expected: all refresh and drag/drop tests pass.

---

### Task 5: Increase and lighten the copy/cut label

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/media/turbofile.css`

**Interfaces:**
- Consumes: `.turbofile-drag-operation-icon`.
- Produces: a 10 px, weight-400 label with unchanged geometry and colors.

- [x] **Step 1: Add a failing CSS regression assertion**

Add to the existing mode-button test object:

```ts
largerThinLabel: /\.turbofile-drag-operation-icon\s*\{[\s\S]*font-size:\s*10px;[\s\S]*font-weight:\s*400;/.test(css)
```

Expect `largerThinLabel: true`.

- [x] **Step 2: Type-check, emit, and verify RED**

Run:

```powershell
npm run compile-check-ts-native
npm run gulp compile-client
scripts\test.bat --grep "TurboFileDragDrop"
```

Expected: FAIL because current values are `9px` and `600`.

- [x] **Step 3: Change only typography**

```css
.turbofile-drag-operation-icon {
	font-size: 10px;
	font-weight: 400;
}
```

Leave width, height, border, color selectors, hover, active, focus, and focus-visible rules unchanged.

- [x] **Step 4: Verify GREEN**

Run the commands from Step 2 again.

Expected: `TurboFileDragDrop` passes.

---

### Task 6: Full validation and dirty-worktree audit

**Files:**
- Verify all modified files above.
- Verify: `src/vs/platform/turbofile/test/common/turbofileTransferPlan.test.ts`
- Verify: `src/vs/platform/turbofile/test/common/turbofileRemoteNativeBatchPlan.test.ts`
- Verify: `src/vs/workbench/contrib/turbofile/test/common/turbofileEditorInput.test.ts`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: type, unit, baseline, and diff evidence ready for user testing.

- [x] **Step 1: Run mandatory type and layer validation**

```powershell
npm run compile-check-ts-native
npm run valid-layers-check
```

Expected: both exit code 0.

- [x] **Step 2: Emit current sources and run the complete TurboFile suite**

```powershell
npm run gulp compile-client
scripts\test.bat --grep TurboFile
```

Expected: zero failures, including `TurboFileTransfer148Baseline`, `TurboFileSshMainServiceStatic`, `TurboFileTransferDisplay`, `TurboFileTransferRefresh`, and `TurboFileDragDrop`.

- [x] **Step 3: Audit prohibited regressions and whitespace**

```powershell
git diff --check
rg -n "fillBatchDirectorySizesInBackground|getLocalBatchTransferSize|buildTarProgressPipeCommand|TURBOFILE_TAR_PROGRESS_MARKER|createTarStreamWatchdog|waitForTarDrain|\.partial|dd bs=" src/vs/platform/turbofile src/vs/workbench/contrib/turbofile
```

Expected: no size-startup helpers and no post-1.148 TAR relay/staging/watchdog markers. Existing unrelated `.partial` or `dd bs=` hits outside transfer code must be reviewed rather than deleted blindly.

- [x] **Step 4: Review the final scoped diff without committing user-owned work**

```powershell
git diff -- src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts src/vs/workbench/contrib/turbofile/browser/media/turbofile.css src/vs/workbench/contrib/turbofile/common/turbofileTransferDisplay.ts src/vs/workbench/contrib/turbofile/common/turbofileTransferRefresh.ts src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts src/vs/workbench/contrib/turbofile/test/common/turbofileTransferRefresh.test.ts src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts
```

Expected: only the approved startup, progress, refresh, and typography behavior plus already-present user changes. Leave implementation uncommitted and do not package unless the user separately requests it.
