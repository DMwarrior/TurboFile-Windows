# Pane Copy/Cut Mode on v1.148 Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore independent left/right copy-cut drag modes while preserving the current v1.148 transfer protocol pipelines and package the result as version 1.151.0.

**Architecture:** Keep operation state in each `TurboFileEditorInput`, keep operation parsing in the pure drag-drop helper, and snapshot the source or target pane mode at each drag boundary. Reuse the existing `operation: 'copy' | 'move'` batch execution and source-cleanup paths; only the Windows drop-target capture contract is extended, without changing tar/scp/rsync/SFTP data pipelines.

**Tech Stack:** TypeScript, DOM/CSS, Electron Windows drag bridge, Mocha, VS Code gulp/Inno Setup packaging.

## Global Constraints

- Work directly on `codex/image-stream-loading` and preserve unrelated dirty-worktree changes.
- Each page owns independent left/right state; both sides default to `copy` and the state is not persisted.
- Left copy uses the same blue as the left sort icon; right copy uses the same green as the right sort icon; cut is red on both sides.
- Same-pane drops into a folder or `..` always move and never consult or change the mode button.
- Ctrl+C/X/V keep their explicit keyboard semantics and never consult the mode button.
- A move deletes sources only after the complete target operation succeeds; failure or cancellation never deletes sources.
- Do not restore or modify post-v1.148 tar staging, `dd` progress relay, watchdog, drain timeout, or protocol buffers.
- Run `npm run compile-check-ts-native` before passing tests; never run `npm run compile`.

---

### Task 1: Pure Operation Helpers and Per-Pane State

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/common/turbofileDragDrop.ts`
- Modify: `src/vs/workbench/contrib/turbofile/common/turbofileEditorInput.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileEditorInput.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`

**Interfaces:**
- Produces: `TurboFileDragOperation = 'copy' | 'move'`
- Produces: `resolveTurboFileDragOperation(value, fallback)`, `getTurboFileDropEffect(operation)`, and `getNextTurboFileDragOperation(operation)`.
- Produces: `TurboFileEditorInput.getDragOperation(side)`, `setDragOperation(side, operation)`, and `toggleDragOperation(side)`.

- [ ] **Step 1: Add failing state and helper tests**

```ts
test('keeps copy and cut modes independent by pane and page', () => {
	const first = createInput(1);
	const second = createInput(2);
	assert.deepStrictEqual([
		first.getDragOperation('left'), first.getDragOperation('right'),
		second.getDragOperation('left'), second.getDragOperation('right')
	], ['copy', 'copy', 'copy', 'copy']);
	assert.strictEqual(first.toggleDragOperation('left'), 'move');
	assert.deepStrictEqual([
		first.getDragOperation('left'), first.getDragOperation('right'), second.getDragOperation('left')
	], ['move', 'copy', 'copy']);
});

test('resolves drag operation and drop effect safely', () => {
	assert.deepStrictEqual([
		resolveTurboFileDragOperation('move', 'copy'),
		resolveTurboFileDragOperation('invalid', 'copy'),
		getNextTurboFileDragOperation('copy'),
		getTurboFileDropEffect('move')
	], ['move', 'copy', 'move', 'move']);
});
```

- [ ] **Step 2: Compile the test output and run the focused tests to verify RED**

Run: `npm run gulp compile-client`

Run: `node_modules\.bin\mocha.cmd --ui tdd --timeout 10000 --exit out\vs\workbench\contrib\turbofile\test\common\turbofileEditorInput.test.js out\vs\workbench\contrib\turbofile\test\common\turbofileDragDrop.test.js`

Expected: failure because the helper exports and editor-input methods do not exist.

- [ ] **Step 3: Implement the pure helpers**

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
```

- [ ] **Step 4: Implement two-slot page state**

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

- [ ] **Step 5: Run the mandatory type-check and focused tests to verify GREEN**

Run: `npm run compile-check-ts-native`

Run: `npm run gulp compile-client`

Run the Mocha command from Step 2.

Expected: both suites pass.

---

### Task 2: Compact Colored Button and In-App Drag Routing

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/media/turbofile.css`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`

**Interfaces:**
- Consumes: Task 1 operation helpers and `TurboFileEditorInput` state.
- Produces: `appendDragOperationButton(parent, side)` and `getCurrentDragOperation(side)`.
- Produces: operation-aware `transferSelected(sourceSide, targetSide, initiatedAt, operation)`.

