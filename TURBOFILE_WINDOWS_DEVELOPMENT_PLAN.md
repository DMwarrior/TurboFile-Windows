# TurboFile Windows 原生桌面版开发文档

> 本文档是 TurboFile Windows 桌面版的后续开发总纲。后续开发必须以本文档为准，按阶段推进，不跳阶段、不临时改变核心架构。

## 1. 项目目标

TurboFile Windows 版要做成一个基于 VS Code 深度定制的 Windows 原生桌面文件传输软件，体验接近 WinSCP，但保留并增强现有 TurboFile 在局域网 Linux 设备之间的高速直连传输能力。

核心目标：

- 基于 `D:\Work\code\vscode` 的 VS Code 源码进行深度定制，不从零开发。
- 集成现有 TurboFile 项目 `D:\Work\code\TurboFile` 的核心传输、文件浏览、图片预览和远程操作能力。
- 生成最终 Windows 可执行程序 `TurboFile.exe` 或轻量安装包。
- Windows 本地即可独立运行，不依赖部署服务器。
- 软件自身提供 SSH/SFTP/SCP 能力，不要求用户额外安装 Windows OpenSSH。
- 支持用户自行添加、编辑、删除设备。
- 自动判断传输路径：能直连时走服务器之间 SSH + rsync，不能直连时走本机 Windows 中转 SCP/SFTP。

## 2. 当前问题

现有 TurboFile 的问题集中在三个方面：

1. 强依赖部署服务器
   - 所有文件浏览、传输、设备访问都依赖部署服务器。
   - 如果部署服务器不能 SSH 到目标设备，即使 Windows 本机可以访问，也无法操作。
   - 两台目标设备不能互通时缺少本机中转 fallback。

2. 设备配置复杂
   - Linux 和 Windows 设备需要统一写入服务端配置。
   - SSH 地址、用户名、认证信息都需要服务端维护。
   - 普通用户无法像 WinSCP 一样自行添加连接。

3. Windows 体验不足
   - Windows 端没有独立客户端。
   - 添加 Windows 设备需要额外安装 OpenSSH、rsync 等依赖。
   - 传输路径受部署服务器网络限制，不能充分利用 Windows 本机可达网络。

## 3. 产品形态

TurboFile Windows 版是一个文件传输与远程文件管理桌面软件，第一屏就是可操作的双栏文件管理界面，而不是欢迎页或工作区页。

主界面布局：

- 左侧：设备 A 文件面板。
- 右侧：设备 B 文件面板。
- 中间或面板之间：复制、剪切、同步、开始传输等操作区。
- 底部：任务队列、传输进度、速度、日志入口。
- 可选底部面板：复用 VS Code Terminal，支持左右设备分别打开终端。

视觉要求：

- 保持 VS Code 风格。
- 默认主题使用接近 `Visual Studio 2017 Dark - C++` 的深色风格。
- 支持中文和英文两种语言，但第一阶段以中文 UI 为默认。
- 控件优先使用 VS Code 原有组件、命令、菜单、状态栏、终端和主题系统。

## 4. 核心功能范围

必须保留或实现：

- 双栏远程文件浏览。
- 用户本地设备管理。
- SSH 密码和私钥连接。
- SFTP/SCP 上传下载。
- 目标设备之间 SSH + rsync 直连传输。
- 自动传输策略判断。
- 图片快速预览。
- 文本文件查看与编辑。
- 新建文件、新建文件夹、删除、重命名。
- 同设备内复制、剪切、粘贴，优先使用目标系统原生命令。
- 压缩与解压。
- 每个设备打开独立终端。
- 多终端标签。
- 任务队列、速度、进度、失败重试、日志。

必须删除或隐藏：

- 扩展市场。
- 调试系统。
- 工作区概念。
- 通用语言开发功能。
- 与文件传输无关的欢迎页、运行配置、调试配置等入口。

Git 功能可选：

- Phase 1 到 Phase 6 默认隐藏。
- 如果后续需要保留远程目录 Git 状态，可以单独作为增强功能评估。

## 5. 总体架构

项目采用 VS Code 深度定制架构，保留 Electron、Workbench UI、Terminal、Editor、Theme、Command、Context Menu、Layout 等成熟能力，在其上新增 TurboFile 专用业务层。

推荐分层：

```text
TurboFile Windows
├─ VS Code Fork Base
│  ├─ Electron Main Process
│  ├─ Workbench UI
│  ├─ Editor
│  ├─ Terminal
│  ├─ Theme
│  └─ Menu / Command / Keybinding
├─ TurboFile Workbench
│  ├─ Dual Pane Layout
│  ├─ Device Selector
│  ├─ File Browser View
│  ├─ Transfer Toolbar
│  ├─ Task Progress Panel
│  └─ Preview Panel
├─ TurboFile Core
│  ├─ Device Manager
│  ├─ Credential Vault
│  ├─ SSH Client Runtime
│  ├─ Remote File System
│  ├─ Transfer Engine
│  ├─ Strategy Detector
│  ├─ Rsync Direct Adapter
│  ├─ SCP / SFTP Relay Adapter
│  ├─ Terminal Adapter
│  └─ Archive / Command Adapter
└─ Runtime Dependencies
   ├─ embedded ssh client
   ├─ embedded scp / sftp capability
   ├─ embedded rsync runtime if needed
   └─ Windows credential encryption
```

## 6. 代码来源与工程目录

本项目目录：

- `D:\Work\code\TurboFile-Windows`

上游 VS Code 源码：

- `D:\Work\code\vscode`

现有 TurboFile 项目：

- `D:\Work\code\TurboFile`

后续开发约定：

- 先将 VS Code 源码复制或 fork 到 `TurboFile-Windows`。
- 所有新增 TurboFile 代码应放在明确命名空间下，避免散落修改。
- 每次迁移 TurboFile 能力前，先定位原项目对应实现，再写迁移记录。
- rsync 传输命令必须从现有 TurboFile 读取并完整复用，不凭空重写。

建议新增目录：

```text
src/vs/workbench/contrib/turbofile/
├─ browser/
│  ├─ turbofileWorkbench.ts
│  ├─ dualPane/
│  ├─ devices/
│  ├─ explorer/
│  ├─ transfer/
│  ├─ preview/
│  └─ terminal/
├─ common/
│  ├─ turbofileTypes.ts
│  ├─ deviceModel.ts
│  ├─ transferModel.ts
│  └─ constants.ts
├─ electron-sandbox/
└─ test/

src/vs/platform/turbofile/
├─ common/
├─ electron-main/
├─ node/
│  ├─ ssh/
│  ├─ sftp/
│  ├─ transfer/
│  ├─ rsync/
│  ├─ archive/
│  └─ credential/
└─ test/
```

## 7. 设备管理模块

设备管理是 Windows 版必须重做的基础能力。

设备字段：

- 设备名称。
- 主机地址。
- 端口，默认 `22`。
- 协议，第一阶段为 `SSH/SFTP`。
- 用户名。
- 认证方式：密码、私钥、私钥加口令。
- 默认远程目录。
- 系统类型：Linux、Windows、WSL、Unknown。
- rsync 可用状态。
- 最近连接时间。
- 连接分组或标签，后续可选。

存储要求：

- 设备基础信息保存在本地用户数据目录。
- 密码、私钥口令等敏感信息必须加密。
- Windows 优先使用 Electron `safeStorage` 或 Windows DPAPI。
- 禁止明文保存密码。
- 配置文件不得放入服务端。

建议数据结构：

```ts
interface TurboFileDevice {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'privateKey';
  encryptedPassword?: string;
  privateKeyPath?: string;
  encryptedPrivateKeyPassphrase?: string;
  defaultPath?: string;
  platform: 'linux' | 'windows' | 'wsl' | 'unknown';
  capabilities: DeviceCapabilities;
  lastConnectedAt?: number;
}

interface DeviceCapabilities {
  ssh: boolean;
  sftp: boolean;
  scp: boolean;
  rsync: boolean;
  shell: boolean;
  archive: boolean;
}
```

## 8. SSH 与远程文件系统

Windows 本地必须能直接发起 SSH 连接。

技术约束：

- 不依赖用户系统安装 OpenSSH。
- 不依赖部署服务器。
- 第一阶段优先使用 Node 生态成熟 SSH/SFTP 库或嵌入式二进制。
- 后续如性能不足，再评估 libssh2、ssh2、native addon 或内置 OpenSSH 二进制方案。

远程文件系统能力：

- 列目录。
- 读取文件元信息。
- 创建文件夹。
- 创建文件。
- 删除。
- 重命名。
- 复制、移动。
- 读取文件内容。
- 写入文件内容。
- 流式下载。
- 流式上传。
- 远程执行命令。

目录秒开策略：

- 目录列表并发请求。
- 最近目录缓存。
- 文件图标和类型懒加载。
- 图片缩略图按需加载。
- 大目录分页或虚拟滚动。

## 9. 智能传输策略

这是 TurboFile Windows 版的核心创新，必须自动判断，不让用户手动选择。

输入：

- 源设备 A。
- 目标设备 B。
- 源路径。
- 目标路径。
- 传输方向。
- 文件或目录列表。

策略判断：

```text
用户发起 A -> B 传输
        |
        v
检测 A 是否能 SSH 到 B
        |
        ├─ 能直连
        |    |
        |    v
        |  检测 rsync 是否可用
        |    |
        |    ├─ 可用：使用 TurboFile rsync 直连模式
        |    └─ 不可用：降级到 SSH 原生命令或本机中转
        |
        └─ 不能直连
             |
             v
          使用 Windows 本机中转 SCP/SFTP
```

直连模式：

- 在源设备或目标设备上执行 rsync 命令。
- 传输路径不经过 Windows。
- 必须复用现有 TurboFile 的 rsync 命令格式、参数和日志解析。
- 适用于局域网 Linux 服务器之间高速传输。

中转模式：

- Windows 本机同时连接 A 和 B。
- 从 A 通过 SFTP/SCP 流式读取。
- 写入 B 的 SFTP/SCP。
- 避免完整落盘临时文件，优先采用流式管道。
- 必要时使用临时文件分块，任务结束后自动清理。

策略结果：

```ts
type TransferStrategy =
  | {
      mode: 'direct-rsync';
      executorDeviceId: string;
      reason: string;
    }
  | {
      mode: 'relay-sftp';
      reason: string;
    }
  | {
      mode: 'relay-scp';
      reason: string;
    };
```

## 10. 传输引擎

传输引擎负责所有复制、移动、同步、上传、下载任务。

能力要求：

- 任务队列。
- 并发控制。
- 暂停、取消。
- 失败重试。
- 断点续传，后续增强。
- 速度统计。
- 剩余时间估算。
- 错误日志。
- 文件冲突处理：覆盖、跳过、重命名、全部应用。
- 空目录、权限、软链接、大文件处理。

任务模型：

```ts
interface TransferTask {
  id: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  sourcePaths: string[];
  targetPath: string;
  operation: 'copy' | 'move' | 'sync';
  strategy?: TransferStrategy;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'canceled';
  progress: TransferProgress;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}
```

## 11. 双栏文件浏览 UI

主界面必须从 VS Code Workbench 改造为双栏文件浏览。

左面板：

- 设备选择器。
- 当前路径面包屑。
- 工具栏：刷新、搜索、删除、新建、切换视图、打开终端。
- 文件列表。

右面板：

- 与左面板同构。
- 支持独立设备、独立路径、独立排序。

中间操作区：

- 复制。
- 剪切或移动。
- 开始传输。
- 查看日志。
- 同步，后续增强。

底部任务区：

- 当前任务。
- 速度。
- 进度。
- 传输模式标记：直连 rsync / 本机中转。
- 错误信息。

文件列表要求：

- 支持名称、大小、修改时间、类型排序。
- 支持隐藏文件开关。
- 支持多选。
- 支持拖拽。
- 支持右键菜单。
- 支持双击进入目录。
- 支持双击文件预览或打开编辑器。

右键菜单：

- 上传 / 下载，按上下文显示。
- 复制到另一侧。
- 移动到另一侧。
- 删除。
- 重命名。
- 新建文件夹。
- 新建文件。
- 压缩。
- 解压。
- 打开终端。
- 复制路径。
- 刷新。

## 12. 终端模块

终端直接复用 VS Code 内置 Terminal。

要求：

- 每个设备可打开一个或多个远程终端。
- 支持左右设备分别打开终端。
- 支持多标签。
- 终端标题显示设备名与路径。
- 终端入口保留 VS Code 原有终端控件风格。

实现方向：

- 保留 VS Code terminal contribution。
- 新增 TurboFile terminal profile provider。
- 设备终端创建时使用对应 SSH 会话或内置 SSH 客户端。
- 若 VS Code 现有终端只支持本地 shell，则通过本地伪终端桥接远程 SSH。

## 13. 图片预览与内容编辑

图片预览要求：

- 复用现有 TurboFile 快速图片浏览逻辑。
- 支持远程图片快速打开。
- 支持上一张、下一张。
- 支持缩放、适应窗口、原始大小。
- 大目录图片懒加载。
- 缩略图缓存。

文本编辑要求：

- 复用 VS Code Editor。
- 远程文件打开后进入编辑器。
- 保存时写回远程设备。
- 支持大文件保护，超过阈值时只读或提示。

## 14. 压缩与解压

压缩与解压必须优先使用目标设备原生命令，避免 Windows 中转。

Linux：

- `tar`
- `zip`
- `unzip`
- `7z`，如存在

Windows 远程：

- PowerShell `Compress-Archive`
- PowerShell `Expand-Archive`
- 或内置 7z，后续可选

执行方式：

- 通过 SSH 在目标设备执行命令。
- 命令执行日志进入任务日志。
- 长任务进入底部任务队列。

## 15. VS Code 精简策略

精简必须分阶段进行，不能在 Phase 1 直接大规模删除导致无法启动。

Phase 1 精简方式：

- 通过 product 配置、菜单配置、贡献点禁用隐藏无关功能。
- 保留 VS Code 启动链路和 Workbench 基础设施。
- 保留 Terminal、Editor、Theme、Command、Context Menu。

Phase 2 到 Phase 4：

- 移除或禁用调试入口。
- 隐藏扩展入口。
- 隐藏工作区入口。
- 隐藏运行、调试、源代码管理等活动栏项。

Phase 5 之后：

- 梳理不再需要的内置扩展。
- 删除或剥离扩展市场相关服务。
- 删除调试服务。
- 删除语言包与开发语言相关默认功能。
- 保留必要的文本编辑能力。

## 16. 构建与发布

最终输出：

- `TurboFile.exe`
- 或轻量安装包。

要求：

- 开箱即用。
- 不需要用户安装 OpenSSH。
- 不需要用户安装 rsync。
- 不需要部署服务器。
- 用户首次启动即可添加设备。

构建策略：

- 复用 VS Code Windows 构建链路。
- 修改产品名称、图标、应用 ID、数据目录。
- 禁用遥测。
- 禁用扩展市场。
- 打包内置运行时依赖。

发布前检查：

- 全新 Windows 环境可启动。
- 无需系统 OpenSSH 可连接 SSH。
- 可添加设备。
- 可浏览左右远程目录。
- 可传输文件。
- 可打开终端。
- 可预览图片。

## 17. 开发阶段

开发必须按以下阶段执行。

### Phase 1：最小可运行版本

目标：

- 从 VS Code 源码启动 TurboFile 精简版。
- 应用名称改为 TurboFile。
- 显示双栏 UI 壳。
- 支持添加 SSH 设备并测试连接。

任务：

- 初始化 `TurboFile-Windows` 工程。
- 接入 VS Code 源码。
- 修改 product 信息。
- 创建 TurboFile Workbench contribution。
- 隐藏不必要活动栏和菜单入口。
- 实现设备管理的基础 UI。
- 实现本地加密保存连接信息。
- 实现 SSH test connection。

验收：

- 能启动桌面应用。
- 第一屏显示双栏界面。
- 可添加一个 SSH 设备。
- 可保存并再次读取设备。
- 可测试 SSH 连接成功或失败。

