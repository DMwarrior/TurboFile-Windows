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

正式测试文件已保留并通过 TypeScript 检查。当前运行中的极速传输锁定了 `out/`；遵循任务协调要求，未运行会生成或清理 `out/` 的编译、Gulp 或 watcher，正式 `test-node` 执行留待应用关闭后统一发射。

## 影响范围

- `src/vs/platform/turbofile/common/turbofileDirectRoute.ts`
- `src/vs/platform/turbofile/test/common/turbofileDirectRoute.test.ts`
- 本报告
