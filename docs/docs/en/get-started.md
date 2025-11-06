# Get Started

An open-source browser extension designed to optimize the experience of managing AI relay station accounts like New API. Users can easily centralize management and view account balances, models, and keys, as well as automatically add new sites. The extension is also available on mobile devices via Kiwi Browser or the mobile version of Firefox.

## 1. Download


### Version Comparison

| Channel | Download Link | Current Version |
|---------|---------------|-----------------|
| GitHub Release | [Release Download](https://github.com/qixing-jk/all-api-hub/releases) | ![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat) |
| Chrome Web Store | [Chrome Web Store](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | ![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat) |
| Edge Add-ons | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | ![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat) |
| Firefox Add-ons | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/%E4%B8%AD%E8%BD%AC%E7%AB%99%E7%AE%A1%E7%90%86%E5%99%A8-all-api-hub/) | ![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat) |

::: warning Heads-up
Store releases are subject to 1–3 days of review. For the fastest access to new features and bug fixes, prefer the GitHub Release channel or build from source.
:::

## 2. Supported Sites

Supports relay stations based on the following projects:
- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [VoAPI](https://github.com/VoAPI/VoAPI)
- [Super-API](https://github.com/SuperAI-Api/Super-API)

::: warning
If the site has undergone secondary development that has changed key interfaces (e.g., `/api/user`), the plugin may not be able to add the site correctly.
:::

## 3. Add a Site

::: info Tip
You must first log in to the target relay station in your browser so that the plugin's auto-detection feature can obtain your account's [Access Token](#_3-2-manual-add) via cookies.
:::

### 3.1 Add Automatically

1. Open the main page of the plugin and click `Add Account`.

![Add Account](../static/image/add-account-btn.png)

2. Enter the relay station address and click `Auto-detect`.

![Auto-detect](../static/image/add-account-dialog-btn.png)

3. After confirming that the automatic detection is correct, click `Confirm Add`.

::: info Tip
The plugin will automatically identify various information from your account, such as:
- Username
- User ID
- [Access Token](#_3-2-manual-add)
- Top-up ratio
:::


### 3.2 Manual Add

::: info Tip
When automatic detection fails, you can manually enter the site account. You will need to obtain the following information first. (Each site may have a different UI, please find it yourself.)
:::
![User Info](../static/image/site-user-info.png)

If the target site is a heavily customized deployment (e.g., AnyRouter), please switch to **Cookie mode** in the add account dialog, then proceed with auto-detection or manual input. See [FAQ](./faq.md#anyrouter-keeps-failing-what-should-i-do) for details.

## 4. Quick Site Export

This extension supports one-click export of added site API configurations to [CherryStudio](https://github.com/CherryHQ/cherry-studio) and [New API](https://github.com/QuantumNous/new-api), simplifying the process of adding upstream providers in these platforms.

### 4.1 Configuration

Before using the quick export feature, you need to configure the **Server Address** and **Admin Token** for the target platform (CherryStudio or New API) in the extension's **Basic Settings** page. For New API, you also need to configure the **User ID**.

### 4.2 Export Process

1. **Navigate to Key Management**: In the extension's **Key Management** page, find the API key corresponding to the site you want to export.
2. **Click Export**: In the key's action menu, select **"Export to CherryStudio"** or **"Export to New API"**.
3. **Automatic Handling**:
   * **For New API**: The extension will automatically check if a channel with the same `Base URL` already exists on the target platform. If not, it will create a new channel and automatically populate the site name, `Base URL`, API key, and the list of available models, avoiding duplicate entries.
   * **For CherryStudio**: The extension will send the site and key information directly to your configured CherryStudio instance.

With this feature, you can easily synchronize your API provider configurations to other management platforms without manual copy-pasting, improving efficiency.

## 5. Feature Overview

### 5.1 Auto-Refresh & Health Status

- Open **Settings → Auto Refresh** to enable scheduled data refreshes. Default interval is 6 minutes (360 seconds); minimum is 60 seconds.
- Check **"Refresh on open"** to sync data each time you open the popup.
- Enable **"Show health status"** to display status badges (Healthy / Warning / Error / Unknown) on account cards.

### 5.2 Check-in Detection

- Enable **"Check-in detection"** in account settings to track site check-in status.
- Configure **Custom check-in URL** and **Custom redeem URL** to support customized deployments.
- Accounts needing a check-in will show a notification in the list; click to visit the check-in page automatically.

### 5.3 WebDAV Backup & Multi-Device Sync

- Go to **Settings → WebDAV Backup**, then enter your WebDAV endpoint, username, and password.
- Choose a sync strategy (merge / upload only / download only) and set an auto-sync interval.
- Combine with JSON import/export for dual-layer backups.

### 5.4 Sorting Priority

- Adjust account sorting logic in **Settings → Sorting Priority Settings**.
- Combine criteria like current site pinning, health status, check-in requirement, custom field sorting, etc.
- Drag to reorder priority; toggle individual criteria on or off as needed.

### 5.5 Data Import/Export

- In **Settings → Data Management**, export all account configs to JSON in a single click.
- Import previously exported data from other devices or older versions for quick migration or recovery.

### 5.6 New API Model List Synchronization

For detailed documentation on the New API Model List Synchronization feature, see [New API Model List Synchronization](./new-api-model-sync.md).

## 6. Support & Troubleshooting

- See the detailed [FAQ](./faq.md) for authentication modes, AnyRouter compatibility, feature tips, and more.
- Report issues or request features on [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues).
- Check the [Changelog](https://github.com/qixing-jk/all-api-hub/blob/main/CHANGELOG.md) for release history.

::: tip Next Steps
After basic setup, explore auto-refresh, check-in detection, and WebDAV sync for a more complete experience.
:::
