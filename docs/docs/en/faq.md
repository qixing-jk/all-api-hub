# Frequently Asked Questions

A collection of common issues encountered when using the plugin.

## 🔐 Authentication Related

### What is the difference between Cookie mode and Access Token mode?

The plugin supports two authentication methods:

| Authentication Method | Features                                                              | Applicable Scenarios                               | Recommendation Level |
|-----------------------|-----------------------------------------------------------------------|----------------------------------------------------|----------------------|
| **Access Token**      | ✅ Supports multiple accounts<br>✅ Permanent, does not expire<br>✅ More secure and stable | Most standard proxy sites                          | ⭐⭐⭐⭐⭐ Highly Recommended |
| **Cookie**            | ⚠️ Single account<br>⚠️ May expire<br>✅ Good compatibility              | Special sites with token restrictions<br>Modified sites | ⭐⭐⭐ Use in special circumstances |

**It is recommended to use the Access Token method**, unless you encounter the following situations:
- The site does not support access tokens.
- Using a modified version of the proxy site.
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

AnyRouter is a modified proxy site and does not support the standard Access Token method.

**Solution**:
1. When adding an account, select **Cookie Mode**.
2. Log in to the AnyRouter site in your browser first.
3. Then use the plugin's auto-detection feature to add the account.

::: warning Note
Because AnyRouter has modified the API, some features may not work correctly. If you encounter problems, it is recommended to contact the site administrator.
:::

### How to add Sub2API sites?

Common characteristics of Sub2API sites: the console interface is at `/api/v1/*`, and uses **short-term JWT** (`auth_token`) + **refresh token (rotates)** for login status. The console writes login information to localStorage:

- `auth_token`: JWT access token (short-term)
- `auth_user`: User information (including `id`, etc.)
- `refresh_token`: Refresh token (optional; used to refresh access token, and usually rotates)
- `token_expires_at`: Access token expiration timestamp (milliseconds, optional)

The plugin supports two working modes:

#### Mode 1: Console Session Mode (Default/Compatible)

This mode does not save the `refresh_token` within the plugin. The plugin needs to read `auth_token` / `auth_user` from the console's localStorage to automatically detect and refresh the balance. Therefore, **you must log in to the site's console in your browser first**.

**Adding Steps**:
1. Open the target site's console in your browser and log in (ensure you are not redirected back to the login page).
2. Open the plugin → Add Account.
3. Enter the site URL and click "Auto-detect".

**Notes and Limitations**:
- The same site (same origin) can only have one set of login credentials in localStorage within a browser session. Therefore, the experience for **multiple accounts on the same site is poor** in this mode: switching console accounts will overwrite localStorage, and the plugin will follow suit.
- If a refresh results in a 401 error, the plugin will attempt to re-read `auth_token` and retry once. If it still fails, please log in to the site console again before refreshing/re-detecting.

#### Mode 2: Plugin Hosted Session (Multi-Account, Recommended)

When enabled, the plugin saves the `refresh_token` as an **account-private** credential (and it will be included in exports/WebDAV backups), allowing each Sub2API account to refresh its JWT independently, supporting **multiple accounts on the same site**.

**Recommended Import Process (Incognito/Private Window, Reduce Rotation Conflicts)**:
1. Open an incognito/private window and log in to the target Sub2API console.
2. In the plugin, add/edit an account and click "Import from Current Logged-in Account" (or "Auto-detect/Re-detect") to import session information.
3. In the form, enable "Plugin Hosted Session (Multi-Account)" and confirm that the `refresh_token` has been included, then save.
4. Close the incognito/private window (clearing localStorage/cookies for this site) to prevent the console and plugin from refreshing the same `refresh_token` concurrently, causing mutual invalidation.

**Security Reminder**:
- `refresh_token` is a long-term credential. After enabling this mode, it will be saved along with account exports/WebDAV backups. Please keep your backup files and WebDAV credentials secure.
- If your browser requires it, enable "Allow running in incognito mode" in the extension management settings.

