# Task 2 报告：移除直连负冷却并增加同方向认证复核

## 结果

- 删除全部直连失败冷却、TTL、失败 Map、过滤/标记/清理 helper。
- `directSshRouteCache` 收敛为 `Map<string, TurboFileDirectSshRoute>`，只保存最近一次经公共协调器最终成功的方向；解析时始终返回两个方向。
- 主服务复用公共 `turbofileDirectRoute` 协调器及 typed error，没有复制状态机。
- 新复核先登录执行端，再从执行端按被测方向相同 host、port、username 与认证方式登录对端，只执行 marker，不访问业务路径。
- 正常旧协议循环仍先执行真实数据命令；Task 2 没有把 verifier 接入正常成功路径，因此没有新增成功路径网络耗时。

## TDD 证据

### 第一轮 RED：删除负状态与引入复核骨架

1. `npm run compile-check-ts-native`
   - 结果：通过，无 TypeScript 错误。
2. `npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
   - 结果：`27 passing, 1 failing`。
   - 预期失败：新增用例中的旧负状态删除、公共导入、route type 去重、verifier、wrapper、marker 六项均为 `false`。

实现最小功能后，同一静态命令得到 `28 passing`。

### 第二轮 RED：区分嵌套命令退出与执行端内部失败

1. `npm run compile-check-ts-native`
	- 首次发现 staged wrapper 尚未由 Task 3 接入而触发 TS6133；在方法声明处添加精确、临时的 `@ts-expect-error` 说明后重新运行，通过，正常构造路径不访问 wrapper。
2. `npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
   - 结果：`27 passing, 1 failing`。
   - 预期失败：typed remote exit、精确失败分类、`printf %s` marker quoting 三项为 `false`。
3. 最小实现后：
	- `npm run compile-check-ts-native`：通过，无 TypeScript 错误。
	- 静态 exact test：`28 passing`。

### 第三轮 RED：限定 marker 总等待时间

1. `npm run compile-check-ts-native`：通过，无 TypeScript 错误。
2. 静态 exact test：`27 passing, 1 failing`；新增的 `boundedMarkerExec` 为 `false`。
3. marker `execRemoteBytes` 增加现有直连 stall 总上限后，最终静态 exact test 为 `28 passing (47ms)`。

### 审阅修复 RED：输出异常分类与连接阶段取消

1. 在公共协调器测试中通过反射调用尚不存在的分类函数，保持 TypeScript 编译成功；exact test 得到 `13 passing, 1 failing`，失败原因是分类函数缺失。
2. 在主服务静态测试中增加 connect 前注册取消、取消 end+typed reject、verifier cleanup 顺序及新分类调用断言；exact test 得到 `27 passing, 2 failing`。
3. 最小实现后，common exact test 为 `14 passing (6ms)`，static exact test 为 `29 passing (56ms)`。

### 独立审查修复 RED：取消时的私钥清理与兼容 fallback

1. 先增加精确静态断言，要求 wrapper 在 retry 进度、真实 run 和 verify 前检查取消；verifier 使用 strict 私钥读取；旧三条数据路径保持非 strict；setup 前检查取消；临时 key 路径不提前 end client；SCP 两个数据 exec 都传 progressId。
2. 尚未修改实现时，静态 exact test 得到 `28 passing, 2 failing`：verifier 的提前 end 单项失败，其余七个目标字段均为 `false`。
3. 最小实现后，静态 exact test 得到 `30 passing`。

### 自审补充 RED：exec 已取消预检查竞态

1. 增加精确静态断言，要求 `execRemote` 与 `execRemoteBytes` 在注册取消 handler 和调用 `client.exec` 前同步检查已置位的取消状态。
2. 尚未修改实现时，静态 exact test 得到 `29 passing, 1 failing`，唯一失败字段为 `execPrechecksCancellation: false`。
3. 两个 exec 入口增加最小预检查后，`npm run compile-check-ts-native` 通过，静态 exact test 得到 `30 passing (57ms)`。

### 公共协调器测试

- 初次执行 exact 命令时，受保护的现有 `out` 中缺少 `turbofileDirectRoute.test.js`，runner 报 `ERR_MODULE_NOT_FOUND`，未进入断言阶段。
- 随后复用 Task 1 已接受的隔离方式：临时脚本只原样 transpile direct-route source/test 与静态 test，并生成 runner 所需的最小 utils/errors 模块。
- 再次执行 exact 命令 `npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileDirectRoute.test.ts`；最终结果为 `14 passing (7ms)`。
- 没有运行 gulp/watch/compile-client/npm compile；临时脚本与五个定向 `out` 文件在提交前删除。

### 最终 Step 6 顺序

1. `npm run compile-check-ts-native`：退出码 0，无 TypeScript 错误。
2. common exact test：`14 passing (6ms)`。
3. `npm run compile-check-ts-native`：退出码 0，无 TypeScript 错误。
4. static exact test：`30 passing (50ms)`。

