# TurboFile Document Tab Affinity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove numeric prefixes from TurboFile page/document tabs, color each opened document with its source page color, and keep every transfer page left of every document.

**Architecture:** Add a generic transient label-class facility to `EditorInput`, then keep TurboFile-specific affinity and ordering logic in a focused browser helper. The tab renderer uses the label classes to suppress indices only for TurboFile-associated tabs, while the TurboFile editor and contribution assign colors and normalize ordering without replacing native file editor inputs.

**Tech Stack:** TypeScript, VS Code workbench editor APIs, CSS theme variables, Mocha unit tests.

## Global Constraints

- Do not change document rendering, editing, preview, save, code navigation, or editor association behavior.
- The same document reopened from another transfer page uses the most recent page color.
- Association is in-memory only and does not alter files or user settings.
- Transfer pages remain in the same editor group and always precede documents.
- Preserve all unrelated dirty-worktree changes.
- Run `npm run compile-check-ts-native` before any tests; never run `npm run compile`.

---

### Task 1: Transient Editor Label Classes

**Files:**
- Modify: `src/vs/workbench/common/editor/editorInput.ts`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileDocumentTabAffinity.test.ts`

**Interfaces:**
- Produces: `EditorInput.setLabelExtraClasses(classes: readonly string[]): void`
- Produces: existing `EditorInput.getLabelExtraClasses(): string[]` returns a defensive copy of transient classes unless overridden.

- [ ] **Step 1: Write the failing event and defensive-copy test**

```ts
class TestDocumentEditorInput extends EditorInput {
	override readonly typeId = 'test.document';

	constructor(override readonly resource = URI.file('document.txt')) {
		super();
	}
}

test('updates transient editor label classes and fires only for changes', () => {
	const input = disposables.add(new TestDocumentEditorInput());
	let changes = 0;
	disposables.add(input.onDidChangeLabel(() => changes++));
	input.setLabelExtraClasses(['turbofile-document-tab', 'turbofile-tab-color-2']);
	input.setLabelExtraClasses(['turbofile-document-tab', 'turbofile-tab-color-2']);
	const classes = input.getLabelExtraClasses();
	classes.length = 0;
	assert.deepStrictEqual([input.getLabelExtraClasses(), changes], [[
		'turbofile-document-tab',
		'turbofile-tab-color-2'
	], 1]);
});
```

- [ ] **Step 2: Run the mandatory type-check and observe the missing method**

Run: `npm run compile-check-ts-native`

Expected: FAIL because `setLabelExtraClasses` does not exist.

- [ ] **Step 3: Implement the minimal transient class API**

```ts
private labelExtraClasses: string[] = [];

getLabelExtraClasses(): string[] {
	return [...this.labelExtraClasses];
}

setLabelExtraClasses(classes: readonly string[]): void {
	if (equals(this.labelExtraClasses, classes)) {
		return;
	}
	this.labelExtraClasses = [...classes];
	this._onDidChangeLabel.fire();
}
```

Import the existing array equality helper from `vs/base/common/arrays`.

- [ ] **Step 4: Re-run type-check**

Run: `npm run compile-check-ts-native`

Expected: PASS.

### Task 2: Page-to-Document Color Affinity

**Files:**
- Create: `src/vs/workbench/contrib/turbofile/browser/turbofileDocumentTabAffinity.ts`
- Modify: `src/vs/workbench/contrib/turbofile/common/turbofileEditorInput.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/media/turbofile.css`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileDocumentTabAffinity.test.ts`

**Interfaces:**
- Produces: `TurboFileEditorInput.getTabColorSlot(): number`
- Produces: `applyTurboFileDocumentTabAffinity(document: EditorInput, source: TurboFileEditorInput): void`
- Consumes: `EditorInput.setLabelExtraClasses(classes)` from Task 1.

- [ ] **Step 1: Add failing affinity tests**

```ts
test('applies the source page color to a document and replaces previous affinity', () => {
	const document = disposables.add(new TestDocumentEditorInput());
	const first = createTransferInput(2);
	const second = createTransferInput(7);
	applyTurboFileDocumentTabAffinity(document, first);
	const firstClasses = document.getLabelExtraClasses();
	applyTurboFileDocumentTabAffinity(document, second);
	assert.deepStrictEqual([firstClasses, document.getLabelExtraClasses()], [[
		'turbofile-document-tab', 'turbofile-tab-color-1'
	], [
		'turbofile-document-tab', 'turbofile-tab-color-0'
	]]);
});
```

