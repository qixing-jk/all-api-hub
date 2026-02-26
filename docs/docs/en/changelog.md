# Changelog

This page records the main updates for general users (feature changes / experience optimizations / bug fixes). For the complete history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip For New Users
- **How to confirm your current version**: Open the extension popup; the version number will be displayed in the title bar. You can also check it on the settings page.
- **How to stop this page from opening automatically**: You can control whether to "Automatically open changelog after update" in "Settings → General → Changelog".
- **Troubleshooting**: In "Settings → General → Logs", you can enable console logs and report issues with reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.24.0
- **New Features:**
  - Changelog: The plugin will no longer automatically open a new browser tab after an update. Instead, it will display the update content within the plugin via a popup on your first visit to the plugin interface, with an option to open the full changelog.
  - LDOH: A new shortcut `View in LDOH` (LDOH icon) has been added to the account list, allowing direct navigation to LDOH with the corresponding site automatically filtered. When adding an account, an option `Open LDOH Site List` is also provided to help find sites.
- **Experience Optimizations:**
  - Documentation Links: When opening documentation or changelogs from the plugin, it will now automatically redirect to the corresponding language version of the documentation page based on the current plugin language.

**Location Hints:**
- Changelog Toggle: Located in "Settings → General → Changelog" under `Automatically display update content after update`.
- Changelog Popup: Appears automatically after plugin updates, the first time you open the "Extension Popup / Settings Page / Sidebar" (once per version).
- LDOH Shortcut: To the right of the site name in the account list within "Account Management" (LDOH icon, prompts `View in LDOH`); you can also click `Open LDOH Site List` in the add account dialog.

## 3.23.0
- **New Features:**
  - Automatic Check-in: A `Quick Check-in` option has been added to the account action menu, allowing an immediate check-in for a single account and refreshing its status upon completion.
  - Key Management: A new `All Accounts` view aggregates keys by account group, facilitating cross-account search and copying.
  - Model Redirection: A new batch operation `Clear Model Redirection Mappings` allows for quick resetting of `model_mapping` after selecting a channel and confirming (irreversible).
- **Experience Optimizations:**
  - New API Channel Management: URLs in the channel list are now clickable, and the search experience has been optimized.
- **Bug Fixes:**
  - Channel Management: Fixed an issue with inaccurate prompt text for `Priority` in the channel dialog.
  - Model Redirection: Added a "version guard" to automatically generated mappings to prevent cross-version mismatches.
  - Sidebar: Automatically falls back to opening a popup/settings page when the runtime environment does not support the sidebar, preventing unresponsive clicks.

## 3.22.0
- **New Features:**
  - Model List: A new tool `Model Associated Keys` (key icon) has been added to check if a current model has available keys. If no keys are available, you can create a default key with one click based on the model's available groups, or proceed to a custom creation flow, with an option to copy the key with one click.
  - Share Snapshot: Supports one-click sharing of `Overview Snapshot` / `Account Snapshot`. It prioritizes copying the image to the clipboard, and automatically downloads a PNG if copying is not supported. Snapshots only contain shareable information (no sensitive fields like `API Key`) and include a one-click option to copy the title text.
- **Experience Optimizations:**
  - Disable Account: Disabled accounts are now automatically skipped in refresh and scheduled tasks such as `Balance History`, `Usage Analysis`, and `Usage Sync`, reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed an issue where the spinner was not visible when a button was in a "loading" state and also displayed a left-side icon.

**Location Hints:**
- Model Associated Keys: In "Settings → Model List", click the key icon next to the model name (`Model Associated Keys`).
- Share Overview Snapshot: In the title bar of the overview page in the extension popup, click the button on the right (`Share Overview Snapshot`).
- Share Account Snapshot: In the action menu for a specific account in "Settings → Account Management" (`Share Account Snapshot`).

