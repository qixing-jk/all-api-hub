# Getting Started

An open-source browser extension designed to optimize the experience of managing AI proxy accounts like New API. Users can easily centralize management and view account balances, models, and keys, and automatically add new sites. It supports use on mobile devices via Kiwi or mobile Firefox browsers.

## 1. Download

### Channel Version Comparison

| Channel | Download Link | Current Version |
|---------|---------------|-----------------|
| GitHub Release | [Release Download](https://github.com/qixing-jk/all-api-hub/releases) | ![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat) |
| Chrome Web Store | [Chrome Web Store](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | ![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat) |
| Edge Add-ons | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | ![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat) |
| Firefox Add-ons | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | ![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat) |

::: warning Tip
Store versions may experience a delay of 1-3 days during the review process. To experience new features or fixes as soon as possible, it is recommended to prioritize using the GitHub Release version or building from the repository source code.
:::

## 2. Supported Sites

Supports proxy stations deployed based on the following projects:
- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [VoAPI](https://github.com/VoAPI/VoAPI)
- [Super-API](https://github.com/SuperAI-Api/Super-API)

::: warning
If a site has undergone secondary development, causing some critical interfaces (e.g., `/api/user`) to change, the extension may not be able to add this site correctly.
:::

## 3. Adding a Site

::: info Tip
You must first log in to the target proxy station using your browser so that the extension's automatic recognition feature can obtain your account's [Access Token](#_3-2-手动添加) via cookies.
:::

### 3.1 Automatic Recognition and Addition

1. Open the extension's main page and click `Add Account`

![Add Account](./static/image/add-account-btn.png)

2. Enter the proxy station address and click `Auto-recognize`

![Auto-recognize](./static/image/add-account-dialog-btn.png)

3. After confirming that the automatic recognition is correct, click `Confirm Add`

::: info Tip
The extension will automatically recognize various information about your account, such as:
- Username
- User ID
- [Access Token](#_3-2-手动添加)
- Recharge amount ratio
:::

> If the target site has Cloudflare's 5-second challenge enabled, the extension will automatically pop up a separate window to help bypass it; once passed, the recognition process can continue.
> If the IP quality is poor or for other reasons, you will need to manually complete the challenge in the pop-up window before the timeout.

### 3.2 Cloudflare Bypass Assistant Overview

- When a Cloudflare 5-second challenge is detected, the extension will automatically launch a temporary window to help complete the verification; if the challenge requires manual intervention, simply click "Verify" within the pop-up window.
- After successful verification, it will automatically return to the original process to continue obtaining the Access Token and site information.
- For more details, refer to [Cloudflare Protection and Temporary Window Fallback](#_5-8-cloudflare-防护与临时窗口降级).

### 3.3 Manual Addition

::: info Tip
If automatic recognition fails, you can manually add site accounts. You will need to obtain the following information first. (The UI may vary for each site, please find it yourself.)
:::
![User Information](./static/image/site-user-info.png)

If the target site is a modified version (e.g., AnyRouter), please manually switch to **Cookie Mode** when adding the account, then perform automatic recognition or manual entry. When encountering strictly protected sites, you can also use it in conjunction with the Cloudflare Bypass Assistant. For details, please refer to [FAQ](./faq.md#anyrouter-网站报错怎么办).

## 4. Quick Site Export

This extension supports one-click export of added site API configurations to [CherryStudio](https://github.com/CherryHQ/cherry-studio), [CC Switch](https://github.com/ccswitch/ccswitch), and [New API](https://github.com/QuantumNous/new-api), thereby simplifying the process of adding upstream providers on these platforms.

### 4.1 Configuration

Before using the quick export feature, you need to configure the **Server Address**, **Admin Token**, and **User ID** of the target platform (New API) in the extension's **Basic Settings** page.

### 4.2 Export Process

1.  **Navigate to Key Management**: On the extension's **Key Management** page, find the API key corresponding to the site you want to export.
2.  **Click Export**: In the key operation menu, select **"Export to CherryStudio / CC Switch / New API"**.
3.  **Automatic Processing**:
    *   **For New API**: The extension will automatically detect if a channel with the same `Base URL` already exists on the target platform to avoid duplicate additions. If it does not exist, a new channel will be created, and the site name, `Base URL`, API key, and available model list will be automatically populated.
    *   **For CherryStudio / CC Switch**: The extension will send the site and key directly to the local application or clipboard according to the target application's protocol, eliminating the need for item-by-item pasting.

With this feature, you can easily import API provider configurations to other platforms without manual copy-pasting, improving work efficiency.

## 5. Feature Overview

### 5.1 Auto-Refresh and Health Status

- Go to **Settings → Auto-Refresh** to enable timed refreshing of account data. The default interval is 6 minutes (360 seconds), with a minimum supported interval of 60 seconds.
- Check **"Auto-refresh when opening extension"** to synchronize data when the pop-up window is opened.
- After enabling **"Show Health Status"**, the account card will display health status indicators (Normal/Warning/Error/Unknown).

### 5.2 Check-in Detection

- Check **"Enable Check-in Detection"** in the account information to track the site's check-in status.
- Supports setting **Custom Check-in URL** and **Custom Recharge URL** to adapt to modified sites.
- Accounts requiring check-in will show a prompt in the list; click it to jump to the check-in page.

### 5.3 WebDAV Backup and Multi-Device Sync

- Go to **Settings → WebDAV Backup** to configure WebDAV address, username, and password.
- You can select a sync strategy (Merge/Upload Only/Download Only) and set the automatic sync interval.
- It is recommended to combine with JSON import/export for double backup.

### 5.4 Sorting Priority

- Adjust account sorting logic in **Settings → Sorting Priority Settings**.
- Supports combining conditions such as current site, health status, check-in requirement, and custom fields.
- Drag and drop to adjust priority, and disable unnecessary sorting rules at any time.

### 5.5 Data Import/Export

- In **Settings → Data Management**, you can one-click export all current account configurations as JSON.
- Supports importing data exported from older versions or other devices, facilitating quick migration or recovery.

### 5.6 New API Model List Sync

For detailed documentation on the New API model list sync feature, please refer to [New API Model List Sync](./new-api-model-sync.md).

### 5.7 New API Channel Management (Beta)

Directly create/edit/delete channels within the extension, combined with model whitelisting and single-channel sync debugging, can significantly reduce the frequency of going back and forth to the New API backend. See [New API Channel Management](./new-api-channel-management.md) for detailed operations and considerations.

### 5.8 Cloudflare Protection and Temporary Window Fallback

- When recognition or API calls are intercepted by Cloudflare (common status codes 401/403/429), it will automatically switch to a temporary window to retry, maintaining the target domain's cookies, usually without manual intervention; for detailed principles, see [Cloudflare Bypass Assistant](./cloudflare-helper.md).
- In scenarios requiring human verification, please complete the challenge in the popped-up assistance window; if failures are frequent, try changing your network or reducing the request frequency.

## 6. In-depth Documentation

- [Cloudflare Bypass Assistant](./cloudflare-helper.md)
- [Quick Site Export Configuration](./quick-export.md)
- [Auto-Refresh and Real-time Data](./auto-refresh.md)
- [Auto Check-in and Check-in Monitoring](./auto-checkin.md)
- [WebDAV Backup and Auto Sync](./webdav-sync.md)
- [Data Import/Export](./data-management.md)
- [New API Model List Sync](./new-api-model-sync.md)
- [New API Channel Management](./new-api-channel-management.md)

## 7. FAQ and Support

- View more detailed [FAQ](./faq.md) to learn about authentication methods, AnyRouter adaptation, feature usage tips, etc.
- If you encounter issues or need new features, feel free to provide feedback on [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues).
- For historical updates, please check the [Changelog](https://github.com/qixing-jk/all-api-hub/blob/main/CHANGELOG.md).

::: tip Next Steps
After completing the basic settings, you can proceed to configure auto-refresh, check-in detection, or WebDAV sync for a more complete user experience.
:::