- [ ] **Step 2: Type-check and confirm the missing helper failure**

Run: `npm run compile-check-ts-native`

Expected: FAIL because the affinity helper and color-slot accessor do not exist.

- [ ] **Step 3: Implement color-slot and affinity helper**

```ts
export const TURBOFILE_TAB_COLOR_COUNT = 6;

getTabColorSlot(): number {
	return (this.ordinal - 1) % TURBOFILE_TAB_COLOR_COUNT;
}

override getLabelExtraClasses(): string[] {
	return ['turbofile-transfer-tab', `turbofile-tab-color-${this.getTabColorSlot()}`];
}
```

```ts
export function applyTurboFileDocumentTabAffinity(document: EditorInput, source: TurboFileEditorInput): void {
	document.setLabelExtraClasses([
		'turbofile-document-tab',
		`turbofile-tab-color-${source.getTabColorSlot()}`
	]);
}
```

- [ ] **Step 4: Apply affinity before opening a resolved native document**

In `openNativeDocument`, immediately after `resolveTextEditor`:

```ts
const sourceInput = this.currentInput;
if (!sourceInput) {
	return;
}
const fileEditor = await this.textEditorService.resolveTextEditor(editorInput);
applyTurboFileDocumentTabAffinity(fileEditor, sourceInput);
```

Do not create a replacement editor input.

- [ ] **Step 5: Generalize the six CSS selectors**

```css
.tabs-container .tab .monaco-icon-label.turbofile-tab-color-0::before {
	color: var(--vscode-charts-blue) !important;
}

.tabs-container .tab .monaco-icon-label.turbofile-tab-color-1::before {
	color: var(--vscode-charts-green) !important;
}

.tabs-container .tab .monaco-icon-label.turbofile-tab-color-2::before {
	color: var(--vscode-charts-orange) !important;
}

.tabs-container .tab .monaco-icon-label.turbofile-tab-color-3::before {
	color: var(--vscode-charts-purple) !important;
}

.tabs-container .tab .monaco-icon-label.turbofile-tab-color-4::before {
	color: var(--vscode-charts-red) !important;
}

.tabs-container .tab .monaco-icon-label.turbofile-tab-color-5::before {
	color: var(--vscode-charts-cyan) !important;
}
```

Apply the existing inactive/hover opacity behavior to both `.turbofile-transfer-tab` and `.turbofile-document-tab`.

- [ ] **Step 6: Re-run type-check**

Run: `npm run compile-check-ts-native`

Expected: PASS.

### Task 3: Remove Numeric Prefixes from Associated Tabs

**Files:**
- Modify: `src/vs/workbench/browser/parts/editor/multiEditorTabsControl.ts`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileTabPresentation.test.ts`

**Interfaces:**
- Consumes: `turbofile-transfer-tab` and `turbofile-document-tab` label classes.
- Produces: tab index prefix suppression scoped only to associated TurboFile tabs.

- [ ] **Step 1: Add a failing static presentation assertion**

```ts
test('suppresses numeric prefixes only for TurboFile-associated tabs', () => {
	const tabsSource = readFileSync(join(repoRoot, 'src/vs/workbench/browser/parts/editor/multiEditorTabsControl.ts'), 'utf8');
	assert.ok(tabsSource.includes("labelExtraClasses.includes('turbofile-transfer-tab')"));
	assert.ok(tabsSource.includes("labelExtraClasses.includes('turbofile-document-tab')"));
});
```

- [ ] **Step 2: Type-check first**

Run: `npm run compile-check-ts-native`

Expected: PASS; the new source assertion remains unrun until compilation succeeds.

- [ ] **Step 3: Reuse label classes while rendering the tab**

```ts
const labelExtraClasses = editor.getLabelExtraClasses();
const suppressTabIndex = labelExtraClasses.includes('turbofile-transfer-tab') ||
	labelExtraClasses.includes('turbofile-document-tab');
namePrefix = options.showTabIndex && !suppressTabIndex ? `${this.toEditorIndex(tabIndex) + 1}: ` : undefined;
```

Pass the same `labelExtraClasses` variable to `extraClasses` so the getter is evaluated once.

- [ ] **Step 4: Re-run type-check**

Run: `npm run compile-check-ts-native`

Expected: PASS.

### Task 4: Stable Left/Right Tab Partition

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileDocumentTabAffinity.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofile.contribution.ts`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileDocumentTabAffinity.test.ts`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileTabPresentation.test.ts`

