---
home: true
title: "首页"
heroImage: "/512.png"
heroText: "All API Hub - 你的全能 AI 资产管家"
tagline: "开源浏览器插件，统一管理第三方 AI 聚合中转站与自建 New API：自动识别账号、比对模型价格、验证 API/CLI 兼容性、同步模型与渠道，并支持跨平台与加密 WebDAV 备份"
actions:
  - text: "🚀 开始使用"
    link: "./get-started.html"
    type: "primary"

  - text: "Chrome 商店"
    link: "https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo"
    type: "secondary"

  - text: "Edge 商店"
    link: "https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa"
    type: "secondary"

  - text: "FireFox 商店"
    link: "https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}"
    type: "secondary"
    
  - text: "Safari 安装"
    link: "./safari-install.html"
    type: "secondary"

features:
  - title: "📦 资产统一看板"
    details: "把多个站点与账号集中在一个面板里，余额、用量与健康状态一眼看清，支持智能识别地址自动添加。"
  - title: "🏷️ API 凭据库"
    details: "无需账号，直接保存 Base URL + API Key，用于快速复制、验证接口、查看模型与余额/用量。"
  - title: "💰 模型价格比对"
    details: "跨站对比各模型实际折合单价，自动锁定当前最优分组，助你寻找最实惠的调用路径。"
  - title: "✅ 深度接口验证"
    details: "批量测试模型可用性、Token 兼容性及 CLI 代理连通性，轻松排查“站点能通、工具报错”的问题。"
  - title: "📈 用量深度统计"
    details: "按日期、账号、模型多维分析用量与花费，提供热力图、延迟视图与慢请求分析。"
  - title: "📅 自动签到辅助"
    details: "集中识别并处理支持签到的站点，支持定时自动签到、自定义 URL 与充值/兑换页面跳转。"
  - title: "🚀 极速生态集成"
    details: "一键同步到 CherryStudio、CC Switch、Kilo Code 等，或直接将账号推送到自建管理后台。"
  - title: "🛠️ 自建站点联动"
    details: "深度适配 New API、AxonHub、Claude Code Hub 等，实现渠道管理、模型同步与重定向。"
  - title: "🔒 隐私与安全同步"
    details: "默认本地存储，支持加密 WebDAV 自动同步与备份，遇到 Cloudflare 挑战时可自动协助过盾。"

footer: "AGPL-3.0 Licensed | Copyright 2025-present All API Hub"
---

## 介绍

在 AI 时代，为了省钱或体验不同模型，我们往往拥有多个中转站账号。但管理起来却很头疼：余额分散、价格混乱、每天手动签到太累...

**All API Hub 为解决这些问题而生。** 它是你的 AI 资产中心，让管理变得简单、直观且自动化。

## 🎯 你的使用场景

