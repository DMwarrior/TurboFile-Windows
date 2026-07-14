# TurboFile Codebase Slimming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove VS Code capabilities unrelated to TurboFile, documents, default language intelligence, terminal, and the Windows install/release pipeline while preserving every approved behavior.

**Architecture:** Treat retained capability as an explicit allowlist. First restore the native language-extension runtime and add regression contracts, then remove unused runtime registrations, bundle entrypoints, packaged extensions/dependencies/resources, and finally source trees that have become unreachable. Each layer is independently compiled and tested before the next layer is removed.

**Tech Stack:** TypeScript, VS Code workbench/extension host, esbuild/Gulp, Electron, Inno Setup, Mocha, PowerShell.

## Global Constraints

- Preserve all TurboFile transfer, device, task, image, clipboard, drag/drop, terminal, tab, theme, settings, and update behavior.
- Preserve all document-related source and VS Code default document/language capabilities, including Explorer, Search, Markdown/media/Webview/custom editors, Notebook, Diff/Merge, history, and code intelligence.
- Preserve the current Windows x64 build, package, install, update, uninstall, manifest, checksum, and GitHub Release workflows.
- Preserve all existing dirty-worktree changes; never reset or overwrite them.
- Run `npm run compile-check-ts-native` before any unit-test command.
- Remove source only after its runtime entrypoint and packaged output are gone and `rg` shows no retained-source import.
- Keep third-party licenses and notices.

---

### Task 1: Add the slimming capability contract and regression guardrails

**Files:**
- Create: `build/turbofile-product.json`
- Create: `src/vs/workbench/contrib/turbofile/test/common/turbofileSlimShell.test.ts`

**Interfaces:**
- Produces: JSON arrays `excludedLocalExtensions`, `excludedProductionDependencies`, `electronLocales`, `forbiddenDesktopEntrypoints`, and `forbiddenWorkbenchImports` consumed by later build tasks and static tests.

- [ ] **Step 1: Write a failing static contract test**

The test must read `build/turbofile-product.json`, `workbench.common.main.ts`, `workbench.desktop.main.ts`, `build/buildfile.ts`, `build/next/index.ts`, and `build/gulpfile.vscode.ts`. Assert that required document/TurboFile entrypoints remain, forbidden entries are absent, `zh-CN.pak` and `en-US.pak` are retained, and language/document extensions are not excluded.

- [ ] **Step 2: Verify RED**

Run `npm run compile-check-ts-native`, then `npm run test-node -- --grep TurboFileSlimShell`. Expected: failure because `build/turbofile-product.json` does not exist.

- [ ] **Step 3: Add the contract**

Use this initial policy:

```json
{
  "excludedLocalExtensions": [
    "debug-auto-launch", "debug-server-ready", "git", "git-base", "github",
    "github-authentication", "mermaid-chat-features", "microsoft-authentication",
    "tunnel-forwarding"
  ],
  "excludedProductionDependencies": [
    "@anthropic-ai/sandbox-runtime", "@anthropic-ai/sdk", "@github/copilot",
    "@github/copilot-sdk", "@microsoft/1ds-core-js", "@microsoft/1ds-post-js",
    "@microsoft/applicationinsights-core-js", "@microsoft/applicationinsights-shims",
    "@microsoft/dev-tunnels-connections", "@microsoft/dev-tunnels-contracts",
    "@microsoft/dev-tunnels-management", "@microsoft/dev-tunnels-ssh",
    "@microsoft/dev-tunnels-ssh-tcp", "chrome-remote-interface", "playwright-core"
  ],
  "electronLocales": ["en-US.pak", "zh-CN.pak"],
  "forbiddenDesktopEntrypoints": [
    "vs/sessions/", "vs/platform/agentHost/", "vs/workbench/contrib/debug/node/telemetryApp"
  ],
  "forbiddenWorkbenchImports": [
    "contrib/authentication", "contrib/processExplorer", "contrib/share",
    "contrib/speech", "contrib/userDataSync", "contrib/userDataProfile",
    "platform/agentHost", "platform/remoteTunnel", "services/browserView",
    "services/mcp", "services/userDataSync"
  ]
}
```

