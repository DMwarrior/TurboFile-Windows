# Drag Transfer Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent copy/cut drag mode to every TurboFile page and apply it safely to every internal and Windows drag path.

**Architecture:** Store the page-scoped operation on `TurboFileEditorInput`, centralize drag-operation decisions in pure helpers, and snapshot the operation into drag data at drag start. Reuse the existing batch transfer `operation: 'copy' | 'move'` pipeline; for local cut-drag to Windows, reuse the existing CopyHook target-capture path before moving any source.

**Tech Stack:** TypeScript, VS Code EditorInput/EditorPane APIs, Electron `webContents.startDrag`, Windows CopyHook helper, CSS, Mocha assertions.

## Global Constraints

- Default mode is `copy`; every new TurboFile page starts independently in `copy`.
- The mode applies to cross-pane, same-pane folder, Windows-to-pane, and pane-to-Windows drags.
- Ctrl+C, Ctrl+X, Ctrl+V and non-drag transfer commands keep their existing explicit semantics.
- Cancellation, target-capture failure, or transfer failure must never delete a source item that was not successfully moved.
- Do not persist the mode and do not create separate left/right modes.
- Preserve all pre-existing dirty working-tree changes; do not stage or commit overlapping implementation files.
- Run `npm run compile-check-ts-native` before any unit test command.
- The unit-test launcher currently cannot download Electron from GitHub (`ECONNRESET`/`ETIMEDOUT`); retry it after implementation but do not report tests as passing unless they actually execute.

---

### Task 1: Page-Scoped Operation and Pure Drag Decisions

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/common/turbofileDragDrop.ts`
- Modify: `src/vs/workbench/contrib/turbofile/common/turbofileEditorInput.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileEditorInput.test.ts`

**Interfaces:**
- Produces: `TurboFileDragOperation = 'copy' | 'move'`.
- Produces: `resolveTurboFileDragOperation(value, fallback)`, `getTurboFileDropEffect(operation)`, `getNextTurboFileDragOperation(operation)`, and `shouldCaptureWindowsDropTarget(sourceKind, operation)`.
- Produces: `TurboFileEditorInput.getDragOperation()`, `setDragOperation(operation)`, and `toggleDragOperation()`.

- [ ] **Step 1: Write failing pure-helper tests**

Add one snapshot-style test asserting:

```ts
assert.deepStrictEqual({
	resolvedCopy: resolveTurboFileDragOperation('copy', 'move'),
	resolvedMove: resolveTurboFileDragOperation('move', 'copy'),
	invalidFallback: resolveTurboFileDragOperation('link', 'copy'),
	copyEffect: getTurboFileDropEffect('copy'),
	moveEffect: getTurboFileDropEffect('move'),
	nextCopy: getNextTurboFileDragOperation('copy'),
	nextMove: getNextTurboFileDragOperation('move'),
	localCopyCapture: shouldCaptureWindowsDropTarget('local', 'copy'),
	localMoveCapture: shouldCaptureWindowsDropTarget('local', 'move'),
	sshCopyCapture: shouldCaptureWindowsDropTarget('ssh', 'copy')
}, {
	resolvedCopy: 'copy', resolvedMove: 'move', invalidFallback: 'copy',
	copyEffect: 'copy', moveEffect: 'move', nextCopy: 'move', nextMove: 'copy',
	localCopyCapture: false, localMoveCapture: true, sshCopyCapture: true
});
```

- [ ] **Step 2: Write failing page-isolation test**

Create two `TurboFileEditorInput` instances, toggle only the first, and assert the first is `move`, the second stays `copy`, and a second toggle restores `copy`.

- [ ] **Step 3: Run compile check to confirm missing-interface failures**

Run: `npm run compile-check-ts-native`

Expected: non-zero exit with missing exported helper/method errors from the new tests.

- [ ] **Step 4: Implement the minimal helpers and input state**

Implement:

```ts
export type TurboFileDragOperation = 'copy' | 'move';

