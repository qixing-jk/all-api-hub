# Chromium 自更新安装（.crx）

本页面向想长期使用 GitHub 版本、又不想每次手动换包的 Chromium 用户。安装 `.crx` 后，浏览器会按发布页上的更新清单自动获取新版本。

::: tip 先确认你是否需要这条路
如果你能用 Chrome 商店、Edge 商店或 Firefox Add-ons，请直接使用商店版，它由浏览器自动更新，无需任何配置。

只有满足以下任一情况时，自更新安装才有意义：

- 你在 Linux 上使用 Chromium / Chrome。
- 你使用 QQ 浏览器、360 系、Brave、Vivaldi 等允许外部扩展的 Chromium 分支。
- 你愿意在 stock Chrome / Edge 上配置一次扩展白名单策略。
:::

## 为什么 stock Chrome / Edge 需要额外配置

Google 从 Chrome 33（Windows）和 Chrome 44（macOS）起，逐步禁止浏览器直接安装商店之外的扩展。没有管理员级策略时，Chrome 会：

- 拒绝安装来源不明的 `.crx`，报 `CRX_REQUIRED_PROOF_MISSING`；
- 或安装后以「不是来自 Chrome Web Store」为由自动停用，且无法长期重新启用。

配置白名单策略后，这两个限制都会解除，`.crx` 也能通过发布页上的清单正常自更新。这也是其他 Chromium 扩展分发自更新版本时的通行做法。

## 安装步骤

### 1. 下载发布附件

打开 [最新版本 Release](https://github.com/qixing-jk/all-api-hub/releases/latest)，下载：

```text
all-api-hub-chrome.crx
```

这个文件名不带版本号，因为 `releases/latest` 总是指向最新的正式版。Nightly 用户请到 [Nightly 发布页](https://github.com/qixing-jk/all-api-hub/releases/tag/nightly) 下载 `all-api-hub-nightly-chrome.crx`。

::: warning 不要同时安装 ZIP 版本
`.crx` 版和 `.zip` 解压加载版是两个不同的扩展 ID，数据不互通。已经用「加载已解压的扩展程序」安装的用户，请先导出备份，再卸载旧版后安装 `.crx`，最后导入备份。
:::

### 2. 允许浏览器安装外部扩展

#### Linux

无需配置。Chromium 与 Chrome 在 Linux 上允许安装自托管扩展。

#### Windows

需要写入管理员级注册表策略。仓库提供了现成的模板（`resources/crx-self-update/`）：Chrome 用 `chrome-install-policy.reg`，Edge 用 `edge-install-policy.reg`。模板里已填入本扩展的 ID，用管理员身份双击导入，然后完全退出并重启浏览器。

模板的核心内容就是这两条策略：

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionInstallAllowlist]
"1"="oligofghjlogjhmnhnhccnobbginfgmp"

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionInstallSources]
"1"="https://github.com/qixing-jk/all-api-hub/*"
"2"="https://release-assets.githubusercontent.com/*"
```

Edge 用户把两处 `Google\Chrome` 换成 `Microsoft\Edge`。

扩展 ID `oligofghjlogjhmnhnhccnobbginfgmp` 由签名公钥派生，与发布页 `updates.xml` 里的 `appid` 一致；安装后也可在扩展管理页核对。

#### macOS

需要用 MDM 或配置描述文件下发同名策略（`ExtensionInstallAllowlist`、`ExtensionInstallSources`）。仓库提供了 `resources/crx-self-update/chrome-install-policy.mobileconfig` 与 `edge-install-policy.mobileconfig`，直接通过 MDM 下发，或双击安装为系统描述文件。仅修改用户级 plist 不会被当作强制策略，浏览器会忽略。

### 3. 安装并确认

1. 打开 `chrome://extensions/`（Edge 为 `edge://extensions/`），开启「开发者模式」。
2. 把下载的 `.crx` 拖到扩展管理页，确认安装。
3. 检查扩展卡片没有显示「不是来自 Chrome Web Store」。

### 4. 验证自动更新

浏览器每隔几小时检查一次 `update_url`。想立即验证：

1. 打开 `chrome://extensions/`。
2. 点击页面上的「更新」按钮。
3. 有新版本时，扩展版本号会变化。

也可以在 All API Hub 的 **设置 → 关于** 里点击「检查更新」：自更新安装会提示「浏览器将自动安装」，而不会引导你下载压缩包。

## 常见问题

### 装完提示「不是来自 Chrome Web Store」并被停用

策略没有生效。确认注册表写在 `HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome`（64 位系统也可能是 `Wow6432Node` 路径），且值类型是字符串。改完必须完全退出浏览器再启动。

### 提示 `CRX_REQUIRED_PROOF_MISSING`

同样是策略缺失或未生效。这个报错表示 Chrome 无法验证该包的来源，配置 `ExtensionInstallAllowlist` 与 `ExtensionInstallSources` 后会消失。

### 更新一直不来

- 浏览器只在启动和定时检查时拉取 `update_url`，长期不重启会延迟。
- 公司电脑或受管设备可能由管理员覆盖了扩展策略。
- Nightly 的 `.crx` 使用 UTC 构建时间生成递增的浏览器版本号（`年.月日.时分.秒毫秒`，如 `2026.1026.459.59999`），显示名称仍保留包版本。浏览器比较这个数字版本号；插件内的更新提醒比较构建提交，两者用途不同。
- 从 Nightly `.crx` 切回 Stable `.crx` 时，先导出备份、卸载，再安装并导入备份。两者签名 ID 相同，但 Stable 的版本号低于 Nightly，不能直接覆盖降级。

### 我以后想回到商店版

先导出备份，卸载 `.crx` 版本，再从商店安装，最后导入备份。两个版本的扩展 ID 不同，数据不会自动迁移。

## 相关文档

- [安装渠道与更新说明](./extension-update-install.md)
- [其他浏览器安装指南](./other-browser-install.md)
- [Safari 扩展安装指南](./safari-install.md)
