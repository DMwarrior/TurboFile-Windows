# TurboFile Transfer Reliability and Pane Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each pane's copy/cut control independent, make same-pane organization always move, remove the panel clipboard delay, show structured same-name conflicts, and prevent tar transfers from hanging or exposing partial targets.

**Architecture:** Keep TurboFile's existing high-throughput tar byte path intact and add small, testable state/control helpers around it. Renderer state owns pane modes and trusted clipboard state; the main process owns structured conflicts, transactional staging, bounded post-EOF drain, process-tree cleanup, and protocol fallback. No recursive size scan, content verification, archive-to-disk step, or extra network copy is introduced.

**Tech Stack:** TypeScript, VS Code workbench/Electron services, Node.js child processes and streams, Mocha/TDD, VS Code CSS theme variables.

## Global Constraints

- Work directly on `codex/image-stream-loading`; preserve unrelated dirty-worktree changes.
- New transfer pages default to `copy` independently for both `left` and `right` panes; state is not persisted.
- Same-pane drops into a folder or the parent entry always use `move`, regardless of the pane button.
- The pane button is a single icon-plus-label toggle: cyan `复制`, orange `剪切`, with no persistent selected background.
- Ctrl+X never deletes sources until every requested target has committed successfully; failure or cancellation never deletes sources.
- Tar's normal stdout-to-SSH-to-stdin stream, concurrency, buffer sizes, and archive bytes remain unchanged.
- Multi-item transfers do not perform recursive size scans and display transferred bytes, live speed, and elapsed time only.
- Existing target directories abort the complete batch before transfer; no merge, overwrite, skip, or auto-rename is added.
- Direct SSH-to-SSH remains direct-first and falls back only after a failed attempt.
- Run `npm run compile-check-ts-native` before any passing unit-test validation; never run `npm run compile`.
- Packaging is excluded from this implementation pass.

---

### Task 1: Independent Pane Modes and Forced Same-Pane Move

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/common/turbofileEditorInput.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/media/turbofile.css`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileEditorInput.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`

**Interfaces:**
- Produces: `getDragOperation(side: 'left' | 'right'): TurboFileDragOperation`
- Produces: `setDragOperation(side: 'left' | 'right', operation: TurboFileDragOperation): void`
- Produces: `toggleDragOperation(side: 'left' | 'right'): TurboFileDragOperation`
- Consumes: existing `moveSelectedItemsIntoDirectory(...)` for same-pane folder and parent-entry drops.

- [ ] **Step 1: Replace the page-level mode test with failing per-pane assertions**

```ts
test('keeps left and right drag operations independent on each transfer page', () => {
	const first = createInput(1);
	const second = createInput(2);

	assert.deepStrictEqual([
		first.getDragOperation('left'), first.getDragOperation('right'),
		second.getDragOperation('left'), second.getDragOperation('right')
	], ['copy', 'copy', 'copy', 'copy']);
	assert.strictEqual(first.toggleDragOperation('left'), 'move');
	assert.deepStrictEqual([
		first.getDragOperation('left'), first.getDragOperation('right'),
		second.getDragOperation('left')
	], ['move', 'copy', 'copy']);
});
```

- [ ] **Step 2: Add failing renderer-source assertions for side-aware buttons and forced same-pane move**

```ts
assert.deepStrictEqual({
	passesSideToButton: editor.includes('this.appendDragOperationButton(toolbar, side)'),
	readsSourcePaneMode: editor.includes('this.getCurrentDragOperation(sourceSide)'),
	forcesFolderMove: samePaneDrop.includes("'move'") && samePaneDrop.includes('moveSelectedItemsIntoDirectory'),
	buttonHasCopyLabel: editor.includes("localize('turbofile.dragMode.copy.label', '复制')"),
	buttonHasCutLabel: editor.includes("localize('turbofile.dragMode.move.label', '剪切')")
}, {
	passesSideToButton: true,
	readsSourcePaneMode: true,
	forcesFolderMove: true,
	buttonHasCopyLabel: true,
	buttonHasCutLabel: true
});
```

