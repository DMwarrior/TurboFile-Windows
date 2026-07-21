# 准确的 SSH 直连判定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SSH 设备之间始终立即尝试真实直连；只有同方向完整 SSH 认证复核失败才能判定该方向不可用；最终用 60、61、62、57、NAS、64、5336 的实际文件与文件夹互传验证软件判定。

**Architecture:** 把方向排序、失败分类、重试次数和取消传播提取为可单元测试的无状态协调器。主进程为协调器提供真实传输回调与同方向认证复核回调，并只保存“最近成功方向”作为下一任务的排序提示。正常成功路径不预检；失败后才复核；数据失败最多同方向重试一次，再由现有传输计划中转。

**Tech Stack:** TypeScript、VS Code/Electron 主进程、ssh2、OpenSSH/sshpass、Mocha、Node.js assert、PowerShell。

## Global Constraints

- 正常直连成功路径不得新增 TCP/SSH 预检、大小扫描或额外往返。
- 不修改 SCP、tar、rsync、SFTP 的块大小、并发数、压缩参数或数据缓冲配置。
- 只有完整 SSH 登录复核失败，才能把本次任务的某个方向判定为不可用。
- 数据阶段错误、进度轮询错误和内部异常不得写入跨任务负缓存。
- 进度轮询只负责显示，轮询失败不得终止真实数据命令。
- 剪切只在最终传输成功后删除一次源文件；失败、取消、复核和重试均不得删除源，也不得进入回收站。
- 认证复核不得写目标业务路径；若私钥必须暂存到执行设备 `/tmp`，必须 `0600` 且在 `finally` 无条件删除。
- 新增代码不得把密码、私钥或包含密码的完整命令写入日志、报告、Git 或本地测试工具 argv；认证复核复用现有生产传输的凭据构造器，本任务不改写既有 `sshpass` 认证机制。
- 测试必须先得到可编译的红灯，再写实现；每次单元测试前先运行 `npm run compile-check-ts-native`。
- 真实测试只使用七台设备 `/tmp/turbofile-direct-matrix-<uuid>` 中的隔离数据，结束后无条件清理。

---

## Task 1: 建立可行为测试的直连协调器

**Files:**
- Create: `src/vs/platform/turbofile/common/turbofileDirectRoute.ts`
- Create: `src/vs/platform/turbofile/test/common/turbofileDirectRoute.test.ts`

- [ ] **Step 1: 创建带 Microsoft 头的可编译骨架**

先只声明以下类型、错误和函数；函数暂时抛出 `Not implemented`，保证 TypeScript 能编译但行为测试为红灯：

```ts
export type TurboFileDirectSshRoute = 'source-push' | 'target-pull';
export type TurboFileDirectVerification = 'available' | 'unavailable' | 'indeterminate';

export class TurboFileDirectUnavailableError extends Error { }
export class TurboFileDirectDataError extends Error { }

export interface ITurboFileDirectRouteFlowOptions<T> {
	readonly routes: readonly TurboFileDirectSshRoute[];
	readonly run: (route: TurboFileDirectSshRoute, retry: boolean) => Promise<T>;
	readonly verify: (route: TurboFileDirectSshRoute, failure: unknown) => Promise<TurboFileDirectVerification>;
	readonly isCancellationError: (error: unknown) => boolean;
}

export interface ITurboFileDirectRouteFlowResult<T> {
	readonly route: TurboFileDirectSshRoute;
	readonly value: T;
}

export function orderTurboFileDirectSshRoutes(preferred?: TurboFileDirectSshRoute): readonly TurboFileDirectSshRoute[];
export function runTurboFileDirectRouteFlow<T>(options: ITurboFileDirectRouteFlowOptions<T>): Promise<ITurboFileDirectRouteFlowResult<T>>;
```

- [ ] **Step 2: 写候选顺序和完整调用序列测试**

测试文件带 Microsoft 头，并导入 `assert`、`ensureNoDisposablesAreLeakedInTestSuite` 及 `../../common/turbofileDirectRoute.js`。覆盖：

