# SSH Post-Transfer Directory Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent multi-item transfers and overlapping directory refreshes from leaving an SSH pane in `No response from server` by making shared sessions generation-safe, refreshing only changed panes, and rejecting stale cache writes.

**Architecture:** Keep the existing shared SSH/SFTP fast path, but associate every shared directory session and listing request with a keyed generation. Cleanup and cache writes are conditional on that generation still being current. Renderer refresh policy becomes operation-aware, and in-flight pane loads may return to their caller but may cache only while they remain the current request.

**Tech Stack:** TypeScript, VS Code workbench services, ssh2/SFTP, Mocha TDD tests, Gulp client compilation.

## Global Constraints

- Do not change transfer protocol selection or transfer data paths.
- Do not change SSH credentials or device persistence.
- Do not hide authentication, permission, missing-path, or not-a-directory errors.
- Do not include transfer cancellation changes in this implementation.
- Keep the shared SSH/SFTP directory session fast path.
- Use tabs in TypeScript sources and follow the repository's existing imports and test style.

---

### Task 1: Generation-Safe Shared Directory Sessions

**Files:**
- Create: `src/vs/platform/turbofile/common/turbofileKeyedGeneration.ts`
- Create: `src/vs/platform/turbofile/test/common/turbofileKeyedGeneration.test.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts:219-224,403-406,591-625,5665-5764,6036-6064,6553-6591`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts:11-24`

**Interfaces:**
- Produces: `TurboFileKeyedGeneration.next(key): number`, `current(key): number | undefined`, `isCurrent(key, generation): boolean`, and `clearIfCurrent(key, generation): boolean`.
- Produces: `IRemoteDirectorySftpSession.generation: number`.
- Consumes: Existing directory session key, session promise map, and idle timer map.

- [ ] **Step 1: Write the failing generation tests**

```ts
suite('TurboFileKeyedGeneration', () => {
	test('does not clear a replacement generation from a stale request', () => {
		const generations = new TurboFileKeyedGeneration();
		const first = generations.next('64');
		const replacement = generations.next('64');

		assert.strictEqual(generations.clearIfCurrent('64', first), false);
		assert.strictEqual(generations.current('64'), replacement);
	});

	test('clears only the current generation', () => {
		const generations = new TurboFileKeyedGeneration();
		const current = generations.next('64');

		assert.strictEqual(generations.clearIfCurrent('64', current), true);
		assert.strictEqual(generations.current('64'), undefined);
	});
});
```

Replace the obsolete fresh-client static assertion with assertions that the service disposes and touches a specific session generation:

```ts
assert.ok(service.includes('this.disposeDirectorySftpSession(session.key, session.generation)'));
assert.ok(service.includes('this.touchDirectorySftpSession(session.key, session.generation)'));
assert.ok(service.includes('generation: number;'));
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm run compile-check-ts-native -- --pretty false
```

Expected: FAIL because `turbofileKeyedGeneration.js` does not exist yet.

- [ ] **Step 3: Implement the keyed generation helper**

```ts
export class TurboFileKeyedGeneration {
	private sequence = 0;
	private readonly currentByKey = new Map<string, number>();

	next(key: string): number {
		const generation = ++this.sequence;
		this.currentByKey.set(key, generation);
		return generation;
	}

	current(key: string): number | undefined {
		return this.currentByKey.get(key);
	}

	isCurrent(key: string, generation: number): boolean {
		return this.currentByKey.get(key) === generation;
	}

	clearIfCurrent(key: string, generation: number): boolean {
		if (!this.isCurrent(key, generation)) {
			return false;
		}
		this.currentByKey.delete(key);
		return true;
	}
}
```

- [ ] **Step 4: Make session creation, failure, close callbacks, idle timers, and explicit disposal generation-aware**

Add `generation` to every `IRemoteDirectorySftpSession`. Allocate it before creating the session promise. Change cleanup to:

```ts
private disposeDirectorySftpSession(key: string, generation: number): void {
	if (!this.directorySftpSessionGenerations.clearIfCurrent(key, generation)) {
		return;
	}
	const sessionPromise = this.directorySftpSessions.get(key);
	this.directorySftpSessions.delete(key);
	this.clearDirectorySftpIdleTimer(key);
	// Existing best-effort SFTP/client close body remains unchanged.
}
```

Pass `session.generation` from list, stat, `withDirectorySftp`, `withDirectorySshClient`, transfer growth monitoring, and every `touchDirectorySftpSession` call. Close/error callbacks call `clearIfCurrent` before removing the map entry or timer.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npm run compile-check-ts-native -- --pretty false
npm run gulp compile-client
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileKeyedGeneration.test.ts
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts
```

Expected: compile commands exit 0; generation tests pass; SSH static suite no longer contains the obsolete fresh-client failure.

- [ ] **Step 6: Commit**

