# Recycle Bin File Operations and Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recycle-bin rows readable, sortable, operable like normal files, fully Chinese, and visible in task progress/logs.

**Architecture:** Extend the existing per-pane recycle-bin mode with an optional, root-confined directory browsing state. Keep top-level trash metadata operations separate from ordinary payload-child operations, while reusing the existing file browser, sorting, editor, transfer, and task systems.

**Tech Stack:** TypeScript, VS Code workbench DOM/CSS, Electron IPC trash service, Mocha unit tests, Gulp client compilation.

## Global Constraints

- Preserve all unrelated dirty-worktree changes and do not commit or stage them.
- Keep native batch deletion; do not add recursive size scans or per-item SSH round trips.
- Root trash metadata must remain valid after every supported operation.
- All user-visible recycle-bin strings and hover labels must be Chinese and localized.
- Run `npm run compile-check-ts-native` before tests or client compilation.

---

### Task 1: Recycle-bin view state and sorting input

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/common/turbofileTrashView.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileTrashView.test.ts`

**Interfaces:**
- Produces: root/browse-mode helpers, root confinement checks, and trash-row sortable fields consumed by the editor.

- [ ] **Step 1: Write failing tests** for entering a trash directory, returning to the trash root, rejecting paths above the payload root, and mapping `deletedAt`, `knownSize`, type and name to deterministic sort fields.
- [ ] **Step 2: Run** `npm run compile-check-ts-native` and the focused `TurboFileTrashView` tests; confirm the new expectations fail.
- [ ] **Step 3: Implement** immutable helpers in `turbofileTrashView.ts`, keeping Windows comparisons case-insensitive and POSIX comparisons separator-aware.
- [ ] **Step 4: Re-run** typecheck and the focused tests; expect PASS.

### Task 2: Readable two-line root rows and Chinese controls

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/media/turbofile.css`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileTrashView.test.ts`

**Interfaces:**
- Consumes: root/browse-mode helpers from Task 1.
- Produces: normal 30px rows with filename, size, and deletion time; original paths remain available through the context menu.

- [ ] **Step 1: Add failing assertions** for the normal 30px trash-root row height and Chinese toolbar/title defaults.
- [ ] **Step 2: Reuse** the normal single-line file-row layout at the trash root and keep its sorting icon on the neutral toolbar foreground.
- [ ] **Step 3: Replace** recycle-bin English defaults with “回收站”“返回”“还原”“永久删除”“清空回收站”“刷新”“打开当前设备回收站”, including `aria-label`.
- [ ] **Step 4: Run** typecheck and focused tests; expect PASS.

### Task 3: Sorting and safe file operations

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/common/turbofileTrashView.ts`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileTrashView.test.ts`

**Interfaces:**
- Consumes: existing `sortTurboFileItems`, editor preview/document open functions, internal clipboard, and directory listing cache.
- Produces: immediate recycle-bin sorting and root-confined directory navigation.

- [ ] **Step 1: Add failing tests** proving all four sort keys receive the correct trash metadata and root confinement is maintained.
- [ ] **Step 2: Show** the existing pane sort control in recycle-bin mode and sort mapped rows before first render.
- [ ] **Step 3: Route** root-file double-click to existing preview/editor logic and root-directory double-click to the confined browsing state.
- [ ] **Step 4: Reuse** ordinary directory actions inside a trash payload; route root delete to permanent deletion and prevent raw root rename/move from invalidating metadata.
- [ ] **Step 5: Run** typecheck and focused tests; expect PASS.

### Task 4: Permanent-delete and empty-trash task progress/logs

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileTrashView.test.ts`

**Interfaces:**
- Consumes: `beginTask`, `updateTask`, `finishTask`, native batch trash service calls.
- Produces: `delete` tasks for permanent deletion, payload-child deletion, restore, and empty recycle bin.

- [ ] **Step 1: Add failing static assertions** that both permanent-delete and empty-trash flows begin, update, and finish a delete task.
- [ ] **Step 2: Create** each task before the native operation, update it during refresh, and finish with Chinese success/failure detail while preserving service batching.
- [ ] **Step 3: Catch** thrown errors, finish tasks as errors, and refresh the view without masking failures.
- [ ] **Step 4: Run** typecheck and focused tests; expect PASS.

### Task 5: Full verification and compilation

**Files:**
- Verify only; generated `out/` files may change through the approved client compiler.

- [ ] **Step 1: Run** `npm run compile-check-ts-native`; expect exit code 0.
- [ ] **Step 2: Run** the focused TurboFile trash/file-sort test command; expect all tests PASS.
- [ ] **Step 3: Run** `npm run gulp compile-client`; expect exit code 0.
- [ ] **Step 4: Launch** `scripts\\code.bat` with an isolated user-data directory and confirm the workbench process becomes responsive; then close only the isolated smoke-test process.
