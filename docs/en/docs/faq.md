# Frequently Asked Questions

A collection of common issues encountered when using the plugin.

## 🔐 Authentication Methods

### What is the difference between Cookie mode and Access Token method?

The plugin supports two authentication methods:

| Authentication Method | Features | Applicable Scenarios | Recommendation Level |
|-----------------------|----------|----------------------|----------------------|
| **Access Token**      | ✅ Supports multiple accounts<br>✅ Permanently valid, does not expire<br>✅ More secure and stable | Most standard relay stations | ⭐⭐⭐⭐⭐ Highly Recommended |
| **Cookie**            | ⚠️ Single account<br>⚠️ May expire<br>✅ Good compatibility | Special sites with Token restrictions<br>Customized sites | ⭐⭐⭐ Use in special cases |

**It is recommended to use the Access Token method**, unless you encounter the following situations:
- The site does not support Access Tokens.
- Using a customized version of a relay station.
- Token functionality is disabled.

### How to switch authentication methods?

When adding an account, select the corresponding authentication method in the account dialog:
1. Click "Add Account"
2. Enter the site address
3. Select `Access Token` or `Cookie` from the "Authentication Method" dropdown list
4. Click "Auto-detect"

## 🔧 Specific Site Issues

### What to do if the AnyRouter website reports an error?

AnyRouter is a customized version of a relay station and does not support the standard Access Token method.

**Solution**:
1. When adding an account, select **Cookie Mode**.
2. First, log in to the AnyRouter site in your browser.
3. Then, use the plugin's auto-detection feature to add the account.

::: warning Note
Because AnyRouter has modified the API, some features may not function correctly. If you encounter issues, it is recommended to contact the site administrator.
:::

### What if auto-detection fails?

If auto-detection fails, you can try the following methods:

1.  **Switch authentication method**: Try switching from Access Token to Cookie mode.
2.  **Add Manually**: If auto-detection fails, manually fill in the following information:
    - Username
    - User ID
    - Access Token
    - Recharge Ratio
3.  **Check Login Status**: Ensure you are logged in to the target site in your browser.
4.  **Check Site Compatibility**: Confirm whether the site is based on supported projects (see below).

### Which sites might be incompatible?

If a site has undergone deep secondary development and modified key interfaces (such as `/api/user`), the plugin may not work correctly.

Common incompatibility situations:
- Modified user information interface.
- Disabled Access Token functionality.
- Customized authentication methods.
- Modified API response format.

## 🐛 Features and Bugs

### What to do if you encounter feature issues or bugs?

1.  **Check Issues**: Go to [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues) to search for similar issues.
2.  **Use the latest version**:
    - Store versions update slower; it is recommended to use the GitHub Release version.
    - Or use the development version from the main branch directly.

### How to get the latest version?

The plugin is published on multiple platforms, with varying update speeds:

| Platform            | Update Speed         | Version Acquisition |
|---------------------|----------------------|---------------------|
| **GitHub Releases** | ⚡ Fastest            | [Go to Download](https://github.com/qixing-jk/all-api-hub/releases) |
| **Chrome Web Store**| 🐌 Slower (3-5 days review) | [Go to Install](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| **Edge Add-ons**   | 🐌 Slower (2-3 days review) | [Go to Install](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| **Firefox Add-ons** | ⚡ Fast (a few hours review) | [Go to Install](https://addons.mozilla.org/firefox/addon/中转站管理器-all-api-hub/) |

::: tip Suggestion
If you encounter a fixed bug, it is recommended to download the latest version from GitHub Releases and install it manually.
:::

## ⚙️ Feature Usage Issues

### How to use WebDAV backup?

WebDAV backup helps you synchronize data across multiple devices:

1.  **Configure WebDAV**:
    - Open "Settings" → "WebDAV Backup"
    - Fill in the WebDAV server address (full URL)
    - Fill in username and password

2.  **Select Sync Strategy**:
    - `Merge` (Recommended): Intelligently merge local and remote data.
    - `Upload Only`: Only upload local data to the server.
    - `Download Only`: Only download data from the server.

3.  **Enable Auto Sync**:
    - Check "Enable Auto Sync"
    - Set the sync interval (default 3600 seconds/1 hour)

::: tip Recommended Services
- [Jianguoyun (坚果云)](https://www.jianguoyun.com/) (Fast access in China)
- Nextcloud (Self-hosted)
- Synology NAS
:::

### How to export to CherryStudio / New API?

The quick export feature allows one-click import of site configurations to other platforms:

**Configuration Steps**:

1.  **For New API**:
    - Open "Settings" → "Basic Settings"
    - Configure the New API server address
    - Fill in the Admin Token
    - Fill in the User ID

2.  **For CherryStudio**:
    - No additional configuration required
    - Ensure CherryStudio is running

**Export Process**:

1.  Go to the "Key Management" page.
2.  Find the site to export.
3.  Click the action menu.
4.  Select "Export to CherryStudio" or "Export to New API".

::: info Smart Detection
When exporting to New API, the plugin will automatically detect if the same channel already exists to avoid duplicate additions.
:::

### How to use the site check-in feature?

Some relay stations support daily check-ins to earn rewards:

1.  **Enable Check-in Detection**:
    - Edit account
    - Check "Enable Check-in Detection"

2.  **Custom Check-in URL** (Optional):
    - If the site check-in page is not a standard path
    - You can fill in "Custom Check-in URL"
    - Fill in "Custom Recharge URL" (Optional)

3.  **Perform Check-in**:
    - Accounts requiring check-in will display a check-in icon.
    - Click the check-in button on the account card.
    - Automatically open the check-in page.

### How to customize account sorting?

The plugin supports setting priorities for multiple sorting methods:

1.  **Access Sorting Settings**:
    - Open "Settings" → "Sorting Priority Settings"

2.  **Adjust Priority**:
    - Drag sorting conditions to adjust priority.
    - Check/uncheck to enable/disable conditions.

3.  **Available Sorting Conditions**:
    - 📌 Pin current site to top
    - 🏥 Sort by Health Status (Error > Warning > Unknown > Normal)
    - ✅ Pin accounts requiring check-in to top
    - 🔗 Pin accounts with custom check-in URLs to top
    - 📊 Sort by user-defined fields (Balance/Consumption/Name)

### How to set up auto-refresh?

Auto-refresh keeps account data up-to-date:

1.  **Enable Auto-refresh**:
    - Open "Settings" → "Auto-refresh"
    - Check "Enable Scheduled Auto-refresh"

2.  **Set Refresh Interval**:
    - Default: 360 seconds (6 minutes)
    - Minimum: 60 seconds (1 minute)
    - Adjust based on the number of sites.

3.  **Other Options**:
    - ✅ Auto-refresh when opening the plugin
    - ✅ Display health status

::: warning Note
Too short a refresh interval may lead to frequent requests; it is recommended not to be less than 60 seconds.
:::

## 📱 Mobile Usage

### How to use on mobile phones?

The plugin supports usage on mobile devices:

**Android Devices**:
1.  Install [Kiwi Browser](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser) (Recommended)
    - Perfectly compatible with Chrome extensions
    - Supports all features

2.  Or install Firefox for Android
    - Install from Firefox Add-ons

**iOS Devices**:
- Not supported yet (iOS restrictions)

### Mobile Usage Recommendations

1.  **Use sidebar mode**: More suitable for mobile screens.
2.  **Enable auto-refresh**: Avoid frequent manual refreshes.
3.  **Configure WebDAV sync**: Synchronize data between computer and phone.

## 🔒 Data Security

### Where is the data stored?

-   **Local Storage**: All data is stored in the browser's local storage.
-   **Completely Offline**: Core plugin functionality does not require an internet connection.
-   **No Data Upload**: No data is uploaded to any third-party servers.

### Can data be lost?

It is recommended to back up data regularly:

1.  **JSON Export**:
    - Go to "Settings" → "Data Management"
    - Click "Export Data"
    - Save the JSON file

2.  **WebDAV Sync** (Recommended):
    - Automatically back up to the cloud.
    - Supports multi-device synchronization.

## 🆘 Other Issues

### What is site duplication detection?

When adding a site, the plugin automatically detects if the same site already exists:
- Based on the site URL.
- If it already exists, it will prompt and allow quick modification.
- Avoids adding the same site repeatedly.

### What does 'Health Status' mean?

Health status indicates the availability of the account:

| Status | Icon | Meaning |
|--------|------|---------|
| 🟢 Normal | Healthy | Account is operating normally |
| 🟡 Warning | Warning | Insufficient balance or requires attention |
| 🔴 Error | Error | API call failed or account is abnormal |
| ⚪ Unknown | Unknown | Not yet detected or unable to retrieve status |

### Does the plugin consume data?

-   Only accesses site API when refreshing account data.
-   Very small request volume (approximately a few KB per site).
-   It is recommended to use auto-refresh in a WiFi environment.

### How to contribute code?

Pull Requests are welcome:
1.  Fork the project repository.
2.  Create a feature branch.
3.  Commit your code.
4.  Submit a Pull Request.

For details, see: [CONTRIBUTING.md](https://github.com/qixing-jk/all-api-hub/blob/main/CONTRIBUTING.md)

---

## 📚 Related Documentation

- [Usage Tutorial](./get-started.md)
- [GitHub Repository](https://github.com/qixing-jk/all-api-hub)
- [Issue Feedback](https://github.com/qixing-jk/all-api-hub/issues)
- [Changelog](https://github.com/qixing-jk/all-api-hub/blob/main/CHANGELOG.md)

::: tip Can't find an answer?
If the above content does not solve your problem, feel free to ask in [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::