```powershell
git add src/vs/platform/turbofile/common/turbofileKeyedGeneration.ts src/vs/platform/turbofile/test/common/turbofileKeyedGeneration.test.ts src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts out/vs/platform/turbofile/electron-main/turbofileSshMainService.js
git commit -m "Protect replacement SSH directory sessions"
```

### Task 2: Bounded Recovery for Transient Directory Reads

**Files:**
- Modify: `src/vs/platform/turbofile/common/turbofileRemoteDirectoryRetry.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileRemoteDirectoryRetry.test.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts:607-624`

**Interfaces:**
- Produces: `REMOTE_DIRECTORY_READ_MAX_ATTEMPTS` with value `3`.
- Produces: `getRemoteDirectoryRetryDelayMs(failedAttemptIndex): number | undefined`, returning `100`, `250`, then `undefined`.
- Consumes: `shouldRetryRemoteDirectoryRead(error)` and existing `delay(milliseconds)`.

- [ ] **Step 1: Add failing retry policy tests**

```ts
assert.strictEqual(REMOTE_DIRECTORY_READ_MAX_ATTEMPTS, 3);
assert.strictEqual(getRemoteDirectoryRetryDelayMs(0), 100);
assert.strictEqual(getRemoteDirectoryRetryDelayMs(1), 250);
assert.strictEqual(getRemoteDirectoryRetryDelayMs(2), undefined);
assert.strictEqual(shouldRetryRemoteDirectoryRead(new Error('Permission denied')), false);
```

- [ ] **Step 2: Run the retry test and verify RED**

Run:

```powershell
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileRemoteDirectoryRetry.test.ts
```

Expected: FAIL because the max-attempt and delay exports are missing.

- [ ] **Step 3: Implement bounded retry policy and service loop**

```ts
export const REMOTE_DIRECTORY_READ_MAX_ATTEMPTS = 3;
const retryDelays = [100, 250] as const;

export function getRemoteDirectoryRetryDelayMs(failedAttemptIndex: number): number | undefined {
	return retryDelays[failedAttemptIndex];
}
```

The service loop disposes only `session.generation`, retries only transient errors, and waits the configured delay before the next attempt. Non-retryable errors throw immediately.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm run compile-check-ts-native -- --pretty false
npm run gulp compile-client
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileRemoteDirectoryRetry.test.ts
```

Expected: all commands exit 0 and the retry suite passes.

- [ ] **Step 5: Commit**

```powershell
git add src/vs/platform/turbofile/common/turbofileRemoteDirectoryRetry.ts src/vs/platform/turbofile/test/common/turbofileRemoteDirectoryRetry.test.ts src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts out/vs/platform/turbofile/electron-main/turbofileSshMainService.js
git commit -m "Retry transient SSH directory disconnects"
```

### Task 3: Operation-Aware Post-Transfer Pane Refresh

**Files:**
- Create: `src/vs/workbench/contrib/turbofile/common/turbofileTransferRefresh.ts`
- Create: `src/vs/workbench/contrib/turbofile/test/common/turbofileTransferRefresh.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts:9283-9287,9446-9450`

**Interfaces:**
- Produces: `getTurboFilePostTransferRefreshBatches(operation, sourceSide, targetSide, sameDevice): readonly (readonly TurboFilePaneSide[])[]`.
- Consumes: Existing `isSameDeviceForNativeOperation`, `refreshPane`, and transfer operation.

- [ ] **Step 1: Write failing refresh policy tests**

```ts
assert.deepStrictEqual(getTurboFilePostTransferRefreshBatches('copy', 'left', 'right', true), [['right']]);
assert.deepStrictEqual(getTurboFilePostTransferRefreshBatches('move', 'left', 'right', true), [['left'], ['right']]);
assert.deepStrictEqual(getTurboFilePostTransferRefreshBatches('move', 'left', 'right', false), [['left', 'right']]);
```

- [ ] **Step 2: Run compile check and verify RED**

Run:

```powershell
npm run compile-check-ts-native -- --pretty false
```

Expected: FAIL because `turbofileTransferRefresh.js` does not exist.

- [ ] **Step 3: Implement the pure refresh policy**

```ts
export type TurboFilePaneSide = 'left' | 'right';

export function getTurboFilePostTransferRefreshBatches(operation: 'copy' | 'move', sourceSide: TurboFilePaneSide, targetSide: TurboFilePaneSide, sameDevice: boolean): readonly (readonly TurboFilePaneSide[])[] {
	if (operation === 'copy' || sourceSide === targetSide) {
		return [[targetSide]];
	}
	return sameDevice ? [[sourceSide], [targetSide]] : [[sourceSide, targetSide]];
}
```

- [ ] **Step 4: Route editor refreshes through the policy**

Add:

```ts
private async refreshTransferPanesAfterOperation(operation: 'copy' | 'move', sourceSide: 'left' | 'right', targetSide: 'left' | 'right', sourceDevice: TurboFileDevice, targetDevice: TurboFileDevice): Promise<void> {
	const batches = getTurboFilePostTransferRefreshBatches(operation, sourceSide, targetSide, this.isSameDeviceForNativeOperation(sourceDevice, targetDevice));
	for (const batch of batches) {
		await Promise.all(batch.map(side => this.refreshPane(side, { force: true })));
	}
}
```

Use it after single-item copy and batch copy/move. A copy no longer refreshes its unchanged source pane.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npm run compile-check-ts-native -- --pretty false
npm run gulp compile-client
npm run test-node -- --run src/vs/workbench/contrib/turbofile/test/common/turbofileTransferRefresh.test.ts
```

