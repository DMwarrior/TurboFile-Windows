# Windows Recycle Bin Icon and Delete Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package Windows-native empty/full Recycle Bin artwork and restore the previous Chinese danger confirmation for ordinary delete operations.

**Architecture:** A focused browser helper owns the two bundled PNG data URIs and maps the existing `trashHasItems` boolean to one icon. `TurboFileEditor` renders the selected icon without changing state probes or recycle-bin data flow, and ordinary delete entry points restore their previous dialog copy while continuing to call `moveUserItemsToTrash`.

**Tech Stack:** TypeScript, VS Code workbench DOM/CSS, Mocha unit tests, Windows Shell stock icon API.

## Global Constraints

- Run `npm run compile-check-ts-native` before other validation commands.
- Never run `npm run compile`; use `npm run gulp compile-client` when compiled output is required.
- Preserve the current dirty worktree and do not commit or stage unrelated user changes.
- Ordinary deletion must continue moving items to the per-device Recycle Bin.
- Do not add filesystem scans, SSH calls, or startup-time icon extraction.

---

### Task 1: Windows-native Recycle Bin icon helper

**Files:**
- Create: `src/vs/workbench/contrib/turbofile/browser/turbofileRecycleBinIcons.ts`
- Create: `src/vs/workbench/contrib/turbofile/test/common/turbofileRecycleBinIcons.test.ts`

**Interfaces:**
- Produces: `getTurboFileRecycleBinIcon(hasItems: boolean): string` returning a bundled PNG data URI.
- Consumes: the existing `trashHasItems` boolean; no service dependency.

- [ ] **Step 1: Write the failing icon test**

Test that both states return distinct `data:image/png;base64,` values, decode to the PNG signature, and have 32×32 source dimensions.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run compile-check-ts-native` followed by `scripts\test.bat --grep TurboFileRecycleBinIcons`.

Expected: the compile or test fails because the helper module does not exist.

- [ ] **Step 3: Extract and add the minimal icon helper**

Use `SHGetStockIconInfo` with stock IDs 31 and 32, encode the resulting 32×32 PNG files as data URIs, and implement:

```ts
export function getTurboFileRecycleBinIcon(hasItems: boolean): string {
	return hasItems ? TURBOFILE_RECYCLE_BIN_FULL_ICON : TURBOFILE_RECYCLE_BIN_EMPTY_ICON;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same compile and focused-test commands. Expected: PASS.

### Task 2: Render the native icon without a status badge

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/browser/media/turbofile.css`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`

**Interfaces:**
- Consumes: `getTurboFileRecycleBinIcon(state.trashHasItems)` from Task 1.
- Produces: an `<img class="turbofile-recycle-bin-icon">` inside the unchanged toolbar button.

- [ ] **Step 1: Add a failing rendering regression test**

Assert that `appendRecycleBinButton` uses the icon helper and an image element, and that the CSS no longer defines the `.is-full ...::after` orange badge.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `scripts\test.bat --grep TurboFileImageGridPane`.

Expected: FAIL because the current button still renders `Codicon.trash` and the badge CSS remains.

- [ ] **Step 3: Implement the minimal DOM and CSS change**

Import the helper, set the image `src`, set `alt` to an empty string because the button already owns the accessible label, size it to 20×20, and remove the orange badge rules.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same focused test. Expected: PASS.

### Task 3: Restore the previous ordinary-delete confirmation

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`

**Interfaces:**
- Ordinary file-list delete: `showDialogConfirm('删除确认', message, undefined, true)`.
- Image-grid and preview delete: `showDialogConfirm('删除图片', message, undefined, true)`.
- Data mutation remains `moveUserItemsToTrash(device, items)`.

- [ ] **Step 1: Add failing dialog regression assertions**

Assert that the file-list, image-grid and preview delete method slices contain the previous Chinese titles, danger flag, and `moveUserItemsToTrash`, and do not contain `moveToRecycleBinTitle`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `scripts\test.bat --grep TurboFileImageGridPane`.

Expected: FAIL because the current methods render the English recycle-bin dialog.

- [ ] **Step 3: Restore only the dialog presentation**

Replace the three ordinary-delete dialog calls with the previous Chinese title/message/danger arguments. Do not change any subsequent recycle-bin service calls.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same focused test. Expected: PASS.

### Task 4: Full verification and desktop UI check

**Files:**
- Generated: `out/vs/workbench/contrib/turbofile/**`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified compiled application output.

- [ ] **Step 1: Run type checking**

Run: `npm run compile-check-ts-native`.

Expected: exit code 0.

- [ ] **Step 2: Run all TurboFile tests**

Run: `scripts\test.bat --grep TurboFile`.

Expected: all TurboFile tests pass.

- [ ] **Step 3: Compile the client**

Run: `npm run gulp compile-client`.

Expected: compilation completes with zero errors.

- [ ] **Step 4: Verify the desktop behavior**

Launch the desktop application and confirm: empty/full Windows icons switch independently by pane, no orange badge appears, normal delete shows the old Chinese red confirmation, cancel performs no mutation, and confirm moves the selected item into the current device Recycle Bin.

## Plan Self-Review

- Spec coverage: icon extraction, offline packaging, state switching, old dialog restoration and unchanged trash data flow are each covered.
- Placeholder scan: no TBD/TODO or unspecified implementation steps remain.
- Type consistency: the helper accepts the existing boolean state and returns the string required by `HTMLImageElement.src`.
