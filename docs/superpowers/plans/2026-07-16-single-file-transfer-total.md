# Single-File Transfer Total Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show `transferred / total` only for exactly one ordinary file, while every multi-item or directory transfer starts immediately and shows only real transferred bytes.

**Architecture:** Add a pure transfer-size policy that is decided once from selection cardinality and item type. Persist that policy on the renderer task so protocol changes cannot invent a total, and make live aggregation treat total bytes as optional rather than deriving them from transferred bytes. Keep all transfer commands, tar streams, buffers, concurrency, retries, cancellation, and source-deletion behavior unchanged.

**Tech Stack:** TypeScript, VS Code renderer and Electron-main transfer services, Mocha TDD tests, Gulp Windows packaging, Inno Setup.

## Global Constraints

- Exactly one ordinary file uses the file-list `rawSize` and displays `transferred / total` for every protocol.
- Multiple files, one directory, multiple directories, or mixed selections do not perform recursive size calculation and display only transferred bytes with no trailing slash.
- Multi-item and directory tasks must not infer a total from `rawSize`, progress bytes, completion bytes, or target size.
- Protocol selection and fallback must not change the size policy selected at task creation.
- Do not add file-system calls, SSH commands, polling, buffering, or work on the transfer hot path.
- Do not change transfer speed, tar piping, compression, concurrency, conflict checks, cancellation, or cut safety.
- Work in the current dirty `codex/image-stream-loading` worktree and stage only files named by each task.

---

### Task 1: Define the selection-based size policy with failing tests

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/common/turbofileTransferDisplay.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts`

**Interfaces:**
- Produces: `createTurboFileTransferSizePolicy(items)` returning `{ trackTotalBytes: boolean; totalBytes?: number }`.
- Produces: `resolveTurboFileVisibleTotalBytes(options)` returning `number | undefined` without using transferred bytes.
- Consumes: only already-loaded `{ directory, rawSize }` values; no I/O.

- [ ] **Step 1: Add failing policy tests**

Extend the test import and add these assertions:

```ts
import { chooseDisplayTransferSpeed, createTurboFileTransferSizePolicy, getVisibleTransferStartedAt, resolveTurboFileVisibleTotalBytes, shouldStartTransferTiming } from '../../common/turbofileTransferDisplay.js';

test('tracks total size only for exactly one ordinary file', () => {
	assert.deepStrictEqual(createTurboFileTransferSizePolicy([{ directory: false, rawSize: 8192 }]), {
		trackTotalBytes: true,
		totalBytes: 8192
	});
	assert.deepStrictEqual(createTurboFileTransferSizePolicy([{ directory: true, rawSize: 8192 }]), {
		trackTotalBytes: false
	});
	assert.deepStrictEqual(createTurboFileTransferSizePolicy([
		{ directory: false, rawSize: 4096 },
		{ directory: false, rawSize: 4096 }
	]), { trackTotalBytes: false });
});

test('never infers a total for multi-item or directory progress', () => {
	assert.strictEqual(resolveTurboFileVisibleTotalBytes({
		trackTotalBytes: false,
		listedTotalBytes: undefined,
		reportedTotalBytes: 1024 * 1024
	}), undefined);
	assert.strictEqual(resolveTurboFileVisibleTotalBytes({
		trackTotalBytes: true,
		listedTotalBytes: 1024,
		reportedTotalBytes: 2048
	}), 2048);
});
```

- [ ] **Step 2: Type-check and compile the new test**

Run: `npm run compile-check-ts-native`

Expected: exit code 0.

Run: `npm run gulp compile-client`

Expected: compilation completes with 0 errors.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `node_modules\.bin\mocha.cmd --ui tdd --timeout 10000 --exit out/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.js`

Expected: FAIL because `createTurboFileTransferSizePolicy` and `resolveTurboFileVisibleTotalBytes` are not implemented.

- [ ] **Step 4: Implement the minimal pure policy**

Add these interfaces and functions to `turbofileTransferDisplay.ts`:

```ts
export interface ITurboFileTransferSizeItem {
	readonly directory: boolean;
	readonly rawSize: number;
}

export interface ITurboFileTransferSizePolicy {
	readonly trackTotalBytes: boolean;
	readonly totalBytes?: number;
}

