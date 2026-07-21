# Per-Device Recycle Bin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Windows-style, per-device recycle bin so every explicit TurboFile delete is a same-filesystem native move, while transfer cleanup and cut/move semantics continue using permanent deletion.

**Architecture:** Add dedicated recycle-bin contracts and pure path/metadata helpers in the platform layer, then implement local Windows, remote Windows, and POSIX SSH operations in the existing main-process SSH service. The workbench keeps recycle-bin mode independently in each pane and renders metadata-only rows; all explicit user delete entry points call `movePathsToTrash`, while existing `deletePath` and `deletePaths` remain unchanged for internal cleanup and permanent deletion.

**Tech Stack:** TypeScript, VS Code dependency injection and IPC proxying, Node.js filesystem APIs, SSH2, PowerShell, POSIX shell utilities, Mocha unit tests, CSS/Codicons.

## Global Constraints

- Work directly on branch `codex/image-stream-loading` and preserve all unrelated dirty-worktree changes.
- Every device has an independent recycle bin; only the pane switched to recycle-bin mode changes.
- Each filesystem, drive, or share uses a same-filesystem hidden recycle-bin root.
- Explicit user deletion always enters the recycle bin; no ordinary-view permanent-delete bypass exists.
- Cut, Ctrl+X/V, drag move, transfer cleanup, rollback, and temporary-file cleanup remain permanent operations.
- Recycle-bin data never expires automatically; permanent delete and empty are available only inside the recycle-bin view.
- Restore conflicts offer “Keep Both” or cancel and never overwrite.
- Directory size is never scanned; metadata uses only already-known file size.
- Delete and restore never invoke SCP, SFTP transfer, TAR, rsync, or cross-volume copy.
- Failure to create or use a same-filesystem trash root leaves the source untouched.
- Run `npm run compile-check-ts-native` before every test or validation command and never run `npm run compile`.

---

## File Structure

- Create `src/vs/platform/turbofile/common/turbofileTrash.ts`: pure metadata validation, device identity, restore-name generation, root/path safety, and in-memory sorting helpers.
- Create `src/vs/platform/turbofile/test/common/turbofileTrash.test.ts`: unit tests for those helpers.
- Modify `src/vs/platform/turbofile/common/turbofile.ts`: public recycle-bin request/result contracts and service methods.
- Modify `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`: local and SSH recycle-bin orchestration, atomic metadata, crash recovery, listing, restore, permanent delete, and empty.
- Create `src/vs/workbench/contrib/turbofile/common/turbofileTrashView.ts`: pure pane-mode and row mapping helpers.
- Create `src/vs/workbench/contrib/turbofile/test/common/turbofileTrashView.test.ts`: pane independence, ordering, selection, and display tests.
- Modify `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`: toolbar icon, independent pane state, recycle-bin list/actions, explicit delete routing, conflict prompts, and refresh behavior.
- Modify `src/vs/workbench/contrib/turbofile/browser/media/turbofile.css`: empty/full recycle-bin icons and recycle-bin row layout.
- Modify `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`: static guarantees that move-to-trash does not use transfer protocols or permanent-delete fallbacks.
- Modify `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`: all image delete entry points route to the recycle-bin API.

### Task 1: Recycle-Bin Domain Model and Pure Helpers

**Files:**
- Create: `src/vs/platform/turbofile/common/turbofileTrash.ts`
- Create: `src/vs/platform/turbofile/test/common/turbofileTrash.test.ts`
- Modify: `src/vs/platform/turbofile/common/turbofile.ts`

**Interfaces:**
- Produces: `ITurboFileTrashItem`, `ITurboFileTrashDevice`, `ITurboFileMoveToTrashRequest`, `ITurboFileTrashItemsRequest`, `ITurboFileRestoreTrashRequest`, `ITurboFileTrashOperationResult`, `ITurboFileTrashListing`, `ITurboFileTrashState`.
- Produces: `getTurboFileTrashDeviceIdentity`, `createTurboFileTrashItemId`, `createTurboFileKeepBothName`, `sortTurboFileTrashItems`, `isTurboFileTrashMetadata`, and `isTurboFileProtectedTrashSource`.

