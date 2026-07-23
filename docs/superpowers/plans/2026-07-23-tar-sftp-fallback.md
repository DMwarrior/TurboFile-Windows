# Tar 失败后 SFTP 兜底实施计划

1. 先修改传输计划单元测试，使本机与 SSH 的 tar 计划包含本地 SFTP 兜底，使 SSH 与 SSH 的 tar 计划包含直连和中转 SFTP 兜底，并验证测试先失败。
2. 修改传输计划生成逻辑，只为会选择 tar 的形态追加 SFTP 尝试，保持单文件及其他显式协议不变。
3. 修改单目录本机与 SSH 传输，在 tar 返回不可用或失败后进入已有 SFTP 实现，取消仍立即终止。
4. 修改批量传输：tar 失败后构造强制 SFTP 的端点请求；SSH 与 SSH 的 SFTP 计划尝试同样强制子任务使用 SFTP；移动只由成功结果触发源清理。
5. 更新静态回归测试，检查所有路线均存在 SFTP 兜底且不存在 tar-only 终止分支。
6. 先运行 `npm run compile-check-ts-native`，通过后运行对应 TurboFile 单元测试，再运行 `npm run valid-layers-check` 和 `git diff --check`。
