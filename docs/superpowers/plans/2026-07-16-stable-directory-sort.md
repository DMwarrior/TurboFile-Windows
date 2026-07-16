# Stable Directory Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every file-pane directory first appear in its final selected sort order without visible lazy-metadata re-sorting.

**Architecture:** Restore complete one-round-trip remote listings for foreground navigation while retaining names-only bounded background prefetch. Add a pure display-readiness predicate shared by cache, snapshot, navigation, and sort-change paths, and prevent visible-row enrichment from changing order for attribute-dependent sorts.

**Tech Stack:** TypeScript, VS Code workbench renderer, Electron main SSH service contract, Mocha TDD tests.

## Global Constraints

- Name, type, modified-time, and size sorting must be correct on the first visible frame.
- Ascending and descending directions must both be correct.
- Do not add loading text, skeletons, animation, transitions, or other waiting effects.
- Foreground remote metadata must use one full-list command, not per-entry SSH stat requests.
- Idle neighbor prefetch remains names-only and bounded.
- Parent-entry and directory-first grouping remain unchanged.
- Preserve unrelated dirty changes in the current `codex/image-stream-loading` branch.

---

### Task 1: Lock all sort modes and display readiness with tests

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/common/turbofileFileSort.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileFileSort.test.ts`

**Interfaces:**
- Produces: `turboFileSortNeedsAttributes(key: TurboFileSortKey): boolean`.
- Produces: `isTurboFileListingReadyForSort(items, key): boolean`.

- [ ] **Step 1: Add complete sort characterization and failing readiness tests**

Extend `TurboFileSortableItem` with `readonly attrsPending?: boolean`, import the two planned helpers in the test, and assert:

```ts
assert.deepStrictEqual([
	names('name', 'descending'),
	names('modified', 'descending'),
	names('size', 'ascending'),
	names('type', 'descending')
], [
	['..', 'docs', 'zeta.txt', 'beta.txt', 'alpha.png'],
	['..', 'docs', 'beta.txt', 'zeta.txt', 'alpha.png'],
	['..', 'docs', 'zeta.txt', 'beta.txt', 'alpha.png'],
	['..', 'docs', 'beta.txt', 'zeta.txt', 'alpha.png']
]);

assert.strictEqual(turboFileSortNeedsAttributes('modified'), true);
assert.strictEqual(turboFileSortNeedsAttributes('size'), true);
assert.strictEqual(turboFileSortNeedsAttributes('name'), false);
assert.strictEqual(isTurboFileListingReadyForSort([item('pending', { attrsPending: true })], 'modified'), false);
assert.strictEqual(isTurboFileListingReadyForSort([item('pending', { attrsPending: true })], 'name'), true);
```

- [ ] **Step 2: Run the mandatory type-check and compile client output**

Run: `npm run compile-check-ts-native`

Expected: FAIL only because the planned helper exports do not exist yet.

- [ ] **Step 3: Implement the minimal pure helpers**

Add:

```ts
export function turboFileSortNeedsAttributes(key: TurboFileSortKey): boolean {
	return key === 'modified' || key === 'size';
}

export function isTurboFileListingReadyForSort(items: readonly TurboFileSortableItem[], key: TurboFileSortKey): boolean {
	return !turboFileSortNeedsAttributes(key) || !items.some(item => !item.parent && item.attrsPending);
}
```

- [ ] **Step 4: Compile and run the focused sort suite**

Run `npm run compile-check-ts-native`, `npm run gulp compile-client`, then:

`node_modules\.bin\mocha.cmd --ui tdd --timeout 10000 --exit out/vs/workbench/contrib/turbofile/test/common/turbofileFileSort.test.js`

Expected: all commands exit 0 and all sort tests pass.

---

### Task 2: Prevent partial foreground listings and enrichment re-sorts

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDirectoryNavigation.test.ts`

**Interfaces:**
- Consumes: `turboFileSortNeedsAttributes` and `isTurboFileListingReadyForSort` from Task 1.
- Produces: `paneListingSatisfiesSort(side, items)` as the renderer's single display gate.

- [ ] **Step 1: Add failing source regression tests**

Add assertions that:

