# Persistent Taskbar With Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the TurboFile task log bar visible at the bottom while native VS Code terminals open in the panel above it.

**Architecture:** Retain the existing terminal panel lifecycle and fixed taskbar CSS. Remove terminal visibility from the taskbar rendering decision so the transfer page always owns one taskbar element.

**Tech Stack:** TypeScript, VS Code workbench DOM APIs, Mocha TDD tests, CSS.

## Global Constraints

- Do not change terminal creation, SSH PTY, transfer protocol, task statistics, or taskbar visual styling.
- Preserve all unrelated dirty-worktree changes.
- Run `npm run compile-check-ts-native` before unit tests; do not run `npm run compile`.

---

### Task 1: Lock the persistent taskbar behavior with a regression test

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileTerminalPanel.test.ts`

**Interfaces:**
- Consumes: `TurboFileEditor.renderTransferPage()` and `TurboFileEditor.refreshTaskbar()` source structure.
- Produces: A regression assertion that the taskbar is rendered independently of terminal/task state.

- [x] **Step 1: Replace the conditional-taskbar assertions with persistent-taskbar assertions**

Assert that `renderTransferPage()` appends `renderTaskbar()` unconditionally, `refreshTaskbar()` creates or replaces the taskbar without a removal branch, and `shouldRenderTaskbar()` no longer exists.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm run test-node -- --grep "TurboFileTerminalPanel"`

Expected: FAIL because the current implementation still contains `shouldRenderTaskbar()` and conditional removal.

### Task 2: Make the taskbar independent from terminal visibility

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`

**Interfaces:**
- Consumes: `renderTaskbar(): HTMLElement` and existing terminal panel visibility detection.
- Produces: A transfer page that always contains one `.turbofile-taskbar`.

- [x] **Step 1: Implement the minimal rendering change**

Append `this.renderTaskbar()` directly in `renderTransferPage()`. Remove `shouldRenderTaskbar()` and the `current?.remove()` branch from `refreshTaskbar()`. Keep `isTerminalPanelVisibleForCurrentPage()` for the existing `is-terminal-focused` layout class.

- [x] **Step 2: Run TypeScript validation**

Run: `npm run compile-check-ts-native`

Expected: exit code 0.

- [x] **Step 3: Run the focused test**

Run: `npm run test-node -- --grep "TurboFileTerminalPanel"`

Expected: all `TurboFileTerminalPanel` tests pass.

- [x] **Step 4: Compile the client for manual verification**

Run: `npm run gulp compile-client`

Expected: exit code 0 and updated client output under `out/`.
