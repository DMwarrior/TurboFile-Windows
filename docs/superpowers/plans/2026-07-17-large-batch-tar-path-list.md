# Large Batch Tar Path List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove shell argument-length limits from large tar batches without changing the archive data path or small-batch performance.

**Architecture:** Select inline arguments by UTF-8 command byte length. When unsafe, send NUL-delimited names through SSH stdin to `tar --null -T -`, and use the same manifest pattern for target preparation and post-move cleanup.

**Tech Stack:** TypeScript, Node.js child processes and streams, ssh2 channels, GNU tar, Mocha.

## Global Constraints

- Keep small-batch transfer commands and tar data streaming unchanged.
- Never delete move sources before the complete target transfer succeeds.
- Preserve unrelated dirty-worktree changes and do not commit automatically.
- Run `npm run compile-check-ts-native` before unit tests; never run `npm run compile`.

---

### Task 1: Define and test adaptive tar source plans

**Files:**
- Modify: `src/vs/platform/turbofile/common/turbofileBatchTarPlan.ts`
- Test: `src/vs/platform/turbofile/test/common/turbofileBatchTarPlan.test.ts`

**Interfaces:**
- Produces: `createRemoteBatchTarSourcePlan(parentPath, names)` returning `{ command, input? }` and `isTurboFileBatchCommandSafe(command)`.
- Consumes: Existing `createTarNullListBuffer(entries)`.

- [ ] Write failing tests proving three names stay inline, 6172 names use `tar --null -T -` with a compact command, and 100000 special-character names survive NUL encoding.
- [ ] Compile the client test output and run `TurboFileBatchTarPlan` to confirm the new tests fail for missing exports.
- [ ] Implement UTF-8 byte-length selection with a conservative 32 KiB safe command limit.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Feed manifests into SSH-to-Windows tar downloads

**Files:**
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Test: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`

**Interfaces:**
- Consumes: `createRemoteBatchTarSourcePlan`.
- Produces: Native OpenSSH and ssh2 tar-download paths that write optional manifest input while reading archive stdout.

- [ ] Add failing static assertions for optional stdin on `runNativeLocalTarDownload` and ssh2 source streams.
- [ ] Extend native download and remote exec options with optional `Uint8Array` input while retaining the no-input fast path.
- [ ] Use the adaptive source plan in `runRemoteBatchTarDownload` for both native and compatibility transports.
- [ ] Bound local target cleanup with existing batch worker concurrency.

### Task 3: Harden SSH-to-SSH tar and move cleanup

**Files:**
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Test: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`

**Interfaces:**
- Consumes: adaptive tar source plans, `createTarNullListBuffer`, and compact target-prepare command.
- Produces: constant-length large-batch direct/relay commands and stdin-driven POSIX source deletion.

- [ ] Add failing assertions that oversized direct and relay batches prepare targets separately and send manifests through stdin.
- [ ] Preserve current inline direct/relay commands when their UTF-8 byte length is safe.
- [ ] For oversized commands, run target preparation from a NUL list, then execute the same tar data pipeline with a stdin-driven source tar.
- [ ] Replace oversized POSIX `rm -rf path...` cleanup with `xargs -0 -r rm -rf --` input.

### Task 4: Verify build and stress invariants

**Files:**
- Verify: `src/vs/platform/turbofile/common/turbofileBatchTarPlan.ts`
- Verify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: compiled `out/` runtime ready for manual NAS verification.

- [ ] Run `npm run compile-check-ts-native` and require exit code 0.
- [ ] Run focused tar-plan and SSH-main-service tests with zero failures.
- [ ] Run `npm run gulp compile-client` and require zero compile errors.
- [ ] Run `git diff --check` on touched source and test files.
