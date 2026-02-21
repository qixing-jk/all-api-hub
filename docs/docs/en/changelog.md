# Changelog

This page records the main updates for general users (feature changes / experience optimizations / bug fixes). For the complete history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip New User Guide
- **How to confirm your current version**: Open the extension popup, the version number will be displayed in the title bar; you can also check it on the settings page.
- **How to stop automatically opening this page**: You can control whether to "Automatically open changelog after update" in "Settings → General → Changelog".
- **Troubleshooting**: You can enable console logs in "Settings → General → Logs" and report reproducible steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.22.0
- **New Features:**
  - Model List: Added "Model Corresponding Key" tool (key icon) to check if the current model has an available key. If no key is available, you can create a default key with one click based on the model's available groups, or enter the custom creation process, with support for one-click key copying.
  - Share Snapshot: Supports one-click sharing of "Overview Snapshot / Account Snapshot". It prioritizes copying the image to the clipboard, and automatically downloads a PNG if not supported. Snapshots only contain shareable information (will not include sensitive fields like `API Key`) and support one-click copying of the title and accompanying text.
- **Experience Optimizations:**
  - Disabled Accounts: Disabled accounts will be automatically skipped in refresh and scheduled tasks such as "Balance History / Usage Analysis / Usage Sync", reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed an issue where the spinner was not visible when a button was in a "loading" state and simultaneously displayed a left-side icon.

**Location Hints:**
- Model Corresponding Key: In "Settings → Model List", click the key icon to the right of the model name (`Model Corresponding Key`).
- Share Overview Snapshot: In the button to the right of the title bar on the overview page of the extension popup (`Share Overview Snapshot`).
- Share Account Snapshot: In the operation menu for a single account in "Settings → Account Management" (`Share Account Snapshot`).