### 👤 我是普通 AI 用户 (新手推荐)
- **我该怎么用？**：[下载并安装扩展](./get-started.md) -> [添加第一个账号](./get-started.md#add-site)
- **我想省钱**：[自动签到获取额度](./auto-checkin.md) -> [跨站模型价格比对](./model-list.md)
- **我想更省事**：[资产变动一眼看清](./balance-history.md) -> [同步账号到其它 AI 工具](./get-started.md#quick-export-sites)

### 🛠️ 我是进阶玩家 (Key 收藏家)
- **密钥管理**：[将独立 URL+Key 保存到 API 凭据库](./api-credential-profiles.md)
- **可用性测试**：[批量验证接口与 CLI 兼容性](./web-ai-api-check.md)
- **跨端同步**：[配置 WebDAV 加密备份](./webdav-sync.md)

### 👑 我是站点管理员 (站长专区)
- **效率工具**：[在插件内直接管理渠道](./self-hosted-site-management.md) -> [批量同步模型](./managed-site-model-sync.md)
- **配置优化**：[设置模型重定向](./model-redirect.md)
- **安全保障**：[处理 2FA / OTP 验证](./new-api-security-verification.md)

## 🧩 支持的系统架构

不论你用的是哪种架构，我们基本都支持：
- **账号站点兼容架构**：One API, New API, Veloera, One-Hub, Done-Hub, Sub2API 等。
- **特色账号平台与兼容实现**：AIHubMix, AnyRouter, Neo-API, Super-API, v-api 等。
- **自建管理后台**：New API, Veloera, Done-Hub, Octopus, AxonHub, Claude Code Hub 等，用于渠道管理、迁移和部分模型同步。

> 如果你在 macOS 上使用 Safari，请先查看 [Safari 安装指南](./safari-install.md)。
> 如果你使用 QQ/360/Brave 等浏览器，请查看 [手动安装指南](./other-browser-install.md)。
> 如果你想了解商店版为什么会晚于 GitHub Release、如何手动检查更新，请查看 [安装渠道与更新说明](./extension-update-install.md)。

<a id="community"></a>
## 💬 社区交流

遇到问题？想分享好用的站点？加入我们的社区：

- [GitHub Discussions](https://github.com/qixing-jk/all-api-hub/discussions)
- [Discord 社区](https://discord.gg/RmFXZ577ZQ)
- [Telegram 群](https://t.me/qixing_chat)
- [QQ 群](https://qm.qq.com/q/ebSCy31Phe)
- **微信群**：扫描下方二维码加入中文群。

<img
  src="../../resources/wechat_group.png"
  alt="All API Hub 微信群二维码"
  style="width: min(280px, 100%);"
/>

<a id="sponsors"></a>
## ❤️ 赞助商

<div class="readme-sponsor readme-sponsor-featured">
  <p class="readme-sponsor-banner">
    <a href="https://dis.chatdesks.cn/chatdesk/hsyqallapihub.html">
      <img src="../../resources/partners/volcengine.png" alt="火山引擎方舟 Coding-Plan">
    </a>
  </p>
  <p class="readme-sponsor-copy">
    <strong>火山引擎方舟 Coding-Plan</strong> 是字节跳动推出的开发者生产力计划。Lite 套餐仅需 <strong>9.9 元/月</strong>，即可使用豆包、DeepSeek、GLM 等主流模型，适配 Cursor、Claude Code、Windsurf 等 IDE 工具，并提供模型自动切换体验。现在通过<a href="https://dis.chatdesks.cn/chatdesk/hsyqallapihub.html">活动链接</a>加入，还可享受好友邀请返利及首单优惠。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://ai.centos.hk">
      <img class="readme-sponsor-logo-small" src="../../resources/partners/xingchen.png" alt="星辰AI">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    感谢星辰AI赞助了本项目！星辰AI是一家稳定、高效的 API 中转服务商，提供 Claude Code、Codex、Gemini 等多种中转服务。充值比例 1:1，可开发票；Claude 低至 4 折。欢迎通过<a href="https://ai.centos.hk">此链接</a>了解和使用（<a href="./sponsor-guides/xingchen.md">使用教程</a>）。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://www.packyapi.com/register?aff=all-api-hub">
      <img src="../../resources/partners/packycode.png" alt="PackyCode">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    感谢 PackyCode 赞助了本项目！PackyCode 是一家稳定、高效的API中转服务商，提供 Claude Code、Codex、Gemini 等多种中转服务。PackyCode
    为本软件的用户提供了特别优惠，使用<a href="https://www.packyapi.com/register?aff=all-api-hub">此链接</a>注册并在充值时填写"all-api-hub"优惠码，首次充值可以享受9折优惠！
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub">
      <img src="../../resources/partners/atlas-cloud-logo-display.svg" alt="Atlas Cloud">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    感谢 Atlas Cloud 赞助了本项目！Atlas Cloud 是全模态 AI 推理平台，开发者只需接入一个 AI API，即可统一访问视频生成、图像生成和 LLM
    API，覆盖 300+ 精选模型。Atlas Cloud 新推出 Coding Plan 优惠，适合需要更高性价比 API 访问的开发者，欢迎通过<a href="https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub">此链接</a>了解。
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://runapi.co/register?aff=cvDm">
      <img class="readme-sponsor-logo-small" src="../../resources/partners/runapi.jpg" alt="RunAPI">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    感谢 RunAPI 赞助了本项目！RunAPI 是高效稳定的 API OpenRouter 平替平台，一个 API Key 即可访问 OpenAI、Claude、Gemini、DeepSeek、Grok 等 150+ 主流模型，低至 1 折，极其稳定，可以无缝兼容 Claude Code、OpenClaw 等工具。RunAPI
    为 All API Hub 的用户提供专属福利：使用<a href="https://runapi.co/register?aff=cvDm">此链接</a>注册并联系 RunAPI 管理员，即可领取 ￥7 的免费额度（<a href="./sponsor-guides/runapi.md">使用教程</a>）。
  </p>
</div>
