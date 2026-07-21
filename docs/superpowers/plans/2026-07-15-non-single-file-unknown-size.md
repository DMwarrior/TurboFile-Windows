# Non-Single-File Unknown Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every directory or multi-item transfer starts without recursive size scans while preserving known size for exactly one ordinary file.

**Architecture:** Keep the existing transfer protocols and progress event contract. Decide whether a total is known from item cardinality and source type, report real streamed bytes when available, and leave `totalBytes` at zero when no reliable byte stream exists; remove the local and same-SSH directory scan call sites rather than weakening the shared scan helpers used elsewhere.

**Tech Stack:** TypeScript, VS Code IPC services, Node.js filesystem/streams, Mocha TDD tests.

## Global Constraints

- Only an operation containing exactly one ordinary file may expose a known total size.
- Any directory or any multi-item operation must keep `totalBytes = 0` before and during transfer.
- No source or target recursive size scan may be added before, during, or after tar or same-device transfer.
- Real bytes from an existing stream may still drive transferred size and speed.
- Do not change copy commands, tar buffers, concurrency, cancellation, conflict handling, or source-deletion safety.
- Work in the current dirty `codex/image-stream-loading` worktree; do not stage or commit unrelated files.

---

### Task 1: Lock the no-scan same-device policy with regression tests

**Files:**
- Modify: `src/vs/platform/turbofile/test/common/turbofileSameDeviceMergeStatic.test.ts`
- Verify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`

**Interfaces:**
- Consumes: `transferFile`, `trySameRemoteCopy`, and `execRemoteCopyWithProgress` source blocks.
- Produces: static regression assertions that reject recursive directory size and target-growth scans.

- [x] **Step 1: Replace the old directory-growth expectation and add local-copy assertions**

```ts
test('keeps non-single-file same-device totals unknown without recursive size scans', () => {
	const service = fs.readFileSync(servicePath(), 'utf8');
	const transferFile = service.slice(service.indexOf('async transferFile'), service.indexOf('\n\tprivate async transferBetweenSshDevices'));
	const sameRemoteCopy = methodBlock(service, 'trySameRemoteCopy');
	const remoteProgress = methodBlock(service, 'execRemoteCopyWithProgress');

	assert.ok(!transferFile.includes('getLocalPathTransferSize(request.source.path'));
	assert.ok(transferFile.includes("sourceType === 'directory' ? 0"));
	assert.ok(sameRemoteCopy.includes("const expectedBytes = sourceType === 'directory' ? 0"));
	assert.ok(/if \(sourceType === 'file' && bytes <= 0\)[\s\S]*getRemotePathSizeByCommand\(request\.source\)/.test(sameRemoteCopy));
	assert.ok(!sameRemoteCopy.includes('getRemotePathSizeByCommand(request.target)'));
	assert.ok(!remoteProgress.includes('beginRemotePathGrowthTiming'));
	assert.ok(remoteProgress.includes('beginRemoteFileGrowthTiming'));
});
```

- [x] **Step 2: Run the prerequisite type check and compile the test output**

Run: `npm run compile-check-ts-native`

Expected: exit code 0.

Run: `npm run gulp compile-client`

Expected: compilation finishes with 0 errors.

- [x] **Step 3: Run the focused test and verify RED**

Run: `node_modules\.bin\mocha.cmd --ui tdd --timeout 10000 --exit out/vs/platform/turbofile/test/common/turbofileSameDeviceMergeStatic.test.js`

Expected: FAIL because the current implementation still calls `getLocalPathTransferSize`, permits remote directory source/target scans, and starts directory-growth polling.

---

### Task 2: Remove directory size scans while preserving single-file totals

**Files:**
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts:799-821`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts:4973-5015`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts:6645-6661`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts:11272-11277`

**Interfaces:**
- Consumes: `ITurboFileTransferRequest.sourceType`, `expectedBytes`, shallow `fsp.stat`, and real `copyLocalPath` byte deltas.
- Produces: unknown totals for directories and known totals for a single ordinary file without recursive scans.

- [x] **Step 1: Make local-to-local size resolution shallow and type-aware**

Use the request source type when known and otherwise perform only one shallow `fsp.stat`:

```ts
const sourceStat = request.sourceType ? undefined : await fsp.stat(request.source.path);
const sourceType = request.sourceType ?? (sourceStat?.isDirectory() ? 'directory' : 'file');
const totalBytes = sourceType === 'directory'
	? 0
	: Math.max(0, request.expectedBytes ?? sourceStat?.size ?? 0);
