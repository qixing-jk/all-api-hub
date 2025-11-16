# Frequently Asked Questions

A collection of common issues encountered when using the plugin.

## 🔐 Authentication Methods

### What is the difference between Cookie mode and Access Token method?

The plugin supports two authentication methods:

| Authentication Method | Features | Applicable Scenarios | Recommendation Level |
|-----------------------|----------|----------------------|----------------------|
| **Access Token**      | ✅ Supports multiple accounts<br>✅ Permanently valid, does not expire<br>✅ More secure and stable | Most standard relay sites | ⭐⭐⭐⭐⭐ Highly Recommended |
| **Cookie**            | ⚠️ Single account<br>⚠️ May expire<br>✅ Good compatibility | Special sites with Token restrictions<br>Modified sites | ⭐⭐⭐ Use in special cases |

**Access Token method is recommended**, unless you encounter the following situations:
- The site does not support Access Tokens.
- Using a modified version of the relay site.
- Token functionality is disabled.

### How to switch authentication methods?

When adding an account, select the corresponding authentication method in the account dialog:
1. Click "Add Account"
2. Enter the site address
3. Select `Access Token` or `Cookie` from the "Authentication Method" dropdown
4. Click "Auto-identify"

## 🔧 Special Site Issues

### What to do if the AnyRouter website reports an error?

AnyRouter is a modified relay site and does not support the standard Access Token method.

**Solution**:
1. When adding an account, select **Cookie mode**.
2. First, log in to the AnyRouter site in your browser.
3. Then, use the plugin's auto-identify function to add the account.

::: warning Note
Because AnyRouter has modified the API, some features may not function correctly. If you encounter issues, it is recommended to contact the site administrator.
:::

### What to do if auto-identification fails?

If auto-identification fails, you can try the following methods:

1.  **Switch authentication method**: Try switching from Access Token to Cookie mode.
2.  **Add manually**: If auto-identification fails, manually fill in the following information:
    *   Username
    *   User ID
    *   Access Token
    *   Recharge Ratio
3.  **Check login status**: Ensure you are logged in to the target site in your browser.
4.  **Check site compatibility**: Confirm whether the site is based on supported projects (see below).

### Which sites might be incompatible?

If a site has undergone deep secondary development and modified critical interfaces (e.g., `/api/user`), the plugin may not function correctly.

Common incompatibility scenarios:
- Modified user information interface.
- Disabled Access Token functionality.
- Customized authentication methods.
- Modified API response format.

## 🐛 Features and Bugs

### What to do if you encounter feature issues or bugs?

1.  **Check Issues**: Go to [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues) to search for similar problems.
2.  **Use the latest version**:
    *   Store versions update slower; it is recommended to use the GitHub Release version.
    *   Or directly use the development version from the `main` branch.

### How to get the latest version?

The plugin is released on multiple platforms, with varying update speeds:

| Platform | Update Speed | Get Version |
|----------|--------------|-------------|
| **GitHub Releases** | ⚡ Fastest | [Go to Download](https://github.com/qixing-jk/all-api-hub/releases) |
| **Chrome Web Store** | 🐌 Slower (3-5 days review) | [Go to Install](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| **Edge Add-ons** | 🐌 Slower (2-3 days review) | [Go to Install](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| **Firefox Add-ons** | ⚡ Fast (several hours review) | [Go to Install](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |

::: tip Recommendation
If you encounter a fixed bug, it is recommended to download the latest version from GitHub Releases and install it manually.
:::

## ⚙️ Feature Usage Issues

### How to use WebDAV backup?

WebDAV backup can help you synchronize data across multiple devices:

1.  **Configure WebDAV**:
    *   Open "Settings" → "WebDAV Backup"
    *   Fill in the WebDAV server address (full URL)
    *   Fill in username and password
2.  **Select sync strategy**:
    *   `Merge` (recommended): Intelligently merge local and remote data.
    *   `Upload Only`: Only upload local data to the server.
    *   `Download Only`: Only download data from the server.
3.  **Enable auto-sync**:
    *   Check "Enable Auto-Sync"
    *   Set sync interval (default 3600 seconds/1 hour)

::: tip Recommended Services
- [Jianguoyun](https://www.jianguoyun.com/) (Fast access in China)
- Nextcloud (Self-hosted)
- Synology NAS
:::

### How to export to CherryStudio / New API?

The quick export feature allows you to import site configurations to other platforms with one click:

**Configuration Steps**:

1.  **For New API**:
    *   Open "Settings" → "Basic Settings"
    *   Configure the New API server address
    *   Fill in the Admin Token
    *   Fill in the User ID
2.  **For CherryStudio**:
    *   No additional configuration required.
    *   Ensure CherryStudio is running.

**Export Process**:

1. Go to the "Key Management" page.
2. Find the site you want to export.
3. Click the action menu.
4. Select "Export to CherryStudio" or "Export to New API".

::: info Smart Detection
When exporting to New API, the plugin will automatically detect if the same Channel already exists to avoid duplicate additions.
:::

### How to use the site check-in feature?

Some relay sites support daily check-ins to earn rewards:

1.  **Enable check-in detection**:
    *   Edit account
    *   Check "Enable Check-in Detection"
2.  **Custom check-in URL** (optional):
    *   If the site's check-in page is not a standard path
    *   You can fill in "Custom Check-in URL"
    *   Fill in "Custom Recharge URL" (optional)
3.  **Perform check-in**:
    *   Accounts requiring check-in will display a check-in icon.
    *   Click the check-in button on the account card.
    *   The check-in page will open automatically.

### How to customize account sorting?

The plugin supports setting priorities for various sorting methods:

1.  **Go to sorting settings**:
    *   Open "Settings" → "Sort Priority Settings"
2.  **Adjust priority**:
    *   Drag sorting conditions to adjust priority.
    *   Check/uncheck to enable/disable conditions.
3.  **Available sorting conditions**:
    *   📌 Current site pinned to top
    *   🏥 Health status sorting (Error > Warning > Unknown > Normal)
    *   ✅ Accounts requiring check-in pinned to top
    *   🔗 Accounts with custom check-in URL pinned to top
    *   📊 User-defined field sorting (Balance/Consumption/Name)

### How to set up auto-refresh?

Auto-refresh keeps account data up-to-date:

1.  **Enable auto-refresh**:
    *   Open "Settings" → "Auto-Refresh"
    *   Check "Enable Scheduled Auto-Refresh"
2.  **Set refresh interval**:
    *   Default: 360 seconds (6 minutes)
    *   Minimum: 60 seconds (1 minute)
    *   Adjust based on the number of sites.
3.  **Other options**:
    *   ✅ Auto-refresh when opening the plugin
    *   ✅ Display health status

::: warning Note
A refresh interval that is too short may lead to frequent requests. It is recommended to set it to no less than 60 seconds.
:::

## 📱 Mobile Usage

### How to use on mobile?

The plugin supports use on mobile devices:

**Android Devices**:
1.  Install [Kiwi Browser](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser) (recommended)
    *   Perfectly compatible with Chrome extensions
    *   Supports all features
2.  Or install Firefox for Android
    *   Install from Firefox Add-ons

**iOS Devices**:
- Not currently supported (iOS limitations)

### Mobile Usage Recommendations

1.  **Use sidebar mode**: More suitable for mobile screens.
2.  **Enable auto-refresh**: Avoid frequent manual refreshes.
3.  **Configure WebDAV sync**: Synchronize data between computer and mobile.

## 🔒 Data Security

### Where is the data stored?

-   **Local storage**: All data is saved in the browser's local storage.
-   **Completely offline**: The plugin's core functions do not require internet connection.
-   **No data upload**: No data will be uploaded to any third-party servers.

### Can data be lost?

It is recommended to back up data regularly:

1.  **JSON Export**:
    *   Go to "Settings" → "Data Management"
    *   Click "Export Data"
    *   Save the JSON file.
2.  **WebDAV Sync** (recommended):
    *   Automatic backup to the cloud.
    *   Supports multi-device synchronization.

## 🆘 Other Issues

### What is site duplication detection?

When adding a site, the plugin automatically detects if the same site already exists:
-   Judges based on the site URL.
-   If it already exists, it will prompt and allow quick modification.
-   Avoids adding the same site repeatedly.

### What does "Health Status" mean?

Health status indicates the availability of an account:

| Status | Icon | Meaning |
|--------|------|---------|
| 🟢 Normal | Healthy | Account is operating normally |
| 🟡 Warning | Warning | Insufficient balance or requires attention |
| 🔴 Error | Error | API call failed or account is abnormal |
| ⚪ Unknown | Unknown | Not yet detected or status cannot be retrieved |

### Does the plugin consume data?

-   Only accesses site APIs when refreshing account data.
-   The request volume is very small (approximately a few KB per site).
-   It is recommended to use auto-refresh in a WiFi environment.

### How to contribute code?

Pull Requests are welcome:
1.  Fork the project repository.
2.  Create a feature branch.
3.  Commit your code.
4.  Submit a Pull Request.

See also: [CONTRIBUTING.md](https://github.com/qixing-jk/all-api-hub/blob/main/CONTRIBUTING.md)

---

## 📚 Related Documentation

- [Usage Tutorial](./get-started.md)
- [GitHub Repository](https://github.com/qixing-jk/all-api-hub)
- [Issue Feedback](https://github.com/qixing-jk/all-api-hub/issues)
- [Changelog](https://github.com/qixing-jk/all-api-hub/blob/main/CHANGELOG.md)

::: tip Can't find an answer?
If the above content does not solve your problem, feel free to ask on [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::