- [ ] **Step 3: Run the focused tests and confirm RED**

Run after compiling the already-existing source baseline with the project's test harness:

```powershell
scripts\test.bat --grep "TurboFileEditorInput|TurboFileDragDrop"
```

Expected: failure because `getDragOperation`, `toggleDragOperation`, and the renderer button are not side-aware.

- [ ] **Step 4: Implement the two-slot editor-input state**

```ts
private readonly dragOperations: Record<'left' | 'right', TurboFileDragOperation> = {
	left: 'copy',
	right: 'copy'
};

getDragOperation(side: 'left' | 'right'): TurboFileDragOperation {
	return this.dragOperations[side];
}

setDragOperation(side: 'left' | 'right', operation: TurboFileDragOperation): void {
	this.dragOperations[side] = operation;
}

toggleDragOperation(side: 'left' | 'right'): TurboFileDragOperation {
	return this.dragOperations[side] = getNextTurboFileDragOperation(this.dragOperations[side]);
}
```

- [ ] **Step 5: Thread `side` through drag snapshots and the toolbar**

```ts
private getCurrentDragOperation(side: 'left' | 'right'): TurboFileDragOperation {
	return this.currentInput?.getDragOperation(side) ?? 'copy';
}

private appendDragOperationButton(parent: HTMLElement, side: 'left' | 'right'): void {
	const operation = this.getCurrentDragOperation(side);
	const isMove = operation === 'move';
	const label = isMove
		? localize('turbofile.dragMode.move.label', '剪切')
		: localize('turbofile.dragMode.copy.label', '复制');
	// Build icon + span label and toggle only this side.
	this.currentInput?.toggleDragOperation(side);
}
```

For same-pane folder/parent drops, call `moveSelectedItemsIntoDirectory(...)` directly and do not pass the pane mode. Cross-pane and Windows-facing paths continue using the immutable operation stored at drag start.

- [ ] **Step 6: Style the compact state switch without selected highlighting**

```css
.turbofile-drag-operation-button {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	min-width: 50px;
	padding: 2px 7px;
	border: 1px solid color-mix(in srgb, currentColor 65%, transparent);
	border-radius: 4px;
	background: transparent;
}

.turbofile-drag-operation-button.is-copy { color: var(--vscode-charts-green); }
.turbofile-drag-operation-button.is-move { color: var(--vscode-charts-orange); }
.turbofile-drag-operation-button:active { background: transparent; }
```

Retain the existing standard toolbar hover rule and `:focus-visible` outline.