export function createTurboFileTransferSizePolicy(items: readonly ITurboFileTransferSizeItem[]): ITurboFileTransferSizePolicy {
	if (items.length !== 1 || items[0].directory) {
		return { trackTotalBytes: false };
	}
	return { trackTotalBytes: true, totalBytes: Math.max(0, items[0].rawSize) };
}

export function resolveTurboFileVisibleTotalBytes(options: {
	readonly trackTotalBytes: boolean;
	readonly listedTotalBytes: number | undefined;
	readonly reportedTotalBytes: number | undefined;
}): number | undefined {
	if (!options.trackTotalBytes) {
		return undefined;
	}
	return Math.max(0, options.listedTotalBytes ?? 0, options.reportedTotalBytes ?? 0);
}
```

- [ ] **Step 5: Recompile and verify GREEN**

Run the type-check, `compile-client`, and focused Mocha command from Steps 2-3.

Expected: all commands exit 0 and the focused suite has zero failures.

- [ ] **Step 6: Commit the policy and tests**

```powershell
git add -- src/vs/workbench/contrib/turbofile/common/turbofileTransferDisplay.ts src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts
git commit -m "fix: define single-file transfer total policy"
```

---

### Task 2: Persist the policy on transfer tasks and remove directory pre-sizing

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts`

**Interfaces:**
- Consumes: `createTurboFileTransferSizePolicy` from Task 1.
- Produces: `TurboFileTask.trackTotalBytes: boolean` and optional `totalBytes` on task and transfer items.
- Produces: `setTransferTaskItems(task, items)` as the only initializer for transfer item size policy.

- [ ] **Step 1: Add failing static integration assertions**

Add a source regression test that extracts `turbofileEditor.ts` and asserts:

```ts
assert.ok(editor.includes('private setTransferTaskItems'));
assert.ok(editor.includes('createTurboFileTransferSizePolicy(items)'));
assert.ok(!editor.includes('task.totalBytes = 0;'));
assert.ok(!editor.includes('ensureTransferItemSize('));
assert.ok(!editor.includes('Math.max(item.totalBytes, item.rawSize, item.transferredBytes, 0)'));
assert.ok(!editor.includes('transferItem.totalBytes = Math.max(result.bytes'));
```

Update the existing batch assertions in `turbofileSshMainServiceStatic.test.ts` so renderer batch requests omit `expectedBytes` instead of assigning `0`:

```ts
assert.ok(!windowsBatchBlock.includes('task.totalBytes = 0;'));
assert.ok(!windowsBatchBlock.includes('expectedBytes: 0'));
assert.ok(!batchBlock.includes('task.totalBytes = 0;'));
assert.ok(!batchBlock.includes('expectedBytes: 0'));
```

- [ ] **Step 2: Compile and verify RED**

Run `npm run compile-check-ts-native`, then `npm run gulp compile-client`, then:

`node_modules\.bin\mocha.cmd --ui tdd --timeout 10000 --exit out/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.js out/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.js`

Expected: FAIL because task initialization still assigns totals per item, batch tasks still use zero sentinels, and directory sizing code still exists.

- [ ] **Step 3: Make total bytes optional and add one policy initializer**

Change task models:

```ts
interface TurboFileTaskTransferItem {
	// existing fields
	totalBytes?: number;
}

interface TurboFileTask {
	// existing fields
	trackTotalBytes: boolean;
	totalBytes?: number;
}
```

Initialize `trackTotalBytes: false` in `beginTask`, then add:

```ts
private setTransferTaskItems(task: TurboFileTask, items: readonly TurboFileFileItem[]): void {
	const policy = createTurboFileTransferSizePolicy(items);
	task.trackTotalBytes = policy.trackTotalBytes;
	task.totalBytes = policy.totalBytes;
	task.transferItems = items.map(item => this.createTransferTaskItem(item, policy.trackTotalBytes ? policy.totalBytes : undefined));
}
```

Change `createTransferTaskItem` to accept `totalBytes: number | undefined`, retain `rawSize` only as item metadata, and set the optional total from the parameter. Replace every direct `task.transferItems = items.map(...)` assignment with `this.setTransferTaskItems(task, items)`.