1. 默认顺序为 `source-push`、`target-pull`。
2. 最近成功为 `target-pull` 时只改变顺序，不删掉另一方向。
3. 第一次真实传输成功时调用序列只有 `run(source-push,false)`，认证复核调用次数为 0。
4. 首次数据失败、复核 `available` 时，同方向只重试一次；成功返回相同 route。
5. 复核 `indeterminate` 时同样只重试一次。
6. 复核 `unavailable` 时不重试该方向，改试下一方向。
7. 两方向都 `unavailable` 时抛 `TurboFileDirectUnavailableError`。
8. 同方向重试仍失败时抛 `TurboFileDirectDataError`，不再尝试另一方向。
9. 首次 run、verify 或 retry 出现取消错误时原样抛出，后续调用次数为 0。

- [ ] **Step 3: 编译成功后确认行为测试失败**

```powershell
npm run compile-check-ts-native
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileDirectRoute.test.ts
```

Expected: 编译通过，测试因骨架未实现而失败。

- [ ] **Step 4: 实现最小协调器**

实现严格调用顺序：

```text
run(route,false)
  成功 -> 返回
  取消 -> 原样抛出
  失败 -> verify(route)
    unavailable -> 下一 route
    available/indeterminate -> run(route,true)
      成功 -> 返回
      取消 -> 原样抛出
      失败 -> TurboFileDirectDataError
所有 route unavailable -> TurboFileDirectUnavailableError
```

错误对象保存脱敏后的原始失败引用供主服务分类，不自行记录日志。

- [ ] **Step 5: 编译并确认测试通过**

```powershell
npm run compile-check-ts-native
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileDirectRoute.test.ts
```

- [ ] **Step 6: 提交**

```powershell
git add src/vs/platform/turbofile/common/turbofileDirectRoute.ts src/vs/platform/turbofile/test/common/turbofileDirectRoute.test.ts
git commit -m "新增可验证的SSH直连协调策略"
```

---

## Task 2: 删除负冷却并实现同方向认证复核