- [ ] **Step 7: Type-check, run focused tests, and commit only task files**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileEditorInput|TurboFileDragDrop"
git add src/vs/workbench/contrib/turbofile/common/turbofileEditorInput.ts src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts src/vs/workbench/contrib/turbofile/browser/media/turbofile.css src/vs/workbench/contrib/turbofile/test/common/turbofileEditorInput.test.ts src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts
git commit -m "feat: make transfer modes independent per pane"
```

Expected: type-check exits 0 and both suites pass.

---

### Task 2: Zero-Wait Trusted Internal Clipboard

**Files:**
- Create: `src/vs/workbench/contrib/turbofile/common/turbofileClipboardTrust.ts`
- Create: `src/vs/workbench/contrib/turbofile/test/common/turbofileClipboardTrust.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`

**Interfaces:**
- Produces: `TurboFileClipboardTrust = 'trusted' | 'confirmation-required'`
- Produces: `resolveTurboFileClipboardReadMode(internalId, trust): 'internal-fast-path' | 'windows-confirmation'`
- Consumes: existing `resolveTurboFilePasteSource(...)`, `pasteInternalTransferClipboard(...)`, and Windows clipboard `clipboardId`.

- [ ] **Step 1: Write failing pure-state tests**

```ts
test('uses internal fast path only while the snapshot is trusted', () => {
	assert.deepStrictEqual([
		resolveTurboFileClipboardReadMode('id-1', 'trusted'),
		resolveTurboFileClipboardReadMode('id-1', 'confirmation-required'),
		resolveTurboFileClipboardReadMode(undefined, 'trusted')
	], ['internal-fast-path', 'windows-confirmation', 'windows-confirmation']);
});
```

- [ ] **Step 2: Write failing renderer-source assertions**

```ts
assert.deepStrictEqual({
	fastPathBeforeWindowsRead: pasteBody.indexOf('pasteInternalTransferClipboard') < pasteBody.indexOf('readWindowsClipboardFiles'),
	doesNotAwaitClipboardWrite: !pasteBody.includes('await internal?.windowsClipboardWrite'),
	invalidatesOnBlur: editor.includes("addEventListener('blur'") || editor.includes('onDidChangeFocus'),
	usesStablePasteKey: editor.includes('getWindowsClipboardPasteKey')
}, {
	fastPathBeforeWindowsRead: true,
	doesNotAwaitClipboardWrite: true,
	invalidatesOnBlur: true,
	usesStablePasteKey: true
});
```

- [ ] **Step 3: Run focused tests and confirm RED**

```powershell
scripts\test.bat --grep "TurboFileClipboardTrust|TurboFileImageGridPane"
```

Expected: missing helper module or assertions fail because `pasteIntoPane` reads Windows first.

- [ ] **Step 4: Implement trust state and immediate paste dispatch**

```ts
export type TurboFileClipboardTrust = 'trusted' | 'confirmation-required';

export function resolveTurboFileClipboardReadMode(
	internalClipboardId: string | undefined,
	trust: TurboFileClipboardTrust
): 'internal-fast-path' | 'windows-confirmation' {
	return internalClipboardId && trust === 'trusted' ? 'internal-fast-path' : 'windows-confirmation';
}
```

Set trust to `trusted` synchronously in `copySelectedToInternalClipboard`. In `pasteIntoPane`, call `pasteInternalTransferClipboard` immediately when trusted; only the confirmation branch calls `readWindowsClipboardFiles`. Mark trust `confirmation-required` when the editor window blurs, hides, or is disposed/recreated. Keep Windows export asynchronous and keep the existing `clipboardId` comparison in the confirmation branch.

- [ ] **Step 5: Prevent duplicate keydown/paste dispatch**

Reuse `getWindowsClipboardPasteKey(...)` for both keyboard and DOM paste events. Record the last dispatched key and timestamp, suppressing only the duplicate event for the same target/path/operation; do not suppress later user paste commands.

- [ ] **Step 6: Type-check, test, and commit**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileClipboardTrust|TurboFileImageGridPane|TurboFileWindowsClipboard"
git add src/vs/workbench/contrib/turbofile/common/turbofileClipboardTrust.ts src/vs/workbench/contrib/turbofile/test/common/turbofileClipboardTrust.test.ts src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts
git commit -m "perf: use zero-wait panel clipboard transfers"
```

Expected: type-check exits 0; trusted panel paste never invokes a Windows clipboard read.

---

### Task 3: Structured Same-Name Directory Conflicts

**Files:**
- Modify: `src/vs/platform/turbofile/common/turbofile.ts`
- Create: `src/vs/platform/turbofile/common/turbofileTransferConflict.ts`
- Create: `src/vs/platform/turbofile/test/common/turbofileTransferConflict.test.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`

**Interfaces:**
- Produces: `ITurboFileTransferConflict { readonly kind: 'target-directory-exists'; readonly paths: readonly string[] }`
- Adds optional `conflict?: ITurboFileTransferConflict` to `ITurboFileTransferResult` and `ITurboFileBatchTransferResult`.
- Produces: `formatTurboFileConflictDetails(paths, limit = 8): string`.

- [ ] **Step 1: Write failing conflict-format tests**

