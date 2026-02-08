# Frequently Asked Questions

A collection of common issues encountered when using the plugin.

## 🔐 Authentication Methods

### What is the difference between Cookie mode and Access Token method?

The plugin supports two authentication methods:

| Authentication Method | Features | Applicable Scenarios | Recommendation Level |
|---|---|---|---|
| **Access Token** | ✅ Supports multiple accounts<br>✅ Permanently valid, does not expire<br>✅ More secure and stable | Most standard relay sites | ⭐⭐⭐⭐⭐ Highly Recommended |
| **Cookie** | ⚠️ Single account<br>⚠️ May expire<br>✅ Good compatibility | Special sites with Token restrictions<br>Modified sites | ⭐⭐⭐ Use in special cases |

**It is recommended to use the Access Token method**, unless you encounter the following situations:
- The site does not support access tokens
- Using a modified version of the relay station
- Token functionality is disabled

### How to switch authentication methods?

When adding an account, select the corresponding authentication method in the account dialog:
1. Click "Add Account"
2. Enter the site address
3. Select `Access Token` or `Cookie` from the "Authentication Method" dropdown
4. Click "Auto-identify"

## 🔧 Special Site Issues

<a id="anyrouter-error"></a>
### What to do if AnyRouter website reports an error?

AnyRouter is a modified relay station and does not support the standard Access Token method.

**Solution**:
1. When adding an account, select **Cookie mode**
2. First, log in to the AnyRouter site in your browser
3. Then use the plugin's auto-identify function to add the account

::: warning Note
Because AnyRouter has modified the API, some functions may not work properly. If you encounter problems, it is recommended to contact the site administrator.
:::

### How to add Sub2API (JWT Site)?

Common features of Sub2API sites: the console interface is at `/api/v1/*`, and it uses a **short-term JWT** (`auth_token`) + **refresh token (which rotates)** login state. The console writes login information to localStorage:

- `auth_token`: JWT access token (short-term)
- `auth_user`: User information (including `id`, etc.)
- `refresh_token`: Refresh token (optional; used to refresh access token, and usually rotates)
- `token_expires_at`: Access token expiration timestamp (milliseconds, optional)

The plugin supports two operating modes:

#### Mode One: Console Session Mode (Default/Compatible)

In this mode, the `refresh_token` is not saved in the plugin. The plugin needs to read `auth_token` / `auth_user` from the console's localStorage to auto-identify and refresh the balance. Therefore, **you must first log in to the site console in your browser**.

**Adding Steps**:
1. Open the target site console in your browser and log in (ensure you are not redirected back to the login page).
2. Open the plugin → Add Account.
3. Enter the site URL and click "Auto-identify".

**Notes and Limitations**:
- For the same site (same origin), localStorage can only have one set of login states in a browser session. Therefore, in this mode, **the multi-account experience for the same site is very poor**: switching console accounts will overwrite localStorage, and the plugin will also "switch users" accordingly.
- If refresh results in 401, the plugin will try to re-read `auth_token` and retry once; if it still fails, please re-log in to the site console before refreshing/re-identifying.

#### Mode Two: Plugin-Managed Session (Multi-Account, Recommended)

When enabled, the plugin saves the `refresh_token` as an **account-private** credential (and will be included with export/WebDAV backups), allowing each Sub2API account to independently refresh JWTs, supporting **multi-account for the same site**.

