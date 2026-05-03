# Getting Started

In just a few minutes, you can start your journey of intelligent AI asset management. All API Hub can help you automatically sync quotas, perform daily check-ins, and integrate with your favorite AI tools with one click.

## 1. Installation

For the best experience (including automatic updates), we **strongly recommend installing from each browser's official store**.

| Channel | Download Link | Current Version | Users |
|---|---|---|---|
| Chrome Store | [Chrome Store](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/lapnciffpekdengooeolaienkeoilfeo?label=Chrome%20Users)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| Edge Store | [Edge Store](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge Add-ons Users](https://img.shields.io/badge/dynamic/json?label=Edge%20Users&query=$.activeInstallCount&url=https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/pcokpjaffghgipcgjhapgdpeddlhblaa)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| Firefox Store | [Firefox Store](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Mozilla Add-on Users](https://img.shields.io/amo/users/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox%20Users)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |
| GitHub Releases | [View All Releases](https://github.com/qixing-jk/all-api-hub/releases) | [![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat)](https://github.com/qixing-jk/all-api-hub/releases/latest) | [![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/qixing-jk/all-api-hub/total?label=Total%20Downloads)](https://github.com/qixing-jk/all-api-hub/releases) |

<details>
<summary>📦 Manual Installation, Safari, or Mobile? (Click to expand)</summary>

- **GitHub Release**: If you cannot access the store, you can download the Stable or Nightly version from [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).
- **Safari (Mac)**: Requires installation via Xcode. See the [Safari Installation Guide](./safari-install.md).
- **QQ / 360 etc.**: Supports manual loading in Chromium-based browsers. See the [Manual Installation Guide](./other-browser-install.md).
- **Mobile**: Supports Edge mobile, Firefox Android, Kiwi, etc. See [Mobile FAQ](./faq.md#mobile-browser-support).

</details>

<a id="add-site"></a>
## 2. Add Your First Account

This is the most crucial step for using the plugin. We **highly recommend using the "Auto-Recognize" feature**, which is as simple as scanning a QR code to log in.

### 2.1 Auto-Recognize (Recommended)

::: tip First Step
Open and log in to your AI proxy station website in your browser first.
:::

1. Click the plugin icon in the top-right corner of your browser to open the main page.
2. Click **`Add Account`**.
3. Enter the URL of the site in the dialog that appears.
4. Click **`Auto-Recognize`**.
5. After confirming the information is correct, click **`Confirm Addition`**.

> **Shield Bypass Tip**: If the site has Cloudflare verification (5-second shield), the plugin will automatically pop up a window to assist with bypassing it. Once verified, it will continue the recognition process automatically.

<a id="manual-addition"></a>
### 2.2 Manual Addition (Alternative)

If auto-recognition fails, or if you want precise control, you can manually enter the details:
- **Username / ID**: The name displayed on the site.
- **Access Token**: Usually found in the "Settings" or "Tokens" page of the site.
- **Mode Selection**: `Access Token` mode is recommended by default.

---

## 3. Supported Site Types

All API Hub supports almost all mainstream AI proxy station architectures on the market, including:
- **One API / New API** series (most common)
- **Sub2API**
- **AnyRouter / VoAPI / Super-API** and other specialized architectures

::: tip Compatibility Tip
Sites built on the above open-source systems are usually perfectly supported. For a complete compatibility list, please check [Supported Sites and System Types](./supported-sites.md).
:::

<a id="quick-export-sites"></a>
## 4. Quick Export and Integration

After adding an account, you can "push" these configurations to other AI tools with one click, eliminating the need for manual copy-pasting.

1. Go to the **`Key Management`** page.
2. Find the Key you want to export, and select **`Export to CherryStudio`**, **`Export to CC Switch`**, etc., from the menu.
3. Your AI client will automatically launch and complete the configuration.

> For a complete list, please see [Supported Export Tools and Integration Targets](./supported-export-tools.md).

---

## 5. In-depth Guide to Core Features

### 📊 Asset Dashboard & Statistics
- **5.1 [Overview & Real-time Refresh](./auto-refresh.md)**: Centrally view balances, usage, and health status across multiple sites.
- **5.2 [Balance History](./balance-history.md)**: Visualize asset change trends with historical data.
- **5.3 [Usage Analytics](./usage-analytics.md)**: Multi-dimensional analysis of consumption, model distribution, and latency.

### 🔑 Key Management & Quick Integration
- **5.4 [Token Management](./key-management.md)**: Centrally manage site tokens, with support for one-click completion.
- **5.5 [API Credential Profiles](./api-credential-profiles.md)**: Save URL+Key without needing an account, supporting batch validation.
- **5.6 [Web API Sniffing](./web-ai-api-check.md)**: Quickly identify and test API configurations within a webpage.

### ⚡ Automation & Quota Benefits
- **5.7 [Auto Check-in Flow](./auto-checkin.md)**: Automatically complete check-ins for all sites daily.
- **5.8 [Redemption Assistant](./redemption-assist.md)**: Automatically recognize redemption codes on webpages and claim them with one click.
- **5.9 [Bookmark Management](./bookmark-management.md)**: Centrally collect console links, documentation, recharge portals, and more.

### 🛡️ Stability & Security Protection
- **5.10 [Cloudflare Bypass Assistant](./cloudflare-helper.md)**: Assist in passing verification to ensure uninterrupted refreshes and check-ins.
- **5.11 [WebDAV Sync & Encryption](./webdav-sync.md)**: Supports cross-device encrypted backups, ensuring data is never lost.

### 🛠️ Self-hosted Site Operation Tools
- **5.12 [Self-hosted Site Management](./self-hosted-site-management.md)**: Directly add, delete, modify, and query channels within the plugin.
- **5.13 [Model Sync & Redirection](./managed-site-model-sync.md)**: Batch sync upstream models and configure mapping logic.

---

## 6. Other Information

- [Frequently Asked Questions FAQ](./faq.md)
- [Changelog](./changelog.md)
- [Permissions Explanation](./permissions.md)
- [Data Import and Export](./data-management.md)
</latest_source_markdown>