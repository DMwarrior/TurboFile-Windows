# Same-Directory Copy Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同一设备同一目录复制粘贴时创建 Windows 风格的“副本”名称。

**Architecture:** 用独立纯函数分配不冲突的目标名称；编辑器仅在内部剪贴板同目录复制入口调用该函数，然后完全复用现有传输执行链。底层传输协议、跨目录冲突和移动行为不变。

**Tech Stack:** TypeScript、VS Code Mocha 单元测试、TurboFile 现有传输服务。

## Global Constraints

- 只修改同一设备同一目录的内部复制粘贴。
- 不修改剪切、移动、拖拽、跨目录、跨设备或传输协议行为。
- 文件夹和多文件不进行大小扫描。

---

### Task 1: Windows 风格副本名称分配器

**Files:**
- Create: `src/vs/workbench/contrib/turbofile/common/turbofileCopyName.ts`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileCopyName.test.ts`

**Interfaces:**
- Produces: `createTurboFileCopyName(name, directory, occupiedNames, caseSensitive): string` and `createTurboFileCopyNames(items, occupiedNames, caseSensitive): string[]`

- [x] **Step 1: Write the failing tests** covering files, folders, numbering and case sensitivity.
- [x] **Step 2: Run the focused test and verify it fails because the module is missing.**
- [x] **Step 3: Implement the minimal pure naming function.**
- [x] **Step 4: Run the focused test and verify it passes.**

### Task 2: Internal same-directory paste integration

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileCopyName.test.ts`

**Interfaces:**
- Consumes: `createCopyName(...)`
- Produces: renamed target items passed into the existing single or batch transfer path.

- [x] **Step 1: Add a failing static integration test** proving only same-directory copy invokes the allocator before transfer.
- [x] **Step 2: Run the test and verify the expected failure.**
- [x] **Step 3: Add the minimal editor helper and call it from internal paste.**
- [x] **Step 4: Run focused tests and verify they pass.**

### Task 3: Verification

**Files:**
- Verify only; no production changes planned.

- [x] **Step 1: Run `npm run compile-check-ts-native`.**
- [x] **Step 2: Run the focused TurboFile tests.**
- [x] **Step 3: Inspect the final diff and confirm unrelated dirty files were untouched.**
