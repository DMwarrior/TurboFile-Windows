# Task 3 报告：统一所有 SSH 协议的直连判定

## 结果

- 单任务 SCP、SFTP、tar、rsync 与批量 tar、rsync 六个直连入口全部改为调用 `runVerifiedDirectRouteAttempt`，删除各入口自行解析、循环 route 和拼接原始失败文本的逻辑。
- 正常路径仍先调用原有真实数据 route；只有首次数据 route 失败后公共协调器才调用 verifier，并按原状态机决定同方向重试或下一方向。
- 删除 Task 2 暂存 wrapper 上的临时 `@ts-expect-error`。
- 各 `...TransferRoute` 的真实数据命令、目标准备、完整性检查、进度、超时、并发、缓冲、压缩与协议参数均未调整。
- SSH→SSH 批量 attempt 统一为纯复制；tar/rsync/concurrent 的源清理均移到最终成功 attempt 之后，由 `runSshToSshBatchTransferPlan` 对 move 只执行一次。
- 批量源清理部分失败返回明确的 `Batch transfer completed, but source cleanup failed ...` 终态结果，保留已传输字节、完成项和逐项失败；不会再发起第二次直连、中转或 concurrent 数据传输，也不进入回收站。
- `tryBatchTarTransfer` 对已定义 direct result 直接返回；`runSshToSshBatchTransferPlan` 与 `transferBatchCore` 对数据已完成但 `ok:false` 的 cleanup failure 直接短路。
- 未修改 `turbofileTransferPlan.ts`，既有 SCP/tar/rsync/SFTP 计划顺序保持不变；未修改本地传输或 UI 类型。

## TDD 证据

### RED

1. 先在 `turbofileSshMainServiceStatic.test.ts` 添加两个静态契约：六个入口必须使用统一 wrapper；batch cut cleanup 必须位于 route 重试边界之外并在三层调度中保持终态。
2. 执行 `npm run compile-check-ts-native`：退出码 0，无 TypeScript 错误。
3. 首次执行 exact static test 时，受保护的现有 `out` 缺少 `turbofileSshMainServiceStatic.test.js`，runner 报 `ERR_MODULE_NOT_FOUND`，未进入断言。
4. 复用前序报告允许的临时定向转译方式，只生成本任务 exact tests 所需的 JS 与最小 test runner 基础模块；再次执行：

   ```powershell
   npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts
   ```

   结果为 `31 passing, 2 failing`。六个入口全部仍显示 `verifiedAttempt: false`、手写 route 解析/循环为 `true`；batch tar route 仍接收 operation 并清理源，三个终态短路字段为 `false`。失败原因与缺失功能完全一致。

### GREEN

1. 最小实现六入口 wrapper、SSH→SSH 最终清理和三层短路后，首次类型检查发现 `runSshToSshBatchTransferAttempt` concurrent 分支残留 `operation` 引用；将该数据 attempt 明确固定为 `'copy'` 后重新运行 `npm run compile-check-ts-native`，退出码 0。
2. static GREEN 首轮为 `32 passing, 1 failing`；唯一失败来自测试对 wrapper 调用不必要地限定 `await` 文本，而实现以 async promise return 保持相同行为。收窄为调用存在性断言后，重新先编译再运行 exact test，结果为 `33 passing (58ms)`。
3. 每个后续 exact test 前均重新执行 `npm run compile-check-ts-native`，退出码均为 0：

   ```powershell
   npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileTransferPlan.test.ts
   ```

   结果：`9 passing (3ms)`。

   ```powershell
   npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileTransfer148Baseline.test.ts
   ```

   结果：`3 passing (7ms)`。

4. 未运行 gulp、watch、compile-client、`npm run compile`，也未清理整个 `out`；验证后删除临时转译脚本和本任务定向生成的六个 `out` 文件。

## 影响文件