- [ ] **Step 1: Write failing pure-helper tests**

```ts
suite('TurboFileTrash', () => {
	test('keeps SSH identities stable and separates users', () => {
		assert.deepStrictEqual(
			[
				getTurboFileTrashDeviceIdentity({ kind: 'ssh', host: 'NAS', port: 22, username: 'alice' }),
				getTurboFileTrashDeviceIdentity({ kind: 'ssh', host: 'nas', port: 22, username: 'bob' })
			],
			['ssh:nas:22:alice', 'ssh:nas:22:bob']
		);
	});

	test('creates deterministic keep-both names without changing extensions', () => {
		assert.deepStrictEqual(
			[
				createTurboFileKeepBothName('photo.jpg', 1),
				createTurboFileKeepBothName('archive.tar.gz', 2),
				createTurboFileKeepBothName('folder', 3)
			],
			['photo (1).jpg', 'archive.tar (2).gz', 'folder (3)']
		);
	});

	test('sorts newest deleted item first without reading payloads', () => {
		assert.deepStrictEqual(
			sortTurboFileTrashItems([
				{ id: 'old', deletedAt: 1 },
				{ id: 'new', deletedAt: 2 }
			] as ITurboFileTrashItem[]).map(item => item.id),
			['new', 'old']
		);
	});
});
```

- [ ] **Step 2: Type-check before running the new tests**

Run: `npm run compile-check-ts-native`

Expected: FAIL because the recycle-bin helpers and contracts do not exist.

- [ ] **Step 3: Implement the contracts and pure helpers**

```ts
export interface ITurboFileTrashItem {
	readonly id: string;
	readonly originalName: string;
	readonly originalPath: string;
	readonly deletedAt: number;
	readonly type: TurboFileFileType;
	readonly knownSize?: number;
	readonly volumeId: string;
	readonly trashRoot: string;
	readonly payloadPath: string;
	readonly deviceIdentity: string;
	readonly damaged?: boolean;
	readonly damageMessage?: string;
}

export function createTurboFileKeepBothName(name: string, ordinal: number): string {
	const extensionIndex = name.lastIndexOf('.');
	if (extensionIndex <= 0) {
		return `${name} (${ordinal})`;
	}
	return `${name.slice(0, extensionIndex)} (${ordinal})${name.slice(extensionIndex)}`;
}
```

Implement strict metadata validation, normalized SSH identity, cryptographically unique item IDs, protected-root checks, and deletion-time descending sort. Add the six dedicated methods to `ITurboFileSshService`; do not change the existing permanent-delete signatures.

- [ ] **Step 4: Type-check and run helper tests**

Run:

```powershell
npm run compile-check-ts-native
npm run gulp compile-client
npm run compile-check-ts-native
scripts\test.bat --grep TurboFileTrash
```

Expected: compilation succeeds and all `TurboFileTrash` tests pass.

### Task 2: Local Windows Recycle-Bin Transactions

**Files:**
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts and metadata helpers.
- Produces: local implementations of all six recycle-bin service methods.

- [ ] **Step 1: Add failing service/static tests**

```ts
test('keeps user delete separate from permanent delete', () => {
	const source = readService();
	assert.ok(source.includes('async movePathsToTrash('));
	assert.ok(source.includes('await fsp.rename(source.path, payloadPath)'));
	assert.ok(!extractMethod(source, 'movePathsToTrash').includes('fsp.rm('));
	assert.ok(!extractMethod(source, 'movePathsToTrash').includes('transferBatch('));
});
```

Add tests for system-drive root selection, non-system drive root selection, pending metadata before rename, metadata finalization after rename, root protection, and partial batch results.

- [ ] **Step 2: Type-check before tests**

Run: `npm run compile-check-ts-native`

