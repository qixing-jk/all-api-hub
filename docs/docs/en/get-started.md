# Getting Started

In just a few minutes, you can start your journey of intelligent AI asset management. All API Hub can help you automatically sync quotas, perform daily check-ins, and integrate with your favorite AI tools with one click.

## 1. Installation

For the best experience (including automatic updates), we **strongly recommend installing from each browser's official store**.

| Channel | Download Link | Current Version | Users |
|---|---|---|---|
| Chrome Store | [Chrome Store](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/lapnciffpekdengooeolaienkeoilfeo?label=Chrome%20Users)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| Edge Store | [Edge Store](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge Add-ons Users](https://img.shields.io/badge/dynamic/json?label=Edge%20Users&query=$.activeInstallCount&url=https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/pcokpjaffghgipcgjhapgdpeddlhblaa)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| Firefox Store | [Firefox Store](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Mozilla Add-on Users](https://img.shields.io/amo/users/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox%20Users)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |

<details>
<summary>📦 Manual Installation, Safari, or Mobile? (Click to expand)</summary>

- **GitHub Stable**: Use [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases) when you cannot install the store build or need to temporarily install a published fix manually. Manual installations do not auto-update like the store build. You can Star / Watch the repository to receive new version notifications.
- **Nightly pre-release**: For early access and testing. It may be less stable than the store build. Nightly is also a manual installation channel and does not auto-update.
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

::: tip Don't have an account yet?
If you are looking for stable, efficient, and highly compatible AI relay services, try our partner [PackyCode](https://www.packyapi.com/register?aff=all-api-hub) (enter the `all-api-hub` promo code during recharge to get 10% off), or [RunAPI](https://runapi.co/register?aff=cvDm) (register and contact a RunAPI administrator to receive a ￥7 free credit).
:::

> **Shield Bypass Tip**: If the site has Cloudflare verification (5-second shield), the plugin will automatically pop up a window to assist with bypassing it. Once verified, it will continue the recognition process automatically.

<a id="manual-addition"></a>
### 2.2 Manual Addition (Alternative)

If auto-recognition fails, or if you want precise control, you can manually enter the details:
- **Username / ID**: The name displayed on the site.
- **Access Token**: Usually found in the "Settings" or "Tokens" page of the site.
- **Mode Selection**: `Access Token` mode is recommended by default.

---

## 3. Supported Site Types

No matter which architecture you use, there is a good chance we support it:
- **Account-site compatible architectures**: One API, New API, Veloera, One-Hub, Done-Hub, Sub2API, and more.
- **Specialized account platforms and compatible implementations**: AIHubMix, AnyRouter, Neo-API, Super-API, v-api, and more.
- **Self-hosted admin backends**: New API, Veloera, Done-Hub, [Octopus](https://github.com/bestruirui/octopus), AxonHub, Claude Code Hub, and more, for channel management, migration, and partial model sync.

::: tip Compatibility Tip
Relay sites built on account-site compatible architectures can usually be added as accounts. AxonHub, Octopus, Claude Code Hub, and similar systems are mainly used as self-hosted admin backends. For a complete compatibility list, please check [Supported Sites and System Types](./supported-sites.md).
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
- **[Overview & Real-time Refresh](./auto-refresh.md)**: Centrally view balances, usage, and health status across multiple sites.
- **[Balance History](./balance-history.md)**: Visualize asset change trends with historical data.
- **[Usage Analytics](./usage-analytics.md)**: Multi-dimensional analysis of consumption, model distribution, and latency.

### 🔑 Key Management & Quick Integration
- **[Token Management](./key-management.md)**: Centrally manage site tokens, with support for one-click completion.
- **[API Credential Library](./api-credential-profiles.md)**: Save `Base URL + API Key` without needing an account, then copy, verify, and view models from it.
- **[Web API Sniffing](./web-ai-api-check.md)**: Quickly identify and test API configurations within a webpage.

### ⚡ Automation & Information Tracking
- **[Auto Check-in Flow](./auto-checkin.md)**: Automatically complete check-ins for all sites daily.
- **[Site Announcements](./site-announcements.md)**: Fetch announcements from saved sites in the background and centrally review maintenance, model changes, pricing updates, and other messages.
- **[Redemption Assistant](./redemption-assist.md)**: Automatically recognize redemption codes on webpages and claim them with one click.
- **[Bookmark Management](./bookmark-management.md)**: Centrally collect console links, documentation, recharge portals, and more.

### 🛡️ Stability & Security Protection
- **[Cloudflare Bypass Assistant](./cloudflare-helper.md)**: Assist in passing verification to ensure uninterrupted refreshes and check-ins.
- **[WebDAV Sync & Encryption](./webdav-sync.md)**: Supports cross-device encrypted backups, ensuring data is never lost.

### 🔔 Notification Channels
- **[Task notifications](./task-notifications.md)**: Enable them in **`Settings → General → Notifications`** to receive background task result reminders through browser system notifications, Telegram Bot, Feishu Bot, DingTalk Bot, WeCom Bot, ntfy, or generic webhook delivery.

### 🛠️ Self-hosted Site Operation Tools
- **[Self-hosted Site Management](./self-hosted-site-management.md)**: Directly add, delete, modify, and query channels within the plugin.
- **[Model Sync & Redirection](./managed-site-model-sync.md)**: Batch sync upstream models and configure mapping logic.

---

## 6. Other Information

- [Frequently Asked Questions FAQ](./faq.md)
- [Changelog](./changelog.md)
- [Permissions Explanation](./permissions.md)
- [Data Import and Export](./data-management.md)