```ts
const load = methodBlock(source, 'private async loadPaneDirectory', 'private async recoverMissingPanePath');
assert.ok(load.includes("const loadsAttributes = needsAttributes || (isRemote && purpose === 'foreground');"));
assert.ok(load.includes('? await this.sshService.listRemoteDirectory('));
assert.ok(load.includes(': await this.sshService.listRemoteDirectoryNames('));

const enrich = methodBlock(source, 'private async enrichVisibleRows', 'private scheduleVisibleRowEnrichmentRetry');
assert.ok(enrich.includes('if (this.paneSortNeedsAttributes(side))'));
assert.ok(!enrich.includes('state.items = this.sortPaneItems(side, state.items);'));

const setDevice = methodBlock(source, 'private setPaneDevice', 'private capturePaneSelectionForCurrentPage');
assert.ok(setDevice.includes('this.paneListingSatisfiesSort(side, snapshot.items)'));
assert.ok(setDevice.includes('this.paneDirectoryEntrySatisfiesSort(side, cached)'));
```

Also assert direct hover/commit prefetch passes `this.paneSortNeedsAttributes(side)`, while `prefetchNeighborDirectories` retains the default names-only call.

- [ ] **Step 2: Compile and verify RED**

Run the mandatory type-check, compile client output, and focused `TurboFileDirectoryNavigation` suite.

Expected: the new source regression test fails because foreground remote loading and restoration are not yet centrally gated.

- [ ] **Step 3: Add the central readiness gate**

Import the two helpers and implement:

```ts
private paneListingSatisfiesSort(side: 'left' | 'right', items: readonly TurboFileFileItem[]): boolean {
	return isTurboFileListingReadyForSort(items, this.paneStates[side].sortKey);
}

private paneDirectoryEntrySatisfiesSort(side: 'left' | 'right', entry: TurboFileDirectoryCacheEntry): boolean {
	return this.paneListingSatisfiesSort(side, entry.items);
}
```

Use the gate before applying cached or snapshotted items in `navigatePaneDirectory`, `loadPaneDirectory`, and `setPaneDevice`.

- [ ] **Step 4: Restore full remote foreground loading**

Inside `loadPaneDirectory`, compute:

```ts
const isRemote = device.id !== LOCAL_WINDOWS_DEVICE_ID;
const loadsAttributes = needsAttributes || (isRemote && purpose === 'foreground');
```

Use `loadsAttributes` for cache/in-flight reuse, the remote full-vs-names request, the local full-vs-names request, and `attrsPending` marking. This makes every remote foreground load complete while keeping background neighbor prefetch names-only.

- [ ] **Step 5: Make direct prefetch sort-aware**

Pass `this.paneSortNeedsAttributes(side)` through `prefetchPaneDirectoryNow` and prioritized hover prefetch. Leave `prefetchNeighborDirectories` calls at the default `false` so idle neighbor work stays lightweight.

- [ ] **Step 6: Block lazy re-sorting for attribute sorts**

Return before visible-row enrichment when `paneSortNeedsAttributes(side)` is true. Remove the modified/size branch that assigns sorted items inside `enrichVisibleRows`; name/type enrichment may update displayed metadata in place but cannot change order.

- [ ] **Step 7: Compile and verify GREEN**

Run `npm run compile-check-ts-native`, `npm run gulp compile-client`, and the focused sort and directory-navigation suites.

Expected: all commands exit 0 with zero failures.

---

### Task 3: Verify regression coverage and performance invariants

**Files:**
- Verify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Verify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`

- [ ] **Step 1: Run all TurboFile tests**

Run: `scripts\test.bat --grep TurboFile`

Expected: all TurboFile tests pass with zero failures.

- [ ] **Step 2: Audit no per-entry foreground SSH stat loop was introduced**

Confirm foreground remote loading calls `listRemoteDirectory`, whose fast command returns name, type, size, and modified time in one command. Confirm no new loop calls `statRemoteEntries` for every item before first render.

- [ ] **Step 3: Audit UI and diff constraints**

Run `git diff --check` and inspect the targeted diffs. Confirm no loading text, animation, CSS, transfer, image-grid, or toolbar-order changes were introduced.

