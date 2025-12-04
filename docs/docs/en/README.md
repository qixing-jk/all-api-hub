---
home: true
title: Home
heroImage: https://github.com/qixing-jk/all-api-hub/blob/main/assets/icon.png?raw=true
heroText: All API Hub - AI Aggregation Proxy Manager
tagline: An open-source browser extension for unified management of third-party AI aggregation proxies and self-hosted New API instances: automatically identifies accounts, views balances, synchronizes models, manages keys, and supports cross-platform and cloud backup.
actions:
  - text: Get Started
    link: /get-started.html # 建议修改为您的实际文档路径，例如 /guide/
    type: primary
    
  - text: Chrome Web Store
    link: https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo
    type: secondary

  - text: Edge Add-ons
    link: https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa
    type: secondary

  - text: Firefox Add-ons
    link: https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}
    type: secondary

features:
  - title: Smart Site Management
    details: Automatically identifies AI aggregation proxy sites and creates access tokens, intelligently retrieves site names and top-up ratios, supports duplicate detection and manual addition.
  - title: Multi-Account System
    details: Supports adding multiple accounts per site, account grouping and quick switching, real-time balance viewing, and detailed usage logs.
  - title: Token and Key Management
    details: Conveniently manage all API Keys, supporting viewing, copying, refreshing, and batch operations.
  - title: Model Information View
    details: Clearly displays the list of supported models and pricing information for each site.
  - title: Check-in Status Monitoring
    details: Automatically detects which sites support check-ins and marks accounts that haven't checked in for the day, allowing you to complete multi-site check-ins sequentially from one panel, reducing wasted free quotas due to forgotten check-ins.
  - title: Quick Export Integration
    details: One-click export of configurations to CherryStudio and New API, simplifying the API usage process.
  - title: New API-like System Management
    details: Supports channel management and model list synchronization for self-hosted New API instances, and provides a dedicated channel management interface.
  - title: Data Backup and Restore
    details: Supports JSON format import/export and WebDav cloud backup for cross-device data synchronization.
  - title: Full Platform Support
    details: Compatible with Chrome and Firefox browsers, supports mobile browsers like Kiwi Browser, and adapts to dark mode.
  - title: Privacy and Security
    details: Runs completely offline, all data is stored locally, and all core features can be used without an internet connection.
  - title: Cloudflare Bypass Assistant
    details: Automatically bypasses Cloudflare's 5-second challenge with a pop-up, ensuring sites can be identified and recorded.
  - title: Quick Export
    details: One-click export of site configurations to CherryStudio, New API, and CC Switch.

footer: AGPL-3.0 Licensed | Copyright 2025-present All API Hub
---

## Introduction

Currently, there are numerous AI aggregation proxy sites available, and checking balances, model lists, and keys for each one individually is very cumbersome.

This plugin can automatically identify and integrate the management of AI aggregation proxy accounts based on the following projects:

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- Neo-API (closed source)
- Super-API (closed source)
- RIX_API (closed source, basic functionality supported)
- VoAPI (closed source, older versions supported)