- `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- `.superpowers/sdd/task-3-report.md`

`src/vs/platform/turbofile/test/common/turbofileTransfer148Baseline.test.ts` 无需修改，既有断言已覆盖并通过。

## 自审

- 六个指定入口各只有一处 `runVerifiedDirectRouteAttempt` 调用，不再直接调用 `resolveDirectSshRoutes`、手写 `for (const route of routes)` 或用 `formatTransferError` 聚合 route 原始错误。
- wrapper 内的公共状态机仍是 run-first：正常成功不执行 verifier；失败后才 verifier；只有协调器最终成功才更新正向 route cache。
- `tryDirectBatchTarTransferRoute`、`tryDirectBatchRsyncTransferRoute`、两个批量 coordinator 及 SSH 数据 attempt 均不清理源；SSH→SSH plan 只有一处 `deleteBatchSources`。
- move 的删除发生在最终数据 result 成功且取消检查通过之后；失败、取消、复核和重试期间均不删源。
- cleanup failure 通过已定义、`completed === items.length` 的 `ok:false` 结果连续穿过 `tryBatchTarTransfer`、batch plan 和 transfer core，不会落入下一 attempt。
- 相关代码块不调用 `movePathsToTrash`；永久源清理与回收站保持分离。
- `git diff --check` 无 whitespace error，仅有仓库既有 LF/CRLF 提示。
- 未改 `turbofileTransferPlan.ts`，未新增 attempt，未改变本地传输、UI、协议命令参数或性能常量。

## 风险与后续边界

- 服务层仍以精确静态回归覆盖，未在本任务环境执行真实双 SSH 主机的端到端传输、认证失败或中途取消集成测试。
- generic verifier 与既有 SFTP/rsync 私钥数据命令构造存在已知能力差异；按 brief 本任务只接统一 wrapper，没有扩写各数据协议认证构造。
- cleanup failure 用 `ok:false`、`completed === items.length` 表示“数据已完成但后处理失败”；调用方必须继续把该组合视为终态。新增的三层静态断言防止当前调度链回归。
- Task 4 才负责 `directFallbackReason` 等 UI/诊断扩展；本任务未把 raw verifier error、命令、主机或凭据拼入普通 fallback 文本。

## 独立审查补充：批量剪切运行时回归保护

### 结论

- 将“按计划执行数据 attempt、判定终态、move 最终清源一次”的纯协调逻辑提取到 `turbofileBatchTransferFlow.ts`，并由 `runSshToSshBatchTransferPlan` 的真实生产路径调用；Node 单测不导入 Electron main，也没有增加 test-only 服务 API。
- 协调器只接管原有 attempt 结果判定与最终清源边界。真实 direct/relay/concurrent attempt、路由顺序、取消检查、fallback 进度、失败聚合及 cleanup failure 结果构造仍由主服务提供。
- cleanup failure 在数据已成功后直接返回 `ok:false`、`completed === totalItems` 的终态结果，不执行任何后续 attempt；cleanup 抛错也位于数据 attempt 的 catch 边界之外，不会被误判为可 relay 的数据失败。
- 普通 `TurboFileDirectDataError` 与 `TurboFileDirectUnavailableError` 仍调用既有错误处理回调并继续 relay；direct、relay、concurrent 任一路径成功的 move 都只清源一次，copy 永不清源。

### TDD RED

1. 先新增 `turbofileBatchTransferFlow.test.ts`，以 stub 执行期望的纯协调 API，覆盖 cleanup failure 终态、普通 direct 错误继续 relay、三类成功 move 单次清源及 copy 不清源。此时未修改生产代码。
2. 先运行 `npm run compile-check-ts-native`，退出码 0。
3. 首次 exact runner 因仓库没有新测试的 `out` 产物，在断言前报 `ERR_MODULE_NOT_FOUND`；该结果属于测试基础设施阻塞，没有作为行为 RED 证据。
4. 使用 `tsc --noCheck` 只定向生成 Node runner 所需的临时 JS 后，重新运行：

   ```powershell
   npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileBatchTransferFlow.test.ts
   ```

   结果为 `1 passing, 6 failing`；六个行为用例均稳定失败在 `Expected a Node-safe batch transfer flow coordinator.`，证明缺失的是可执行的协调状态机而不是测试拼写或 Electron 装载问题。

### TDD GREEN 与重构

1. 最小实现纯 helper 并接入主服务后，先运行 `npm run compile-check-ts-native`，退出码 0；runtime test 变为 `7 passing`。
2. GREEN 后把 RED 阶段的 `Reflect.get` 桥接重构为正式 API 显式 import，并把普通 direct 失败收紧为 `TurboFileDirectDataError`、`TurboFileDirectUnavailableError` 两个运行时用例；最终 runtime test 为 `8 passing (5ms)`。
3. 静态 exact test 改为同时确认主服务真实调用 helper，以及 helper 中数据 attempt 位于唯一 cleanup 之前；最终结果为 `33 passing (54ms)`。
4. 每个 exact test 前均重新运行 `npm run compile-check-ts-native`，均退出码 0；其余回归结果：

   ```powershell
   npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileTransferPlan.test.ts
   # 9 passing (8ms)

   npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileTransfer148Baseline.test.ts
   # 3 passing (5ms)
   ```

### 补充影响文件

- `src/vs/platform/turbofile/common/turbofileBatchTransferFlow.ts`
- `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- `src/vs/platform/turbofile/test/common/turbofileBatchTransferFlow.test.ts`
- `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- `.superpowers/sdd/task-3-report.md`

`turbofileTransferPlan.ts`、`turbofileTransferPlan.test.ts` 与 `turbofileTransfer148Baseline.test.ts` 均未修改。

### 补充自审与风险

- helper 使用明确的 `ITurboFileBatchTransferFlowOptions`、batch result/failure/attempt 类型，没有 `any`、test-only production API 或 Electron 运行时依赖。
- 数据 result 只有 `ok:true` 或 `completed === totalItems` 才终止；不完整结果继续下一 attempt 并保留原有 failures。move 仅在 `ok:true` 后清源；已是 cleanup failure 的 `ok:false` 完整结果不会重复清源。
- 主服务的 attempt 调用、取消检查和 progress 仍在原顺序；helper 没有引入 attempt、改变 protocol/route 顺序，或触碰并发、buffer、压缩、超时、UI 与本地传输。
- 测试是纯状态机运行时回归，不替代真实双 SSH 主机的端到端验证；外部 SSH/rsync/tar 行为仍由既有 exact 与集成边界保护。