## 3.21.0
- **New Features:**
  - API Credentials: Added "API Credentials" page, suitable for "no account, only `Base URL` + `API Key`" scenarios. Supports unified management of tags/remarks, and allows direct availability verification and quick export (e.g., Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added multi-account view (Overview / Account Distribution / Trends), and provides a unified "Account Summary" table for quick comparison and statistical aggregation.
  - Self-Hosted Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for use in "Channel Management", "Model Sync", and other functions.
- **Experience Optimizations:**
  - Context Menu: "Redemption Assistant" and "AI API Detection" entries can be individually enabled/disabled and will take effect immediately after switching.
  - Copy Key: When an account has no key, the popup provides an entry for "Quickly Create Default Key / Create Custom Key", reducing back-and-forth navigation.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Done Hub`, and fill in "Done Hub Integration Settings".
- Context Menu Entry Switch: In "Settings → Basic Settings → Sign-in & Redemption / AI API Testing", under their respective "Show in Browser Context Menu" options.
- Copy Key Popup: Opened by clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown option when adding a new key now displays both the Group ID and description, facilitating quick differentiation and selection among multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" is now disabled. If you wish to automatically generate a default key after adding an account, please enable it manually in the settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add Key", and view in the group dropdown option.
- Auto-Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Hosted Site Management: Added `Octopus` hosted site support, allowing connection to the Octopus backend and importing account API keys as channels in "Channel Management", with support for fetching available model lists.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default), and provides a one-click "Ensure at least one key" option to automatically complete default keys for accounts missing them.
  - AI API Testing: "Model List Probing" for interface verification supports OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and other interface types, and will provide suggested available model IDs, reducing manual model guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account identification logic to improve stability in scenarios with multiple accounts on the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-related interfaces to reduce errors caused by frequent refreshes or triggering site rate limits.
  - Channel Management: When creating a channel, performs more precise duplicate detection and provides confirmation prompts to avoid accidental creation of duplicate routes.
- **Bug Fixes:**
  - Deactivated Accounts: Deactivated accounts are now automatically filtered out from relevant dropdowns/lists in Key Management, preventing invalid operations.
  - Language: Fixed an issue where the extension's language setting might affect the webpage's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Auto-Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Complete Default Key: In "Settings → Key Management", at the top right, "Ensure at least one key".
- AI API Testing Entry: Right-click menu "Quickly Test AI API Functionality Availability".

## 3.18.0
- **New Features:**
  - Balance History: Charts now include a "Currency Unit" switch (`USD` / `CNY`), and currency symbols are displayed on axes/tooltips. When `CNY` is selected, it will be converted based on the account's "Recharge Amount Ratio", making it easier to view trends and reconcile by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are too many tag/account options, it defaults to "Expand to display", making browsing and selection more intuitive.
  - Tabs: Added left and right scroll buttons to the "Settings" group tabs and "Model List" vendor tabs, making switching more convenient in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Auto-detection" is more accurate, fixing issues with unknown site types that appeared frequently in recent versions.

**Location Hints:**
- Balance History Currency Unit: In "Settings → Balance History", in the filter area, "Currency Unit".
- Account Exchange Rate (Recharge Amount Ratio): In "Settings → Account Management", in the add/edit account form, "Recharge Amount Ratio".

## 3.17.0
- **New Features:**
  - Balance History: Added "Balance History" feature (disabled by default), which records daily balance and income/expense snapshots, and displays trends in charts. Supports filtering by tags/accounts and time range, and provides convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added a setting to control whether to enable it, the number of days to retain, and "End-of-Day Fetch". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-Day Fetch", the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar in small/narrow screens.
- **Bug Fixes:**
  - Import/Export: Fixed an issue with the responsive display of the export area on some screen sizes.
  - Popups: Fixed a layout anomaly where the scrollbar position in popups was incorrect.

**Location Hints:**
- Balance History Switch/Retention Days/End-of-Day Fetch: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Site): Added Sub2API site type, supporting balance/quota queries. Supports reading login status from the console via "Auto-detection". Also supports the "Plugin Hosted Session (Multiple Accounts, Recommended)" mode, which allows independent authentication renewal for each account, improving the experience for multiple accounts on the same site.
  - Display Settings: Added a "Show Today's Income/Expenses" switch (enabled by default), which can hide and stop fetching statistics like "Today's Consumption/Income", reducing log fetching requests during refreshes.
- **Notes:**
  - Sub2API currently does not support site sign-in / today's usage / income, and only provides basic balance/quota queries. Related features will be gradually improved based on site capabilities.
  - "Plugin Hosted Session (Multiple Accounts)" saves `refresh_token` as private account credentials, which will be included in exports/WebDAV backups. Please keep backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Addition/Mode Explanation: In "Settings → Account Management", add/edit account, select Sub2API as the site type; for more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved the stability of background Service Workers, reducing the issue of asynchronous scheduled tasks (WebDAV auto-sync / Usage Sync / Model Sync / Auto Sign-in, etc.) being missed due to early termination of the background process. Automatically resumes related scheduled tasks after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" to save quick links to site consoles/documentation/management pages without needing to create a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now has an "Account / Bookmark" switch. Bookmark data will be included in backups/restores and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests to reduce unnecessary network calls (some sites already return `today_income` in their refresh interface).
  - Auto Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is 30 seconds. After updating, old configurations will be automatically corrected to a valid range, and related prompts and documentation have been improved.

::: warning Important: Auto-refresh configuration will be forcibly adjusted
Feedback indicates that **overly short auto-refresh intervals can easily trigger site rate limits and place excessive load on sites**.

v3.15.0 **has forcibly modified the auto-refresh configuration**:
- Auto-refresh and refresh on plugin open features have been turned off. If you still need them, you must re-enable them manually.
- The minimum `Refresh Interval` is 60 seconds, and the `Minimum Refresh Interval Protection` is 30 seconds. If your settings before upgrading were below these thresholds, they will be automatically increased to the minimum values after upgrading. If your previously set values are within the new legal range, they will not be affected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; you can switch between "Account / Bookmark" at the top of the popup.
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly Test AI API Functionality Availability" to open the test panel directly on the current webpage. Supports filling in/pasting `Base URL` and `API Key`, and performs basic capability probing for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible also supports one-click model list fetching).
  - (Optional) Auto-Detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist. When available `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear first. The test panel will only open after confirmation (disabled by default, and keys are not saved).
  - Auto Sign-in: The execution results list now includes more troubleshooting hints—including suggestions and documentation links for common exceptions like "Temporary shield bypass tab manually closed" and "Access Token invalid".
- **Bug Fixes:**
  - WebDAV: Auto-sync has been migrated from timers to the browser Alarms API, reducing the probability of missed syncs due to background sleep/power saving policies.

**Location Hints:**
- AI API Test Panel: Right-click menu on any webpage, select "Quickly Test AI API Functionality Availability"; auto-detection related settings are in "Settings → AI API Test".
- Auto Sign-in Hints: View in the execution results list in "Settings → Auto Sign-in".

## 3.13.0
- **New Features:**
  - Account Management: Added "Sign-in Status Expired" prompt—when the "Signed in today / Not signed in today" status is not detected for the current day, an orange warning icon will be displayed. Clicking it will refresh the account data with one click, avoiding misleading information from old statuses.
  - Interface: Multi-select controls have been upgraded to more compact selectors (space-saving, support search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and sign-in logic, improving usability.
  - Cookie Authentication: Removed the Cookie caching mechanism, reducing issues caused by still reading old values after Cookie updates.

**Location Hints:**
- Sign-in Status Expired Prompt: In "Settings → Account Management", in the account list, next to the sign-in icon for site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code"—generates `providerProfiles` configuration for Kilo Code / Roo Code, supporting copying `apiConfigs` snippets or downloading `settings.json` for import (imports are incremental and will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by long text like site names, now truncated automatically.
  - Dropdown Selectors: Improved empty state prompts and fixed overflow issues with long option text.

**Location Hints:**
- Export to Kilo Code: In "Settings → Key Management", in the key list, click the Kilo Code icon in the top right corner of a key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder—when a duplicate/similar channel is detected, a warning dialog box will pop up, allowing you to choose to continue creation or cancel (no longer blocking creation with error toasts).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by long text like site names, now truncated automatically.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will open within the current incognito window (to maintain incognito login state).
  - Account Management: Disabled accounts also support clicking site links, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, the chart and list prioritize displaying the site name (instead of the username) for more intuitive information.
  - Shield Bypass Assistant: The temporary shield bypass window now supports CAP (cap.js) Pow verification, improving pass rates.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Toast Notifications: Fixed Toaster layering issues, preventing notifications from being obscured by webpages.

**Location Hints:**
- Site Link: In "Settings → Account Management", click the site name in the account list.
- Shield Bypass Assistant: Refer to [Cloudflare Shield Bypass Assistant](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added "Manual Balance (USD)" field to accounts—when the site cannot automatically fetch balance/quota, you can manually fill this in for display and statistics.
  - Account Management: Added "Exclude from Total Balance" switch to accounts—used to remove specific accounts from the "Total Balance" statistics (does not affect refresh/sign-in functions).
  - Settings: Added "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Auto Sign-in: Refreshes relevant data and synchronizes the interface after execution.

**Location Hints:**
- Add/Edit Account: Open add/edit account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added a "Usage Analysis" page to help you visualize usage trends across multiple sites and accounts, allowing you to quickly see "where usage/spending is high / where it's slowing down", facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (raw logs are not saved). Supports setting retention days, automatic sync methods, and minimum sync intervals, and view sync results and error prompts for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage" to enable "Usage History Sync", set as needed, and click "Sync Now".
  - Then, view charts in the left-side menu "Usage Analysis"; click "Export" when you need to retain or reconcile data.

## 3.7.0
- **New Features:**
  - Sorting: Account list supports sorting by "Income"; sorting priority now includes "Disabled accounts at the bottom", so deactivated/invalid accounts no longer interfere with your daily use.
  - Auto Sign-in: Added "Trigger today's sign-in early when opening the interface"—when opening the popup/sidebar/settings page within the time window, it will automatically attempt to run today's sign-in early, without waiting for the scheduled time.
- **Bug Fixes:**
  - Auto Sign-in: Each account will only execute once per day; retries are only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Auto Sign-in Early Trigger/Retry: Configure in the left-side menu "Auto Sign-in".

## 3.6.0
- **New Features:**
  - Account Management: Supports enabling/disabling accounts with one click. After disabling, various functions will skip the account, making it easy to retain data after an account becomes invalid.
  - Tags: Added global tag management, and optimized related interfaces and interactions accordingly, making it easier to classify and manage accounts.
  - Popup: Displays the current version number in the title bar and provides a direct entry to this changelog.
  - Quick Export: CCSwitch export supports selecting upstream models, making export configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to avoid display inconsistencies due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Sign-in" switch (moved above the custom sign-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from the dialog title icon for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Auto-detection: Added "Slow Detection" prompts and links to relevant documentation to help users troubleshoot and resolve issues.
  - Batch Opening External Sign-ins: Supports opening all in new windows, making batch closing easier and reducing interference.
- **Bug Fixes:**
  - Batch Opening External Sign-ins: Refactored the process to execute in the background service, ensuring correct opening of all sites in popup scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to directly select upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always have the `sk-` prefix, avoiding recognition/copying issues due to inconsistent formats.

## 3.3.0
- **New Features:**
  - Auto Sign-in: Added "Username" information to account identification, making it easier to distinguish accounts in multi-account scenarios.
  - External Sign-in: Supports batch triggering of external sign-ins, reducing the number of individual operations.
  - Auto Refresh: The minimum refresh interval no longer has a maximum limit, allowing larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce false triggers in non-copying scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying prompts, reducing invalid redemption notifications.
  - Storage: Added write locks to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text related to "Copy Model Name".

## 3.2.0
- **New Features:**
  - "Model List" page now includes "Interface Availability Detection" (Beta) for quickly confirming if the current key is available for a specified model (e.g., text generation, tool/function calling, structured output (returning by JSON structure), web search (Grounding), etc.).
  - "Model List" page now includes "CLI Tool Compatibility Detection" (Beta), simulating tool call flows for Claude Code / Codex CLI / Gemini CLI to assess interface compatibility in these tools.
  - "About" page now includes "Rate and Download": Automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entry points for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating problem diagnosis.
  - In sidebar mode, the "Open in Sidebar" button will no longer be displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce failures in obtaining Cookies due to insufficient permissions.

## 3.1.0
- **New Features:**
  - In self-managed API settings, added guidance for administrator credentials.
  - Redemption Assistant now supports batch redemption and single-code retry.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing each account to coexist normally and all functions to be available. This is mainly for sites with only cookie authentication methods like AnyRouter.
  - Supports setting proxy and model, as well as model alias lists when exporting CLIProxyAPI.
  - Separated site sign-in and custom sign-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed an incorrect web page jump path for manual sign-in on New-API sites.

## 2.39.0
- Automatically detects and modifies the sign-in support status of account sites during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Directly select specific redemption accounts using the up/down arrow keys.
  - Press Enter to confirm redemption.
- Added prompts to temporary shield bypass tabs, indicating that the current tab originates from this plugin and its purpose.
- Improved shield bypass window display: single window with multiple tabs, meaning requests within a short period will reuse the same window, minimizing interference.
- Supports sign-in status detection and automatic sign-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added support for more lenient redemption code format detection options, correctly identifying redemption codes and popping up the Redemption Assistant when encountering custom formats.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific channels for management.
- Fixed an issue that would reset the channel model sync time.

## 2.35.1
- Fixed an issue that would reset the auto sign-in execution time.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to prompt for redemption when any potential redemption code is copied.
- Added cdk.linux.do to the default URL whitelist for the Redemption Assistant.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error when comparing account IDs.
  - Ensured all temporary contexts are closed correctly.

## 2.33.0
- **New Features:**
  - Introduced "Temporary Context Mode" for more effective bypassing of website protections.
  - API error messages are now internationalized.
  - Optimized website type detection, which can now be identified by the title of the temporary window.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 3.22.0
- **New Features:**
  - Model List: Added "Model Corresponding Key" tool (key icon) to check if the current model has an available key. If no key is available, you can create a default key with one click based on the model's available groups, or enter the custom creation process, with support for one-click key copying.
  - Share Snapshot: Supports one-click sharing of "Overview Snapshot / Account Snapshot". It prioritizes copying the image to the clipboard, and automatically downloads a PNG if not supported. Snapshots only contain shareable information (will not include sensitive fields like `API Key`) and support one-click copying of the title and accompanying text.
- **Experience Optimizations:**
  - Disabled Accounts: Disabled accounts will be automatically skipped in refresh and scheduled tasks such as "Balance History / Usage Analysis / Usage Sync", reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed an issue where the spinner was not visible when a button was in a "loading" state and simultaneously displayed a left-side icon.

**Location Hints:**
- Model Corresponding Key: In "Settings → Model List", click the key icon to the right of the model name (`Model Corresponding Key`).
- Share Overview Snapshot: In the button to the right of the title bar on the overview page of the extension popup (`Share Overview Snapshot`).
- Share Account Snapshot: In the operation menu for a single account in "Settings → Account Management" (`Share Account Snapshot`).

## 3.21.0
- **New Features:**
  - API Credentials: Added "API Credentials" page, suitable for "no account, only `Base URL` + `API Key`" scenarios. Supports unified management of tags/remarks, and allows direct availability verification and quick export (e.g., Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added multi-account view (Overview / Account Distribution / Trends), and provides a unified "Account Summary" table for quick comparison and statistical aggregation.
  - Self-Hosted Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for use in "Channel Management", "Model Sync", and other functions.
- **Experience Optimizations:**
  - Context Menu: "Redemption Assistant" and "AI API Detection" entries can be individually enabled/disabled and will take effect immediately after switching.
  - Copy Key: When an account has no key, the popup provides an entry for "Quickly Create Default Key / Create Custom Key", reducing back-and-forth navigation.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Done Hub`, and fill in "Done Hub Integration Settings".
- Context Menu Entry Switch: In "Settings → Basic Settings → Sign-in & Redemption / AI API Testing", under their respective "Show in Browser Context Menu" options.
- Copy Key Popup: Opened by clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown option when adding a new key now displays both the Group ID and description, facilitating quick differentiation and selection among multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" is now disabled. If you wish to automatically generate a default key after adding an account, please enable it manually in the settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add Key", and view in the group dropdown option.
- Auto-Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Hosted Site Management: Added `Octopus` hosted site support, allowing connection to the Octopus backend and importing account API keys as channels in "Channel Management", with support for fetching available model lists.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default), and provides a one-click "Ensure at least one key" option to automatically complete default keys for accounts missing them.
  - AI API Testing: "Model List Probing" for interface verification supports OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and other interface types, and will provide suggested model IDs, reducing manual model guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account identification logic to improve stability in scenarios with multiple accounts on the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-related interfaces to reduce errors caused by frequent refreshes or triggering site rate limits.
  - Channel Management: When creating a channel, performs more precise duplicate detection and provides confirmation prompts to avoid accidental creation of duplicate routes.
- **Bug Fixes:**
  - Deactivated Accounts: Deactivated accounts are now automatically filtered out from relevant dropdowns/lists in Key Management, preventing invalid operations.
  - Language: Fixed an issue where the extension's language setting might affect the webpage's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Auto-Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Complete Default Key: In "Settings → Key Management", at the top right, "Ensure at least one key".
- AI API Testing Entry: Right-click menu "Quickly Test AI API Functionality Availability".

## 3.18.0
- **New Features:**
  - Balance History: Charts now include a "Currency Unit" switch (`USD` / `CNY`), and currency symbols are displayed on axes/tooltips. When `CNY` is selected, it will be converted based on the account's "Recharge Amount Ratio", making it easier to view trends and reconcile by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are too many tag/account options, it defaults to "Expand to display", making browsing and selection more intuitive.
  - Tabs: Added left and right scroll buttons to the "Settings" group tabs and "Model List" vendor tabs, making switching more convenient in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Auto-detection" is more accurate, fixing issues with unknown site types that appeared frequently in recent versions.

**Location Hints:**
- Balance History Currency Unit: In "Settings → Balance History", in the filter area, "Currency Unit".
- Account Exchange Rate (Recharge Amount Ratio): In "Settings → Account Management", in the add/edit account form, "Recharge Amount Ratio".

## 3.17.0
- **New Features:**
  - Balance History: Added "Balance History" feature (disabled by default), which records daily balance and income/expense snapshots, and displays trends in charts. Supports filtering by tags/accounts and time range, and provides convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added a setting to control whether to enable it, the number of days to retain, and "End-of-Day Fetch". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-Day Fetch", the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar in small/narrow screens.
- **Bug Fixes:**
  - Import/Export: Fixed an issue with the responsive display of the export area on some screen sizes.
  - Popups: Fixed a layout anomaly where the scrollbar position in popups was incorrect.

**Location Hints:**
- Balance History Switch/Retention Days/End-of-Day Fetch: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Site): Added Sub2API site type, supporting balance/quota queries. Supports reading login status from the console via "Auto-detection". Also supports the "Plugin Hosted Session (Multiple Accounts, Recommended)" mode, which allows independent authentication renewal for each account, improving the experience for multiple accounts on the same site.
  - Display Settings: Added a "Show Today's Income/Expenses" switch (enabled by default), which can hide and stop fetching statistics like "Today's Consumption/Income", reducing log fetching requests during refreshes.
- **Notes:**
  - Sub2API currently does not support site sign-in / today's usage / income, and only provides basic balance/quota queries. Related features will be gradually improved based on site capabilities.
  - "Plugin Hosted Session (Multiple Accounts)" saves `refresh_token` as private account credentials, which will be included in exports/WebDAV backups. Please keep backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Addition/Mode Explanation: In "Settings → Account Management", add/edit account, select Sub2API as the site type; for more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved the stability of background Service Workers, reducing the issue of asynchronous scheduled tasks (WebDAV auto-sync / Usage Sync / Model Sync / Auto Sign-in, etc.) being missed due to early termination of the background process. Automatically resumes related scheduled tasks after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" to save quick links to site consoles/documentation/management pages without needing to create a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now has an "Account / Bookmark" switch. Bookmark data will be included in backups/restores and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests to reduce unnecessary network calls (some sites already return `today_income` in their refresh interface).
  - Auto Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is 30 seconds. After updating, old configurations will be automatically corrected to a valid range, and related prompts and documentation have been improved.

::: warning Important: Auto-refresh configuration will be forcibly adjusted
Feedback indicates that **overly short auto-refresh intervals can easily trigger site rate limits and place excessive load on sites**.

v3.15.0 **has forcibly modified the auto-refresh configuration**:
- Auto-refresh and refresh on plugin open features have been turned off. If you still need them, you must re-enable them manually.
- The minimum `Refresh Interval` is 60 seconds, and the `Minimum Refresh Interval Protection` is 30 seconds. If your settings before upgrading were below these thresholds, they will be automatically increased to the minimum values after upgrading. If your previously set values are within the new legal range, they will not be affected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; you can switch between "Account / Bookmark" at the top of the popup.
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly Test AI API Functionality Availability" to open the test panel directly on the current webpage. Supports filling in/pasting `Base URL` and `API Key`, and performs basic capability probing for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible also supports one-click model list fetching).
  - (Optional) Auto-Detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist. When available `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear first. The test panel will only open after confirmation (disabled by default, and keys are not saved).
  - Auto Sign-in: The execution results list now includes more troubleshooting hints—including suggestions and documentation links for common exceptions like "Temporary shield bypass tab manually closed" and "Access Token invalid".
- **Bug Fixes:**
  - WebDAV: Auto-sync has been migrated from timers to the browser Alarms API, reducing the probability of missed syncs due to background sleep/power saving policies.

**Location Hints:**
- AI API Test Panel: Right-click menu on any webpage, select "Quickly Test AI API Functionality Availability"; auto-detection related settings are in "Settings → AI API Test".
- Auto Sign-in Hints: View in the execution results list in "Settings → Auto Sign-in".

## 3.13.0
- **New Features:**
  - Account Management: Added "Sign-in Status Expired" prompt—when the "Signed in today / Not signed in today" status is not detected for the current day, an orange warning icon will be displayed. Clicking it will refresh the account data with one click, avoiding misleading information from old statuses.
  - Interface: Multi-select controls have been upgraded to more compact selectors (space-saving, support search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and sign-in logic, improving usability.
  - Cookie Authentication: Removed the Cookie caching mechanism, reducing issues caused by still reading old values after Cookie updates.

**Location Hints:**
- Sign-in Status Expired Prompt: In "Settings → Account Management", in the account list, next to the sign-in icon for site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code"—generates `providerProfiles` configuration for Kilo Code / Roo Code, supporting copying `apiConfigs` snippets or downloading `settings.json` for import (imports are incremental and will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by long text like site names, now truncated automatically.
  - Dropdown Selectors: Improved empty state prompts and fixed overflow issues with long option text.

**Location Hints:**
- Export to Kilo Code: In "Settings → Key Management", in the key list, click the Kilo Code icon in the top right corner of a key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder—when a duplicate/similar channel is detected, a warning dialog box will pop up, allowing you to choose to continue creation or cancel (no longer blocking creation with error toasts).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by long text like site names, now truncated automatically.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will open within the current incognito window (to maintain incognito login state).
  - Account Management: Disabled accounts also support clicking site links, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, the chart and list prioritize displaying the site name (instead of the username) for more intuitive information.
  - Shield Bypass Assistant: The temporary shield bypass window now supports CAP (cap.js) Pow verification, improving pass rates.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Toast Notifications: Fixed Toaster layering issues, preventing notifications from being obscured by webpages.

**Location Hints:**
- Site Link: In "Settings → Account Management", click the site name in the account list.
- Shield Bypass Assistant: Refer to [Cloudflare Shield Bypass Assistant](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added "Manual Balance (USD)" field to accounts—when the site cannot automatically fetch balance/quota, you can manually fill this in for display and statistics.
  - Account Management: Added "Exclude from Total Balance" switch to accounts—used to remove specific accounts from the "Total Balance" statistics (does not affect refresh/sign-in functions).
  - Settings: Added "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Auto Sign-in: Refreshes relevant data and synchronizes the interface after execution.

**Location Hints:**
- Add/Edit Account: Open add/edit account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added a "Usage Analysis" page to help you visualize usage trends across multiple sites and accounts, allowing you to quickly see "where usage/spending is high / where it's slowing down", facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (raw logs are not saved). Supports setting retention days, automatic sync methods, and minimum sync intervals, and view sync results and error prompts for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage" to enable "Usage History Sync", set as needed, and click "Sync Now".
  - Then, view charts in the left-side menu "Usage Analysis"; click "Export" when you need to retain or reconcile data.

## 3.7.0
- **New Features:**
  - Sorting: Account list supports sorting by "Income"; sorting priority now includes "Disabled accounts at the bottom", so deactivated/invalid accounts no longer interfere with your daily use.
  - Auto Sign-in: Added "Trigger today's sign-in early when opening the interface"—when opening the popup/sidebar/settings page within the time window, it will automatically attempt to run today's sign-in early, without waiting for the scheduled time.
- **Bug Fixes:**
  - Auto Sign-in: Each account will only execute once per day; retries are only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Auto Sign-in Early Trigger/Retry: Configure in the left-side menu "Auto Sign-in".

## 3.6.0
- **New Features:**
  - Account Management: Supports enabling/disabling accounts with one click. After disabling, various functions will skip the account, making it easy to retain data after an account becomes invalid.
  - Tags: Added global tag management, and optimized related interfaces and interactions accordingly, making it easier to classify and manage accounts.
  - Popup: Displays the current version number in the title bar and provides a direct entry to this changelog.
  - Quick Export: CCSwitch export supports selecting upstream models, making export configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to avoid display inconsistencies due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Sign-in" switch (moved above the custom sign-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from the dialog title icon for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Auto-detection: Added "Slow Detection" prompts and links to relevant documentation to help users troubleshoot and resolve issues.
  - Batch Opening External Sign-ins: Supports opening all in new windows, making batch closing easier and reducing interference.
- **Bug Fixes:**
  - Batch Opening External Sign-ins: Refactored the process to execute in the background service, ensuring correct opening of all sites in popup scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to directly select upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always have the `sk-` prefix, avoiding recognition/copying issues due to inconsistent formats.

## 3.3.0
- **New Features:**
  - Auto Sign-in: Added "Username" information to account identification, making it easier to distinguish accounts in multi-account scenarios.
  - External Sign-in: Supports batch triggering of external sign-ins, reducing the number of individual operations.
  - Auto Refresh: The minimum refresh interval no longer has a maximum limit, allowing larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce false triggers in non-copying scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying prompts, reducing invalid redemption notifications.
  - Storage: Added write locks to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text related to "Copy Model Name".

## 3.2.0
- **New Features:**
  - "Model List" page now includes "Interface Availability Detection" (Beta) for quickly confirming if the current key is available for a specified model (e.g., text generation, tool/function calling, structured output (returning by JSON structure), web search (Grounding), etc.).
  - "Model List" page now includes "CLI Tool Compatibility Detection" (Beta), simulating tool call flows for Claude Code / Codex CLI / Gemini CLI to assess interface compatibility in these tools.
  - "About" page now includes "Rate and Download": Automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entry points for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating problem diagnosis.
  - In sidebar mode, the "Open in Sidebar" button will no longer be displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce failures in obtaining Cookies due to insufficient permissions.

## 3.1.0
- **New Features:**
  - In self-managed API settings, added guidance for administrator credentials.
  - Redemption Assistant now supports batch redemption and single-code retry.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing each account to coexist normally and all functions to be available. This is mainly for sites with only cookie authentication methods like AnyRouter.
  - Supports setting proxy and model, as well as model alias lists when exporting CLIProxyAPI.
  - Separated site sign-in and custom sign-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed an incorrect web page jump path for manual sign-in on New-API sites.

## 2.39.0
- Automatically detects and modifies the sign-in support status of account sites during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Directly select specific redemption accounts using the up/down arrow keys.
  - Press Enter to confirm redemption.
- Added prompts to temporary shield bypass tabs, indicating that the current tab originates from this plugin and its purpose.
- Improved shield bypass window display: single window with multiple tabs, meaning requests within a short period will reuse the same window, minimizing interference.
- Supports sign-in status detection and automatic sign-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added support for more lenient redemption code format detection options, correctly identifying redemption codes and popping up the Redemption Assistant when encountering custom formats.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific channels for management.
- Fixed an issue that would reset the channel model sync time.

## 2.35.1
- Fixed an issue that would reset the auto sign-in execution time.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to prompt for redemption when any potential redemption code is copied.
- Added cdk.linux.do to the default URL whitelist for the Redemption Assistant.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error when comparing account IDs.
  - Ensured all temporary contexts are closed correctly.

## 2.33.0
- **New Features:**
  - Introduced "Temporary Context Mode" for more effective bypassing of website protections.
  - API error messages are now internationalized.
  - Optimized website type detection, which can now be identified by the title of the temporary window.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 2.32.0
- **New Features:**
  - Model redirection is now smarter, supporting version numbers represented by hyphens and dots.
  - Added the functionality to directly redeem via the right-click menu after selecting text.
  - Auto sign-in is enabled by default, and the sign-in time window has been extended.

## 2.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - You can now quickly perform sign-in operations within the popup.
  - Redemption Assistant now supports a URL whitelist feature, allowing you to better control which websites can use it.

## 2.30.0
- **New Features:**
  - Added sign-in support for Wong sites.
  - Added sign-in support for AnyRouter sites.
  - Improved detection capabilities for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, and recovery includes a decryption retry popup, while retaining your WebDAV configuration.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website Cookie interception issues during auto-detection.
  - Optimized the centering of blank state content in Firefox.
  - Migrated the Switch component to a custom implementation for improved compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced "Hosted Sites" service, laying the foundation for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" in settings to "Hosted Sites" for clarity.
- **Bug Fixes:**
  - Optimized translation texts and removed redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes for easier problem diagnosis.
  - Temporary window bypass feature now includes a health status indicator.
  - Optimized the description for bypassing website protections to be clearer and more understandable.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed display issues with Firefox popup prompts in Chinese settings.
- **Performance Optimizations:**
  - Improved the performance of the sorting function.

## 2.26.0
- **New Features:**
  - Added model pricing cache service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Model pricing information for multiple accounts can now be displayed simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 2.25.0
- **New Features:**
  - Added a new user guide card when the account list is empty.
  - When the pin/manual sort function is disabled, related UI elements will be automatically hidden.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

## 2.24.0
- **New Features:**
  - Updated application description and about page content.
  - Extension name now includes a subtitle.
  - Tag filter now has visibility control based on line count.
  - WebDAV connection test now supports more success status codes.
- **Bug Fixes:**
  - Removed extra periods at the end of JSON strings.

## 2.23.0
- **New Features:**
  - Enhanced account tagging functionality.
  - Temporary window bypass feature now supports more intelligent judgment based on error codes.

## 2.22.0
- **New Features:**
  - Account management now includes a tagging feature for easy account classification.
  - Redemption Assistant popup UI now supports lazy loading and fixes issues that could cause website style conflicts.
  - Added global channel filter and JSON editing mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed duplicate "Signed in today" checks in auto sign-in.
  - Simplified and fixed temporary window fetching logic.
  - Restored parsing of search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guidance during initial installation to help you understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed an issue with operation buttons overflowing in the account dialog.
  - Redemption amount conversion coefficients now use constants for improved accuracy.
  - Limited the Cookie interceptor to only be used in Firefox browsers.

## 2.19.0
- **New Features:**
  - Added loading status and prompt messages during the redemption process.
  - Removed clipboard reading functionality from the Redemption Assistant.
- **Bug Fixes:**
  - Added missing background error message translations.
  - Prevented concurrent initialization and race conditions in services, improving stability.
  - Resolved intermittent "Unable to establish connection" errors.
  - Prevented race conditions during the destruction of the temporary window pool.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Assistant feature.
  - Firefox browsers now support WebRequest-based Cookie injection.
  - Redemption feature now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and setting links.
- **Bug Fixes:**
  - Fixed path issues with Tailwind CSS files.

## 2.17.0
- **New Features:**
  - Added automatic popup prompts for one-click redemption.
  - Unified data format for import/export and WebDAV backup using a V2 versioning scheme for improved compatibility and stability.

## 2.16.0
- **New Features:**
  - Added warning prompts when creating accounts in Firefox desktop.
  - API model sync now supports a channel filtering system.

## 2.15.0
- **New Features:**
  - MultiSelect component now supports parsing comma-separated strings.
- **Bug Fixes:**
  - Ensured caching only occurs during complete channel data sync.
- **Performance Optimizations:**
  - Optimized upstream model caching logic.

## 2.14.0
- **New Features:**
  - Site metadata will be automatically detected during refresh.
  - When auto sign-in fails, retry and manual sign-in options are now available.
  - Enhanced auto sign-in functionality, including retry strategies, skip reasons, and account snapshots.
  - Optimized auto sign-in execution method to concurrent processing for improved efficiency.
- **Bug Fixes:**
  - Fixed default behavior issues with the `autoCheckInEnabled` flag.

## 2.13.0
- **New Features:**
  - Added "New API Channel Management" functionality.
  - Added "Warning" button style.
  - Introduced Radix UI components and Tanstack Table for improved interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed issues with model count display and sorting in the channel table.

## 2.12.1
- **Bug Fixes:**
  - Fixed unnecessary reloads of channels when manually selecting tabs.
  - The "New API Model Sync" option is hidden in the sidebar when the configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Sync" now includes an allowlist filtering feature for models.
  - The sidebar now supports collapsing/expanding with smooth animation effects.

## 2.11.0
- **New Features:**
  - Account management functionality has been enhanced with search capabilities and navigation optimizations.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed logic errors in auto sign-in status.

## 2.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanisms for improved communication stability.
  - Model sync now includes a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured that missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection and automatically attempts to bypass using temporary windows when protections are encountered.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized dropdown menu positioning and accessibility for multi-select components.

## 2.8.0
- **New Features:**
  - Added fault tolerance for partial account updates.
  - Account information can be saved even if data fetching fails during manual account addition.
  - The settings page now includes a "Settings Partition" feature for resetting settings by region.

## 2.7.1
- **Bug Fixes:**
  - Fixed an issue where redirected models did not appear in the model list during API sync.

## 2.7.0
- **New Features:**
  - The account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hidden the password visibility button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - User preferences such as `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now mandatory to ensure the integrity of default configurations.
- **Bug Fixes:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed the issue of missing "New API Preference Settings" in configuration checks.
  - Corrected sign-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 2.6.0
- **New Features:**
  - The user interface for "New API Channel Import" has been optimized to support key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process for improved accuracy.
- **Bug Fixes:**
  - Model name standardization is now consistent with the Veloera backend and retains hyphens.
  - Resolved browser storage quota issues and improved model matching.

## 2.5.0
- **New Features:**
  - Added support for the Neo-API site type.
- **Bug Fixes:**
  - Fixed Base64 encoding issues during CherryStudio URL generation.
  - Removed redundant account fetching and token verification from the channel dialog for improved efficiency.

## 2.4.1
- **Bug Fixes:**
  - Ensured that the settings page always opens in a new tab.

## 2.4.0
- **New Features:**
  - Auto-import functionality now integrates the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - Multi-select components now support collapsible selected areas and optimized input experience.
- **Bug Fixes:**
  - Optimized retry mechanisms and added user feedback.
  - Optimized performance of multi-select components with a large number of selections.

## 2.3.0
- **New Features:**
  - Added account pinning and unpinning functionality, and supports prioritizing pinned accounts in sorting.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration, prioritizing the current site condition.

## 2.2.1
- **Bug Fixes:**
  - Removed the `isDetected` check for the auto-configuration button.
  - Ensured that account detection correctly refreshes when displayed data changes.
  - Fixed the issue where Access Tokens are no longer required for Cookie authentication types.

## 2.2.0
- **New Features:**
  - Auto sign-in functionality now includes a results/history interface and optimized default settings and user experience.
  - Implemented daily site auto sign-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case-sensitivity issues in auto sign-in status detection.
  - Handled edge cases in sign-in time window calculations.

## 2.1.0
- **New Features:**
  - Account list now includes username search and highlighting functionality.
- **Bug Fixes:**
  - Added configuration validation warnings when API settings are missing.
  - "New API" functionality now includes configuration validation assistance and internationalized error messages.

## 2.0.0
- **New Features:**
  - The "New API Model Sync" filter bar now includes execution statistics.
  - Each row in the results table now includes sync operation buttons.
  - Implemented the initial service, background logic, and settings interface for "New API Model Sync".
- **Bug Fixes:**
  - Row retry operations now only update the target and progress UI.
  - Updated channel list response handling and types.

## 1.38.0
- **New Features:**
  - Accounts with custom sign-in or redemption URLs set can now be pinned.
  - Added custom redemption and opening tab matching as sorting rules.
- **Bug Fixes:**
  - Ensured deep copying of default sorting rules.
  - New sorting conditions are disabled by default after migration.

## 1.37.0
- **New Features:**
  - Account search functionality has been enhanced to support multi-field composite searches across UI interfaces.
  - Added the "Open Sidebar" functionality.
- **Bug Fixes:**
  - Added translation for the "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with redemption page paths and support redirection.
  - Option to automatically open the redemption page after sign-in.
  - Supports opening both sign-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - Sign-in icon updated to a "Yen" icon for better intuitiveness.
- **Bug Fixes:**
  - Custom sign-in accounts will now have their sign-in status automatically reset daily.
  - Fixed the default value issue for the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic synchronization of account data using a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` for improved cross-browser compatibility and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced a reusable `AppLayout` component for improved interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed an issue with incorrect width of the right content container on small screens.

## 1.32.0
- **New Features:**
  - Improved layout and responsiveness of the account management interface.
  - Added configurable React DevTools auto-plugin and caching.
- **Bug Fixes:**
  - Fixed the `z-index` issue of the mobile sidebar overlay.
  - Buttons, cards, and icons now support responsive size adjustments.

## 1.31.0
- **New Features:**
  - Account management now includes a "Create Account" button and optimized layout.
  - Account management now includes a "Usage Log" feature.
  - Sorting priority settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fixes:**
  - Updated the size and accessibility labels for SiteInfo icon buttons.

## 1.30.0
- **New Features:**
  - Dialog components have been replaced with a custom `Modal` component for improved consistency.
  - Introduced a comprehensive UI component library for enhanced interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected sign-in logic and sorting priority.
  - Optimized the transparency and layering of the mobile sidebar overlay for an improved user experience.

## 1.29.0
- **New Features:**
  - Popups now support detection and automatic closing.
  - Popups now feature responsive mobile layout to avoid zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent auto-detection functionality.
  - Migrated `chrome.*` APIs to `browser.*` APIs, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functional compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed `tabId` parsing issues after window creation.
  - Prevented button border rotation animation during refresh.

## 1.27.0
- **New Features:**
  - The account dialog will automatically close after successful auto-configuration to New API.
  - Implemented dynamic loading of localization resources for improved internationalization support.
- **Bug Fixes:**
  - Added internationalization support for error messages.
  - Fixed template syntax errors in Chinese/English currency switching.

## 1.26.0
- **Bug Fixes:**
  - Account error messages are now internationalized.
  - Replaced hardcoded Chinese text in `newApiService` with internationalization keys.

## 1.25.0
- **New Features:**
  - Improved the accessibility of the WebDAV settings form.
- **Bug Fixes:**
  - Replaced hardcoded Chinese text in the `TokenHeader` prompt with translation keys.

## 1.24.0
- **New Features:**
  - Added health status translation keys and refactored error messages.
  - `dayjs` localization now updates with language switching.

## 1.23.2
- **Bug Fixes:**
  - Fixed logic errors in CNY currency conversion.

## 1.23.1
- **Bug Fixes:**
  - Amount extraction now supports exchange rate conversion.

## 1.23.0
- **New Features:**
  - Added Chinese and English localization support.
  - Added language switching functionality and support for Suspense loading.
- **Bug Fixes:**
  - Completed internationalization of remaining hardcoded text.
  - Fixed the issue where a success message was still displayed when there were no accounts to refresh.

## 1.22.0
- **New Features:**
  - Accounts now include a "Today's Total Income" field and an income display interface.
  - Supports redemption code recharge types.
- **Bug Fixes:**
  - Fixed rendering logic for the custom URL sign-in interface.
  - Corrected sign-in field names and return structures.

## 1.21.0
- **New Features:**
  - Added favicon and extension icons for popup, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and popup operations.
  - Migrated the underlying framework from Plasmo to WXT for better performance and development experience.

## 1.20.0
- **New Features:**
  - Balance and health status indicators now include a refresh function.
  - Operation button UI has been unified and optimized, supporting intelligent key handling.

## 1.19.0
- **New Features:**
  - All components now support dark mode.
  - Implemented a theme system supporting dark, light, and system-following modes.
- **Bug Fixes:**
  - API configuration interface now requires the `authType` field.

## 1.18.0
- **New Features:**
  - Accounts now include a custom sign-in button (with a Yen icon).
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting function now includes custom sign-in URL as a sorting condition.
- **Bug Fixes:**
  - Fixed an issue where the custom sign-in URL was not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication types.
  - API authentication options now include an "No Authentication" type.
  - Tooltip component migrated to the `react-tooltip` library, resolving display overflow issues.

## 1.16.0
- **New Features:**
  - "New API" functionality now supports automatic account configuration.
  - Site accounts now include sign-in functionality.
  - Implemented a customizable sorting priority system.

## 1.15.0
- **Bug Fixes:**
  - Fixed an issue where unnecessary updates and notifications were triggered even when values had not changed.

## 1.14.0
- **New Features:**
  - Added tab activation and update listeners for automatic detection.

## 1.13.0
- **New Features:**
  - Added "New API" integration, supporting token import.
  - Added "New API" integration settings in preferences.
  - Added password visibility toggle functionality.

## 1.12.1
- **Bug Fixes:**
  - Moved default sorting values to `UserPreferencesContext`.
  - Fixed potential rendering issues when loading preferences.

## 1.12.0
- **New Features:**
  - Account sorting now includes health status priority.
  - Health status now includes more detailed reason information.

## 1.11.0
- **New Features:**
  - Refresh functionality has been enhanced to support detailed status tracking.
  - Added a minimum refresh interval to prevent frequent requests.

## 1.10.0
- **New Features:**
  - Key copy functionality now includes Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub token management and data fetching capabilities.
  - Added user group data conversion and API integration.
  - Implemented model fetching functionality for OneHub sites.

## 1.8.0
- **New Features:**
  - Account management now supports site type.
  - Added site type detection and optimized the auto-detection process.
  - Implemented model pricing functionality for OneHub sites.

## 1.7.1
- **Bug Fixes:**
  - Fixed a logic error in using site status detection for sign-in support.

## 1.7.0
- **New Features:**
  - Added sign-in support detection and switching functionality.
  - Accounts now support sign-in status.

## 1.6.0
- **New Features:**
  - Account management now supports a remarks field.

## 1.5.0
- **Performance Optimizations:**
  - Optimized the rendering method of the model list to improve loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed an issue where the status of detected accounts was reset when no existing accounts were found.

## 1.4.0
- **New Features:**
  - Control panel now includes a "Copy Model Name" function.
  - Added support for Baidu and Yi model providers.

## 1.3.1
- **Bug Fixes:**
  - Updated PR release workflow configuration.

## 1.3.0
- **New Features:**
  - Added WebDAV backup and synchronization functionality.

## 1.2.0
- **New Features:**
  - Added an account management page with full CRUD functionality.
  - Replaced custom dialogs in popups with direct function calls for simplified operations.

## 1.1.1
- **Bug Fixes:**
  - Fixed logic for handling missing system names and checks.

## 1.1.0
- **New Features:**
  - Accounts now support manual addition, with an optimized UI flow.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and warning prompts when adding accounts.
  - Introduced sidebar functionality, replacing popup-based auto site configuration.

## 0.0.3
- **New Features:**
  - Optimized account identification process, now supporting automatic access key creation.
  - Account list now includes sortable headers, a copy key dialog, and hover action buttons.
  - Account management now includes a remarks field.
  - Website names are now clickable for navigation.
  - Model list supports group selection.
  - Popup pages feature digital rolling animations and site status indicators.
  - Optimized add/edit account dialogs, including recharge ratio settings and automatic site name extraction.
  - Fully implemented the settings page system, supporting persistent user preferences and auto-refresh.
  - Enhanced frontend interface and backend services for auto-refresh functionality.
  - Automatically adds the `sk-` prefix when copying keys.
  - Introduced industry-standard tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Supports more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Popup interface refactored to API Manager style, with added display of total daily consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed issues with incompatible model data formats, `localStorage` access, and API request credentials.
  - Corrected API authentication methods.
  - Optimized URL input handling and auto-refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**