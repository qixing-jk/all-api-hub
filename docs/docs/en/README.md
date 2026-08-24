---
home: true
title: "Homepage"
heroImage: "/512.png"
heroText: "All API Hub - Your All-in-One AI Asset Manager"
tagline: "Open-source browser extension to unify the management of third-party AI aggregation relays and self-built New APIs: automatically identify accounts, compare model prices, verify API/CLI compatibility, synchronize models and channels, and support cross-platform and encrypted WebDAV backups."
actions:
  - text: "Get Started"
    link: "./get-started.html"
    type: "primary"

  - text: "Chrome Store"
    link: "https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo"
    type: "secondary"

  - text: "Edge Store"
    link: "https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa"
    type: "secondary"

  - text: "FireFox Store"
    link: "https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}"
    type: "secondary"
    
  - text: "Safari Install"
    link: "./safari-install.html"
    type: "secondary"

features:
  - title: "📊 Multi-Site Asset Dashboard"
    details: "See balances, usage, trends, and account status across multiple AI relay sites on one screen instead of managing them separately."
  - title: "🔑 API Credential Library"
    details: "No site account required—keep Base URLs and API Keys shared by others or collected over time in one place, ready for lookups, testing, or export."
  - title: "💰 Cross-Site Model Price Comparison"
    details: "Calculate effective model prices across sites and quickly find better-value models and groups."
  - title: "✅ Multi-Site Auto Check-In"
    details: "Run daily check-ins for supported accounts with one click or on a schedule, collect rewards automatically, and skip daily logins."
  - title: "🧪 API, Model & CLI Verification"
    details: "Test API connectivity, model availability, and CLI integration in one click to quickly troubleshoot configuration issues."
  - title: "🔔 Announcements & Task Alerts"
    details: "See announcements from added sites in one place and receive timely maintenance, model, and pricing updates, plus results from scheduled background auto check-ins, WebDAV auto-sync, and model sync."
  - title: "🚀 Web Capture & One-Click Export"
    details: "Quickly find Base URLs or API Keys on web pages and export them to popular AI clients with one click."
  - title: "🛠️ Popular AI Gateway Support"
    details: "Manage New API, Sub2API, AxonHub, Claude Code Hub, Octopus, Veloera, and DoneHub in one place; quickly add site configurations from saved accounts or API credentials, with support for model sync and redirects."
  - title: "🔐 Local-First Storage & Auto-Sync"
    details: "Data stays in your browser by default; enable encrypted WebDAV auto-sync to keep it safely synchronized across devices and continue where you left off after switching computers."

footer: "AGPL-3.0 Licensed | Copyright 2025-present All API Hub"
---

## Introduction

In the AI era, many of us keep multiple relay-site accounts to save money or try different models. Managing them quickly becomes painful: balances are scattered, pricing is messy, and daily manual check-ins are easy to miss.

**All API Hub is built to solve those problems.** It is your AI asset center, making management simpler, clearer, and more automated.

## 🎯 Use Cases

### 👤 I am a regular AI user (recommended for beginners)