Expected: PASS for existing code or FAIL only for newly referenced unimplemented methods.

- [ ] **Step 3: Implement local trash-root resolution and transactions**

For a local Windows source:

```ts
const pendingPath = path.join(infoDirectory, `${item.id}.pending.json`);
const completePath = path.join(infoDirectory, `${item.id}.json`);
await fsp.mkdir(filesDirectory, { recursive: true });
await fsp.mkdir(infoDirectory, { recursive: true });
await fsp.writeFile(pendingPath, JSON.stringify(item), { encoding: 'utf8', flag: 'wx' });
await fsp.rename(source.path, payloadPath);
await fsp.rename(pendingPath, completePath);
```

Use `%LOCALAPPDATA%\TurboFile\RecycleBin\<volume-id>` for the current user profile drive and `<drive>:\.turbofile-trash-<user-key>\turbofile` for other drives. Set hidden attributes best-effort only after directory creation; failure to write metadata or rename must return a failed item and leave source data intact.

- [ ] **Step 4: Implement local list/recovery/restore/delete/empty**

List only `info/*.json` and reconcile pending entries. Restore creates missing parent directories, detects conflicts, and only uses `fsp.rename`. Permanent delete calls the existing `deletePaths` implementation on payload endpoints, then removes metadata only after payload success. Empty groups items by trash root and returns partial failures.

- [ ] **Step 5: Verify local service behavior**

Run:

```powershell
npm run compile-check-ts-native
npm run gulp compile-client
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileTrash|TurboFileSshMainService"
```

Expected: all focused tests pass.

### Task 3: POSIX SSH and Remote Windows Recycle Bins

**Files:**
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts and Task 2 orchestration.
- Produces: same-filesystem native move implementations for POSIX and remote Windows.

- [ ] **Step 1: Add failing command-safety tests**

```ts
test('remote trash commands never invoke transfer protocols or rm during move-to-trash', () => {
	const method = extractMethod(readService(), 'movePathsToTrash');
	for (const forbidden of ['scp ', 'sftp', 'tar ', 'rsync', 'rm -', 'Remove-Item']) {
		assert.ok(!method.includes(forbidden), forbidden);
	}
});
```

Add coverage for NUL-delimited batch input, `findmnt` with `df -P` fallback, POSIX UID isolation, remote PowerShell drive roots, and one SSH round trip per batch stage rather than per selected file.

- [ ] **Step 2: Type-check before tests**

Run: `npm run compile-check-ts-native`

Expected: compilation succeeds before executing tests.

- [ ] **Step 3: Implement POSIX root discovery and native move**

Resolve the source mount with `findmnt -T -- <path> -no TARGET` and fall back to `df -P`. Use `~/.local/share/Trash/turbofile` when source and home share a filesystem; otherwise use a validated `.Trash/<uid>/turbofile` or `<mount>/.Trash-<uid>/turbofile`. Write pending metadata before `mv -- source payload`, then atomically rename metadata. Batch command input must be NUL-delimited and return one JSON result per item.

- [ ] **Step 4: Implement remote Windows root discovery and native move**

Use one remote PowerShell script with JSON input to resolve the drive, remote `%LOCALAPPDATA%`, username-derived key, create hidden roots, write pending JSON, call `[System.IO.File]::Move` or `[System.IO.Directory]::Move`, and finalize metadata. Never use `Move-Item` in a mode that silently falls back to copy across providers.

- [ ] **Step 5: Implement remote list/recovery/restore/delete/empty**

Enumerate Windows drives or POSIX mount points, inspect only the known metadata directories, merge records, and retain inaccessible-volume diagnostics. Restore and permanent delete operate against the recorded `trashRoot`, `payloadPath`, and `volumeId`, not a recomputed path.

- [ ] **Step 6: Verify remote implementations**

Run:

```powershell
npm run compile-check-ts-native
npm run gulp compile-client
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileTrash|TurboFileSshMainService"
```

