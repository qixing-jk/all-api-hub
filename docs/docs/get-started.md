# 快速上手

只需几分钟，即可开启你的 AI 资产智能管理之旅。All API Hub 能帮你自动同步额度、每日签到、并一键集成到常用的 AI 工具中。

## 30 秒速览

如果你是新用户，按这 4 步走：

1. **从浏览器商店装好插件**（见下方"1. 安装插件"）
2. **在浏览器里登录你要管理的 AI 中转站**
3. **点浏览器右上角插件图标 → 新增账号 → 自动识别**
4. **搞定，可以一键导出到 Cherry Studio 之类的客户端了**

遇到问题先看 [常见问题 FAQ](./faq.md)，再考虑提 Issue。

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

- [七牛云AI](https://s.qiniu.com/qE3eai)：企业级大模型 MaaS 平台，一站式调用全球 150+ 主流模型，企业用户可免费领 1200 万 Token。
- [FennoAI](https://api.fenno.ai/s/DCGC)：稳定、高效的 Codex 中转服务商，兼容 OpenAI 及 Anthropic 协议，可接入主流编程工具并支撑千亿 Token/日的企业级调用；All API Hub 用户仅需 1.99 美元即可获得价值 50 美元的 Coding Plan 额度，邀请好友购买最高可获得 20% 返佣。
- [PackyCode](https://www.packyapi.com/register?aff=all-api-hub)：注册并充值时填写 `all-api-hub` 优惠码可享 9 折。[使用教程](./sponsor-guides/packycode.md)
- [星辰AI](https://ai.centos.hk)：充值比例 1:1，可开发票；Claude 低至 4 折。[使用教程](./sponsor-guides/xingchen.md)
- [玄枢API](https://www.xuanshuapi.com/register?aff=ALL-API-HUB&promo=ALL-API-HUB)：面向企业、技术团队和个人开发者的新一代 AI 模型路由网关，提供 Claude、GPT、Grok 等全球顶级模型一站式 API 接入；充值享八折，模型 2 折起，注册送 5 美金，通过专属链接注册额外获赠 5 美金额度，企业支持开票。
- [Atlas Cloud](https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub)：一个 AI API 访问 300+ 精选视频、图像和 LLM 模型，新 Coding Plan 提供更高性价比的 API 访问。
- [AICodeMirror](https://www.aicodemirror.ai/register?invitecode=7IQNR8)：提供 Claude Code / Codex / Gemini CLI 官方高稳定中转服务，通过此链接注册可享首充 8 折，企业客户最高可享 7.5 折。
- [随想AI中转站](https://sui-xiang.com/)：提供 Claude、Codex、Gemini 等 API 中继服务，按量付费，支持每日签到测试额度、多线路冗余和自动故障切换。
- [Infistar.ai](https://infistar.ai/register?aff=ALLAPIHUB&ref_source=link)：在售模型均经真实调用验真，通过超 10000 条官方 API 与官方号池供应链路负载均衡，覆盖文本、视频、图片、嵌入、重排等全模态能力，价格与用量透明，模型低至官方价的 10%。
- [火山引擎方舟 Coding-Plan](https://dis.chatdesks.cn/chatdesk/hsyqallapihub.html)：Lite 套餐 9.9 元/月起，并有邀请返利及首单优惠。
:::

> **过盾提示**：如果站点有 Cloudflare 验证（五秒盾），插件会自动弹出窗口协助过盾，验证通过后会自动继续识别。

<a id="manual-addition"></a>
### 2.2 手动添加（备选）

如果自动识别不成功，可以点击 **“手动添加”**，自行选择站点类型并填写账号信息。所需字段、访问令牌获取位置和注意事项请查看 [手动添加账号指南](./account-management.md#manual-addition)。

### 2.3 自动识别失败？

按下面的顺序排查：

- **站点有 Cloudflare 五秒盾？** → 看 [Cloudflare 过盾助手](./cloudflare-helper.md) 协助过盾后再试
- **站点不在支持列表？** → 用 `### 2.2 手动添加（备选）` 的方法，选择对应站点类型
- **Token 取不出来？** → 在新增账号时把"认证方式"从 `Access Token` 改成 `Cookie`，再点自动识别
- **保存后无法刷新？** → 看 [站点类型与认证方式说明](./faq.md#auth-methods)
- **还不行？** → 复制错误信息，去 [常见问题 FAQ](./faq.md) 搜，或者 [提 Issue](https://github.com/qixing-jk/all-api-hub/issues)

---

## 3. 支持的站点类型

不论你用的是哪种架构，我们基本都支持：
- **账号站点兼容架构**：New API, One API, Sub2API, One-Hub, Veloera, Done-Hub 等。
- **特色账号平台与兼容实现**：AnyRouter, AIHubMix, Super-API, v-api, Neo-API 等。
- **自建管理后台**：New API, AxonHub, Claude Code Hub, Octopus, Veloera, Done-Hub 等，用于渠道管理、迁移和部分模型同步。

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

> 点开下面任一文档，看每个功能的详细用法。

### 📊 资产看板与统计
- **[设置页总览（主仪表盘）](./options-overview.md)**：一屏查看账号状态、凭据库、今日用量与待办事项。
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

- **遇到问题先看 [常见问题 FAQ](./faq.md)**
- [更新日志](./changelog.md)
- [权限说明](./permissions.md)
- [数据导入导出](./data-management.md)
