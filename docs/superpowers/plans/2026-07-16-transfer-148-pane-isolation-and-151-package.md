# 1.148.0 Transfer Restoration, Pane Isolation, and 1.151.0 Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore every transfer-related source path to the `v1.148.0` baseline, keep current non-transfer capabilities, isolate left/right pane image DOM, restore same-pane move drops, and produce a verified Windows x64 1.151.0 installer.

**Architecture:** Treat `v1.148.0` (`6b65264f`) as the immutable transfer reference. Restore transfer-only modules exactly and transplant tag implementations at symbol boundaries inside mixed files, then add two narrowly scoped UI fixes on top: retained pane-image DOM islands and an internal drag effect that permits same-pane moves. Compile and test after each boundary so baseline incompatibilities are found before packaging.

**Tech Stack:** TypeScript, VS Code workbench DOM, Electron main-process SSH/tar services, Mocha TDD tests, Gulp Windows packaging, Inno Setup.

## Global Constraints

- Work directly on `codex/image-stream-loading`; do not create another worktree.
- Preserve all current non-transfer document, image, sorting, tab, terminal, installation, packaging, and update behavior.
- Restore transfer behavior exactly from tag `v1.148.0`, including removal of transfer behavior introduced after that tag.
- Same-pane drops onto a folder or `..` are always moves and do not depend on the pane copy/cut mode.
- Left and right pane image surfaces must retain independent DOM, decoded images, scroll state, and listeners.
- Run `npm run compile-check-ts-native` before every unit-test command; never run `npm run compile`.
- Do not package until typecheck, focused tests, TurboFile full tests, and `git diff --check` pass.
- Final package version is exactly `1.151.0`.

---

### Task 1: Lock the 1.148.0 transfer baseline with failing contracts

**Files:**
- Create: `src/vs/platform/turbofile/test/common/turbofileTransfer148Baseline.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`

**Interfaces:**
- Consumes: tag `v1.148.0` and current source text.
- Produces: regression contracts that fail while post-1.148 transfer paths, incompatible drag effects, and cross-pane image rebuilds remain.

- [ ] **Step 1: Add the transfer-baseline contract**

Create a static source contract that asserts the current transfer service uses the 1.148 direct `tar | ssh` and `ssh | tar` command shapes and rejects post-baseline transfer-only symbols:

```ts
suite('TurboFileTransfer148Baseline', () => {
	test('uses the 1.148.0 direct tar pipelines without a progress relay', () => {
		assert.ok(source.includes('tar -cf - -C'));
		assert.ok(!source.includes('buildTarProgressPipeCommand'));
		assert.ok(!source.includes('TURBOFILE_TAR_PROGRESS_MARKER'));
	});

	test('does not retain post-1.148 staging and tar watchdog behavior', () => {
		assert.ok(!source.includes('createTarStreamWatchdog'));
		assert.ok(!source.includes('waitForTarDrain'));
		assert.ok(!source.includes('.turbofile-transfer-${randomUUID()}.partial'));
	});
});
```

- [ ] **Step 2: Add same-pane drag and image-island contracts**

Add assertions that the drag source permits an internal move while folder rows still force `move`, and that pane image state owns a retained root/disposable pair reused by `renderImageGridPage`.

- [ ] **Step 3: Verify RED**

Run:

```powershell
npm run compile-check-ts-native
npm run gulp compile-client
node_modules\.bin\mocha.cmd --ui tdd --timeout 10000 --exit out/vs/platform/turbofile/test/common/turbofileTransfer148Baseline.test.js out/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.js out/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.js
```

Expected: the new baseline, drag-effect, and retained-image-root assertions fail for the current implementation.

---

### Task 2: Restore transfer contracts, planning, and dedicated helpers