**Troubleshooting**:
- If you receive a message indicating that the `refresh_token` is invalid/has rotated, please re-import according to the process above (or manually paste the new `refresh_token`) and try again.

**Other Known Limitations**:
- Only supports **Access Token (JWT)** mode, not Cookie authentication.
- Does not currently support site check-in functionality (check-in detection will be automatically disabled).
- The current version primarily synchronizes **balance/quota**; statistics like "Today's Usage/Income" may be 0.

### What to do if auto-detection fails?

If auto-detection fails, you can try the following methods:

1. **Switch Authentication Method**: Try switching from Access Token to Cookie mode.
2. **Manual Addition**: After auto-detection fails, manually fill in the following information:
   - Username
   - User ID
   - Access Token
   - Top-up Ratio
3. **Check Login Status**: Ensure you are logged into the target site in your browser.
4. **Check Site Compatibility**: Confirm if the site is based on a supported project (see below).

### Which sites might be incompatible?

If a site has undergone deep secondary development and modified critical interfaces (e.g., `/api/user`), the plugin may not work correctly.

Common incompatibility scenarios:
- Modified user information interface.
- Disabled access token functionality.
- Custom authentication methods.
- Modified API response format.

## 🐛 Feature and Bug Related

### What to do if I encounter functional issues or bugs?

1. **Check Issues**: Go to [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues) to search for similar problems.
2. **Use the Latest Version**:
   - Store versions are updated slowly; it is recommended to use the GitHub Release version.
   - Or use the development version from the main branch directly.

### How to get the latest version?

The plugin is released on multiple platforms, with varying update speeds:

