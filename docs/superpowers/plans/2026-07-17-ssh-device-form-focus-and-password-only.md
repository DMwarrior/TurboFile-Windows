# SSH Device Form Focus and Password-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove private-key controls from the SSH device form, keep all fields editable during background renders, and rebuild the Windows x64 `1.154.0` installer.

**Architecture:** Keep the already-mounted device overlay as a direct child of the editor container while rebuilding only the page shell beneath it. Render SSH authentication as a hidden password mode plus the visible password field, while retaining backend private-key types for storage compatibility.

**Tech Stack:** TypeScript, DOM APIs, VS Code Electron workbench, Mocha static regression tests, Gulp, Inno Setup.

## Global Constraints

- Preserve all unrelated dirty working-tree changes.
- Do not alter transfer protocols or SSH backend private-key contracts.
- Run `npm run compile-check-ts-native` before unit tests.
- Never run `npm run compile`.
- The final installer and packaged application version must both be exactly `1.154.0`.

---

### Task 1: Add Device Form Regression Tests

**Files:**
- Create: `src/vs/workbench/contrib/turbofile/test/common/turbofileDeviceForm.test.ts`

**Interfaces:**
- Consumes: `TurboFileEditorPane.render()` and `TurboFileEditorPane.renderDeviceForm()` source contracts.
- Produces: regression assertions for password-only authentication and retained overlay rendering.

- [ ] **Step 1: Write failing source-contract tests**

Read `turbofileEditor.ts`, isolate the `render()` and `renderDeviceForm()` method bodies, then assert that the SSH branch contains `appendHiddenInput(form, 'authType', 'password')`, excludes the private-key option and fields, and that `render()` retains an existing direct-child device overlay while creating a new form only when no retained overlay exists.

- [ ] **Step 2: Run compilation before tests**

Run: `npm run compile-check-ts-native`

Expected: exit code 0.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `scripts\\test.bat --grep TurboFileDeviceForm`

Expected: assertions fail because the current form still renders private-key controls and `render()` clears the active overlay.

### Task 2: Implement Password-Only Form and Retained Overlay

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`

**Interfaces:**
- Consumes: `isDeviceFormVisible`, `.turbofile-device-overlay`, `renderDeviceForm()`.
- Produces: a continuously attached device overlay and `authType=password` form submissions.

- [ ] **Step 1: Preserve the mounted overlay in `render()`**

Before clearing the container, query the direct-child device overlay when the form is visible. Remove every other child while leaving that overlay attached. Insert the newly rendered shell before it, and call `renderDeviceForm()` only when no retained overlay exists.

- [ ] **Step 2: Remove private-key controls**

Replace the SSH authentication select with `appendHiddenInput(form, 'authType', 'password')`; keep the password input; remove `privateKeyPath` and `passphrase` input creation.

- [ ] **Step 3: Make first focus window-safe**

Replace the global timer with `getWindow(form).requestAnimationFrame`, verify the form is connected, then focus and select the name input. Retained overlays must not trigger this path again.

- [ ] **Step 4: Run compilation and focused test for GREEN**

Run: `npm run compile-check-ts-native`

Run: `scripts\\test.bat --grep TurboFileDeviceForm`

Expected: compilation succeeds and all focused tests pass.

### Task 3: Validate and Repackage 1.154.0

**Files:**
- Regenerate: `.build/win32-x64/TurboFileSetup-win32-x64-1.154.0.exe`
- Regenerate: `.build/win32-x64/TurboFileSetup-win32-x64-1.154.0.exe.sha256`

**Interfaces:**
- Consumes: verified `1.154.0` source tree.
- Produces: installable Windows x64 setup and matching SHA-256 sidecar.

- [ ] **Step 1: Run full source validation**

Run: `npm run compile-check-ts-native`

Run: `scripts\\test.bat --grep TurboFileDeviceForm`

Run: `npm run gulp compile-client`

Expected: every command exits 0.

- [ ] **Step 2: Build application, updater, and installer**

Run: `npx gulp vscode-win32-x64`

Run: `npx gulp vscode-win32-x64-inno-updater`

Run: `npx gulp vscode-win32-x64-user-setup`

Expected: Inno Setup successfully creates `.build/win32-x64/user-setup/极速传Setup.exe`.

- [ ] **Step 3: Replace the versioned artifact and checksum**

Copy the new setup executable to `.build/win32-x64/TurboFileSetup-win32-x64-1.154.0.exe`, calculate SHA-256, and replace the sidecar with `<lowercase hash>  TurboFileSetup-win32-x64-1.154.0.exe`.

- [ ] **Step 4: Verify the final package**

Confirm source, lockfile, packaged `resources/app/package.json`, installer file version, and installer product version are all `1.154.0`; confirm `MZ` header, non-zero size, fresh timestamp, and sidecar equality.