- [ ] **Step 1: Add failing renderer and CSS assertions**

```ts
assert.deepStrictEqual({
	button: editor.includes('this.appendDragOperationButton(toolbar, side)'),
	snapshot: editor.includes("setData('application/x-turbofile-operation', operation)"),
	internalDrop: editor.includes('this.transferSelected(sourceSide, targetSide, initiatedAt, operation)'),
	externalDrop: editor.includes('this.transferExternalPaths(targetSide, externalPaths, operation, initiatedAt)'),
	leftBlue: css.includes('.turbofile-pane[data-turbofile-side="left"] .turbofile-drag-operation-button.is-copy'),
	rightGreen: css.includes('.turbofile-pane[data-turbofile-side="right"] .turbofile-drag-operation-button.is-copy'),
	cutRed: css.includes('.turbofile-drag-operation-button.is-move') && css.includes('turbofile-text-danger')
}, {
	button: true,
	snapshot: true,
	internalDrop: true,
	externalDrop: true,
	leftBlue: true,
	rightGreen: true,
	cutRed: true
});
```

- [ ] **Step 2: Recompile and run `TurboFileDragDrop` to verify RED**

Run: `npm run gulp compile-client`

Run: `node_modules\.bin\mocha.cmd --ui tdd --timeout 10000 --exit out\vs\workbench\contrib\turbofile\test\common\turbofileDragDrop.test.js`

Expected: the new source assertions fail because the button and routing are missing.

- [ ] **Step 3: Render the independent compact mode button after sort**

```ts
private appendDragOperationButton(parent: HTMLElement, side: 'left' | 'right'): void {
	const operation = this.getCurrentDragOperation(side);
	const isMove = operation === 'move';
	const label = isMove
		? localize('turbofile.dragMode.move.label', '剪切')
		: localize('turbofile.dragMode.copy.label', '复制');
	const button = $('button.turbofile-toolbar-button.turbofile-drag-operation-button') as HTMLButtonElement;
	button.classList.add(isMove ? 'is-move' : 'is-copy');
	button.title = label;
	button.setAttribute('aria-label', label);
	button.appendChild($('span.turbofile-drag-operation-icon', undefined, label));
	button.addEventListener('click', () => {
		this.currentInput?.toggleDragOperation(side);
		this.render();
	});
	parent.appendChild(button);
}
```

- [ ] **Step 4: Snapshot and route the correct operation**

At row/image drag start, write the source pane mode to `application/x-turbofile-operation` while retaining `effectAllowed = 'copyMove'`. At internal page/list/image drops, resolve that payload once and pass it to `transferSelected`. At Windows-to-pane drops, use the target pane mode. Set `dropEffect` from the same resolved operation.

Same-pane folder and parent-row handlers continue calling `moveSelectedItemsIntoDirectory(...)` directly and never read the operation payload.

- [ ] **Step 5: Reuse batch move safety for cross-pane cut**

Change the method signature to:

```ts
private async transferSelected(
	sourceSide: 'left' | 'right',
	targetSide: 'left' | 'right',
	initiatedAt?: number,
	operation: TurboFileDragOperation = 'copy'
): Promise<boolean>
```

Route `operation === 'move'` or multi-item copy through `transferItemsBatch(..., operation, initiatedAt)`. Preserve the existing optimized single-item path only for copy.

- [ ] **Step 6: Add compact side-aware CSS without persistent highlight**

```css
.turbofile-toolbar-button.turbofile-drag-operation-button {
	width: 24px;
	min-width: 24px;
	height: 24px;
	padding: 0;
	border: 0;
	background: transparent;
	box-shadow: none;
}

.turbofile-drag-operation-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 18px;
	box-sizing: border-box;
	border: 1px solid currentColor;
	border-radius: 2px;
	font-size: 9px;
	font-weight: 600;
	line-height: 1;
}

.turbofile-pane[data-turbofile-side="left"] .turbofile-drag-operation-button.is-copy { color: #3b82f6; }
.turbofile-pane[data-turbofile-side="right"] .turbofile-drag-operation-button.is-copy { color: #2fae7b; }
.turbofile-drag-operation-button.is-move { color: #ef6670; }
```

Explicitly keep hover/active/focus backgrounds transparent so switching does not create a large selected rectangle.

- [ ] **Step 7: Type-check, rebuild and run the focused suites**

Run: `npm run compile-check-ts-native`

Run: `npm run gulp compile-client`