- **How do I start?**: [Download and install the extension](./get-started.md) -> [Add my first account](./get-started.md#add-site)
- **I want to save money**: [Earn credits with auto check-in](./auto-checkin.md) -> [Compare model prices across sites](./model-list.md)
- **I want less manual work**: [See asset changes at a glance](./balance-history.md) -> [Sync accounts to other AI tools](./get-started.md#quick-export-sites) -> [Receive background task notifications](./task-notifications.md)

### 🛠️ I am an advanced user (Key collector)

- **Key management**: [Save standalone URL+Key pairs to the API Credential Library](./api-credential-profiles.md)
- **Availability testing**: [Batch verify API and CLI compatibility](./web-ai-api-check.md)
- **Cross-device sync**: [Configure encrypted WebDAV backup](./webdav-sync.md)

### 👑 I am a site admin (operator area)

- **Efficiency tools**: [Manage channels inside the extension](./self-hosted-site-management.md) -> [Batch sync models](./managed-site-model-sync.md)
- **Configuration optimization**: [Set up model redirection](./model-redirect.md)
- **Security safeguards**: [Handle 2FA / OTP verification](./new-api-security-verification.md)

## 🧩 Supported Site Architectures

No matter which architecture you use, there is a good chance we support it:

- **Account-site compatible architectures**: New API, One API, Sub2API, One-Hub, Veloera, Done-Hub, and more.
- **Specialized account platforms and compatible implementations**: [OpenRouter](https://openrouter.ai/), [AnyRouter](https://anyrouter.top/register?aff=tDKX), [AgentRouter](https://agentrouter.org/register?aff=TUX6), [AIHubMix](https://aihubmix.com/?aff=W3DN), Super-API, v-api, Neo-API, and more.
- **Self-hosted admin backends**: New API, Sub2API, AxonHub, Claude Code Hub, [Octopus](https://github.com/bestruirui/octopus), Veloera, Done-Hub, and more, for backend management, migration, and partial model sync.

> If you use Safari on macOS, read the [Safari Installation Guide](./safari-install.md) first.
> If you use QQ Browser, 360 Browser, Brave, Vivaldi, Opera, or similar browsers, read the [Other Browser Installation Guide](./other-browser-install.md).
> To learn why the store version may be behind GitHub Releases, or how to check updates manually, read [Installation Channels and Updates](./extension-update-install.md).

<a id="community"></a>
## 💬 Community

Have questions or want to share useful sites? Join the community:

- [GitHub Discussions](https://github.com/qixing-jk/all-api-hub/discussions)
- [Discord Community](https://discord.gg/RmFXZ577ZQ)
- [Telegram Group](https://t.me/qixing_chat)
- [QQ Group](https://qm.qq.com/q/ebSCy31Phe)
- **WeChat Group**: Scan the QR code below to join the Chinese group.

<img
  src="../../../resources/wechat_group.png"
  alt="All API Hub WeChat Group QR Code"
  style="width: min(280px, 100%);"
/>

<a id="sponsors"></a>
## ❤️ Sponsors

Thank you to all our sponsors for supporting the project's long-term feature development and maintenance. We are also grateful to every user, contributor, and community member for using, testing, sharing, and improving All API Hub.

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://s.qiniu.com/qE3eai">
      <img src="../../../resources/partners/qiniu.png" alt="Qiniu Cloud AI">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    Qiniu Cloud AI is Qiniu Cloud's enterprise MaaS platform, offering one-stop access to 150+ mainstream models worldwide with compatibility across major provider protocols and full-modal capabilities for text, image, audio, video, and file processing. Enterprise users can claim 12 million free tokens via <a href="https://s.qiniu.com/qE3eai">this link</a>, with referral rewards up to tens of billions of tokens.
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://api.fenno.ai/s/DCGC">
      <img src="../../../resources/partners/fennoai.jpg" alt="FennoAI">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    FennoAI is a stable and efficient API relay provider focused on Codex relay services. It supports the OpenAI and Anthropic protocols, integrates flexibly with popular coding tools such as Codex, Claude Code, and OpenCode, and reliably handles enterprise demand at the scale of 100 billion tokens per day. It also supports business-to-business settlement and invoicing for entities in China and overseas. FennoAI offers an exclusive benefit for All API Hub users: subscribe through <a href="https://api.fenno.ai/s/DCGC">the dedicated link</a> for just $1.99 to receive $50 in Coding Plan credits. Its referral program offers up to 20% commission on friends' purchases, with higher rewards as you invite more people (<a href="./service-guides/fenno.md">setup guide</a>).
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://www.packyapi.com/register?aff=all-api-hub">
      <img src="../../../resources/partners/packycode.png" alt="PackyCode">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    PackyCode is a reliable and efficient API relay service provider, offering relay services for Claude Code, Codex,
    Gemini, and more. PackyCode provides special discounts for our software users: register using
    <a href="https://www.packyapi.com/register?aff=all-api-hub">this link</a> and enter the "all-api-hub" promo code during first recharge to get 10% off (<a href="./sponsor-guides/packycode.md">setup guide</a>).
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://ai.centos.hk">
      <img class="readme-sponsor-logo-small" src="../../../resources/partners/xingchen.png" alt="Xingchen AI">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    Xingchen AI is a stable and efficient API relay provider offering services for Claude Code, Codex, Gemini, and more. It supports 1:1 top-ups, provides invoices, and offers Claude at as low as 40% of the standard price. You can learn more and start using it through <a href="https://ai.centos.hk">this link</a> (<a href="./sponsor-guides/xingchen.md">setup guide</a>).
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://www.xuanshuapi.com/register?aff=ALL-API-HUB&promo=ALL-API-HUB">
      <img src="../../../resources/partners/xuanshu-api.png" alt="XuanShu API">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    XuanShu API is a next-generation AI model routing gateway for enterprises, technical teams, and individual developers. It provides one-stop API access to leading global models including Claude, GPT, and Grok with enterprise-grade reliability. Model pricing ranges from 10% to 60% of standard rates. Register through <a href="https://www.xuanshuapi.com/register?aff=ALL-API-HUB&promo=ALL-API-HUB">this link</a> to receive extra top-up bonuses, with more for your first top-up. Business customers can pay by corporate bank transfer and request invoices (<a href="./service-guides/xuanshuapi.md">setup guide</a>).
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub">
      <img src="../../../resources/partners/atlas-cloud-logo-display.svg" alt="Atlas Cloud">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    Atlas Cloud is a full-modal AI inference platform that gives developers one API for video generation, image
    generation, and LLM access across 300+ curated models. Check out Atlas Cloud's new coding plan promotion for more budget-friendly API access:
    <a href="https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub">this link</a> (<a href="./service-guides/atlascloud.md">setup guide</a>).
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://www.aicodemirror.ai/register?invitecode=7IQNR8">
      <img src="../../../resources/partners/aicodemirror.png" alt="AICodeMirror">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    AICodeMirror provides official high-stability relay services for Claude Code / Codex / Gemini CLI, with enterprise-grade concurrency, fast invoicing, and 24/7 dedicated technical support. Claude Code / Codex / Gemini official channels are available from 38% / 2% / 9% of the original price, with extra discounts on top-ups. AICodeMirror offers special benefits for All API Hub users: register via <a href="https://www.aicodemirror.ai/register?invitecode=7IQNR8">this link</a> to enjoy 20% off your first top-up, and enterprise customers can get up to 25% off.
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://sui-xiang.com/">
      <img src="../../../resources/partners/suixiang.jpg" alt="Suixiang AI Relay">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    Suixiang AI Relay is a reliable and efficient API relay service provider for Claude, Codex, Gemini, and more. It focuses on privacy, transparency, fast support, no data resale, and no model dilution. New accounts can receive ¥0.5 in daily check-in test credits, with 1:1 top-ups, pay-as-you-go billing, redundant routes, cross-region disaster recovery, automatic failover, uninterrupted long-lived SSE streams, and 99.9% availability. Learn more through <a href="https://sui-xiang.com/">this link</a> (<a href="./service-guides/suixiang.md">setup guide</a>).
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://infistar.ai/register?aff=ALLAPIHUB&ref_source=link">
      <img src="../../../resources/partners/infistar.png" alt="Infistar.ai">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    Concerned about diluted models, reduced model intelligence, or opaque pricing? Every model offered by Infistar.ai is verified through real API calls. Supply comes from official APIs and official account pools, with load balancing across more than 10,000 supply routes to ensure low latency and peak-hour stability. It covers mainstream models including ChatGPT, Claude, Gemini, Grok, GLM, DeepSeek, Kimi, Qwen, and MiniMax, with full-modal capabilities spanning text, video, images, embeddings, reranking, and more. Pricing and usage are transparent and easy to review, with models available from 10% of official prices. All API Hub users can register and try it through <a href="https://infistar.ai/register?aff=ALLAPIHUB&ref_source=link">the dedicated link</a> (<a href="./service-guides/infistar.md">setup guide</a>).
  </p>
</div>

<hr class="readme-sponsor-divider">

<div class="readme-sponsor readme-sponsor-featured">
  <p class="readme-sponsor-banner">
    <a href="https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=all-api-hub&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=all-api-hub">
      <img src="../../../resources/partners/volcengine_en.jpg" alt="Dola Seed on BytePlus ModelArk">
    </a>
  </p>
  <p class="readme-sponsor-copy">
    Dola Seed 2.0 is a full-modal general large model independently developed by ByteDance for the global market. Built on a unified multimodal architecture, it supports joint understanding and generation of text, images, audio, and video. It natively enables agent collaboration, with strong reasoning, long-task execution, tool integration, and coding capabilities. It is widely applicable to smart cockpits, personal assistants, education, customer support, marketing, retail, and other scenarios. It excels in multimodal perception, end-to-end complex task delivery, stable interaction, and data security, and is readily accessible and deployable via the ModelArk platform. Register via <a href="https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=all-api-hub&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=all-api-hub">this link</a> to get 500,000 tokens of free inference quota per model.<a href="https://dis.chatdesks.cn/chatdesk/hsyqallapihub.html"> >>中国大陆地区的开发者请点击这里</a>
  </p>
</div>

<hr class="readme-sponsor-divider">
