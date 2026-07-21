# Task 4 报告：进度轮询解耦和准确的中转原因

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
