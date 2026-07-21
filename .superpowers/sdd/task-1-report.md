# Task 1: 可行为测试的 SSH 直连协调器

## 交付内容

- 新增纯 common 层的 `turbofileDirectRoute` 协调器；未修改 Electron 服务。
- 提供确定的路由优先顺序：默认 `source-push`，其次 `target-pull`；最近成功的路由仅前置，不移除另一方向。
- 实现严格调用策略：首次传输失败后验证；`unavailable` 换向，`available` 或 `indeterminate` 仅同向重试一次；重试失败即停止并报告数据错误。
- 非取消的验证异常按 `indeterminate` 处理；任意阶段的取消错误原样抛出。
- 诊断错误提供 `name`、`route`、`cause` 和 `failures`，保留原始失败引用供宿主分类；错误消息不包含底层失败文本，也不记录日志。
- 新增正式 Mocha 行为测试，覆盖路由顺序、成功、验证结果、验证异常、换向、不可用、重试数据错误和三处取消路径。

## TDD 证据

1. 骨架阶段的 `npm run compile-check-ts-native` 通过。
2. 临时 `.mts` harness 在 `Not implemented` 骨架处按预期 RED。
3. 实现后，`npm run compile-check-ts-native` 通过，随后 `node --experimental-strip-types .superpowers/tmp/task-1-direct-route.mts` 输出 `task-1 direct-route harness passed`。
4. 临时 harness 已删除。

## 正式测试状态

正式测试文件已保留并通过 TypeScript 检查。初次提交时因 `out/` 被运行中的极速传输锁定而未执行；代码审查修复阶段已使用下述隔离发射方式完成正式 `test-node` 验证。

## 影响范围

- `src/vs/platform/turbofile/common/turbofileDirectRoute.ts`
- `src/vs/platform/turbofile/test/common/turbofileDirectRoute.test.ts`
- 本报告

## 代码审查修复

- 移除诊断错误上的原始 `cause` 及 `failures[].failure`；协调器只持久化 `{ route, stage }`，其中 `stage` 为 `initial` 或 `retry`。
- `verify` 仍在当前调用栈临时收到首次失败用于可用性复核，但协调器返回或抛错后不再保存该异常引用。
- 正式测试现在断言密码、私钥路径或完整命令一类 secret 不会出现在错误 `message`、JSON 或公开属性中，同时保留 `class + route + stage` 分类能力。

### TDD 与正式测试证据

更新测试、尚未修改实现时，正式命令执行到行为断言并得到预期 RED：`11 passing, 2 failing`；两处失败均为脱敏错误缺少预期 `stage`。实现后执行：

```powershell
npm run compile-check-ts-native
node .superpowers/tmp/transpile-task1.mjs
npm run test-node -- --run src/vs/platform/turbofile/test/common/turbofileDirectRoute.test.ts
```

最终结果：`compile-check-ts-native` 退出码 0；12/12 个 `TurboFileDirectRoute` 行为测试全部通过，另有 1 个测试运行器 Errors 守卫通过，Mocha 输出 `13 passing (6ms)`，退出码 0。

正常生成树当时不可用，因此临时脚本仅定向发射两个 Task 1 文件，并生成两个隔离测试基础设施模块：`ensureNoDisposablesAreLeakedInTestSuite` 调用保持在原始正式测试中，隔离模块为当前 suite 注册 teardown；`setUnexpectedErrorHandler` 供测试运行器使用。协调器不创建 disposable。验证后临时脚本和四个新 `out` 文件均已删除，未运行 Gulp、watch 或全量编译。