**Interfaces:**
- Produces: `getTurboFileTransferTargetIndex(editors: readonly EditorInput[]): number`
- Produces: `getTurboFileDocumentTargetIndex(editors: readonly EditorInput[]): number`
- Produces: `ensureTurboFileTransferTabsLeft(group: IEditorGroup): void`

- [ ] **Step 1: Add failing pure ordering tests**

```ts
test('computes stable transfer and document insertion indexes', () => {
	const page1 = createTransferInput(1);
	const page2 = createTransferInput(2);
	const doc1 = disposables.add(new TestDocumentEditorInput());
	const doc2 = disposables.add(new TestDocumentEditorInput(URI.file('two.txt')));
	assert.deepStrictEqual([
		getTurboFileTransferTargetIndex([page1, doc1, doc2]),
		getTurboFileDocumentTargetIndex([page1, page2, doc1])
	], [1, 3]);
});
```

- [ ] **Step 2: Type-check and confirm missing helper failures**

Run: `npm run compile-check-ts-native`

Expected: FAIL because the ordering helpers do not exist.

- [ ] **Step 3: Implement insertion and normalization helpers**

```ts
export function getTurboFileTransferTargetIndex(editors: readonly EditorInput[]): number {
	const firstDocument = editors.findIndex(editor => !(editor instanceof TurboFileEditorInput));
	return firstDocument >= 0 ? firstDocument : editors.length;
}

export function getTurboFileDocumentTargetIndex(editors: readonly EditorInput[]): number {
	return editors.length;
}

export function ensureTurboFileTransferTabsLeft(group: IEditorGroup): void {
	const desired = [
		...group.editors.filter(editor => editor instanceof TurboFileEditorInput),
		...group.editors.filter(editor => !(editor instanceof TurboFileEditorInput))
	];
	for (let index = 0; index < desired.length; index++) {
		if (group.editors[index] !== desired[index]) {
			group.moveEditor(desired[index], group, { index });
		}
	}
}
```

- [ ] **Step 4: Open documents at the right edge and normalize afterward**

Replace the local document-index helpers in `turbofileEditor.ts` with:

```ts
index: getTurboFileDocumentTargetIndex(this.group?.editors ?? [])
```

Then call:

```ts
if (pane?.group) {
	ensureTurboFileTransferTabsLeft(pane.group);
}
```

- [ ] **Step 5: Insert new transfer pages before the first document**

For both startup and action paths:

```ts
const editors = editorService.activeEditorPane?.group.editors ?? [];
await editorService.openEditor(input, {
	pinned: true,
	index: getTurboFileTransferTargetIndex(editors)
});
```

- [ ] **Step 6: Normalize user-driven tab moves without recursion**

Inject `IEditorGroupsService`, keep a `Set<GroupIdentifier>` guard, and on `editorService.onDidEditorsChange` normalize only `EDITOR_OPEN` and `EDITOR_MOVE` events for the changed group. Remove the guard in `finally`.

- [ ] **Step 7: Run mandatory type-check**

Run: `npm run compile-check-ts-native`

Expected: PASS with no TypeScript errors.

- [ ] **Step 8: Run focused tests**

Run: `scripts\test.bat --grep "TurboFile.*Tab"`

Expected: PASS for editor-input, rename, presentation, and document-affinity tests.

- [ ] **Step 9: Run the layer check**

Run: `npm run valid-layers-check`

Expected: PASS.

- [ ] **Step 10: Inspect the final scoped diff**

Run: `git diff -- src/vs/workbench/common/editor/editorInput.ts src/vs/workbench/browser/parts/editor/multiEditorTabsControl.ts src/vs/workbench/contrib/turbofile/browser/turbofileDocumentTabAffinity.ts src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts src/vs/workbench/contrib/turbofile/browser/turbofile.contribution.ts src/vs/workbench/contrib/turbofile/browser/media/turbofile.css src/vs/workbench/contrib/turbofile/common/turbofileEditorInput.ts src/vs/workbench/contrib/turbofile/test/common/turbofileDocumentTabAffinity.test.ts src/vs/workbench/contrib/turbofile/test/common/turbofileTabPresentation.test.ts`

Expected: only the approved tab-affinity behavior plus pre-existing changes in already-dirty TurboFile files.