Do not exclude `@vscode/ripgrep`, `@vscode/vscode-languagedetection`, `katex`, `node-pty`, `ssh2`, TypeScript, TextMate, Oniguruma, xterm, or document/language extensions.

- [ ] **Step 4: Verify GREEN**

Run compile-check and the focused test. Expected: PASS against the current required-entry contract, with later-task forbidden-entry assertions expressed as explicit expected failures per task rather than disabled assertions.

- [ ] **Step 5: Commit**

Commit only the contract and its test as `test: define TurboFile slimming capability contract`.

### Task 2: Restore VS Code default language intelligence

**Files:**
- Modify: `src/vs/workbench/workbench.common.main.ts`
- Modify: `src/vs/workbench/workbench.desktop.main.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileSlimShell.test.ts`
- Delete after GREEN: `src/vs/workbench/services/extensions/common/turbofileExtensionContributionService.ts`

**Interfaces:**
- Produces: native `IExtensionService` activation for bundled default language/document extensions.
- Preserves: extension-host process, extension scanning, TextMate/Tree-sitter contributions, and user language-extension compatibility.

- [ ] **Step 1: Add failing assertions**

Assert that `workbench.common.main.ts` no longer registers `TurboFileExtensionContributionService`, that `workbench.desktop.main.ts` imports `./services/extensions/electron-browser/nativeExtensionService.js`, and that `typescript-language-features`, `json-language-features`, `html-language-features`, `css-language-features`, `markdown-language-features`, and `notebook-renderers` are not excluded.

- [ ] **Step 2: Verify RED**

Run compile-check and the focused test. Expected: failure on the custom extension service registration/native service import.

- [ ] **Step 3: Restore native activation**

Remove the custom `IExtensionService` registration and import from `workbench.common.main.ts`. Add the native extension service side-effect import next to `extensionHostStarter` in `workbench.desktop.main.ts`. Keep extension management/scanning services needed by the native service, but do not restore Extensions UI or marketplace contributions.

- [ ] **Step 4: Verify GREEN**

Run compile-check, focused slim-shell tests, language service tests, and extension service tests. Expected: all PASS.

- [ ] **Step 5: Delete the obsolete custom service**

Use `rg TurboFileExtensionContributionService src build`; when only the service file remains, delete it and rerun compile-check/tests.

- [ ] **Step 6: Commit**

Commit as `fix: restore default language extension activation`.

### Task 3: Remove unused workbench registrations without touching document systems

**Files:**
- Modify: `src/vs/workbench/workbench.common.main.ts`
- Modify: `src/vs/workbench/workbench.desktop.main.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileSlimShell.test.ts`

**Interfaces:**
- Removes only side-effect registration of approved-unused services/contributions.
- Retains editor, files, search, workspace, notebook, webview, Markdown, merge/diff, history, output, terminal, theme, accessibility, quick input, clipboard, update, encryption, secrets, and TurboFile imports.

- [ ] **Step 1: Add failing forbidden-import assertions**

Cover AI/MCP/browser automation, agent host, remote tunnel, online sync/profile/authentication, speech/share/telemetry UI, issue/process explorer, policy/keybinding export, emergency alert, and VS Code Tasks/Debug/Testing/SCM contributions.

- [ ] **Step 2: Verify RED**

Run compile-check and focused tests. Expected: failures identifying the currently loaded forbidden imports.

- [ ] **Step 3: Remove common-main imports**

Remove only imports for MCP resource scanning, AI embedding/related/settings services, chat entitlement, account policy, telemetry contribution, speech, process explorer, authentication, user-data sync/profile, share, remote explorer/scanner, and associated online services. Keep document-facing inline completions, code actions, comments, timeline/history, language detection, outline, Webview/custom editor, Explorer/Search, and accessibility.

- [ ] **Step 4: Remove desktop-main imports**

Remove MCP, telemetry, user-data sync, tunnels/remote tunnel, diagnostics/profiling UI, agent host, Playwright Browser View, issue/process explorer, tags, emergency alert, policy export, keybindings export, and duplicate disabled contributions. Keep lifecycle, update, request, clipboard, context menu, path, themes, encryption, secrets, extension runtime, files/search, terminal, Webview, local history, merge editor, and TurboFile.

- [ ] **Step 5: Verify and commit**