Expected: all focused tests pass; static checks find no transfer protocol in recycle-bin move/restore paths.

### Task 4: Independent Pane Recycle-Bin State and Row Mapping

**Files:**
- Create: `src/vs/workbench/contrib/turbofile/common/turbofileTrashView.ts`
- Create: `src/vs/workbench/contrib/turbofile/test/common/turbofileTrashView.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`

**Interfaces:**
- Consumes: `ITurboFileTrashItem` and `ITurboFileTrashListing`.
- Produces: `TurboFileTrashPaneMode`, `enterTurboFileTrashView`, `leaveTurboFileTrashView`, `mapTurboFileTrashItemsToRows`.

- [ ] **Step 1: Write failing pane-independence tests**

```ts
test('entering the left recycle bin leaves the right pane untouched', () => {
	const panes = createPaneFixture();
	const next = enterTurboFileTrashView(panes, 'left');
	assert.deepStrictEqual(next, {
		left: { mode: 'trash', returnPath: 'C:\\left' },
		right: panes.right
	});
});
```

Add tests for returning to the prior path, device-change exit, deletion-time ordering, no parent row, metadata-only size display, and independent selections.

- [ ] **Step 2: Type-check before tests**

Run: `npm run compile-check-ts-native`

Expected: FAIL because view helpers do not exist.

- [ ] **Step 3: Implement pure pane-mode helpers**

```ts
export interface TurboFileTrashPaneMode {
	readonly active: boolean;
	readonly returnPath?: string;
}

export function enterTurboFileTrashView(path: string): TurboFileTrashPaneMode {
	return { active: true, returnPath: path };
}

export function leaveTurboFileTrashView(): TurboFileTrashPaneMode {
	return { active: false };
}
```

Map recycle metadata to dedicated UI rows without pretending payload paths are ordinary browsable paths.

- [ ] **Step 4: Extend each `TurboFilePaneState` independently**

Add `trashMode`, `trashItems`, `trashLoading`, and `trashError`. Switching devices clears only that side’s trash mode. Directory refresh and trash refresh use separate request sequence checks so a response from one mode cannot overwrite the other.

- [ ] **Step 5: Verify pane helper behavior**

Run:

```powershell
npm run compile-check-ts-native
npm run gulp compile-client
npm run compile-check-ts-native
scripts\test.bat --grep TurboFileTrashView
```

Expected: all pane-state tests pass.

### Task 5: Toolbar, Recycle-Bin View, and Actions

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/media/turbofile.css`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`

**Interfaces:**
- Consumes: Task 3 service methods and Task 4 pane state.
- Produces: empty/full icon, view toggle, restore, permanent delete, empty, refresh, context menu, and return behavior.

- [ ] **Step 1: Add failing UI/static tests**

Assert that the recycle-bin toolbar button is appended immediately after the delete button, left/right state fields are separate, recycle mode has no parent row or drag-out handler, and permanent delete/empty actions are only rendered when `trashMode.active`.

- [ ] **Step 2: Type-check before tests**

Run: `npm run compile-check-ts-native`

Expected: compilation succeeds before running tests.

- [ ] **Step 3: Add the toolbar icon and view toggle**

Append the recycle-bin button immediately after:

```ts
this.appendToolbarButton(toolbar, Codicon.trash, localize('turbofile.deleteSelected', "Delete Selected"), ...);
```

Use compact code-native empty/full icon classes matching existing toolbar dimensions. Clicking it calls `toggleTrashView(side)` and only refreshes/render the selected pane state.

- [ ] **Step 4: Render metadata-only recycle rows and toolbar**

Render title `<device> - Recycle Bin`, columns for original name/path/deleted time/type/known size, and actions Back, Restore, Permanently Delete, Empty Recycle Bin, Refresh. Disable rename, directory navigation, paste, transfer drag, image-grid opening, and terminal actions while in recycle mode.

- [ ] **Step 5: Implement restore conflict flow**