**Recommended Import Process (Incognito/Private Window, to reduce rotation conflicts)**:
1. Open an incognito/private window and log in to the target Sub2API console.
2. In the plugin, add/edit an account, click "Import from current logged-in account" (or "Auto-identify/Re-identify") to import session information.
3. In the form, enable "Plugin-managed session (multi-account)" and confirm that the `refresh_token` has been brought in, then save.
4. Close the incognito/private window (to clear the site's localStorage/cookies), to avoid the console and plugin from concurrently refreshing the same `refresh_token` causing mutual invalidation.

**Security Reminder**:
- `refresh_token` is a long-term credential; after enabling this mode, it will be saved with account export/WebDAV backups. Please keep your backup files and WebDAV credentials safe.
- If the browser requires it, please enable "Allow in incognito/private window" in extension management.

**Troubleshooting**:
- If a message indicates that `refresh_token` is invalid/rotated, please re-import according to the above process (or manually paste the new `refresh_token`) and retry.

**Other Known Limitations**:
- Only supports **Access Token (JWT)** mode, does not support Cookie authentication.
- Does not currently support site check-in functionality (check-in detection will be automatically closed).
- The current version mainly synchronizes **balance/quota**; statistics such as "today's usage/income" may be 0.

### What to do if auto-identification fails?

If auto-identification fails, you can try the following methods:

1. **Switch authentication method**: Try switching from Access Token to Cookie mode
2. **Manual addition**: If auto-identification fails, manually fill in the following information:
   - Username
   - User ID
   - Access Token
   - Recharge Ratio
3. **Check login status**: Ensure you are logged in to the target site in your browser
4. **Check site compatibility**: Confirm whether the site is based on a supported project (see below)

### Which sites might not be compatible?

If a site has undergone deep secondary development and modified key interfaces (such as `/api/user`), the plugin may not work properly.

Common incompatibility situations:
- Modified user information interface
- Disabled access token functionality
- Customized authentication methods
- Modified API response format

## 🐛 Features and Bugs

### What to do if I encounter a functional issue or bug?

1. **Search Issues**: Go to [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues) to search for similar issues
2. **Use the latest version**:
   - Store versions update slowly, it is recommended to use the GitHub Release version
   - Or directly use the development version from the `main` branch

### How to get the latest version?

The plugin is published on multiple platforms, with varying update speeds:

| Platform | Update Speed | Version Acquisition |
|---|---|---|
| **GitHub Releases** | ⚡ Fastest | [Download Here](https://github.com/qixing-jk/all-api-hub/releases) |
| **Chrome Web Store** | 🐌 Slower (3-5 days review) | [Install Here](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| **Edge Add-ons** | 🐌 Slower (3-5 days review) | [Install Here](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| **Firefox Add-ons** | ⚡ Fast (a few hours review) | [Install Here](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |

::: tip Recommendation
If you encounter a bug that has been fixed, it is recommended to download the latest version from GitHub Releases and install it manually.
:::

## ⚙️ Feature Usage Issues

### How to use WebDAV backup?

WebDAV backup can help you synchronize data across multiple devices:

1. **Configure WebDAV**:
   - Open "Settings" → "WebDAV Backup"
   - Fill in the WebDAV server address (full URL)
   - Fill in username and password

2. **Select synchronization strategy**:
   - `Merge` (recommended): Intelligently merge local and remote data
   - `Upload only`: Only upload local data to the server
   - `Download only`: Only download data from the server

3. **Enable auto-synchronization**:
   - Check "Enable auto-synchronization"
   - Set the synchronization interval (default 3600 seconds/1 hour)

::: tip Recommended Services
- [Jianguoyun (Nutstore)](https://www.jianguoyun.com/) (Fast access in China)
- Nextcloud (Self-hosted)
- Synology NAS
:::

### How to export to CherryStudio / New API?

The quick export function allows one-click import of site configurations to other platforms:

**Configuration Steps**:

1. **For New API**:
   - Open "Settings" → "Basic Settings"
   - Configure the New API server address
   - Fill in the Admin Token
   - Fill in the User ID

2. **For CherryStudio**:
   - No additional configuration required
   - Ensure CherryStudio is running

**Export Process**:

1. Go to the "Key Management" page
2. Find the site to be exported
3. Click the operation menu
4. Select "Export to CherryStudio" or "Export to New API"

::: info Smart Detection
When exporting to New API, the plugin will automatically detect if the same channel already exists to avoid duplicate additions.
:::

For more complete export and integration instructions, please refer to [Quick Export Site Configuration](./quick-export.md); if you wish to integrate with the CLIProxyAPI management interface, please refer to [CLIProxyAPI Integration](./cliproxyapi-integration.md).

### How to use the site check-in feature?

Some relay stations support daily check-ins to receive rewards:

1. **Enable check-in detection**:
   - Edit account
   - Check "Enable check-in detection"

2. **Custom check-in URL** (optional):
   - If the site check-in page is not a standard path
   - You can fill in "Custom check-in URL"
   - Fill in "Custom recharge URL" (optional)

3. **Perform check-in**:
   - Accounts requiring check-in will display a check-in icon
   - Click the check-in button on the account card
   - The check-in page will automatically open

### How to customize account sorting?

The plugin supports setting priorities for various sorting methods:

1. **Enter sorting settings**:
   - Open "Settings" → "Sorting Priority Settings"

2. **Adjust priority**:
   - Drag sorting conditions to adjust priority
   - Check/uncheck to enable/disable conditions

3. **Available sorting conditions**:
   - 📌 Current site pinned to top
   - 🏥 Health status sorting (Error > Warning > Unknown > Normal)
   - ✅ Accounts needing check-in pinned to top
   - 🔗 Accounts with custom check-in URL pinned to top
   - 📊 User-defined field sorting (Balance/Consumption/Income/Name)

For detailed meanings and example configurations of each sorting rule, please refer to [Sorting Priority Settings](./sorting-priority.md).

### How to set up automatic refresh?

Automatic refresh keeps account data up-to-date:

1. **Enable automatic refresh**:
   - Open "Settings" → "Automatic Refresh"
   - Check "Enable timed automatic refresh"

2. **Set refresh interval**:
   - Default: 360 seconds (6 minutes)
   - Minimum: 60 seconds (1 minute)
   - Adjust based on the number of sites

3. **Other options**:
   - ✅ Auto-refresh when opening the plugin
   - ✅ Display health status

::: warning Note
A refresh interval that is too short may lead to frequent requests. It is recommended to be no less than 60 seconds.
:::

### How to use Balance History?

Balance history is used to view account balance changes and daily income/expense trends over the long term. When enabled, it records **daily aggregated snapshots** locally and displays them in charts.

**Recorded content (maximum one entry per account per day)**:

- Balance/Quota: `quota`
- Today's income: `today_income` (from recharge/system log statistics)
- Today's expense: `today_quota_consumption` (from consumption log statistics)
- Record time: `capturedAt`
- Source: `source` (refresh / end-of-day capture)

**Recording methods**:

1. **Refresh driven**: After a successful account refresh, the current day's snapshot is updated. This process **follows** the "Show today's income/expense" switch and will not force additional log retrieval specifically for balance history.
2. **End-of-day capture (optional)**: When enabled, a background capture will be performed once every day around `23:55`, and will **force inclusion of today's income/expense** to fill in as much income/expense data for the day as possible.

**Prerequisites (Important)**:

- If "Show today's income/expense" is turned off, the income/expense fields driven by refresh will be empty.
- If you wish to record income/expense history, please enable any of the following:
  - "Show today's income/expense" (calculates today's income/expense during refresh)
  - "End-of-day capture" (forces a daily retrieval of today's income/expense)

**Limitations and Notes**:

- **Best-effort**: Browser sleep, network interruptions, or site restrictions may cause some days to be missing, and the chart will show breaks/blanks.
- **No historical backfill**: Historical logs will not be re-queried to fill in past dates (to avoid generating a large number of network requests).
- **Retention and cleanup**: Only the most recent N days (default 365 days) are retained. Snapshots outside the window are automatically cleaned up during writing; you can also manually execute "Clean up" on the page.
- **Local storage**: Balance history is only stored locally (the current version does not migrate with import/export / WebDAV synchronization).

## 📱 Mobile Usage

### How to use on mobile phones?

The plugin supports use on mobile devices:

**Android Devices**:
1. Install [Kiwi Browser](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser) (recommended)
   - Perfect compatibility with Chrome extensions
   - Supports all features

2. Or install Firefox for Android
   - Install from Firefox Add-ons

**iOS Devices**:
- Not currently supported (iOS restrictions)

### Mobile Usage Recommendations

1. **Use sidebar mode**: More suitable for mobile screens
2. **Enable automatic refresh**: Avoid frequent manual refreshes
3. **Configure WebDAV synchronization**: Synchronize data between computer and phone

## 🔒 Data Security

### Where is the data stored?

- **Local storage**: All data is stored in the browser's local storage
- **Completely offline**: The core functionality of the plugin does not require internet
- **No data upload**: No data is uploaded to any third-party servers

### Will data be lost?

It is recommended to back up data regularly:

1. **JSON Export**:
   - Go to "Settings" → "Data and Backup"
   - Click "Export Data"
   - Save the JSON file

2. **WebDAV Synchronization** (recommended):
   - Automatic backup to the cloud
   - Supports multi-device synchronization

## 🆘 Other Issues

### What is site duplication detection?

When adding a site, the plugin automatically detects if the same site already exists:
- Based on the site URL
- If it already exists, it will prompt and allow quick modification
- Avoids adding duplicate sites

### What does "Health Status" mean?

Health status indicates account availability:

| Status | Icon | Meaning |
|---|---|---|
| 🟢 Normal | Healthy | Account is operating normally |
| 🟡 Warning | Warning | Low balance or needs attention |
| 🔴 Error | Error | API call failed or account anomaly |
| ⚪ Unknown | Unknown | Not yet detected or status cannot be obtained |

### Does the plugin consume traffic?

- Only accesses the site API when refreshing account data
- Very small request volume (approx. a few KB per site)
- It is recommended to use automatic refresh in a WiFi environment

### How to contribute code?

Pull requests are welcome:
1. Fork the project repository
2. Create a feature branch
3. Commit your code
4. Submit a Pull Request

See: [CONTRIBUTING.md](https://github.com/qixing-jk/all-api-hub/blob/main/CONTRIBUTING.md)

---

## 📚 Related Documentation

- [User Guide](./get-started.md)
- [GitHub Repository](https://github.com/qixing-jk/all-api-hub)
- [Issue Feedback](https://github.com/qixing-jk/all-api-hub/issues)
- [Changelog](./changelog.md)

::: tip Can't find an answer?
If the above content does not solve your problem, feel free to ask in [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::