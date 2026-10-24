# Safari 扩展安装指南

本文说明如何在自己的 Mac 上安装并持续使用 All API Hub Safari 扩展。Safari 扩展需要通过配套的 macOS 应用安装；按下面步骤完成后，账号和设置会保存在本机。

## 已验证环境

本指南的安装流程已在 macOS 26.6.2、Safari 26.6.2 上实际验证。这里记录的是实际测试环境，不代表最低系统要求。

## 安装

1. 打开 [All API Hub 最新 Release](https://github.com/qixing-jk/all-api-hub/releases/latest)，下载 `all-api-hub-<版本号>-safari-xcode-bundle.zip`。不要下载名称中只有 `-safari.zip` 的附件。
2. 解压文件，找到其中的 Xcode 工程并用 Xcode 打开。
3. 在 Xcode 顶部选择 macOS 应用和这台 Mac 作为运行目标，点击 `Product > Run`。如果 Xcode 提示签名，按提示选择本机运行的签名选项。
4. 打开 Safari，先在 `Safari > 设置 > 高级` 中启用“显示网页开发者功能”，再到 `Safari > 设置 > 开发者` 中启用“允许未签名的扩展”。Safari 可能会要求输入 Mac 登录密码。
5. 在 `Safari > 设置 > 扩展` 中勾选 `All API Hub`，并按需允许访问目标网站。
6. 点击 Safari 工具栏中的扩展图标即可使用。

如果扩展没有出现在列表中，先回到 Xcode 再运行一次配套的 macOS 应用，然后重新打开 Safari 的扩展设置。

## 下次打开 Safari

Safari 退出后会重置“允许未签名的扩展”。每次重新打开 Safari 时，需要再次启用该选项。通常不需要重新启动 `All API Hub` macOS 应用；首次安装、重新安装或 Safari 找不到扩展时，再启动该应用。这个步骤只影响扩展是否能运行，不会清除扩展数据。

## 数据保存在哪里

账号、设置等扩展数据保存在当前 Safari 扩展的本机存储中。正常退出或重新打开 Safari 不会清除这些数据。Safari、Chrome、Firefox 以及其他设备之间不会自动同步；换浏览器或设备时，请使用[数据导入与导出](./data-management.md)或配置 WebDAV 备份。卸载扩展或清除 Safari 扩展数据前，建议先导出备份。

## Safari 中的功能差异

Safari 不提供部分其他浏览器扩展接口：

- 没有侧边栏 API，可使用工具栏弹窗或设置页面。
- 无法通过 Safari 书签 API 导入账号；可以手动添加账号或导入备份。
- 扩展通知 API 不可用；任务结果可在扩展中查看。
- 不支持扩展的 `clipboardRead` 权限；需要识别内容时，可以选中文本或手动粘贴。
- Safari 的独立 Cookie 请求由随扩展安装的 macOS 应用提供。请允许扩展访问目标网站并授予所需 Cookie 权限。该请求支持 HTTPS；HTTP 仅用于本机 `127.0.0.1` 测试。权限不足或原生应用未运行时，请求会停止，不会改用网页当前登录态。若弹窗中的账号刷新没有更新，可在设置页面刷新。

不同站点仍可能有各自的功能限制；扩展已安装不代表每个站点的所有功能都可用。

## 更新与卸载

**更新：** 下载最新 Release 中的 Safari Xcode 工程压缩包，用 Xcode 打开并运行新版应用，然后在 Safari 扩展设置中确认 `All API Hub` 已启用。使用同一扩展安装更新时，本机扩展数据会保留；更新前仍建议备份重要数据。

**卸载：** 在 `Safari > 设置 > 扩展` 中取消勾选 `All API Hub`，然后删除安装的 `All API Hub` macOS 应用。若还要清除本机保存的数据，请在 Safari 的网站与扩展数据设置中移除对应数据。

## 常见问题

### 为什么需要打开 Xcode 工程？

Safari 将扩展放在配套的 macOS 应用中安装。本指南下载的压缩包已包含工程和所需文件；用 Xcode 运行一次后，再到 Safari 设置中启用扩展即可。

### Safari 重启后扩展不能用了，是数据丢了吗？

通常不是。Safari 会在退出时重置“允许未签名的扩展”，所以通常重新启用该选项即可；如果 Safari 找不到扩展，再启动配套应用。账号和设置保存在 Safari 的本机扩展存储中，不会因为这项开关重置而删除。

### 如何在新设备上恢复账号？

在原设备先导出数据，或配置 WebDAV 备份；再在新设备安装扩展后导入数据或恢复备份。浏览器之间不会自动同步。

## 参考资源

- [Apple：运行 Safari Web 扩展](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)
- [Apple Safari Web Extensions 文档](https://developer.apple.com/documentation/safari-extensions/safari-web-extensions)
- [GitHub Issues 反馈问题](https://github.com/qixing-jk/all-api-hub/issues)