Run compile-check plus TurboFile/editor/workbench tests. Commit as `refactor: remove unused workbench registrations`.

### Task 4: Remove AI/Sessions/AgentHost build entrypoints and resources

**Files:**
- Modify: `build/buildfile.ts`
- Modify: `build/next/index.ts`
- Modify: `build/gulpfile.vscode.ts`
- Modify: `src/vs/platform/windows/electron-main/windowImpl.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileSlimShell.test.ts`

**Interfaces:**
- Desktop bundle continues to produce workbench, extension host, file watcher, pty host, document/search/notebook/language workers, CLI, shared process, and workbench bootstrap.
- Desktop bundle stops producing Sessions, AgentHost, AgentHost diff worker, and debug telemetry artifacts.

- [ ] **Step 1: Add failing bundle assertions**

Assert forbidden entrypoints/resources are absent in both legacy and esbuild configurations, while required document/terminal/extension-host entrypoints remain.

- [ ] **Step 2: Verify RED**

Run compile-check and focused tests. Expected: failures listing Sessions/AgentHost/debug entrypoints.

- [ ] **Step 3: Prune both bundle configurations**

Remove Sessions, AgentHost, AgentHost diff worker, debug telemetry app, browser-view preload, Sessions HTML/media/prompts/skills, debug media, and Sessions checksum paths. Keep all document workers and Webview/extension-host resources.

- [ ] **Step 4: Disable Sessions-window routing**

Make built TurboFile windows always load `vs/code/electron-browser/workbench/workbench.html`; remove the Sessions HTML branch only after proving no retained caller can set `isSessionsWindow` for TurboFile.

- [ ] **Step 5: Verify and commit**

Run build typecheck (`npm --prefix build run typecheck`), compile-check, focused tests, then `npm run gulp -- esbuild-vscode-min`. Confirm `out-vscode-min/vs/sessions` and AgentHost bundles are absent. Commit as `build: remove unused AI and sessions entrypoints`.

### Task 5: Slim packaged extensions, dependencies, source maps, locales, and installer compression