## 3.21.0
- **New Features:**
  - API Credentials: A new "API Credentials" page has been added, suitable for scenarios where you only have `Base URL` + `API Key` without a full account. It supports unified management of tags/remarks, direct availability verification, and quick export (e.g., for Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added a multi-account view (Overview / Account Distribution / Trends) and a unified "Account Summary" table for quick comparison and aggregated statistics.
  - Self-Hosted Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for use in "Channel Management", "Model Sync", and other features.
- **Experience Optimizations:**
  - Context Menu: The "Redemption Assistant" and "AI API Detection" entries can now be toggled on/off independently, and the changes take effect immediately after switching.
  - Copy Key: When an account has no keys, the popup provides entries for "Quickly Create Default Key / Create Custom Key", reducing the need to navigate back and forth.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Done Hub` and fill in "Done Hub Integration Settings".
- Context Menu Entry Toggles: In "Settings → Basic Settings → Check-in & Redemption / AI API Testing", under their respective "Show in Browser Context Menu" options.
- Copy Key Popup: Opens when clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown options when adding a new key now display both the Group ID and description, facilitating quick differentiation and selection among multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" is now disabled. If you wish to generate a default key upon adding a new account, please enable it manually in the settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add Key" and view it in the group dropdown options.
- Auto-Create Default Key Toggle: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Hosted Site Management: Added support for `Octopus` hosted sites. After connecting to the Octopus backend, API keys can be imported as channels in "Channel Management", and available model lists can be fetched.
  - Key Management: Added `Automatically create default key after adding account` (enabled by default) and a one-click `Ensure at least one key` option to automatically complete default keys for accounts missing them.
  - AI API Testing: The `Probe Model List` in interface verification now supports interface types such as OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and provides suggestions for available model IDs, reducing manual model guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account identification logic for improved stability in scenarios with multiple accounts on the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-related interfaces to reduce errors caused by frequent refreshes or triggering site rate limits.
  - Channel Management: When creating a channel, more precise duplicate detection is performed, with a confirmation prompt to prevent accidental creation of duplicate routes.
- **Bug Fixes:**
  - Disable Account: Disabled accounts are now automatically filtered out from dropdowns/lists in Key Management and related sections, preventing invalid operations.
  - Language: Fixed an issue where the extension's language setting could affect the webpage's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Auto-Create Default Key Toggle: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Complete Default Key: In "Settings → Key Management", in the top right corner, click `Ensure at least one key`.
- AI API Testing Entry: Right-click menu in the webpage, select "Quickly test AI API functionality".

## 3.18.0
- **New Features:**
  - Balance History: The chart now includes a `Currency Unit` toggle (`USD` / `CNY`) and displays currency symbols on the axes and tooltips. When `CNY` is selected, it converts based on the account's `Recharge Amount Ratio` for easier trend viewing and reconciliation by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are too many tag/account options, it now defaults to "Expand to display", making browsing and selection more intuitive.
  - Tabs: Added left and right scroll buttons to the group tabs in "Settings" and the vendor tabs in "Model List" for easier switching in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Automatic Recognition" is now more accurate, fixing issues with frequently appearing unknown site types in recent versions.

**Location Hints:**
- Balance History Currency Unit: In "Settings → Balance History", in the filter area, select `Currency Unit`.
- Account Exchange Rate (Recharge Amount Ratio): In "Settings → Account Management", in the add/edit account form, find `Recharge Amount Ratio`.

## 3.17.0
- **New Features:**
  - Balance History: A new "Balance History" feature (disabled by default) records daily balance and income/expense snapshots, allowing you to view trends in charts. It supports filtering by tags/accounts and time range, and provides convenient "Refresh Now / Clear Now" operations.
  - Balance History: New settings allow control over enabling the feature, retention days, and "End-of-Day Fetch". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-Day Fetch", the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar in small or narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed a responsive display issue with the export area on some screen sizes.
  - Popup: Fixed a layout anomaly where the scrollbar position in popups was incorrect.

**Location Hints:**
- Balance History Toggle / Retention Days / End-of-Day Fetch: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added `Sub2API` site type, supporting balance/quota query. It supports reading login status from the console via "Automatic Recognition" and also supports the "Plugin Hosted Session (Multi-Account, Recommended)" mode, allowing independent authentication renewal for each account and improving the experience for multiple accounts on the same site.
  - Display Settings: Added a "Show Today's Income/Expenses" toggle (enabled by default). This hides and stops fetching statistics like "Today's Consumption/Income", reducing log fetching requests during refreshes.
- **Note:**
  - Sub2API currently does not support site check-in, daily usage, or income-related features, only basic balance/quota queries. Related features will be gradually added based on site capabilities.
  - "Plugin Hosted Session (Multi-Account)" saves the `refresh_token` as private account credentials and will be included in exports/WebDAV backups. Please keep backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Addition/Mode Explanation: In "Settings → Account Management", add/edit account, select Sub2API as the site type; for more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Toggle: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved the stability of background Service Workers, reducing the issue of asynchronous scheduled tasks (WebDAV auto-sync / Usage sync / Model sync / Auto check-in, etc.) being missed due to premature background termination. It also automatically restores related scheduled tasks after the browser restarts.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" for saving quick links to site consoles/documentation/management pages without needing to create a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now includes an "Accounts / Bookmarks" toggle. Bookmark data will be included in backups/restores and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests, reducing unnecessary network calls (some sites now return `today_income` in their refresh interface).
  - Auto Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is set to 30 seconds. Old configurations will be automatically corrected to a valid range after the update, and related prompts and documentation have been improved.

::: warning Important: Auto-Refresh Configuration Will Be Forced Adjusted
Due to feedback indicating that **overly short auto-refresh intervals can trigger site rate limits and place excessive load on sites**,

v3.15.0 **has made forced changes to the auto-refresh configuration**:
- Auto-refresh and refresh on plugin open features have been turned off. You will need to manually re-enable them if you still require them.
- The minimum `Refresh Interval` is now 60 seconds, and the `Minimum Refresh Interval Protection` is 30 seconds. If your settings before upgrading were below these thresholds, they will be automatically increased to the minimum values after the upgrade. If your previously set values are within the new legal range, they will remain unaffected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; you can toggle between "Accounts / Bookmarks" at the top of the popup.
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly test AI API functionality" to directly open a test panel on the current webpage. Supports filling in/pasting `Base URL` and `API Key`, and performs basic capability probing for OpenAI-compatible / OpenAI / Anthropic / Google interfaces (OpenAI-compatible also supports one-click model list fetching).
  - (Optional) Automatic Detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist. When a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (disabled by default, and keys are not saved).
  - Auto Check-in: The execution results list now includes more troubleshooting hints—including suggestions and documentation links for common exceptions like "Temporary anti-bot tab manually closed" and "Access Token invalid".
- **Bug Fixes:**
  - WebDAV: Auto-sync has been migrated from timers to the browser's Alarms API, reducing the probability of missed syncs caused by background sleep/power saving policies.

**Location Hints:**
- AI API Test Panel: Right-click menu on any webpage, select "Quickly test AI API functionality"; automatic detection settings are in "Settings → AI API Test".
- Auto Check-in Hints: View in the execution results list under "Settings → Auto Check-in".

## 3.13.0
- **New Features:**
  - Account Management: Added a "Check-in Status Expired" prompt. When the "Checked-in Today / Not Checked-in Today" status is not from the current day's detection, an orange warning icon will be displayed. Clicking it allows one-click refresh of the account data to avoid being misled by old status.
  - Interface: Multi-select controls have been upgraded to more compact selectors (space-saving, support search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and check-in logic, improving usability.
  - Cookie Authentication: Removed the Cookie caching mechanism, reducing issues caused by still reading old values after Cookie updates.

**Location Hints:**
- Check-in Status Expired Prompt: In "Settings → Account Management", in the account list, next to the site information's check-in icon.

## 3.12.0
- **New Features:**
  - Key Management: Added `Export to Kilo Code`. Generates `providerProfiles` configuration for Kilo Code / Roo Code, supporting copying `apiConfigs` snippets or downloading `settings.json` for import (imports are additive and will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by long text like site names, now automatically truncated.
  - Dropdown Selectors: Optimized empty state prompts and fixed overflow issues with long option text.

**Location Hints:**
- Export to Kilo Code: In "Settings → Key Management", in the key list, click the Kilo Code icon in the top right corner of a key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added `Duplicate Channel` reminder. When a duplicate or similar channel is detected, a warning dialog will pop up, allowing you to choose to continue creation or cancel (creation will no longer be blocked by error toasts).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by long text like site names, now automatically truncated.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will open within the current incognito window (to maintain incognito login state).
  - Account Management: Disabled accounts also support clicking site links, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, the chart and list prioritize displaying the site name (instead of username) for more intuitive information.
  - Anti-Bot Helper: The temporary anti-bot window now supports CAP (cap.js) Pow verification, improving success rates.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Notification Popups: Fixed Toaster layering issues, preventing notifications from being obscured by webpages.

**Location Hints:**
- Site Link: In "Settings → Account Management", click the site name in the account list.
- Anti-Bot Helper: Refer to [Cloudflare Anti-Bot Helper](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added a `Manual Balance (USD)` field. When a site cannot automatically fetch balance/quota, you can manually fill this in for display and statistics.
  - Account Management: Added an `Exclude from Total Balance` toggle. This removes specific accounts from the "Total Balance" statistics (does not affect refresh/check-in functions).
  - Settings: Added `Automatically open changelog after update` toggle (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether console logs are output and the minimum log level, facilitating troubleshooting.
  - Auto Check-in: After execution, related data will be refreshed, and the interface will be synchronized.

**Location Hints:**
- Add/Edit Account: Open add/edit account in "Settings → Account Management".
- Changelog Toggle, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added a "Usage Analysis" page to help you visualize usage trends across multiple sites and accounts, allowing you to quickly see "where you're spending more / using more / slowing down", facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (raw logs are not saved). Supports setting retention days, automatic sync methods, and minimum sync intervals, and allows viewing sync results and error prompts for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage", enable "Usage History Sync", set as needed, and click "Sync Now".
  - Then, view charts in the left-side menu "Usage Analysis"; click "Export" when you need to retain or reconcile data.

## 3.7.0
- **New Features:**
  - Sorting: The account list now supports sorting by "Income". The sorting priority has been updated to include "Disabled accounts at the bottom", preventing inactive/invalid accounts from interfering with your daily use.
  - Auto Check-in: Added "Trigger today's check-in early when opening the interface". When opening the popup/sidebar/settings page within the time window, it will automatically attempt to perform today's check-in early, without waiting for the scheduled time.
- **Bug Fixes:**
  - Auto Check-in: Each account will only be checked in once per day. Retries are only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Auto Check-in Early Trigger/Retry: Configure in the left-side menu "Auto Check-in".

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enabling/disabling of accounts. Disabled accounts will be skipped by all features, allowing data retention even after an account becomes invalid.
  - Tags: Added global tag management and synchronized optimizations to related interfaces and interactions for easier classification and management of accounts.
  - Popup: Displays the current version number in the title bar and provides a direct entry to this changelog.
  - Quick Export: CCSwitch export now supports selecting upstream models, making export configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to prevent unexpected results due to precision or rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Check-in" toggle (moved above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from dialog title icons for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would result in a blank screen.

## 3.5.0
- **New Features:**
  - Automatic Recognition: Added a "Detection Slow" prompt and related documentation links to help users troubleshoot and resolve issues.
  - Batch Open External Check-ins: Supports opening all in new windows, making batch closing easier and reducing interference.
- **Bug Fixes:**
  - Batch Open External Check-ins: The process has been refactored to execute in the background service, ensuring correct opening of all sites in popup scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to allow direct selection of upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always have the `sk-` prefix to avoid recognition/copying issues due to inconsistent formats.

## 3.3.0
- **New Features:**
  - Auto Check-in: Account identification now includes "Username" information, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the number of individual operations.
  - Auto Refresh: The minimum refresh interval no longer has a maximum limit, allowing larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce accidental triggers in non-copying scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying prompts, reducing invalid redemption notifications.
  - Storage: Added write locks to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text for "Copy Model Name".

## 3.2.0
- **New Features:**
  - The "Model List" page now includes "Interface Availability Detection" (Beta) to quickly confirm if the current key is usable for a specified model (e.g., text generation, tool/function calling, structured output (returning JSON structure), web search (Grounding), etc.).
  - The "Model List" page now includes "CLI Tool Compatibility Detection" (Beta) to simulate tool calling workflows for Claude Code / Codex CLI / Gemini CLI and assess interface compatibility within these tools.
  - The "About" page now includes "Rate and Download": automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entry points for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will now display the status code and error reason, aiding in problem localization.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce failures in obtaining Cookies due to insufficient permissions.

## 3.1.0
- **New Features:**
  - In self-managed API settings, added guidance for administrator credentials.
  - Redemption Assistant now supports batch redemption and single code retry.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing them to coexist normally with all functions available. This is mainly for sites with cookie-only authentication like AnyRouter.
  - Supports setting proxy and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed an incorrect web page path for manual check-ins on New-API sites.

## 2.39.0
- Automatically detects and modifies the check-in support status of account sites during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Directly select specific redemption accounts using the up/down arrow keys.
  - Confirm redemption by pressing Enter.
- Added a prompt to temporary anti-bot tabs, explaining that the tab originates from this plugin and its purpose.
- Improved display of anti-bot windows with single-window multi-tab functionality, reusing the same window for short-term requests to minimize interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added more lenient options for redemption code format detection, correctly identifying redemption codes and popping up the Redemption Assistant even with custom formats.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific channels for management.
- Fixed an issue that would reset the channel model synchronization time.

## 2.35.1
- Fixed an issue that would reset the automatic check-in execution time.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to remind users to redeem when copying any potential redemption codes.
- Added cdk.linux.do to the default URL whitelist for the Redemption Assistant.

## 3.24.0
- **New Features:**
  - Changelog: The plugin will no longer automatically open a new browser tab after an update. Instead, it will display the update content within the plugin via a popup on your first visit to the plugin interface, with an option to open the full changelog.
  - LDOH: A new shortcut `View in LDOH` (LDOH icon) has been added to the account list, allowing direct navigation to LDOH with the corresponding site automatically filtered. When adding an account, an option `Open LDOH Site List` is also provided to help find sites.
- **Experience Optimizations:**
  - Documentation Links: When opening documentation or changelogs from the plugin, it will now automatically redirect to the corresponding language version of the documentation page based on the current plugin language.

**Location Hints:**
- Changelog Toggle: Located in "Settings → General → Changelog" under `Automatically display update content after update`.
- Changelog Popup: Appears automatically after plugin updates, the first time you open the "Extension Popup / Settings Page / Sidebar" (once per version).
- LDOH Shortcut: To the right of the site name in the account list within "Account Management" (LDOH icon, prompts `View in LDOH`); you can also click `Open LDOH Site List` in the add account dialog.

## 3.23.0
- **New Features:**
  - Automatic Check-in: A `Quick Check-in` option has been added to the account action menu, allowing an immediate check-in for a single account and refreshing its status upon completion.
  - Key Management: A new `All Accounts` view aggregates keys by account group, facilitating cross-account search and copying.
  - Model Redirection: A new batch operation `Clear Model Redirection Mappings` allows for quick resetting of `model_mapping` after selecting a channel and confirming (irreversible).
- **Experience Optimizations:**
  - New API Channel Management: URLs in the channel list are now clickable, and the search experience has been optimized.
- **Bug Fixes:**
  - Channel Management: Fixed an issue with inaccurate prompt text for `Priority` in the channel dialog.
  - Model Redirection: Added a "version guard" to automatically generated mappings to prevent cross-version mismatches.
  - Sidebar: Automatically falls back to opening a popup/settings page when the runtime environment does not support the sidebar, preventing unresponsive clicks.

## 3.22.0
- **New Features:**
  - Model List: A new tool `Model Associated Keys` (key icon) has been added to check if a current model has available keys. If no keys are available, you can create a default key with one click based on the model's available groups, or proceed to a custom creation flow, with an option to copy the key with one click.
  - Share Snapshot: Supports one-click sharing of `Overview Snapshot` / `Account Snapshot`. It prioritizes copying the image to the clipboard, and automatically downloads a PNG if copying is not supported. Snapshots only contain shareable information (no sensitive fields like `API Key`) and include a one-click option to copy the title text.
- **Experience Optimizations:**
  - Disable Account: Disabled accounts are now automatically skipped in refresh and scheduled tasks such as `Balance History`, `Usage Analysis`, and `Usage Sync`, reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed an issue where the spinner was not visible when a button was in a "loading" state and also displayed a left-side icon.

**Location Hints:**
- Model Associated Keys: In "Settings → Model List", click the key icon next to the model name (`Model Associated Keys`).
- Share Overview Snapshot: In the title bar of the overview page in the extension popup, click the button on the right (`Share Overview Snapshot`).
- Share Account Snapshot: In the action menu for a specific account in "Settings → Account Management" (`Share Account Snapshot`).

## 3.21.0
- **New Features:**
  - API Credentials: A new "API Credentials" page has been added, suitable for scenarios where you only have `Base URL` + `API Key` without a full account. It supports unified management of tags/remarks, direct availability verification, and quick export (e.g., for Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added a multi-account view (Overview / Account Distribution / Trends) and a unified "Account Summary" table for quick comparison and aggregated statistics.
  - Self-Hosted Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for use in "Channel Management", "Model Sync", and other features.
- **Experience Optimizations:**
  - Context Menu: The "Redemption Assistant" and "AI API Detection" entries can now be toggled on/off independently, and the changes take effect immediately after switching.
  - Copy Key: When an account has no keys, the popup provides entries for "Quickly Create Default Key / Create Custom Key", reducing the need to navigate back and forth.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Done Hub` and fill in "Done Hub Integration Settings".
- Context Menu Entry Toggles: In "Settings → Basic Settings → Check-in & Redemption / AI API Testing", under their respective "Show in Browser Context Menu" options.
- Copy Key Popup: Opens when clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown options when adding a new key now display both the Group ID and description, facilitating quick differentiation and selection among multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" is now disabled. If you wish to generate a default key upon adding a new account, please enable it manually in the settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add Key" and view it in the group dropdown options.
- Auto-Create Default Key Toggle: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Hosted Site Management: Added support for `Octopus` hosted sites. After connecting to the Octopus backend, API keys can be imported as channels in "Channel Management", and available model lists can be fetched.
  - Key Management: Added `Automatically create default key after adding account` (enabled by default) and a one-click `Ensure at least one key` option to automatically complete default keys for accounts missing them.
  - AI API Testing: The `Probe Model List` in interface verification now supports interface types such as OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and provides suggestions for available model IDs, reducing manual model guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account identification logic for improved stability in scenarios with multiple accounts on the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-related interfaces to reduce errors caused by frequent refreshes or triggering site rate limits.
  - Channel Management: When creating a channel, more precise duplicate detection is performed, with a confirmation prompt to prevent accidental creation of duplicate routes.
- **Bug Fixes:**
  - Disable Account: Disabled accounts are now automatically filtered out from dropdowns/lists in Key Management and related sections, preventing invalid operations.
  - Language: Fixed an issue where the extension's language setting could affect the webpage's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Auto-Create Default Key Toggle: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Complete Default Key: In "Settings → Key Management", in the top right corner, click `Ensure at least one key`.
- AI API Testing Entry: Right-click menu in the webpage, select "Quickly test AI API functionality".

## 3.18.0
- **New Features:**
  - Balance History: The chart now includes a `Currency Unit` toggle (`USD` / `CNY`) and displays currency symbols on the axes and tooltips. When `CNY` is selected, it converts based on the account's `Recharge Amount Ratio` for easier trend viewing and reconciliation by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are too many tag/account options, it now defaults to "Expand to display", making browsing and selection more intuitive.
  - Tabs: Added left and right scroll buttons to the group tabs in "Settings" and the vendor tabs in "Model List" for easier switching in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Automatic Recognition" is now more accurate, fixing issues with frequently appearing unknown site types in recent versions.

**Location Hints:**
- Balance History Currency Unit: In "Settings → Balance History", in the filter area, select `Currency Unit`.
- Account Exchange Rate (Recharge Amount Ratio): In "Settings → Account Management", in the add/edit account form, find `Recharge Amount Ratio`.

## 3.17.0
- **New Features:**
  - Balance History: A new "Balance History" feature (disabled by default) records daily balance and income/expense snapshots, allowing you to view trends in charts. It supports filtering by tags/accounts and time range, and provides convenient "Refresh Now / Clear Now" operations.
  - Balance History: New settings allow control over enabling the feature, retention days, and "End-of-Day Fetch". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-Day Fetch", the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar in small or narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed a responsive display issue with the export area on some screen sizes.
  - Popup: Fixed a layout anomaly where the scrollbar position in popups was incorrect.

**Location Hints:**
- Balance History Toggle / Retention Days / End-of-Day Fetch: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added `Sub2API` site type, supporting balance/quota query. It supports reading login status from the console via "Automatic Recognition" and also supports the "Plugin Hosted Session (Multi-Account, Recommended)" mode, allowing independent authentication renewal for each account and improving the experience for multiple accounts on the same site.
  - Display Settings: Added a "Show Today's Income/Expenses" toggle (enabled by default). This hides and stops fetching statistics like "Today's Consumption/Income", reducing log fetching requests during refreshes.
- **Note:**
  - Sub2API currently does not support site check-in, daily usage, or income-related features, only basic balance/quota queries. Related features will be gradually added based on site capabilities.
  - "Plugin Hosted Session (Multi-Account)" saves the `refresh_token` as private account credentials and will be included in exports/WebDAV backups. Please keep backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Addition/Mode Explanation: In "Settings → Account Management", add/edit account, select Sub2API as the site type; for more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Toggle: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved the stability of background Service Workers, reducing the issue of asynchronous scheduled tasks (WebDAV auto-sync / Usage sync / Model sync / Auto check-in, etc.) being missed due to premature background termination. It also automatically restores related scheduled tasks after the browser restarts.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" for saving quick links to site consoles/documentation/management pages without needing to create a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now includes an "Accounts / Bookmarks" toggle. Bookmark data will be included in backups/restores and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests, reducing unnecessary network calls (some sites now return `today_income` in their refresh interface).
  - Auto Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is set to 30 seconds. Old configurations will be automatically corrected to a valid range after the update, and related prompts and documentation have been improved.

::: warning Important: Auto-Refresh Configuration Will Be Forced Adjusted
Due to feedback indicating that **overly short auto-refresh intervals can trigger site rate limits and place excessive load on sites**,

v3.15.0 **has made forced changes to the auto-refresh configuration**:
- Auto-refresh and refresh on plugin open features have been turned off. You will need to manually re-enable them if you still require them.
- The minimum `Refresh Interval` is now 60 seconds, and the `Minimum Refresh Interval Protection` is 30 seconds. If your settings before upgrading were below these thresholds, they will be automatically increased to the minimum values after the upgrade. If your previously set values are within the new legal range, they will remain unaffected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; you can toggle between "Accounts / Bookmarks" at the top of the popup.
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly test AI API functionality" to directly open a test panel on the current webpage. Supports filling in/pasting `Base URL` and `API Key`, and performs basic capability probing for OpenAI-compatible / OpenAI / Anthropic / Google interfaces (OpenAI-compatible also supports one-click model list fetching).
  - (Optional) Automatic Detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist. When a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (disabled by default, and keys are not saved).
  - Auto Check-in: The execution results list now includes more troubleshooting hints—including suggestions and documentation links for common exceptions like "Temporary anti-bot tab manually closed" and "Access Token invalid".
- **Bug Fixes:**
  - WebDAV: Auto-sync has been migrated from timers to the browser's Alarms API, reducing the probability of missed syncs caused by background sleep/power saving policies.

**Location Hints:**
- AI API Test Panel: Right-click menu on any webpage, select "Quickly test AI API functionality"; automatic detection settings are in "Settings → AI API Test".
- Auto Check-in Hints: View in the execution results list under "Settings → Auto Check-in".

## 3.13.0
- **New Features:**
  - Account Management: Added a "Check-in Status Expired" prompt. When the "Checked-in Today / Not Checked-in Today" status is not from the current day's detection, an orange warning icon will be displayed. Clicking it allows one-click refresh of the account data to avoid being misled by old status.
  - Interface: Multi-select controls have been upgraded to more compact selectors (space-saving, support search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and check-in logic, improving usability.
  - Cookie Authentication: Removed the Cookie caching mechanism, reducing issues caused by still reading old values after Cookie updates.

**Location Hints:**
- Check-in Status Expired Prompt: In "Settings → Account Management", in the account list, next to the site information's check-in icon.

## 3.12.0
- **New Features:**
  - Key Management: Added `Export to Kilo Code`. Generates `providerProfiles` configuration for Kilo Code / Roo Code, supporting copying `apiConfigs` snippets or downloading `settings.json` for import (imports are additive and will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by long text like site names, now automatically truncated.
  - Dropdown Selectors: Optimized empty state prompts and fixed overflow issues with long option text.

**Location Hints:**
- Export to Kilo Code: In "Settings → Key Management", in the key list, click the Kilo Code icon in the top right corner of a key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added `Duplicate Channel` reminder. When a duplicate or similar channel is detected, a warning dialog will pop up, allowing you to choose to continue creation or cancel (creation will no longer be blocked by error toasts).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by long text like site names, now automatically truncated.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will open within the current incognito window (to maintain incognito login state).
  - Account Management: Disabled accounts also support clicking site links, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, the chart and list prioritize displaying the site name (instead of username) for more intuitive information.
  - Anti-Bot Helper: The temporary anti-bot window now supports CAP (cap.js) Pow verification, improving success rates.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Notification Popups: Fixed Toaster layering issues, preventing notifications from being obscured by webpages.

**Location Hints:**
- Site Link: In "Settings → Account Management", click the site name in the account list.
- Anti-Bot Helper: Refer to [Cloudflare Anti-Bot Helper](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added a `Manual Balance (USD)` field. When a site cannot automatically fetch balance/quota, you can manually fill this in for display and statistics.
  - Account Management: Added an `Exclude from Total Balance` toggle. This removes specific accounts from the "Total Balance" statistics (does not affect refresh/check-in functions).
  - Settings: Added `Automatically open changelog after update` toggle (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether console logs are output and the minimum log level, facilitating troubleshooting.
  - Auto Check-in: After execution, related data will be refreshed, and the interface will be synchronized.

**Location Hints:**
- Add/Edit Account: Open add/edit account in "Settings → Account Management".
- Changelog Toggle, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added a "Usage Analysis" page to help you visualize usage trends across multiple sites and accounts, allowing you to quickly see "where you're spending more / using more / slowing down", facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (raw logs are not saved). Supports setting retention days, automatic sync methods, and minimum sync intervals, and allows viewing sync results and error prompts for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage", enable "Usage History Sync", set as needed, and click "Sync Now".
  - Then, view charts in the left-side menu "Usage Analysis"; click "Export" when you need to retain or reconcile data.

## 3.7.0
- **New Features:**
  - Sorting: The account list now supports sorting by "Income". The sorting priority has been updated to include "Disabled accounts at the bottom", preventing inactive/invalid accounts from interfering with your daily use.
  - Auto Check-in: Added "Trigger today's check-in early when opening the interface". When opening the popup/sidebar/settings page within the time window, it will automatically attempt to perform today's check-in early, without waiting for the scheduled time.
- **Bug Fixes:**
  - Auto Check-in: Each account will only be checked in once per day. Retries are only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Auto Check-in Early Trigger/Retry: Configure in the left-side menu "Auto Check-in".

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enabling/disabling of accounts. Disabled accounts will be skipped by all features, allowing data retention even after an account becomes invalid.
  - Tags: Added global tag management and synchronized optimizations to related interfaces and interactions for easier classification and management of accounts.
  - Popup: Displays the current version number in the title bar and provides a direct entry to this changelog.
  - Quick Export: CCSwitch export now supports selecting upstream models, making export configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to prevent unexpected results due to precision or rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Check-in" toggle (moved above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from dialog title icons for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would result in a blank screen.

## 3.5.0
- **New Features:**
  - Automatic Recognition: Added a "Detection Slow" prompt and related documentation links to help users troubleshoot and resolve issues.
  - Batch Open External Check-ins: Supports opening all in new windows, making batch closing easier and reducing interference.
- **Bug Fixes:**
  - Batch Open External Check-ins: The process has been refactored to execute in the background service, ensuring correct opening of all sites in popup scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to allow direct selection of upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always have the `sk-` prefix to avoid recognition/copying issues due to inconsistent formats.

## 3.3.0
- **New Features:**
  - Auto Check-in: Account identification now includes "Username" information, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the number of individual operations.
  - Auto Refresh: The minimum refresh interval no longer has a maximum limit, allowing larger minimum intervals to control frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce accidental triggers in non-copying scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying prompts, reducing invalid redemption notifications.
  - Storage: Added write locks to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text for "Copy Model Name".

## 3.2.0
- **New Features:**
  - The "Model List" page now includes "Interface Availability Detection" (Beta) to quickly confirm if the current key is usable for a specified model (e.g., text generation, tool/function calling, structured output (returning JSON structure), web search (Grounding), etc.).
  - The "Model List" page now includes "CLI Tool Compatibility Detection" (Beta) to simulate tool calling workflows for Claude Code / Codex CLI / Gemini CLI and assess interface compatibility within these tools.
  - The "About" page now includes "Rate and Download": automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entry points for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will now display the status code and error reason, aiding in problem localization.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce failures in obtaining Cookies due to insufficient permissions.

## 3.1.0
- **New Features:**
  - In self-managed API settings, added guidance for administrator credentials.
  - Redemption Assistant now supports batch redemption and single code retry.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing them to coexist normally with all functions available. This is mainly for sites with cookie-only authentication like AnyRouter.
  - Supports setting proxy and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed an incorrect web page path for manual check-ins on New-API sites.

## 2.39.0
- Automatically detects and modifies the check-in support status of account sites during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Directly select specific redemption accounts using the up/down arrow keys.
  - Confirm redemption by pressing Enter.
- Added a prompt to temporary anti-bot tabs, explaining that the tab originates from this plugin and its purpose.
- Improved display of anti-bot windows with single-window multi-tab functionality, reusing the same window for short-term requests to minimize interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added more lenient options for redemption code format detection, correctly identifying redemption codes and popping up the Redemption Assistant even with custom formats.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific channels for management.
- Fixed an issue that would reset the channel model synchronization time.

## 2.35.1
- Fixed an issue that would reset the automatic check-in execution time.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to remind users to redeem when copying any potential redemption codes.
- Added cdk.linux.do to the default URL whitelist for the Redemption Assistant.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error when comparing account IDs.
  - Ensured that all temporary contexts are closed correctly.

## 2.33.0
- **New Features:**
  - Introduced "Temporary Context Mode" for more effective bypassing of website protection.
  - API error messages are now internationalized.
  - Optimized website type detection, which can now be identified by the title of temporary windows.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation for refresh interval settings.
  - Fixed development dependency issues.

## 3.24.0
- **New Features:**
  - Changelog: The plugin will no longer automatically open a new browser tab after an update. Instead, it will display the update content within the plugin via a popup on your first visit to the plugin interface, with an option to open the full changelog.
  - LDOH: A new shortcut `View in LDOH` (LDOH icon) has been added to the account list, allowing direct navigation to LDOH with the corresponding site automatically filtered. When adding an account, an option `Open LDOH Site List` is also provided to help find sites.
- **Experience Optimizations:**
  - Documentation Links: When opening documentation or changelogs from the plugin, it will now automatically redirect to the corresponding language version of the documentation page based on the current plugin language.

**Location Hints:**
- Changelog Toggle: Located in "Settings → General → Changelog" under `Automatically display update content after update`.
- Changelog Popup: Appears automatically after plugin updates, the first time you open the "Extension Popup / Settings Page / Sidebar" (once per version).
- LDOH Shortcut: To the right of the site name in the account list within "Account Management" (LDOH icon, prompts `View in LDOH`); you can also click `Open LDOH Site List` in the add account dialog.

## 3.23.0
- **New Features:**
  - Automatic Check-in: A `Quick Check-in` option has been added to the account action menu, allowing an immediate check-in for a single account and refreshing its status upon completion.
  - Key Management: A new `All Accounts` view aggregates keys by account group, facilitating cross-account search and copying.
  - Model Redirection: A new batch operation `Clear Model Redirection Mappings` allows for quick resetting of `model_mapping` after selecting a channel and confirming (irreversible).
- **Experience Optimizations:**
  - New API Channel Management: URLs in the channel list are now clickable, and the search experience has been optimized.
- **Bug Fixes:**
  - Channel Management: Fixed an issue with inaccurate prompt text for `Priority` in the channel dialog.
  - Model Redirection: Added a "version guard" to automatically generated mappings to prevent cross-version mismatches.
  - Sidebar: Automatically falls back to opening a popup/settings page when the runtime environment does not support the sidebar, preventing unresponsive clicks.

## 3.22.0
- **New Features:**
  - Model List: A new tool `Model Associated Keys` (key icon) has been added to check if a current model has available keys. If no keys are available, you can create a default key with one click based on the model's available groups, or proceed to a custom creation flow, with an option to copy the key with one click.
  - Share Snapshot: Supports one-click sharing of `Overview Snapshot` / `Account Snapshot`. It prioritizes copying the image to the clipboard, and automatically downloads a PNG if copying is not supported. Snapshots only contain shareable information (no sensitive fields like `API Key`) and include a one-click option to copy the title text.
- **Experience Optimizations:**
  - Disable Account: Disabled accounts are now automatically skipped in refresh and scheduled tasks such as `Balance History`, `Usage Analysis`, and `Usage Sync`, reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed an issue where the spinner was not visible when a button was in a "loading" state and also displayed a left-side icon.

**Location Hints:**
- Model Associated Keys: In "Settings → Model List", click the key icon next to the model name (`Model Associated Keys`).
- Share Overview Snapshot: In the title bar of the overview page in the extension popup, click the button on the right (`Share Overview Snapshot`).
- Share Account Snapshot: In the action menu for a specific account in "Settings → Account Management" (`Share Account Snapshot`).

## 3.21.0
- **New Features:**
  - API Credentials: A new "API Credentials" page has been added, suitable for scenarios where you only have `Base URL` + `API Key` without a full account. It supports unified management of tags/remarks, direct availability verification, and quick export (e.g., for Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added a multi-account view (Overview / Account Distribution / Trends) and a unified "Account Summary" table for quick comparison and aggregated statistics.
  - Self-Hosted Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for use in "Channel Management", "Model Sync", and other features.
- **Experience Optimizations:**
  - Context Menu: The "Redemption Assistant" and "AI API Detection" entries can now be toggled on/off independently, and the changes take effect immediately after switching.
  - Copy Key: When an account has no keys, the popup provides entries for "Quickly Create Default Key / Create Custom Key", reducing the need to navigate back and forth.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Done Hub` and fill in "Done Hub Integration Settings".
- Context Menu Entry Toggles: In "Settings → Basic Settings → Check-in & Redemption / AI API Testing", under their respective "Show in Browser Context Menu" options.
- Copy Key Popup: Opens when clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown options when adding a new key now display both the Group ID and description, facilitating quick differentiation and selection among multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" is now disabled. If you wish to generate a default key upon adding a new account, please enable it manually in the settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add Key" and view it in the group dropdown options.
- Auto-Create Default Key Toggle: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Hosted Site Management: Added support for `Octopus` hosted sites. After connecting to the Octopus backend, API keys can be imported as channels in "Channel Management", and available model lists can be fetched.
  - Key Management: Added `Automatically create default key after adding account` (enabled by default) and a one-click `Ensure at least one key` option to automatically complete default keys for accounts missing them.
  - AI API Testing: The `Probe Model List` in interface verification now supports interface types such as OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and provides suggestions for available model IDs, reducing manual model guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account identification logic for improved stability in scenarios with multiple accounts on the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-related interfaces to reduce errors caused by frequent refreshes or triggering site rate limits.
  - Channel Management: When creating a channel, more precise duplicate detection is performed, with a confirmation prompt to prevent accidental creation of duplicate routes.
- **Bug Fixes:**
  - Disable Account: Disabled accounts are now automatically filtered out from dropdowns/lists in Key Management and related sections, preventing invalid operations.
  - Language: Fixed an issue where the extension's language setting could affect the webpage's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Auto-Create Default Key Toggle: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Complete Default Key: In "Settings → Key Management", in the top right corner, click `Ensure at least one key`.
- AI API Testing Entry: Right-click menu in the webpage, select "Quickly test AI API functionality".

## 3.18.0
- **New Features:**
  - Balance History: The chart now includes a `Currency Unit` toggle (`USD` / `CNY`) and displays currency symbols on the axes and tooltips. When `CNY` is selected, it converts based on the account's `Recharge Amount Ratio` for easier trend viewing and reconciliation by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are too many tag/account options, it now defaults to "Expand to display", making browsing and selection more intuitive.
  - Tabs: Added left and right scroll buttons to the group tabs in "Settings" and the vendor tabs in "Model List" for easier switching in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Automatic Recognition" is now more accurate, fixing issues with frequently appearing unknown site types in recent versions.

**Location Hints:**
- Balance History Currency Unit: In "Settings → Balance History", in the filter area, select `Currency Unit`.
- Account Exchange Rate (Recharge Amount Ratio): In "Settings → Account Management", in the add/edit account form, find `Recharge Amount Ratio`.

## 3.17.0
- **New Features:**
  - Balance History: A new "Balance History" feature (disabled by default) records daily balance and income/expense snapshots, allowing you to view trends in charts. It supports filtering by tags/accounts and time range, and provides convenient "Refresh Now / Clear Now" operations.
  - Balance History: New settings allow control over enabling the feature, retention days, and "End-of-Day Fetch". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-Day Fetch", the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar in small or narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed a responsive display issue with the export area on some screen sizes.
  - Popup: Fixed a layout anomaly where the scrollbar position in popups was incorrect.

**Location Hints:**
- Balance History Toggle / Retention Days / End-of-Day Fetch: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added `Sub2API` site type, supporting balance/quota query. It supports reading login status from the console via "Automatic Recognition" and also supports the "Plugin Hosted Session (Multi-Account, Recommended)" mode, allowing independent authentication renewal for each account and improving the experience for multiple accounts on the same site.
  - Display Settings: Added a "Show Today's Income/Expenses" toggle (enabled by default). This hides and stops fetching statistics like "Today's Consumption/Income", reducing log fetching requests during refreshes.
- **Note:**
  - Sub2API currently does not support site check-in, daily usage, or income-related features, only basic balance/quota queries. Related features will be gradually added based on site capabilities.
  - "Plugin Hosted Session (Multi-Account)" saves the `refresh_token` as private account credentials and will be included in exports/WebDAV backups. Please keep backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Addition/Mode Explanation: In "Settings → Account Management", add/edit account, select Sub2API as the site type; for more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Toggle: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved the stability of background Service Workers, reducing the issue of asynchronous scheduled tasks (WebDAV auto-sync / Usage sync / Model sync / Auto check-in, etc.) being missed due to premature background termination. It also automatically restores related scheduled tasks after the browser restarts.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" for saving quick links to site consoles/documentation/management pages without needing to create a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now includes an "Accounts / Bookmarks" toggle. Bookmark data will be included in backups/restores and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests, reducing unnecessary network calls (some sites now return `today_income` in their refresh interface).
  - Auto Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is set to 30 seconds. Old configurations will be automatically corrected to a valid range after the update, and related prompts and documentation have been improved.

::: warning Important: Auto-Refresh Configuration Will Be Forced Adjusted
Due to feedback indicating that **overly short auto-refresh intervals can trigger site rate limits and place excessive load on sites**,

v3.15.0 **has made forced changes to the auto-refresh configuration**:
- Auto-refresh and refresh on plugin open features have been turned off. You will need to manually re-enable them if you still require them.
- The minimum `Refresh Interval` is now 60 seconds, and the `Minimum Refresh Interval Protection` is 30 seconds. If your settings before upgrading were below these thresholds, they will be automatically increased to the minimum values after the upgrade. If your previously set values are within the new legal range, they will remain unaffected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; you can toggle between "Accounts / Bookmarks" at the top of the popup.
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly test AI API functionality" to directly open a test panel on the current webpage. Supports filling in/pasting `Base URL` and `API Key`, and performs basic capability probing for OpenAI-compatible / OpenAI / Anthropic / Google interfaces (OpenAI-compatible also supports one-click model list fetching).
  - (Optional) Automatic Detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist. When a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (disabled by default, and keys are not saved).
  - Auto Check-in: The execution results list now includes more troubleshooting hints—including suggestions and documentation links for common exceptions like "Temporary anti-bot tab manually closed" and "Access Token invalid".
- **Bug Fixes:**
  - WebDAV: Auto-sync has been migrated from timers to the browser's Alarms API, reducing the probability of missed syncs caused by background sleep/power saving policies.

**Location Hints:**
- AI API Test Panel: Right-click menu on any webpage, select "Quickly test AI API functionality"; automatic detection settings are in "Settings → AI API Test".
- Auto Check-in Hints: View in the execution results list under "Settings → Auto Check-in".

## 3.13.0
- **New Features:**
  - Account Management: Added a "Check-in Status Expired" prompt. When the "Checked-in Today / Not Checked-in Today" status is not from the current day's detection, an orange warning icon will be displayed. Clicking it allows one-click refresh of the account data to avoid being misled by old status.
  - Interface: Multi-select controls have been upgraded to more compact selectors (space-saving, support search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and check-in logic, improving usability.
  - Cookie Authentication: Removed the Cookie caching mechanism, reducing issues caused by still reading old values after Cookie updates.

**Location Hints:**
- Check-in Status Expired Prompt: In "Settings → Account Management", in the account list, next to the site information's check-in icon.

## 3.12.0
- **New Features:**
  - Key Management: Added `Export to Kilo Code`. Generates `providerProfiles` configuration for Kilo Code / Roo Code, supporting copying `apiConfigs` snippets or downloading `settings.json` for import (imports are additive and will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by long text like site names, now automatically truncated.
  - Dropdown Selectors: Optimized empty state prompts and fixed overflow issues with long option text.

**Location Hints:**
- Export to Kilo Code: In "Settings → Key Management", in the key list, click the Kilo Code icon in the top right corner of a key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added `Duplicate Channel` reminder. When a duplicate or similar channel is detected, a warning dialog will pop up, allowing you to choose to continue creation or cancel (creation will no longer be blocked by error toasts).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by long text like site names, now automatically truncated.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will open within the current incognito window (to maintain incognito login state).
  - Account Management: Disabled accounts also support clicking site links, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, the chart and list prioritize displaying the site name (instead of username) for more intuitive information.
  - Anti-Bot Helper: The temporary anti-bot window now supports CAP (cap.js) Pow verification, improving success rates.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Notification Popups: Fixed Toaster layering issues, preventing notifications from being obscured by webpages.

**Location Hints:**
- Site Link: In "Settings → Account Management", click the site name in the account list.
- Anti-Bot Helper: Refer to [Cloudflare Anti-Bot Helper](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added a `Manual Balance (USD)` field. When a site cannot automatically fetch balance/quota, you can manually fill this in for display and statistics.
  - Account Management: Added an `Exclude from Total Balance` toggle. This removes specific accounts from the "Total Balance" statistics (does not affect refresh/check-in functions).
  - Settings: Added `Automatically open changelog after update` toggle (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether console logs are output and the minimum log level, facilitating troubleshooting.
  - Auto Check-in: After execution, related data will be refreshed, and the interface will be synchronized.

**Location Hints:**
- Add/Edit Account: Open add/edit account in "Settings → Account Management".
- Changelog Toggle, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added a "Usage Analysis" page to help you visualize usage trends across multiple sites and accounts, allowing you to quickly see "where you're spending more / using more / slowing down", facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (raw logs are not saved). Supports setting retention days, automatic sync methods, and minimum sync intervals, and allows viewing sync results and error prompts for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage", enable "Usage History Sync", set as needed, and click "Sync Now".
  - Then, view charts in the left-side menu "Usage Analysis"; click "Export" when you need to retain or reconcile data.

## 3.7.0
- **New Features:**
  - Sorting: The account list now supports sorting by "Income". The sorting priority has been updated to include "Disabled accounts at the bottom", preventing inactive/invalid accounts from interfering with your daily use.
  - Auto Check-in: Added "Trigger today's check-in early when opening the interface". When opening the popup/sidebar/settings page within the time window, it will automatically attempt to perform today's check-in early, without waiting for the scheduled time.
- **Bug Fixes:**
  - Auto Check-in: Each account will only be checked in once per day. Retries are only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Auto Check-in Early Trigger/Retry: Configure in the left-side menu "Auto Check-in".

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enabling/disabling of accounts. Disabled accounts will be skipped by all features, allowing data retention even after an account becomes invalid.
  - Tags: Added global tag management and synchronized optimizations to related interfaces and interactions for easier classification and management of accounts.
  - Popup: Displays the current version number in the title bar and provides a direct entry to this changelog.
  - Quick Export: CCSwitch export now supports selecting upstream models, making export configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to prevent unexpected results due to precision or rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Check-in" toggle (moved above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from dialog title icons for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would result in a blank screen.

## 3.5.0
- **New Features:**
  - Automatic Recognition: Added a "Detection Slow" prompt and related documentation links to help users troubleshoot and resolve issues.
  - Batch Open External Check-ins: Supports opening all in new windows, making batch closing easier and reducing interference.
- **Bug Fixes:**
  - Batch Open External Check-ins: The process has been refactored to execute in the background service, ensuring correct opening of all sites in popup scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to allow direct selection of upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always have the `sk-` prefix to avoid recognition/copying issues due to inconsistent formats.

## 3.3.0
- **New Features:**
  - Auto Check-in: Account identification now includes "Username" information, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the number of individual operations.
  - Auto Refresh: The minimum refresh interval no longer has a maximum limit, allowing larger minimum intervals to control frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce accidental triggers in non-copying scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying prompts, reducing invalid redemption notifications.
  - Storage: Added write locks to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text for "Copy Model Name".

## 3.2.0
- **New Features:**
  - The "Model List" page now includes "Interface Availability Detection" (Beta) to quickly confirm if the current key is usable for a specified model (e.g., text generation, tool/function calling, structured output (returning JSON structure), web search (Grounding), etc.).
  - The "Model List" page now includes "CLI Tool Compatibility Detection" (Beta) to simulate tool calling workflows for Claude Code / Codex CLI / Gemini CLI and assess interface compatibility within these tools.
  - The "About" page now includes "Rate and Download": automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entry points for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will now display the status code and error reason, aiding in problem localization.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce failures in obtaining Cookies due to insufficient permissions.

## 3.1.0
- **New Features:**
  - In self-managed API settings, added guidance for administrator credentials.
  - Redemption Assistant now supports batch redemption and single code retry.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing them to coexist normally with all functions available. This is mainly for sites with cookie-only authentication like AnyRouter.
  - Supports setting proxy and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed an incorrect web page path for manual check-ins on New-API sites.

## 2.39.0
- Automatically detects and modifies the check-in support status of account sites during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Directly select specific redemption accounts using the up/down arrow keys.
  - Confirm redemption by pressing Enter.
- Added a prompt to temporary anti-bot tabs, explaining that the tab originates from this plugin and its purpose.
- Improved display of anti-bot windows with single-window multi-tab functionality, reusing the same window for short-term requests to minimize interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added more lenient options for redemption code format detection, correctly identifying redemption codes and popping up the Redemption Assistant even with custom formats.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific channels for management.
- Fixed an issue that would reset the channel model synchronization time.

## 2.35.1
- Fixed an issue that would reset the automatic check-in execution time.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to remind users to redeem when copying any potential redemption codes.
- Added cdk.linux.do to the default URL whitelist for the Redemption Assistant.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error when comparing account IDs.
  - Ensured that all temporary contexts are closed correctly.

## 2.33.0
- **New Features:**
  - Introduced "Temporary Context Mode" for more effective bypassing of website protection.
  - API error messages are now internationalized.
  - Optimized website type detection, which can now be identified by the title of temporary windows.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation for refresh interval settings.
  - Fixed development dependency issues.

## 2.32.0
- **New Features:**
  - Model redirection is now smarter, supporting version numbers represented by hyphens and dots.
  - Added the ability to directly redeem via the right-click menu after selecting text.
  - Auto check-in is enabled by default, and the check-in time window has been extended.

## 2.31.0
- **New Features:**
  - Enhanced cookie isolation for temporary windows, improving security.
  - Check-in operations can now be quickly performed within the popup.
  - Redemption Assistant now supports a URL whitelist feature, giving you better control over which websites can use it.

## 2.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capabilities for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, and restoration includes a decryption retry popup, while preserving your WebDAV configuration.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website cookie interception during automatic detection.
  - Optimized centering of empty state content in Firefox.
  - Migrated the Switch component to a custom implementation for improved compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced "Hosted Sites" service, laying the groundwork for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" in settings to "Hosted Sites" for clarity.
- **Bug Fixes:**
  - Optimized translation text, removing redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes for easier problem identification.
  - Temporary window bypass feature now includes a health status indicator.
  - Optimized descriptions for bypassing website protection to make them clearer and easier to understand.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed display issues with Firefox popup prompts in Chinese settings.
- **Performance Optimizations:**
  - Improved the performance of the sorting function.

## 2.26.0
- **New Features:**
  - Added a model pricing cache service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Model pricing information for multiple accounts can now be displayed simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 2.25.0
- **New Features:**
  - Added a new user guide card when the account list is empty.
  - When the pin/manual sort feature is disabled, related UI elements will automatically hide.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

## 2.24.0
- **New Features:**
  - Updated application description and about page content.
  - Extension name now includes a subtitle.
  - Tag filter now includes visibility control based on line count.
  - WebDAV connection tests now support more success status codes.
- **Bug Fixes:**
  - Removed extra periods at the end of JSON strings.

## 2.23.0
- **New Features:**
  - Enhanced account tagging functionality.
  - Temporary window bypass feature now supports more intelligent judgment based on error codes.

## 2.22.0
- **New Features:**
  - Account management now includes a tagging feature for easy account classification.
  - The Redemption Assistant popup UI now supports lazy loading and fixes issues that could cause website style conflicts.
  - Added global channel filter and JSON editing mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed duplicate "Already checked in today" checks in auto check-in.
  - Simplified and fixed the temporary window fetching logic.
  - Restored the parsing functionality for search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guidance during initial installation to help users understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed an issue with operation buttons overflowing in the account dialog.
  - Redemption amount conversion factors now use constants for improved accuracy.
  - Limited the Cookie interceptor to use only in Firefox browsers.

## 2.19.0
- **New Features:**
  - Added loading status and prompt messages during redemption.
  - Removed clipboard reading functionality from the Redemption Assistant.
- **Bug Fixes:**
  - Added missing background error message translations.
  - Prevented concurrent initialization and race conditions, improving stability.
  - Resolved intermittent "Unable to establish connection" errors.
  - Prevented race conditions during the destruction of the temporary window pool.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Assistant feature.
  - Firefox browsers now support WebRequest-based cookie injection.
  - Redemption functionality now supports themes and optimized prompt messages.
  - Redemption prompts now include source information and settings links.
- **Bug Fixes:**
  - Fixed path issues with Tailwind CSS files.

## 2.17.0
- **New Features:**
  - Added one-click redemption automatic popup prompts.
  - Unified data format for import/export and WebDAV backups using a V2 versioning scheme for improved compatibility and stability.

## 2.16.0
- **New Features:**
  - Added warning prompts when creating accounts in Firefox desktop.
  - API model synchronization now supports a channel filtering system.

## 2.15.0
- **New Features:**
  - MultiSelect component now supports parsing comma-separated strings.
- **Bug Fixes:**
  - Ensured caching only occurs during full channel data synchronization.
- **Performance Optimizations:**
  - Optimized upstream model caching logic.

## 2.14.0
- **New Features:**
  - Site metadata will be automatically detected during refresh.
  - When auto check-in fails, new retry and manual check-in options are available.
  - Enhanced auto check-in functionality, including retry strategies, skip reasons, and account snapshots.
  - Optimized auto check-in execution method to concurrent processing for improved efficiency.
- **Bug Fixes:**
  - Fixed the default behavior issue of the `autoCheckInEnabled` flag.

## 2.13.0
- **New Features:**
  - Added "New API Channel Management" functionality.
  - Added a "Warning" button style.
  - Introduced Radix UI components and Tanstack Table for improved interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed incorrect display and sorting of model counts in the channel table.

## 2.12.1
- **Bug Fixes:**
  - Fixed unnecessary reloading of channels when manually selecting tabs.
  - The "New API Model Sync" option is hidden in the sidebar when the configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Sync" now includes a model allowlist filtering feature.
  - The sidebar now supports collapsing/expanding with smooth animations.

## 2.11.0
- **New Features:**
  - Account management functionality has been enhanced with search capabilities and navigation optimizations.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed logic errors in auto check-in status.

## 2.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanisms for improved communication stability.
  - Model synchronization now includes a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured that missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection and automatically attempts to bypass using temporary windows when protection is encountered.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized dropdown menu positioning and accessibility for multi-select components.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can be saved even if data retrieval fails during manual account addition.
  - The settings page now includes a "Settings Partition" feature for resetting settings by section.

## 2.7.1
- **Bug Fixes:**
  - Fixed an issue where redirected models did not appear in the model list during API synchronization.

## 2.7.0
- **New Features:**
  - The account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hid the password visibility button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - User preferences such as `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now mandatory to ensure complete default configurations.
- **Bug Fixes:**
  - Enhanced robustness of configuration migration checks.
  - Fixed the issue of missing "New API Preferences" in configuration checks.
  - Corrected check-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 2.6.0
- **New Features:**
  - The user interface for "New API Channel Import" has been optimized to support key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process for improved accuracy.
- **Bug Fixes:**
  - Model name standardization is now consistent with the Veloera backend and preserves hyphens.
  - Resolved browser storage quota issues and improved model matching.

## 2.5.0
- **New Features:**
  - Added support for the Neo-API site type.
- **Bug Fixes:**
  - Fixed Base64 encoding issues during CherryStudio URL generation.
  - Removed redundant account retrieval and token verification from the channel dialog for improved efficiency.

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
  - Added account pinning and unpinning functionality, with pinned accounts prioritized in sorting.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration by increasing the priority of the current site condition.

## 2.2.1
- **Bug Fixes:**
  - Removed the `isDetected` check for the auto-configuration button.
  - Ensured that account detection correctly refreshes when displayed data changes.
  - Fixed the issue where Access Token is no longer required for Cookie authentication types.

## 2.2.0
- **New Features:**
  - Auto check-in functionality now includes a results/history interface, with optimized default settings and user experience.
  - Implemented daily site auto check-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case sensitivity issues in auto check-in status detection.
  - Handled edge cases in check-in time window calculation.

## 2.1.0
- **New Features:**
  - Account list now includes username search and highlighting functionality.
- **Bug Fixes:**
  - Added configuration validation warnings when API settings are missing.
  - "New API" features now include configuration validation assistance and internationalized error messages.

## 2.0.0
- **New Features:**
  - The "New API Model Sync" filter bar now includes execution statistics.
  - Each row in the results table now has a sync operation button.
  - Implemented the initial service, background logic, and settings interface for "New API Model Sync".
- **Bug Fixes:**
  - Row retry operations now only update target and progress UI.
  - Updated channel list response handling and types.

## 1.38.0
- **New Features:**
  - Supports pinning accounts with custom check-in or redemption URLs.
  - Added custom redemption and opening tab matching as sorting rules.
- **Bug Fixes:**
  - Ensured deep copying of default sorting rules.
  - New sorting conditions are disabled by default after migration.

## 1.37.0
- **New Features:**
  - Account search functionality has been enhanced to support multi-field composite searches across different UI interfaces.
  - Added the functionality to open the sidebar.
- **Bug Fixes:**
  - Added translation for the "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with redemption page paths and support navigation.
  - Option to automatically open the redemption page after check-in.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - Check-in icon updated to a "Yen" icon for better clarity.
- **Bug Fixes:**
  - Custom check-in accounts now automatically reset their check-in status daily.
  - Fixed the default value issue for the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic synchronization of account data using a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` for improved cross-browser compatibility and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced a reusable `AppLayout` component for enhanced interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed incorrect width of the right content container on small screens.

## 1.32.0
- **New Features:**
  - Improved layout and responsiveness of the account management interface.
  - Added configurable React DevTools auto-plugin and caching.
- **Bug Fixes:**
  - Fixed `z-index` issue for the mobile sidebar overlay.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Account management now includes a "Create Account" button and optimized layout.
  - Account management now includes a "Usage Log" feature.
  - Sorting priority settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fixes:**
  - Updated the size and accessibility labels for SiteInfo icon buttons.

## 1.30.0
- **New Features:**
  - Dialog components replaced with custom `Modal` components for improved consistency.
  - Introduced a comprehensive UI component library for enhanced interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priority.
  - Optimized the transparency and layering of the mobile sidebar overlay for an improved user experience.

## 1.29.0
- **New Features:**
  - Popups now support detection and automatic closing.
  - Popups now feature responsive mobile layout to avoid zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent automatic detection.
  - Migrated `chrome.*` APIs to `browser.*` APIs for enhanced cross-browser compatibility and optimized error handling.
  - Ensured full functional compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed `tabId` parsing issues after window creation.
  - Prevented rotation animation on button borders during refresh.

## 1.27.0
- **New Features:**
  - After successful automatic configuration to New API, the account dialog will automatically close.
  - Implemented dynamic loading of localization resources for improved internationalization support.
- **Bug Fixes:**
  - Added internationalization support for error messages.
  - Fixed syntax errors in currency switching templates for Chinese and English.

## 1.26.0
- **Bug Fixes:**
  - Account error messages now support internationalization.
  - Replaced hardcoded Chinese text in `newApiService` with internationalization keys.

## 1.25.0
- **New Features:**
  - Improved accessibility of the WebDAV settings form.
- **Bug Fixes:**
  - Replaced hardcoded Chinese text in the `TokenHeader` prompt with translation keys.

## 1.24.0
- **New Features:**
  - Added health status translation keys and refactored error messages.
  - `dayjs` localization now updates with language switching.

## 1.23.2
- **Bug Fixes:**
  - Fixed logic errors in Chinese Yuan currency conversion.

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
  - Fixed rendering logic for the custom URL check-in interface.
  - Corrected check-in field names and return structures.

## 1.21.0
- **New Features:**
  - Added favicon and extension icons for popup, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and popup operations.
  - Migrated the underlying framework from Plasmo to WXT for better performance and development experience.

## 1.20.0
- **New Features:**
  - Added refresh functionality for balance and health status indicators.
  - Unified and optimized operation button UI, supporting intelligent key handling.

## 1.19.0
- **New Features:**
  - All components now support dark mode.
  - Implemented a theme system supporting dark, light, and system-following modes.
- **Bug Fixes:**
  - API configuration interface now requires the `authType` field.

## 1.18.0
- **New Features:**
  - Accounts now include a custom check-in button (with a Yen icon).
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting functionality now includes custom check-in URLs as a sorting condition.
- **Bug Fixes:**
  - Fixed an issue where custom check-in URLs were not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication types.
  - Added "No Authentication" type to API authentication options.
  - Tooltip component migrated to the `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" functionality now supports automatic account configuration.
  - Site accounts now support check-in functionality.
  - Implemented a customizable sorting priority system.

## 1.15.0
- **Bug Fixes:**
  - Fixed an issue where unnecessary updates and notifications were triggered even when values did not change.

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
  - Refresh functionality enhanced to support detailed status tracking.
  - Added minimum refresh interval to prevent frequent requests.

## 1.10.0
- **New Features:**
  - Key copy functionality now includes Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub token management and data retrieval functionality.
  - Added user group data transformation and API integration.
  - Implemented model retrieval functionality for OneHub sites.

## 1.8.0
- **New Features:**
  - Account management now supports site types.
  - Added site type detection and optimized the automatic detection process.
  - Implemented model pricing functionality for OneHub sites.

## 1.7.1
- **Bug Fixes:**
  - Fixed a logic error in using site status detection for check-in support.

## 1.7.0
- **New Features:**
  - Added check-in support detection and switching functionality.
  - Accounts now support check-in status.

## 1.6.0
- **New Features:**
  - Account management now supports a remarks field.

## 1.5.0
- **Performance Optimizations:**
  - Optimized the rendering method of the model list for improved loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed an issue where the detected account status was reset when no existing accounts were found.

## 1.4.0
- **New Features:**
  - Control panel now includes a "Copy Model Name" function.
  - Added support for Baidu and Yi model providers.

## 1.3.1
- **Bug Fixes:**
  - Updated release PR workflow configuration.

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
  - Added manual account addition support and optimized the UI flow.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and warning prompts when adding accounts.
  - Introduced sidebar functionality, replacing popup-based automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized account identification process, now supporting automatic access key creation.
  - Account list now includes sortable headers, copy key dialogs, and hover action buttons.
  - Account management now includes a remarks field.
  - Website names are now clickable for navigation.
  - Model list supports grouped selection.
  - Popup pages feature number rolling animations and site status indicators.
  - Optimized add/edit account dialogs, including recharge ratio settings and automatic site name extraction.
  - Fully implemented the settings page system, supporting user preference persistence and automatic refresh.
  - Enhanced frontend interface and backend service for automatic refresh functionality.
  - Access keys automatically have the `sk-` prefix added upon copying.
  - Introduced industry-standard tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Supported more AI model providers (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Popup interface refactored to API Manager style, adding display of total daily consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed issues with incompatible model data formats, `localStorage` access, and API request credentials.
  - Corrected API authentication methods.
  - Optimized URL input handling and automatic refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**