export function resolveTurboFileDragOperation(value: string | undefined, fallback: TurboFileDragOperation): TurboFileDragOperation {
	return value === 'copy' || value === 'move' ? value : fallback;
}

export function getTurboFileDropEffect(operation: TurboFileDragOperation): 'copy' | 'move' {
	return operation;
}

export function getNextTurboFileDragOperation(operation: TurboFileDragOperation): TurboFileDragOperation {
	return operation === 'copy' ? 'move' : 'copy';
}

export function shouldCaptureWindowsDropTarget(sourceKind: 'local' | 'ssh', operation: TurboFileDragOperation): boolean {
	return sourceKind === 'ssh' || operation === 'move';
}
```

Store `private dragOperation: TurboFileDragOperation = 'copy'` on `TurboFileEditorInput`; its setter returns early when unchanged, and its toggle uses `getNextTurboFileDragOperation`.

- [ ] **Step 5: Run compile check**

Run: `npm run compile-check-ts-native`

Expected: exit 0.

- [ ] **Step 6: Check only intended task files**

Run: `git diff --check -- src/vs/workbench/contrib/turbofile/common/turbofileDragDrop.ts src/vs/workbench/contrib/turbofile/common/turbofileEditorInput.ts src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts src/vs/workbench/contrib/turbofile/test/common/turbofileEditorInput.test.ts`

Expected: exit 0. Do not stage because `turbofileEditorInput.ts` already contains user-owned dirty changes.

### Task 2: Toolbar Toggle and In-App Drag Paths

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/media/turbofile.css`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`

**Interfaces:**
- Consumes: page operation and pure helpers from Task 1.
- Produces: synchronized `.turbofile-drag-operation-button` controls in both pane toolbars.
- Produces: `transferSelected(sourceSide, targetSide, initiatedAt, operation)` and folder-target copy/move routing.

- [ ] **Step 1: Add failing source-wiring assertions**

Read `turbofileEditor.ts` as text and assert it contains the mode button class, writes `application/x-turbofile-operation`, resolves that payload at drops, passes the operation to `transferSelected` and `transferExternalPaths`, and routes same-pane folder drops through a method that accepts the operation.

- [ ] **Step 2: Run compile check to verify the new API references fail**

Run: `npm run compile-check-ts-native`

Expected: non-zero until the editor imports and methods exist.

- [ ] **Step 3: Render the synchronized two-state toolbar button**

Insert the button between sort and refresh in `renderPane`. The button reads `this.currentInput?.getDragOperation() ?? 'copy'`, renders `files` for copy and `scissors` for move, sets `aria-pressed`, localized title/label text, and calls `this.currentInput?.toggleDragOperation(); this.render();`.

- [ ] **Step 4: Snapshot operation at drag start and consume it at every in-app drop**

At row and image-card drag start, write the current operation into `application/x-turbofile-operation` and set `effectAllowed` accordingly. At page, list, image-grid, and external-window interceptors, resolve the operation once from drag data with the current page mode as fallback, set the matching `dropEffect`, and pass it into the deferred transfer call.

- [ ] **Step 5: Make cross-pane and folder-target transfers operation-aware**

Change `transferSelected` to accept `operation: TurboFileDragOperation = 'copy'`. Route all move operations and multi-item copies through `transferItemsBatch`; keep the existing optimized single-item copy path. Add an optional target-directory argument to `transferItemsBatch` so a same-pane folder drop can copy into that folder. In folder-row drop handling, call native `moveSelectedItemsIntoDirectory` for `move`, otherwise batch-copy the validated selection to `dropTargetPath`.

- [ ] **Step 6: Style the destructive state without moving existing icons**

Keep the existing 24x24 button geometry. Add `.turbofile-drag-operation-button.is-move` color, background, border/inset outline, hover, focus-visible, and high-contrast rules using VS Code theme variables. Do not change toolbar height, alignment, padding, or neighboring icon offsets.

- [ ] **Step 7: Compile and inspect diff**

Run: `npm run compile-check-ts-native`

Expected: exit 0.

Run: `git diff --check -- src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts src/vs/workbench/contrib/turbofile/browser/media/turbofile.css src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`

Expected: exit 0.

### Task 3: Reliable Cut-Drag from Pane to Windows

**Files:**
- Modify: `src/vs/platform/turbofile/common/turbofile.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`

**Interfaces:**
- Extends: `ITurboFileStartWindowsDragRequest` with `readonly operation?: 'copy' | 'move'`.
- Consumes: `shouldCaptureWindowsDropTarget(source.kind, operation)`.
- Guarantees: local-copy keeps direct native drag; local-move and all SSH drags capture a confirmed target directory first.

- [ ] **Step 1: Add failing contract assertions**

Assert the request interface includes `operation`, the editor passes the drag-start snapshot to `startWindowsFileDrag`, and the main service selects target capture for local move.

- [ ] **Step 2: Run compile check to expose missing request support**

Run: `npm run compile-check-ts-native`

Expected: non-zero until the request and call sites are updated.

- [ ] **Step 3: Extend the request without changing copy defaults**

Add optional `operation`. In the main service resolve `request.operation ?? 'copy'`. If the source is local and operation is copy, keep the current `webContents.startDrag({ files })` path. Otherwise call a generalized target-capture method that uses the existing fake directory and CopyHook for both local move and SSH operations.

- [ ] **Step 4: Execute transfer only after confirmed target**

Pass the snapshotted operation through `startWindowsFileDragFromPane` and `transferItemsToWindowsDirectory`. On `canceled`, timeout, missing target, or `ok: false`, return without calling any transfer or deletion. For a confirmed local move, `transferBatch(... operation: 'move')` performs native local move; for SSH move, the existing batch pipeline removes only successfully moved sources.

- [ ] **Step 5: Keep direct local-copy drag fast**

Do not route local copy through fake target capture. Its behavior and native multi-file `startDrag` call remain byte-for-byte equivalent except for receiving the defaulted operation.

- [ ] **Step 6: Compile and inspect the platform diff**

Run: `npm run compile-check-ts-native`

Expected: exit 0.

Run: `git diff --check -- src/vs/platform/turbofile/common/turbofile.ts src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`

Expected: exit 0.

### Task 4: Verification and Manual Test Build

**Files:**
- Verify all files from Tasks 1-3.

**Interfaces:**
- Consumes the complete feature.
- Produces fresh verification evidence and a precise list of any environment-blocked checks.

- [ ] **Step 1: Run the mandatory compiler check**

Run: `npm run compile-check-ts-native`

Expected: exit 0.

- [ ] **Step 2: Retry focused unit tests**

Run: `scripts\test.bat --grep "TurboFileDragDrop|TurboFileEditorInput"`

Expected: all matching tests pass. If Electron download still fails, record the exact network error and do not describe tests as executed.

- [ ] **Step 3: Run diff safety checks**

Run: `git diff --check`

Expected: exit 0.

Run: `git status --short`

Expected: only known user-owned changes plus this feature's files; no generated temporary files.

- [ ] **Step 4: Review requirement coverage**

Check each path explicitly: cross-pane copy/move, same-pane folder copy/move, Windows-to-pane copy/move, local-pane-to-Windows copy/move, SSH-pane-to-Windows copy/move, per-page isolation, synchronized toolbar icons, Ctrl+C/X/V unchanged, cancellation/failed target capture no source deletion.

- [ ] **Step 5: Prepare manual validation instructions**

Tell the user to open two TurboFile tabs, switch only one to cut, and test the four drag directions plus canceling a Windows drop. Do not package unless the user requests it after validation.

## Execution Choice

Inline execution is selected because the user explicitly requested implementation on the current `codex/image-stream-loading` branch and did not request subagents. The worktree is intentionally not changed, and overlapping dirty files will not be staged.