```

When `totalBytes` is unknown, publish the real local stream delta without clamping to zero:

```ts
const progressBytes = totalBytes > 0 ? Math.min(transferredBytes, totalBytes) : transferredBytes;
this.fireTransferProgress(request, progressBytes, totalBytes, 'transfer', 'Copying locally.');
```

Complete with real `transferredBytes` but keep the event total unknown for a directory:

```ts
const bytes = Math.max(totalBytes, transferredBytes);
this.fireTransferProgress(request, bytes, totalBytes, 'complete', 'Local copy completed.', true);
```

- [x] **Step 2: Remove same-SSH directory source and target scans**

Keep the listing-provided total only for a file, and never repair an unknown directory total by scanning:

```ts
const expectedBytes = sourceType === 'directory' ? 0 : Math.max(0, request.expectedBytes ?? 0);
let bytes = expectedBytes;
if (sourceType === 'file' && bytes <= 0) {
	bytes = await this.getRemotePathSizeByCommand(request.source).catch(() => expectedBytes);
}
```

Remove the completion-time `getRemotePathSizeByCommand(request.target)` branch.

- [x] **Step 3: Disable remote directory growth polling for native copy**

Retain file-level monitoring only:

```ts
if (bytes > 0 && sourceType !== 'directory' && request.target.connection) {
	stopGrowthTiming = this.beginRemoteFileGrowthTiming(request.progressId, request.target.connection, request.target.path, 0, bytes, copiedBytes => {
		this.fireTransferProgress(request, copiedBytes, bytes, 'transfer', 'Remote copy in progress.');
	});
}
```

The unused `targetInitiallyExists` parameter and its directory-existence preflight should be removed from `execRemoteCopyWithProgress` and its caller because it existed only to control recursive directory polling.

- [x] **Step 4: Remove the now-unused recursive local transfer-size wrapper**

Delete `getLocalPathTransferSize`; retain `getLocalPathSize` and Windows size helpers because other explicit size features may still use them.

- [x] **Step 5: Compile and verify GREEN**

Run: `npm run compile-check-ts-native`

Expected: exit code 0.

Run: `npm run gulp compile-client`

Expected: compilation finishes with 0 errors.

Run: `node_modules\.bin\mocha.cmd --ui tdd --timeout 10000 --exit out/vs/platform/turbofile/test/common/turbofileSameDeviceMergeStatic.test.js out/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.js`

Expected: all tests pass.

---

### Task 3: Verify protocol-wide unknown-total behavior

**Files:**
- Verify: `src/vs/platform/turbofile/test/common/turbofileTransferPlan.test.ts`
- Verify: `src/vs/platform/turbofile/test/common/turbofileTarProgress.test.ts`
- Verify: `src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts`
- Verify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`

**Interfaces:**
- Consumes: progress events with real `transferredBytes` and unknown `totalBytes = 0`.
- Produces: evidence that tar byte reporting, batch routing, copy/cut behavior, and UI display remain intact.

- [x] **Step 1: Run the full TurboFile transfer regression set**

Run: `node_modules\.bin\mocha.cmd --ui tdd --timeout 10000 --exit out/vs/platform/turbofile/test/common/turbofileWindowsClipboard.test.js out/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.js out/vs/platform/turbofile/test/common/turbofileTimeout.test.js out/vs/platform/turbofile/test/common/turbofileTarProgress.test.js out/vs/platform/turbofile/test/common/turbofileTransferPlan.test.js out/vs/platform/turbofile/test/common/turbofileSameDeviceMergeStatic.test.js out/vs/workbench/contrib/turbofile/test/common/turbofileEditorInput.test.js out/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.js out/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.js out/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.js`

Expected: all selected tests pass with zero failures.

- [x] **Step 2: Audit the final diff**

Run: `git diff --check`

Expected: exit code 0; CRLF conversion warnings are acceptable, whitespace errors are not.

Run: `rg -n "getLocalPathTransferSize\(|getRemotePathSizeByCommand\(request\.(source|target)\)|beginRemotePathGrowthTiming" src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`

Expected: no same-device directory transfer call sites remain; unrelated explicit size or cross-device monitoring call sites may remain.

- [x] **Step 3: Leave source changes uncommitted for user testing**

Do not stage or commit implementation files because the shared worktree already contains unrelated user changes. Report modified files and verification evidence; do not package until explicitly requested.
