# Pane Toolbar Operation-Mode Order Design

## Goal

Place the per-pane copy/cut drag-operation control at the far left of each file-browser toolbar, immediately before the sort control.

## Behavior

- Both the left and right file-browser toolbars use the same order.
- The copy/cut control is the first actionable toolbar button after the pane title and item count.
- The sort control is the second actionable toolbar button.
- Refresh, search, delete, copy-path, image-grid, pane-layout, terminal, and maximize controls retain their current relative order.
- Copy/cut state, per-pane independence, labels, colors, click behavior, and keyboard focus behavior remain unchanged.

## Implementation

Swap the two existing append calls in `TurboFileEditor.renderPane` so `appendDragOperationButton` runs before `appendPaneSortButton`. Do not use CSS `order` or DOM post-processing because the visual, DOM, accessibility, and keyboard-focus order must match.

## Verification

- Add a source regression test that extracts `renderPane` and asserts the drag-operation append call occurs before the sort append call.
- Run the mandatory TypeScript check before tests.
- Compile the client and run the focused TurboFile pane test.
- Confirm the change applies to both panes through the shared `renderPane(side)` path.

## Scope

No styling, icon, transfer behavior, sorting behavior, or packaging changes are included.
