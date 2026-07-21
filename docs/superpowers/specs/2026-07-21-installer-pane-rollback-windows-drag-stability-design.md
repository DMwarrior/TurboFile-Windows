# 1.156.0 安装、页面回退与 Windows 外部拖拽稳定性设计

## 目标

在不影响传输协议、传输速度、标签标题/颜色、文档关联及其他现有功能的前提下，完成三项独立修复：

1. 升级安装时不再因为 `TurboFileDragExt.dll` 被 Windows 资源管理器占用而出现错误代码 5。
2. 精确撤销 1.155.0 中“关闭传输页面时释放动态 EditorPane 注册、页面实例、DOM 容器及缓存引用”的改动，恢复此前页面生命周期行为。
3. 修复从 SSH 设备拖到 Windows 桌面或资源管理器时偶发不传输、鼠标松开后拖拽阴影长期残留的问题，同时保持外部原生拖拽与 Electron 主进程隔离，避免重新引入闪退。

## 根因

### 安装升级

`TurboFileDragExt.dll` 以当前用户 CopyHook COM 扩展注册并由 `explorer.exe` 加载。用户权限和文件 ACL 正常，但当前安装脚本的 `CloseApplicationsFilter` 明确排除了 Explorer。User Installer 又不能可靠依赖延迟到重启替换，因此覆盖已加载 DLL 时弹出 `DeleteFile` 错误代码 5。

### 页面生命周期

提交 `fae896a5` 增加了 EditorPane 注销事件、动态注册与输入生命周期绑定，以及注销时从 EditorPanes 缓存和 DOM 中移除实例。该机制改变了原有共享编辑器基础设施的生命周期，关闭任意动态页面时会影响剩余标签的呈现。用户要求完整撤销这一资源释放机制，但保留同一提交中无关的标题、颜色、拖拽模式及文档标签功能。

### Windows 外部拖拽

为隔离 Electron `webContents.startDrag` 可能造成的主进程闪退，1.155.0 新增 `TurboFileDragSource.exe`，在渲染器 HTML 拖拽离开窗口时启动第二个原生 `DoDragDrop`。当前实现没有先结束 Chromium 原拖拽会话，而且辅助进程仅依赖 OLE 回调提供的按键状态；两个拖拽会话重叠时，鼠标释放可能只结束其中一个。父进程最长等待 45 秒，因而出现不传输和拖拽阴影长期留在屏幕上的现象。

## 方案

### 1. 安装器仅在必要时释放 Explorer 占用

- 将 `explorer.exe` 加入 Inno Setup Restart Manager 的允许关闭过滤器。
- Restart Manager 只处理实际持有安装目录文件句柄的进程，因此全新安装不会无条件重启 Explorer；升级且旧 CopyHook 已加载时才关闭并在安装后恢复 Explorer。
- 保留 `restartreplace` 和 `uninsrestartdelete` 作为异常情况下的后备机制。
- 增加安装脚本静态回归测试，验证应用进程与 Explorer 均在过滤器中，且 CopyHook 文件仍使用延迟替换保护。

### 2. 精确回退动态 EditorPane 释放机制

- 从 EditorPane registry 移除注销事件和已实例化标记清理。
- 从 EditorPanes 移除收到注销事件后销毁实例、DOM 与缓存的逻辑。
- 恢复动态传输页面“注册后保持到工作台生命周期结束”的旧行为，不再把注册对象绑定到单个 `TurboFileEditorInput.dispose()`。
- 删除或改写只验证资源释放机制的测试；保留共享标签容器引用计数测试和最新标签颜色回归测试。
- 不回退 `EditorInput` 的标签附加类能力，不影响文档与传输标签颜色。

### 3. 单一拖拽所有权与确定性结束

- 继续使用独立 `TurboFileDragSource.exe` 执行捕获型拖拽，避免 Electron 主进程直接运行风险路径。
- 原生辅助进程启动前，通过对应 `webContents` 向 Chromium 原拖拽发送取消输入，确保同一时刻只有一个 Windows OLE 拖拽拥有鼠标。
- 辅助进程在进入 `DoDragDrop` 前确认物理左键仍按下；`QueryContinueDrag` 同时参考 OLE `keyState` 与 `GetAsyncKeyState(VK_LBUTTON)`，鼠标松开立即返回 DROP，不依赖可能滞后的单一状态。
- 父进程完整处理辅助进程的成功、取消、异常退出；无目标时立即失败，不再保持未决 Promise 到 45 秒超时。
- 所有退出路径都终止辅助进程并清理 Active/Targets 临时文件。成功捕获目录后复用现有传输入口，传输协议和速度不变。

## 测试

- 先增加失败的静态/单元测试，分别覆盖安装器 Explorer 释放、页面释放机制已经撤销、原生拖拽取消顺序、真实鼠标键检测和辅助进程确定性退出。
- 编译 `TurboFileDragSource.exe`，运行 TurboFile 相关单元测试和 `compile-check-ts-native`。
- 启动桌面应用，验证 SSH 单文件/多文件/文件夹拖到桌面和资源管理器：松开即结束、立即开始传输、取消不传输、连续快速拖拽无残影、应用不闪退。
- 构建 User Setup，在安装旧版本且 Explorer 已加载 CopyHook 的环境中覆盖安装，验证无错误代码 5、Explorer 自动恢复。
- 构建并核验 1.156.0 安装包版本、文件大小和 SHA-256。

## 边界

- 不修改任何 SSH、SCP、SFTP、tar、rsync 数据传输实现或并发参数。
- 不恢复页面资源累积修复的任何部分。
- 不改变拖拽复制/剪切模式语义；剪切仍只在传输成功后永久清理源文件。
- 不改变普通删除进入回收站的行为。
