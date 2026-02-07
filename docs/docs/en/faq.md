# Frequently Asked Questions

A collection of common issues encountered when using the plugin.

## 🔐 Authentication Methods

### What is the difference between Cookie mode and Access Token mode?

The plugin supports two authentication methods:

| Authentication Method | Features | Applicable Scenarios | Recommendation Level |
|-----------------------|----------|----------------------|----------------------|
| **Access Token**      | ✅ Supports multiple accounts<br>✅ Permanently valid, does not expire<br>✅ More secure and stable | Most standard relay sites | ⭐⭐⭐⭐⭐ Highly Recommended |
| **Cookie**            | ⚠️ Single account<br>⚠️ May expire<br>✅ Good compatibility | Special sites with Token restrictions<br>Modified sites | ⭐⭐⭐ Use in special cases |

**Access Token mode is recommended**, unless you encounter the following situations:
- The site does not support access tokens.
- Using a modified version of the relay station.
- Token functionality is disabled.

### How to switch authentication methods?

When adding an account, select the corresponding authentication method in the account dialog:
1. Click "Add Account".
2. Enter the site address.
3. Select `Access Token` or `Cookie` from the "Authentication Method" dropdown.
4. Click "Auto-detect".

## 🔧 Special Site Issues

<a id="anyrouter-error"></a>
### What to do if AnyRouter website reports an error?

AnyRouter is a modified relay station that does not support the standard Access Token method.

**Solution**:
1. When adding an account, select **Cookie mode**.
2. First, log in to the AnyRouter site in your browser.
3. Then, use the plugin's auto-detect function to add the account.

::: warning Note
Because AnyRouter has modified the API, some functions may not work correctly. If you encounter issues, it is recommended to contact the site administrator.
:::

### How to add Sub2API (JWT Site)?

Common characteristics of Sub2API sites: console interface at `/api/v1/*`, and uses **short-term JWT** (`auth_token`) + **refresh token (which rotates)** for login status. The console writes login information to localStorage:

- `auth_token`: JWT access token (short-term)
- `auth_user`: User information (including `id`, etc.)
- `refresh_token`: Refresh token (optional; used to refresh access token, and usually rotates)
- `token_expires_at`: Access token expiration timestamp (milliseconds, optional)

The plugin supports two working modes:

#### Mode 1: Console Session Mode (Default/Compatible)

In this mode, the plugin does not save the `refresh_token`. The plugin needs to read `auth_token` / `auth_user` from the console's localStorage to auto-detect and refresh the quota. Therefore, **you must first log in to the site console in your browser**.

**Steps to add**:
1. Open the target site console in your browser and log in (ensure you are not redirected back to the login page).
2. Open the plugin → Add Account.
3. Enter the site URL and click "Auto-detect".

**Notes and Limitations**:
- For the same site (same origin) in a browser session, localStorage can only hold one set of login credentials. Therefore, **the multi-account experience for the same site is poor** in this mode: switching console accounts will overwrite localStorage, and the plugin will also "switch users".
- If a 401 error occurs during refresh, the plugin will try to re-read `auth_token` and retry once; if it still fails, please log in to the site console again before refreshing/re-detecting.

#### Mode 2: Plugin-Managed Session (Multi-account, Recommended)

When enabled, the plugin saves the `refresh_token` as an **account-private** credential (and will follow export/WebDAV backup), allowing each Sub2API account to independently refresh JWTs, supporting **multiple accounts for the same site**.

