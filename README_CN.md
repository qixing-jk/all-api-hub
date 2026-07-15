<h4 align="center">
简体中文 | <a href="./README.md">English</a> | <a href="./README_JA.md">日本語</a>
</h4>

<div align="center">

# All API Hub – 你的全能 AI 资产管家

**一站式管理 New API 兼容中转站账号：余额/用量、模型价格、自动签到、API 凭据、网页内测试，以及渠道与模型同步/重定向**

<p align="center">
<a href="https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo">
  <img alt="Chrome Web Store" src="https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat">
</a>
<a href="https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa">
  <img alt="Microsoft Edge" src="https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat">
</a>
<a href="https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}">
  <img alt="Firefox Add-on" src="https://img.shields.io/amo/v/{bc73541a-133d-4b50-b261-36ea20df0d24}?label=Firefox&logo=firefoxbrowser&style=flat">
</a>
</p>

**[⚡ 快速上手](https://all-api-hub.qixing1217.top/get-started.html) | [🌐 支持站点](https://all-api-hub.qixing1217.top/supported-sites.html) | [🔌 集成工具](https://all-api-hub.qixing1217.top/supported-export-tools.html) | [📜 更新日志](https://all-api-hub.qixing1217.top/changelog.html)**

<p align="center">
  <a href="https://linux.do/t/topic/2395800">
    <img alt="Linux.do 主题帖" src="https://img.shields.io/badge/Linux.do-主题帖-faa511?logo=linux&logoColor=white" />
  </a>
  <a href="./resources/wechat_group.png">
    <img alt="微信中文群" src="https://img.shields.io/badge/微信-中文群-green?logo=wechat&logoColor=white" />
  </a>
  <a href="https://qm.qq.com/q/ebSCy31Phe">
    <img alt="QQ 中文群" src="https://img.shields.io/badge/QQ-中文群-12B7F5?logo=qq&logoColor=white" />
  </a>
  <a href="https://discord.gg/RmFXZ577ZQ">
    <img alt="Discord 多语言社区" src="https://img.shields.io/badge/Discord-多语言社区-5865F2?logo=discord&logoColor=white">
  </a>
  <a href="https://t.me/qixing_chat">
    <img alt="Telegram 多语言群" src="https://img.shields.io/badge/Telegram-多语言群-blue?logo=telegram&logoColor=white">
  </a>
</p>

</div>

<a id="introduction"></a>
## ❓ 为什么需要 All API Hub？

**简单来说**：AI 中转站就像“AI 充值卡超市”，能低价甚至免费使用 ChatGPT、Claude、GPT Image 等模型。

但如果你有多个账号，管理起来会很头疼：
- 📂 **资产分散**：余额和用量要逐站登录查看。
- 💲 **价格复杂**：不同站点倍率不同，难判断哪家更划算。
- ✅ **福利易漏**：每日签到送额度，但手动处理容易忘。
- 🔌 **配置繁琐**：API 信息要反复复制到 cc-switch、Cherry Studio 等工具里。

**All API Hub 就是你的 AI 资产管家**：填入站点地址，剩下的交给插件处理。

<a id="features"></a>
## ✨ 它能为你做什么？

### 📊 多站点统一看板
- **多账号资产总览**：集中查看余额、用量与健康状态。
- **智能站点识别**：粘贴地址即可识别架构、计费比例并完成添加。
- **API 凭据库**：保存常用 `Base URL + API Key`，用于复制、验证接口、查看模型与余额/用量。

### 💰 智能省钱与自动收益
- **模型价格比对**：计算各站点模型折合单价，找出更划算的分组与站点。
- **全自动签到流**：一键或定时执行支持站点的签到。
- **用量深度统计**：按站点、账号、模型、日期生成报表，包含热力图与慢请求分析。

### 🚀 极速生态集成
- **一键快捷导出**：同步到 **CherryStudio, CC Switch, CLIProxyAPI, Claude Code Router, Kilo Code** 等，完整列表见 [支持的工具](https://all-api-hub.qixing1217.top/supported-export-tools.html)。
- **后台联动工具**：将账号/密钥导入为自建站点渠道，并提供渠道管理、模型重定向、渠道同步等工具。
- **网页嗅探与快速录入**：在网页上选中 Base URL 或 API Key 即可快速弹出测试窗并保存，详情见 [网页 API 嗅探与验证](https://all-api-hub.qixing1217.top/web-ai-api-check.html)。

### 🧪 稳定性护航
- **多维度接口验证**：支持批量测试模型可用性、Token 兼容性及 CLI 代理可用性。
- **CF 过盾助手**：自动协助通过 Cloudflare 挑战，确保数据刷新与接口调用不中断。

### 🔒 保护隐私与安全
- **默认本地管理**：Key 和账号信息默认保存在本机，只有启用 WebDAV 备份/同步时才会上传。
- **加密同步**：支持 WebDAV 加密备份，换设备也能恢复数据。

<a id="installation"></a>
## 🚀 快速安装

> [!IMPORTANT]
> **绝大多数用户建议优先选择商店安装**。商店版安装简单、支持自动更新。

| 渠道 | 安装链接                                                                                          | 当前版本 | 用户数                                                                                                                                                                                                                     |
|------|-----------------------------------------------------------------------------------------------|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Chrome 商店 | [Chrome 商店](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo)        | [![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/lapnciffpekdengooeolaienkeoilfeo?label=Chrome%20Users)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| Edge 商店 | [Edge 商店](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge Add-ons Users](https://img.shields.io/badge/dynamic/json?label=Edge%20Users&query=$.activeInstallCount&url=https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/pcokpjaffghgipcgjhapgdpeddlhblaa)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| Firefox 商店 | [Firefox 商店](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Mozilla Add-on Users](https://img.shields.io/amo/users/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox%20Users)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |

<details>
<summary>📦 需要手动安装或测试版？（点击展开）</summary>

| 渠道 | 下载链接 | 适用场景 |
|------|----------|----------|
| GitHub Stable | [下载 Stable](https://github.com/qixing-jk/all-api-hub/releases/latest) | 无法安装商店版，或需要临时手动安装已发布修复 |
| Nightly 预发布 | [下载 Nightly](https://github.com/qixing-jk/all-api-hub/releases/tag/nightly) | 想抢先体验新功能并协助测试，可能不如商店稳定版稳定 |

GitHub Stable 和 Nightly 属于手动安装通道，不会自动更新；可 Star / Watch 仓库接收新版本通知。更多说明见 [安装与更新说明](https://all-api-hub.qixing1217.top/extension-update-install.html)。

**其他环境支持：**
- **手机端**：支持 Edge 手机版、Firefox Android、Kiwi 等浏览器，详见 [移动端使用指南](https://all-api-hub.qixing1217.top/faq.html#mobile-browser-support)。
- **QQ / 360 等**：详见 [手动加载指南](https://all-api-hub.qixing1217.top/other-browser-install.html)。
- **Safari (Mac)**：需要 Xcode 编译，详详见 [Safari 安装指南](https://all-api-hub.qixing1217.top/safari-install.html)。

</details>

<a id="sponsors"></a>
## ❤️ 赞助商

> [想出现在这里？](mailto:street-anime-olive@duck.com)

<div>
  <p>
    <a href="https://dis.chatdesks.cn/chatdesk/hsyqallapihub.html">
      <img src="resources/partners/volcengine.png" alt="火山引擎方舟 Coding-Plan" width="100%">
    </a>
  </p>
  <p>
    <b>火山引擎方舟 Coding-Plan</b> 是字节跳动推出的开发者生产力计划。Lite 套餐仅需 <b>9.9 元/月</b>，即可畅享豆包、DeepSeek、GLM 等顶级大模型。
    完美适配 Cursor、Claude Code、Windsurf 等 IDE 工具，提供极速响应、高并发稳定性及独家 Auto 模型自动切换体验。
    现在通过<a href="https://dis.chatdesks.cn/chatdesk/hsyqallapihub.html">活动链接</a>加入，还可享受好友邀请返利及首单优惠。
  </p>
</div>

<hr>

<div>
  <a href="https://s.qiniu.com/qE3eai">
    <img src="resources/partners/qiniu.png" alt="七牛云AI" width="180" align="left" hspace="10" vspace="4">
  </a>
  <p>
    感谢七牛云AI赞助了本项目！七牛云AI 是七牛云（02567.HK）旗下企业级大模型 MaaS 平台，一站式调用全球 150+ 主流模型，兼容全球主流模型厂商协议，覆盖文本、图像、音频、视频、文件处理等全模态处理能力，服务超过 169 万企业及开发者用户。
    企业用户可通过<a href="https://s.qiniu.com/qE3eai">此链接</a>免费领取 1200 万 Token，邀请好友最高可得百亿 Token。
  </p>
</div>

<hr>

<div>
  <a href="https://api.fenno.ai/register?redirect=/purchase?tab=subscription%26group=16&aff=VS3FMCGW4XK4">
    <img src="resources/partners/fennoai.jpg" alt="Fenno.ai" width="180" align="left" hspace="10" vspace="4">
  </a>
  <p>
    感谢 Fenno.ai 赞助了本项目！Fenno.ai 是一家稳定、高效的 API 中转服务商，目前主要提供 Codex 中转服务，兼容 OpenAI 及 Anthropic 协议，可灵活接入 Codex、Claude Code、OpenCode 等主流编程工具，并支持企业级高吞吐调用、国内及海外主体公对公结算和开票。
    Fenno.ai 为 All API Hub 用户提供专属福利：通过<a href="https://api.fenno.ai/register?redirect=/purchase?tab=subscription%26group=16&aff=VS3FMCGW4XK4">此链接</a>即可订阅 9.9 元 / 150 刀额度的 Coding Plan，邀请好友最高可享 20% 奖励。
  </p>
</div>

<hr>

<div>
  <a href="https://www.packyapi.com/register?aff=all-api-hub">
    <img src="resources/partners/packycode.png" alt="PackyCode" width="128" align="left" hspace="10" vspace="4">
  </a>
  <p>
    感谢 PackyCode 赞助了本项目！PackyCode 是一家稳定、高效的API中转服务商，提供 Claude Code、Codex、Gemini 等多种中转服务。PackyCode
    为本软件的用户提供了特别优惠，使用<a href="https://www.packyapi.com/register?aff=all-api-hub">此链接</a>注册并在充值时填写"all-api-hub"优惠码，首次充值可以享受9折优惠（<a href="https://all-api-hub.qixing1217.top/sponsor-guides/packycode.html">使用教程</a>）！
  </p>
</div>

<hr>

<div>
  <a href="https://ai.centos.hk">
    <img src="resources/partners/xingchen.png" alt="星辰AI" width="64" align="left" hspace="10" vspace="4">
  </a>
  <p>
    感谢星辰AI赞助了本项目！星辰AI是一家稳定、高效的 API 中转服务商，提供 Claude Code、Codex、Gemini 等多种中转服务。充值比例 1:1，可开发票；Claude 低至 4 折。欢迎通过<a href="https://ai.centos.hk">此链接</a>了解和使用（<a href="https://all-api-hub.qixing1217.top/sponsor-guides/xingchen.html">使用教程</a>）。
  </p>
</div>

<hr>

<div>
  <a href="https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub">
    <img src="resources/partners/atlas-cloud-logo-display.svg" alt="Atlas Cloud" width="128" align="left" hspace="10" vspace="4">
  </a>
  <p>
    感谢 Atlas Cloud 赞助了本项目！Atlas Cloud 是全模态 AI 推理平台，开发者只需接入一个 AI API，即可统一访问视频生成、图像生成和 LLM
    API，覆盖 300+ 精选模型。Atlas Cloud 新推出 Coding Plan 优惠，适合需要更高性价比 API 访问的开发者，欢迎通过<a href="https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub">此链接</a>了解。
  </p>
</div>

<hr>

<div>
  <a href="https://www.aicodemirror.com/register?invitecode=7IQNR8">
    <img src="resources/partners/aicodemirror.png" alt="AICodeMirror" width="128" align="left" hspace="10" vspace="4">
  </a>
  <p>
    感谢 AICodeMirror 赞助了本项目！AICodeMirror 提供 Claude Code / Codex / Gemini CLI 官方高稳定中转服务，支持企业级高并发、极速开票、7×24 专属技术支持。Claude Code / Codex / Gemini 官方渠道低至 3.8 / 0.2 / 0.9 折，充值更有折上折！AICodeMirror
    为 All API Hub 的用户提供了特别福利：通过<a href="https://www.aicodemirror.com/register?invitecode=7IQNR8">此链接</a>注册，可享受首充 8 折，企业客户最高可享 7.5 折！
  </p>
</div>

<hr>

<div>
  <a href="https://runapi.co/register?aff=cvDm">
    <img src="resources/partners/runapi.jpg" alt="RunAPI" width="64" align="left" hspace="10" vspace="4">
  </a>
  <p>
    感谢 RunAPI 赞助了本项目！RunAPI 是高效稳定的 API OpenRouter 平替平台，一个 API Key 即可访问 OpenAI、Claude、Gemini、DeepSeek、Grok 等 150+ 主流模型，低至 1 折，极其稳定，可以无缝兼容 Claude Code、OpenClaw 等工具。RunAPI
    为 All API Hub 的用户提供专属福利：使用<a href="https://runapi.co/register?aff=cvDm">此链接</a>注册并联系 RunAPI 管理员，即可领取 ￥7 的免费额度（<a href="https://all-api-hub.qixing1217.top/sponsor-guides/runapi.html">使用教程</a>）。
  </p>
</div>

<hr>

<div>
  <a href="https://unity2.ai/register?ref=9NjKJ86j&source=allapihub">
    <img src="resources/partners/unity2ai.jpg" alt="Unity2.ai" width="128" align="left" hspace="10" vspace="4">
  </a>
  <p>
    感谢 Unity2.ai 赞助了本项目！Unity2.ai 是面向个人开发者、团队和企业的高性能 AI 模型 API 中转平台，长期服务国内头部企业，日均承载超 300 亿 token 调用，支持 5000 RPM 级高并发。支持余额计费、首充赠额、组合订阅、企业开票和专属对接。通过<a href="https://unity2.ai/register?ref=9NjKJ86j&source=allapihub">此链接</a>注册可领取 $2 余额，加入官方群再送 $10 余额，最高可领 $12 免费额度。
  </p>
</div>

<hr>

<div>
  <a href="https://sui-xiang.com/">
    <img src="resources/partners/suixiang.jpg" alt="随想AI中转站" width="128" align="left" hspace="10" vspace="4">
  </a>
  <p>
    感谢随想AI中转站对本项目的赞助！随想AI中转站 是一家可靠高效的 API 中继服务提供商，提供 Claude、Codex、Gemini 等的中继服务。注重隐私的中转站无数据倒卖无模型掺水，隐私，透明，极速售后。新账户注册每日签到就送 0.5 元测试额度，充值额度 1:1，无需订阅，按量付费。多线路冗余、跨区域容灾、自动故障切换，长链路 SSE 不中断。99.9% 可用性，关键调用从不掉队。欢迎通过<a href="https://sui-xiang.com/">此链接</a>了解和使用。
  </p>
</div>

<hr>

> [!NOTE]
> 如果你之前使用过 [One API Hub](https://github.com/fxaxg/one-api-hub)，All API Hub 已完成大幅重构，并保留数据兼容能力，支持一键导入原有数据。

<a id="quick-start"></a>
## 🧑‍🚀 30 秒上手指南

1. **安装插件**：从上方商店链接点击安装。
2. **登录站点**：在浏览器里登录你常用的 AI 中转站。
3. **点击识别**：点击插件图标 -> `新增账号` -> 输入网址 -> 点击 `自动识别`。
4. **开始享受**：查看余额、配置自动签到，或者将账号导出到你的 AI 客户端。

👉 **[点击查看：更详细的图文新手教程](https://all-api-hub.qixing1217.top/get-started.html)**

<a id="introduction-tech"></a>
### 🧩 强大的兼容性
不论你用的是哪种架构，我们基本都支持：
- **账号站点兼容架构**：[one-api](https://github.com/songquanpeng/one-api)、[new-api](https://github.com/QuantumNous/new-api)、[Veloera](https://github.com/Veloera/Veloera)、[one-hub](https://github.com/MartialBE/one-hub)、[done-hub](https://github.com/deanxv/done-hub)、[Sub2API](https://github.com/Wei-Shaw/sub2api) 等
- **特色账号平台与兼容实现**：[AIHubMix](https://aihubmix.com/?aff=W3DN)、[AnyRouter](https://anyrouter.top)、Neo-API、Super-API、v-api 等
- **自建管理后台**：[new-api](https://github.com/QuantumNous/new-api)、[Veloera](https://github.com/Veloera/Veloera)、[done-hub](https://github.com/deanxv/done-hub)、[Octopus](https://github.com/bestruirui/octopus)、[AxonHub](https://github.com/looplj/axonhub)、[Claude Code Hub](https://github.com/ding113/claude-code-hub) 等，用于渠道管理、迁移和部分模型同步
- **查看完整列表**：👉 [支持的站点](https://all-api-hub.qixing1217.top/supported-sites.html)

<a id="ui-preview"></a>
## 🖼️ 界面预览

<table>
  <tr>
    <td align="center">
      <img src="docs/docs/static/image/account-manage.png" alt="account-manage" style="width:100%; height:auto;"/>
      <div>账户管理总览</div>
    </td>
    <td align="center">
      <img src="docs/docs/static/image/model-list.png" alt="model-list" style="width:100%; height:auto;"/>
      <div>模型列表与价格</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/docs/static/image/api-key-list.png" alt="api-key-list" style="width:100%; height:auto;"/>
      <div>密钥列表与导出</div>
    </td>
    <td align="center">
      <img src="docs/docs/static/image/auto-check-in.png" alt="auto-check-in" style="width:100%; height:auto;"/>
      <div>账号自动签到</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/docs/static/image/account-model-usage-overview.png" alt="account-model-usage-overview" style="width:100%; height:auto;"/>
      <div>账号模型使用情况</div>
    </td>
    <td align="center">
      <img src="docs/docs/static/image/account-model-latency-overview.png" alt="account-model-latency-overview" style="width:100%; height:auto;"/>
      <div>模型慢查询分析</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/docs/static/image/new-api-channel-sync.png" alt="new-api-channel-sync" style="width:100%; height:auto;"/>
      <div>New API 模型同步</div>
    </td>
    <td align="center">
      <img src="docs/docs/static/image/new-api-channel-manage.png" alt="new-api-channel-manage" style="width:100%; height:auto;"/>
      <div>New API 渠道管理</div>
    </td>
  </tr>
</table>

<a id="development-guide"></a>
## 🛠️ 开发指南

请参阅 [CONTRIBUTING](CONTRIBUTING.md) 以获取更多信息。

<a id="license"></a>
## 📜 许可证与商业授权

All API Hub 基于 GNU Affero General Public License v3.0（AGPL-3.0）开源。

如果你需要 AGPL-3.0 之外的授权条款，例如闭源分发、私有修改、白标再分发，或其他闭源商业集成场景，可以联系项目维护者获取商业授权。

商业授权联系：<street-anime-olive@duck.com>

商业授权仅覆盖 All API Hub 维护者有权授权的代码和资源。第三方依赖以及历史上源自 [One API Hub](https://github.com/fxaxg/one-api-hub) 的 MIT 许可部分，仍需保留对应版权与许可声明，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

<a id="tech-stack"></a>
## 🏗️ 技术栈

- **框架**: [WXT](https://wxt.dev) 负责多浏览器扩展工具链与构建流程
- **UI 层**: [React](https://react.dev) 构建扩展选项页与弹窗界面
- **语言**: [TypeScript](https://www.typescriptlang.org) 提供端到端的类型安全
- **样式**: [Tailwind CSS](https://tailwindcss.com) 以原子化工具类驱动主题样式
- **组件**: [Radix UI](https://www.radix-ui.com/) 提供可访问组件与设计系统基石


<a id="acknowledgements"></a>
## 🙏 致谢

- 感谢 [@AngleNaris](https://github.com/AngleNaris) 设计了项目 Logo 🎨
- 感谢 [Linux.do 社区](https://linux.do) 提供的反馈、测试和传播支持，尤其是 [All-API-Hub 主题帖](https://linux.do/t/topic/2395800) 中持续的讨论与建议
- [WXT](https://wxt.dev) - 现代化的浏览器扩展开发框架

<div align="center">
  <strong>⭐ 如果这个项目对你有帮助，请考虑给它一个星标！</strong>
</div>