**Files:**
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`

- [ ] **Step 1: 先添加主服务静态回归断言**

断言删除所有旧负状态：

```text
DIRECT_SSH_ROUTE_FAILURE_COOLDOWN_MS
DIRECT_SSH_ROUTE_CACHE_TTL_MS
directSshRouteFailureCooldowns
filterDirectSshRoutesByCooldown
markDirectSshRouteFailure
clearDirectSshRouteFailure
clearDirectSshRouteCache
getDirectSshRouteFailureKey
```

断言主服务导入而不重复声明 `TurboFileDirectSshRoute`，并包含：

```text
orderTurboFileDirectSshRoutes
runTurboFileDirectRouteFlow
verifyDirectSshRoute
runVerifiedDirectRouteAttempt
__TURBOFILE_DIRECT_READY__
```

- [ ] **Step 2: 编译成功后确认静态测试失败**

```powershell
npm run compile-check-ts-native
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts
```

- [ ] **Step 3: 把缓存收敛为正向排序提示**

把 `directSshRouteCache` 改为 `Map<string, TurboFileDirectSshRoute>`，键仍包含双方 host、port、username 和认证类型。`resolveDirectSshRoutes`：

- 非 SSH 端点返回空数组。
- 调用 `throwIfTransferCanceled(progressId)`。
- 调用 `orderTurboFileDirectSshRoutes(preferred)`，始终返回两个方向。
- 配置指纹变化自然产生新键，不继承旧提示。

只有 `runVerifiedDirectRouteAttempt` 最终成功后才能更新提示；任何失败不得清空或写入负状态。

- [ ] **Step 4: 实现可取消、同认证方式的复核**

```ts
private async verifyDirectSshRoute(
	source: ITurboFileTransferEndpoint,
	target: ITurboFileTransferEndpoint,
	route: TurboFileDirectSshRoute,
	progressId: string | undefined
): Promise<TurboFileDirectVerification>
```

要求：

1. `source-push` 登录 source 并从 source SSH 到 target；`target-pull` 反向。
2. 连接执行设备失败、创建配置失败或凭据准备内部失败返回 `indeterminate`；取消始终原样抛出。
3. 用现有 `prepareRemoteScpCredential` 支持密码、内嵌私钥和本机私钥路径；私钥只在执行设备 `/tmp` 暂存并在 `finally` 删除。
4. 嵌套命令使用与真实传输相同的 host、port、username、`buildDirectScpSshCommand`、`buildSshpassPrefix` 和身份文件。
5. 通过 `execRemoteBytes(..., { progressId })` 执行 `printf __TURBOFILE_DIRECT_READY__`；输出精确匹配标记才返回 `available`。
6. 嵌套 SSH 非零退出、认证失败、端口不可达、缺少 ssh/sshpass 返回 `unavailable`。
7. 注册取消处理器结束执行设备 client；日志只记录 route 和分类，不记录命令或凭据。

- [ ] **Step 5: 实现服务包装器**

`runVerifiedDirectRouteAttempt<T>` 负责：

- 取两个有序 route。
- 调用公共协调器。
- 传入 `isTransferCanceled`/`TurboFileTransferCanceledError` 识别函数。
- retry 前只发“直连重试”进度，不做破坏性删除；各协议 route 本身必须可安全重跑。
- 成功后记录该 route 为正向提示并返回 value。
- 保留 typed `TurboFileDirectUnavailableError` / `TurboFileDirectDataError` 给外层中转状态使用。

- [ ] **Step 6: 编译并运行测试**

```powershell
npm run compile-check-ts-native
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileDirectRoute.test.ts
npm run compile-check-ts-native
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts
```

- [ ] **Step 7: 提交**

```powershell
git add src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts
git commit -m "移除直连负缓存并增加认证复核"
```

---

## Task 3: 将四种协议统一接入并保护剪切源文件

**Files:**
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- Modify if needed: `src/vs/platform/turbofile/test/common/turbofileTransfer148Baseline.test.ts`

- [ ] **Step 1: 先写六个入口必须走统一包装器的断言**

分别截取方法体并断言调用 `runVerifiedDirectRouteAttempt`，且不再自行调用旧 route failure/cache helper：

- `tryDirectScpTransfer`
- `tryDirectSftpTransfer`
- `tryDirectTarTransfer`
- `tryDirectRsyncTransfer`
- `tryDirectBatchTarTransfer`
- `tryDirectBatchRsyncTransfer`

- [ ] **Step 2: 写批量剪切重试边界断言**

断言 `tryDirectBatchTarTransferRoute` 不接收 `operation`，不调用 `cleanupBatchSourcesAfterTar` 或 `deleteBatchSources`；源清理只能在 `runVerifiedDirectRouteAttempt` 已返回成功之后调用一次。

当源清理部分失败时：

- 返回/抛出明确的“数据已传完但源清理失败”结果。
- 不执行第二次直连，不回退中转，不进入回收站。
- `tryBatchTarTransfer` 对已定义的 direct result 直接返回，不能仅在 `result.ok` 时返回。

- [ ] **Step 3: 编译成功后确认测试失败**

```powershell
npm run compile-check-ts-native
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts
```

- [ ] **Step 4: 接入单任务 SCP/SFTP/tar/rsync**

保留每个 `...TransferRoute` 的真实数据命令、目标准备、完整性检查、进度和性能参数，仅用 `runVerifiedDirectRouteAttempt` 替换旧 route 循环。

- [ ] **Step 5: 接入批量 tar/rsync 并移动源清理**

批量数据 route 始终只完成复制。协调器成功返回后，外层根据 `operation` 清理源一次；清理失败是后处理失败，不得重新传数据。检查 rsync 的移动清理也在重试边界之外。

- [ ] **Step 6: 保持现有传输计划顺序**

`turbofileTransferPlan.ts` 仍保持：单文件 SCP 直连→中转；多文件/目录 tar 直连→中转；显式 rsync/SFTP 对应直连→中转。不得新增 attempt 或修改本地传输。

- [ ] **Step 7: 编译并运行回归**

```powershell
npm run compile-check-ts-native
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts
npm run compile-check-ts-native
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileTransferPlan.test.ts
npm run compile-check-ts-native
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileTransfer148Baseline.test.ts
```

- [ ] **Step 8: 提交**

```powershell
git add src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts src/vs/platform/turbofile/test/common/turbofileTransfer148Baseline.test.ts
git commit -m "统一所有SSH协议的直连判定"
```

---

## Task 4: 进度轮询解耦和准确的中转原因

**Files:**
- Modify: `src/vs/platform/turbofile/common/turbofile.ts`
- Modify: `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- Modify: `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- Modify if needed: `src/vs/workbench/contrib/turbofile/common/turbofileTransferDisplay.ts`
- Modify if needed: `src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts`

- [ ] **Step 1: 先写进度轮询不得误杀的断言**

截取 `tryDirectScpTransferRoute`、`tryDirectSftpTransferRoute`，断言保留 `beginRemoteFileGrowthTiming`/`beginRemotePathGrowthTiming`，但数据命令参数不包含：

```text
inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS
getActivityTime: () => lastActivityAt
```

- [ ] **Step 2: 为直连失败原因增加类型而不是解析字符串**

在 `ITurboFileTransferProgressEvent` 增加可选：

```ts
readonly directFallbackReason?: 'unavailable' | 'data-failure';
```

外层单项与批量计划捕获 typed error 后发出：

- `unavailable`：直连不可用，正在中转。
- `data-failure`：直连传输失败，正在中转。

retry 事件继续保持实际协议的 `*-direct` strategy 和原 route；最终 complete 必须使用实际数据承载 attempt 的 strategy。

- [ ] **Step 3: 编译成功后确认测试失败**

```powershell
npm run compile-check-ts-native
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts
```

- [ ] **Step 4: 移除 SCP/SFTP 的目标增长 watchdog**

保留 OpenSSH ConnectTimeout、ServerAlive、命令退出码和最终完整性校验；进度 probe 失败继续被 `beginTransferGrowthTiming` 捕获，但不能结束数据命令或改变 route 能力。

- [ ] **Step 5: 实现 typed fallback reason**

只修改直连/中转状态映射，不改工具栏、页面、排序、回收站、终端或拖拽 UI。若编辑器无需新映射即可显示 `detail`，不得额外改编辑器。

- [ ] **Step 6: 编译并运行回归**

```powershell
npm run compile-check-ts-native
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts
npm run compile-check-ts-native
npm run test-node -- --run src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts
npm run compile-check-ts-native
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileTarProgress.test.ts
```

- [ ] **Step 7: 提交**

```powershell
git add src/vs/platform/turbofile/common/turbofile.ts src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts src/vs/workbench/contrib/turbofile/common/turbofileTransferDisplay.ts src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts
git commit -m "避免进度轮询误判并区分中转原因"
```

---

## Task 5: 全量编译和 TurboFile 回归

**Files:**
- No production changes unless a failing in-scope regression proves a defect.

- [ ] **Step 1: 检查范围和格式**

```powershell
git diff --check
git status --short
```

只允许直连策略、SSH 主服务、公共进度类型、对应测试和文档变化；不得出现生成物、密钥、状态数据库或临时设备文件。

- [ ] **Step 2: 编译**

```powershell
npm run compile-check-ts-native
```

- [ ] **Step 3: 全部 TurboFile 测试**

```powershell
npm run test-node -- --runGlob "**/turbofile/test/**/*.test.js"
```

Expected: 0 failures。

---

## Task 6: 用实际服务执行七台设备的 84 个直连用例

**Files:**
- Create temporarily: `.superpowers/tmp/direct-matrix-<uuid>/`
- Create: `docs/superpowers/verification/2026-07-21-direct-transfer-matrix.md`
- Delete after test: `.superpowers/tmp/direct-matrix-<uuid>/`

- [ ] **Step 1: 创建不入库的 Electron 集成测试入口**

临时入口必须：

1. 使用当前编译产物实例化 `TurboFileSshMainService`，直接调用 `transferFile` 和 `transferBatch`，不能复制一份判定算法或只运行裸 SCP/tar 命令。
2. 从 TurboFile profile 状态读取设备元数据；凭据按当前 Windows SecretStorage 加密格式在内存中解密。若离线解密不可用，则在应用进程内通过 `ISecretStorageService` 读取，不要求用户把密码写到文件。
3. 凭据只存在内存并作为 `ITurboFileSshConnectionOptions` 传给服务；不得把密码放入本地脚本参数、环境变量、日志或报告。
4. 监听 progress event，记录首次实际 attempt、route、最终 strategy 和 `directFallbackReason`。
5. 临时入口、临时配置和运行日志均位于已忽略的 `.superpowers/tmp`，测试后删除。

- [ ] **Step 2: 安全发现七台设备**

按显示名称/主机精确匹配 60、61、62、57、NAS、64、5336。报告只记录名称、host、port、username 和认证类型；不得记录密码、私钥路径内容或密钥正文。任一设备缺失时标记未执行，不猜测替代设备。

- [ ] **Step 3: 建立隔离数据**

每台设备只使用：

```text
/tmp/turbofile-direct-matrix-<uuid>
```

为每个有序设备对生成：

- 一个随机小文件及 SHA-256。
- 一个含嵌套目录、txt、xml 和随机二进制小文件的文件夹及完整 SHA-256 清单。

- [ ] **Step 4: 执行 42 个单文件软件用例**

七台设备产生 `7 × 6 = 42` 个源→目标方向。每例调用 `transferFile`，要求：

- 结果 `strategy === 'scp-direct'`。
- progress 中实际 route 为 `source-push` 或 `target-pull`，不得为 relay。
- 目标 SHA-256 与源一致。
- 记录耗时、route、strategy 和校验结果。

若直连失败并中转，测试仍验证内容，但矩阵标为“中转（脱敏原因）”，不能误报直连。

- [ ] **Step 5: 执行 42 个文件夹软件用例**

每个方向调用 `transferBatch` 传一个目录，要求：

- 结果 `strategy === 'tar-direct'`。
- progress route 不为 relay。
- 目标目录清单和 SHA-256 全部一致。
- 记录耗时、route、strategy 和校验结果。

- [ ] **Step 6: 生成两个 7×7 矩阵报告**

每格写：

- `直连通过（source-push/target-pull，耗时）`
- `中转通过（unavailable/data-failure，耗时）`
- `失败（脱敏原因）`
- 对角线 `同设备，不适用`

报告汇总 84 个用例的直连、回退中转、失败、未执行数量，并明确这是对真实软件协调器和实际数据路径的联合验证。

- [ ] **Step 7: 无条件清理**

无论用例是否成功，对七台设备分别删除本次唯一测试根。删除前同时校验固定前缀和本次 UUID，拒绝空路径、根路径或任何非本次路径。删除本地临时入口和日志。

- [ ] **Step 8: 检查敏感信息**

```powershell
git status --short
rg -n "sshpass -p|BEGIN .*PRIVATE KEY|passphrase|\"password\"[ ]*:" docs/superpowers/verification/2026-07-21-direct-transfer-matrix.md
```

Expected: 报告无秘密；临时文件已删除。

---

## Task 7: 最终审查与交付

**Files:**
- Modify only if needed: `docs/superpowers/verification/2026-07-21-direct-transfer-matrix.md`

- [ ] **Step 1: 最终验证**

```powershell
npm run compile-check-ts-native
npm run test-node -- --runGlob "**/turbofile/test/**/*.test.js"
git diff --check
git status --short --branch
```

- [ ] **Step 2: 人工复核不变量**

- 正常任务第一条网络操作是实际直连数据命令。
- 认证复核只在真实直连失败后执行。
- 数据错误不会产生负冷却，下一任务仍先直连。
- 最近成功方向只改变顺序，不删除另一候选。
- 传输性能参数、本地传输、拖拽、排序、页面、终端和回收站未改变。
- 剪切成功只清理一次源；失败/取消不清理源。

- [ ] **Step 3: 提交验证报告**

```powershell
git add docs/superpowers/verification/2026-07-21-direct-transfer-matrix.md
git commit -m "记录七台设备直连矩阵验证结果"
```

- [ ] **Step 4: 交付证据**

向用户提供编译/测试结果、两个 7×7 矩阵、每个回退原因、实际 route/strategy，以及隔离数据已清理的确认。