**Files:**
- Modify: `build/lib/extensions.ts`
- Modify: `build/gulpfile.vscode.ts`
- Modify: `build/win32/code.iss`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileSlimShell.test.ts`

**Interfaces:**
- Consumes: `build/turbofile-product.json`.
- Produces: a Windows app containing only approved extensions/dependencies/locales and no JS/CSS source maps.

- [ ] **Step 1: Add failing packaging-policy assertions**

Assert local extension enumeration applies `excludedLocalExtensions`, production dependency streams apply `excludedProductionDependencies`, packaging always strips `*.js.map`/`*.css.map`, Electron locales are filtered to the configured two files, and Inno uses `lzma2/ultra64` with solid compression.

- [ ] **Step 2: Verify RED**

Run compile-check and focused tests. Expected: failures for each unapplied policy.

- [ ] **Step 3: Apply extension/dependency filters**

Load the JSON once in the build process. Filter local extensions by name. Convert excluded dependency package names into anchored `node_modules/<package>/**` exclusions before `createAsar`; remove Copilot-specific ASAR unpack rules. Do not filter a transitive package unless its top-level package name is explicitly in the contract.

- [ ] **Step 4: Strip maps and locales**

Set packaging source-map stripping independently of CI, remove sourceMappingURL comments, and filter Electron output to `locales/en-US.pak` and `locales/zh-CN.pak` on Windows. Do not remove licenses, ICU, Chromium PAKs, V8 snapshots, ffmpeg, or GPU DLLs.

- [ ] **Step 5: Optimize installer compression**

Change only `Compression=lzma2/ultra64`; retain `SolidCompression=yes` and every installer task/section.

- [ ] **Step 6: Verify and commit**

Run build typecheck, compile-check, focused tests, `npm run gulp -- vscode-win32-x64-min`, and scan `D:/Work/Code/VSCode-win32-x64` for forbidden extensions/dependencies/maps/locales. Commit as `build: slim TurboFile packaged payload`.

### Task 6: Safely clean legacy versioned update directories

**Files:**
- Modify: `build/win32/code.iss`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileSlimShell.test.ts`

**Interfaces:**
- Adds: Inno Setup post-install cleanup limited to legacy ten-hex-character directories containing both a `version` marker and `resources/app/product.json`.
- Never deletes: `{app}`, the current versioned resources folder, user data, arbitrary directories, or locked directories.

- [ ] **Step 1: Add failing safety assertions**

Assert the installer validates directory name, marker file, product JSON, and current-folder inequality before calling `DelTree`; assert failures are logged and do not fail installation.

- [ ] **Step 2: Verify RED**

Run compile-check and focused tests. Expected: failure because cleanup procedure is absent.

- [ ] **Step 3: Implement cleanup**

Add `IsHexCharacter`, `IsLegacyVersionedDirectoryName`, and `CleanupLegacyVersionedDirectories` Pascal procedures. Enumerate only direct children of `{app}`; skip `.`/`..` and `{#VersionedResourcesFolder}`; call cleanup from the successful post-install path after updater GC.

- [ ] **Step 4: Verify and commit**

Run compile-check, focused tests, `npm run gulp -- vscode-win32-x64-inno-updater`, and `npm run gulp -- vscode-win32-x64-user-setup`. Test install over a fixture containing one valid legacy directory and one similarly named unrelated directory. Commit as `fix: clean legacy TurboFile update payloads`.

### Task 7: Delete unreachable non-document source families and root dependencies

**Files:**
- Delete when unreachable: `src/vs/sessions/**`
- Delete when unreachable: `src/vs/platform/agentHost/**`
- Delete when unreachable: `src/vs/platform/browserView/**`
- Delete when unreachable: unused AI/MCP/remote/debug/testing/SCM/task source families identified by the contract
- Delete: excluded local extension directories from Task 1
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: remaining importers discovered by `rg`

**Interfaces:**
- Leaves all document, language, extension-host, terminal, TurboFile, update, build, installer, and release sources intact.

- [ ] **Step 1: Process one source family at a time**

For each candidate, run `rg` for its module path across retained sources and build scripts. Remove obsolete importers/registrations first. If any importer belongs to the approved document/install set, retain the shared source or move only the shared neutral type to an existing non-feature module before deletion.

- [ ] **Step 2: Verify RED/GREEN per family**

Before deleting a family, add its path to the forbidden-source assertion and observe failure. Delete it, then run compile-check and focused tests. Do not batch families in one verification cycle.

- [ ] **Step 3: Remove production dependencies**

After all compile-time importers are gone, remove the excluded top-level dependencies from `package.json` and regenerate `package-lock.json` with `npm install --package-lock-only --ignore-scripts`. Confirm `npm ls --omit=dev` no longer lists them.

- [ ] **Step 4: Verify and commit by coherent family**

Use separate commits for AI/Sessions, browser automation, remote/tunnels, debug/testing/SCM/tasks, and online account/sync/telemetry families. Every commit requires compile-check and relevant tests.

### Task 8: Full build, package, installation, and functional acceptance

**Files:**
- Create: `.build/win32-x64/turbofile-size-report.json` (artifact only, do not commit)
- Modify only if a verified regression requires a focused fix.

- [ ] **Step 1: Run automated verification**

Run compile-check, TurboFile tests, editor/language/extension tests, build tests, and the Windows minified package tasks in the established order.

- [ ] **Step 2: Scan artifacts**

Fail if the app contains source maps, forbidden extensions/dependencies, Sessions/AgentHost bundles, or locales outside `en-US`/`zh-CN`. Record total and top-level sizes against 788.8 MiB app and 163.9 MiB installer baselines.

- [ ] **Step 3: Desktop regression**

Using the VS Code launch automation, verify TurboFile pages/transfers/clipboard/drag/terminal/tabs and document open/edit/save/search/diff/merge/Markdown/media/Webview/Notebook. Verify Ctrl+click, F12, references, completion, and hover for every language where stock VS Code provides those capabilities.

- [ ] **Step 4: Installer regression**

Verify clean install, overwrite install, background update, failed-update recovery, uninstall, reinstall, shortcuts, PATH, protocol, file associations, context menu, and legacy-directory cleanup.

- [ ] **Step 5: Final review and packaging handoff**

Run `git diff --check`, inspect all retained dirty changes, report exact size deltas and any source family retained due to a documented dependency. Do not claim completion until all verification commands pass.

