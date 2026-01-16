# Getting Started

An open-source browser extension designed to optimize the experience of managing AI proxy accounts, such as New API. Users can easily centrally manage and view account balances, models, and keys, and automatically add new sites. It supports usage on mobile devices via Kiwi or mobile Firefox browsers.

## 1. Download

### Channel Version Comparison

| Channel | Download Link | Current Version |
|------|----------|----------|
| GitHub Release | [Release 下载](https://github.com/qixing-jk/all-api-hub/releases) | ![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat) |
| Chrome Store | [Chrome 商店](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | ![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat) |
| Edge Store | [Edge 商店](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | ![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat) |
| Firefox Store | [Firefox 商店](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | ![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat) |

::: warning Tip
Store versions may experience a delay of 1-3 days during the review process. To experience new features or fixes immediately, it is recommended to prioritize using the GitHub Release version or building from the repository source code.
:::

## 2. Supported Sites

Supports proxy sites deployed based on the following projects:
- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [VoAPI](https://github.com/VoAPI/VoAPI)
- [Super-API](https://github.com/SuperAI-Api/Super-API)

::: warning
If the site has undergone secondary development causing changes to critical interfaces (e.g., `/api/user`), the extension may not be able to add the site correctly.
:::

## 3. Adding Sites

::: info Tip
You must first log in to the target proxy site using your browser, so that the extension's automatic recognition feature can obtain your account's [Access Token](#manual-addition) via cookies.
:::

### 3.1 Automatic Recognition Addition

1. Open the extension main page and click `Add Account`

![新增账号](./static/image/add-account-btn.png)

2. Enter the proxy site address and click `Automatic Recognition`

![自动识别](./static/image/add-account-dialog-btn.png)

3. After confirming the automatic recognition is correct, click `Confirm Addition`

::: info Tip
The extension automatically identifies various information about your account, such as:
- Username
- User ID
- [Access Token](#manual-addition)
- Recharge amount Ratio
:::

> If the target site has enabled Cloudflare's 5-second shield, the extension will automatically pop up a separate window to help bypass it; once passed, the recognition process will continue.
> If the IP quality is poor or due to other reasons, you will need to manually complete the bypass in the popped-up window before timeout.

### 3.2 Cloudflare Bypass Assistant Overview

- When a Cloudflare 5-second shield is detected, the extension automatically launches a temporary window to help complete the verification; if the challenge requires manual intervention, simply click verify within the pop-up.
- Once verification is passed, it will automatically return to the original process to continue fetching the Access Token and site information.
- For more details, refer to [Cloudflare Protection and Temporary Window Downgrade](#cloudflare-window-downgrade).

<a id="manual-addition"></a>
### 3.3 Manual Addition

::: info Tip
If automatic recognition fails, you can manually input and add the site account. You will need to obtain the following information first. (The UI may vary for each site, please locate the information yourself.)
:::
![用户信息](./static/image/site-user-info.png)

If the target site is a modified version (such as AnyRouter), please manually switch to **Cookie Mode** when adding the account, and then perform automatic recognition or manual entry. When encountering strictly protected sites, you can also use the Cloudflare Bypass Assistant in conjunction. For details, see [FAQ](./faq.md#anyrouter-error).

<a id="quick-export-sites"></a>
## 4. Quick Site Export

This extension supports one-click export of added site API configurations to [CherryStudio](https://github.com/CherryHQ/cherry-studio), [CC Switch](https://github.com/ccswitch/ccswitch), and [New API](https://github.com/QuantumNous/new-api), thereby simplifying the process of adding upstream providers on these platforms.

### 4.1 Configuration

Before using the quick export feature, you need to configure the target platform (New API)'s **Server Address**, **Admin Token**, and **User ID** in the extension's **Basic Settings** page.

### 4.2 Export Process

1. **Navigate to Key Management**: On the extension's **Key Management** page, find the API key corresponding to the site you want to export.
2. **Click Export**: In the key operation menu, select **"Export to CherryStudio / CC Switch / New API"**.
3. **Automatic Processing**:
   * **For New API**: The extension automatically checks if a Channel with the same `Base URL` already exists on the target platform to prevent duplicate additions. If it does not exist, a new Channel will be created, automatically populating the site name, `Base URL`, API key, and available model list.
   * **For CherryStudio / CC Switch**: The extension will send the site and key directly to the local application or clipboard, based on the target application's protocol, eliminating the need for item-by-item pasting.

Through this feature, you can easily import API provider configurations into other platforms without manual copy-pasting, improving work efficiency.

## 5. Feature Overview

### 5.1 Automatic Refresh and Health Status

- Go to **Settings → Automatic Refresh** to enable scheduled account data refresh, with a default interval of 6 minutes (360 seconds), supporting a minimum of 60 seconds.
- Checking **"Auto Refresh when opening extension"** synchronizes data when the pop-up is opened.
- After enabling **"Show Health Status"**, the account card will display a health status indicator (Normal/Warning/Error/Unknown).

### 5.2 Check-in Detection

- Check **"Enable Check-in Detection"** in the account information to track the site's check-in status.
- Supports setting **Custom Check-in URL** and **Custom Recharge URL** to adapt to modified sites.
- Accounts requiring check-in will display a prompt in the list, and clicking it will jump to the check-in page.

### 5.3 WebDAV Backup and Multi-Device Synchronization

- Go to **Settings → WebDAV Backup**, configure the WebDAV address, username, and password.
- You can select the synchronization strategy (Merge/Upload Only/Download Only) and set the automatic synchronization interval.
- It is recommended to use this in conjunction with JSON import/export for double backup.

### 5.4 Sorting Priority

- Adjust the account sorting logic in **Settings → Sorting Priority Settings**.
- Supports combining conditions such as current site, health status, check-in requirement, and custom fields.
- Drag and drop to adjust priority, and disable unnecessary sorting rules at any time.

### 5.5 Data Import/Export

- In the "Import and Export" area under **Settings → Data and Backup**, you can export all current account configurations to JSON with one click.
- Supports importing data exported from older versions or other devices, facilitating quick migration or recovery.

### 5.6 New API Model List Synchronization

For detailed documentation on the New API Model List Synchronization feature, please refer to [New API 模型列表同步](./new-api-model-sync.md).

### 5.7 New API Channel Management (Beta)

Create/edit/delete Channels directly within the extension, combined with model whitelisting and single-channel synchronization debugging, significantly reducing the frequency of trips to the New API backend. See [New API 渠道管理](./new-api-channel-management.md) for detailed operations and precautions.

<a id="cloudflare-window-downgrade"></a>
### 5.8 Cloudflare Protection and Temporary Window Downgrade

- When recognition or API calls are intercepted by Cloudflare (common status codes 401/403/429), the system automatically switches to a temporary window for retries, maintaining the target domain Cookie, usually requiring no manual intervention; the principle is detailed in [Cloudflare 过盾助手](./cloudflare-helper.md).
- If human verification is required, please complete the challenge in the popped-up assistance window; if failures are frequent, try changing your network or reducing the request frequency.

## 6. In-Depth Documentation

- [Cloudflare Bypass Assistant](./cloudflare-helper.md)
- [Quick Site Configuration Export](./quick-export.md)
- [Automatic Refresh and Real-time Data](./auto-refresh.md)
- [Automatic Check-in and Check-in Monitoring](./auto-checkin.md)
- [WebDAV Backup and Automatic Synchronization](./webdav-sync.md)
- [Data Import and Export](./data-management.md)
- [New API Model List Synchronization](./new-api-model-sync.md)
- [New API Channel Management](./new-api-channel-management.md)
- [CLIProxyAPI Integration](./cliproxyapi-integration.md)
- [Model Redirection](./model-redirect.md)
- [Sorting Priority Settings](./sorting-priority.md)
- [Permission Management (Optional Permissions)](./permissions.md)

## 7. FAQ and Support

- View the more detailed [FAQ](./faq.md) to learn about authentication methods, AnyRouter adaptation, feature usage tips, and more.
- If you encounter problems or require new features, please feel free to provide feedback on [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues).
- To view historical updates, check the [Changelog](https://github.com/qixing-jk/all-api-hub/blob/main/CHANGELOG.md).

::: tip Next Steps
After completing the basic settings, you can continue configuring automatic refresh, check-in detection, or WebDAV synchronization for a more complete user experience.
:::