### Phase 2：文件浏览

目标：

- 左右面板可浏览远程文件。

任务：

- 实现远程目录列表。
- 实现路径导航。
- 实现刷新、排序、隐藏文件开关。
- 实现双击进入目录。
- 实现文件基础右键菜单。
- 实现缓存和加载状态。

验收：

- 左右两侧可分别连接不同设备。
- 可浏览目录。
- 大目录不卡死 UI。
- 连接失败有明确提示。

### Phase 3：基础传输

目标：

- 实现本机 Windows 中转 SCP/SFTP 传输。

任务：

- 实现 transfer task model。
- 实现任务队列。
- 实现 SFTP/SCP 下载流。
- 实现 SFTP/SCP 上传流。
- 实现 A -> Windows -> B 中转复制。
- 实现进度、速度、取消、失败日志。

验收：

- 两台不能互相 SSH 的设备，也能通过 Windows 中转传输。
- 底部任务区显示进度和速度。
- 失败任务可以查看错误。

### Phase 4：TurboFile 集成

目标：

- 集成现有 TurboFile 的 rsync 直连传输能力。

任务：

- 从 `D:\Work\code\TurboFile` 定位 rsync 命令实现。
- 记录原始命令参数。
- 迁移命令生成逻辑。
- 迁移日志解析逻辑。
- 实现远程执行 rsync。
- 实现 rsync 模式进度显示。

验收：

- 两台 Linux 设备互通时可走 rsync。
- rsync 命令与现有 TurboFile 保持一致。
- 局域网速度达到原 TurboFile 级别。

### Phase 5：智能判断

目标：

- 自动选择直连 rsync 或本机中转。

任务：

- 实现 A 到 B SSH 可达性检测。
- 实现 rsync 可用性检测。
- 实现能力缓存。
- 实现策略选择器。
- 实现 fallback。
- 在任务 UI 显示实际使用策略。

验收：

- 用户不需要选择传输模式。
- 可直连时自动走 rsync。
- 不可直连时自动走 Windows 中转。
- 直连失败时能自动降级并记录原因。

### Phase 6：增强功能

目标：

- 补齐 TurboFile 现有核心体验。

任务：

- 图片预览。
- 文本查看与编辑。
- 远程终端。
- 新建文件和文件夹。
- 删除、重命名。
- 同设备复制、剪切。
- 压缩、解压。
- 拖拽传输。
- 文件冲突处理。

验收：

- 常见文件管理操作完整可用。
- 左右设备均可打开终端。
- 图片浏览体验接近或超过现有 TurboFile。

### Phase 7：打包发布

目标：

- 生成可分发 Windows 桌面程序。

任务：

- 修改图标、产品名、应用 ID。
- 禁用遥测。
- 清理无关功能和内置扩展。
- 打包内置 SSH/SFTP/SCP/rsync 运行时。
- 构建 `TurboFile.exe`。
- 在干净 Windows 环境测试。

验收：

- 可安装或直接运行。
- 无需服务端配置。
- 无需安装 OpenSSH。
- 能添加设备、浏览文件、传输文件、打开终端。

## 18. 质量标准

每个阶段必须满足：

- 可启动。
- 可回归验证。
- 关键错误有日志。
- UI 不阻塞。
- 敏感信息不明文落盘。
- 不破坏已完成阶段功能。

最低测试要求：

- 单元测试：策略判断、设备存储、路径处理、命令生成。
- 集成测试：SSH 连接、目录列表、SFTP 上传下载、rsync 命令执行。
- UI 验证：启动、双栏显示、任务进度、错误提示。
- 手工验收：真实 Linux 设备、两台互通设备、两台不互通设备。

## 18.1 指定验收设备矩阵

后续完成所有功能后，必须使用以下三类设备做完整验收：

1. 本机 Windows
   - 类型：local Windows。
   - 用途：验证本机文件浏览、本机中转、Windows 本地发起 SSH、Windows 到远程设备传输。

2. WSL2
   - Host：`127.0.0.1`
   - Name：`WSL2`
   - User：`warrior`
   - 用途：验证本机可达 Linux/WSL 目标、远程目录浏览、终端、SFTP/SCP、压缩解压。

3. 远程 Linux 服务器
   - Host：`36.33.34.59`
   - Name：`hello`
   - User：`hello`
   - Port：`5206`
   - Default path：`/home/hello`
   - 用途：验证非标准 SSH 端口、远程目录浏览、跨设备传输、fallback 中转、终端、图片预览和基础文件操作。

安全要求：

- 密码、私钥、口令只允许写入本机加密存储或运行时测试凭据。
- 禁止把密码写入源码、Markdown 文档、普通 JSON 示例、日志或最终回复。
- 测试日志中必须脱敏 host 以外的认证信息。

完整验收范围：

- 启动 TurboFile 桌面程序。
- 添加 / 保存 / 读取三类设备。
- SSH 连接测试。
- 左右双栏分别选择不同设备。
- 远程目录浏览。
- 本机 Windows 目录浏览。
- 文件上传、下载、A 到 B 传输。
- 不可直连时 Windows 本机中转。
- 可直连时 rsync 直连。
- 文件删除、重命名、新建文件、新建文件夹。
- 同设备复制 / 剪切。
- 图片预览。
- 文本查看和编辑。
- 终端多标签。
- 压缩和解压。
- 任务队列、进度、速度、失败日志。

## 19. 关键风险

1. VS Code 源码体量大
   - 应先隐藏和替换 UI，不急于物理删除模块。

2. 内置 SSH/SFTP/SCP 方案性能和兼容性
   - 先使用成熟库实现功能闭环，再根据瓶颈替换底层。

3. rsync 在 Windows 打包中的依赖问题
   - 直连 rsync 主要在远程 Linux 设备执行。
   - 本地是否需要 rsync 取决于 fallback 方案，优先避免本地 rsync 硬依赖。

4. 终端远程桥接复杂
   - 先复用 VS Code 本地 terminal UI。
   - 再用 SSH 会话桥接 PTY 数据。

5. 安全风险
   - 密码必须加密。
   - 日志禁止打印密码、私钥、token。
   - 命令拼接必须严格转义路径。

## 20. 后续第一步执行清单

下一步开发从 Phase 1 开始：

1. 检查 `D:\Work\code\vscode` 是否可正常构建。
2. 将 VS Code 源码 fork 或复制到 `D:\Work\code\TurboFile-Windows`。
3. 修改产品名称和基础配置。
4. 新建 TurboFile contribution。
5. 让应用启动后显示双栏 UI 壳。
6. 实现设备管理最小闭环。
7. 实现 SSH 测试连接。

## 21. 开发原则

- 优先复用 VS Code 现有能力。
- 优先复用 TurboFile 现有成熟逻辑。
- 不从零造 UI 框架。
- 不让用户手动选择传输策略。
- 不再依赖服务端配置。
- 不明文保存敏感信息。
- 每个阶段都必须能运行和验收。
- 大规模删除 VS Code 功能必须在核心功能稳定后进行。

## 22. 2026-05-02 开发进度记录

### 22.1 已完成

- 已在 `TurboFile-Windows` 中接入 VS Code 源码基础，并完成产品基础改名：
  - `package.json`：`turbofile-windows`
  - `product.json`：`TurboFile` / `TurboFile.exe` / 本地数据目录 `.turbofile`
- 已新增 TurboFile workbench 模块：
  - `src/vs/workbench/contrib/turbofile`
  - `src/vs/platform/turbofile`
  - `src/vs/workbench/services/turbofile`
- 已实现 Phase 1/Phase 2 的可运行骨架：
  - 启动后自动打开 TurboFile 双栏编辑器
  - 左右双栏文件浏览
  - 本机 Windows 目录加载
  - SSH/SFTP 远程目录加载接口
  - 设备添加表单
  - 设备元数据本地保存
  - 密码/私钥口令使用 VS Code Secret Storage 保存
- 已实现 Phase 3 的基础传输接口：
  - local -> local：本机复制
  - local -> ssh：SFTP upload
  - ssh -> local：SFTP download
  - ssh -> ssh：本机临时文件 relay fallback
- 已补充 UI 交互：
  - 文件行选择
  - 双击进入目录
  - `..` 返回上级
  - 拖拽来源标记
  - 中间按钮触发左右传输
- 已处理本机构建环境：
  - 使用本地 Node.js `22.22.1`
  - 适配 VS Build Tools 2026 / MSVC `v145`
  - 补齐 Electron `39.8.8`
  - 重建根目录 Electron ABI native modules
  - 补齐 `@vscode/ripgrep` 二进制
- 已验证：
  - `npm install` 成功
  - `npm run compile-check-ts-native` 成功
  - `npm run gulp compile-client` 成功
  - `.build/electron/TurboFile.exe` 可启动开发窗口
  - Playwright 截图确认双栏 UI 正常渲染
  - UI 端到端本地复制测试成功：`package.json` 从左侧复制到右侧 `.tmp`

### 22.2 当前限制

- 目录递归传输尚未接入，后续由 rsync/SFTP recursive 双路径实现。
- rsync 直连智能判断尚未接入，目前 ssh -> ssh 先走本机 relay fallback。
- 右键菜单、压缩/解压、终端多标签、图片预览还未完成迁移。
- VS Code 原生 Welcome、Chat、内置扩展仍未彻底移除，后续精简阶段处理。
- WSL2 和远程服务器的完整 SSH/SFTP 验收尚未执行到最终状态；文档中不保存任何密码。
## 23. 2026-05-03 开发进度记录

### 23.1 已完成

- 主进程传输能力从单文件扩展为文件/目录双模式：
  - local -> local：支持目录递归复制。
  - local -> ssh：支持 SFTP 文件上传和目录递归上传。
  - ssh -> local：支持 SFTP 文件下载和目录递归下载。
  - ssh -> ssh：优先尝试来源设备执行 rsync 直连；不可用时自动 fallback 到本机 SFTP relay。
- 新增基础文件操作服务：
  - 新建目录。
  - 删除文件/目录，目录支持递归删除。
  - 重命名文件/目录。
- 前端双栏 UI 已接入真实操作：
  - 工具栏刷新、搜索、删除、重命名、新建文件夹、打开终端。
  - 中间按钮支持左右方向传输文件或目录。
  - 状态栏显示传输策略、大小和错误信息。
- 终端入口已复用 VS Code 内置终端服务：
  - 创建 terminal instance。
  - 显式打开 panel。
  - focus 到当前 terminal。
- 设备测试：
  - 本机 Windows 浏览和本地传输已通过。
  - WSL2 `127.0.0.1:22` 使用本机私钥完成 ssh2 连接和远程目录浏览。
  - 远程 `36.33.34.59:5206` 使用本机私钥完成 ssh2 连接、远程目录浏览、SFTP 上传、新建目录、递归删除测试。
- 安全处理：
  - 未把任何密码写入源码、Markdown、测试脚本产物或最终日志。
  - 自动化测试使用本机已有私钥路径。

### 23.2 已验证

- `npm run compile-check-ts-native`：通过。
- `npm run gulp compile-client`：编译子进程完成并更新 `out/vs/workbench/contrib/turbofile` 产物。
- Playwright / CDP 验证：
  - 双栏 TurboFile UI 可启动。
  - 本地文件复制成功。
  - 本地目录递归复制成功。
  - WSL2 与远程 hello 设备目录浏览成功。
  - Windows -> hello SFTP 上传成功。
  - hello 远程测试目录递归删除成功。
  - 本地终端按钮可打开 VS Code terminal panel。

### 23.3 当前剩余限制

- rsync 直连依赖来源设备已经具备到目标设备的免密 SSH 能力；否则会自动回退到 SFTP relay。
- 远程 SSH 终端目前通过 VS Code terminal 启动 `ssh` 命令，后续需要改为完全基于内置 ssh2 PTY，才能彻底摆脱系统 OpenSSH。
- 图片预览、文本编辑、压缩/解压、任务速度曲线和完整打包安装器仍需继续迁移和完善。

## 24. 2026-05-03 第二轮开发进度记录

### 24.1 已完成

- 文件内容能力：
  - 新增 `readFile`，支持本地和 SSH 文件读取。
  - 新增 `writeFile`，支持本地和 SSH 文本保存。
  - 读取默认限制为 10MB，图片预览限制为 25MB，避免大文件卡死 UI。
- 预览和编辑 UI：
  - 双击普通文件或点击工具栏“预览/编辑”可打开覆盖层。
  - 文本文件支持直接编辑和保存。
  - 图片文件支持 data URL 内嵌预览。
  - 二进制文件显示不可预览提示。
- 归档能力：
  - 新增 `compressPath`。
  - 新增 `extractPath`。
  - 本机 Windows 使用 `tar.exe` 生成 zip 和解压，避免 PowerShell 参数传递问题。
  - 远程 Linux 使用 `tar` / `unzip`。
  - 解压目录和原文件同名冲突时自动使用 `_extracted` 后缀。
- 文件浏览稳定性：
  - 本地目录列表改为逐项容错，遇到无权限条目或异常 symlink 时跳过，不再让整个目录加载失败。
- UI 操作入口：
  - 新增压缩、解压、预览/编辑按钮。
  - 中间操作区新增剪切到左侧/右侧。
- SSH exec 稳定性：
  - 远程命令执行时主动 drain stdout，避免 tar 等命令已经完成但 IPC 状态不返回。

### 24.2 已验证

- `npm run compile-check-ts-native`：通过。
- `npm run gulp compile-client`：通过，`out` 产物已更新。
- 本机 Windows：
  - 文本预览成功。
  - 文本编辑保存成功。
  - PNG 图片预览成功。
  - zip 压缩成功。
  - zip 解压成功。
- 远程 hello：
  - SSH 文本预览成功。
  - SSH 文本编辑保存成功。
  - tar.gz 压缩成功。
  - tar.gz 解压成功。

### 24.3 当前剩余限制

- 远程终端仍是通过 VS Code terminal 启动系统 `ssh` 命令；后续要改为 ssh2 PTY 流式桥接，才能完全不依赖 Windows OpenSSH。
- 任务队列仍是轻量状态栏，还没有完整的并发队列、速度曲线、暂停/重试。
- VS Code 非目标模块仍以保守隐藏/不入口为主，尚未做彻底物理裁剪和最终安装包瘦身。

## 25. 2026-05-03 第三轮开发进度记录

### 25.1 已完成

- 远程终端已从系统 `ssh.exe` 切换为内置 `ssh2` PTY：
  - `ITurboFileSshService` 新增 SSH 终端会话 API。
  - 主进程通过 `ssh2.Client.shell()` 打开远程伪终端。
  - 终端数据通过 `onDynamicSshTerminalData` 流式转发到渲染进程。
  - 退出事件通过 `onDynamicSshTerminalExit` 回传给 VS Code terminal。
  - 支持终端输入、窗口 resize、SIGINT、关闭会话。
- VS Code terminal UI 已接入 `customPtyImplementation`：
  - 左右面板远程设备点击“终端”后创建 `TurboFileSshTerminalProcess`。
  - 不再配置 `executable: 'ssh'`，因此不需要 Windows 系统 OpenSSH 才能打开远程终端。
  - 保留 VS Code 终端面板、多标签、焦点和滚动缓冲能力。
- 远程终端进入当前文件面板目录：
  - WSL2 测试进入 `/home/warrior`。
  - hello 测试进入 `/home/hello`。

### 25.2 已验证

- `npm run compile-check-ts-native`：通过。
- `npm run gulp compile-client`：通过，`out` 产物已更新。
- Playwright / CDP UI 验证：
  - 右侧 WSL2 点击终端后创建 `TurboFile WSL2` 终端标签。
  - 在内置终端执行 `touch /tmp/turbofile_pty_test_*`，WSL2 侧确认文件存在并已清理。
  - 右侧切换到 hello 后点击终端，创建 `TurboFile hello` 终端标签。
  - 在内置终端执行 `touch /tmp/turbofile_pty_test_*`，hello 侧确认文件存在并已清理。
  - 验证后检查无残留 `ssh.exe` 进程，说明 TurboFile 终端链路没有启动系统 OpenSSH。