```ts
test('formats conflict paths and truncates long lists', () => {
	assert.strictEqual(formatTurboFileConflictDetails(['A', 'B'], 8), 'A\nB');
	assert.strictEqual(formatTurboFileConflictDetails(['A', 'B', 'C'], 2), 'A\nB\n…以及另外 1 个同名文件夹');
});
```

- [ ] **Step 2: Add failing contract/static assertions**

Assert that preflight returns `kind: 'target-directory-exists'` with all paths and the renderer calls the dialog service with localized title `目标存在同名文件夹`, message `为避免覆盖或混合文件，本次批量传输未开始。`, details, and one `确定` button.

- [ ] **Step 3: Run focused tests and confirm RED**

```powershell
scripts\test.bat --grep "TurboFileTransferConflict|TurboFileSshMainServiceStatic"
```

Expected: helper/contract is absent and main-process preflight still throws only English text.

- [ ] **Step 4: Add structured conflict results at local and remote preflight boundaries**

```ts
export interface ITurboFileTransferConflict {
	readonly kind: 'target-directory-exists';
	readonly paths: readonly string[];
}
```

Collect all existing directory targets before starting a batch. Return a failed result with `completed: 0`, all items failed, and `conflict`; do not enter any transfer protocol. Preserve the status/task failure message for diagnostics.

- [ ] **Step 5: Show one localized informational dialog in the renderer**

```ts
await this.dialogService.info(
	localize('turbofile.conflict.title', '目标存在同名文件夹'),
	localize('turbofile.conflict.message', '为避免覆盖或混合文件，本次批量传输未开始。'),
	{ detail: formatTurboFileConflictDetails(result.conflict.paths) }
);
```

Trigger the dialog only for the structured conflict kind. Network, permission, and protocol failures keep their existing error handling.

- [ ] **Step 6: Type-check, test, and commit**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileTransferConflict|TurboFileSshMainServiceStatic|TurboFileDragDrop"
git add src/vs/platform/turbofile/common/turbofile.ts src/vs/platform/turbofile/common/turbofileTransferConflict.ts src/vs/platform/turbofile/test/common/turbofileTransferConflict.test.ts src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts
git commit -m "feat: report same-name transfer conflicts clearly"
```

Expected: type-check exits 0 and all conflict-focused tests pass.

---

### Task 4: Tar Lifecycle Supervisor and Process-Tree Cleanup

**Files:**
- Create: `src/vs/platform/turbofile/common/turbofileTarLifecycle.ts`
- Create: `src/vs/platform/turbofile/test/common/turbofileTarLifecycle.test.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`

**Interfaces:**
- Produces: `TurboFileTarLifecycle` with `markStarted()`, `markActivity(now?)`, `markEof(now?)`, and `getDecision(now): 'continue' | 'startup-stall' | 'stream-stall' | 'drain-stall'`.
- Produces: `waitForLocalProcessClose(child, context, options)` with activity and bounded post-EOF drain.
- Reuses: existing `killLocalProcessTree(child)`.

- [ ] **Step 1: Write failing lifecycle decision tests with a fake clock**

```ts
test('never applies a fixed total timeout while stream activity continues', () => {
	const lifecycle = new TurboFileTarLifecycle({ startupMs: 30_000, inactivityMs: 30_000, drainMs: 5_000 }, 0);
	lifecycle.markStarted(0);
	lifecycle.markActivity(29_000);
	lifecycle.markActivity(58_000);
	assert.strictEqual(lifecycle.getDecision(60_000), 'continue');
});