Expected: compile commands exit 0 and all refresh-policy cases pass.

- [ ] **Step 6: Commit**

```powershell
git add src/vs/workbench/contrib/turbofile/common/turbofileTransferRefresh.ts src/vs/workbench/contrib/turbofile/test/common/turbofileTransferRefresh.test.ts src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts out/vs/workbench/contrib/turbofile/browser/turbofileEditor.js
git commit -m "Refresh only changed transfer panes"
```

### Task 4: Reject Stale Directory Cache Writes

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/common/turbofileDirectoryInflight.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDirectoryInflight.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts:7688-7752`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts:591-643,5802-5827`

**Interfaces:**
- Produces: `TurboFileDirectoryInflightTracker.isCurrent(key, promise): boolean`.
- Consumes: `TurboFileKeyedGeneration` for main-process listing cache request generations.

- [ ] **Step 1: Write the failing in-flight ownership test**

```ts
const first = Promise.resolve('old');
const replacement = Promise.resolve('new');
tracker.set('64:/target', 'prefetch', first);
tracker.set('64:/target', 'foreground', replacement);
assert.strictEqual(tracker.isCurrent('64:/target', first), false);
assert.strictEqual(tracker.isCurrent('64:/target', replacement), true);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npm run test-node -- --run src/vs/workbench/contrib/turbofile/test/common/turbofileDirectoryInflight.test.ts
```

Expected: FAIL because `isCurrent` is missing.

- [ ] **Step 3: Implement renderer stale-write protection**

```ts
isCurrent(key: string, promise: Promise<T>): boolean {
	return this.entries.get(key)?.promise === promise;
}
```

In `loadPaneDirectory`, declare the promise before its async body and update `paneDirectoryCache` only when `paneDirectoryInflight.isCurrent(cacheKey, promise)` remains true. Return the listing to the original caller even when its cache write is rejected.

- [ ] **Step 4: Implement main-process listing cache generations**

Allocate a keyed generation for every uncached listing request. Pass it to `createRemoteDirectoryListingResult` and write cache entries only while that generation is current. `clearRemoteDirectoryListingCache` advances the generation before deleting each affected key, preventing an older request from repopulating it.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npm run compile-check-ts-native -- --pretty false
npm run gulp compile-client
npm run test-node -- --run src/vs/workbench/contrib/turbofile/test/common/turbofileDirectoryInflight.test.ts
npm run test-node -- --run src/vs/workbench/contrib/turbofile/test/common/turbofileDirectoryNavigation.test.ts
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts
```

Expected: compile commands exit 0 and all focused suites pass.

- [ ] **Step 6: Commit**

```powershell
git add src/vs/workbench/contrib/turbofile/common/turbofileDirectoryInflight.ts src/vs/workbench/contrib/turbofile/test/common/turbofileDirectoryInflight.test.ts src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts out/vs/workbench/contrib/turbofile/browser/turbofileEditor.js out/vs/platform/turbofile/electron-main/turbofileSshMainService.js
git commit -m "Ignore stale SSH directory listings"
```

### Task 5: Full Verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: All behavior from Tasks 1-4.

- [ ] **Step 1: Run TypeScript and client compilation**

```powershell
npm run compile-check-ts-native -- --pretty false
npm run gulp compile-client
```

Expected: both commands exit 0 and client compilation reports 0 errors.

- [ ] **Step 2: Run all focused regression suites**

```powershell
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileKeyedGeneration.test.ts
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileRemoteDirectoryRetry.test.ts
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts
npm run test-node -- --run src/vs/workbench/contrib/turbofile/test/common/turbofileTransferRefresh.test.ts
npm run test-node -- --run src/vs/workbench/contrib/turbofile/test/common/turbofileDirectoryInflight.test.ts
npm run test-node -- --run src/vs/workbench/contrib/turbofile/test/common/turbofileDirectoryNavigation.test.ts
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileTransferPlan.test.ts
```

Expected: every focused suite exits 0.

- [ ] **Step 3: Run source and Git safety checks**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only intentional tracked changes before the final commit, then a clean worktree.

- [ ] **Step 4: Exercise the reported workflow**

Run the development build, transfer multiple files, and observe target refresh behavior on a shared SSH device. Repeat the transfer and refresh sequence. Expected: copy refreshes only the target pane, stale prefetches do not replace the fresh listing, and no pane displays `No response from server` from an old-session cleanup race.
