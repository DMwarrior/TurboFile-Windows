# Extreme Batch Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ten-thousand-item transfers and deletes responsive and reliable without reducing the throughput of a running transfer.

**Architecture:** A cancellable multi-device scheduler prevents heavy writes from competing for the same device. Each running operation keeps streaming through tar/native commands, while path preparation, progress aggregation, and recycle-bin metadata are converted from per-item work to bounded or NUL-delimited batches.

**Tech Stack:** TypeScript, Electron main process, VS Code workbench renderer, Node child processes, OpenSSH, GNU tar/xargs, Mocha.

## Global Constraints

- Same-device heavy writes execute one at a time; operations on disjoint devices may run concurrently.
- Do not add recursive size scans or per-file network transfers.
- Preserve copy/cut semantics: source cleanup happens only after target success.
- Keep small-batch fast paths and live byte/speed/elapsed-time reporting.
- Path transport must support at least 100,000 Unicode/special-character names without command-line concatenation.
- Do not package or change the product version in this task.

---

### Task 1: Cancellable multi-device operation scheduler

**Files:**
- Create: `src/vs/platform/turbofile/common/turbofileOperationQueue.ts`
- Create: `src/vs/platform/turbofile/test/common/turbofileOperationQueue.test.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`

**Interfaces:**
- Produces `TurboFileOperationQueue.run<T>(keys, operation, options)` and `cancel(id)`.
- Service wrappers consume stable local/SSH device keys and return existing transfer/file-operation result types.

- [ ] Write tests proving same-key serialization, disjoint-key concurrency, sorted multi-key acquisition, FIFO fairness, rejection recovery, and queued cancellation.
- [ ] Run `npm run compile-check-ts-native`; expect missing module/type failures.
- [ ] Implement the queue with no timers or polling and integrate it around public heavy write operations; internal fallback calls use unscheduled core methods to avoid re-entrant deadlock.
- [ ] Re-run type checking, compile the focused test, and run its Mocha file with all cases passing.

### Task 2: Fast, bounded tar preparation and O(1) progress

**Files:**
- Modify: `src/vs/platform/turbofile/common/turbofileBatchTarPlan.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileBatchTarPlan.test.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`

**Interfaces:**
- Tar plans expose whether selected top-level items contain directories.
- Remote target preparation consumes full target paths through `createTarNullListBuffer`.
- Aggregate progress consumes scalar totals rather than reducing full arrays.

- [ ] Add failing tests for 10883 plain-file plans, a compact NUL target-cleanup command, four-stream maximum, and absence of array reductions/forced per-item progress.
- [ ] Run type checking/focused tests and verify the expected assertions fail.
- [ ] Bypass local `lstat` collection for plain-file plans, cap tar stream concurrency at 4, and replace the remote cleanup loop with `xargs -0 rm -rf --`.
- [ ] Maintain aggregate byte totals by delta and throttle item-completion progress; keep final completion forced.
- [ ] Re-run focused tests and type checking.

### Task 3: Batch recycle-bin metadata and bounded local deletion

**Files:**
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileRecycleBinInteraction.test.ts`

**Interfaces:**
- Renderer constructs all SSH trash endpoints from one resolved connection.
- POSIX trash batch input contains `id/source/payload/pending/final/metadata` NUL fields.
- Local operations use existing `mapLimit` with 16 file workers or 4 when directories are present.

- [ ] Add failing static/interaction tests proving one credential resolution, no per-item SFTP metadata loops, atomic pending/move/commit command ordering, and bounded local cleanup.
- [ ] Run focused tests and verify failures reflect the current per-item implementation.
- [ ] Reuse one connection in renderer; execute POSIX metadata+move+commit in one stdin batch; bound local trash and permanent-delete work.
- [ ] Convert Windows SSH multi-delete to a fixed command reading stdin.
- [ ] Re-run focused tests and type checking.

### Task 4: Renderer large-task hot-path and final regression

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts`

**Interfaces:**
- Batch task state stores `currentName` from progress events.
- Taskbar title uses summary state for multi-item tasks without flattening all transfer items.

- [ ] Add a failing test/static assertion for constant-time batch status-title selection.
- [ ] Implement summary-name rendering and avoid full-page render when starting a large batch.
- [ ] Run focused renderer tests.
- [ ] Run `npm run compile-check-ts-native`.
- [ ] Run all compiled TurboFile Mocha tests and record any unrelated pre-existing failures separately.
- [ ] Run `npm run gulp compile-client` and inspect the scoped diff for size scans, per-file network loops, or changed tar data paths.