test('reports drain stall only after eof grace expires', () => {
	const lifecycle = new TurboFileTarLifecycle({ startupMs: 30_000, inactivityMs: 30_000, drainMs: 5_000 }, 0);
	lifecycle.markStarted(0);
	lifecycle.markActivity(1_000);
	lifecycle.markEof(2_000);
	assert.deepStrictEqual([lifecycle.getDecision(6_999), lifecycle.getDecision(7_001)], ['continue', 'drain-stall']);
});
```

- [ ] **Step 2: Run focused lifecycle tests and confirm RED**

```powershell
scripts\test.bat --grep "TurboFileTarLifecycle"
```

Expected: module/class is absent.

- [ ] **Step 3: Implement the pure lifecycle state machine**

```ts
export class TurboFileTarLifecycle {
	private startedAt: number | undefined;
	private lastActivityAt: number | undefined;
	private eofAt: number | undefined;

	constructor(private readonly limits: TurboFileTarLifecycleLimits, private readonly createdAt = Date.now()) { }
	markStarted(now = Date.now()): void { this.startedAt = now; }
	markActivity(now = Date.now()): void { this.lastActivityAt = now; }
	markEof(now = Date.now()): void { this.eofAt = now; }
	getDecision(now = Date.now()): TurboFileTarLifecycleDecision {
		if (this.eofAt !== undefined) { return now - this.eofAt > this.limits.drainMs ? 'drain-stall' : 'continue'; }
		if (this.lastActivityAt !== undefined) { return now - this.lastActivityAt > this.limits.inactivityMs ? 'stream-stall' : 'continue'; }
		return now - (this.startedAt ?? this.createdAt) > this.limits.startupMs ? 'startup-stall' : 'continue';
	}
}
```

- [ ] **Step 4: Integrate the supervisor into native and ssh2 tar paths**

Mark activity from existing stdout/stderr/progress chunks. Mark EOF when the pipeline resolves. During drain, race process/channel close against the lifecycle drain deadline. On a stall, invoke `killLocalProcessTree` for every local child and close/destroy the ssh2 stream/client, then throw a typed `TurboFileTarStallError` identifying the phase.

Do not add per-file callbacks, new transforms, fixed total-duration timeout, or different stream high-water marks.

- [ ] **Step 5: Prewarm local SSH/tar dependencies without blocking startup**

Schedule one background call that resolves the local SSH tool and `getLocalTarCharsetArgs()`. Catch and discard prewarm failure; the first real transfer retains lazy resolution and normal errors.

- [ ] **Step 6: Make batch tar exceptions enter the existing fallback chain**

Wrap each tar strategy attempt so that non-cancellation failures clear timing/progress attempt state and return `undefined` to the caller's next strategy. Cancellation must rethrow `TurboFileTransferCanceledError`. Ensure the order remains native tar, ssh2 tar, rsync when available, then concurrent SFTP/SCP.

- [ ] **Step 7: Type-check, test, and commit**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileTarLifecycle|TurboFileSshMainServiceStatic|TurboFileTarProgress"
git add src/vs/platform/turbofile/common/turbofileTarLifecycle.ts src/vs/platform/turbofile/test/common/turbofileTarLifecycle.test.ts src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts
git commit -m "fix: bound tar pipeline shutdown and fallback safely"
```

Expected: type-check exits 0; lifecycle and static integration tests pass.

---

### Task 5: Transactional Tar Targets and Move Safety

**Files:**
- Create: `src/vs/platform/turbofile/common/turbofileTransferStaging.ts`
- Create: `src/vs/platform/turbofile/test/common/turbofileTransferStaging.test.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSameDeviceMergeStatic.test.ts`

**Interfaces:**
- Produces: `createTurboFileStagingName(id: string): string` returning `.turbofile-transfer-<id>.partial`.
- Produces: local/remote staging plans containing extraction root, final entries, cleanup command, and commit command.
- Consumes: Task 3's preflight conflicts and Task 4's stall/fallback signal.

- [ ] **Step 1: Write failing staging-name and commit-plan tests**

