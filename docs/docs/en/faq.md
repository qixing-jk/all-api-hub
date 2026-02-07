# Frequently Asked Questions

A collection of common issues encountered while using the plugin.

## 🔐 Authentication Methods

### What is the difference between Cookie Mode and Access Token Method?

The plugin supports two authentication methods:

| Authentication Method | Features | Applicable Scenarios | Recommendation Level |
|---------|------|---------|---------|
| **Access Token** | ✅ Supports multiple accounts<br>✅ Permanently valid, does not expire<br>✅ More secure and stable | Most standard relay sites | ⭐⭐⭐⭐⭐ Highly Recommended |
| **Cookie** | ⚠️ Single account<br>⚠️ May expire<br>✅ Good compatibility | Special sites where Token is restricted<br>Modified sites | ⭐⭐⭐ Use in special cases |

**It is recommended to use the Access Token method**, unless you encounter the following situations:
- The site does not support access tokens
- Using a modified version of the relay site
- Token functionality is disabled

### How to switch the authentication method?

When adding an account, select the corresponding authentication method in the account dialog:
1. Click "Add New Account"
2. Enter the site URL
3. Select `Access Token` or `Cookie` in the "Authentication Method" dropdown menu
4. Click "Auto-Detect"

## 🔧 Special Site Issues

<a id="anyrouter-error"></a>
### What should I do if the AnyRouter website reports an error?

AnyRouter is a modified relay site and does not support the standard Access Token method.

**Solution**:
1. When adding an account, select **Cookie Mode**
2. Log in to the AnyRouter site in your browser first
3. Then use the plugin's auto-detection feature to add the account

::: warning Note
Because AnyRouter has modified the API, some features may not work correctly. If you encounter issues, it is recommended to contact the site administrator.
:::

### How to add Sub2API (JWT Sites)?

Sub2API sites (common features: console interface at `/api/v1/*`, and uses JWT login status) require reading login information (`auth_token` / `auth_user`) from the site console's localStorage. Therefore, **you must first log in to the site console in your browser** before auto-detection and balance refresh can work.

**Adding Steps**:
1. Open the target site console in your browser and log in (ensure you are not redirected back to the login page).
2. Open the plugin → Add New Account.
3. Enter the site URL and click "Auto-Detect".

**Known Limitations**:
- Only supports **Access Token (JWT)** mode; Cookie authentication is not supported.
- Site check-in functionality is not currently supported (check-in detection will be automatically disabled).
- The current version primarily synchronizes **balance/quota**; statistics like "Today's Usage/Revenue" may show 0.
- If refreshing results in a 401 error, the plugin will attempt to re-read the `auth_token` and retry once; if it still fails, please log in to the site console again before refreshing/re-detecting.

### What if auto-detection fails?

If auto-detection fails, you can try the following methods:

1. **Switch Authentication Method**: Try switching from Access Token to Cookie Mode
2. **Manual Addition**: If auto-detection fails, manually fill in the following information:
   - Username
   - User ID
   - Access Token
   - Recharge Ratio
3. **Check Login Status**: Ensure you are logged in to the target site in your browser
4. **Check Site Compatibility**: Confirm whether the site is based on supported projects (see below)

### Which sites might be incompatible?

If the site has undergone deep secondary development and modified key interfaces (such as `/api/user`), the plugin may not function correctly.

Common incompatibility situations:
- Modified user information interface
- Disabled Access Token functionality
- Customized authentication methods
- Modified API response format

## 🐛 Features and Bugs

### What should I do if I encounter a feature issue or a bug?

1. **Check Issues**: Go to [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues) to search if the same issue exists
2. **Use the latest version**:
   - Store versions update slowly; it is recommended to use the GitHub Release version
   - Or use the development version directly from the main branch

### How to get the latest version?

The plugin is released on multiple platforms, and update speeds vary:

