# Getting Started

An open-source browser extension designed to optimize the experience of managing AI proxy station accounts like New API. Users can easily manage and view account balances, models, and keys in a centralized location, with automatic site addition. Supports mobile devices via Kiwi or mobile Firefox browsers.

## 1. Download

### Channel Version Comparison

| Channel | Download Link | Current Version | Users |
|---|---|---|---|
| Chrome Store | [Chrome Store](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome version](https://img.shields.io/chrome-web-store/v/lapnciffpekdengooeolaienkeoilfeo?label=Chrome&logo=googlechrome&style=flat)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) | [![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/lapnciffpekdengooeolaienkeoilfeo?label=Chrome%20Users)](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| Edge Store | [Edge Store](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge version](https://img.shields.io/badge/dynamic/json?label=Edge&prefix=v&query=%24.version&url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fpcokpjaffghgipcgjhapgdpeddlhblaa&logo=microsoftedge&style=flat)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) | [![Edge Add-ons Users](https://img.shields.io/badge/dynamic/json?label=Edge%20Users&query=$.activeInstallCount&url=https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/pcokpjaffghgipcgjhapgdpeddlhblaa)](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| Firefox Store | [Firefox Store](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Firefox version](https://img.shields.io/amo/v/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox&logo=firefoxbrowser&style=flat)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) | [![Mozilla Add-on Users](https://img.shields.io/amo/users/%7Bbc73541a-133d-4b50-b261-36ea20df0d24%7D?label=Firefox%20Users)](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |
| GitHub Release | [Release Download](https://github.com/qixing-jk/all-api-hub/releases) | [![GitHub version](https://img.shields.io/github/v/release/qixing-jk/all-api-hub?label=GitHub&logo=github&style=flat)](https://github.com/qixing-jk/all-api-hub/releases) | [![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/qixing-jk/all-api-hub/total?label=Total%20Downloads)](https://github.com/qixing-jk/all-api-hub/releases) |

::: warning Note
Store versions may be delayed by 1-3 days due to review processes. For the earliest access to new features or fixes, it is recommended to prioritize the GitHub Release version or build from the repository source.
:::

## 2. Supported Sites

Supports proxy stations deployed based on the following projects:
- [one-api](https://github.com/songquanpeng/one-api)
- [new-api](https://github.com/QuantumNous/new-api)
- [Veloera](https://github.com/Veloera/Veloera)
- [one-hub](https://github.com/MartialBE/one-hub)
- [done-hub](https://github.com/deanxv/done-hub)
- [Sub2API](https://github.com/Wei-Shaw/sub2api)
- [AnyRouter](https://anyrouter.top)
- [VoAPI](https://github.com/VoAPI/VoAPI)
- [Super-API](https://github.com/SuperAI-Api/Super-API)

::: warning
If the site has undergone secondary development that has altered key interfaces (e.g., `/api/user`), the extension may not be able to add the site correctly.
:::

## 3. Adding a Site

::: info Note
You must log in to the target website yourself first using your browser. This allows the extension's automatic recognition feature to read your login information and retrieve account details.
:::

### 3.1 Automatic Recognition and Addition

1. Open the extension's main page and click `Add Account`

![Add Account Button](./static/image/add-account-btn.png)

2. Enter the proxy station address and click `Auto Recognize`

![Auto Recognize Button](./static/image/add-account-dialog-btn.png)

3. After confirming the automatic recognition is correct, click `Confirm Addition`

::: info Note
The extension will automatically recognize various information about your account, such as:
- Username
- User ID
- [Access Token](#manual-addition)
- Top-up amount Ratio
:::

> If the target site has Cloudflare's 5-second bypass enabled, the extension will automatically pop up an independent window to assist with bypassing the protection. Once bypassed, the recognition process can continue.
> If the IP quality is poor or for other reasons, you may need to manually complete the bypass within the pop-up window before the timeout.

### 3.2 Cloudflare Bypass Assistant Overview

- When a Cloudflare 5-second bypass is detected, the extension will automatically launch a temporary window to help complete the verification. If manual intervention is required for the challenge, click to verify within the pop-up.
- After successful verification, the process will return to the original flow to continue obtaining the Access Token and site information.
- For more details, refer to [Cloudflare Protection and Temporary Window Downgrade](#cloudflare-window-downgrade).

<a id="manual-addition"></a>
### 3.3 Manual Addition

::: info Note
If automatic recognition fails, you can manually enter and add the site account. You will need to obtain the following information first. (The UI may vary for each site, please find it yourself.)
:::
![User Information](./static/image/site-user-info.png)

If the target site is a modified version (e.g., AnyRouter), please manually switch to **Cookie Mode** when adding the account, and then proceed with automatic recognition or manual input. When encountering sites with strict protection, you can also use the Cloudflare Bypass Assistant in conjunction. For details, see [FAQ](./faq.md#anyrouter-error).

<a id="quick-export-sites"></a>
## 4. Quick Site Export

This extension supports one-click export of added site API configurations to [CherryStudio](https://github.com/CherryHQ/cherry-studio), [CC Switch](https://github.com/ccswitch/ccswitch), and [New API](https://github.com/QuantumNous/new-api), simplifying the process of adding upstream providers in these platforms.

### 4.1 Configuration

Before using the quick export feature, you need to configure the **Server Address**, **Admin Token**, and **User ID** of the target platform (New API) on the extension's **Basic Settings** page.

### 4.2 Export Process

1. **Navigate to Key Management**: In the extension's **Key Management** page, find the API key corresponding to the site you wish to export.
2. **Click Export**: In the key operation menu, select **"Export to CherryStudio / CC Switch / New API"**.
3. **Automatic Processing**:
   * **For New API**: The extension will automatically detect if a channel with the same `Base URL` already exists on the target platform to avoid duplicate additions. If it doesn't exist, a new channel will be created, and the site name, `Base URL`, API key, and available model list will be automatically populated.
   * **For CherryStudio / CC Switch**: The extension will send the site and key directly to the local application or clipboard according to the target application's protocol, eliminating the need for manual copy-pasting.

Through this feature, you can easily import API provider configurations into other platforms without manual copy-pasting, thereby improving work efficiency.

## 5. Feature Overview

### 5.1 Automatic Refresh and Health Status

- Navigate to **Settings → Auto Refresh** to enable periodic refreshing of account data. The default interval is 6 minutes (360 seconds), with a minimum supported interval of 60 seconds.
- Checking **"Auto refresh when opening the extension"** will synchronize data when the popup is opened.
- With **"Display Health Status"** enabled, account cards will show health status indicators (Normal/Warning/Error/Unknown).

### 5.2 Check-in Detection

- Check **"Enable Check-in Detection"** in the account information to track site check-in status.
- Supports setting **Custom Check-in URL** and **Custom Top-up URL** to adapt to modified sites.
- Accounts requiring check-in will display a prompt in the list, which can be clicked to jump to the check-in page.

### 5.3 WebDAV Backup and Multi-device Synchronization

- Go to **Settings → WebDAV Backup** to configure the WebDAV address, username, and password.
- You can choose synchronization strategies (Merge/Upload Only/Download Only) and set the automatic synchronization interval.
- It is recommended to use JSON import/export for dual backup.

### 5.4 Sorting Priority

- Adjust the account sorting logic in **Settings → Sorting Priority Settings**.
- Supports combining conditions such as current site, health status, check-in requirements, and custom fields.
- Drag and drop to adjust priority and disable unwanted sorting rules at any time.

### 5.5 Data Import and Export

- In the **Settings → Data & Backup** section, under "Import and Export," you can export all current account configurations to JSON with one click.
- Supports importing data exported from older versions or other devices for quick migration or restoration.

### 5.6 New API Model List Synchronization

For detailed documentation on the New API model list synchronization feature, please refer to [New API Model List Synchronization](./new-api-model-sync.md).

### 5.7 New API Channel Management (Beta)

Create, edit, and delete channels directly within the extension. Combined with model whitelisting and single-channel synchronization debugging, this can significantly reduce the frequency of returning to the New API backend. Refer to [New API Channel Management](./new-api-channel-management.md) for detailed operations and precautions.

<a id="cloudflare-window-downgrade"></a>
### 5.8 Cloudflare Protection and Temporary Window Downgrade

- When Cloudflare intercepts a request (common status codes 401/403/429), the extension will automatically switch to a temporary window for retries, maintaining the target domain's cookies. Generally, no manual operation is required; see [Cloudflare Bypass Assistant](./cloudflare-helper.md) for principles.
- If a scenario requiring human verification occurs, complete the challenge in the pop-up assistance window. If failures are frequent, try changing your network or reducing request frequency.

## 6. In-depth Documentation

- [Cloudflare Bypass Assistant](./cloudflare-helper.md)
- [Quick Export Site Configuration](./quick-export.md)
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

- Refer to the more detailed [FAQ](./faq.md) for information on authentication methods, AnyRouter adaptation, feature usage tips, etc.
- If you encounter issues or need new features, feel free to provide feedback on [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues).
- To understand historical updates, please check the [Changelog](./changelog.md).

::: tip Next Steps
After completing the basic setup, you can proceed to configure automatic refresh, check-in detection, or WebDAV synchronization for a more comprehensive user experience.
:::