Run both focused suites from Task 1.

Expected: all focused tests pass.

---

### Task 3: Safe Pane-to-Windows Cut

**Files:**
- Modify: `src/vs/platform/turbofile/common/turbofile.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`

**Interfaces:**
- Extends: `ITurboFileStartWindowsDragRequest` with `readonly operation?: TurboFileDragOperation` represented at the platform boundary as `'copy' | 'move'`.
- Guarantees: local copy retains direct native `webContents.startDrag`; local move and SSH copy/move capture a target directory before executing the transfer.

- [ ] **Step 1: Add failing contract assertions**

Assert that the request interface contains `operation?: 'copy' | 'move'`, the renderer passes the snapshotted operation to `startWindowsFileDrag`, and the main service routes local move through the existing fake-directory/CopyHook target capture rather than direct native copy.

- [ ] **Step 2: Recompile and run focused tests to verify RED**

Run: `npm run gulp compile-client`

Run the focused renderer tests plus `out\vs\platform\turbofile\test\common\turbofileSshMainServiceStatic.test.js`.

Expected: source assertions fail because the request lacks an operation.

- [ ] **Step 3: Extend only the Windows drag bridge contract**

```ts
export interface ITurboFileStartWindowsDragRequest {
	readonly source: ITurboFileTransferEndpoint;
	readonly items: readonly ITurboFileWindowsDragItem[];
	readonly operation?: 'copy' | 'move';
	readonly progressId?: string;
}
```

Resolve `const operation = request.operation ?? 'copy'`. Keep local copy on the current direct native path. Route local move and all SSH drags through the existing target-capture method. Do not alter transfer protocol builders or stream settings.

- [ ] **Step 4: Execute a move only after a confirmed target**

Pass the source-pane snapshot to `startWindowsFileDragFromPane` and `transferItemsToWindowsDirectory`. For move, use `transferBatch({ ..., operation: 'move' })`, including a single item, so the existing batch result controls source cleanup. On canceled, timeout, missing target or `ok: false`, return before transfer and deletion.

- [ ] **Step 5: Type-check and run focused tests to verify GREEN**

Run: `npm run compile-check-ts-native`

Run: `npm run gulp compile-client`

Run the three focused suites from Step 2.

Expected: all pass, and the v1.148 transfer-pipeline baseline test remains green.

---

### Task 4: Full Verification and 1.151.0 Packaging

**Files:**
- Verify all files from Tasks 1-3.
- Produce: `.build/win32-x64/TurboFileSetup-win32-x64-1.151.0.exe`
- Produce: `.build/win32-x64/TurboFileSetup-win32-x64-1.151.0.exe.sha256`

**Interfaces:**
- Consumes: the complete feature.
- Produces: fresh compile/test/build evidence and a versioned installer.

- [ ] **Step 1: Run mandatory type-check**

Run: `npm run compile-check-ts-native`

Expected: exit 0.

- [ ] **Step 2: Rebuild and run every TurboFile unit test**

Run: `npm run gulp compile-client`

Run Mocha over every `*.test.js` under both TurboFile test output directories using absolute paths.

Expected: 0 failures.

- [ ] **Step 3: Verify transfer-baseline and diff safety**

Run `git diff --check` and search for `buildTarProgressPipeCommand`, `TURBOFILE_TAR_PROGRESS_MARKER`, `createTarStreamWatchdog`, `waitForTarDrain`, `.partial`, and `dd bs=` in the transfer service/editor.

Expected: no whitespace errors and no forbidden post-v1.148 pipeline marker.

- [ ] **Step 4: Build Windows x64 product and installer**

Run: `npx gulp vscode-win32-x64`

Run: `npx gulp vscode-win32-x64-inno-updater`

Run: `npx gulp vscode-win32-x64-user-setup`

Expected: all three tasks exit 0.

- [ ] **Step 5: Version, copy and hash the installer**

Copy `.build/win32-x64/user-setup/极速传Setup.exe` to `.build/win32-x64/TurboFileSetup-win32-x64-1.151.0.exe`, generate a SHA-256 sidecar, and verify the first two bytes are `4D 5A` and packaged `product.json` reports `1.151.0`.

Expected: sidecar hash equals `Get-FileHash`, PE header and version match.

## Execution Choice

Inline execution is selected because the user explicitly requested implementation in the current branch and did not authorize subagent delegation. The current normal repository and dirty worktree are preserved.
