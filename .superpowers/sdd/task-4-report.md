# Task 4 报告：进度轮询解耦和准确的中转原因

## Fresh review follow-up：批量结果协议选择顺序

- 并发批量协调器由 `recordStrategy` 改为接收完整的 `recordResult`，并且只记录 `result.ok === true` 的成功子结果。失败的 direct 子结果即使先返回，也不会抢占后续真正承载数据的 relay strategy。
- SCP 和 SFTP 均覆盖“失败 direct 结果先完成、成功 relay 结果后完成”的顺序，最终 parent `complete` 事件与 batch result 都使用成功的 `scp-relay` / `sftp-relay`。
- 零成功结果时，仅当本轮请求明确为 `strategyHint: 'relay'`，fallback 才通过 `getInitialBatchTransferAttempt(request, items)` 与 `transferAttemptToDirectionalStrategy(...)` 计算；因此不会再由默认规划误报成 direct，同时保留其他路径原有策略语义。
- typed direct error 的完整收敛、data-failure 优先级、取消语义与 batch move 最终成功后清源规则均保持不变。

### TDD 与验证

- RED：先将行为测试改为调用 `recordResult` 并加入 failure-first 场景；`npm run compile-check-ts-native` 按预期报两处 `recordResult` 不存在。
- GREEN：最小实现后 `npm run compile-check-ts-native` 退出码 0。
- 精确测试：`turbofileBatchTransferFlow.test.js` 10 passing；`turbofileSshMainServiceStatic.test.js` 35 passing。
- 相关回归：DirectRoute 13、TarProgress 3、1.148Baseline 2、TransferPlan 8、TransferDisplay 6 passing。
- 本轮合计 77 项通过，0 失败；`git diff --check` 无 whitespace error，仅有仓库既有 LF/CRLF 提示。

### Residual follow-up：取消结果协议标记

- 取消结果的候选集合改名为 `successfulStrategies`，且只在 `result.ok` 分支加入策略。失败 child 不再污染取消结果。
- 若取消前已有成功 child，返回该成功数据承载策略；若尚无成功 child，则返回本轮已计算的 attempt fallback（包括 relay directional strategy）。
- RED：新增静态契约后精确测试为 34 passing / 1 failing，失败项准确指出失败策略集合和取消 fallback 仍使用旧逻辑。
- GREEN：`npm run compile-check-ts-native` 退出码 0；Static 35、BatchFlow 10、DirectRoute 13，共 58 项通过，0 失败。

## 结果

- SCP 与 SFTP 直连仍启动 `beginRemoteFileGrowthTiming` / `beginRemotePathGrowthTiming` 发布目标增长进度，但数据命令不再把该 probe 的 `lastActivityAt` / `markActivity` 接入 `execRemote` inactivity watchdog。目标暂不增长或 probe 自身失败不会再关闭仍工作的数据通道。
- 两个协议的目标准备命令仍使用 `timeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS`；OpenSSH 的 `ConnectTimeout` / `ServerAlive` 构造、远端命令退出码、取消处理与最终文件大小校验均保持不变。
- `ITurboFileTransferProgressEvent` 新增可选的 `directFallbackReason?: 'unavailable' | 'data-failure'`。
- 单项与批量 SSH→SSH 计划只通过 `TurboFileDirectUnavailableError` / `TurboFileDirectDataError` 生成 typed fallback 进度，分别使用固定文案“直连不可用，正在中转。”与“直连传输失败，正在中转。”；纯映射 helper 不读取 `message`、不调用 `formatTransferError`。非 typed 失败仍保留既有诊断路径。
- `runVerifiedDirectRouteAttempt` 接收实际 direct strategy；SCP、SFTP、tar、rsync 及批量 tar、rsync 六个调用者分别传入对应的 `*-direct` strategy，直连同 route 重试事件同时带 strategy 和原 route。
- 中转开始事件继续使用下一实际 relay attempt 的 strategy；complete 仍由实际数据承载 attempt/result 的 strategy 发出。
- `directFallbackReason` 与固定 `detail` 由 main progress event 提供给日志、监听器及后续 harness；现有 UI 可能自行格式化并忽略该 `detail`。本任务不扩大可见 UI，因此未修改 workbench/browser 或 display 文件。

## 根因与 TDD 证据

### 根因

`tryDirectScpTransferRoute` 与 `tryDirectSftpTransferRoute` 的目标增长回调会更新 `lastActivityAt`，数据 `execRemote` 又以该时间作为 inactivity activity source。目标端暂时不增长时，展示用轮询因此会触发数据通道 watchdog，错误地中止仍在传输的 SCP/SFTP。正确边界是 probe 只报告进度；数据命令由 SSH keepalive、退出码、取消和最终完整性校验约束。

### RED

1. 先只在 `turbofileSshMainServiceStatic.test.ts` 增加两个静态契约：SCP/SFTP 保留 growth timing 和有界 mkdir、但数据 route 不含 growth activity clock/watchdog；typed fallback 必须有事件字段、固定脱敏映射、单项/批量接入以及六协议 retry strategy/route。
2. 执行 `npm run compile-check-ts-native`，退出码 0。
3. 首次 exact test 因 `out/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.js` 不存在而在断言前报 `ERR_MODULE_NOT_FOUND`；该基础设施结果未作为行为 RED。
4. 使用安全定向转译，只生成 static test 与 Node runner 所需的 `errors.js` 后重新运行：

   ```powershell
   npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts
   ```

   结果为 `33 passing, 2 failing`。第一项明确显示 SCP/SFTP 的 `noGrowthActivityClock` 与 `noGrowthWatchdog` 均为 `false`；第二项明确显示缺少 `getDirectFallbackProgress`，失败原因与待实现行为一致。

