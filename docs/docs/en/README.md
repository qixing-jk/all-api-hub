---
home: true
title: "Homepage"
heroImage: "/512.png"
heroText: "All API Hub - AI Aggregation Relay Manager"
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
  - title: "Intelligent Site Identification"
    details: "Paste the site address after logging in to add an account, automatically identifying the site name, recharge ratio, and other information; manual entry is supported if identification fails, and duplicate additions will be prompted."
  - title: "Multi-Account Overview"
    details: "Consolidate multiple sites and accounts into a single panel for a clear overview of balances, usage, and health status, with support for automatic refreshing."
  - title: "Independent API Credential Archive"
    details: "Allows separate saving of baseUrl and API Key, independent of site accounts. Filter by tags and reuse for model viewing, API validation, and status statistics."
  - title: "Model and Price Comparison"
    details: "Not only view the model list but also filter by source, billing method, group, and account to compare prices, ratios, and actual costs, highlighting the lowest price or optimal group."
  - title: "Model and API Validation"
    details: "Supports model availability validation, batch validation, Token compatibility judgment, and CLI compatibility checks, suitable for troubleshooting 'site available but tool unavailable' issues."
  - title: "Usage Analysis and Latency Troubleshooting"
    details: "Filter and compare usage, costs, model distribution, and trends by site, account, Token, and date. Provides heatmap, latency, and slow request views to aid troubleshooting."
  - title: "Automatic Check-in and Redemption Jump"
    details: "Centrally identifies sites that support check-ins and manages their status, supporting automatic check-ins, custom check-in URLs, and redirection to recharge/redemption pages."
  - title: "Quick Export Integration"
    details: "One-click export to CherryStudio, CC Switch, CLIProxyAPI, Claude Code Router, Kilo Code, and the currently selected self-hosted site."
  - title: "Self-built Site Backend Linkage"
    details: "Supports backend linkage for self-built New API, DoneHub, Veloera, Octopus, AxonHub, and Claude Code Hub instances."
  - title: "WebDAV Backup and Synchronization"
    details: "Supports JSON import/export, automatic WebDAV synchronization, selective synchronization, and backup encryption for cross-device and multi-browser migration."
  - title: "Cloudflare Anti-Bot Assistant"
    details: "Automatically pops up an assistance window when encountering a Cloudflare challenge; continues with the original identification, refresh, or check-in process after verification."
  - title: "Full Platform Support"
    details: "Compatible with Chrome, Edge, Firefox, Safari, and mobile/phone browsers such as Mobile Edge, Firefox for Android, Kiwi, etc., with dark mode adaptation."
  - title: "Privacy First"
    details: "Defaults to local-first storage with no telemetry data collection; access to corresponding services only occurs when configuring WebDAV or external interfaces."

footer: "AGPL-3.0 Licensed | Copyright 2025-present All API Hub"
---

## Introduction

In the current AI ecosystem, there are an increasing number of aggregation relay sites and self-built panels based on the New API series. Managing balances, usage, model prices, and API key availability for various sites simultaneously is often scattered and time-consuming.

All API Hub, as a browser extension, can automatically identify accounts on these sites and provide one-click access to view balances, usage, model prices, manage models and keys, and perform automatic check-ins. It also offers independent API credential management and provides backend linkage and channel-related tools for self-built New API, DoneHub, Veloera, Octopus, AxonHub, and Claude Code Hub. Currently, it supports accounts from relay sites based on the following projects:

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [AxonHub](https://github.com/looplj/axonhub)
- [Sub2API](https://github.com/Wei-Shaw/sub2api)
- [AnyRouter](https://anyrouter.top)
- WONG Public Welfare Site
- Neo-API (Closed-source)
- Super-API (Closed-source)
- RIX_API (Closed-source, basic functionality supported)
- VoAPI (Closed-source, older versions supported)

If you are using the extension on macOS via Safari, please refer to the [Safari Installation Guide](./safari-install.md) first. Safari requires installation via Xcode, which differs from the store installation or unpacked loading methods for Chrome/Edge/Firefox.

If you use browsers such as QQ Browser, 360 Secure Browser, 360 Speed Browser, Cheetah Browser, Brave, Vivaldi, Opera, etc., please refer to the [QQ / 360 and Other Browsers Installation Guide](./other-browser-install.md).

<a id="community"></a>
## 💬 Community Communication

If you want to communicate faster about usage issues, troubleshoot configurations, or share compatible sites, we recommend using the following community channels:

- [GitHub Discussions](https://github.com/qixing-jk/all-api-hub/discussions): Suitable for organizing issues, accumulating experience, and long-term discussions.
- [Discord Community](https://discord.gg/RmFXZ577ZQ): For multi-language users, with diverse features, suitable for discussions and troubleshooting.
- [Telegram Group](https://t.me/qixing_chat): Suitable for fast communication among multi-language users.
- WeChat Group: Scan the QR code below to join the Chinese communication group.

<img
  src="../../../resources/wechat_group.png"
  alt="All API Hub WeChat Group QR Code"
  style="width: min(280px, 100%);"
/>