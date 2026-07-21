# Compact Drag Mode Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wide copy/cut toolbar control with a standard-size icon whose complete Chinese label is drawn inside one small colored frame.

**Architecture:** Keep the existing per-pane operation state and click handler unchanged. Replace only the button's child markup and CSS presentation, using one text badge inside the existing `24×24px` toolbar button.

**Tech Stack:** TypeScript DOM helpers, CSS theme variables, Mocha static regression tests.

## Global Constraints

- The outer button is `24×24px` and has no border or persistent selected outline.
- The inner frame contains the complete text “复制” or “剪切”.
- Copy uses bright cyan-green; cut uses bright red.
- Left and right pane states remain independent and default to copy.
- Transfer behavior and source-deletion safety are unchanged.
- Preserve all unrelated dirty-worktree changes.
- Run `npm run compile-check-ts-native` before tests; never run `npm run compile`.

---

### Task 1: Compact Mode Badge

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts:7441-7460`
- Modify: `src/vs/workbench/contrib/turbofile/browser/media/turbofile.css:2016-2047,5285-5297`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts:108-135`

**Interfaces:**
- Consumes: `TurboFileEditorInput.toggleDragOperation(side)` and existing localized copy/cut labels.
- Produces: `.turbofile-drag-operation-icon`, a single inner badge element.

- [ ] **Step 1: Write the failing markup and CSS assertions**

```ts
const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');
assert.deepStrictEqual({
	usesSingleBadge: appendButton.includes("$('span.turbofile-drag-operation-icon', undefined, label)"),
	removesSeparateIcon: !appendButton.includes('renderTurboFileIcon('),
	removesSeparateLabel: !appendButton.includes('turbofile-drag-operation-label'),
	standardButtonWidth: css.includes('width: 24px;') && css.includes('min-width: 24px;'),
	innerFrame: css.includes('.turbofile-drag-operation-icon') && css.includes('border: 1px solid currentColor;'),
	copyColor: css.includes('var(--vscode-terminal-ansiBrightCyan, var(--vscode-charts-cyan))'),
	moveColor: css.includes('var(--vscode-terminal-ansiBrightRed, var(--vscode-charts-red))'),
	removesWideButton: !css.includes('min-width: 52px;')
}, {
	usesSingleBadge: true,
	removesSeparateIcon: true,
	removesSeparateLabel: true,
	standardButtonWidth: true,
	innerFrame: true,
	copyColor: true,
	moveColor: true,
	removesWideButton: true
});
```

- [ ] **Step 2: Verify the assertions fail against the current wide control**

Run a PowerShell source assertion matching Step 1.

Expected: FAIL because the button still contains a separate icon and `min-width: 52px`.

- [ ] **Step 3: Replace the two children with one badge**

```ts
button.appendChild($('span.turbofile-drag-operation-icon', undefined, label));
```

Keep the existing title, aria label, click handler, side argument, and operation toggle unchanged.

- [ ] **Step 4: Replace the wide-button CSS**

```css
.turbofile-toolbar-button.turbofile-drag-operation-button {
	width: 24px;
	min-width: 24px;
	height: 24px;
	padding: 0;
	border: 0;
	background: transparent;
	box-shadow: none;
}

.turbofile-drag-operation-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 18px;
	box-sizing: border-box;
	border: 1px solid currentColor;
	border-radius: 2px;
	font-size: 10px;
	font-weight: 600;
	line-height: 1;
	white-space: nowrap;
}

.turbofile-drag-operation-button.is-copy {
	color: var(--vscode-terminal-ansiBrightCyan, var(--vscode-charts-cyan));
}

.turbofile-drag-operation-button.is-move {
	color: var(--vscode-terminal-ansiBrightRed, var(--vscode-charts-red));
}
```

Remove the light-theme outer-border override and keep `border: 0` on the outer button. Preserve ordinary toolbar hover behavior.

- [ ] **Step 5: Run the mandatory type-check**

Run: `npm run compile-check-ts-native`

Expected: PASS.

- [ ] **Step 6: Refresh generated test output and run TurboFile tests**

Run: `node build/next/index.ts transpile`

Run: `scripts\test.bat --grep TurboFile` with `VSCODE_SKIP_PRELAUNCH=1` when a local Electron runtime is available.

Expected: all TurboFile tests pass, including the compact badge assertions.

- [ ] **Step 7: Inspect the scoped diff**

Run: `git diff --check -- src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts src/vs/workbench/contrib/turbofile/browser/media/turbofile.css src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`

Expected: no whitespace errors and no transfer-logic changes.
