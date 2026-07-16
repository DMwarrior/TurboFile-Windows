# Pane Toolbar Operation-Mode Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put each pane's copy/cut drag-operation control immediately before the sort control at the left edge of the actionable toolbar buttons.

**Architecture:** Keep the shared `renderPane(side)` rendering path and swap only the two existing append calls. Verify the DOM order with a source regression test so visual order, accessibility order, and keyboard focus order cannot diverge.

**Tech Stack:** TypeScript, VS Code workbench DOM helpers, Mocha TDD tests.

## Global Constraints

- Apply to both panes through the shared `renderPane(side)` path.
- Preserve every other toolbar button's relative order.
- Do not change CSS, icon styling, copy/cut state, sorting behavior, or transfer behavior.
- Work in the explicitly requested current `codex/image-stream-loading` branch and preserve unrelated dirty changes.

---

### Task 1: Reorder the pane operation-mode and sort controls

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`

**Interfaces:**
- Consumes: existing `appendDragOperationButton(parent, side)` and `appendPaneSortButton(parent, side, iconColor)` methods.
- Produces: `renderPane(side)` DOM order with the drag-operation control before the sort control.

- [ ] **Step 1: Write the failing toolbar-order test**

Add this test inside `suite('TurboFileImageGridPane', ...)`:

```ts
test('places the pane copy-cut control before sorting in both shared pane toolbars', () => {
	const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
	const renderPane = editor.slice(editor.indexOf("private renderPane(side: 'left' | 'right')"), editor.indexOf('\n\tprivate ', editor.indexOf("private renderPane(side: 'left' | 'right')") + 1));

	assert.ok(renderPane.indexOf('this.appendDragOperationButton(toolbar, side);') < renderPane.indexOf('this.appendPaneSortButton(toolbar, side, toolbarAccent);'));
});
```

- [ ] **Step 2: Run prerequisite compilation and verify RED**

Run: `npm run compile-check-ts-native`

Expected: exit code 0.

Run: `npm run gulp compile-client`

Expected: compilation completes with 0 errors.

Run: `node_modules\.bin\mocha.cmd --ui tdd --timeout 10000 --exit out/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.js --grep "places the pane copy-cut control"`

Expected: FAIL because the sort append call currently occurs first.

- [ ] **Step 3: Swap the two append calls**

Change the toolbar construction in `renderPane` to:

```ts
this.appendDragOperationButton(toolbar, side);
this.appendPaneSortButton(toolbar, side, toolbarAccent);
```

Do not change any following append calls.

- [ ] **Step 4: Recompile and verify GREEN**

Run the TypeScript check, `compile-client`, and focused Mocha command from Step 2.

Expected: every command exits 0 and the focused test has zero failures.

- [ ] **Step 5: Run the complete TurboFile regression suite**

Run: `scripts\test.bat --grep TurboFile`

Expected: all TurboFile tests pass with zero failures.

- [ ] **Step 6: Audit the final diff**

Run: `git diff --check`

Expected: exit code 0 with no whitespace errors. Existing line-ending warnings are acceptable.

Review the `renderPane` diff and confirm only the two append calls changed order.

