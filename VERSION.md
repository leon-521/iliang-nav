# iliang nav 版本 / Version

ver: 0.1.6

每次公开发布，将补丁版本加 1（例如 `0.1.1` → `0.1.2`）。用 `npm version patch --no-git-tag-version` 更新包和锁文件，同步本文件，再提交并推送到 `main`。为该提交创建同名 `v` 标签，并在 [GitHub Releases](https://github.com/leon-521/iliang-nav/releases) 说明新增、修复与升级注意事项。后台版本检查读取本文件，不依赖 Release 元数据。

For each public release, increment the patch version. Run `npm version patch --no-git-tag-version`, sync the `ver:` line, then commit and push to `main`. Tag that commit with the corresponding `v` version and publish release notes in [GitHub Releases](https://github.com/leon-521/iliang-nav/releases). The dashboard reads this file independently of Release metadata.
