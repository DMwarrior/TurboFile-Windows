# 版本更新记录

从 1.172.0 开始，每次发布需新增对应版本的 Markdown 更新说明，并在 `src/vs/workbench/contrib/turbofile/common/turbofileReleaseNotes.ts` 头部添加相同版本的主要改动，保留已发布记录。安装包中的“帮助 → 更新日志”可离线查看这些内容。

发布脚本以此处版本说明作为参数，写入 GitHub/Gitee Release 和更新清单的 `notes`；客户端复用更新检查返回的说明显示悬停摘要，不额外请求网络。

源码和文档通过 Git 同步至两个公开仓库，发布脚本不再覆盖 Gitee 的 README 或删除源码构建说明。使用 `TURBOFILE_UPDATE_MANIFEST_OUTPUT` 可先输出验证完成的 Gitee 分片清单，再通过一次 Git 提交同步到两个仓库。

1.173.0 起，先运行 Gitee 发布脚本生成并验证国内分片清单，再将该文件路径设为 `TURBOFILE_UPDATE_DOMESTIC_MANIFEST` 执行 GitHub 发布脚本。后者必须匹配版本、安装包 SHA-256 和国内分片信息，禁止重新生成仅包含 GitHub 安装包地址的清单。
