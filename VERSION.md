# iliang nav 版本 / Version

ver: 0.1.0

后台概览读取 GitHub `main` 分支的这份文件，并与当前运行包的版本比较。发布新版本时，请同步更新 `package.json`、`package-lock.json` 与此处的 `ver:`，然后推送到 `main`。无需创建 GitHub Release。

The admin dashboard reads this file from the `main` branch and compares it with the running package version. Update `package.json`, `package-lock.json`, and the `ver:` line together before pushing a new version. A GitHub Release is not required.