- [ ] **Step 4: Delete transfer-time directory size calculation**

Delete `ensureTransferItemSize` and all its call sites. Remove the renderer batch request fields `expectedBytes: 0` at both the item and request levels. For `transferItem`, keep expected bytes limited to the single-file policy:

```ts
const expectedBytes = options.task?.trackTotalBytes
	? Math.max(activeItem?.totalBytes ?? sourceItem.rawSize, 0)
	: 0;
```

This code reads existing memory only and adds no `stat`, SSH command, or scan.

- [ ] **Step 5: Prevent completion paths from inventing totals**

Remove every assignment shaped like:

```ts
transferItem.totalBytes = Math.max(result.bytes, transferItem.totalBytes);
```

In `finishTask`, always store `options.bytes` as `transferredBytes`, but update `task.totalBytes` only when `task.trackTotalBytes` is true:

```ts
if (options.bytes !== undefined) {
	task.transferredBytes = options.bytes;
	if (task.trackTotalBytes) {
		task.totalBytes = Math.max(task.totalBytes ?? 0, options.bytes);
	}
}
```

Do not populate an optional item total for multi-item or directory tasks.

- [ ] **Step 6: Recompile and verify GREEN**

Run the prerequisite type-check, `compile-client`, and the two-suite Mocha command from Step 2.

Expected: all commands exit 0 and both suites have zero failures.

- [ ] **Step 7: Commit renderer policy integration**

```powershell
git add -- src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts
git commit -m "fix: skip totals for directory and batch transfers"
```

---

### Task 3: Make live aggregation preserve unknown totals

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts`

**Interfaces:**
- Consumes: `resolveTurboFileVisibleTotalBytes` and `task.trackTotalBytes`.
- Produces: live aggregate `totalBytes?: number`; undefined means no denominator.

- [ ] **Step 1: Add a failing regression assertion for the original tar symptom**

Add a source assertion that the live-item total delegates to the policy and never uses transferred bytes:

```ts
const totalStart = editor.indexOf('private getLiveTransferItemTotal');
const totalEnd = editor.indexOf('\n\tprivate ', totalStart + 1);
const totalBlock = editor.slice(totalStart, totalEnd);
assert.ok(totalBlock.includes('resolveTurboFileVisibleTotalBytes'));
assert.ok(!totalBlock.includes('item.transferredBytes'));
```

Also assert the status bar has separate known and unknown formats:

```ts
assert.ok(taskbarBlock.includes('liveSummary.totalBytes !== undefined'));
assert.ok(taskbarBlock.includes('`${formatSize(liveSummary.transferredBytes)} / ${formatSize(liveSummary.totalBytes)}`'));
assert.ok(taskbarBlock.includes('formatSize(liveSummary.transferredBytes)'));
```

- [ ] **Step 2: Compile and verify RED**

Run the type-check, `compile-client`, and focused `turbofileTransferDisplay.test.js` Mocha command.

Expected: FAIL because the current aggregate promotes `transferredBytes` to `totalBytes`.

- [ ] **Step 3: Resolve totals strictly from the persisted policy**

Change `getLiveTransferItemTotal` to return `number | undefined`:

```ts
private getLiveTransferItemTotal(item: TurboFileTaskTransferItem, task: TurboFileTask): number | undefined {
	return resolveTurboFileVisibleTotalBytes({
		trackTotalBytes: task.trackTotalBytes,
		listedTotalBytes: item.totalBytes ?? (task.trackTotalBytes ? item.rawSize : undefined),
		reportedTotalBytes: item.totalBytes
	});
}
```

Change `getLiveTransferAggregate` so any running task with `trackTotalBytes === false` makes the aggregate total undefined. Continue summing `transferredBytes` and speed regardless of total availability. Calculate remaining time only for a defined positive total.

- [ ] **Step 4: Ignore protocol totals when the selection policy forbids them**

In `updateTransferProgress`, resolve the reported total through the task policy:

```ts
const totalBytes = resolveTurboFileVisibleTotalBytes({
	trackTotalBytes: task.trackTotalBytes,
	listedTotalBytes: activeItem?.totalBytes ?? task.totalBytes,
	reportedTotalBytes: event.totalBytes
});
const transferredBytes = Math.min(event.transferredBytes, totalBytes !== undefined && totalBytes > 0 ? totalBytes : event.transferredBytes);
```

Use optional-total checks for progress percentage, remaining time, completion rendering, and `task.totalBytes` assignment. A tar event containing `transferredBytes = 1.2 GB` and `totalBytes = 0` must leave the task total undefined when the source selection is a directory or batch.

- [ ] **Step 5: Render the exact requested formats**

Use:

```ts
const transferSizeText = liveSummary.totalBytes !== undefined
	? `${formatSize(liveSummary.transferredBytes)} / ${formatSize(liveSummary.totalBytes)}`
	: liveSummary.transferredBytes > 0 ? formatSize(liveSummary.transferredBytes) : '准备传输';