- 截图留档：
  - `.tmp/screenshots/20260503-220850/turbofile-hello-terminal.png`

### 25.3 当前剩余限制

- 任务队列仍为轻量状态栏，尚未实现完整的并发队列、速度曲线、暂停/重试。
- VS Code 非目标模块仍以隐藏入口为主，最终发布前还需要做安装包瘦身和产品化清理。
- rsync 直连仍要求源设备能免交互 SSH 到目标设备；不满足时会自动 fallback 到本机 SFTP relay。

## 26. 2026-05-03 第四轮开发进度记录

### 26.1 已完成

- 底部任务区从单行状态提示升级为任务队列视图：
  - 显示运行、成功、失败数量。
  - 显示最近 4 条任务。
  - 每条任务包含任务名、状态图标、详情、耗时、大小、速度、传输策略或错误信息。
  - 支持清空已完成任务，运行中的任务不会被清掉。
- 接入任务记录的操作：
  - 文件/目录复制传输。
  - 剪切后的来源删除清理。
  - 新建文件夹。
  - 删除。
  - 重命名。
  - 文本保存。
  - 压缩。
  - 解压。
  - SSH 连接测试。
  - 本地终端和内置 SSH 终端打开。
  - 同步入口会以失败/待实现任务记录呈现。
- UI 细节：
  - 任务栏高度调整为 148px，双栏主体仍保持自适应。
  - 运行中任务使用进度条和 loading 图标。
  - 成功/失败使用 VS Code testing 颜色变量。
  - 速度显示做了收敛，避免小文件低速时出现长小数。

### 26.2 已验证

- `npm run compile-check-ts-native`：通过。
- `npm run gulp compile-client`：通过，`out` 产物已更新。
- Playwright / CDP UI 验证：
  - TurboFile 双栏界面启动正常。
  - 任务栏初始状态显示正常。
  - 创建本地小文件并从 Windows 上传到 WSL2。
  - 任务队列出现 `复制 turbofile_task_ui_test.txt` 成功记录。
  - 记录中显示耗时、大小、速度和 `sftp-upload` 策略。
  - WSL2 侧确认文件存在。
  - 验证后已清理 Windows 和 WSL2 测试文件。

### 26.3 当前剩余限制

- 任务队列当前记录任务结果和粗粒度进度，后端传输还没有实时字节级进度回调。
- 暂停、恢复、重试、取消仍未接入。
- 最终安装包和 VS Code 非目标模块瘦身仍需继续推进。

## 27. 2026-05-03 第五轮开发进度记录

### 27.1 已完成

- 双栏文件区接入 VS Code 原生上下文菜单服务：
  - 文件右键菜单支持预览/编辑、传输到对侧、剪切到对侧、新建文件夹、重命名、删除、压缩、解压、打开终端和刷新。
  - 目录右键菜单将“预览/编辑”自动切换为“打开目录”。
  - 解压操作只在常见压缩包扩展名上启用，避免误操作。
  - 空白区域右键菜单支持新建文件夹、打开当前设备终端和刷新当前侧。
- 右键菜单动作复用既有 TurboFile 操作管线：
  - 传输仍走智能策略选择，优先使用已有的传输引擎。
  - 删除、重命名、压缩、解压、终端和刷新继续进入任务队列或状态提示。
  - 菜单命名按左右面板动态显示“上传到右侧 / 下载到左侧”等自然语言动作。

### 27.2 已验证

- `npm run compile-check-ts-native`：通过。
- `npm run gulp compile-client`：通过，`out` 产物已更新。
- Playwright / CDP UI 验证：
  - 在左侧 Windows 面板文件上右键，原生上下文菜单正常显示。
  - 菜单项包含“上传到右侧”“剪切到右侧”“重命名”“删除”“压缩”“打开终端”等动作。
  - 创建本地测试文件 `turbofile_context_menu_test.txt`，通过右键菜单“上传到右侧”上传到 WSL2。
  - 任务队列出现 `复制 turbofile_context_menu_test.txt` 成功记录。
  - 记录中显示耗时、大小、速度和 `sftp-upload` 策略。
  - WSL2 侧确认文件存在且大小一致。
  - 验证后已清理 Windows 和 WSL2 测试文件。

### 27.3 当前剩余限制

- 右键菜单已经覆盖主要文件操作，但多选批量操作仍未接入。
- 传输任务仍缺少实时字节级进度、暂停、恢复、重试和取消。
- 最终安装包、内置运行时打包和 VS Code 非目标模块瘦身仍需继续推进。

## 28. 2026-05-03 第六轮开发进度记录

### 28.1 已完成

- 中间操作区“同步目录”从占位入口升级为可执行同步：
  - 支持左右两侧选中项同步。
  - 两侧选中项不同名时，自动互相补齐缺失文件。
  - 两侧选中项同名时，按修改时间选择较新的文件覆盖到另一侧。
  - 同步内部复用 `transferItem`，继续走 TurboFile 智能传输策略。
  - 同步任务会记录总大小、耗时、速度和涉及的传输策略。
- 安全策略：
  - 未选中项目时只同步当前目录里的文件，不默认递归复制整棵目录树。
  - 当前目录下的目录不会被静默同步；目录需要选中后单独同步或使用传输。
  - 同步计划超过 20 项或包含目录时，会弹出确认，避免误触发大范围传输。
- 传输代码重构：
  - 新增 `transferItem` 内部执行函数。
  - `transferSelected` 和同步任务共用同一条传输管线，减少重复逻辑。
  - `TurboFileFileItem` 增加原始修改时间字段，用于较新文件判断。

### 28.2 已验证

- `npm run compile-check-ts-native`：通过。
- `npm run gulp compile-client`：通过，`out` 产物已更新。
- Playwright / CDP UI 验证：
  - 左侧 Windows 选中 `turbofile_sync_left.txt`，右侧 WSL2 选中 `turbofile_sync_right.txt` 后点击“同步目录”。
  - Windows 独有文件成功上传到 WSL2。
  - WSL2 独有文件成功下载到 Windows。
  - 任务队列显示同步完成 2 项，并记录 `sftp-upload, sftp-download`。
  - 同名文件 `turbofile_sync_newer.txt` 在 WSL2 侧更新，点击同步后成功覆盖 Windows 侧旧版本。
  - 任务队列显示同步完成 1 项，并记录 `sftp-download`。
  - 验证后已清理 Windows 和 WSL2 测试文件。

### 28.3 当前剩余限制

- 同步当前仍是选中项优先和当前目录文件级同步，尚未实现完整递归差异同步。
- 目录级同步已受确认保护，但还没有冲突预览和逐项选择界面。
- 传输任务仍缺少实时字节级进度、暂停、恢复、重试和取消。
- 最终安装包、内置运行时打包和 VS Code 非目标模块瘦身仍需继续推进。

## 29. 2026-05-04 第七轮开发进度记录

### 29.1 已完成

- 继续推进 TurboFile Windows 精简壳产品化：
  - `product.json` 将内置扩展列表清空，并保留合法的空 `builtInExtensionsEnabledWithAutoUpdates`，避免扩展扫描器读取缺失字段时报错。
  - 新增 `NullDefaultAccountService`，桌面、Web、Sessions 启动路径不再初始化 VS Code 默认 AI 账户服务。
  - `DefaultAccountService` 对缺失 `defaultChatAgent` 做兼容保护，避免残留副作用 import 再次触发启动崩溃。
  - 注册 VS Code 自带 `NullExtensionService`，并停用 native extension host，真正阻断扩展宿主和扩展市场链路。
- 移除或关闭非目标 VS Code 功能入口：
  - Chat / Inline Chat / MCP UI。
  - Git / SCM / Debug UI。
  - 扩展管理 UI 和扩展市场相关贡献。
  - Notebook / Interactive Notebook / REPL Notebook。
  - Testing、Tasks、Remote、Remote Tunnel、Browser View。
  - Workbench Search、Search Editor、Surveys、Welcome / Startup Page、Update UI。
  - Multi Diff、Edit Sessions、编辑遥测和 Bracket Pair telemetry。
  - Terminal Chat / Agent Tools，仅保留普通终端能力。
- 保留核心依赖但移除非目标副作用：
  - 可访问性信号服务仍注册，保证通知中心等核心 Workbench 组件正常运行。
  - 可访问性信号中的 Debug / Editor property 贡献已停用，避免依赖 Debug 服务。

### 29.2 已验证

- `product.json` JSON 解析：通过。
- `npm run compile-check-ts-native`：通过。
- `npm run gulp compile-client`：通过，`out` 产物已更新。
- Playwright / CDP 全新用户目录启动验证：
  - 使用 `user-data-noise7` 启动 TurboFile。
  - TurboFile 双栏界面自动打开。
  - 底部任务队列正常显示 `任务队列 · 运行 0 · 成功 0 · 失败 0`。
  - 左侧本机 Windows 面板正常加载文件。
  - 控制台仅剩 `AccountPolicyGate` inactive 信息日志，无 Workbench 启动错误。
- 后端关键功能回归：
  - 本机 Windows 文件列表和本机到本机复制通过，策略为 `local-copy`。
  - WSL2 SSH 连接、目录创建、远程写入/读取、列表、上传、下载、压缩、解压和内置 SSH 终端通过。
  - 远程 `hello` SSH 连接、目录创建、远程写入/读取、列表、上传、下载、压缩、解压和内置 SSH 终端通过。
  - WSL2 到 `hello` 的 SSH 到 SSH 智能传输通过；本次自动选择 `sftp-relay`，验证了无法直连时的本机中转 fallback。
  - 验证完成后已清理本机、WSL2 和远程测试目录。

### 29.3 当前剩余限制

- 标题栏仍保留少量 VS Code 原生按钮和菜单文案，例如 `Open in Agents`、布局按钮、账户和管理入口，后续需要继续做 TurboFile 产品级隐藏或替换。
- 扩展宿主已禁用，后续如果需要主题、语言包或文件类型能力，必须使用主程序内置实现，不能依赖 VS Code 扩展机制。
- 最终安装包、内置 SSH / rsync / 运行时打包和发布目录瘦身仍需继续推进。

## 30. 2026-05-04 第八轮开发进度记录

### 30.1 已完成