**Files:**
- Modify: `src/vs/platform/turbofile/common/turbofile.ts`
- Restore: `src/vs/platform/turbofile/common/turbofileTransferPlan.ts`
- Restore: `src/vs/platform/turbofile/common/turbofileRemoteNativeBatchPlan.ts`
- Restore: `src/vs/platform/turbofile/common/turbofileTimeout.ts`
- Delete: `src/vs/platform/turbofile/common/turbofileTransferConflictPolicy.ts`
- Delete: `src/vs/platform/turbofile/common/turbofileTarProgress.ts`
- Delete: `src/vs/platform/turbofile/common/turbofileWindowsClipboard.ts`
- Delete: `src/vs/workbench/contrib/turbofile/common/turbofileTransferRefresh.ts`
- Restore/Delete corresponding transfer-only tests to match `v1.148.0`.

**Interfaces:**
- Consumes: exact files and exported transfer types at `v1.148.0`.
- Produces: the 1.148 request/result, plan, route, timeout, batch, clipboard, and drag contracts required by renderer and main service restoration.

- [ ] **Step 1: Restore transfer-only tracked files from the tag**

Use the exact `v1.148.0:<path>` contents for the transfer plan, native batch plan, timeout module, and their baseline tests. Remove post-tag files whose sole purpose is post-1.148 transfer behavior.

- [ ] **Step 2: Restore only transfer declarations in `turbofile.ts`**

Replace transfer request/result, batch transfer, progress, clipboard, Windows drag, strategy, and route declarations with their tag definitions. Preserve current non-transfer directory, image, device, and document interfaces.

- [ ] **Step 3: Remove imports of deleted transfer helpers**

Update direct importers so no source references conflict policy, tar progress parsing, Windows clipboard identity helpers, or transfer refresh helpers.

- [ ] **Step 4: Typecheck the restored contract layer**

Run: `npm run compile-check-ts-native`

Expected: remaining errors identify only main-service or renderer call sites that still use post-baseline transfer contracts; no errors originate inside the restored common transfer files.

---

### Task 3: Restore Electron-main transfer execution to 1.148.0

**Files:**
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Restore: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- Restore: transfer-related sections in `src/vs/platform/turbofile/test/common/turbofileTransferPlan.test.ts`

**Interfaces:**
- Consumes: Task 2's 1.148 transfer contracts.
- Produces: exact 1.148 local/SSH, SSH/local, SSH/SSH, single, batch, tar, scp, rsync, sftp, cancellation, route, progress, and completion execution.

- [ ] **Step 1: Restore transfer service fields and public methods**

Transplant the tag implementations of `transfer`, `transferBatch`, cancellation, progress emission, clipboard transfer, Windows file drag, and transfer cache methods. Retain current directory listing/session generation, image metadata, thumbnail, device, archive, terminal, and document-support methods.

- [ ] **Step 2: Restore protocol implementations**

Transplant every 1.148 transfer implementation and direct helper it calls: local copy, native remote copy/move, scp, rsync, sftp, local tar upload/download, SSH direct tar, SSH relay tar, and batch variants.

- [ ] **Step 3: Restore exact command builders and process pipelines**

Restore the tag command strings, `pipeline(...)` topology, `PassThrough` behavior, buffering, process close ordering, parallel chunking, zstd behavior, route choice, and cleanup. Remove `dd` progress relay, tar lifecycle watchdog, drain timeout, staging commit, post-tag conflict preflight, and unknown-total logic.

- [ ] **Step 4: Preserve non-transfer service additions**

Verify that remote directory retry/generation, SFTP session generation, image metadata batching, archive extraction, preview streaming, terminal support, and device operations still match the pre-restoration current source.

- [ ] **Step 5: Typecheck before tests**

Run: `npm run compile-check-ts-native`

Expected: zero main-service errors; any remaining errors are renderer transfer call sites handled by Task 4.

---