| Platform | Update Speed | Get Version |
|------|---------------|---------|
| **GitHub Releases** | ⚡ Fastest | [Go to download](https://github.com/qixing-jk/all-api-hub/releases) |
| **Chrome Web Store** | 🐌 Slower (3-5 days review) | [Go to install](https://chromewebstore.google.com/detail/lapnciffpekdengooeolaienkeoilfeo) |
| **Edge Add-ons** | 🐌 Slower (3-5 days review) | [Go to install](https://microsoftedge.microsoft.com/addons/detail/pcokpjaffghgipcgjhapgdpeddlhblaa) |
| **Firefox Add-ons** | ⚡ Fast (a few hours review) | [Go to install](https://addons.mozilla.org/firefox/addon/{bc73541a-133d-4b50-b261-36ea20df0d24}) |

::: tip Recommendation
If you encounter a bug that has already been fixed, it is recommended to download the latest version from GitHub Releases and install it manually.
:::

## ⚙️ Feature Usage Issues

### How to use WebDAV backup?

WebDAV backup helps you synchronize data across multiple devices:

1. **Configure WebDAV**:
   - Open "Settings" → "WebDAV Backup"
   - Fill in the WebDAV server address (full URL)
   - Fill in the username and password
   
2. **Select Synchronization Policy**:
   - `Merge` (Recommended): Intelligently merge local and remote data
   - `Upload Only`: Only upload local data to the server
   - `Download Only`: Only download data from the server

3. **Enable Auto Sync**:
   - Check "Enable Automatic Synchronization"
   - Set the synchronization interval (default 3600 seconds/1 hour)

::: tip Recommended Services
- [Jianguoyun](https://www.jianguoyun.com/) (Fast access in China)
- Nextcloud (Self-hosted)
- Synology NAS
:::

### How to export to CherryStudio / New API?

The quick export feature allows you to import site configurations to other platforms with one click:

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
2. Find the site you want to export
3. Click the operation menu
4. Select "Export to CherryStudio" or "Export to New API"

::: info Intelligent Detection
When exporting to New API, the plugin automatically detects if the same Channel already exists to avoid duplication.
:::

For more complete export and integration instructions, please refer to [Quickly Exporting Site Configuration](./quick-export.md); if you wish to integrate with the CLIProxyAPI management interface, please refer to [CLIProxyAPI Integration](./cliproxyapi-integration.md).

### How to use the site check-in feature?

Some relay sites support daily check-ins to receive rewards:

1. **Enable Check-in Detection**:
   - Edit the account
   - Check "Enable Check-in Detection"
   
2. **Custom Check-in URL** (Optional):
   - If the site's check-in page is not a standard path
   - You can fill in the "Custom Check-in URL"
   - Fill in the "Custom Recharge URL" (Optional)

3. **Perform Check-in**:
   - Accounts requiring check-in will display a check-in icon
   - Click the check-in button on the account card
   - The check-in page will open automatically

### How to customize account sorting?

The plugin supports setting priorities for multiple sorting methods:

1. **Enter Sorting Settings**:
   - Open "Settings" → "Sorting Priority Settings"
   
2. **Adjust Priority**:
   - Drag the sorting conditions to adjust priority
   - Check/uncheck to enable/disable conditions
   
3. **Available Sorting Conditions**:
   - 📌 Pin current site to top
   - 🏥 Health status sorting (Error > Warning > Unknown > Normal)
   - ✅ Pin accounts requiring check-in to top
   - 🔗 Pin accounts with custom check-in URL to top
   - 📊 User custom field sorting (Balance/Consumption/Revenue/Name)

For detailed meanings and example configurations of each sorting rule, please refer to [Sorting Priority Settings](./sorting-priority.md).

### How to set up automatic refresh?

Automatic refresh keeps account data up-to-date:

1. **Enable Automatic Refresh**:
   - Open "Settings" → "Automatic Refresh"
   - Check "Enable scheduled automatic refresh"
   
2. **Set Refresh Interval**:
   - Default: 360 seconds (6 minutes)
   - Minimum: 60 seconds (1 minute)
   - Adjust based on the number of sites
   
3. **Other Options**:
   - ✅ Automatically refresh when the plugin is opened
   - ✅ Display health status

::: warning Note
A refresh interval that is too short may lead to frequent requests. It is recommended not to set it below 60 seconds.
:::

## 📱 Mobile Usage

### How to use it on mobile phones?

The plugin supports usage on mobile devices:

**Android Devices**:
1. Install [Kiwi Browser](https://play.google.com/store/apps/details?id=com.kiwibrowser.browser) (Recommended)
   - Perfectly compatible with Chrome extensions
   - Supports all features
   
2. Or install Firefox for Android
   - Install from Firefox Add-ons

**iOS Devices**:
- Not currently supported (iOS restrictions)

### Mobile Usage Recommendations

1. **Use sidebar mode**: Better suited for mobile screens
2. **Enable automatic refresh**: Avoid frequent manual refreshing
3. **Configure WebDAV synchronization**: Synchronize data between computer and mobile phone

## 🔒 Data Security

### Where is the data stored?

- **Local Storage**: All data is saved in the browser's local storage
- **Completely Offline**: The core functionality of the plugin does not require internet access
- **No Data Upload**: Data is not uploaded to any third-party server

### Can data be lost?

It is recommended to back up data regularly:

1. **JSON Export**:
   - Go to "Settings" → "Data and Backup"
   - Click "Export Data"
   - Save the JSON file

2. **WebDAV Synchronization** (Recommended):
   - Automatic backup to the cloud
   - Supports multi-device synchronization

## 🆘 Other Issues

### What is site duplication detection?

When adding a site, the plugin automatically detects if the same site already exists:
- Judgment based on site URL
- If it already exists, you will be prompted and allowed to modify it quickly
- Avoids adding the same site repeatedly

### What does Health Status mean?

Health status indicates the availability of the account:

| Status | Icon | Meaning |
|------|------|------|
| 🟢 Normal | Healthy | Account is operating normally |
| 🟡 Warning | Warning | Insufficient balance or needs attention |
| 🔴 Error | Error | API call failed or account is abnormal |
| ⚪ Unknown | Unknown | Not yet detected or status cannot be retrieved |

### Does the plugin consume data traffic?

- Only accesses the site API when refreshing account data
- The request volume is very small (about a few KB per site)
- It is recommended to use automatic refresh in a Wi-Fi environment

### How to contribute code?

Pull Requests are welcome:
1. Fork the project repository
2. Create a feature branch
3. Commit code
4. Submit a Pull Request

See details: [CONTRIBUTING.md](https://github.com/qixing-jk/all-api-hub/blob/main/CONTRIBUTING.md)

---

## 📚 Related Documentation

- [User Guide](./get-started.md)
- [GitHub Repository](https://github.com/qixing-jk/all-api-hub)
- [Issue Feedback](https://github.com/qixing-jk/all-api-hub/issues)
- [Changelog](./changelog.md)

::: tip Can't find the answer?
If the content above did not resolve your issue, feel free to ask on [GitHub Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::