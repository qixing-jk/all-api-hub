# 开始使用

一个开源的浏览器插件，旨在优化管理 New API 等 AI 中转站账号的体验。用户可以轻松集中管理和查看账户余额、模型及密钥，并自动添加新站点。支持在移动设备上通过 Kiwi 或手机版 Firefox 浏览器使用。

## 1. 下载


### 渠道版本对比

| 渠道 | 下载链接 | 当前版本 |
|------|----------|----------|
| GitHub Release | [Release 下载](https://github.com/qixing-jk/all-api-hub/releases) | ![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat) |
| Chrome 商店 | [Chrome 商店](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | ![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat) |
| Edge 商店 | [Edge 商店](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | ![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat) |
| Firefox 商店 | [Firefox 商店](https://addons.mozilla.org/firefox/addon/%E4%B8%AD%E8%BD%AC%E7%AB%99%E7%AE%A1%E7%90%86%E5%99%A8-all-api-hub/) | ![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat) |

::: warning 提示
商店版本在审核过程中会延迟 1-3 天。如需第一时间体验新功能或修复，建议优先使用 GitHub Release 版本或从仓库源码构建。
:::

## 2. 支持的站点

支持基于以下项目部署的中转站：
- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [VoAPI](https://github.com/VoAPI/VoAPI)
- [Super-API](https://github.com/SuperAI-Api/Super-API)

::: warning
如果站点进行了二次开发导致一些关键接口（例如 `/api/user`）发生了改变，则插件可能无法正常添加此站点。
:::

## 3. 添加站点

::: info 提示
必须先使用浏览器自行登录目标中转站，这样插件的自动识别功能才能通过 Cookie 获取到您账号的 [访问令牌(Access Token)](#_3-2-手动添加)。
:::

### 3.1 自动识别添加

1. 打开插件主页面，点击 `新增账号`

![新增账号](./static/image/add-account-btn.png)

2. 输入中转站地址，点击 `自动识别`

![自动识别](./static/image/add-account-dialog-btn.png)

3. 确认自动识别无误后点击 `确认添加`

::: info 提示
插件会自动识别您账号的各种信息，如：
- 用户名
- 用户 ID
- [访问令牌(Access Token)](#_3-2-手动添加)
- 充值金额比例
:::


### 3.2 手动添加

::: info 提示
当自动识别未成功后，可进行手动输入添加站点账号，需要先获取以下信息。（每个站点可能 UI 有所差异，请自行寻找）
:::
![用户信息](./static/image/site-user-info.png)

如果目标站点为魔改版本（如 AnyRouter），请在添加账号时手动切换到 **Cookie 模式**，再执行自动识别或手动填写。详情可查看 [常见问题](./faq.md#anyrouter-网站报错怎么办)。

## 4. 快速导出站点

本插件支持将已添加的站点 API 配置一键导出到 [CherryStudio](https://github.com/CherryHQ/cherry-studio) 和 [New API](https://github.com/QuantumNous/new-api)，从而简化在这些平台中添加上游供应商的流程。

### 4.1 配置

在使用快速导出功能前，您需要先在插件的 **基础设置** 页面中，配置目标平台（New API）的 **服务器地址**、**管理员令牌** 和 **用户 ID**。

### 4.2 导出流程

1. **导航至密钥管理**：在插件的 **密钥管理** 页面，找到您想要导出的站点对应的 API 密钥。
2. **点击导出**：在密钥操作菜单中，选择 **“导出到 CherryStudio”** 或 **“导出到 New API”**。
3. **自动处理**：
   * **对于 New API**：插件会自动检测目标平台是否已存在相同 `Base URL` 的渠道，避免重复添加。如果不存在，则会创建一个新渠道，并自动填充站点名称、`Base URL`、API 密钥以及可用模型列表。
   * **对于 CherryStudio**：插件会将站点和密钥信息直接发送到您本地的 CherryStudio 程序中。

通过此功能，您可以轻松地将 API 供应商配置导入到其他平台，无需手动复制粘贴，提高了工作效率。

## 5. 功能速览

### 5.1 自动刷新与健康状态

- 打开 **设置 → 自动刷新**，可启用定时刷新账号数据，默认间隔 6 分钟（360 秒），最短支持 60 秒。
- 勾选 **“打开插件时自动刷新”** 可在打开弹窗时同步数据。
- 启用 **“显示健康状态”** 后，账号卡片会展示健康状态指示（正常/警告/错误/未知）。

### 5.2 签到检测

- 在账号信息中勾选 **“启用签到检测”** 可追踪站点签到状态。
- 支持设置 **自定义签到 URL** 与 **自定义充值 URL**，适配魔改站点。
- 需要签到的账号会在列表中显示提示，点击即可跳转到签到页面。

### 5.3 WebDAV 备份与多端同步

- 进入 **设置 → WebDAV 备份**，配置 WebDAV 地址、用户名与密码。
- 可选择同步策略（合并/仅上传/仅下载）并设置自动同步间隔。
- 建议搭配 JSON 导入导出，实现双重备份。

### 5.4 排序优先级

- 在 **设置 → 排序优先级设置** 中调整账号排序逻辑。
- 支持将当前站点、健康状态、签到需求、自定义字段等条件排列组合。
- 拖拽即可调整优先级，随时禁用不需要的排序规则。

### 5.5 数据导入导出

- 在 **设置 → 数据管理** 中，可一键导出当前所有账号配置为 JSON。
- 支持导入旧版本或其他设备导出的数据，便于快速迁移或恢复。

### 5.6 New API 模型列表同步

关于 New API 模型列表同步功能的详细文档，请参阅 [New API 模型列表同步](./new-api-model-sync.md)。

## 6. 常见问题与支持

- 查看更详细的 [常见问题](./faq.md)，了解认证方式、AnyRouter 适配、功能使用技巧等。
- 如果遇到问题或需要新功能，欢迎前往 [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues) 进行反馈。
- 了解历史更新请查看 [更新日志](https://github.com/qixing-jk/all-api-hub/blob/main/CHANGELOG.md)。

::: tip 下一步
完成基础设置后，您可以继续配置自动刷新、签到检测或 WebDAV 同步，以获得更完整的使用体验。
:::