| Platform             | Update Speed                               | Version Acquisition                                                              |
|----------------------|--------------------------------------------|----------------------------------------------------------------------------------|
| **GitHub Releases**  | ⚡ Fastest                                  | [Download Here](https://github.com/qixing-jk/all-api-hub/releases)               |
| **Chrome Web Store** | 🐌 Slower (3-5 days review)                | [Install Here](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| **Edge Add-ons**     | 🐌 Slower (3-5 days review)                | [Install Here](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| **Firefox Add-ons**  | ⚡ Fast (a few hours review)                | [Install Here](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |

::: tip Recommendation
If you encounter a bug that has been fixed, it is recommended to download the latest version from GitHub Releases and install it manually. For browsers like QQ Browser, 360 Series Browsers, Cheetah Browser, Brave, Vivaldi, Opera, etc., please refer to the [QQ / 360 and Other Browser Installation Guide](./other-browser-install.md).
:::

## ⚙️ Feature Usage Issues

### How to use WebDAV backup?

WebDAV backup can help you synchronize data across multiple devices:

1. **Configure WebDAV**:
   - Go to "Settings" → "WebDAV Backup".
   - Enter the WebDAV server address (full URL).
   - Enter your username and password.

2. **Select Synchronization Strategy**:
   - `Merge` (Recommended): Intelligently merges local and remote data.
   - `Upload Only`: Uploads only local data to the server.
   - `Download Only`: Downloads only data from the server.

3. **Enable Automatic Synchronization**:
   - Check "Enable Automatic Synchronization".
   - Set the synchronization interval (default 3600 seconds / 1 hour).

::: tip Recommended Services
- [JianGuoYun](https://www.jianguoyun.com/) (Fast access in China)
- Nextcloud (Self-hosted)
- Synology NAS (Synology)
:::

### How to export to CherryStudio / New API?

The quick export feature allows you to import site configurations into other platforms with one click:

**Configuration Steps**:

1. **For New API**:
   - Go to "Settings" → "Basic Settings".
   - Configure the New API server address.
   - Enter the Admin Token.
   - Enter the User ID.

2. **For CherryStudio**:
   - No additional configuration required.
   - Ensure CherryStudio is running.

**Export Process**:

1. Navigate to the "Key Management" page.
2. Find the site to export.
3. Click the action menu.
4. Select "Export to CherryStudio" or "Export to New API".

::: info Smart Detection
When exporting to New API, the plugin will automatically detect if a similar channel already exists to avoid duplicate additions.
:::

For more comprehensive export and integration instructions, please refer to [Quick Export Site Configuration](./quick-export.md); for integrating with the CLIProxyAPI management interface, please refer to [CLIProxyAPI Integration](./cliproxyapi-integration.md).

### How to use the site check-in feature?

Some proxy sites support daily check-ins for rewards:

1. **Enable Check-in Detection**:
   - Edit Account.
   - Check "Enable Check-in Detection".

2. **Customize Check-in URL** (Optional):
   - If the site's check-in page is not at the standard path.
   - You can enter a "Custom Check-in URL".
   - Enter a "Custom Top-up URL" (Optional).

3. **Perform Check-in**:
   - Accounts that need to check in will display a check-in icon.
   - Click the check-in button on the account card.
   - The check-in page will open automatically.

### How to customize account sorting?

The plugin supports priority settings for multiple sorting methods:

1. **Enter Sorting Settings**:
   - Go to "Settings" → "Sorting Priority Settings".

2. **Adjust Priority**:
   - Drag sorting conditions to adjust priority.
   - Check/uncheck to enable/disable conditions.

3. **Available Sorting Conditions**:
   - 📌 Pin Current Site to Top
   - 🏥 Health Status Sorting (Error > Warning > Unknown > Healthy)
   - ✅ Pin Accounts Needing Check-in to Top
   - 🔗 Pin Accounts with Custom Check-in URL to Top
   - 📊 User-defined Field Sorting (Balance/Consumption/Income/Name)

For detailed explanations and example configurations of each sorting rule, please refer to [Sorting Priority Settings](./sorting-priority.md).

### How to set up automatic refresh?

Automatic refresh keeps your account data up-to-date:

1. **Enable Automatic Refresh**:
   - Go to "Settings" → "Automatic Refresh".
   - Check "Enable Timed Automatic Refresh".

2. **Set Refresh Interval**:
   - Default: 360 seconds (6 minutes).
   - Minimum: 60 seconds (1 minute).
   - Adjust based on the number of sites.

3. **Other Options**:
   - ✅ Auto-refresh on plugin startup.
   - ✅ Display health status.

::: warning Note
An excessively short refresh interval may lead to frequent requests. It is recommended to set it to no less than 60 seconds.
:::

### How to use Balance History?

Balance History is used to view account balance changes and daily income/expenditure trends over the long term. When enabled, it records **daily aggregated snapshots** locally and displays them in a chart.

**Recorded Content (at most one entry per account per day)**:

- Balance/Quota: `quota`
- Today's Income: `today_income` (from top-ups/system log statistics)
- Today's Consumption: `today_quota_consumption` (from consumption log statistics)
- Capture Time: `capturedAt`
- Source: `source` (Refresh / End-of-day Fetch)

**Recording Method**:

1. **Refresh Driven**: After a successful account refresh, the daily snapshot is updated. This process **follows** the "Display Today's Income/Expenses" switch and does not force an extra log fetch solely for balance history.
2. **End-of-Day Fetch (Optional)**: When enabled, a background fetch will occur daily around `23:55`, **mandatorily including today's income/expenses** to try and complete the data for the current day.

**Prerequisites (Important)**:

- If "Display Today's Income/Expenses" is turned off, the income/expenses fields in the refresh-driven process will be empty.
- If you wish to record income/expenses history, please enable either of the following:
  - "Display Today's Income/Expenses" (calculates today's income/expenses during refresh).
  - "End-of-Day Fetch" (fetches today's income/expenses once daily).

**Limitations and Notes**:

- **Best-effort**: Browser sleep, network interruptions, or site restrictions may cause certain days to be missing. The chart will show gaps/blanks.
- **No Historical Backfill**: Historical logs will not be retroactively queried to fill in past dates (to avoid generating a large number of network requests).
- **Retention and Cleanup**: Only the last N days (default 365 days) are retained. Snapshots exceeding the window are automatically cleaned up upon writing; you can also manually perform "Cleanup" on the page.
- **Local Storage**: Balance history is stored only locally (it is not migrated with imports/exports / WebDAV synchronization in the current version).

## 📱 Mobile Usage

<a id="mobile-browser-support"></a>

### How to use it on a mobile phone?

The plugin supports use in mobile browsers such as mobile `Edge`, `Firefox for Android`, `Kiwi`, etc. Actual usability depends on the browser's support for extension capabilities.

If you are using QQ Browser, 360 Series Browsers, Cheetah Browser, or other desktop browsers that support Chrome extensions, please refer to the [QQ / 360 and Other Browser Installation Guide](./other-browser-install.md).

### Mobile Usage Recommendations

1. **Disable Automatic Refresh**: Mobile devices have limited resources. It is recommended to disable automatic refresh and use manual refresh instead. Also, due to the anti-bot helper, refreshing will create a temporary tab, affecting the daily user experience.
2. **Adjust Anti-Bot Helper Settings**: If the site frequently triggers anti-bot measures, you can adjust the trigger conditions in "Settings" → "Anti-Bot Helper", such as increasing the trigger threshold or disabling certain trigger conditions, to reduce the frequency of anti-bot pop-ups.
3. **Configure WebDAV Synchronization**: Synchronize data between your computer and phone.

## 🛠️ Advanced & Developer Tools

### What is the Mesh Gradient Debugging Tool?

The **Mesh Gradient Debugging Tool** is a built-in developer tool primarily used for debugging and previewing the dynamic backgrounds used in the [Share Snapshot](./share-snapshot.md) feature.

- **Functionality**: You can manually adjust the Seed, Palette Index, and Layout Index to preview visual effects under different combinations in real-time.
- **How to Access**: Enter the extension's options page URL in the browser address bar and append the `#mesh-gradient-lab` anchor (e.g., `chrome-extension://<id>/options.html#mesh-gradient-lab`).

::: info Note
This tool is primarily intended for developers or advanced users interested in visual customization. Ordinary users do not need to worry about it for daily use.
:::

## 🔒 Data Security

### Where is the data stored?

- **Local Storage**: All data is stored in the browser's local storage.
- **Completely Offline**: The core functionality of the plugin does not require an internet connection.
- **No Data Upload**: Data is not uploaded to any third-party servers.

### Will the data be lost?

It is recommended to back up your data regularly:

1. **JSON Export**:
   - Go to "Settings" → "Data & Backup".
   - Click "Export Data".
   - Save the JSON file.

2. **WebDAV Synchronization** (Recommended):
   - Automatic backup to the cloud.
   - Supports multi-device synchronization.

## 🆘 Other Issues

### What is site duplicate detection?

When adding a site, the plugin automatically detects if the same site already exists:
- Determined based on the site URL.
- If it already exists, a prompt will appear, allowing for quick modification.
- Prevents duplicate additions of the same site.

### What does health status mean?

Health status indicates the availability of an account:

| Status  | Icon | Meaning                                      |
|---------|------|----------------------------------------------|
| 🟢 Healthy | Healthy | Account is operating normally.               |
| 🟡 Warning | Warning | Insufficient balance or requires attention. |
| 🔴 Error  | Error | API call failed or account is abnormal.      |
| ⚪ Unknown | Unknown | Not yet detected or status cannot be obtained. |

### Does the plugin consume traffic?

- It only accesses site APIs when refreshing account data.
- The request volume is very small (about a few KB per site).
- It is recommended to use automatic refresh in a WiFi environment.

### How to contribute code?

Pull Requests are welcome:
1. Fork the project repository.
2. Create a feature branch.
3. Commit your code.
4. Submit a Pull Request.

See details: [CONTRIBUTING.md](https://github.com/qixing-jk/all-api-hub/blob/main/CONTRIBUTING.md)

---

## 📚 Related Documentation

- [Tutorial](./get-started.md)
- [QQ / 360 and Other Browser Installation Guide](./other-browser-install.md)
- [GitHub Repository](https://github.com/qixing-jk/all-api-hub)
- [Feedback](https://github.com/qixing-jk/all-api-hub/issues)
- [Changelog](./changelog.md)

::: tip Can't find an answer?
If the above content does not resolve your issue, please feel free to ask on [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::