Call restore with `conflictPolicy: 'cancel'`. If conflicts are returned, show a modal prompt with “Keep Both” and “Cancel”; retry only conflicted items with `conflictPolicy: 'keepBoth'`. Refresh recycle metadata and any visible pane showing a restored parent path.

- [ ] **Step 6: Implement permanent delete and empty confirmations**

Use stronger localized confirmation text. Show per-item success/failure counts, preserve failed records, refresh only the active recycle pane, and update empty/full icon state cache.

- [ ] **Step 7: Verify UI behavior**

Run:

```powershell
npm run compile-check-ts-native
npm run gulp compile-client
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileTrashView|TurboFileImageGridPane"
```

Expected: focused UI tests pass.

### Task 6: Route Every Explicit Delete to Trash

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`

**Interfaces:**
- Consumes: `movePathsToTrash`.
- Produces: one workbench helper `moveUserSelectedItemsToTrash` shared by file rows, context menu, keyboard Delete, image grid, and image preview.

- [ ] **Step 1: Add failing routing tests**

```ts
test('explicit delete entry points use movePathsToTrash', () => {
	const source = readEditor();
	for (const methodName of ['deleteSelected', 'deleteSelectedImageGridItems', 'deleteImageGridPreview']) {
		assert.ok(extractMethod(source, methodName).includes('movePathsToTrash'));
	}
});
```

Also assert that transfer cleanup methods still contain `deletePath`/`deletePaths` and do not call `movePathsToTrash`.

- [ ] **Step 2: Type-check before tests**

Run: `npm run compile-check-ts-native`

Expected: compilation succeeds before running tests.

- [ ] **Step 3: Replace explicit-delete calls only**

Build one batch request containing endpoint, item type, and already-known size. Change confirmation copy to “Move these items to the Recycle Bin?”. On success refresh the source directory and recycle state; on partial failure keep failed selections and show exact messages.

- [ ] **Step 4: Preserve permanent cleanup semantics**

Audit every remaining `deletePath` and `deletePaths` call. Keep calls used by Ctrl+X/V completion, drag move completion, remote-to-local move cleanup, rollback, temporary resources, and recycle-bin permanent delete. Add comments only where intent is otherwise ambiguous.

- [ ] **Step 5: Verify delete routing**

Run:

```powershell
npm run compile-check-ts-native
npm run gulp compile-client
npm run compile-check-ts-native
scripts\test.bat --grep "TurboFileTrash|TurboFileImageGridPane|TurboFileSshMainService"
```

Expected: all explicit-delete routing tests pass and transfer cleanup remains permanent.

### Task 7: Full Validation and Manual Acceptance

**Files:**
- Modify only files required to fix validation failures.

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified feature ready for user packaging/testing.

- [ ] **Step 1: Run final type check**

Run: `npm run compile-check-ts-native`

Expected: exit code 0.

- [ ] **Step 2: Compile the client and re-run type check**

Run:

```powershell
npm run gulp compile-client
npm run compile-check-ts-native
```

Expected: both commands exit 0.

- [ ] **Step 3: Run all TurboFile tests**

Run:

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep TurboFile
```

Expected: all TurboFile tests pass with no regressions.

- [ ] **Step 4: Validate architecture and whitespace**

Run:

```powershell
npm run compile-check-ts-native
npm run valid-layers-check
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Manual desktop acceptance**

Verify local C drive, local data drive, POSIX home filesystem, separate POSIX mount/NAS share, and remote Windows:

1. Explicit Delete immediately moves files and large directories without a size scan.
2. Recycle-bin icon appears directly after Delete and changes empty/full state.
3. Left and right recycle-bin modes are independent.
4. Restore recreates missing parents; conflict offers only Keep Both or Cancel.
5. Permanent Delete and Empty exist only in recycle-bin mode.
6. Ctrl+X/V and drag move do not create recycle-bin entries.
7. Disconnect, permission failure, and unavailable mount never permanently remove the source.