### Task 4: Restore renderer transfer orchestration without reverting unrelated UI

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/common/turbofileEditorInput.ts`
- Restore: `src/vs/workbench/contrib/turbofile/common/turbofileDragDrop.ts`
- Restore: `src/vs/workbench/contrib/turbofile/common/turbofileTransferDisplay.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/media/turbofile.css`
- Restore/delete transfer-only renderer tests to match tag behavior.

**Interfaces:**
- Consumes: Tasks 2-3's exact 1.148 transfer API.
- Produces: the 1.148 transfer initiation, progress, retry, cancel, clipboard, drag, task aggregation, and status display behavior inside the current editor UI shell.

- [ ] **Step 1: Restore renderer transfer state and execution methods**

At symbol boundaries, transplant tag implementations for transfer task creation/update, `transferSelected`, batch transfer, `transferItem`, `transferExternalPaths`, clipboard copy/paste, Windows drag handoff, cancel/retry, progress aggregation, route display, and post-transfer refresh. Preserve current file sorting, directory loading, image grid, document opening, tab, terminal, and settings implementations.

- [ ] **Step 2: Restore transfer-mode state and UI to baseline**

Remove post-1.148 per-side drag-operation persistence, controls, styles, and execution branches when absent from the tag. Keep toolbar layout and unrelated visual changes intact.

- [ ] **Step 3: Restore baseline transfer display helpers and tests**

Replace transfer display behavior with the tag version and remove tests that only assert post-tag total-size, staging, conflict, or completion behavior.

- [ ] **Step 4: Typecheck before tests**

Run: `npm run compile-check-ts-native`

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 5: Run baseline transfer tests**

Run `npm run gulp compile-client`, then the transfer-plan, main-service static, transfer-display, clipboard, Windows drag, and drag-drop suites.

Expected: all retained 1.148 baseline tests and the new baseline source contract pass.

---

### Task 5: Restore reliable same-pane folder and parent moves

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/common/turbofileDragDrop.ts` only if a pure resolver is required by the baseline structure.
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`

**Interfaces:**
- Consumes: restored 1.148 drag behavior.
- Produces: an internal drag effect compatible with both cross-pane baseline operations and forced same-pane move targets.

- [ ] **Step 1: Confirm the drag regression remains RED after baseline restoration**

Run typecheck, compile client, and `turbofileDragDrop.test.js`.

Expected: the default-mode same-pane move contract fails if the restored source still restricts `effectAllowed` to copy.

- [ ] **Step 2: Permit internal same-pane moves at drag start**

Set the internal browser drag's allowed effects so a folder row can legally select `dropEffect = 'move'`. Keep external Windows drag and cross-pane behavior on their restored 1.148 paths.

- [ ] **Step 3: Keep same-pane targets fixed to move**

Ensure folder and `..` handlers validate current-page source, reject no-op/self/descendant targets, consume the event before page/window handlers, snapshot the selection, and invoke native rename/move without consulting pane copy/cut mode.

- [ ] **Step 4: Verify GREEN**

Run typecheck, compile client, and the drag-drop suite.

Expected: default and cut modes both permit same-pane folder/parent moves; invalid targets remain rejected.

---

### Task 6: Retain independent pane-image DOM islands

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`

**Interfaces:**
- Consumes: `TurboFileImageGridState` and current pane-mode image renderer.
- Produces: per-state retained root/disposable ownership and explicit invalidation only for same-side image mutations.

- [ ] **Step 1: Confirm the cross-pane image test is RED**

Run typecheck, compile client, and `turbofileImageGridPane.test.js`.

Expected: source lacks a retained pane-image root and independent disposable store.

- [ ] **Step 2: Add retained DOM ownership**

Extend pane image state with an optional retained root and `DisposableStore`. When `renderImageGridPage` receives an unchanged pane-mode state with a retained root, return the same root; register sort/scale window listeners in the state-owned store rather than the global render store.

- [ ] **Step 3: Invalidate only the owning image side**

Dispose and clear the retained root when that state changes columns, scale, sort, directory, or closes. Do not invalidate it for opposite-pane navigation, selection, device, preview, task, or transfer updates.

- [ ] **Step 4: Release resources safely**

