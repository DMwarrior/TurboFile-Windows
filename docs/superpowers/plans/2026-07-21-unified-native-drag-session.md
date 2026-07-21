# TurboFile 统一原生拖拽会话实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用一次 Windows 原生拖拽会话覆盖同侧移动、左右侧传输和拖到 Windows，消除双拖拽接力造成的禁止图标、无响应和残留阴影。

**Architecture:** 渲染器在拖拽开始时创建不可变会话快照并立即调用 Electron 原生拖拽；内部目标只记录落点，原生循环结束后再复用现有移动/传输函数。主进程为代理目录拖拽增加会话完成信号和短时目标收敛，本地复制仍使用真实路径载荷。

**Tech Stack:** TypeScript、Electron `webContents.startDrag`、Windows CopyHook、Mocha、VS Code IPC service。

## Global Constraints

- 不修改 SSH、SCP、SFTP、tar、rsync 的数据传输实现、并发数、缓冲区或速度计算。
- 同侧拖到文件夹或上一级始终移动；左右侧和 Windows 使用拖拽开始时冻结的复制/剪切模式。
- 剪切仅在传输完整成功后永久删除源文件，且不进入回收站。
- 普通 Windows 文件拖入 TurboFile 保持现状。
- 不恢复 `TurboFileDragSource.exe`，同一次鼠标操作只运行一个原生拖拽循环。

---

### Task 1: 可测试的拖拽会话状态模型

**Files:**
- Create: `src/vs/workbench/contrib/turbofile/common/turbofileNativeDragSession.ts`
- Create: `src/vs/workbench/contrib/turbofile/test/common/turbofileNativeDragSession.test.ts`

**Interfaces:**
- Produces: `createTurboFileNativeDragSession(id, sourceSide, operation, items)`。
- Produces: `startTurboFileNativeDragSession(session)`、`dropTurboFileNativeDragSessionInternally(session, target)`、`settleTurboFileNativeDragSession(session, state)`。
- Produces: `TurboFileNativeDragTarget`，取值为面板或目录落点。

- [ ] **Step 1: 写失败测试**

测试必须断言：创建时冻结数组；只能从 `preparing` 进入 `dragging`；内部落点只能记录一次；不同会话编号不能互相结束；目录落点固定为移动语义。

- [ ] **Step 2: 编译并运行测试，确认 RED**

Run: `npm run compile-check-ts-native`

Expected: FAIL，因为会话模块尚不存在。

- [ ] **Step 3: 实现最小不可变状态模型**

核心接口：

```ts
export interface TurboFileNativeDragSession<T> {
	readonly id: string;
	readonly sourceSide: 'left' | 'right';
	readonly operation: TurboFileDragOperation;
	readonly items: readonly T[];
	readonly state: TurboFileNativeDragSessionState;
	readonly internalTarget?: TurboFileNativeDragTarget;
}
```

所有转换返回新对象；非法转换原样返回，避免迟到事件覆盖当前状态。

- [ ] **Step 4: 编译生成测试 JS 并确认 GREEN**

Run: `npm run compile-check-ts-native`

Run: `npm run gulp -- compile-client`

Run: `node test\unit\node\index.js --runGlob "**/turbofileNativeDragSession.test.js"`

Expected: PASS。

### Task 2: 主进程原生会话收敛协议

**Files:**
- Modify: `src/vs/platform/turbofile/common/turbofile.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileWindowsDrag.test.ts`

**Interfaces:**
- `ITurboFileStartWindowsDragRequest.sessionId: string`。
- `ITurboFileSshService.completeWindowsFileDrag(sessionId: string): Promise<void>`。
- `ITurboFileStartWindowsDragResult.internal?: boolean`。

- [ ] **Step 1: 写失败回归测试**

断言请求必须包含会话编号；主进程维护活动会话与内部完成集合；代理目录使用请求会话编号；等待循环优先识别内部完成；目标收敛上限从 45 秒缩短为原生拖拽结束后的 2 秒；所有 `finally` 清理两个集合和临时文件。

- [ ] **Step 2: 编译并运行目标测试，确认 RED**

Run: `npm run compile-check-ts-native`

Expected: FAIL，接口与实现尚未增加。

- [ ] **Step 3: 实现会话协议**

主进程规则：

