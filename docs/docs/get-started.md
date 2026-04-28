# 开始使用

一个开源的浏览器插件，旨在优化管理 New API 等 AI 中转站账号的体验。用户可以轻松集中管理和查看账户余额、模型及密钥，并自动添加新站点。原则上只要浏览器支持扩展，通常就可以在移动端使用。

## 1. 下载


### 渠道版本对比

| 渠道 | 下载链接 | 当前版本 | 用户数 |
|------|----------|----------|--------|
| Chrome 商店 | [Chrome 商店](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/lapnciffpekdengooeolaienkeoilfeo?label=Chrome%20Users)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| Edge 商店 | [Edge 商店](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge Add-ons Users](https://img.shields.io/badge/dynamic/json?label=Edge%20Users&query=$.activeInstallCount&url=https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/pcokpjaffghgipcgjhapgdpeddlhblaa)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| Firefox 商店 | [Firefox 商店](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Mozilla Add-on Users](https://img.shields.io/amo/users/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox%20Users)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |
| GitHub Releases | [查看全部版本](https://github.com/qixing-jk/all-api-hub/releases) | [![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat)](https://github.com/qixing-jk/all-api-hub/releases/latest) | [![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/qixing-jk/all-api-hub/total?label=Total%20Downloads)](https://github.com/qixing-jk/all-api-hub/releases) |

::: tip 商店版和 Release 版的区别
- 默认推荐使用商店版。
- 商店版更适合大多数用户，安装更省事，后续通常可自动更新。
- Release 版需要手动下载、解压，并在更新后再次手动安装或重新加载。
- 只有在你明确需要更早获取新版本、手动验证修复，或必须加载扩展包时，再考虑使用 Release 版。

移动端 / 手机端补充说明：
- 原则上只要浏览器支持扩展，通常就可以使用，例如 `Edge`、`Firefox for Android`、`Kiwi` 等。
- 更多说明可查看 [常见问题中的移动端使用](./faq.md#mobile-browser-support)。
:::

<details>
<summary>Release 类型选择</summary>

先选版本类型，再下载对应附件：

| 类型 | 推荐场景 | 下载链接 | 特点 |
|------|----------|----------|------|
| 正式版 Stable | 日常使用、首次安装、优先稳定 | [下载最新正式版](https://github.com/qixing-jk/all-api-hub/releases/latest) | 对应正式发布版本，发布说明更完整，稳定性更高。 |
| Nightly 预发布 | 想尽快获取新功能 / 修复，或协助验证问题 | [下载 Nightly](https://github.com/qixing-jk/all-api-hub/releases/tag/nightly) | 基于 `main` 最新提交自动生成，更新更快，但可能包含尚未充分验证的改动；附件文件名通常会带 `nightly`。 |

::: tip 如何选择
- 不确定选哪个时，先选正式版 Stable。
- 如果你是为了确认某个修复是否已经包含，或愿意帮助反馈问题，再选择 Nightly。
- 商店版本通常会因审核延迟 1-3 天；GitHub 正式版一般更早，Nightly 最快，但风险也更高。
:::

</details>

### Safari 浏览器安装

Safari 不能像 Chrome、Edge、Firefox 一样直接通过商店安装或解压加载，必须通过 Xcode 安装。完整步骤请查看 [Safari 安装指南](./safari-install.md)。

推荐安装方式：

1. 从 GitHub Release 下载 `all-api-hub-<version>-safari-xcode-bundle.zip`，解压后直接打开其中的 Xcode 工程运行。

高级用法：

1. 从源码构建：`pnpm install` -> `pnpm run build:safari` -> `xcrun safari-web-extension-converter .output/safari-mv2/` -> 用 Xcode 运行。

::: warning Safari 下载注意事项
请下载 `all-api-hub-<version>-safari-xcode-bundle.zip`，不要单独下载 `all-api-hub-<version>-safari.zip`。前者已经包含可直接打开的 Xcode 工程和运行所需文件，更适合普通安装流程。
:::

如需正式签名并通过 TestFlight / App Store 分发，通常还需要 Apple Developer Program 账号；否则一般只适合本机调试或自用。

### QQ / 360 等浏览器安装

如果你使用 QQ 浏览器、360 安全浏览器、360 极速浏览器、猎豹浏览器、Brave、Vivaldi、Opera 等浏览器，请下载 GitHub Release 中的 Chrome 版本压缩包，并参考 [QQ / 360 等浏览器安装指南](./other-browser-install.md) 进行解压加载。

## 2. 支持的站点

支持基于以下项目部署的中转站：
- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [AxonHub](https://github.com/looplj/axonhub)
- WONG公益站
- [Sub2API](https://github.com/Wei-Shaw/sub2api)
- [AnyRouter](https://anyrouter.top)
- [VoAPI](https://github.com/VoAPI/VoAPI)
- [Super-API](https://github.com/SuperAI-Api/Super-API)
- Neo-API
- RIX_API（基本功能支持）

完整的兼容站点请查看 [支持的站点与系统类型](./supported-sites.md)。

::: warning
如果站点进行了二次开发导致一些关键接口（例如 `/api/user`）发生了改变，则插件可能无法正常添加此站点。
:::

## 3. 添加站点

::: info 提示
必须先使用浏览器自行登录目标网站，这样插件的自动识别功能才能读取您的登录信息，并获取账号信息。
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
- [访问令牌(Access Token)](#manual-addition)
- 充值金额比例
:::

> 若目标站点启用了 Cloudflare 五秒盾，插件会自动弹出独立窗口帮助过盾；通过后即可继续识别流程。
> 如IP质量不佳或其他原因，则需要在超时前手动在弹出的窗口中完成过盾。

### 3.2 Cloudflare 过盾助手概览

- 识别到 Cloudflare 五秒盾时，插件会自动拉起一个临时窗口帮助完成校验；若挑战需要人工干预，请在弹窗内点击验证即可。
- 校验通过后会自动回到原始流程，继续获取 Access Token 和站点信息。
- 更多细节可参考 [Cloudflare 防护与临时窗口降级](#cloudflare-window-downgrade)。

<a id="manual-addition"></a>
### 3.3 手动添加

::: info 提示
当自动识别未成功后，可进行手动输入添加站点账号，需要先获取以下信息。（每个站点可能 UI 有所差异，请自行寻找）
:::
![用户信息](./static/image/site-user-info.png)

如果目标站点为魔改版本（如 AnyRouter），请在添加账号时手动切换到 **Cookie 模式**，再执行自动识别或手动填写。遇到严格防护的站点时，也可以结合 Cloudflare 过盾助手配合使用。详情可查看 [常见问题](./faq.md#anyrouter-error)。

<a id="quick-export-sites"></a>
## 4. 快速导出与集成

本插件支持将已添加的站点 API 配置导出到本地客户端、CLI 工具和自建托管站点，从而减少重复录入 `Base URL`、密钥与模型配置的工作量。当前完整列表请查看 [支持的导出工具与集成目标](./supported-export-tools.md)。

### 4.1 配置

在使用导出 / 集成功能前，请根据目标类型完成对应配置：

- **CherryStudio / CC Switch**：保持目标客户端可用，便于通过 Deeplink 唤起导入。
- **Kilo Code / Roo Code**：建议提前确认每个密钥对应的模型 ID。
- **CLIProxyAPI / Claude Code Router**：在基础设置中填写对应的管理地址与凭证。
- **自建托管站点（New API / DoneHub / Veloera / Octopus / AxonHub）**：在 `设置 -> 基础设置 -> 自建站点管理` 中完成后台配置。

### 4.2 导出流程

1. **导航至密钥管理**：在插件的 **密钥管理** 页面，找到您想要导出的站点对应的 API 密钥。
2. **点击对应操作**：在密钥操作菜单中，选择 **“导出到 CherryStudio”**、**“导出到 CC Switch”**、**“导出 Kilo Code JSON”**、**“导入到 CLIProxyAPI”**、**“导入到 Claude Code Router”** 或 **“导入到当前自建站点”**。
3. **自动处理**：
   * **对于 CherryStudio / CC Switch**：插件会按照目标应用的 Deeplink 协议，自动传递站点信息和 API 密钥。
   * **对于 Kilo Code / Roo Code**：插件会生成可复制或下载的配置 JSON，便于手动导入。
   * **对于 CLIProxyAPI / Claude Code Router / 自建托管站点**：插件会调用对应管理接口，创建或更新 Provider / Channel。

通过这些集成能力，您可以把同一个上游站点同步到多个下游工具或后台系统，无需手动重复粘贴。

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

- 在 **设置 → 数据与备份** 中的“导入与导出”区域，可一键导出当前所有账号配置为 JSON。
- 支持导入旧版本或其他设备导出的数据，便于快速迁移或恢复。

### 5.6 New API 模型列表同步

关于 New API 模型列表同步功能的详细文档，请参阅 [New API 模型列表同步](./new-api-model-sync.md)。

### 5.7 New API 渠道管理（Beta）

在插件内直接创建/编辑/删除渠道，搭配模型白名单和单通道同步调试，可大幅减少往返 New API 后台的频次。参见 [New API 渠道管理](./new-api-channel-management.md) 了解详细操作与注意事项。

<a id="cloudflare-window-downgrade"></a>
### 5.8 Cloudflare 防护与临时窗口降级

- 识别或 API 调用被 Cloudflare 拦截（常见状态码 401/403/429）时，会自动切换到临时窗口重试，保持目标域 Cookie，一般无需手动操作；原理详见 [Cloudflare 过盾助手](./cloudflare-helper.md)。
- 如遇需要人机验证的场景，请在弹出的协助窗口中完成挑战；若频繁失败可尝试更换网络或降低请求频率。

### 5.9 书签管理

- 独立于账号的书签收藏功能，可保存常用的站点地址（控制台/文档/管理页面），无需创建完整账号。
- 支持为书签添加名称、URL、备注和标签，支持置顶和拖拽排序。
- 在弹窗中提供「账号/书签」切换 tab，可在书签和账号之间快速切换。
- 详细功能请参阅 [书签管理](./site-bookmarks.md)。

### 5.10 使用分析

- 可视化多站点/账号的使用趋势，帮助分析成本和用量。
- 支持查看日概览（请求数、Token 消耗、配额）、模型分布/成本分布、账号对比、使用时间热力图、延迟趋势/直方图等。
- 需要先在「设置 → 账号用量」中启用「用量历史同步」，设置保留天数和同步间隔，然后点击「立即同步」获取数据。
- 详细功能请参阅 [使用分析](./usage-analytics.md)。

### 5.11 API 凭证档案

- 独立于站点账号保存 `baseUrl + API Key` 组合，可脱离站点单独管理第三方 API 凭证。
- 支持按标签筛选，复用到模型查看、接口验证和状态统计。
- 在「密钥管理」页面可查看和管理独立的 API 凭证档案。
- 详细功能请参阅 [API 凭证档案](./api-credential-profiles.md)。

### 5.12 分享快照

- 将当前配置（账号、书签、设置等）导出为快照文件，分享给他人导入使用。
- 快照文件为加密的 JSON，可选择是否包含敏感信息（如 API Key）。
- 在「设置 → 数据与备份」中使用「分享快照」功能。
- 详细功能请参阅 [分享快照](./share-snapshots.md)。

### 5.13 Claude Code Router

- 将插件中管理的 API 密钥路由到 Claude Code（Claude Desktop）环境使用。
- 需要在「设置 → Claude Code Router」中填写管理地址和凭证。
- 支持自动发现已配置的 API 密钥并批量导入。
- 详细功能请参阅 Claude Code Router 相关说明。

### 5.14 CLIProxyAPI 集成

- 与 CLIProxyAPI 工具集成，可在插件中直接管理 CLIProxyAPI 的上游渠道。
- 需要在「设置 → CLIProxyAPI」中填写管理地址和凭证。
- 支持从账号管理中导入 API Key 到 CLIProxyAPI。
- 详细功能请参阅 [CLIProxyAPI 集成](./cliproxyapi-integration.md)。

### 5.15 LDOH 站点查询

- 支持查询 LDOH 站点信息，帮助发现和添加新的中转站。
- 在「设置 → LDOH 站点查询」中使用此功能。
- 详细功能请参阅 [LDOH 站点查询](./ldoh-site-lookup.md)。

## 6. 深入文档

- [支持的导出工具与集成目标](./supported-export-tools.md)
- [支持的站点与系统类型](./supported-sites.md)
- [Safari 安装指南](./safari-install.md)
- [QQ / 360 等浏览器安装指南](./other-browser-install.md)
- [Cloudflare 过盾助手](./cloudflare-helper.md)
- [快速导出站点配置](./quick-export.md)
- [自动刷新与实时数据](./auto-refresh.md)
- [自动签到与签到监控](./auto-checkin.md)
- [WebDAV 备份与自动同步](./webdav-sync.md)
- [数据导入导出](./data-management.md)
- [New API 模型列表同步](./new-api-model-sync.md)
- [New API 渠道管理](./new-api-channel-management.md)
- [CLIProxyAPI 集成](./cliproxyapi-integration.md)
- [模型重定向](./model-redirect.md)
- [排序优先级设置](./sorting-priority.md)
- [权限管理（可选权限）](./permissions.md)

## 7. 常见问题与支持

- 查看更详细的 [常见问题](./faq.md)，了解认证方式、AnyRouter 适配、功能使用技巧等。
- 如果遇到问题或需要新功能，欢迎前往 [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues) 进行反馈。
- 了解历史更新请查看 [更新日志](./changelog.md)。

::: tip 下一步
完成基础设置后，您可以继续配置自动刷新、签到检测或 WebDAV 同步，以获得更完整的使用体验。
:::
