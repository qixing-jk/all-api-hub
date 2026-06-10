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
  - title: "📦 Unified Asset Dashboard"
    details: "Consolidate multiple sites and accounts into a single panel for a clear overview of balances, usage, and health status, with smart site identification."
  - title: "🏷️ API Credential Library"
    details: "Save Base URL + API Key without a site account for quick copying, API verification, model lookup, and balance/usage checks."
  - title: "💰 Model Price Comparison"
    details: "Compare actual costs across different sites, automatically identify the best group, and find the most cost-effective path."
  - title: "✅ In-depth API Validation"
    details: "Batch test model availability, Token compatibility, and CLI proxy connectivity to troubleshoot integration issues."
  - title: "📈 Detailed Usage Analytics"
    details: "Analyze usage and costs by date, account, and model. Includes heatmaps, latency views, and slow request analysis."
  - title: "📅 Auto Check-in Assistant"
    details: "Centrally manage check-ins for supported sites. Includes automatic scheduled check-ins and custom URL jumps."
  - title: "🚀 Fast Ecosystem Integration"
    details: "Instant sync to CherryStudio, CC Switch, Kilo Code, or push accounts directly to your self-hosted management backend."
  - title: "🛠️ Self-hosted Site Linkage"
    details: "Deeply adapted for New API, AxonHub, Claude Code Hub, and more, enabling channel management and model sync."
  - title: "🔒 Privacy & Secure Sync"
    details: "Local-first storage with encrypted WebDAV sync. Includes a Cloudflare assistant to handle bot challenges automatically."

footer: "AGPL-3.0 Licensed | Copyright 2025-present All API Hub"
---

## Introduction

In the AI era, many of us keep multiple relay-site accounts to save money or try different models. Managing them quickly becomes painful: balances are scattered, pricing is messy, and daily manual check-ins are easy to miss.

**All API Hub is built to solve those problems.** It is your AI asset center, making management simpler, clearer, and more automated.

## 🎯 Use Cases

### 👤 I am a regular AI user (recommended for beginners)

- **How do I start?**: [Download and install the extension](./get-started.md) -> [Add my first account](./get-started.md#add-site)
- **I want to save money**: [Earn credits with auto check-in](./auto-checkin.md) -> [Compare model prices across sites](./model-list.md)
- **I want less manual work**: [See asset changes at a glance](./balance-history.md) -> [Sync accounts to other AI tools](./get-started.md#quick-export-sites)

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

- **Account-site compatible architectures**: One API, New API, Veloera, One-Hub, Done-Hub, Sub2API, and more.
- **Specialized account platforms and compatible implementations**: AIHubMix, AnyRouter, Neo-API, Super-API, v-api, and more.
- **Self-hosted admin backends**: New API, Veloera, Done-Hub, [Octopus](https://github.com/bestruirui/octopus), AxonHub, Claude Code Hub, and more, for channel management, migration, and partial model sync.

> If you use Safari on macOS, read the [Safari Installation Guide](./safari-install.md) first.
> If you use QQ Browser, 360 Browser, Brave, or similar browsers, read the [Manual Installation Guide](./other-browser-install.md).

<a id="community"></a>
## 💬 Community

Have questions or want to share useful sites? Join the community:

- [GitHub Discussions](https://github.com/qixing-jk/all-api-hub/discussions)
- [Discord Community](https://discord.gg/RmFXZ577ZQ)
- [Telegram Group](https://t.me/qixing_chat)
- **WeChat Group**: Scan the QR code below to join the Chinese group.

<img
  src="../../../resources/wechat_group.png"
  alt="All API Hub WeChat Group QR Code"
  style="width: min(280px, 100%);"
/>

<a id="sponsors"></a>
## ❤️ Sponsors

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://www.packyapi.com/register?aff=all-api-hub">
      <img src="../../../resources/partners/packycode.png" alt="PackyCode">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    Thanks to PackyCode for sponsoring this project! PackyCode is a reliable and efficient API relay service provider, offering relay services for Claude Code, Codex,
    Gemini, and more. PackyCode provides special discounts for our software users: register using
    <a href="https://www.packyapi.com/register?aff=all-api-hub">this link</a> and enter the "all-api-hub" promo code during first recharge to get 10% off.
  </p>
</div>

<div class="readme-sponsor">
  <div class="readme-sponsor-logo">
    <a href="https://runapi.co/register?aff=cvDm">
      <img class="readme-sponsor-logo-small" src="../../../resources/partners/runapi.jpg" alt="RunAPI">
    </a>
  </div>
  <p class="readme-sponsor-copy">
    Thanks to RunAPI for sponsoring this project! RunAPI is a stable and efficient alternative to API OpenRouter. With one API Key, you can access over 150 mainstream models including OpenAI, Claude, Gemini, DeepSeek, and Grok, at prices as low as 10% of the original. It is extremely stable and seamlessly compatible with tools like Claude Code and OpenClaw. RunAPI offers exclusive benefits for All API Hub users: register using <a href="https://runapi.co/register?aff=cvDm">this link</a> and contact the RunAPI administrator to receive a ¥7 free credit.
  </p>
</div>

<style>
.readme-sponsor {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin: 1rem 0;
}

.readme-sponsor-logo {
  flex: 0 0 180px;
  text-align: center;
}

.readme-sponsor-logo img {
  width: 128px;
  max-width: 100%;
  height: auto;
}

.readme-sponsor-logo img.readme-sponsor-logo-small {
  width: 64px;
}

.readme-sponsor-copy {
  flex: 1;
  min-width: 0;
  margin: 0;
}

@media (max-width: 640px) {
  .readme-sponsor {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .readme-sponsor-logo {
    flex-basis: auto;
    width: 100%;
    text-align: left;
  }

  .readme-sponsor-logo img {
    width: 128px;
  }

  .readme-sponsor-logo img.readme-sponsor-logo-small {
    width: 64px;
  }
}
</style>