**Recommended import process (incognito/private window, to reduce rotation conflicts)**:
1. Open an incognito/private window and log in to the target Sub2API console.
2. In the plugin, add/edit an account, click "Import from current logged-in account" (or "Auto-detect/Re-detect") to import session information.
3. In the form, enable "Plugin-managed session (multi-account)" and confirm that `refresh_token` has been brought in, then save.
4. Close the incognito/private window (clear the site's localStorage/cookies) to avoid the console and plugin simultaneously refreshing the same `refresh_token`, leading to mutual invalidation.

**Security Reminder**:
- `refresh_token` is a long-term credential; when this mode is enabled, it will be saved with account exports/WebDAV backups. Please keep backup files and WebDAV credentials secure.
- If required by the browser, enable "Allow in incognito/private window" in extension management.

**Troubleshooting**:
- If `refresh_token` is reported as invalid/rotated, please re-import using the process above (or manually paste the new `refresh_token`) and retry.

**Other Known Limitations**:
- Only supports **Access Token (JWT)** mode, does not support Cookie authentication.
- Does not currently support site check-in functionality (check-in detection will be automatically disabled).
- The current version mainly synchronizes **balance/quota**; statistics like "Today's usage/revenue" might be 0.

### What to do if auto-detection fails?

If auto-detection fails, you can try the following methods:

1.  **Switch authentication method**: Try switching from Access Token to Cookie mode.
2.  **Manual addition**: If auto-detection fails, manually fill in the following information:
    - Username
    - User ID
    - Access Token
    - Recharge Ratio
3.  **Check login status**: Ensure you are logged in to the target site in your browser.
4.  **Check site compatibility**: Confirm whether the site is based on supported projects (see below).

### Which sites might be incompatible?

If a site has undergone deep secondary development and modified key interfaces (e.g., `/api/user`), the plugin may not function correctly.

Common incompatibility situations:
- Modified user information interface.
- Disabled access token functionality.
- Customized authentication methods.
- Modified API response format.

## 🐛 Features and Bugs

### What to do if I encounter feature issues or bugs?

1.  **Search Issues**: Go to [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues) to search if there are similar issues.
2.  **Use the latest version**:
    - Store versions update slowly; it is recommended to use the GitHub Release version.
    - Or directly use the development version from the main branch.

### How to get the latest version?

The plugin is released on multiple platforms, with varying update speeds:

| Platform               | Update Speed          | Version Acquisition |
|------------------------|-----------------------|---------------------|
| **GitHub Releases**    | ⚡ Fastest             | [Go to download](https://github.com/qixing-jk/all-api-hub/releases) |
| **Chrome Web Store**   | 🐌 Slower (3-5 days review) | [Go to install](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| **Edge Add-ons**       | 🐌 Slower (3-5 days review) | [Go to install](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| **Firefox Add-ons**    | ⚡ Fast (a few hours review) | [Go to install](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |

::: tip Recommendation
If you encounter a bug that has been fixed, it is recommended to download the latest version from GitHub Releases and install it manually.
:::

## ⚙️ Feature Usage Issues

### How to use WebDAV backup?

WebDAV backup can help you synchronize data across multiple devices:

1.  **Configure WebDAV**:
    - Open "Settings" → "WebDAV Backup"
    - Fill in the WebDAV server address (full URL)
    - Fill in username and password

2.  **Select synchronization strategy**:
    - `Merge` (recommended): Intelligently merge local and remote data.
    - `Upload only`: Only upload local data to the server.
    - `Download only`: Only download data from the server.

3.  **Enable automatic synchronization**:
    - Check "Enable automatic synchronization"
    - Set synchronization interval (default 3600 seconds / 1 hour)

::: tip Recommended Services
- [Jianguoyun](https://www.jianguoyun.com/) (fast access in China)
- Nextcloud (self-hosted)
- Synology NAS
:::

### How to export to CherryStudio / New API?

The quick export feature allows you to import site configurations to other platforms with one click:

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

1. Go to the "Key Management" page.
2. Find the site you want to export.
3. Click the action menu.
4. Select "Export to CherryStudio" or "Export to New API".

::: info Smart Detection
When exporting to New API, the plugin will automatically detect if the same channel already exists to avoid duplicate additions.
:::

For more complete export and integration instructions, please refer to [Quick Export Site Configuration](./quick-export.md); if you want to integrate with the CLIProxyAPI management interface, please refer to [CLIProxyAPI Integration](./cliproxyapi-integration.md).

### How to use the site check-in feature?

Some relay stations support daily check-ins to get rewards:

1.  **Enable check-in detection**:
    - Edit account
    - Check "Enable check-in detection"

2.  **Custom check-in URL** (optional):
    - If the site check-in page is not a standard path
    - You can fill in "Custom Check-in URL"
    - Fill in "Custom Recharge URL" (optional)

3.  **Perform check-in**:
    - Accounts that need to check in will display a check-in icon.
    - Click the check-in button on the account card.
    - The check-in page will open automatically.

### How to customize account sorting?

The plugin supports setting priority for multiple sorting methods:

1.  **Enter sorting settings**:
    - Open "Settings" → "Sorting Priority Settings"

2.  **Adjust priority**:
    - Drag sorting conditions to adjust priority.
    - Check/uncheck to enable/disable conditions.

3.  **Available sorting conditions**:
    - 📌 Pin current site to top
    - 🏥 Health status sorting (Error > Warning > Unknown > Normal)
    - ✅ Accounts requiring check-in to top
    - 🔗 Accounts with custom check-in URL to top
    - 📊 User-defined field sorting (Balance/Consumption/Revenue/Name)

For detailed meanings and example configurations of each sorting rule, please refer to [Sorting Priority Settings](./sorting-priority.md).

### How to set up automatic refresh?

Automatic refresh keeps account data up-to-date:

1.  **Enable automatic refresh**:
    - Open "Settings" → "Auto Refresh"
    - Check "Enable timed auto refresh"

2.  **Set refresh interval**:
    - Default: 360 seconds (6 minutes)
    - Minimum: 60 seconds (1 minute)
    - Adjust based on the number of sites.

3.  **Other options**:
    - ✅ Auto-refresh when plugin is opened
    - ✅ Display health status

::: warning Note
Too short a refresh interval may lead to frequent requests. It is recommended to be no less than 60 seconds.
:::

## 📱 Mobile Usage

### How to use on mobile phones?

The plugin supports use on mobile devices:

**Android Devices**:
1. Install [Kiwi Browser](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser) (recommended)
   - Perfectly compatible with Chrome extensions
   - Supports all features

2. Or install Firefox for Android
   - Install from Firefox Add-ons

**iOS Devices**:
- Not currently supported (iOS limitations)

### Mobile Usage Recommendations

1.  **Use sidebar mode**: More suitable for phone screens.
2.  **Enable auto-refresh**: Avoid frequent manual refreshes.
3.  **Configure WebDAV sync**: Synchronize data between computer and phone.

## 🔒 Data Security

### Where is the data stored?

- **Local storage**: All data is saved in the browser's local storage.
- **Completely offline**: The plugin's core functions do not require an internet connection.
- **No data upload**: No data is uploaded to any third-party servers.

### Will data be lost?

It is recommended to back up data regularly:

1.  **JSON Export**:
    - Go to "Settings" → "Data & Backup"
    - Click "Export Data"
    - Save the JSON file

2.  **WebDAV Sync** (recommended):
    - Automatic cloud backup
    - Supports multi-device synchronization

## 🆘 Other Issues

### What is site duplicate detection?

When adding a site, the plugin automatically detects if the same site already exists:
- Based on the site URL.
- If it already exists, it will prompt and allow quick modification.
- Avoids adding the same site repeatedly.

### What does health status mean?

Health status indicates the availability of the account:

| Status    | Icon    | Meaning |
|-----------|---------|---------|
| 🟢 Normal  | Healthy | Account is operating normally |
| 🟡 Warning | Warning | Insufficient balance or needs attention |
| 🔴 Error   | Error   | API call failed or account is abnormal |
| ⚪ Unknown | Unknown | Not yet detected or status cannot be obtained |

### Does the plugin consume traffic?

- Only accesses site APIs when refreshing account data.
- Request volume is very small (about a few KB per site).
- It is recommended to use auto-refresh in a WiFi environment.

### How to contribute code?

Pull Requests are welcome:
1. Fork the project repository.
2. Create a feature branch.
3. Commit your code.
4. Submit a Pull Request.

See: [CONTRIBUTING.md](https://github.com/qixing-jk/all-api-hub/blob/main/CONTRIBUTING.md)

---

## 📚 Related Documentation

- [Getting Started](./get-started.md)
- [GitHub Repository](https://github.com/qixing-jk/all-api-hub)
- [Issue Feedback](https://github.com/qixing-jk/all-api-hub/issues)
- [Changelog](./changelog.md)

::: tip Can't find an answer?
If the above content does not solve your problem, feel free to ask on [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::