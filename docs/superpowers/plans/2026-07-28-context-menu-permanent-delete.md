# 右键永久删除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为普通文件列表和图片网格增加对当前选择集合生效的“永久删除”，并让 POSIX SSH 仅在该入口直接使用非交互 sudo 删除。

**Architecture:** 编辑器层负责菜单、确认、任务日志、乐观更新与单侧刷新；服务契约通过 `useSudo` 可选参数显式区分新增入口和所有既有删除调用。主进程继续复用文件操作队列、NUL 路径输入和批处理，只在 POSIX SSH 且 `useSudo=true` 时生成 `sudo -n rm`，Windows 和默认删除路径保持不变。

**Tech Stack:** TypeScript、VS Code Workbench `IContextMenuService`/`IAction`、Electron main process SSH 服务、Mocha 静态回归测试、PowerShell 构建与打包脚本。

## Global Constraints

- 普通文件列表与图片网格都提供“永久删除”，并对完整多选集合生效。
- Linux/SSH 新入口直接使用 `sudo -n rm`，不先尝试普通 `rm`，也不做失败后的二次重试。
- 只有新增入口启用 sudo；普通删除到回收站、剪切清理、传输清理及已有内部删除调用保持现状。
- 不递归预扫描文件夹大小，不新增 SSH 探测，不改变传输协议、并发或速度。
- 用户可见字符串使用 `localize`，版本目标为 `1.160.0`。

---

### Task 1: 固化服务契约与 sudo 命令行为

**Files:**
- Modify: `src/vs/platform/turbofile/common/turbofile.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Test: `src/vs/platform/turbofile/test/common/turbofileMutationStabilityStatic.test.ts`

**Interfaces:**
- Consumes: `ITurboFileTransferEndpoint[]`、现有文件操作队列和 NUL 分隔路径输入。
- Produces: `deletePaths(endpoints, recursive?, useSudo?)`；`useSudo` 默认 `false`。

- [ ] **Step 1: Write the failing test**

在 `turbofileMutationStabilityStatic.test.ts` 增加断言：服务契约含 `useSudo?: boolean`；单项与批量 POSIX builder 接收 `useSudo`；sudo 分支含 `sudo -n -- rm`；默认调用仍无 sudo；单项 sudo 分支不进入 SFTP 回退。

- [ ] **Step 2: Run test to verify it fails**

先运行 `npm run compile-check-ts-native`，确认当前代码可编译；再运行：

```powershell
scripts\test.bat --grep "direct sudo permanent deletion"
```

Expected: FAIL，因为接口和命令 builder 尚无 `useSudo`。

- [ ] **Step 3: Write minimal implementation**

将接口改为：

```ts
deletePaths(endpoints: readonly ITurboFileTransferEndpoint[], recursive?: boolean, useSudo?: boolean): Promise<ITurboFileFileOperationResult>;
```

主服务把 `useSudo=false` 传入 core。单项 POSIX sudo 路径直接执行 `buildPosixDeleteCommand(path, recursive, true)`；批量 POSIX 路径通过现有 NUL stdin 执行 `buildPosixDeleteManyFromInputCommand(recursive, true)`。builder 使用 `sudo -n -- rm`，默认分支继续使用 `rm`。

- [ ] **Step 4: Run test to verify it passes**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "direct sudo permanent deletion"
```

Expected: compilation and test PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/vs/platform/turbofile/common/turbofile.ts src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts src/vs/platform/turbofile/test/common/turbofileMutationStabilityStatic.test.ts
git commit -m "支持永久删除直接使用sudo"
```

### Task 2: 新增文件列表永久删除入口

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `deletePaths(endpoints, true, true)`。
- Produces: `permanentlyDeleteSelected(side)`，负责普通视图多选永久删除、任务日志与单侧刷新。

- [ ] **Step 1: Write the failing test**

增加静态测试，验证普通文件菜单在“删除”后包含本地化“永久删除”，调用 `permanentlyDeleteSelected(side)`；该方法使用强确认、调用 `deletePaths(endpoints, true, true)`，而 `deleteSelected` 仍只调用 `moveUserItemsToTrash`。

- [ ] **Step 2: Run test to verify it fails**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "explicit permanent delete context action"
```

Expected: FAIL，因为普通视图尚无该动作和方法。

- [ ] **Step 3: Write minimal implementation**

在普通文件右键菜单的“删除”后追加：

```ts
this.menuAction('turbofile.deletePermanently', localize('turbofile.deletePermanently', "永久删除"), Codicon.trash, () => { void this.permanentlyDeleteSelected(side); }, canOperate)
```

`permanentlyDeleteSelected` 获取当前多选，显示“无法撤销且不会进入回收站”的危险确认，乐观移除后创建删除任务，构造 endpoints 并调用 `deletePaths(endpoints, true, true)`。无论失败还是成功，仅强制刷新当前侧。

- [ ] **Step 4: Run test to verify it passes**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "explicit permanent delete context action"
```

Expected: compilation and test PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts
git commit -m "新增文件右键永久删除"
```

### Task 3: 新增图片网格右键删除菜单

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Test: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`

**Interfaces:**
- Consumes: `deleteSelectedImageGridItems(state)` 与 Task 2 的永久删除执行能力。
- Produces: `showImageGridItemContextMenu(index, event)` 和图片网格永久删除路径。

- [ ] **Step 1: Write the failing test**

增加静态测试，验证图片卡片的 `contextmenu` 打开 `IContextMenuService`，菜单同时含“删除”和“永久删除”，永久删除将网格选中图片同步到面板选择后调用 `permanentlyDeleteSelected(state.side)`，且不会调用回收站路径。

- [ ] **Step 2: Run test to verify it fails**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "image grid context menu permanent deletion"
```

Expected: FAIL，因为当前右键只改变选择，不显示菜单。

- [ ] **Step 3: Write minimal implementation**

把卡片右键处理改为先保留现有多选规则，再通过鼠标锚点显示两个动作。永久删除动作把网格选择集合转换为面板 `selectedPaths`，调用 `permanentlyDeleteSelected`；成功或失败由执行方法刷新当前侧，若网格仍打开则根据结果关闭或重载，不能刷新另一侧。

- [ ] **Step 4: Run test to verify it passes**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep "image grid context menu permanent deletion"
```

Expected: compilation and test PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts
git commit -m "新增图片网格永久删除菜单"
```

### Task 4: 回归验证与 1.160.0 打包

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Verify: Windows x64 installer output directory used by the existing release scripts.

**Interfaces:**
- Consumes: Tasks 1-3 的完整功能。
- Produces: 版本为 `1.160.0` 的可安装 Windows x64 安装包。

- [ ] **Step 1: Run focused and TurboFile regression tests**

```powershell
npm run compile-check-ts-native
scripts\test.bat --grep TurboFile
npm run valid-layers-check
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Set release version**

把 `package.json` 与 `package-lock.json` 的产品版本统一设置为 `1.160.0`，不修改依赖版本。

- [ ] **Step 3: Build the installer**

执行仓库现有 Windows x64 发布脚本，保持与上一版相同的产品名、安装范围和打包资源；不得使用 `npm run compile`。

- [ ] **Step 4: Verify the artifact**

检查安装包文件名包含 `1.160.0`，读取文件大小、修改时间和 SHA-256，并确认打包目录没有混入旧版本同名产物。

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json
git commit -m "发布1.160.0版本"
```