```ts
test('creates a hidden same-filesystem staging directory', () => {
	assert.strictEqual(createTurboFileStagingName('abc-123'), '.turbofile-transfer-abc-123.partial');
});

test('commits only top-level items after successful extraction', () => {
	assert.deepStrictEqual(createTurboFileLocalStagingPlan('D:\\target', ['a', 'b'], 'id'), {
		stagingDirectory: 'D:\\target\\.turbofile-transfer-id.partial',
		entries: [
			{ staged: 'D:\\target\\.turbofile-transfer-id.partial\\a', final: 'D:\\target\\a' },
			{ staged: 'D:\\target\\.turbofile-transfer-id.partial\\b', final: 'D:\\target\\b' }
		]
	});
});
```

- [ ] **Step 2: Run focused staging tests and confirm RED**

```powershell
scripts\test.bat --grep "TurboFileTransferStaging"
```

Expected: staging helper is absent.

- [ ] **Step 3: Implement deterministic staging plans**

```ts
export function createTurboFileStagingName(id: string): string {
	return `.turbofile-transfer-${id}.partial`;
}
```

Build local paths with Node `path.join`; build remote POSIX paths with the existing remote path helpers and shell quoting. Keep staging under the destination parent so each final rename/mv is same-filesystem.

- [ ] **Step 4: Extract tar into staging and atomically commit top-level targets**

For downloads, create the local staging root, point local `tar -C` to it, and rename every staged top-level entry to its final name only after both SSH and tar exit 0. For uploads/direct/relay, make the remote command extract into the hidden staging directory and run guarded `mv -- staged/name final/name` only after the pipeline exits 0.

If any preflight conflict exists, do not create staging. If extraction, drain, or commit fails, remove only the current staging directory and surface failure/fallback. Never delete or mutate a pre-existing final target.

- [ ] **Step 5: Keep source cleanup after final commit only**

Place `cleanupBatchSourcesAfterTar(...)` after successful commit. Ensure every catch, cancellation, fallback, and partial-commit error returns before source deletion. Add static assertions that source cleanup follows the commit call and that cancel paths do not call it.

- [ ] **Step 6: Type-check, run all transfer-focused tests, and commit**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileTransferStaging|TurboFileTarLifecycle|TurboFileSshMainServiceStatic|TurboFileSameDeviceMergeStatic|TurboFileTransferPlan|TurboFileDragDrop|TurboFileClipboardTrust"
git add src/vs/platform/turbofile/common/turbofileTransferStaging.ts src/vs/platform/turbofile/test/common/turbofileTransferStaging.test.ts src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts src/vs/platform/turbofile/test/common/turbofileSameDeviceMergeStatic.test.ts
git commit -m "fix: commit tar transfers transactionally"
```

Expected: type-check exits 0; all transfer-focused suites pass.

---

### Task 6: Final Verification Without Packaging

**Files:**
- Verify only; do not modify generated `out/` manually.

**Interfaces:**
- Consumes all previous tasks.

- [ ] **Step 1: Run mandatory TypeScript validation**

```powershell
npm run compile-check-ts-native
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 2: Run the complete relevant unit-test set**

```powershell
scripts\test.bat --grep "TurboFile(EditorInput|DragDrop|ClipboardTrust|TransferConflict|TarLifecycle|TransferStaging|TarProgress|SshMainServiceStatic|SameDeviceMergeStatic|TransferPlan|WindowsClipboard|ImageGridPane)"
```

Expected: all selected tests pass with no failures.

- [ ] **Step 3: Inspect the scoped diff and generated-file boundary**

```powershell
git diff --check
git status --short
git diff -- src/vs/platform/turbofile src/vs/workbench/contrib/turbofile docs/superpowers/plans/2026-07-15-transfer-reliability-and-pane-controls.md
```

Expected: no whitespace errors; no unrelated source is staged or overwritten; `out/` remains generated state and is not hand-edited.

- [ ] **Step 4: Report manual checks still required**

List Windows UI checks for independent pane buttons, same-pane forced move, trusted Ctrl+C/X/V latency, conflict dialog, first tar transfer, repeated tar transfer, forced child-process hang, cancellation, and direct-to-relay fallback. Do not claim these interactive scenarios passed unless they were actually run.
