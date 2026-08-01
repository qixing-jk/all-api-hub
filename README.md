<h4 align="center">
<a href="./README_CN.md">简体中文</a> | English | <a href="./README_JA.md">日本語</a>
</h4>

<div align="center">

# All API Hub – Your All-in-One AI Asset Manager

**One-stop management for New API-compatible relay accounts: balances, usage, model prices, check-ins, API credentials, in-page testing, and channel/model sync & redirects**

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

**[⚡ Quick Start](https://all-api-hub.qixing1217.top/en/get-started.html) | [🌐 Supported Sites](https://all-api-hub.qixing1217.top/en/supported-sites.html) | [🔌 Integrations](https://all-api-hub.qixing1217.top/en/supported-export-tools.html) | [📜 Changelog](https://all-api-hub.qixing1217.top/en/changelog.html)**

<p align="center">
  <a href="https://linux.do/t/topic/2395800">
    <img alt="Linux.do discussion thread" src="https://img.shields.io/badge/Discussion-Linux.do-faa511?logo=linux&logoColor=white" />
  </a>
  <a href="./resources/wechat_group.png">
    <img alt="WeChat Chinese group" src="https://img.shields.io/badge/WeChat-Chinese%20Group-green?logo=wechat&logoColor=white" />
  </a>
  <a href="https://qm.qq.com/q/ebSCy31Phe">
    <img alt="QQ Chinese group" src="https://img.shields.io/badge/QQ-Chinese%20Group-12B7F5?logo=qq&logoColor=white" />
  </a>
  <a href="https://discord.gg/RmFXZ577ZQ">
    <img alt="Discord multilingual community" src="https://img.shields.io/badge/Discord-Multilingual%20Community-5865F2?logo=discord&logoColor=white">
  </a>
  <a href="https://t.me/qixing_chat">
    <img alt="Telegram multilingual group" src="https://img.shields.io/badge/Telegram-Multilingual%20Group-blue?logo=telegram&logoColor=white">
  </a>
</p>

</div>

<a id="introduction"></a>
## ❓ Why All API Hub?

**In simple terms**: AI relay sites are like a marketplace for AI credits, giving you low-cost or even free access to models such as ChatGPT, Claude, and GPT Image.

But once you have multiple accounts, management quickly becomes painful:

- 📂 **Scattered assets**: Balances and usage are spread across separate sites.
- 💲 **Messy pricing**: Different billing ratios make the best deal hard to spot.
- ✅ **Missed daily perks**: Manual daily check-ins are easy to forget.
- 🔌 **Annoying setup work**: API details must be copied into tools such as cc-switch and Cherry Studio again and again.

**All API Hub is your AI asset manager**: add your site URLs and let the extension handle the rest.

<a id="features"></a>
## ✨ What Can It Do for You?

### 📊 All Your AI Assets in One View
- **Unified Relay Account Dashboard**: Manage multiple AI relay accounts in one place and review balances, usage, and account status without signing in to each site.
- **API Credential Library**: No site account required—bring Base URLs and API Keys shared by others or collected over time together, then check balances, view models, test connections, or export whenever needed.
- **Usage & Trend Analytics**: Track balance changes and view charts by site, account, and model to understand where your credits go.

### 💰 Price Comparison & Auto Check-In
- **Cross-Site Model Price Comparison**: Compare the effective price of the same model across sites and quickly find a better-value endpoint.
- **Multi-Site Auto Check-In**: Check in to supported sites with one click or on a schedule, collect rewards automatically, and skip daily logins.

### 🚀 Quick Capture & Client Integration
- **Quick Web Capture**: Find Base URLs and API Keys on a page, test them immediately, and save them to your credential library with less copying and tab switching.
- **One-Click Client Export**: Send credentials to CherryStudio, CC Switch, CLIProxyAPI, Claude Code Router, Kilo Code, and other [supported tools](https://all-api-hub.qixing1217.top/en/supported-export-tools.html).

### 🧪 API Verification & Troubleshooting
- **API & Model Verification**: Check API connectivity and model availability in one click to see whether a Key works and a model can be called.
- **CLI Integration Testing**: Confirm that common command-line tools can use the target API before you spend time troubleshooting a full setup.

### 🔔 Announcements & Task Alerts
- **Announcements in One Place**: Automatically collect and display announcements from added sites in one place, with timely alerts for maintenance, model, pricing, and other updates—no need to check sites one by one.
- **Task Result Alerts**: After automated check-ins, WebDAV auto-sync, or model sync completes, receive the result through your browser or a configured notification method so failures and exceptions can be handled promptly.

### 🛠️ Self-Hosted AI Gateway Management
- **Manage Popular AI Gateways in One Place**: Manage channels for New API, AxonHub, Claude Code Hub, Octopus, Veloera, and DoneHub directly in the extension without opening each admin panel.
- **Quickly Create Gateway Channels**: Turn saved site accounts or credentials from the API Credential Library into self-hosted AI gateway channels, then call models through the gateway and switch between channels as needed.
- **Model Sync & Redirects**: Sync channel model lists manually or automatically on a schedule as upstream models change, and define custom redirects so clients can use the model names they prefer.

### 🔐 Data Security & Cloud Sync
- **Local-First Storage**: API Keys, accounts, and settings stay in your browser by default and are written to WebDAV only when you enable backup or sync.
- **Encrypted WebDAV Auto-Sync**: Enable encryption and scheduled auto-sync to keep data safely synchronized across devices and pick up where you left off after switching computers.

<a id="installation"></a>
## 🚀 Quick Installation

> [!IMPORTANT]
> **For most users, the store build is recommended.** It is easy to install and supports automatic updates.

| Channel | Install Link | Current Version | Users |
|------|----------|----------|-------|
| Chrome Web Store | [Chrome Web Store](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/lapnciffpekdengooeolaienkeoilfeo?label=Chrome%20Users)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| Edge Add-ons | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge Add-ons Users](https://img.shields.io/badge/dynamic/json?label=Edge%20Users&query=$.activeInstallCount&url=https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/pcokpjaffghgipcgjhapgdpeddlhblaa)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| Firefox Add-ons | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Mozilla Add-on Users](https://img.shields.io/amo/users/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox%20Users)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |

<details>
<summary>📦 Need manual installation or Nightly builds? (Click to expand)</summary>

| Channel | Download Link | Best For |
|------|----------|----------|
| GitHub Stable | [Download Stable](https://github.com/qixing-jk/all-api-hub/releases/latest) | When you cannot install the store build or need to temporarily install a published fix manually |
| Nightly pre-release | [Download Nightly](https://github.com/qixing-jk/all-api-hub/releases/tag/nightly) | When you want early access and are willing to help test; it may be less stable than the store build |

GitHub Stable and Nightly are manual installation channels and do not auto-update. Star / Watch the repository to receive new version notifications. See the [installation and update guide](https://all-api-hub.qixing1217.top/en/extension-update-install.html) for more details.

**Other environments:**
- **Mobile browsers**: Supports mobile Edge, Firefox for Android, Kiwi, and more. See the [mobile browser guide](https://all-api-hub.qixing1217.top/en/faq.html#mobile-browser-support).
- **QQ Browser / 360 Browser / similar**: See the [manual loading guide](https://all-api-hub.qixing1217.top/en/other-browser-install.html).
- **Safari (Mac)**: Requires Xcode for compilation. See the [Safari installation guide](https://all-api-hub.qixing1217.top/en/safari-install.html).

</details>

<a id="sponsors"></a>
## ❤️ Sponsors

> [Want to appear here?](mailto:street-anime-olive@duck.com)

<div>
  <p>
    <a href="https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=all-api-hub&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=all-api-hub">
      <img src="resources/partners/volcengine_en.jpg" alt="Dola Seed on BytePlus ModelArk" width="100%">
    </a>
  </p>
  <p>
    Thanks to Dola Seed for sponsoring this project! Dola Seed 2.0 is a full-modal general large model independently developed by ByteDance for the global market. Built on a unified multimodal architecture, it supports joint understanding and generation of text, images, audio, and video. It natively enables agent collaboration, with strong reasoning, long-task execution, tool integration, and coding capabilities. It is widely applicable to smart cockpits, personal assistants, education, customer support, marketing, retail, and other scenarios. It excels in multimodal perception, end-to-end complex task delivery, stable interaction, and data security, and is readily accessible and deployable via the ModelArk platform. Register via <a href="https://www.byteplus.com/en/product/modelark?utm_campaign=hw&utm_content=all-api-hub&utm_medium=devrel_tool_web&utm_source=OWO&utm_term=all-api-hub">this link</a> to get 500,000 tokens of free inference quota per model.<a href="https://dis.chatdesks.cn/chatdesk/hsyqallapihub.html"> >>中国大陆地区的开发者请点击这里</a>
  </p>
</div>

<hr>

<div>
  <a href="https://s.qiniu.com/qE3eai">
    <img src="resources/partners/qiniu.png" alt="Qiniu Cloud AI" width="180" align="left" hspace="10" vspace="4">
  </a>
  <p>
    Thanks to Qiniu Cloud AI for sponsoring this project! Qiniu Cloud AI is Qiniu Cloud's enterprise MaaS platform, offering one-stop access to 150+ mainstream models worldwide with compatibility across major provider protocols and full-modal capabilities for text, image, audio, video, and file processing.
    Enterprise users can claim 12 million free tokens via <a href="https://s.qiniu.com/qE3eai">this link</a>, with referral rewards up to tens of billions of tokens.
  </p>
</div>

<hr>

<div>
  <a href="https://api.fenno.ai/register?redirect=/purchase?tab=subscription%26group=16&aff=VS3FMCGW4XK4">
    <img src="resources/partners/fennoai.jpg" alt="Fenno.ai" width="180" align="left" hspace="10" vspace="4">
  </a>
  <p>
    Thanks to Fenno.ai for sponsoring this project! Fenno.ai is a stable and efficient API relay provider focused on Codex relay service, compatible with OpenAI and Anthropic protocols and flexible enough for Codex, Claude Code, OpenCode, and other coding tools.
    All API Hub users can subscribe to the 9.9 RMB / $150-equivalent Coding Plan through <a href="https://api.fenno.ai/register?redirect=/purchase?tab=subscription%26group=16&aff=VS3FMCGW4XK4">this link</a>, and referrals can earn up to 20% rewards.
  </p>
</div>

<hr>

<div>
  <a href="https://www.packyapi.com/register?aff=all-api-hub">
    <img src="resources/partners/packycode.png" alt="PackyCode" width="128" align="left" hspace="10" vspace="4">
  </a>
  <p>
    Thanks to PackyCode for sponsoring this project! PackyCode is a reliable and efficient API relay service provider, offering relay services for Claude Code, Codex,
    Gemini, and more. PackyCode provides special discounts for our software users: register using
    <a href="https://www.packyapi.com/register?aff=all-api-hub">this link</a> and enter the "all-api-hub" promo code during first recharge to get 10% off (<a href="https://all-api-hub.qixing1217.top/en/sponsor-guides/packycode.html">setup guide</a>).
  </p>
</div>

<hr>

<div>
  <a href="https://ai.centos.hk">
    <img src="resources/partners/xingchen.png" alt="Xingchen AI" width="64" align="left" hspace="10" vspace="4">
  </a>
  <p>
    Thanks to Xingchen AI for sponsoring this project! Xingchen AI is a stable and efficient API relay service provider, offering relay services for Claude Code, Codex,
    Gemini, and more. It offers a 1:1 recharge ratio with invoice support and Claude from 40% pricing. Learn more using
    <a href="https://ai.centos.hk">this link</a> (<a href="https://all-api-hub.qixing1217.top/en/sponsor-guides/xingchen.html">setup guide</a>).
  </p>
</div>

<hr>

<div>
  <a href="https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub">
    <img src="resources/partners/atlas-cloud-logo-display.svg" alt="Atlas Cloud" width="128" align="left" hspace="10" vspace="4">
  </a>
  <p>
    Thanks to Atlas Cloud for sponsoring this project! Atlas Cloud is a full-modal AI inference platform that gives developers one API for video generation, image
    generation, and LLM access across 300+ curated models. Check out Atlas Cloud's new coding plan promotion for more budget-friendly API access:
    <a href="https://www.atlascloud.ai/console/coding-plan?utm_source=github&utm_medium=link&utm_campaign=all-api-hub">this link</a>.
  </p>
</div>

<hr>

<div>
  <a href="https://www.aicodemirror.com/register?invitecode=7IQNR8">
    <img src="resources/partners/aicodemirror.png" alt="AICodeMirror" width="128" align="left" hspace="10" vspace="4">
  </a>
  <p>
    Thanks to AICodeMirror for sponsoring this project! AICodeMirror provides official high-stability relay services for Claude Code / Codex / Gemini CLI, with
    enterprise-grade concurrency, fast invoicing, and 24/7 dedicated technical support. Claude Code / Codex / Gemini official channels are available from 38% / 2% /
    9% of the original price, with extra discounts on top-ups. AICodeMirror offers special benefits for All API Hub users: register via
    <a href="https://www.aicodemirror.com/register?invitecode=7IQNR8">this link</a> to enjoy 20% off your first top-up, and enterprise customers can get up to 25% off.
  </p>
</div>

<hr>

<div>
  <a href="https://runapi.co/register?aff=cvDm">
    <img src="resources/partners/runapi.jpg" alt="RunAPI" width="64" align="left" hspace="10" vspace="4">
  </a>
  <p>
    Thanks to RunAPI for sponsoring this project! RunAPI is a stable OpenRouter alternative API platform: one API key gives access to 150+ mainstream models including
    OpenAI, Claude, Gemini, DeepSeek, and Grok, from 10% of standard pricing, with Claude Code and OpenClaw compatibility. RunAPI offers All API Hub users an exclusive
    benefit: register using <a href="https://runapi.co/register?aff=cvDm">this link</a> and contact the administrator to claim ¥7 in free credits (<a href="https://all-api-hub.qixing1217.top/en/sponsor-guides/runapi.html">setup guide</a>).
  </p>
</div>

<hr>

<div>
  <a href="https://unity2.ai/register?ref=9NjKJ86j&source=allapihub">
    <img src="resources/partners/unity2ai.jpg" alt="Unity2.ai" width="128" align="left" hspace="10" vspace="4">
  </a>
  <p>
    Thanks to Unity2.ai for sponsoring this project! Unity2.ai is a high-performance AI model API relay platform for individual developers, teams, and enterprises. It has long served leading enterprise customers in China, handles more than 30 billion tokens per day, and supports 5,000 RPM-level high concurrency. It supports balance billing, first top-up bonuses, bundled subscriptions, enterprise invoicing, and dedicated onboarding. Register via
    <a href="https://unity2.ai/register?ref=9NjKJ86j&source=allapihub">this link</a> to receive $2 in balance, then join the official group for another $10, up to $12 in free credits.
  </p>
</div>

<hr>

<div>
  <a href="https://sui-xiang.com/">
    <img src="resources/partners/suixiang.jpg" alt="Suixiang AI Relay" width="128" align="left" hspace="10" vspace="4">
  </a>
  <p>
    Thanks to Suixiang AI Relay for sponsoring this project! Suixiang AI Relay is a reliable and efficient API relay service provider for Claude, Codex, Gemini, and more. It focuses on privacy, transparency, fast support, no data resale, and no model dilution. New accounts can receive ¥0.5 in daily check-in test credits, with 1:1 top-ups, pay-as-you-go billing, redundant routes, cross-region disaster recovery, automatic failover, uninterrupted long-lived SSE streams, and 99.9% availability. Learn more through
    <a href="https://sui-xiang.com/">this link</a>.
  </p>
</div>

<hr>

<div>
  <a href="https://infistar.ai/register?aff=ALLAPIHUB&ref_source=link">
    <img src="resources/partners/infistar.png" alt="Infistar" width="180" align="left" hspace="10" vspace="4">
  </a>
  <p>
    Worried about diluted models, degraded intelligence, or opaque pricing? Every model offered by Infistar.ai is verified through real API calls. Its supply comes from official APIs and official account pools, with load balancing across more than 10,000 supply routes to keep latency low and performance stable during peak demand. It supports leading models from China and around the world, including ChatGPT, Claude, Gemini, Grok, GLM, DeepSeek, Kimi, Qwen, and MiniMax, with full-modal capabilities spanning text, video, images, embeddings, and reranking. Pricing and usage are transparent and easy to check, with models available from 10% of official prices. All API Hub users can register and try the service through the <a href="https://infistar.ai/register?aff=ALLAPIHUB&ref_source=link">exclusive link</a>.
  </p>
</div>

<hr>


> [!NOTE]
> If you previously used [One API Hub](https://github.com/fxaxg/one-api-hub), All API Hub has been heavily refactored while preserving data compatibility, so you can import your existing data with one click.

<a id="quick-start"></a>
## 🧑‍🚀 30-Second Quick Start

1. **Install the extension**: Use one of the store links above.
2. **Sign in to your site**: Open your usual AI relay site in the browser and log in.
3. **Run auto detection**: Click the extension icon -> `Add Account` -> enter the site URL -> click `Auto Detect`.
4. **Start using it**: Check balances, configure auto check-in, or export the account to your AI client.

👉 **[Click here for the full illustrated beginner guide](https://all-api-hub.qixing1217.top/en/get-started.html)**

<a id="introduction-tech"></a>
### 🧩 Strong Compatibility
No matter which architecture you use, there is a good chance we support it:
- **Account-site compatible architectures**: [new-api](https://github.com/QuantumNous/new-api), [one-api](https://github.com/songquanpeng/one-api), [Sub2API](https://github.com/Wei-Shaw/sub2api), [one-hub](https://github.com/MartialBE/one-hub), [Veloera](https://github.com/Veloera/Veloera), [done-hub](https://github.com/deanxv/done-hub), and more
- **Specialized account platforms and compatible implementations**: [AnyRouter](https://anyrouter.top), [AIHubMix](https://aihubmix.com/?aff=W3DN), Super-API, v-api, Neo-API, and more
- **Self-hosted admin backends**: [new-api](https://github.com/QuantumNous/new-api), [AxonHub](https://github.com/looplj/axonhub), [Claude Code Hub](https://github.com/ding113/claude-code-hub), [Octopus](https://github.com/bestruirui/octopus), [Veloera](https://github.com/Veloera/Veloera), [done-hub](https://github.com/deanxv/done-hub), and more, for channel management, migration, and partial model sync
- **Full list**: 👉 [Supported Sites](https://all-api-hub.qixing1217.top/en/supported-sites.html)

<a id="ui-preview"></a>
## 🖼️ UI Preview

<table>
  <tr>
    <td align="center">
      <img src="docs/docs/static/image/en/account-manage.png" alt="account-manage" style="width:100%; height:auto;"/>
      <div>Account Management Overview</div>
    </td>
    <td align="center">
      <img src="docs/docs/static/image/en/model-list.png" alt="model-list" style="width:100%; height:auto;"/>
      <div>Model List & Pricing</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/docs/static/image/en/api-key-list.png" alt="api-key-list" style="width:100%; height:auto;"/>
      <div>Key List & Export</div>
    </td>
    <td align="center">
      <img src="docs/docs/static/image/en/auto-check-in.png" alt="auto-check-in" style="width:100%; height:auto;"/>
      <div>Auto Check-in</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/docs/static/image/en/account-model-usage-overview.png" alt="account-model-usage-overview" style="width:100%; height:auto;"/>
      <div>Account Model Usage Overview</div>
    </td>
    <td align="center">
      <img src="docs/docs/static/image/en/account-model-latency-overview.png" alt="account-model-latency-overview" style="width:100%; height:auto;"/>
      <div>Account Model Latency Overview</div>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/docs/static/image/en/new-api-channel-sync.png" alt="new-api-channel-sync" style="width:100%; height:auto;"/>
      <div>New API Model Sync</div>
    </td>
    <td align="center">
      <img src="docs/docs/static/image/en/new-api-channel-manage.png" alt="new-api-channel-manage" style="width:100%; height:auto;"/>
      <div>New API Channel Management</div>
    </td>
  </tr>
</table>

<a id="development-guide"></a>
## 🛠️ Development Guide

Please refer to the [CONTRIBUTING](CONTRIBUTING.md) for more information.

<a id="license"></a>
## 📜 License and Commercial Licensing

All API Hub is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

Commercial licenses are available for organizations or individuals who need terms not provided by AGPL-3.0, including proprietary distribution, closed-source modifications, white-label redistribution, or other private commercial integration use cases.

For commercial licensing, contact: <street-anime-olive@duck.com>

Commercial licenses apply only to code and assets for which the All API Hub maintainers have the right to grant commercial terms. Third-party dependencies and historical MIT-licensed portions derived from [One API Hub](https://github.com/fxaxg/one-api-hub) remain subject to their own copyright and license notices. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

<a id="tech-stack"></a>
## 🏗️ Tech Stack

- **Framework**: [WXT](https://wxt.dev) powers the multi-browser extension tooling and build pipeline
- **UI Layer**: [React](https://react.dev) drives the options UI and popup experiences
- **Language**: [TypeScript](https://www.typescriptlang.org) keeps the entire codebase type-safe
- **Styling**: [Tailwind CSS](https://tailwindcss.com) supplies utility-first theming primitives
- **Components**: [Radix UI](https://www.radix-ui.com/) provides accessible primitives for our design system

<a id="acknowledgements"></a>
## 🙏 Acknowledgements

- Thanks to [@AngleNaris](https://github.com/AngleNaris) for designing the project logo 🎨
- Thanks to the [Linux.do community](https://linux.do) for feedback, testing, and visibility support, especially the continued discussion and suggestions in the [All API Hub thread on Linux.do](https://linux.do/t/topic/2395800)
- [WXT](https://wxt.dev) - The modern browser extension development framework

<div align="center">
  <strong>⭐ If you find this project helpful, please consider giving it a star!</strong>
</div>