## 关键变更

### 正向排序提示

- key 继续由双方 host、port、username、认证类型组成；这些配置变化会自然产生新 key。
- 非 SSH 端点返回空数组；SSH 端点先检查取消，再调用 `orderTurboFileDirectSshRoutes(preferred)`。
- 只有 `runVerifiedDirectRouteAttempt` 在最终成功且再次确认未取消后写入提示。
- 旧六个 route 循环仅移除旧 mark/clear/cache 调用，Task 3 再统一替换为 wrapper。

### 同方向认证复核

- `source-push` 登录 source 后从 source SSH 到 target；`target-pull` 反向。
- 执行端配置、连接或凭据准备失败返回 `indeterminate`。
- 只有 typed 嵌套 SSH 非零退出返回 `unavailable`；marker 不匹配及执行端 exec/channel/timeout 等异常返回 `indeterminate`。
- 分类提炼为 common 纯函数，并用行为测试覆盖 marker 命中、typed 非零退出、异常输出/内部错误三种结果。
- marker 使用 `printf %s` 和独立 shell quoting，输出必须精确等于 `__TURBOFILE_DIRECT_READY__`。
- marker exec 复用 `DIRECT_TRANSFER_STALL_TIMEOUT_MS` 总上限；超时属于执行端 exec 内部不确定性，返回 `indeterminate`。
- `connect(config, progressId?)` 在 `client.connect` 前注册 cancel handler；取消会先 settle，再 `client.end()` 并 reject typed cancellation。只有 verifier 传 progressId，其他连接调用保持原行为。
- 连接成功后的 verifier 不再注册会提前 end client 的生命周期 handler；setup 和 marker exec 各自用 progressId 立即关闭 channel，cleanup 不带 progressId 并使用仍存活的 client，最后才 end。
- wrapper 在 run/verify 边界把已置位取消状态规范化为 `TurboFileTransferCanceledError`，已有 typed cancellation 原样传播。
- wrapper 在 retry 进度前、真实 run 前和 verify 边界均预检查取消，取消后不会再启动数据命令。
- `execRemote` 与 `execRemoteBytes` 在注册 channel 取消 handler 和启动 `client.exec` 前同步预检查，已取消请求不会跨过 exec 边界。

### 凭据生命周期

- 密码、内嵌私钥、本机私钥路径统一经 `prepareRemoteScpCredential`。
- 私钥只写入执行端 `/tmp`；正常路径在 `finally` 删除。
- setup/chmod 半失败时 helper 按已知 identity path best-effort 删除后重抛，避免在返回 cleanupCommand 前遗留私钥。
- helper 在读 key 后、写入前检查取消；setup 取消后保留 client 完成 best-effort cleanup。
- verifier 通过 strict 选项把 unreadable privateKeyPath 归为 `indeterminate`；batch tar/direct tar/direct SCP 默认恢复既有 `.catch(() => undefined)` fallback。
- 三条临时 key 数据路径取消时只终止 setup/data channel，finally cleanup 完成后才 end client；SCP mkdir 与实际 scp exec 均传 progressId。SFTP/rsync 取消方式未改。
- 未记录命令、凭据或 stderr。

## 自审

- `git diff --check` 无 whitespace error，仅有仓库的 LF/CRLF 提示。
- 主服务中八个禁止的旧负状态符号均已消失。
- `directSshRouteCache.set` 只有 wrapper 最终成功分支一处；没有失败清除或负状态写入。
- verifier 不触碰 source/target 业务 path，仅执行 marker。
- cleanup 均先于 client end；setup 尚未成功返回凭据时的半写入补偿由 helper catch 单独负责。
- 正常旧六入口没有调用 verifier，首个网络操作仍为真实数据命令。

## 风险与后续边界

- Task 3 尚未把 SCP/SFTP/tar/rsync 和批量入口接入 `runVerifiedDirectRouteAttempt`；当前用声明处的精确 `@ts-expect-error` 标记 staged private wrapper，Task 3 接入后应删除该注释。
- 现有 direct SFTP/rsync 的私钥命令构造与 SCP/tar 不完全一致，这是 Task 3 接入时需要统一核对的已知风险，本任务没有扩展修改这些数据协议。
- 服务层连接/cleanup 受 Electron 主进程耦合限制仍以精确静态守卫覆盖；分类已有 common 行为测试，但没有真实双 SSH 设备集成测试。真实认证失败、工具缺失和端口不可达依赖 typed remote exit 路径。

## 影响文件

- `src/vs/platform/turbofile/common/turbofileDirectRoute.ts`
- `src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts`
- `src/vs/platform/turbofile/test/common/turbofileDirectRoute.test.ts`
- `src/vs/platform/turbofile/test/common/turbofileSshMainServiceStatic.test.ts`
- `.superpowers/sdd/task-2-report.md`