```

Single-file example: `1.2 GB / 8.0 GB`.

Directory or batch example: `1.2 GB` with no trailing slash.

- [ ] **Step 6: Recompile and verify GREEN**

Run the type-check, `compile-client`, and focused display suite.

Expected: all commands exit 0 and the focused suite has zero failures.

- [ ] **Step 7: Commit aggregation fix**

```powershell
git add -- src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts
git commit -m "fix: preserve unknown transfer totals in progress UI"
```

---

### Task 4: Verify all transfer paths and package version 1.150.0

**Files:**
- Verify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Verify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Generate: `.build/win32-x64/TurboFileSetup-win32-x64-1.150.0.exe`
- Generate: `.build/win32-x64/TurboFileSetup-win32-x64-1.150.0.exe.sha256`

**Interfaces:**
- Consumes: completed size policy and renderer aggregation.
- Produces: validated Windows x64 installer and SHA-256 sidecar.

- [ ] **Step 1: Run fresh TypeScript validation**

Run: `npm run compile-check-ts-native`

Expected: exit code 0 and zero TypeScript errors.

- [ ] **Step 2: Run focused and full TurboFile regressions**

Run: `npm run gulp compile-client`

Expected: compilation completes with 0 errors.

Run: `scripts\test.bat --grep TurboFile`

Expected: all TurboFile tests pass with zero failures.

- [ ] **Step 3: Audit that no pre-scan or total inference remains**

Run:

```powershell
rg -n "ensureTransferItemSize|task\.totalBytes = 0|transferItem\.totalBytes = Math\.max\(result\.bytes|Math\.max\(item\.totalBytes, item\.rawSize, item\.transferredBytes" src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts
```

Expected: no matches.

Run: `git diff --check`

Expected: exit code 0; line-ending conversion warnings are acceptable, whitespace errors are not.

- [ ] **Step 4: Build the Windows x64 product and installer**

Run in order:

```powershell
npx gulp vscode-win32-x64
npx gulp vscode-win32-x64-inno-updater
npx gulp vscode-win32-x64-user-setup
```

Expected: all three commands exit 0; Inno Setup reports a successful compile at `.build/win32-x64/user-setup/极速传Setup.exe`.

- [ ] **Step 5: Publish the local artifact name and checksum**

```powershell
$source='.build\win32-x64\user-setup\极速传Setup.exe'
$dest='.build\win32-x64\TurboFileSetup-win32-x64-1.150.0.exe'
Copy-Item -LiteralPath $source -Destination $dest -Force
$hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $dest).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$dest.sha256" -Value "$hash  TurboFileSetup-win32-x64-1.150.0.exe" -Encoding ascii -NoNewline
```

- [ ] **Step 6: Verify the final package**

Confirm source and product `package.json` versions equal `1.150.0`, the installer begins with the `MZ` header, the installer is non-empty, and the sidecar hash equals a fresh `Get-FileHash` result.

Expected: version checks match, PE header is valid, and checksum comparison is true.

---

## Plan Self-Review

- Spec coverage: single ordinary file, directory, multiple files, multiple directories, mixed selection, protocol fallback, transferred-byte display, speed preservation, completion behavior, and packaging are each covered by a task.
- Placeholder scan: no placeholder text, deferred error handling, or unnamed implementation steps remain.
- Type consistency: `trackTotalBytes`, optional `totalBytes`, `createTurboFileTransferSizePolicy`, and `resolveTurboFileVisibleTotalBytes` use the same names and signatures across all tasks.