- Windows x64 绿色版发布目录已生成：
  - 输出目录：`D:\Work\code\VSCode-win32-x64`
  - 主程序：`D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - 当前产物形态为 VS Code / Electron 绿色目录，可直接运行，后续再继续做单文件或轻量安装包封装。
- Windows x64 轻量 zip 包已生成：
  - 输出文件：`D:\Work\code\TurboFile-win32-x64.zip`
  - 大小约 234 MB。
  - SHA256：`D27E76EBFD0136F561738B3B63DC7AC9BF0A56A3348E4B2B5DF02325C20C4B3E`
- Windows x64 用户级安装包已生成：
  - 构建输出：`D:\Work\code\TurboFile-Windows\.build\win32-x64\user-setup\TurboFileSetup.exe`
  - 便捷取用副本：`D:\Work\code\TurboFileSetup.exe`
  - 大小约 155 MB。
  - SHA256：`1A7187810ADC01D1A1DDD9016E7C03238470DEE854962C087C3F4D4D2CA9091E`
- Windows 本机默认路径产品化：
  - 左右本机面板不再硬编码 `D:\Work\code`。
  - 默认路径改为 `INativeEnvironmentService.userHome.fsPath`，无法获取时回退到 `C:\`。
- 修复并固化 Windows 打包链路：
  - `build/gulpfile.vscode.ts` 新增 Electron 本地缓存准备逻辑，优先复用 `.build/downloads/electron-v39.8.8-win32-x64.zip`。
  - `electronConfig` 传入本地 `cacheRoot` 与禁用 checksum 下载选项，避免打包阶段依赖 GitHub 网络。
  - 本地 `@vscode/gulp-electron` 下载桥接已补齐 `cacheRoot` / checksum 参数透传，解决 `SHASUMS256.txt` 网络超时导致的打包失败。

### 30.2 已验证

- `npx gulp vscode-win32-x64-ci`：通过，耗时约 1.67 分钟。
- `npx gulp vscode-win32-x64`：通过，重新生成 optimized `out-vscode` 并打包 Windows x64 绿色目录。后续有 Workbench 源码改动时必须使用完整任务，不能只跑 `vscode-win32-x64-ci`。
- 打包产物检查：
  - `TurboFile.exe` 存在。
  - 文件大小约 201 MB。
  - 发布目录包含 Electron 运行所需的 `resources`、`bin`、`locales`、Chromium pak、dll 等文件。
  - `TurboFile-win32-x64.zip` 已生成并完成 SHA256 校验。
- 安装包构建验证：
  - `npx gulp vscode-win32-x64-inno-updater`：通过，发布目录补齐 `tools\inno_updater.exe` 和 `vcruntime140.dll`。
  - `npx gulp vscode-win32-x64-user-setup`：通过，生成 `TurboFileSetup.exe`。
  - `build\gulpfile.vscode.win32.ts` 对非 git 工作目录提供 `0000000000` commit fallback，避免 Inno Setup 任务在本地定制目录中失败。
  - `build\win32\code.iss` 输出文件名改为 `{#NameShort}Setup`，安装包不再使用 `VSCodeSetup.exe`。
- 安装包运行验证：
  - 使用 `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART` 静默安装到 `.tmp\installer-test-app`，退出码 0。
  - 安装后 `TurboFile.exe` 存在并可启动。
  - CDP 连接成功，页面标题为 `TurboFile - TurboFile`。
  - TurboFile 双栏主界面、本机 Windows 面板和任务队列正常显示。
  - 安装版全新用户目录下左右本机路径均为 `C:\Users\warrior`。
  - 截图留档：`.tmp\screenshots\20260504-installed-final\installed-launch.png`
  - 安装版用户目录日志已扫描，无明显 `error` / `exception` / `crash` / `uncaught` / `failed` 启动错误。
  - 临时安装已通过 `unins000.exe /VERYSILENT` 卸载，残留测试目录已清理。
- packaged 版启动验证：
  - 使用全新用户数据目录 `D:\Work\code\TurboFile-Windows\.tmp\user-data-packaged-final` 启动。
  - CDP 连接成功，页面标题为 `TurboFile - TurboFile`。
  - TurboFile 双栏主界面自动打开。
  - 本机 Windows 面板正常加载。
  - 全新用户目录下左右本机路径均为 `C:\Users\warrior`，确认不再绑定开发目录。
  - 底部任务队列正常显示。
  - 截图留档：`.tmp\screenshots\20260504-packaged-final\packaged-launch.png`
  - 最终路径验证截图：`.tmp\screenshots\20260504-final-homepath\packaged-homepath.png`
  - packaged 用户目录日志已扫描，无明显 `error` / `exception` / `crash` / `uncaught` / `failed` 启动错误。

### 30.3 当前剩余限制

- 当前交付物包含绿色目录、zip 包和用户级安装包；还不是真正单文件 exe。
- 标题栏和菜单仍有少量 VS Code 原生入口需要继续产品化隐藏或替换。
- 传输任务仍缺少实时字节级进度、暂停、恢复、重试和取消。

## 31. 2026-05-04 第九轮开发进度记录

### 31.1 已完成

- 继续推进 TurboFile 独立产品壳清理：
  - `TurboFileStartupContribution` 启动时为 `body` 添加 `turbofile-shell` 标记。
  - 启动时通过 `IWorkbenchLayoutService` 隐藏 Activity Bar、Primary Side Bar、Auxiliary Bar、Chat Bar 和 Status Bar。
  - 保留 VS Code 普通终端 Panel 能力，避免影响本机终端和内置 ssh2 远程终端。
- 精简 Workbench 外层 UI：
  - 隐藏编辑器 tab/title 区，TurboFile 双栏界面成为首屏主体验。
  - 隐藏标题栏 command center/search。
  - 隐藏标题栏右侧 `Open in Agents`、布局控制、侧栏切换、面板切换等 VS Code 原生按钮。
  - 隐藏顶部 `File / Edit / Selection / View / Go / ...` 菜单。
  - 隐藏底部 VS Code 状态栏，底部只保留 TurboFile 自己的任务队列区域。
  - 标题栏左侧增加轻量 `TurboFile` 产品标识，继续保留窗口控制按钮。
- 重新生成最终交付物：
  - 绿色目录：`D:\Work\code\VSCode-win32-x64`
  - 主程序：`D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - 绿色 zip：`D:\Work\code\TurboFile-win32-x64.zip`
  - 用户级安装包：`D:\Work\code\TurboFileSetup.exe`

### 31.2 已验证

- `npm run compile-check-ts-native`：通过。
- `npm run gulp compile-client`：通过。
- `npx gulp vscode-win32-x64`：通过，已重新生成 optimized `out-vscode` 和 Windows x64 绿色目录。
- `npx gulp vscode-win32-x64-inno-updater`：通过。
- `npx gulp vscode-win32-x64-user-setup`：通过，Inno Setup 生成 `TurboFileSetup.exe` 成功；构建期间仅出现语言包缺省翻译 warning。
- 源码开发窗口 CDP 验证：
  - `body.turbofile-shell` 生效。
  - 左右本机路径均为 `C:\Users\warrior`。
  - Activity Bar、Side Bar、Auxiliary Bar、Status Bar 均为 `display:none`。
  - 顶部菜单可见数量为 0。
  - 标题栏 VS Code 原生 action button 可见数量为 0。
  - 截图留档：`.tmp\screenshots\20260504-menu-status-clean\source-menu-status-clean.png`
- packaged 绿色版 CDP 验证：
  - 页面标题为 `TurboFile - TurboFile`。
  - TurboFile 双栏首屏自动打开。
  - 左右本机路径均为 `C:\Users\warrior`。
  - Activity Bar、Side Bar、Auxiliary Bar、Status Bar 均为 `display:none`。
  - 顶部菜单可见数量为 0。
  - 标题栏 VS Code 原生 action button 可见数量为 0。
  - 用户数据目录日志扫描无明显 `error` / `exception` / `crash` / `uncaught` / `failed` 启动错误。
  - 截图留档：`.tmp\screenshots\20260504-packaged-menu-status-final\packaged-menu-status-final.png`
- 安装包闭环验证：
  - `TurboFileSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART` 安装到临时目录成功，退出码 0。
  - 安装后的 `TurboFile.exe` 存在并可启动。
  - 页面标题为 `TurboFile - TurboFile`。
  - TurboFile 双栏首屏、菜单/状态栏隐藏规则和本机默认路径均正常。
  - 用户数据目录日志扫描无明显启动错误。
  - 截图留档：`.tmp\screenshots\20260504-installed-menu-status-final\installed-menu-status-final.png`
  - 临时安装目录已卸载并清理。
- 最终产物 hash：
  - `D:\Work\code\TurboFileSetup.exe`
    - SHA256：`9F3BCDC00B986D46E098A77BE6AADEBF12E9DB92B63D9B352817FA1608433E7C`
    - 大小：`162,506,429` bytes
  - `D:\Work\code\TurboFile-win32-x64.zip`
    - SHA256：`F0EC282AC668557DB86133E26DDE66D67C45F641E0281DB723E7801F5E22E165`
    - 大小：`245,234,295` bytes

### 31.3 当前剩余限制

- 当前交付物仍是绿色目录 + zip + 用户级安装包，尚未做真正单文件 exe。
- 顶部菜单已经隐藏，后续如果需要菜单，应做成 TurboFile 原生命令菜单，而不是恢复 VS Code 菜单。
- 传输任务仍缺少实时字节级进度、暂停、恢复、重试和取消。

## 32. 2026-05-04 第十轮开发进度记录

### 32.1 已完成

- 传输任务接入实时字节级进度：
  - `ITurboFileTransferRequest` 新增 `progressId`。
  - 新增动态 IPC 事件 `onDynamicTransferProgress(progressId)`，用于从主进程向 Workbench 推送传输进度。
  - 新增 `ITurboFileTransferProgressEvent`，包含已传输字节数、总字节数、阶段和详情。
  - local -> local 改为流式复制，可按字节回调进度。
  - local -> ssh、ssh -> local 接入 ssh2-sftp-client 的 `fastPut` / `fastGet` step 回调。
  - ssh -> ssh fallback relay 拆分为 `relay-download` 和 `relay-upload` 两个阶段，任务总量按下载 + 上传合并统计。
  - rsync direct 当前保持完成态回传；后续如需字节级 rsync 进度，需要解析远端 rsync `--info=progress2` 输出。
- 底部任务队列显示增强：
  - 运行中任务显示 `已传输 / 总大小`。
  - 运行中任务实时计算当前吞吐速度。
  - 完成任务继续显示最终大小、耗时、速度和传输策略。
- 修复 VS Code IPC 动态事件接入细节：
  - 动态事件命名使用 `onDynamic...` 前缀，避免代理端找不到方法。
  - 动态事件方法使用原型方法语法，避免 enumerable arrow property 被 IPC wrapper 当成普通属性处理。
- 重新生成最终交付物：
  - 绿色目录：`D:\Work\code\VSCode-win32-x64`
  - 主程序：`D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - 绿色 zip：`D:\Work\code\TurboFile-win32-x64.zip`
  - 用户级安装包：`D:\Work\code\TurboFileSetup.exe`

### 32.2 已验证

- 编译和打包：
  - `npm run compile-check-ts-native`：通过。
  - `npm run gulp compile-client`：通过。
  - `npx gulp vscode-win32-x64`：通过，已重新生成 optimized `out-vscode` 和 Windows x64 绿色目录。
  - `npx gulp vscode-win32-x64-inno-updater`：通过。
  - `npx gulp vscode-win32-x64-user-setup`：通过，已重新生成 `TurboFileSetup.exe`。
- 主进程传输进度事件验证：
  - 使用 256 MB 本地测试文件执行 local -> local 复制。
  - 结果策略为 `local-copy`，复制字节数 `268,435,456`。
  - 捕获进度事件 `4` 条。
  - 首条事件阶段为 `prepare`，末条事件阶段为 `complete`，最终已传输字节数等于总字节数。
- Workbench UI 传输任务验证：
  - 使用 256 MB 本地测试文件在双栏 UI 内执行复制。
  - 任务队列最终显示复制成功，大小 `256.0 MB`，耗时 `471 ms`，速度约 `543.5 MB/s`，策略 `local-copy`。
  - 本地测试源文件和目标文件已清理。
  - 用户数据目录日志扫描无 `TypeError`、`ReferenceError`、`listener.dispose`、`onTransferProgress` 等异常。
- packaged 绿色版最终验证：
  - 使用全新用户数据目录 `D:\Work\code\TurboFile-Windows\.tmp\user-data-final-progress-packaged` 启动。
  - CDP 连接成功，页面标题为 `TurboFile - TurboFile`。
  - `body.turbofile-shell` 生效。
  - TurboFile 双栏数量为 `2`，路径栏数量为 `2`，中间传输区存在。
  - 顶部菜单可见数量为 `0`。
  - 标题栏 VS Code 原生 action button 可见数量为 `0`。
  - Activity Bar、Side Bar、Auxiliary Bar、Status Bar、Command Center 均为隐藏状态。
  - 日志扫描无明显启动错误。
  - 截图留档：`D:\Work\code\TurboFile-Windows\.tmp\screenshots\20260504-final-progress-packaged\packaged-final.png`
- 安装版最终验证：
  - 使用 `D:\Work\code\TurboFileSetup.exe` 静默安装到临时目录。
  - 安装后的 `TurboFile.exe` 可启动。
  - CDP 连接成功，页面标题为 `TurboFile - TurboFile`。
  - TurboFile 双栏、路径栏和中间传输区正常。
  - 顶部菜单、标题栏原生 action button、Activity Bar、Side Bar、Auxiliary Bar、Status Bar、Command Center 均隐藏。
  - 日志扫描无明显启动错误。
  - 截图留档：`D:\Work\code\TurboFile-Windows\.tmp\screenshots\20260504-installed-final-progress\installed-final.png`
- 最终产物 hash：
  - `D:\Work\code\TurboFileSetup.exe`
    - SHA256：`CA996533DD53013AD2C3CE2E066E1FC9DAF2EBA3586FCEFE1C4D21E27D8F50DC`
    - 大小：`162,513,173` bytes
  - `D:\Work\code\TurboFile-win32-x64.zip`
    - SHA256：`D3309E74396C6F83BD0416FEC023FC0C4EE3E1D38C59FBA3309E91B590236219`
    - 大小：`245,238,995` bytes

### 32.3 当前剩余限制

- 当前交付物仍是绿色目录 + zip + 用户级安装包，尚未做真正单文件 exe。
- rsync direct 已有自动优先策略，但实时字节级进度目前只覆盖 local-copy、SFTP upload/download 和 SFTP relay；rsync direct 仅回传完成态。
- 任务队列已有实时进度和速度，但暂停、恢复、重试、取消仍未接入。
- 完整递归差异同步、冲突预览、多选批量操作和进一步安装包瘦身仍可继续推进。

## 33. 2026-05-04 第十一轮开发进度记录

### 33.1 已完成

- 任务队列新增取消能力：
  - 公共服务接口新增 `cancelTransfer(progressId)`。
  - 主进程维护传输取消请求集合和活动取消 handler。
  - local-copy 通过 Node stream destroy 中断。
  - SFTP upload/download/relay 通过 step 回调检查取消状态，并在取消时关闭 SFTP/SSH channel。
  - rsync direct 执行期间支持 best-effort 关闭源 SSH client；取消时不再错误 fallback 到 SFTP relay。
  - 取消后的传输结果返回 `canceled: true`，前端任务状态标记为 `canceled`。
- 任务队列新增重试入口：
  - 运行中传输任务显示取消按钮。
  - 失败或已取消的传输任务显示重试按钮。
  - 重试任务复用原始 source side、target side 和 source item，重新进入同一条智能传输管线。
- UI 任务区增强：
  - 任务统计新增“取消”计数。
  - 已取消任务使用独立状态样式和 `circle-slash` 图标。
  - 任务行新增操作列，避免取消/重试按钮挤占任务名称和速度信息。
- 重新生成最终交付物：
  - 绿色目录：`D:\Work\code\VSCode-win32-x64`
  - 主程序：`D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - 绿色 zip：`D:\Work\code\TurboFile-win32-x64.zip`
  - 用户级安装包：`D:\Work\code\TurboFileSetup.exe`

### 33.2 已验证

- 编译和打包：
  - `npm run compile-check-ts-native`：通过。
  - `npm run gulp compile-client`：通过。
  - `npx gulp vscode-win32-x64`：通过，已重新生成 optimized `out-vscode` 和 Windows x64 绿色目录。
  - `npx gulp vscode-win32-x64-inno-updater`：通过。
  - `npx gulp vscode-win32-x64-user-setup`：通过，已重新生成 `TurboFileSetup.exe`。
- 主进程取消测试：
  - 创建 512 MB 本地测试文件。
  - 在传输 `prepare` 进度事件中调用 `cancelTransfer(progressId)`。
  - `transferFile` 返回 `ok: false`、`strategy: local-copy`、`canceled: true`。
  - 目标文件大小为 `0`，测试文件已清理。
- Workbench UI 取消测试：
  - 创建 2 GB 本地测试文件。
  - 通过双栏 UI 从左侧复制到右侧临时目录。
  - 点击运行中任务的取消按钮。
  - 任务统计显示 `运行 0 · 成功 0 · 失败 0 · 取消 1`。
  - 任务行 class 为 `is-canceled`，并显示可用的“重试任务”按钮。
  - 截图留档：`D:\Work\code\TurboFile-Windows\.tmp\screenshots\20260504-cancel-ui\cancel-ui.png`
- Workbench UI 重试测试：
  - 点击已取消任务的“重试任务”按钮。
  - 新任务以 `重试 turbofile_cancel_source.bin` 开始运行。
  - 再次取消后任务统计显示 `取消 2`。
  - 两条已取消任务均保留可用重试按钮。
  - UI 测试日志扫描无明显异常，2 GB 测试源文件和目标残留已清理。
- packaged 绿色版最终验证：
  - 使用全新用户数据目录 `D:\Work\code\TurboFile-Windows\.tmp\user-data-final-cancel-packaged` 启动。
  - 页面标题为 `TurboFile - TurboFile`。
  - `body.turbofile-shell` 生效。
  - TurboFile 双栏数量为 `2`。
  - 任务栏显示 `任务队列 · 运行 0 · 成功 0 · 失败 0 · 取消 0`。
  - 顶部菜单和标题栏 VS Code 原生 action button 可见数量为 `0`。
  - 日志扫描无明显启动错误。
  - 截图留档：`D:\Work\code\TurboFile-Windows\.tmp\screenshots\20260504-final-cancel-packaged\packaged-cancel-smoke.png`
- 安装版最终验证：
  - 使用 `D:\Work\code\TurboFileSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER /MERGETASKS=!runcode` 静默安装到临时目录。
  - 安装后的 `TurboFile.exe` 可启动。
  - 页面标题为 `TurboFile - TurboFile`。
  - `body.turbofile-shell` 生效。
  - TurboFile 双栏数量为 `2`。
  - 任务栏显示 `任务队列 · 运行 0 · 成功 0 · 失败 0 · 取消 0`。
  - 顶部菜单可见数量为 `0`。
  - 日志扫描无明显启动错误。
  - 临时安装已通过 `unins000.exe /VERYSILENT` 卸载并清理。
- 最终产物 hash：
  - `D:\Work\code\TurboFileSetup.exe`
    - SHA256：`DD20E759FDEAB283A6B9E2757CB2B57A3CF22C28D0275991F17545B5B38DD197`
    - 大小：`162,516,735` bytes
  - `D:\Work\code\TurboFile-win32-x64.zip`
    - SHA256：`FBED8F13AA141A523F0F2DBAE6AFE51B332E28839FD5FC5CB362A2CA6C00CC3E`
    - 大小：`245,243,035` bytes

### 33.3 当前剩余限制

- 当前已支持取消和重试；暂停、恢复仍未接入。
- rsync direct 取消是 best-effort 关闭 SSH client，尚未实现 rsync 进度解析和远端进程精确控制。
- 重试当前覆盖传输任务；同步、压缩、解压等非传输任务尚未做一键重试。
- 完整递归差异同步、冲突预览、多选批量操作、单文件 exe 和安装包瘦身仍可继续推进。

## 34. 2026-05-04 第十二轮开发进度记录

### 34.1 已完成

- rsync direct 接入实时进度解析：
  - `ITurboFileTransferProgressEvent.phase` 新增 `rsync-direct` 阶段。
  - Workbench 任务详情新增“直连传输”阶段文案。
  - 远端 rsync 命令从 `--info=stats2` 升级为 `--info=progress2,stats2`。
  - 主进程 `execRemote` 增加 stdout/stderr 输出回调，继续保持 drain stdout，避免远端命令完成后 IPC 不返回。
  - 新增 rsync progress2 输出解析逻辑，支持形如 `1,048,576 12% ...` 的字节进度行。
  - rsync 输出做短缓冲，避免 SSH chunk 边界切断进度行导致解析丢失。
  - direct rsync 执行前先计算源路径总大小，用于任务栏显示 `已传输 / 总大小`。
  - 如果源大小无法提前计算，则以 rsync 输出的最大已传输字节数作为兜底大小。
- ssh -> ssh fallback 行为保持：
  - direct rsync 不可用时仍自动 fallback 到本机 SFTP relay。
  - direct rsync 的 best-effort 取消逻辑保留，取消时不会继续 fallback。
- 重新生成最终交付物：
  - 绿色目录：`D:\Work\code\VSCode-win32-x64`
  - 主程序：`D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - 绿色 zip：`D:\Work\code\TurboFile-win32-x64.zip`
  - 用户级安装包：`D:\Work\code\TurboFileSetup.exe`

### 34.2 已验证

- 编译和打包：
  - `npm run compile-check-ts-native`：通过。
  - `npm run gulp compile-client`：通过。
  - `npx gulp vscode-win32-x64`：通过，已重新生成 optimized `out-vscode` 和 Windows x64 绿色目录。
  - `npx gulp vscode-win32-x64-inno-updater`：通过。
  - `npx gulp vscode-win32-x64-user-setup`：通过，已重新生成 `TurboFileSetup.exe`。
- rsync progress2 解析器验证：
  - `32,768 0%` 解析为 `32768`。
  - `1,048,576 12%` 解析为 `1048576`。
  - `9,437,184 100%` 解析为 `9437184`。
  - `12,345,678 87%` 解析为 `12345678`。
- local-copy 传输进度回归：
  - 使用 128 MB 本地测试文件执行 local -> local 复制。
  - 结果策略为 `local-copy`，复制字节数 `134,217,728`。
  - 捕获进度事件 `4` 条。
  - 首条事件阶段为 `prepare`，末条事件阶段为 `complete`。
  - 目标文件大小为 `134,217,728`，测试文件已清理。
- ssh -> ssh 智能策略回归：
  - 使用本机已有 SSH key 连接 WSL2 和 hello。
  - WSL2 -> hello 小文件传输成功。
  - 当前网络/免密条件下 direct rsync 未成立，自动 fallback 到 `sftp-relay`。
  - 目标端读回文件成功，大小 `45` bytes。
  - 捕获进度阶段包含 `prepare`、`relay-upload`、`complete`，验证 direct 检测没有破坏 fallback。
  - WSL2 和 hello 远端测试目录已清理。
- packaged 绿色版最终验证：
  - 使用全新用户数据目录 `D:\Work\code\TurboFile-Windows\.tmp\user-data-rsync-progress-packaged` 启动。
  - 页面标题为 `TurboFile - TurboFile`。
  - `body.turbofile-shell` 生效。
  - TurboFile 双栏数量为 `2`。
  - 任务栏显示 `任务队列 · 运行 0 · 成功 0 · 失败 0 · 取消 0`。
  - 顶部菜单和标题栏 VS Code 原生 action button 可见数量为 `0`。
  - 截图留档：`D:\Work\code\TurboFile-Windows\.tmp\screenshots\20260504-rsync-progress-packaged\packaged-smoke.png`
- 安装版最终验证：
  - 使用 `D:\Work\code\TurboFileSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER /MERGETASKS=!runcode` 静默安装到临时目录。
  - 安装后的 `TurboFile.exe` 可启动。
  - 页面标题为 `TurboFile - TurboFile`。
  - `body.turbofile-shell` 生效。
  - TurboFile 双栏数量为 `2`。
  - 任务栏显示 `任务队列 · 运行 0 · 成功 0 · 失败 0 · 取消 0`。
  - 顶部菜单可见数量为 `0`。
  - 日志扫描无明显启动错误。
  - 临时安装已通过 `unins000.exe /VERYSILENT` 卸载并清理。
- 最终产物 hash：
  - `D:\Work\code\TurboFileSetup.exe`
    - SHA256：`148103B22E15BFFFEA60D03787B919633B685758FD8C17BAC1A6A8B50A1B13DF`
    - 大小：`162,516,774` bytes
  - `D:\Work\code\TurboFile-win32-x64.zip`
    - SHA256：`4CF61C2F755705871C4FB47DD7786A56FD056926CAD854EFDF8BDF7636BF2702`
    - 大小：`245,244,141` bytes

### 34.3 当前剩余限制

- 当前环境验证到的是 direct rsync 不可用时的 fallback；真实 direct rsync 字节进度需要在源设备可免密 SSH 到目标设备且远端具备 rsync 时继续做实机验收。
- rsync direct 取消仍是 best-effort 关闭 SSH client，尚未实现远端 rsync 进程 PID 级控制。
- 暂停、恢复仍未接入。
- 完整递归差异同步、冲突预览、多选批量操作、单文件 exe 和安装包瘦身仍可继续推进。

## 35. 2026-05-04 第十三轮开发进度记录

### 35.1 已完成

- 同步能力从浅层文件同步升级为递归差异同步：
  - 左右两侧都选中目录时，按两个目录的内容根进行递归扫描和双向差异比较。
  - 一侧选中目录、对侧当前目录中存在同名目录时，自动以同名目录作为对侧同步根。
  - 未选中目录时保留原来的轻量同步策略，只同步当前列表中的文件，避免误扫整个用户目录。
  - 递归同步按相对路径比较文件，支持嵌套目录中的缺失文件、较新文件和大小不同文件。
  - 空目录会作为目录项参与缺失同步，避免只同步文件时丢失空目录结构。
  - 同步计划项新增 `relativePath`、`targetPath` 和 `recursive` 字段，递归文件会写入对侧正确的子路径。
  - `transferItem` 支持目标路径覆盖，递归同步可以复用同一条智能传输管线，不再把嵌套文件落到目标根目录。
  - 递归扫描设置 5000 项上限，超出时提示进入更小目录后再同步。
- 同步前新增预览确认：
  - 每次同步都会弹出预览确认。
  - 预览显示同步模式、总项数、新增/较新/大小不同统计。
  - 预览列出前 14 条相对路径和传输方向，例如 `nested/a.txt`。
  - 用户取消时任务会标记为已取消同步，不会执行传输。
- SSH 空密码兼容修复：
  - `createConnectConfig` 改为在 `password !== undefined` 时传入 password。
  - 兼容旧配置里明确保存为空字符串的 password 字段，避免被误判为未配置认证字段。
- 继续保持智能传输策略：
  - 递归同步的每个文件步骤仍调用 `transferFile`。
  - 本机、本机到 SSH、SSH 到本机、SSH 到 SSH direct/fallback 的策略选择保持统一。
- 重新生成最终交付物：
  - 绿色目录：`D:\Work\code\VSCode-win32-x64`
  - 主程序：`D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - 绿色 zip：`D:\Work\code\TurboFile-win32-x64.zip`
  - 用户级安装包：`D:\Work\code\TurboFileSetup.exe`

### 35.2 已验证

- 编译验证：
  - `npm run compile-check-ts-native`：通过。
  - `npm run gulp compile-client`：通过，`out` 产物已更新。
- Playwright / CDP 递归同步 UI 验证：
  - 在左右本机面板分别选中 `TurboFileSyncLeft` 和 `TurboFileSyncRight` 两个目录。
  - 点击中间“同步目录”按钮后弹出确认预览。
  - 预览显示 `将同步 7 项`、模式为 `选中目录递归差异同步`。
  - 预览包含相对路径 `emptyLeftDir`、`nested/a.txt`、`common.txt`、`left-only.txt`、`emptyRightDir` 等。
  - 接受确认后任务完成，策略为 `local-copy`。
  - 验证结果：
    - 右侧 `common.txt` 被左侧较新内容覆盖。
    - 右侧获得 `nested/a.txt`、`left-only.txt`、`emptyLeftDir`。
    - 左侧获得 `nested/b.txt`、`right-only.txt`、`emptyRightDir`。
  - 截图留档：`D:\Work\code\TurboFile-Windows\.tmp\sync-ui-after.png`。
- 服务层本机回归：
  - `listLocalDirectory` 通过。
  - local -> local 复制通过，策略 `local-copy`，内容校验通过。
- 服务层 WSL2 回归：
  - 旧配置空密码连接会被 WSL2 sshd 拒绝，本机 `ssh warrior@127.0.0.1` 同样返回 `Permission denied (publickey,password)`。
  - 使用 WSL2 用户私钥认证后，TurboFile 内置 ssh2 连接通过。
  - WSL2 目录列表、上传、读取、下载、删除全部通过。
- 服务层 `hello` 回归：
  - SSH 连接通过。
  - `/home/hello` 目录列表通过。
  - Windows -> hello 上传通过，策略 `sftp-upload`。
  - hello 远程读取通过。
  - hello -> Windows 下载通过，策略 `sftp-download`。
  - 远程测试文件删除通过。
- SSH -> SSH 智能传输回归：
  - WSL2 -> hello 小文件传输通过。
  - 当前环境 direct rsync 条件不成立，自动 fallback 到 `sftp-relay`。
  - hello 侧读回内容正确。
  - WSL2 和 hello 两侧测试文件已清理。
- packaged 绿色版最终烟测：
  - 使用全新用户数据目录 `D:\Work\code\TurboFile-Windows\.tmp\user-data-recursive-sync-packaged` 启动。
  - 页面标题为 `TurboFile - TurboFile`。
  - `body.turbofile-shell` 生效。
  - TurboFile 双栏数量为 `2`，路径栏均为 `c:\Users\warrior`。
  - 中间操作区 5 个按钮存在。
  - 顶部菜单、标题栏 VS Code 原生 action button、Activity Bar、Status Bar 实际可见数量均为 `0`。
  - 用户数据目录日志扫描无明显 `TypeError`、`ReferenceError`、`uncaught`、`crash`、`exception`、`ERR_` 或 `error`。
  - 截图留档：`D:\Work\code\TurboFile-Windows\.tmp\screenshots\recursive-sync-packaged.png`。
- 安装包最终烟测：
  - `D:\Work\code\TurboFileSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER /MERGETASKS=!runcode` 安装到临时目录成功，退出码 `0`。
  - 安装后的 `TurboFile.exe` 可启动。
  - 页面标题为 `TurboFile - TurboFile`。
  - `body.turbofile-shell` 生效。
  - TurboFile 双栏数量为 `2`，路径栏均为 `c:\Users\warrior`。
  - 顶部菜单和标题栏 VS Code 原生 action button 实际可见数量均为 `0`。
  - 用户数据目录日志扫描无明显启动错误。
  - 截图留档：`D:\Work\code\TurboFile-Windows\.tmp\screenshots\recursive-sync-installed.png`。
  - 临时安装目录已通过 `unins000.exe /VERYSILENT` 卸载并清理。
- 最终产物 hash：
  - `D:\Work\code\TurboFileSetup.exe`
    - SHA256：`2F1E3CCA024F66602D3C9AC056AF8D6AC11CAF5525C1602E9395C6B0557DA7B5`
    - 大小：`162,522,936` bytes
  - `D:\Work\code\TurboFile-win32-x64.zip`
    - SHA256：`4B96F9CC93BC2AE254009229E66607748D466900A306A5378122C779222A085A`
    - 大小：`245,248,396` bytes

### 35.3 当前剩余限制

- 同步预览目前是确认弹窗，不是可逐项勾选、跳过、改方向的冲突解决界面。
- 递归扫描上限为 5000 项，超大目录应先进入更小范围后再同步，后续可做后台扫描和分页预览。
- 当前 WSL2 环境不接受空密码 SSH；设备管理中需要配置可用密码或私钥。软件的私钥路径/私钥内容链路已经验证可用。
- 暂停、恢复、多选批量操作、单文件 exe 和安装包瘦身仍可继续推进。

## 36. 2026-05-04 第十四轮开发进度记录

### 36.1 已完成

- 同步预览从系统确认弹窗升级为 TurboFile 原生可勾选面板：
  - 每次同步前显示独立遮罩面板，保持 VS Code / TurboFile 暗色控件风格。
  - 同步计划逐项展示，可按文件或目录勾选/跳过。
  - 顶部统计展示总项数、已选择项数、缺失项、较新项和大小不同项。
  - 工具栏新增“全选”和“清空”操作，主按钮在未选择任何项目时自动禁用。
  - 取消面板时不会执行任何传输，开始同步时只执行被勾选的计划项。
  - 任务执行前会进入“等待确认同步范围”状态，确认后继续复用原有智能传输管线。
- 同步执行链路保持兼容：
  - 递归目录差异扫描、相对路径目标写入和空目录同步逻辑不变。
  - `transferItem` 的 `targetPath` 覆盖能力继续用于递归同步。
  - 本机、SFTP 上传、SFTP 下载、SSH 到 SSH direct/fallback 策略继续统一由 `transferFile` 选择。
- UI 细节补齐：
  - 新增同步预览行、方向标识、原因标签、元信息和滚动列表样式。
  - 补齐主按钮/次按钮 disabled 样式，避免清空选择后仍像可点击状态。
  - 同步预览面板最大宽度和最大高度做了响应式限制，长路径不会挤压底部任务区。

### 36.2 已验证

- 编译验证：
  - `npm run compile-check-ts-native`：通过。
  - `npm run gulp compile-client`：通过，`out` 产物已更新。
- Playwright / CDP 可勾选同步预览 UI 验证：
  - 左右本机面板分别进入 `C:\Users\warrior\TurboFileSyncPickLeft` 和 `C:\Users\warrior\TurboFileSyncPickRight`。
  - 选中两个同步目录后点击“同步目录”，原生同步预览面板正常弹出。
  - 面板显示 5 项同步计划，默认全选。
  - 取消勾选右侧独有文件 `right-only.txt` 后开始同步。
  - 任务队列显示同步成功，实际完成 4 项，策略为 `local-copy`。
  - 文件结果验证：
    - 右侧 `common.txt` 被左侧较新内容覆盖。
    - 右侧获得 `nested/a.txt` 和 `left-only.txt`。
    - 左侧获得 `nested/b.txt`。
    - 被取消勾选的 `right-only.txt` 没有复制回左侧。
- 服务层完整回归：
  - 本机 Windows：目录列表、写入/读取、本机复制、压缩、解压、删除通过，策略为 `local-copy`。
  - WSL2 `127.0.0.1 / warrior`：SSH 连接、目录列表、写入/读取、上传、下载、重命名、压缩、解压、内置 SSH 终端通过。
  - 远程 `hello`：SSH 连接、目录列表、写入/读取、上传、下载、重命名、压缩、解压通过。
  - WSL2 -> hello：SSH 到 SSH 智能传输通过；当前环境 direct rsync 条件不成立，自动 fallback 到 `sftp-relay`，目标端读回内容正确。
  - 验证完成后已清理本机、WSL2 和 hello 侧临时测试目录。

### 36.3 打包与最终烟测

- Windows x64 绿色目录已重新生成：
  - 输出目录：`D:\Work\code\VSCode-win32-x64`
  - 主程序：`D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - 主程序大小：`210,948,096` bytes
- Windows x64 绿色 zip 已重新生成：
  - 输出文件：`D:\Work\code\TurboFile-win32-x64.zip`
  - SHA256：`8CAC6E9BA7FB5C945FD3689DD0C6B656DE01E2662113773EF0A43B16D82C1E70`
  - 大小：`245,251,827` bytes
- Windows x64 用户级安装包已重新生成：
  - 输出文件：`D:\Work\code\TurboFileSetup.exe`
  - SHA256：`7816D6A3DC3F77FEA9476D94EF9C8CD4B4EDBA08C292283E2347CC45744B6A60`
  - 大小：`162,526,701` bytes
- packaged 绿色版最终烟测：
  - 使用全新用户数据目录 `D:\Work\code\TurboFile-Windows\.tmp\user-data-sync-picker-packaged` 启动。
  - 页面标题为 `TurboFile - TurboFile`。
  - `body.turbofile-shell` 生效。
  - TurboFile 双栏数量为 `2`，默认路径为 `c:\Users\warrior`。
  - 顶部菜单、标题栏原生 action button、Activity Bar、Status Bar 实际可见数量为 `0`。
  - 启动日志扫描无 `TypeError`、`ReferenceError`、`uncaught`、`crash`、`exception`、`ERR_` 或明显 `error`。
  - 截图留档：`D:\Work\code\TurboFile-Windows\.tmp\screenshots\sync-picker-packaged.png`
- 安装版最终烟测：
  - `D:\Work\code\TurboFileSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER /MERGETASKS=!runcode` 安装到临时目录成功，退出码 `0`。
  - 安装后的 `TurboFile.exe` 可启动。
  - 页面标题为 `TurboFile - TurboFile`。
  - `body.turbofile-shell` 生效。
  - TurboFile 双栏数量为 `2`，默认路径为 `c:\Users\warrior`。
  - 顶部菜单、标题栏原生 action button、Activity Bar、Status Bar 实际可见数量为 `0`。
  - 在强制结束进程前扫描全新安装版用户数据目录，异常关键字匹配数为 `0`。
  - 截图留档：`D:\Work\code\TurboFile-Windows\.tmp\screenshots\sync-picker-installed.png`
  - 临时安装目录已通过 `unins000.exe /VERYSILENT` 卸载并清理。

### 36.4 当前剩余限制

- 同步预览现在支持逐项勾选和跳过，但还不支持在预览内手动改方向或做复杂冲突合并。
- 递归扫描上限仍为 5000 项；超大目录后续应做后台扫描、分页预览和按子目录分批确认。
- 当前环境验证到的是 WSL2 -> hello 无法 direct rsync 时的 `sftp-relay` fallback；真实 direct rsync 仍需要源设备免密 SSH 到目标设备并具备 rsync。
- 暂停、恢复、多选批量操作、单文件 exe 和安装包瘦身仍可继续推进。

## 37. 2026-05-04 第十五轮开发进度记录

### 37.1 已完成

- 同步预览新增冲突项方向切换能力：
  - 同步计划项拆分为当前执行方向和可选反向执行方向。
  - `missing` 缺失项仍只支持勾选/跳过，避免从不存在的一侧复制。
  - `newer` 和 `size` 冲突项保存另一侧文件作为 `reverse` 候选。
  - 点击预览行中的方向按钮后，当前行会切换为反向同步，最终提交的计划也会使用反向的 source、target 和 targetPath。
  - 递归同步下的反向 targetPath 会继续按相对路径写入对侧正确子路径。
- 预览 UI 细节增强：
  - 方向列从纯文本升级为带 `arrow-swap` 图标的按钮。
  - 可切换项显示 hover 和边框反馈，已反向项使用警告色提示。
  - 点击行空白区域仍可勾选/取消勾选；点击方向按钮不会误切换勾选状态。
  - 顶部提示文案更新为“冲突项可切换方向”，更贴近实际能力。

### 37.2 已验证

- 编译验证：
  - `npm run compile-check-ts-native`：通过。
  - `npm run gulp compile-client`：通过，`out` 产物已更新。
- Playwright / CDP 方向切换 UI 验证：
  - 创建本机目录 `C:\Users\warrior\TurboFileDirectionLeft` 和 `C:\Users\warrior\TurboFileDirectionRight`。
  - 两侧各放置一个同名 `conflict.txt`，左侧文件较新，默认同步方向为左 -> 右。
  - 选中左右两个目录后点击“同步目录”，预览面板显示 1 个 `大小不同` 冲突项。
  - 方向按钮可用，默认方向为左 -> 右。
  - 点击方向按钮后，行 class 变为 `is-reversed`，方向显示为右 -> 左，勾选状态保持不变。
  - 开始同步后任务成功完成 1 项，策略为 `local-copy`。
  - 文件结果验证：左侧 `conflict.txt` 被右侧内容覆盖，证明反向计划真实参与执行。
- 服务层完整回归：
  - 本机 Windows：复制、读取、压缩、解压、删除通过，策略为 `local-copy`。
  - WSL2 `127.0.0.1 / warrior`：SSH 连接、目录列表、写入、上传、下载和内置 SSH 终端通过。
  - 远程 `hello`：SSH 连接、目录列表、写入、上传、下载、压缩、解压通过。
  - WSL2 -> hello：SSH 到 SSH 智能传输通过；当前环境 direct rsync 条件不成立，自动 fallback 到 `sftp-relay`，目标端内容校验正确。
  - 验证完成后已清理本机、WSL2、hello 和临时服务回归目录。

### 37.3 打包与最终烟测

- Windows x64 绿色目录已重新生成：
  - 输出目录：`D:\Work\code\VSCode-win32-x64`
  - 主程序：`D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - 主程序大小：`210,948,096` bytes
- Windows x64 绿色 zip 已重新生成：
  - 输出文件：`D:\Work\code\TurboFile-win32-x64.zip`
  - SHA256：`631409B9A0D950B1124D508221C07894FF9E670ADBD1901DB612B4AFA4BF3D54`
  - 大小：`245,253,397` bytes
- Windows x64 用户级安装包已重新生成：
  - 输出文件：`D:\Work\code\TurboFileSetup.exe`
  - SHA256：`618C303A350A19883CFA1F98A6E546616634885FE86670EEB48B5B42D628ADC3`
  - 大小：`162,524,932` bytes
- packaged 绿色版最终烟测：
  - 使用全新用户数据目录 `D:\Work\code\TurboFile-Windows\.tmp\user-data-sync-direction-packaged` 启动。
  - 页面标题为 `TurboFile - TurboFile`。
  - `body.turbofile-shell` 生效。
  - TurboFile 双栏数量为 `2`，默认路径为 `c:\Users\warrior`。
  - 顶部菜单、标题栏原生 action button、Activity Bar、Status Bar 实际可见数量为 `0`。
  - 启动日志扫描无 `TypeError`、`ReferenceError`、`uncaught`、`crash`、`exception`、`ERR_` 或明显 `error`。
  - 截图留档：`D:\Work\code\TurboFile-Windows\.tmp\screenshots\sync-direction-packaged.png`
- 安装版最终烟测：
  - `D:\Work\code\TurboFileSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER /MERGETASKS=!runcode` 安装到临时目录成功，退出码 `0`。
  - 安装后的 `TurboFile.exe` 可启动。
  - 页面标题为 `TurboFile - TurboFile`。
  - `body.turbofile-shell` 生效。
  - TurboFile 双栏数量为 `2`，默认路径为 `c:\Users\warrior`。
  - 顶部菜单、标题栏原生 action button、Activity Bar、Status Bar 实际可见数量为 `0`。
  - 在强制结束进程前扫描全新安装版用户数据目录，异常关键字匹配数为 `0`。
  - 截图留档：`D:\Work\code\TurboFile-Windows\.tmp\screenshots\sync-direction-installed.png`
  - 临时安装目录已通过 `unins000.exe /VERYSILENT` 卸载并清理。

### 37.4 当前剩余限制

- 同步预览已支持勾选、跳过和冲突项改方向，但还没有内容级 diff、按规则批量选择方向或复杂冲突合并。
- 递归扫描上限仍为 5000 项；超大目录后续应做后台扫描、分页预览和按子目录分批确认。
- 当前环境验证到的是 WSL2 -> hello 无法 direct rsync 时的 `sftp-relay` fallback；真实 direct rsync 仍需要源设备免密 SSH 到目标设备并具备 rsync。
- 暂停、恢复、多选批量操作、单文件 exe 和安装包瘦身仍可继续推进。

## 38. 2026-05-04 第十六轮开发进度记录

### 38.1 已完成

- 同步预览新增冲突项批量方向控制：
  - 顶部工具栏新增“自动方向”“冲突左->右”“冲突右->左”三个规则按钮。
  - “自动方向”会清空所有手动反向状态，恢复按差异扫描结果选择方向。
  - “冲突左->右”只处理可反向的冲突项，缺失项仍保持原本的单向新增语义。
  - “冲突右->左”同样只处理冲突项，避免把不存在的一侧错误当作源端。
  - 批量切换复用逐行 `reverse` 计划，不额外创建传输分支，最终仍进入统一智能传输管线。
- 同步预览统计增强：
  - 汇总区新增“方向”统计，显示当前已选择计划里的左 -> 右和右 -> 左数量。
  - 汇总统计改为读取当前预览生效后的计划，逐行切换和批量切换后数字会跟随变化。
  - 同步提示文案更新为“冲突项可逐条切换方向，也可以用规则按钮批量决定方向。”
- 样式细节：
  - 同步工具栏支持换行，避免窄窗口下规则按钮挤压主操作按钮。
  - 新增 `.turbofile-sync-direction-actions` 按钮组样式，用边界线和间距区分方向规则与全选/清空/开始同步。
  - 汇总区网格最小宽度调小，新增“方向”指标后仍能在较窄宽度下稳定排版。

### 38.2 已验证

- 编译验证：
  - `npm run compile-check-ts-native`：通过。
  - `npm run gulp compile-client`：通过，`out` 产物已更新。
- Playwright / CDP 批量方向 UI 验证：
  - 创建本机目录 `C:\Users\warrior\TurboFileBulkLeft_20260504_072200` 和 `C:\Users\warrior\TurboFileBulkRight_20260504_072200`。
  - 两侧包含 2 个同名冲突文件和 2 个单侧独有文件。
  - 初始同步预览显示 4 项，方向统计为 `2 左->右 / 2 右->左`。
  - 点击“冲突左->右”后，冲突项统一为左 -> 右，方向统计变为 `3 左->右 / 1 右->左`。
  - 点击“冲突右->左”后，冲突项统一为右 -> 左，方向统计变为 `1 左->右 / 3 右->左`。
  - 开始同步后任务成功完成 4 项，策略为 `local-copy`。
  - 文件结果验证：
    - `left_newer.txt` 按批量右 -> 左规则被右侧 `right-old` 覆盖到左侧。
    - `right_newer.txt` 保持右 -> 左结果，左侧内容变为 `right-wins-auto`。
    - `left_only.txt` 仍从左侧新增到右侧。
    - `right_only.txt` 仍从右侧新增到左侧。
  - 验证完成后已清理本机临时测试目录。
- 绿色版与安装版烟测：
  - packaged 绿色版使用全新用户数据目录 `D:\Work\code\TurboFile-Windows\.tmp\user-data-bulk-direction-packaged` 启动。
  - 安装版使用全新用户数据目录 `D:\Work\code\TurboFile-Windows\.tmp\user-data-bulk-direction-installed` 启动。
  - 两者页面标题均为 `TurboFile - TurboFile`。
  - TurboFile 双栏数量均为 `2`，默认路径均为 `c:\Users\warrior`。
  - Activity Bar、Sidebar、Panel 可见数量均为 `0`；`.part.editor` 作为 TurboFile shell 容器保留可见。
  - 启动日志扫描无 `TypeError`、`ReferenceError`、`uncaught`、`crash`、`exception`、`ERR_` 或明显 `error`。
  - 临时安装目录已通过 `unins000.exe /VERYSILENT` 卸载并清理。

### 38.3 打包与最终产物

- Windows x64 绿色目录已重新生成：
  - 输出目录：`D:\Work\code\VSCode-win32-x64`
  - 主程序：`D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - 主程序大小：`210,948,096` bytes
- Windows x64 绿色 zip 已重新生成：
  - 输出文件：`D:\Work\code\TurboFile-win32-x64.zip`
  - SHA256：`5C224AF786044955D559AC1496E57EDFF2C9E377FDE17C428BDAA0CF6FA69951`
  - 大小：`245,254,651` bytes
- Windows x64 用户级安装包已重新生成：
  - 输出文件：`D:\Work\code\TurboFileSetup.exe`
  - SHA256：`83DE7C6FA279D8E8FF6B267C477465081A5EE97FF2FF343DD71A4AE4AC87F42E`
  - 大小：`162,524,488` bytes

### 38.4 当前剩余限制

- 同步预览已支持勾选、跳过、逐项改方向和按规则批量改方向，但还没有内容级 diff 或复杂冲突合并。
- 递归扫描上限仍为 5000 项；超大目录后续应做后台扫描、分页预览和按子目录分批确认。
- 当前环境验证到的是 WSL2 -> hello 无法 direct rsync 时的 `sftp-relay` fallback；真实 direct rsync 仍需要源设备免密 SSH 到目标设备并具备 rsync。
- 暂停、恢复、跨面板多选传输、单文件 exe 和安装包瘦身仍可继续推进。

## 39. 2026-05-04 第十七轮开发进度记录

### 39.1 已完成

- 文件浏览器从单选扩展为多选：
  - 每个面板新增 `selectedPaths` 和 `selectionAnchorPath`，保留 `selectedPath` 作为当前焦点项。
  - 普通点击保持单选体验。
  - `Ctrl` / `Meta` 点击支持追加或取消单项选择。
  - `Shift` 点击支持按列表范围选择。
  - 右键已选项目时保留当前多选集合；右键未选项目时切换为单选，避免误操作。
  - 拖拽已选项目时不会把多选集合压回单项。
- 批量操作接入现有传输管线：
  - 中间“复制到右侧 / 复制到左侧”支持一次传输多个文件或目录。
  - 中间“剪切到右侧 / 剪切到左侧”支持一次移动多个文件或目录。
  - 剪切实现为批量复制全部成功后再批量删除来源，避免部分复制失败时误删源文件。
  - 删除按钮支持批量删除选中项，并统一弹出确认。
  - 批量传输仍复用 `transferItem` 和 `sshService.transferFile`，本机、SFTP 上传/下载、SSH relay/direct 策略不分叉。
- 任务区增强：
  - 多项复制显示“复制 N 项”和批量完成状态。
  - 多项剪切显示复制任务和来源清理任务。
  - 多项删除显示“删除 N 项”和逐项进度。
  - 单项复制仍保留原 retry 信息，批量任务暂不启用单项 retry，避免重试语义不清。
- UI 细节：
  - 路径栏新增“已选 N 项”徽标。
  - 长路径在多选徽标出现时会省略，不会挤压计数。
  - 多选行继续复用 VS Code list selection 颜色。

### 39.2 已验证

- 编译验证：
  - `npm run compile-check-ts-native`：通过。
  - `npm run gulp compile-client`：通过，`out` 产物已更新。
- Playwright / CDP 多选 UI 回归：
  - 创建本机目录 `C:\Users\warrior\TurboFileMultiLeft_20260504_075444` 和 `C:\Users\warrior\TurboFileMultiRight_20260504_075444`。
  - 左侧目录内准备：
    - `alpha.txt`
    - `beta.txt`
    - `nested\gamma.txt`
    - `move1.txt`
    - `move2.txt`
    - `delete1.txt`
    - `delete2.txt`
  - 复制验证：
    - 在左侧使用 Ctrl 多选 `alpha.txt`、`beta.txt`、`nested`。
    - 路径栏显示“已选 3 项”。
    - 点击“复制到右侧”后任务成功显示“批量传输完成：3 项”，策略为 `local-copy`。
    - 右侧目标目录获得 `alpha.txt`、`beta.txt` 和 `nested\gamma.txt`。
  - 剪切验证：
    - 在左侧使用 Ctrl 多选 `move1.txt`、`move2.txt`。
    - 路径栏显示“已选 2 项”。
    - 点击“剪切到右侧”后复制任务成功，随后来源清理任务成功显示“剪切完成：2 项”。
    - 右侧目标目录获得 `move1.txt`、`move2.txt`；左侧源目录不再存在这两个文件。
  - 删除验证：
    - 在左侧使用 Ctrl 多选 `delete1.txt`、`delete2.txt`。
    - 路径栏显示“已选 2 项”。
    - 点击删除按钮并确认后任务成功显示“已删除：2 项”。
    - 左侧源目录不再存在这两个文件。
  - 任务队列没有出现错误任务，用户数据目录日志扫描无 `TypeError`、`ReferenceError`、`uncaught`、`crash`、`exception`、`ERR_` 或明显 `error`。
  - 验证完成后已清理本机临时测试目录。

### 39.3 打包与最终烟测

- Windows x64 绿色目录已重新生成：
  - 输出目录：`D:\Work\code\VSCode-win32-x64`
  - 主程序：`D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - 主程序大小：`210,948,096` bytes
- Windows x64 绿色 zip 已重新生成：
  - 输出文件：`D:\Work\code\TurboFile-win32-x64.zip`
  - SHA256：`9BEB03F0C707CD91255AF9D335F2FB204F5634393D3CBC463EC43D656982CD69`
  - 大小：`245,258,036` bytes
- Windows x64 用户级安装包已重新生成：
  - 输出文件：`D:\Work\code\TurboFileSetup.exe`
  - SHA256：`45F5BFFAF197490D20EBFD3271253C7939DACFF96D99538AF4F2514ECE01CCB1`
  - 大小：`162,527,093` bytes
- packaged 绿色版烟测：
  - 使用全新用户数据目录 `D:\Work\code\TurboFile-Windows\.tmp\user-data-multi-select-packaged` 启动。
  - 页面标题为 `TurboFile - TurboFile`。
  - TurboFile 双栏数量为 `2`，默认路径为 `c:\Users\warrior`。
  - Activity Bar、Sidebar、Panel 可见数量为 `0`。
  - 启动日志扫描无明显异常。
- 安装版烟测：
  - `D:\Work\code\TurboFileSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER /MERGETASKS=!runcode` 安装到临时目录成功；安装日志显示 `Installation process succeeded`。
  - 安装后的 `TurboFile.exe` 可启动。
  - 页面标题为 `TurboFile - TurboFile`。
  - TurboFile 双栏数量为 `2`，默认路径为 `c:\Users\warrior`。
  - Activity Bar、Sidebar、Panel 可见数量为 `0`。
  - 启动日志扫描无明显异常。
  - 临时安装目录已通过 `unins000.exe /VERYSILENT` 卸载并清理。

### 39.4 当前剩余限制

- 多选已覆盖复制、剪切和删除；预览、重命名、压缩和解压仍按当前焦点项执行，后续可按实际使用场景决定是否扩展为批量。
- 同步预览已支持勾选、跳过、逐项改方向和按规则批量改方向，但还没有内容级 diff 或复杂冲突合并。
- 递归扫描上限仍为 5000 项；超大目录后续应做后台扫描、分页预览和按子目录分批确认。
- 暂停、恢复、单文件 exe 和安装包瘦身仍可继续推进。

## 40. 2026-05-04 VS Code Shell Layout Restoration

### 40.1 Completed

- Restored the native VS Code workbench shell instead of running TurboFile as a mostly full-screen hidden shell.
- Activity Bar, Side Bar, editor tab strip, menu bar, command center, status bar, and native editor actions are visible again.
- TurboFile remains an editor page, so it participates in the normal VS Code tab/page model.
- Added a TurboFile Side Bar container with two native views:
  - Devices: local Windows entry, saved SSH devices, open transfer page, add device, refresh devices.
  - Settings: settings, terminal, task log, and sync entry points.
- Side Bar entries communicate with the TurboFile editor through a small workbench bridge:
  - Add Device opens the existing TurboFile device form from the side bar.
  - Device cards open/select the device in the dual-pane transfer page.
  - Settings entry opens the TurboFile page and routes to the settings command hook.
- Removed the CSS overrides that hid VS Code chrome and injected the old stripped title-bar behavior.
- Added VS Code themed CSS for the TurboFile side bar controls, using codicon buttons and side-bar colors.

### 40.2 Verified

- TypeScript validation:
  - `npm run compile-check-ts-native`: passed.
  - `npm run gulp compile-client`: passed, `out` artifacts updated.
- Dev UI smoke test through Playwright/CDP:
  - Window title: `TurboFile - TurboFile Dev`.
  - TurboFile editor loaded: `true`.
  - Dual panes: `2`.
  - Visible Activity Bar count: `1`.
  - Visible Side Bar count: `1`.
  - Visible Status Bar count: `1`.
  - Visible editor title/tab area count: `1`.
  - Menu bar text includes `File`, `Edit`, `Selection`, `View`, `Go`, `Terminal`, `Help`.
  - TurboFile Side Bar button count: `3`.
  - TurboFile Side Bar device card count: `1` for `Windows Local`.
  - Add Device side-bar button opens the existing TurboFile device overlay.
  - Log scan found no `TypeError`, `ReferenceError`, uncaught exception, crash, or obvious renderer error.
- Screenshot archived:
  - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\sidebar-layout-dev.png`

### 40.3 Packaged Artifacts

- Windows x64 portable directory regenerated:
  - Output directory: `D:\Work\code\VSCode-win32-x64`
  - Main executable: `D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - Main executable size: `210,948,096` bytes.
- Windows x64 portable zip regenerated:
  - Output file: `D:\Work\code\TurboFile-win32-x64.zip`
  - SHA256: `AFD03FD855A93A508721A866B60EE9486D07184F6E579EC22B71E7FF95376DFD`
  - Size: `245,518,725` bytes.
- Windows x64 user setup regenerated:
  - Output file: `D:\Work\code\TurboFileSetup.exe`
  - SHA256: `35491458D1C56C04E33FFD435AA25D526E5E398CCA344EAB0E0CFF62A36D6E1F`
  - Size: `162,530,834` bytes.
- Packaged portable smoke test through Playwright/CDP:
  - Window title: `TurboFile - TurboFile`.
  - TurboFile editor loaded: `true`.
  - Dual panes: `2`.
  - Visible Activity Bar count: `1`.
  - Visible Side Bar count: `1`.
  - Visible Status Bar count: `1`.
  - Visible editor title/tab area count: `1`.
  - TurboFile Side Bar button count: `3`.
  - TurboFile Side Bar device card count: `1` for `Windows Local`.
  - Log scan found no `TypeError`, `ReferenceError`, uncaught exception, crash, or obvious renderer error.
  - Screenshot archived: `D:\Work\code\TurboFile-Windows\.tmp\screenshots\sidebar-layout-packaged.png`
- Installed build smoke test through Playwright/CDP:
  - `D:\Work\code\TurboFileSetup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER /MERGETASKS=!runcode /DIR="D:\Work\code\TurboFile-Windows\.tmp\install-sidebar-layout"` exited with code `0`.
  - Install log ended with `Installation process succeeded`.
  - Installed executable: `D:\Work\code\TurboFile-Windows\.tmp\install-sidebar-layout\TurboFile.exe`.
  - Window title: `TurboFile - TurboFile`.
  - TurboFile editor loaded: `true`.
  - Dual panes: `2`.
  - Visible Activity Bar count: `1`.
  - Visible Side Bar count: `1`.
  - Visible Status Bar count: `1`.
  - Visible editor title/tab area count: `1`.
  - TurboFile Side Bar button count: `3`.
  - TurboFile Side Bar device card count: `1` for `Windows Local`.
  - Add Device side-bar button opens the existing TurboFile device overlay.
  - Log scan found no `TypeError`, `ReferenceError`, uncaught exception, crash, or obvious renderer error.
  - Screenshot archived: `D:\Work\code\TurboFile-Windows\.tmp\screenshots\sidebar-layout-installed.png`
  - Uninstall exited with code `0`; uninstall log ended with `Uninstallation process succeeded`, `Removed all? Yes`, and `Need to restart Windows? No`.
  - Temporary install directory was removed and no `TurboFile` process remained.

### 40.4 Remaining Notes

- TurboFile currently uses one singleton transfer editor page; the VS Code tab strip is restored, but multiple independent TurboFile transfer sessions would require per-editor input state instead of the current singleton state.
- Settings and task-log rows are routed through the side bar now; they can be split into dedicated editor pages in the next UI refinement pass if needed.

## 41. 2026-05-04 Main Layout And Sidebar Controls Refinement

### 41.1 Completed

- Updated the TurboFile editor page to match the requested dual-pane layout more closely:
  - Removed the vertical center transfer rail from the main page.
  - Main page now contains only the left file pane, right file pane, and a compact bottom action bar.
  - Bottom action bar now has centered actions: copy, cut, start transfer, and view log.
  - Transfer direction is chosen from the currently selected side; if a directory sync target is selected, start transfer enters the existing sync flow.
- Moved management functions out of the main page and into the VS Code Side Bar:
  - Add device.
  - Refresh devices.
  - Test SSH.
  - Left terminal.
  - Right terminal.
  - Task log.
  - Sync folders.
  - Clear finished tasks.
- Changed Add Device from a main-page modal to an inline Side Bar form:
  - The Devices view expands an `Add SSH device` form directly in the Side Bar.
  - Host, port, user, auth type, password/private-key path, passphrase, default path, and platform are collected in the Side Bar.
  - Test and Save actions run from the Side Bar.
  - Saving refreshes the device list and notifies the main editor through the workbench bridge.
- The old editor-side `addDevice` command no longer opens the main-page modal; it points the user back to the Side Bar device form.
- Added a task-log overlay opened from the Side Bar or bottom `View Log` action.

### 41.2 Verified

- TypeScript validation:
  - `npm run compile-check-ts-native`: passed.
  - `npm run gulp compile-client`: passed, `out` artifacts updated.
- Dev UI smoke test through Playwright/CDP:
  - Visible Side Bar count: `1`.
  - TurboFile dual panes: `2`.
  - Visible center transfer rail count: `0`.
  - Bottom actions: `复制`, `剪切`, `开始传输`, `查看日志`.
  - Side Bar device buttons: `Open transfer page`, `Add device`, `Refresh devices`.
  - Side Bar rows: `Settings`, `Test SSH`, `Left terminal`, `Right terminal`, `Task log`, `Sync folders`, `Clear finished`.
  - Clicking `Add device` opens exactly one `.turbofile-sidebar-device-form`.
  - Main-page Add Device overlay count: `0`.
  - Main page does not contain `Add device` or `Test SSH` text.
  - Log scan found no `TypeError`, `ReferenceError`, uncaught exception, crash, or obvious renderer error.
- Screenshot archived:
  - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\sidebar-form-dev.png`

### 41.3 Packaged Artifacts

- Windows x64 portable directory regenerated:
  - Output directory: `D:\Work\code\VSCode-win32-x64`
  - Main executable: `D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - Main executable size: `210,948,096` bytes.
- Windows x64 portable zip regenerated:
  - Output file: `D:\Work\code\TurboFile-win32-x64.zip`
  - SHA256: `C853875C2840464D0A4E522E8DCE2A57C993CFFFF6EA27C064D3485CB67B14BC`
  - Size: `245,523,342` bytes.
- Windows x64 user setup regenerated:
  - Output file: `D:\Work\code\TurboFileSetup.exe`
  - SHA256: `5D0C9A9F034CF7A60BA89EADF54857A7EFB1965D8DCB93C832602A7F2B611E62`
  - Size: `162,536,612` bytes.
- Packaged portable smoke test through Playwright/CDP:
  - Window title: `TurboFile - TurboFile`.
  - Visible Side Bar count: `1`.
  - TurboFile dual panes: `2`.
  - Visible center transfer rail count: `0`.
  - Bottom actions: `复制`, `剪切`, `开始传输`, `查看日志`.
  - Clicking `Add device` opens exactly one `.turbofile-sidebar-device-form`.
  - Main-page Add Device overlay count: `0`.
  - Side Bar rows include `Test SSH`, `Left terminal`, `Right terminal`, `Task log`, `Sync folders`, and `Clear finished`.
  - Log scan found no `TypeError`, `ReferenceError`, uncaught exception, crash, or obvious renderer error.
  - Screenshot archived: `D:\Work\code\TurboFile-Windows\.tmp\screenshots\main-layout-packaged.png`

### 41.4 Remaining Notes

- The main layout now follows the requested structure, but it still uses VS Code theme colors. If a forced white/light TurboFile content area is required regardless of VS Code theme, that should be handled as a separate theme override pass.
- Multiple independent TurboFile transfer tabs still require moving pane/task state from the singleton editor input into per-editor input state.

## 42. 2026-05-04 Split Activity Bar Controls Refinement

### 42.1 Completed

- Split TurboFile Side Bar features into separate VS Code Activity Bar entries:
  - `Transfer`: opens the dedicated transfer page and exposes start-transfer.
  - `Devices`: lists local and saved SSH devices only.
  - `Settings`: owns the Add SSH Device form and device-management actions.
  - `Task Log`: owns task-log viewing and clear-finished actions.
- Removed the mixed Devices toolbar from the Side Bar. Device listing no longer contains add/refresh/transfer buttons in the same view.
- Moved Add SSH Device into the Settings Side Bar view as a standalone form, matching the requested "settings owns add device" model.
- Removed `View Log` from the main editor bottom action bar. The main page now keeps only:
  - Copy.
  - Cut.
  - Start Transfer.
- Kept the requested VS Code shell structure:
  - Activity Bar remains visible.
  - Side Bar remains visible.
  - Editor title/tab area remains visible.
  - Main editor remains the two-pane TurboFile transfer page.

### 42.2 Verified

- TypeScript validation:
  - `npm run compile-check-ts-native`: passed.
  - `npm run gulp compile-client`: passed.
- Dev UI smoke test through Playwright/CDP:
  - Window title: `TurboFile - TurboFile Dev`.
  - Visible Activity Bar count: `1`.
  - Visible Side Bar count: `1`.
  - TurboFile dual panes: `2`.
  - Bottom actions: `Copy`, `Cut`, `Start Transfer`.
  - Main page no longer contains `View Log`.
  - Devices Activity Bar entry opens a Devices-only view.
  - Devices view has no mixed toolbar buttons.
  - Settings Activity Bar entry opens the Add SSH Device form.
  - Task Log Activity Bar entry opens `View task log` and `Clear finished`.
  - Log scan found no `TypeError`, `ReferenceError`, uncaught exception, crash, or obvious renderer error.
- Screenshot archived:
  - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\split-sidebar-dev.png`

### 42.3 Packaged Artifacts

- Windows x64 portable directory regenerated:
  - Output directory: `D:\Work\code\VSCode-win32-x64`
  - Main executable: `D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - Main executable SHA256: `44918AADDC83C322FDAA31D65B0B428B69CC0DB9119CC646CDC2335206184CD7`
  - Main executable size: `210,948,096` bytes.
- Windows x64 portable zip regenerated:
  - Output file: `D:\Work\code\TurboFile-win32-x64.zip`
  - SHA256: `50A80D3D3673C9932A3E3E4A7846DCD0AC92874983D87A34D62D49D23EA59EE4`
  - Size: `245,268,327` bytes.
- Windows x64 user setup regenerated:
  - Output file: `D:\Work\code\TurboFileSetup.exe`
  - SHA256: `DB3826B9CCE143DBEF666B13A53E9CF4E4E3FCCA7B2B54A2A7E96302074D27C6`
  - Size: `162,529,728` bytes.

### 42.4 Release Smoke Tests

- Packaged portable smoke test through Playwright/CDP:
  - Window title: `TurboFile - TurboFile`.
  - TurboFile editor loaded: `true`.
  - Dual panes: `2`.
  - Visible Activity Bar count: `1`.
  - Visible Side Bar count: `1`.
  - Visible editor title/tab area count: `1`.
  - Bottom action count: `3`.
  - Transfer Activity Bar entry shows `Transfer page` and `Start transfer`.
  - Devices Activity Bar entry shows `Windows Local`, no Add Device form, and no mixed toolbar buttons.
  - Settings Activity Bar entry shows the standalone Add SSH Device form, 10 form fields, Test SSH, Left terminal, and Right terminal.
  - Task Log Activity Bar entry shows `View task log` and `Clear finished`.
  - Log scan found no `TypeError`, `ReferenceError`, uncaught exception, crash, or obvious renderer error.
  - Screenshots archived:
    - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\split-sidebar-portable-settings.png`
    - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\split-sidebar-portable-tasklog.png`
- Installed build smoke test through Playwright/CDP:
  - Installed to temporary directory: `D:\Work\code\TurboFile-Windows\.tmp\install-split-sidebar-current-graceful`
  - Installer exit code: `0`.
  - Install log ended with `Installation process succeeded`.
  - Window title: `TurboFile - TurboFile`.
  - TurboFile editor loaded: `true`.
  - Dual panes: `2`.
  - Visible Activity Bar count: `1`.
  - Visible Side Bar count: `1`.
  - Visible editor title/tab area count: `1`.
  - Bottom action count: `3`.
  - Transfer, Devices, Settings, and Task Log Activity Bar entries all passed the same checks as the portable build.
  - The installed app was closed gracefully, not force-killed.
  - Log scan found `0` matches for `TypeError`, `ReferenceError`, uncaught exception, crash, or obvious renderer error.
  - Uninstall log ended with `Uninstallation process succeeded`, `Removed all? Yes`, and `Need to restart Windows? No`.
  - No `TurboFile` process remained after uninstall.
  - Screenshot archived:
    - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\split-sidebar-installed-graceful-settings.png`

### 42.5 Remaining Notes

- The Transfer Activity Bar entry can briefly show VS Code's empty-container placeholder during very early startup. The view populates after the workbench finishes registering TurboFile views; the release smoke test uses a short retry to cover this startup window.
- Inno Setup still emits upstream VS Code localization warnings for missing installer messages in some languages, but the setup compile completes successfully.

## 43. 2026-05-04 Full-Page Activity Navigation Refinement

### 43.1 Completed

- Removed TurboFile feature content from the VS Code Side Bar:
  - The old narrow Side Bar content such as `TRANSFER`, `Transfer page`, `Start transfer`, `Settings`, and `Add SSH device` is no longer used as the functional UI.
  - Clicking TurboFile Activity Bar entries now routes the main editor area to a full page and immediately hides the VS Code Side Bar.
- Added full-page TurboFile navigation inside the editor:
  - File Transfer.
  - Device Management.
  - System Settings.
  - Task Log.
- Added a collapsible Chinese navigation space inside the TurboFile editor:
  - Collapsed mode keeps icon-style navigation compact.
  - Expanded mode shows Chinese labels and a `收起导航` control.
- Converted each left-side control into a main-area page:
  - File Transfer keeps the dual-pane browser and bottom transfer actions.
  - Device Management is a full page with device cards and open/test actions.
  - System Settings is a full page with the Add SSH Device form and quick actions.
  - Task Log is a full page with status cards and the task list.
- Updated TurboFile-specific labels to Chinese:
  - Activity Bar labels: `传输`, `设备`, `设置`, `任务日志`.
  - Internal navigation labels: `文件传输`, `设备管理`, `系统设置`, `任务日志`.
  - Settings form labels and actions are Chinese.

### 43.2 Verified

- TypeScript validation:
  - `npm run compile-check-ts-native`: passed.
  - `npm run gulp compile-client`: passed.
- Dev UI smoke test through Playwright/CDP:
  - VS Code Side Bar visible: `false`, width `0`.
  - Activity Bar labels include `传输`, `设备`, `设置`, and `任务日志`.
  - Initial transfer page:
    - Active page index: `0`.
    - Dual panes: `2`.
    - Bottom action count: `3`.
  - System Settings page:
    - Active page index: `2`.
    - Full-page layout: `true`.
    - Settings form present: `true`.
    - Settings form fields: `10`.
    - Form width: `1788` px in the test viewport.
    - Chinese labels verified: `添加 SSH 设备`, `设备名称`, `用户名`.
  - Navigation expansion:
    - Expanded: `true`.
    - Navigation width: `172` px.
    - Toggle text: `收起导航`.
  - Device Management page:
    - Active page index: `1`.
    - Device cards: `1` for local Windows.
  - Task Log page:
    - Active page index: `3`.
    - Summary cards: `4`.
  - Returning through the Activity Bar Transfer icon:
    - Active page index: `0`.
    - Dual panes: `2`.
    - Bottom action count: `3`.
  - Log scan found no `TypeError`, `ReferenceError`, uncaught exception, crash, or obvious renderer error.
- Screenshot archived:
  - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\fullpage-settings-dev-final.png`

### 43.3 Packaged Artifacts

- Windows x64 portable directory regenerated:
  - Output directory: `D:\Work\code\VSCode-win32-x64`
  - Main executable: `D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - SHA256: `44918AADDC83C322FDAA31D65B0B428B69CC0DB9119CC646CDC2335206184CD7`
  - Size: `210,948,096` bytes.
  - Last write time: `2026-05-04 18:46:00`.
- Windows x64 portable zip regenerated:
  - Output file: `D:\Work\code\TurboFile-win32-x64.zip`
  - SHA256: `D78432BD9827008F81B095E2F1A2489A38E23B2FDB66FE33D82A2A562A6B8002`
  - Size: `245,273,173` bytes.
  - Last write time: `2026-05-04 18:56:56`.
- Windows x64 user setup regenerated:
  - Output file: `D:\Work\code\TurboFileSetup.exe`
  - SHA256: `0BAC772C048030F414A5FDD14C07C2855ACC69245F9A9D39A8C4291017369789`
  - Size: `162,539,691` bytes.
  - Last write time: `2026-05-04 18:55:31`.

### 43.4 Release Smoke Tests

- Packaged portable smoke test through Playwright/CDP:
  - VS Code Side Bar visible: `false`, width `0`.
  - Initial File Transfer page active with dual panes: `2`.
  - Bottom transfer action count: `3`.
  - System Settings page active after navigation, settings form present: `true`.
  - Settings form fields: `10`.
  - Settings form width: `1045` px in the release viewport.
  - Chinese labels verified: `添加 SSH 设备`, `设备名称`, `用户名`.
  - Navigation expanded successfully with width `172` px and toggle text `收起导航`.
  - Device Management page showed `1` local Windows device card.
  - Task Log page showed `4` summary cards.
  - Returning through the Activity Bar Transfer icon restored the File Transfer page with dual panes and bottom actions.
  - Log scan found no `TypeError`, `ReferenceError`, uncaught exception, crash, or obvious renderer error.
  - Screenshot archived:
    - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\fullpage-settings-portable.png`
- Installed build smoke test through Playwright/CDP:
  - Installed to temporary directory: `D:\Work\code\TurboFile-Windows\.tmp\install-fullpage-current-graceful`.
  - Installer exit code: `0`.
  - VS Code Side Bar visible: `false`, width `0`.
  - Initial File Transfer page active with dual panes: `2`.
  - Bottom transfer action count: `3`.
  - System Settings page active after navigation, settings form present: `true`.
  - Settings form fields: `10`.
  - Settings form width: `925` px in the installed smoke viewport.
  - Chinese labels verified: `添加 SSH 设备`, `设备名称`, `用户名`.
  - Navigation expanded successfully with width `172` px and toggle text `收起导航`.
  - Device Management page showed `1` local Windows device card.
  - Task Log page showed `4` summary cards.
  - Returning through the Activity Bar Transfer icon restored the File Transfer page with dual panes and bottom actions.
  - Installed app was closed gracefully before uninstall.
  - Uninstaller exit code: `0`.
  - Screenshot archived:
    - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\fullpage-settings-installed.png`

## 44. 2026-05-04 Single VS Code Activity Bar Navigation Refinement

### 44.1 Completed

- Removed the duplicate TurboFile navigation rail from inside the editor:
  - The editor no longer renders `.turbofile-page-nav`.
  - The main editor area starts directly after the VS Code Activity Bar or expanded Side Bar.
- Kept the VS Code Activity Bar as the only left icon entry rail:
  - Default state is icon-only.
  - Clicking a TurboFile Activity Bar entry expands the VS Code Side Bar.
  - Clicking the active Activity Bar entry collapses the Side Bar again.
- Reworked the expanded Side Bar content:
  - The Side Bar now shows only a Chinese route list: `传输`, `设备`, `设置`, `任务日志`.
  - Added a Chinese `收起侧边栏` action.
  - Device forms, settings forms, task lists, and transfer controls remain full main-editor pages, not Side Bar widgets.
- Kept the full-page editor routing:
  - `传输` opens the dual-pane transfer page.
  - `设备` opens the full device management page.
  - `设置` opens the full system settings page.
  - `任务日志` opens the full task log page.

### 44.2 Verified

- TypeScript validation:
  - `npm run compile-check-ts-native`: passed.
  - `npm run gulp compile-client`: passed.
- Dev UI smoke test through Playwright/CDP:
  - Activity Bar visible: `true`, width `48`.
  - Default Side Bar visible: `false`, width `0`.
  - Internal editor navigation count: `0`.
  - Initial transfer page dual panes: `2`.
  - Expanded Side Bar visible: `true`, width `300`.
  - Expanded Side Bar route nav count: `1`.
  - Expanded Side Bar text: `传输设备设置任务日志收起侧边栏`.
  - Re-clicking the active Activity Bar icon collapsed the Side Bar again.
  - Screenshots archived:
    - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\single-sidebar-dev-collapsed-final.png`
    - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\single-sidebar-dev-expanded-final.png`
- Packaged portable smoke test through Playwright/CDP:
  - Default Side Bar visible: `false`, width `0`.
  - Internal editor navigation count: `0`.
  - Initial transfer page dual panes: `2`.
  - Expanded Side Bar route text: `传输设备设置任务日志收起侧边栏`.
  - Re-clicking the active Activity Bar icon collapsed the Side Bar again.
  - Screenshots archived:
    - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\single-sidebar-portable-collapsed.png`
    - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\single-sidebar-portable-expanded.png`
- Installed build smoke test through Playwright/CDP:
  - Installer exit code: `0`.
  - Default Side Bar visible: `false`, width `0`.
  - Internal editor navigation count: `0`.
  - Initial transfer page dual panes: `2`.
  - Expanded Side Bar route text: `传输设备设置任务日志收起侧边栏`.
  - Re-clicking the active Activity Bar icon collapsed the Side Bar again.
  - Uninstaller exit code: `0`.
  - Screenshots archived:
    - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\single-sidebar-installed-collapsed.png`
    - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\single-sidebar-installed-expanded.png`

### 44.3 Packaged Artifacts

- Windows x64 portable directory regenerated:
  - Output directory: `D:\Work\code\VSCode-win32-x64`
  - Main executable: `D:\Work\code\VSCode-win32-x64\TurboFile.exe`
  - SHA256: `44918AADDC83C322FDAA31D65B0B428B69CC0DB9119CC646CDC2335206184CD7`
  - Size: `210,948,096` bytes.
  - Last write time: `2026-05-04 19:31:54`.
- Windows x64 portable zip regenerated:
  - Output file: `D:\Work\code\TurboFile-win32-x64.zip`
  - SHA256: `1849886D897E17DE463216C9744DA4A6736D35129EB6756313E8ACDD45840826`
  - Size: `245,528,628` bytes.
  - Last write time: `2026-05-04 19:41:48`.
- Windows x64 user setup regenerated:
  - Output file: `D:\Work\code\TurboFileSetup.exe`
  - SHA256: `0EC9A542ADEE6C34C138F6CD65E861553343167810054D0C806D61EC8974424B`
  - Size: `162,537,071` bytes.
  - Last write time: `2026-05-04 19:38:38`.

## 45. 2026-05-04 Portable Delivery

### 45.1 Completed

- Created a standard no-install portable folder:
  - Folder: `D:\Work\code\TurboFile-Portable`
  - Top-level executable: `D:\Work\code\TurboFile-Portable\TurboFile.exe`
  - This folder can be copied to another Windows machine and launched by double-clicking `TurboFile.exe`.
- Created a portable zip whose top level contains `TurboFile.exe` directly after extraction:
  - Output file: `D:\Work\code\TurboFile-Portable.zip`
- Created a single-file self-extracting portable launcher:
  - Primary output: `D:\Work\code\TurboFile.exe`
  - Archive copy: `D:\Work\code\TurboFile-SingleExe\TurboFile.exe`
  - It does not install through Windows Setup.
  - On first launch, it extracts the portable app to `%LOCALAPPDATA%\TurboFilePortable\app-1849886D` and starts the cached `TurboFile.exe`.
  - Later launches reuse the cached portable app.

### 45.2 Verified

- Standard portable folder exists and contains top-level `TurboFile.exe`.
- Single-file self-extracting portable launcher was started successfully:
  - Cache executable created: `%LOCALAPPDATA%\TurboFilePortable\app-1849886D\TurboFile.exe`
  - Cache executable size: `210,948,096` bytes.
  - App process launched from the cache path.
- Hashes:
  - `D:\Work\code\TurboFile-Portable\TurboFile.exe`: `44918AADDC83C322FDAA31D65B0B428B69CC0DB9119CC646CDC2335206184CD7`
  - `D:\Work\code\TurboFile-Portable.zip`: `CDC568CD3A663522E6DE73F3E001A2ED9F915A9186FAA065D06DB9B5994FB5CF`
  - `D:\Work\code\TurboFile.exe`: `0E26E34CAD4CC421E35DD61EE6058BDB480ACDEEAA58A40350CDB1BAD459C1FD`
  - `D:\Work\code\TurboFile-SingleExe\TurboFile.exe`: `0E26E34CAD4CC421E35DD61EE6058BDB480ACDEEAA58A40350CDB1BAD459C1FD`

## 46. 2026-05-04 Single App Sidebar Correction

### 46.1 Corrected Requirement

- Corrected the navigation model to match the requested reference:
  - There is one application-level left sidebar.
  - Collapsed state is icon-only.
  - Expanded state is the same sidebar widened in place with Chinese labels.
  - The UI no longer uses a VS Code Activity Bar plus separate Side Bar as two columns.
  - The navigation is not rendered inside the editor content.
- Main pages remain full editor-area pages:
  - `传输` opens the dual-pane file transfer page.
  - `设备` opens the full device management page.
  - `设置` opens the full system settings page.
  - `任务日志` opens the full task log page.

### 46.2 Implementation Notes

- Hid the native Activity Bar during TurboFile startup and used the native Side Bar as the single app sidebar.
- Rendered `.turbofile-page-nav` inside the TurboFile Side Bar view body.
- Added persistent sidebar sizing:
  - Collapsed: `54px`.
  - Expanded: `214px`.
- Lowered the VS Code Side Bar minimum width from `170px` to `54px` for the TurboFile fork.
- Added TurboFile-specific CSS so the custom sidebar navigation fills the full workbench height.
- Updated the single-file portable launcher cache id:
  - `%LOCALAPPDATA%\TurboFilePortable\app-20260504-sidebar`

### 46.3 Verified

- TypeScript validation:
  - `npm run compile-check-ts-native`: passed.
  - `npm run gulp compile-client`: passed.
- Dev UI smoke test through Playwright/CDP:
  - Activity Bar width: `0`.
  - Collapsed Side Bar width: `54`.
  - Expanded Side Bar width: `214`.
  - Navigation height: `743`.
  - Navigation-in-editor count: `0`.
  - Collapsed labels hidden: `传输`, `设备`, `设置`, `任务日志`, `展开侧边栏`.
  - Expanded labels visible: `传输`, `设备`, `设置`, `任务日志`, `收起侧边栏`.
  - Transfer page retained `2` file panes and bottom actions: `复制`, `剪切`, `开始传输`.
  - `设备`, `设置`, and `任务日志` each opened a full editor-area page.
  - Screenshots archived:
    - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\app-sidebar-final-collapsed.png`
    - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\app-sidebar-final-expanded.png`
- Portable executable smoke test:
  - Final self-extracting file launched from `D:\Work\code\TurboFile.exe`.
  - First launch created cache executable:
    - `%LOCALAPPDATA%\TurboFilePortable\app-20260504-sidebar\TurboFile.exe`
  - Cached portable app launched successfully.
  - Cached portable UI matched the dev build:
    - Collapsed Side Bar width: `54`.
    - Expanded Side Bar width: `214`.
    - Navigation height: `743`.
    - Navigation-in-editor count: `0`.
  - Screenshot archived:
    - `D:\Work\code\TurboFile-Windows\.tmp\screenshots\portable-app-sidebar-expanded.png`

### 46.4 Current Portable Artifacts

- Standard portable folder:
  - `D:\Work\code\TurboFile-Portable`
  - Top-level executable: `D:\Work\code\TurboFile-Portable\TurboFile.exe`
- Portable zip:
  - `D:\Work\code\TurboFile-Portable.zip`
  - Size: `244,950,336` bytes.
  - SHA256: `38460DE3293366E9CEB328322A2D33FC4535D75A909B4CDD1D793BB8583E0BB3`
- Single-file portable launcher:
  - `D:\Work\code\TurboFile.exe`
  - Size: `241,025,024` bytes.
  - SHA256: `D0A6B580E3619BB3B55B4EBAA98E73BD44ABA0480B437FBC881ECB27640BCC0F`
  - Archive copy: `D:\Work\code\TurboFile-SingleExe\TurboFile.exe`
