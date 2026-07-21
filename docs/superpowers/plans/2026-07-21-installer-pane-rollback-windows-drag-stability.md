# TurboFile 1.156.0 安装、页面回退与 Windows 外部拖拽实施计划

> 执行要求：按 TDD 顺序逐项完成，先让新增回归测试在旧实现上失败，再修改生产代码并验证通过。

## 目标

- 升级安装时允许安装器通过 Restart Manager 关闭并恢复锁定 `TurboFileDragExt.dll` 的 Explorer，避免错误代码 5。
- 只回退动态传输 `EditorPane` 随页面关闭而注销/销毁的改动，保留标签颜色、标题、文档关联等其他功能。
- Windows 外部拖拽只保留原生 OLE 拖拽所有权，鼠标松开后立即结束；辅助进程成功、取消、失败都必须让主进程确定性收敛。
- 版本保持为 `1.156.0`，完成编译、测试与 Windows 用户安装包构建。

## 任务 1：安装器回归测试与修复

涉及文件：

- 新增 `src/vs/workbench/contrib/turbofile/test/common/turbofileInstaller.test.ts`
- 修改 `build/win32/code.iss`

步骤：

1. 新增静态测试，断言 User 安装器的 `CloseApplicationsFilter` 包含 `explorer.exe`，并继续保留拖拽扩展的 `restartreplace`、`uninsrestartdelete` 标志。
2. 编译测试并确认旧脚本因未包含 Explorer 而失败。
3. 将 User 安装器过滤器改为包含 `explorer.exe`；系统安装分支保持不变。
4. 重新运行该测试并确认通过。

## 任务 2：精确回退传输页面动态 Pane 释放链

涉及文件：

- 修改 `src/vs/workbench/contrib/turbofile/test/common/turbofileEditorPaneLifecycle.test.ts`
- 修改 `src/vs/workbench/browser/editor.ts`
- 修改 `src/vs/workbench/browser/parts/editor/editorPanes.ts`
- 修改 `src/vs/workbench/contrib/turbofile/browser/turbofile.contribution.ts`
- 修改 `src/vs/workbench/contrib/turbofile/common/turbofileEditorInput.ts`

步骤：

1. 将原先要求页面关闭时注销 Pane 的两个测试改为要求动态注册在工作台生命周期内保持有效；保留共享编辑器组样式引用计数测试。
2. 运行测试并确认当前释放实现不符合回退要求。
3. 移除 `IEditorPaneRegistry.onDidDeregisterEditorPane`、注册表注销事件、`EditorPanes.releaseEditorPane`、Input 持有注册对象及 contribution 绑定注册对象的代码。
4. 不改动标签颜色、标题、文档归属和 EditorInput 标签类相关逻辑。
5. 重新运行生命周期测试并确认通过。

## 任务 3：Windows 外部拖拽回归测试与修复

涉及文件：

- 修改 `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- 修改 `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- 修改 `resources/turbofile/drag-ext/TurboFileDragSource.cpp`
- 重建 `resources/turbofile/drag-ext/x64/TurboFileDragSource.exe`

步骤：

1. 增加静态测试，断言启动辅助进程前向 Electron 页面发送 Escape 以取消 Chromium 拖拽，并且顺序正确。
2. 增加静态测试，断言原生辅助程序在进入 `DoDragDrop` 前和 `QueryContinueDrag` 中读取 `GetAsyncKeyState(VK_LBUTTON)`。
3. 增加静态测试，断言辅助进程退出码 0 会在短超时内读取 CopyHook 目标并返回或失败，不再留下未决 Promise 等待 45 秒。
4. 运行测试并确认旧实现失败。
5. 在捕获式拖拽启动前发送 Escape `keyDown`/`keyUp`，然后启动原生辅助程序。
6. 将辅助进程等待函数改为返回确定的目标目录：取消立即报取消、非零立即报失败、零退出使用短超时读取目标。
7. 原生 `IDropSource` 同时检查 OLE 键状态与物理左键状态；启动时左键已经释放则直接按取消退出。
8. 运行静态测试，使用构建脚本重建 x64 辅助程序。

## 任务 4：综合验证与打包

1. 运行 TurboFile 相关单元测试。
2. 运行 `npm run compile-check-ts-native -- --pretty false`。
3. 运行 `npm run transpile-client` 并确认无编译错误。
4. 构建 Windows x64 产品、Inno updater 和 User Setup。
5. 生成 `TurboFileSetup-win32-x64-1.156.0.exe` 与 SHA-256 文件。
6. 检查 Git 差异，确保没有回退或修改任务范围之外的功能。