Update `releaseImageGridState` and editor disposal to dispose the state-owned listener store exactly once while preserving existing Blob URL, observer, thumbnail queue, preview render, and scroll cleanup.

- [ ] **Step 5: Verify GREEN**

Run typecheck, compile client, and image-grid pane/preview/sort suites.

Expected: the same pane image root survives opposite-side actions; same-side controls and cleanup still work.

---

### Task 7: Set version 1.151.0 and run complete verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Verify: all modified TurboFile source and tests.

**Interfaces:**
- Consumes: completed restoration and UI fixes.
- Produces: a type-safe, regression-tested 1.151.0 source tree.

- [ ] **Step 1: Update version metadata**

Change the root package version and both package-lock version fields from `1.150.0` to `1.151.0`. Do not modify dependency versions.

- [ ] **Step 2: Run fresh type and layer validation**

```powershell
npm run compile-check-ts-native
npm run valid-layers-check
```

Expected: both commands exit 0.

- [ ] **Step 3: Compile and run focused tests**

```powershell
npm run gulp compile-client
node_modules\.bin\mocha.cmd --ui tdd --timeout 10000 --exit out/vs/platform/turbofile/test/common/turbofileTransfer148Baseline.test.js out/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.js out/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.js
```

Expected: all focused tests pass.

- [ ] **Step 4: Run all TurboFile regressions and audit the diff**

```powershell
scripts\test.bat --grep TurboFile
git diff --check
```

Expected: all tests pass and no whitespace errors are reported.

- [ ] **Step 5: Audit transfer equivalence and non-transfer preservation**

Compare every restored transfer symbol against `v1.148.0`, and compare current non-transfer directory/image/document symbols against the pre-restoration working tree. Every remaining transfer difference must be a mechanical compile adapter with no data-path effect.

---

### Task 8: Build and verify the Windows x64 1.151.0 installer

**Files:**
- Generate: `.build/win32-x64/TurboFileSetup-win32-x64-1.151.0.exe`
- Generate: `.build/win32-x64/TurboFileSetup-win32-x64-1.151.0.exe.sha256`

**Interfaces:**
- Consumes: verified 1.151.0 source.
- Produces: installable Windows x64 setup and matching checksum sidecar.

- [ ] **Step 1: Build product and installer in established order**

```powershell
npx gulp vscode-win32-x64
npx gulp vscode-win32-x64-inno-updater
npx gulp vscode-win32-x64-user-setup
```

Expected: all commands exit 0 and Inno Setup creates `.build/win32-x64/user-setup/极速传Setup.exe`.

- [ ] **Step 2: Publish the versioned artifact and checksum**

```powershell
$source='.build\win32-x64\user-setup\极速传Setup.exe'
$dest='.build\win32-x64\TurboFileSetup-win32-x64-1.151.0.exe'
Copy-Item -LiteralPath $source -Destination $dest -Force
$hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $dest).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$dest.sha256" -Value "$hash  TurboFileSetup-win32-x64-1.151.0.exe" -Encoding ascii -NoNewline
```

Do not alter source files during artifact naming.

Final paths:

```text
.build/win32-x64/TurboFileSetup-win32-x64-1.151.0.exe
.build/win32-x64/TurboFileSetup-win32-x64-1.151.0.exe.sha256
```

- [ ] **Step 3: Verify the package**

Confirm source and packaged `package.json` versions are `1.151.0`, installer size is greater than zero, first two bytes are `MZ`, and the sidecar equals a fresh SHA-256 hash.

## Plan Self-Review

- Spec coverage: strict 1.148 transfer restoration, non-transfer preservation, same-pane move, pane-image isolation, versioning, and packaging each have an independent test/verification task.
- Placeholder scan: implementation steps name exact tag, files, symbols, commands, expected failures, and expected success conditions.
- Type consistency: restored contracts flow from common types to main service to renderer before UI-specific fixes and packaging.
- Scope consistency: no task restores whole mixed-responsibility files; image/document/sort/tab/package capabilities are explicitly preserved.
