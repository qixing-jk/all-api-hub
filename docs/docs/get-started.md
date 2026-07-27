# 快速上手

只需几分钟，即可开启你的 AI 资产智能管理之旅。All API Hub 能帮你自动同步额度、每日签到、并一键集成到常用的 AI 工具中。

## 1. 安装插件

为了获得最佳体验（包括自动更新），我们**强烈推荐从各浏览器官方商店安装**。

| 渠道 | 下载链接 | 当前版本 | 用户数 |
|------|----------|----------|--------|
| Chrome 商店 | [Chrome 商店](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/lapnciffpekdengooeolaienkeoilfeo?label=Chrome%20Users)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| Edge 商店 | [Edge 商店](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge Add-ons Users](https://img.shields.io/badge/dynamic/json?label=Edge%20Users&query=$.activeInstallCount&url=https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/pcokpjaffghgipcgjhapgdpeddlhblaa)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| Firefox 商店 | [Firefox 商店](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Mozilla Add-on Users](https://img.shields.io/amo/users/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox%20Users)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |

<details>
<summary>📦 需要手动安装、Safari 或手机端？（点击展开）</summary>

- **GitHub Stable**：无法安装商店版或 Chrome Web Store 兼容版本，或需要临时手动安装已发布修复时，可前往 [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases) 下载正式版。手动安装版本不会像商店版一样自动更新，你可以 Star / Watch 仓库来接收新版本通知。
- **Nightly 预发布**：适合想抢先体验并协助测试的用户，可能不如商店稳定版稳定。Nightly 也属于手动安装通道，不会自动更新。
- **Safari (Mac)**：需要通过 Xcode 安装，详见 [Safari 安装指南](./safari-install.md)。
- **QQ / 360 / Brave / Vivaldi / Opera 等**：不同 Chromium 浏览器的商店入口不同，Brave、Vivaldi、Opera 可优先尝试 Chrome Web Store；无法使用商店时再手动加载，详见 [其他浏览器安装指南](./other-browser-install.md)。
- **移动端**：支持 Edge 手机版、Firefox Android、Kiwi 等，详见 [移动端 FAQ](./faq.md#mobile-browser-support)。

</details>

<a id="add-site"></a>
## 2. 添加你的第一个账号

这是使用插件最核心的一步。**强烈建议使用“自动识别”功能**，它像扫码登录一样简单。

### 2.1 自动识别（推荐）

::: tip 第一步
先在浏览器里打开并登录你的 AI 中转站网站。
:::

1. 点击浏览器右上角的插件图标，打开主页面。
2. 点击 **`新增账号`**。
3. 在弹出的对话框中输入该站点的网址。
4. 点击 **`自动识别`**。
5. 确认信息无误后，点击 **`确认添加`**。

::: tip 还没有账号？
如果你正在寻找稳定、高效且兼容性良好的 AI 中转服务，可以尝试我们的合作伙伴：

- [火山引擎方舟 Coding-Plan](https://dis.chatdesks.cn/chatdesk/hsyqallapihub.html)：Lite 套餐 9.9 元/月起，并有邀请返利及首单优惠。
- [七牛云AI](https://s.qiniu.com/qE3eai)：企业级大模型 MaaS 平台，一站式调用全球 150+ 主流模型，企业用户可免费领 1200 万 Token。
- [Fenno.ai](https://api.fenno.ai/register?redirect=/purchase?tab=subscription%26group=16&aff=VS3FMCGW4XK4)：稳定、高效的 Codex 中转服务商，兼容 OpenAI 及 Anthropic 协议，可接入 Codex、Claude Code、OpenCode 等编程工具，All API Hub 用户可订阅 9.9 元 / 150 刀额度的 Coding Plan。
- [PackyCode](https://www.packyapi.com/register?aff=all-api-hub)：注册并充值时填写 `all-api-hub` 优惠码可享 9 折。[使用教程](./sponsor-guides/packycode.md)
- [星辰AI](https://ai.centos.hk)：充值比例 1:1，可开发票；Claude 低至 4 折。[使用教程](./sponsor-guides/xingchen.md)
- [Atlas Cloud](https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub)：一个 AI API 访问 300+ 精选视频、图像和 LLM 模型，新 Coding Plan 提供更高性价比的 API 访问。
- [AICodeMirror](https://www.aicodemirror.com/register?invitecode=7IQNR8)：提供 Claude Code / Codex / Gemini CLI 官方高稳定中转服务，通过此链接注册可享首充 8 折，企业客户最高可享 7.5 折。
- [RunAPI](https://runapi.co/register?aff=cvDm)：注册并联系 RunAPI 管理员可领取 ￥7 免费额度。[使用教程](./sponsor-guides/runapi.md)
- [Unity2.ai](https://unity2.ai/register?ref=9NjKJ86j&source=allapihub)：面向个人开发者、团队和企业的高性能 AI 模型 API 中转平台，支持 5000 RPM 级高并发；通过此链接注册可领取 $2 余额，加入官方群再送 $10，最高可领 $12 免费额度。
- [随想AI中转站](https://sui-xiang.com/)：提供 Claude、Codex、Gemini 等 API 中继服务，按量付费，支持每日签到测试额度、多线路冗余和自动故障切换。
- [Infistar.ai](https://infistar.ai/register?aff=ALLAPIHUB&ref_source=link)：在售模型均经真实调用验真，通过超 10000 条官方 API 与官方号池供应链路负载均衡，覆盖文本、视频、图片、嵌入、重排等全模态能力，价格与用量透明，模型低至官方价的 10%。
:::

> **过盾提示**：如果站点有 Cloudflare 验证（五秒盾），插件会自动弹出窗口协助过盾，验证通过后会自动继续识别。

<a id="manual-addition"></a>
### 2.2 手动添加（备选）

如果自动识别不成功，或者你想精确控制，可以手动填写：
- **用户名 / ID**：站点显示的名称。
- **访问令牌 (Access Token)**：通常在站点的“设置”或“令牌”页面可以找到。
- **模式选择**：默认推荐 `Access Token` 模式。

---

## 3. 支持的站点类型

不论你用的是哪种架构，我们基本都支持：
- **账号站点兼容架构**：One API, New API, Veloera, One-Hub, Done-Hub, Sub2API 等。
- **特色账号平台与兼容实现**：AIHubMix, AnyRouter, Neo-API, Super-API, v-api 等。
- **自建管理后台**：New API, Veloera, Done-Hub, Octopus, AxonHub, Claude Code Hub 等，用于渠道管理、迁移和部分模型同步。

::: tip 兼容性提示
如果是基于账号站点兼容架构搭建的中转站，通常可以作为账号添加；AxonHub、Octopus、Claude Code Hub 等则主要作为自建管理后台使用。完整的兼容列表请查看 [支持的站点与系统类型](./supported-sites.md)。
:::

<a id="quick-export-sites"></a>
## 4. 快速导出与集成

添加账号后，你可以一键将这些配置“推”给其它 AI 工具，再也不用手动复制粘贴。

1. 进入 **`密钥管理`** 页面。
2. 找到你想导出的 Key，在菜单中选择 **`导出到 CherryStudio`**、**`导出到 CC Switch`** 等。
3. 你的 AI 客户端会自动唤起并完成配置。

> 完整列表请查看 [支持的导出工具与集成目标](./supported-export-tools.md)。

---

## 5. 核心功能深入指南

### 📊 资产看板与统计
- **[资产总览与实时刷新](./auto-refresh.md)**：集中查看多站余额、用量与健康状态。
- **[余额历史记录](./balance-history.md)**：直观呈现资产变动趋势。
- **[用量统计分析](./usage-analytics.md)**：多维度分析消耗、模型分布与延迟。

### 🔑 密钥管理与快捷集成
- **[令牌管理](./key-management.md)**：集中管理站点令牌，支持一键补全。
- **[API 凭据库](./api-credential-profiles.md)**：无需账号保存 `Base URL + API Key`，用于复制、验证和查看模型。
- **[网页 API 嗅探](./web-ai-api-check.md)**：在网页内快速识别并测试 API 配置，可保存到 API 凭据库。

### ⚡ 自动化与信息追踪
- **[自动签到流](./auto-checkin.md)**：每天自动帮你完成所有站点的签到。
- **[网站公告](./site-announcements.md)**：后台抓取已添加站点的公告，集中查看维护、模型变更、价格调整等消息。
- **[兑换助手](./redemption-assist.md)**：自动识别网页兑换码并一键领取。
- **[书签收纳管理](./bookmark-management.md)**：集中收藏控制台、文档、充值入口。

### 🛡️ 稳定性与安全防护
- **[Cloudflare 过盾助手](./cloudflare-helper.md)**：协助通过验证，确保刷新、签到不中断。
- **[WebDAV 同步与加密](./webdav-sync.md)**：支持跨设备加密备份，数据永不丢失。

### 🔔 通知渠道
- **[任务通知](./task-notifications.md)**：在 **`设置 → 通用 → 通知`** 中开启，可通过浏览器系统通知、Telegram Bot、飞书机器人、钉钉机器人、企业微信机器人、ntfy 或通用 Webhook 接收后台任务结果提醒。

### 🛠️ 自建站点运营工具
- **[自建站点管理](./self-hosted-site-management.md)**：在插件内直接对渠道进行增删改查。
- **[模型同步与重定向](./managed-site-model-sync.md)**：批量同步上游模型，配置映射逻辑。

---

## 6. 其他说明

- 进入 **设置 → WebDAV 备份**，配置 WebDAV 地址、用户名与密码。
- 可选择同步策略（合并/仅上传/仅下载）并设置自动同步间隔。
- 建议搭配 JSON 导入导出，实现双重备份。

### 5.4 排序优先级

- 在 **设置 → 排序优先级设置** 中调整账号排序逻辑。
- 支持将当前站点、健康状态、签到需求、自定义字段等条件排列组合。
- 拖拽即可调整优先级，随时禁用不需要的排序规则。

### 5.5 数据导入导出

- 在 **设置 → 数据与备份** 中的「导入与导出」区域，可一键导出当前所有账号配置为 JSON。
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

### 5.12 Claude Code Router

- 将插件中管理的 API 密钥路由到 Claude Code（Claude Desktop）环境使用。
- 需要在「设置 → Claude Code Router」中填写管理地址和凭证。
- 支持自动发现已配置的 API 密钥并批量导入。
- 详细功能请参阅 Claude Code Router 相关说明。

### 5.13 CLIProxyAPI 集成

- 与 CLIProxyAPI 工具集成，可在插件中直接管理 CLIProxyAPI 的上游渠道。
- 需要在「设置 → CLIProxyAPI」中填写管理地址和凭证。
- 支持从账号管理中导入 API Key 到 CLIProxyAPI。
- 详细功能请参阅 [CLIProxyAPI 集成](./cliproxyapi-integration.md)。

### 5.14 LDOH 站点查询

- 在账号列表中，每个站点名称右侧会出现 LDOH 图标，点击即可跳转到 LDOH 网站并搜索对应站点。
- 在新增账号对话框中，可点击"打开 LDOH 站点列表"入口，便于查找和确认站点地址。
- LDOH 站点目录会在后台自动刷新，缓存有效期为 12 小时。
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
- [常见问题 FAQ](./faq.md)
- [更新日志](./changelog.md)
- [权限说明](./permissions.md)
- [数据导入导出](./data-management.md)
