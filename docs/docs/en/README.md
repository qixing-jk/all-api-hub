---
home: true
title: Home
heroImage: https://github.com/qixing-jk/all-api-hub/blob/main/assets/icon.png?raw=true
heroText: All API Hub - AI Aggregation Proxy Manager
tagline: Open-source browser extension that automatically identifies and manages all AI aggregation proxy accounts, allowing you to view balances, sync models, manage keys, and supports cross-platform and cloud backup.
actions:
  - text: Get Started
    link: /en/get-started.html # It is recommended to change this to your actual documentation path, e.g., /guide/
    type: primary
    
  - text: Chrome Web Store
    link: https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo
    type: secondary

  - text: Edge Add-ons
    link: https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa
    type: secondary

  - text: Firefox Add-ons
    link: https://addons.mozilla.org/firefox/addon/%E4%B8%AD%E8%BD%AC%E7%AB%99%E7%AE%A1%E7%90%86%E5%99%A8-all-api-hub
    type: secondary

features:
  - title: Smart Site Management
    details: Automatically identifies AI aggregation proxy sites and creates access tokens, intelligently retrieves site names and top-up ratios, supports duplicate detection and manual addition.
  - title: Multi-Account System
    details: Supports adding multiple accounts for each site, with account grouping and quick switching, real-time balance viewing, and detailed usage logs.
  - title: Token and Key Management
    details: Conveniently manage all API Keys, supporting viewing, copying, refreshing, and batch operations.
  - title: Model Information Viewing
    details: Clearly displays the list of models supported by the site and channel information, supporting automatic model synchronization for New API and compatible systems.
  - title: Check-in Status Monitoring
    details: Automatically detects whether a site supports check-in functionality and displays the current check-in status.
  - title: Quick Export and Integration
    details: One-click export of configurations to CherryStudio and New API, simplifying the API usage process.
  - title: Data Backup and Recovery
    details: Supports JSON format import/export and WebDav cloud backup for cross-device data synchronization.
  - title: Cross-Platform Support
    details: Compatible with Chrome and Firefox browsers, supports mobile browsers like Kiwi Browser, and adapts to dark mode.
  - title: Privacy and Security
    details: Operates completely offline, with all data stored locally, allowing full core functionality without an internet connection.

footer: AGPL-3.0 Licensed | Copyright © 2025-present All API Hub
---

## Introduction

Currently, there are numerous AI aggregation proxy sites available. Each time you need to check balances, model lists, and API keys, you have to log in to each one individually, which is very cumbersome.

This extension can automatically identify and integrate the management of AI aggregation proxy accounts based on the following projects:

- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- VoAPI (closed source, older versions supported)
- Super-API (closed source)
- RIX_API (closed source, basic functionality supported)