```ts
private readonly activeWindowsDragSessions = new Set<string>();
private readonly completedInternalWindowsDrags = new Set<string>();

async completeWindowsFileDrag(sessionId: string): Promise<void> {
	if (this.activeWindowsDragSessions.has(sessionId)) {
		this.completedInternalWindowsDrags.add(sessionId);
	}
}
```

`startWindowsFileDrag` 验证会话编号且拒绝重复；`startCapturedWindowsFileDrag` 使用会话编号创建代理路径；`waitForWindowsDragCopyHookTarget` 返回 Windows 路径或内部完成标记；取消、失败、成功均在 `finally` 清理。

- [ ] **Step 4: 编译与目标测试确认 GREEN**

Run: `npm run compile-check-ts-native`

Run: `npm run gulp -- compile-client`

Run: `node test\unit\node\index.js --runGlob "**/turbofileSshMainServiceStatic.test.js"`

Expected: PASS。

### Task 3: 文件列表与图片网格统一启动入口

**Files:**
- Modify: `src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileDragDrop.test.ts`
- Modify: `src/vs/workbench/contrib/turbofile/test/common/turbofileImageGridPane.test.ts`

**Interfaces:**
- Consumes: Task 1 会话模型。
- Consumes: Task 2 `startWindowsFileDrag` 与 `completeWindowsFileDrag`。
- Produces: `beginNativeFileDrag(side, items, event)` 单一启动入口。
- Produces: `recordNativeInternalDrop(target)` 与 `finishNativeFileDrag(sessionId, result)`。

- [ ] **Step 1: 写失败静态和行为测试**

断言文件行和图片卡片都调用 `beginNativeFileDrag`；启动入口立即 `preventDefault` 并调用一次 `startWindowsFileDrag`；移除 `maybeStartWindowsFileDragFromPointer`、页面 `dragleave` 启动和 `hasStartedNativeWindowsDrag`；内部落点不读取代理路径；内部完成后才调用既有移动/传输函数。

- [ ] **Step 2: 编译并运行目标测试，确认 RED**

Run: `npm run compile-check-ts-native`

Expected: FAIL，旧接力代码仍存在。

- [ ] **Step 3: 实现统一渲染器控制器**

拖拽开始逻辑：

```ts
event.preventDefault();
const session = createTurboFileNativeDragSession(generateUuid(), side, operation, frozenItems);
this.nativeDragSession = startTurboFileNativeDragSession(session);
void this.runNativeFileDrag(this.nativeDragSession);
```

内部 `drop` 只调用 `recordNativeInternalDrop`；`runNativeFileDrag` 返回后，根据冻结落点调用：

- 目录：`moveSelectedItemsIntoDirectory`，传入冻结项目；
- 另一侧：`transferSelected`，传入冻结项目；
- Windows：`transferItemsToWindowsDirectory`；
- 取消/失败：仅显示状态并清理。

为 `transferSelected` 和 `moveSelectedItemsIntoDirectory` 增加可选冻结项目参数，默认调用保持不变，快捷键和其他入口不受影响。

- [ ] **Step 4: 编译与目标测试确认 GREEN**

Run: `npm run compile-check-ts-native`

Run: `npm run gulp -- compile-client`

Run: `node test\unit\node\index.js --runGlob "**/turbofileDragDrop.test.js" --runGlob "**/turbofileImageGridPane.test.js" --runGlob "**/turbofileNativeDragSession.test.js"`

Expected: PASS。

### Task 4: 全量回归与桌面验证

**Files:**
- Generated: affected `out/vs/**` files via the repository compiler.

- [ ] **Step 1: TypeScript 编译检查**

Run: `npm run compile-check-ts-native`

Expected: exit code 0。

- [ ] **Step 2: TurboFile 全量测试**

Run: `npm run gulp -- compile-client`

Run: `node test\unit\node\index.js --runGlob "**/turbofile*.test.js"`

Expected: all tests pass, unexpected errors 0。

- [ ] **Step 3: 桌面应用验证**

使用 `scripts\code.bat` 启动，验证本地与 SSH 的文件行和图片网格：同侧文件夹、上一级、左右侧、桌面、资源管理器、Escape 取消、连续快速拖拽。每次松开鼠标后必须立即结束拖拽图像；内部落点只执行一次；剪切失败不得删除源文件。

- [ ] **Step 4: 差异检查**

Run: `git diff --check`

Run: `git status --short`

Expected: 只包含设计、计划、会话模型、拖拽集成、主进程协议、测试和生成文件。
