```yaml
home: true
title: Home
heroImage: /512.png
heroText: All API Hub - AI Aggregation Gateway Manager
tagline: "Open-source browser extension to uniformly manage third-party AI aggregation gateways and self-built New APIs: automatically identify accounts, view balances, sync models, manage keys, and support cross-platform and cloud backup."
actions:
  - text: Get Started
    link: /get-started.html # Suggest modifying to your actual documentation path, e.g., /guide/
    type: primary
    
  - text: Chrome Store
    link: https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo
    type: secondary

  - text: Edge Store
    link: https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa
    type: secondary

  - text: FireFox Store
    link: https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}
    type: secondary

features:
  - title: Intelligent Site Management
    details: Automatically identify AI aggregation gateway sites and create access tokens, intelligently obtain site names and recharge ratios, supporting duplicate detection and manual addition.
  - title: Multi-Account System
    details: Supports adding multiple accounts for each site, account grouping and quick switching, real-time balance viewing and detailed usage logs.
  - title: Token and Key Management
    details: Conveniently manage all API Keys, supporting viewing, copying, refreshing, and batch operations.
  - title: Model Information View
    details: Clearly displays the list of supported models and pricing information for the site.
  - title: Check-in Status Monitoring
    details: Automatically detects which sites support check-in and marks accounts that have not checked in for the day, allowing you to complete multi-site check-ins in order, reducing wasted free quota due to forgotten check-ins.
  - title: Quick Export for Integration
    details: One-click export of configurations to CherryStudio and New API, simplifying the API usage process.
  - title: New API Class System Management
    details: Supports channel management and model list synchronization for self-built New API instances, and provides a dedicated channel management interface.
  - title: Data Backup and Restore
    details: Supports JSON format import/export and WebDAV cloud backup for cross-device data synchronization.
  - title: Cross-Platform Support
    details: Compatible with Chrome, Firefox browsers, supports mobile browsers like Kiwi Browser, and adapts to dark mode.
  - title: Privacy and Security
    details: Runs completely offline, all data is stored locally, and all core functions can be used without an internet connection.
  - title: Cloudflare Anti-Bot Assistant
    details: Automatically pops up to bypass the 5-second shield when encountered, ensuring sites can be identified and recorded.
  - title: Quick Export
    details: One-click export of site configurations to CherryStudio, New API, and CC Switch.

footer: AGPL-3.0 Licensed | Copyright 2025-present All API Hub
---

## Introduction

The AI ecosystem now has an increasing number of aggregation gateways and self-built panels based on the New API series. Managing the balances, model lists, and API keys of various sites simultaneously is often fragmented and time-consuming.

All API Hub, as a browser extension, can automatically identify accounts on these sites and provide one-click access to view balances, manage models, keys, and perform automatic check-ins. It also offers tools like model synchronization and channel management for self-built New APIs. Currently, it supports accounts from aggregation gateways based on the following projects:

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [Sub2API](https://github.com/Wei-Shaw/sub2api)
- [AnyRouter](https://anyrouter.top)
- Neo-API (Closed source)
- Super-API (Closed source)
- RIX_API (Closed source, basic functionality supported)
- VoAPI (Closed source, older versions supported)
```