### GREEN

1. 最小实现事件字段、纯 typed mapping、两处外层 direct→relay progress 映射、wrapper strategy 参数与六调用者后，执行 `npm run compile-check-ts-native`，退出码 0。
2. static GREEN 首轮为 `34 passing, 1 failing`；唯一失败是既有测试对 import 整行做精确匹配，新增 typed error import 后预期字符串过时。更新该既有断言后，重新先编译再运行，最终 `35 passing (60ms)`。
3. 每个后续 exact test 前均重新运行 `npm run compile-check-ts-native`，退出码均为 0：

   ```powershell
   npm run test-node -- --run src/vs/workbench/contrib/turbofile/test/common/turbofileTransferDisplay.test.ts
   # 7 passing (3ms)

   npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileTarProgress.test.ts
   # 4 passing (3ms)

   npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileDirectRoute.test.ts
   # 14 passing (7ms)

   npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileBatchTransferFlow.test.ts
   # 8 passing (5ms)
   ```

4. 未运行 gulp、watch、compile-client、`npm run compile`，未清理整个 `out`；测试结束后仅删除本轮安全定向转译生成的精确 JS 文件。

## 影响文件

- `src/vs/platform/turbofile/common/turbofile.ts`
- `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- `.superpowers/sdd/task-4-report.md`

`turbofileTransferDisplay.ts` 与 `turbofileTransferDisplay.test.ts` 无需修改；本任务不新增可见 UI 映射，既有显示层回归已通过。

## 自审

- SCP/SFTP 两个 data route 均不存在 `lastActivityAt`、`markActivity`、`inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS`、`getActivityTime` 或 target-growth inactivity message；两个 growth timing 调用和有界 mkdir 均保留。
- tar/rsync 的 activity watchdog、超时、并发、buffer、chunk、压缩和协议命令参数未改。
- fallback helper 仅使用两个 typed error 的 `instanceof`，不读取错误字符串；typed reason 只在 direct attempt 的下一 attempt 为 relay 时附加。非 typed fallback 继续走原有文本与失败聚合。
- 单项与批量中转开始事件都使用 `transferAttemptToStrategy(nextAttempt)`；直连同 route retry 使用调用者传入的真实 direct strategy 与 coordinator 提供的原 route；成功 complete 仍使用实际 result strategy。
- 取消检查、SCP `progressId` 数据命令取消、SFTP client cancel handler、credential cleanup、最终完整性校验及 batch cut 最终清源状态机未改。
- `git diff --check` 无 whitespace error，仅有仓库既有 LF/CRLF 提示。
- 未修改工具栏、页面、排序、回收站、终端、拖拽、本地传输或其他无关文件。

## 风险与边界

- 本任务环境没有执行真实双 SSH 主机端到端传输；SCP/SFTP 的长时间无目标增长行为由精确静态契约保护，真实 OpenSSH/网络行为仍依赖现有集成边界。
- 移除的只是与目标增长 probe 耦合的数据 inactivity watchdog；若底层 SSH 通道永久无输出但 TCP/keepalive 仍存活，结束时间由 OpenSSH keepalive、通道退出或用户取消决定。这是 brief 指定的取舍，避免把展示轮询误作数据活性证明。
- `directFallbackReason` 当前是新增的可选诊断字段；进度监听器仍可读取固定 `detail`，既有 UI 展示保持不变且未新增可见映射，不会造成兼容性破坏。

## Fresh review 修复补充

- Fresh review 发现显式批量 SCP/SFTP 的子任务会把 typed direct error 过早转成普通失败结果，导致父批量计划无法区分“直连不可用”和“直连数据失败”；同时最终 parent `complete` 事件没有携带实际数据承载 strategy。
- 新增生产使用的 `runTurboFileConcurrentBatchAttempt` 协调器。并发 worker 只捕获 `TurboFileDirectUnavailableError` / `TurboFileDirectDataError`，保持原有 `mapLimit` 并发参数不变；所有 worker 完整 settle 后才向父计划抛出 typed error，且 data-failure 优先于 unavailable。这样 relay 不会与尚未结束的 direct worker 重叠。
- `transferFileCore` 与 SSH-to-SSH 子计划仅在内部显式批量 direct 调用时保留 typed error；公开单文件接口、普通失败结果和取消语义保持不变。
- 并发批量任务从实际 child result 选择一次 `chosenStrategy`，并同时用于最终 parent `complete` 事件与 batch result；SCP relay 和 SFTP relay 均有行为级回归测试。
- TDD RED：新增行为断言后 `8 passing, 2 failing`，失败原因均为协调器尚不存在。GREEN：相关七个套件共 `77 passing, 0 failing`：BatchFlow 10、DirectRoute 13、SshMainStatic 35、TarProgress 3、1.148Baseline 2、TransferPlan 8、TransferDisplay 6。
- 主代理独立复验：`npm run compile-check-ts-native` 退出码 0；上述 77 项定向 Mocha 回归全部通过；`git diff --check` 无 whitespace error，仅有仓库既有 LF/CRLF 提示。
