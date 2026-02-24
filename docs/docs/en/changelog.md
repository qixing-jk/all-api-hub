# Changelog

This page records the main updates for general users (feature changes / experience optimizations / bug fixes). For the complete history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip For New Users
- **How to confirm your current version**: Open the extension popup; the version number will be displayed in the title bar. You can also check it on the settings page.
- **How to stop this page from opening automatically**: You can control whether to "Automatically open changelog after update" in "Settings → General → Changelog".
- **Troubleshooting**: In "Settings → General → Logs", you can enable console logs and submit reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.23.0
- **New Features:**
  - Auto Sign-in: A `Quick Sign-in` option has been added to the account actions menu, allowing an immediate sign-in for a single account and status refresh upon completion.
  - Key Management: A new `All Accounts` view aggregates keys by account, facilitating cross-account search and copying.
  - Model Redirection: A new `Clear Model Redirection Mappings` bulk action allows quick resetting of `model_mapping` by channel selection and secondary confirmation (irreversible).
- **Experience Optimizations:**
  - New API Channel Management: URLs in the channel list are now clickable, and the search experience has been improved.
- **Bug Fixes:**
  - Channel Management: Fixed an inaccurate prompt for `Priority` in the channel dialog.
  - Model Redirection: Added a "version guard" to automatically generated mappings to prevent cross-version misidentification.
  - Sidebar: Automatically falls back to opening a popup/settings page when the runtime environment does not support a sidebar, preventing unresponsive clicks.

## 3.22.0
- **New Features:**
  - Model List: Added a "Model-to-Key Mapping" tool (key icon) to check for available keys for the current model. If no keys are available, you can create a default key with one click based on available groups, or enter a custom creation flow, with support for one-click key copying.
  - Share Snapshot: Supports one-click sharing of "Overview Snapshot / Account Snapshot". It prioritizes copying the image to the clipboard, and automatically downloads a PNG if copying is not supported. Snapshots only contain shareable information (no sensitive fields like `API Key`) and allow one-click title text copying.
- **Experience Optimizations:**
  - Disable Account: Disabled accounts are now automatically skipped in refresh and scheduled tasks like "Balance History / Usage Analysis / Usage Sync", reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed an issue where the spinner was not visible for buttons in a "loading" state when also displaying a left-side icon.

**Location Tips:**
- Model-to-Key Mapping: In "Settings → Model List", click the key icon ( `Model-to-Key Mapping` ) to the right of the model name.
- Share Overview Snapshot: The button to the right of the title bar on the extension popup's overview page ( `Share Overview Snapshot` ).
- Share Account Snapshot: In the action menu for a single account in "Settings → Account Management" ( `Share Account Snapshot` ).

## 3.21.0
- **New Features:**
  - API Credentials: Added an "API Credentials" page, suitable for scenarios where you only have a `Base URL` + `API Key` without an account. It supports unified management of tags/remarks, direct availability verification, and quick export (e.g., Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added multi-account views (Overview / Account Distribution / Trends) and a unified "Account Summary" table for quick comparison and aggregated statistics.
  - Self-Hosted Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for functions like "Channel Management" and "Model Sync".
- **Experience Optimizations:**
  - Context Menu: "Redemption Assistant" and "AI API Detection" entries can now be individually enabled/disabled and take effect immediately after switching.
  - Copy Key: When an account has no keys, the popup provides entries for "Quickly Create Default Key / Custom Key Creation", reducing navigation.

**Location Tips:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Done Hub` and fill in "Done Hub Integration Settings".
- Context Menu Entry Toggle: In "Settings → Basic Settings → Sign-in and Redemption / AI API Testing", under "Show in Browser Context Menu" respectively.
- Copy Key Popup: Opened by clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown options when adding a key now display both the Group ID and description, facilitating quick differentiation and selection across multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" is now disabled. If you wish to automatically generate a default key upon adding an account, please enable it manually in settings.

**Location Tips:**
- Group ID Display: In "Settings → Key Management", click "Add Key", and view it in the group dropdown options.
- Auto-Create Default Key Toggle: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Hosted Site Management: Added support for `Octopus` hosted sites. You can connect to the Octopus backend and import account API keys as channels in "Channel Management", with support for fetching available model lists.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default) and a one-click "Ensure at least one key exists" to automatically populate default keys for accounts missing them.
  - AI API Testing: The "Model List Probing" for interface verification now supports OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and other interface types, providing suggested model IDs to reduce manual guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account identification logic for improved stability in scenarios with multiple accounts on the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-related interfaces to reduce errors caused by frequent refreshes or triggering site rate limits.
  - Channel Management: When creating a channel, performs more precise duplicate detection and provides a confirmation prompt to prevent accidental creation of duplicate routes.
- **Bug Fixes:**
  - Disable Account: Disabled accounts are now automatically filtered out from relevant dropdowns/lists in Key Management and other sections, preventing invalid operations.
  - Language: Fixed an issue where the extension's language setting might affect the webpage's own language value.

**Location Tips:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Octopus` and fill in "Base URL" / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Auto-Create Default Key Toggle: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Populate Default Key: In "Settings → Key Management", at the top right, "Ensure at least one key exists".
- AI API Testing Entry: In the browser context menu, "Quickly Test AI API Functionality".

## 3.18.0
- **New Features:**
  - Balance History: Charts now support switching between "Currency Units" (`USD` / `CNY`) and display currency symbols on axes/tooltips. When `CNY` is selected, it converts based on the account's "Recharge Amount Ratio" for easier trend viewing and reconciliation by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are too many tag/account options, it defaults to "Expand to show", making browsing and selection more intuitive.
  - Tabs: Added left and right scroll buttons to vendor tags in "Settings" groups and "Model List" for easier switching in narrow windows.
- **Bug Fixes:**
  - Account Management: More accurate "Auto-detect" for site types, fixing the issue of unknown site types appearing frequently in recent versions.

**Location Tips:**
- Balance History Currency Unit: In "Settings → Balance History" page, in the filter area, "Currency Unit".
- Account Exchange Rate (Recharge Amount Ratio): In "Settings → Account Management", in the add/edit account form, "Recharge Amount Ratio".

## 3.17.0
- **New Features:**
  - Balance History: Added "Balance History" feature (disabled by default). It records daily balance and income/expense snapshots, allowing you to view trends in charts. Supports filtering by tags/accounts and time range, with convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added a setting to control whether to enable it, the retention days, and "End-of-Day Fetch". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-Day Fetch", the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar in small/narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed responsive display issues for the export area on some screen sizes.
  - Popup: Fixed layout anomalies with incorrect scrollbar positions in popups.

**Location Tips:**
- Balance History Switch/Retention Days/End-of-Day Fetch: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added Sub2API site type, supporting balance/quota queries. Supports reading login status from the console via "Auto-detect". Also supports "Plugin Hosted Session (Multiple Accounts, Recommended)" mode, allowing independent authentication renewal for each account, improving the experience for multiple accounts on the same site.
  - Display Settings: Added "Show Today's Income/Expenses" switch (enabled by default). This hides and stops fetching statistics like "Today's Consumption/Income", reducing log fetching requests during refreshes.
- **Note:**
  - Sub2API currently does not support site sign-in, today's usage, or income-related functions, only basic balance/quota queries. Related functions will be gradually improved based on site capabilities.
  - "Plugin Hosted Session (Multiple Accounts)" saves `refresh_token` as private account credentials and will be included in exports/WebDAV backups. Please keep backup files and WebDAV credentials secure.

**Location Tips:**
- Sub2API Addition/Mode Explanation: In "Settings → Account Management", add/edit account, select Sub2API as the site type. For more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved the stability of background Service Workers, reducing issues where asynchronous timed tasks (WebDAV auto-sync / Usage sync / Model sync / Auto sign-in, etc.) were missed due to premature background termination. Automatically resumes related timed tasks after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" to save quick links to site consoles/documentation/management pages without creating a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now has "Account / Bookmarks" switching. Bookmark data will be included in backup/restore and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests to reduce unnecessary network calls (some sites now return `today_income` in their refresh interface).
  - Auto Refresh: Minimum refresh interval set to 60 seconds, and minimum refresh interval protection set to 30 seconds. Old configurations will be automatically corrected to a valid range after update, with improved prompt text and documentation.

::: warning Important: Auto-Refresh Configuration Will Be Forced Adjusted
Due to feedback indicating that **overly short auto-refresh intervals can easily trigger site rate limits and cause excessive load on sites**,

v3.15.0 **has made forced adjustments to the auto-refresh configuration**:
- Auto-refresh and refresh on plugin open features have been turned off. If you still need them, you must manually re-enable them.
- `Refresh Interval` minimum is 60 seconds, and `Minimum Refresh Interval Protection` is 30 seconds. If your pre-upgrade setting was below these thresholds, it will be automatically raised to the minimum value after upgrading. If your previous setting was within the new valid range, it will remain unaffected.
:::

**Location Tips:**
- Bookmark Management: In "Settings → Bookmark Management"; the top of the popup allows switching between "Account / Bookmarks".
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a context menu option "Quickly Test AI API Functionality" to directly open the test panel on the current webpage. Supports filling/pasting `Base URL` and `API Key`, and performs basic capability probing for OpenAI compatible / OpenAI / Anthropic / Google, etc. interfaces (OpenAI compatible also supports one-click model list fetching).
  - (Optional) Auto-Detection: Can be enabled in "Settings → AI API Testing" and configured with a URL whitelist. When a valid `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (disabled by default, and keys are not saved).
  - Auto Sign-in: The execution results list now includes more troubleshooting hints, such as "Temporary shield bypass tab manually closed" and "Access Token invalid", with suggestions and documentation links for common exceptions.
- **Bug Fixes:**
  - WebDAV: Auto-sync migrated from timers to the browser Alarms API, reducing the probability of missed syncs caused by background sleep/power saving policies.

**Location Tips:**
- AI API Testing Panel: In any webpage's context menu, select "Quickly Test AI API Functionality"; auto-detection related settings are in "Settings → AI API Testing".
- Auto Sign-in Hints: View in the execution results list under "Settings → Auto Sign-in".

## 3.13.0
- **New Features:**
  - Account Management: Added "Sign-in Status Expired" prompt. When the "Signed in today / Not signed in today" status is not from today's detection, an orange warning icon will be displayed. Clicking it allows one-click refresh of the account data to avoid being misled by old status.
  - Interface: Multi-select controls have been upgraded to more compact selectors (more space-saving, support search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and sign-in logic, improving usability.
  - Cookie Authentication: Removed the cookie cache mechanism, reducing issues caused by still reading old values after cookie updates.

**Location Tips:**
- Sign-in Status Expired Prompt: In the account list under "Settings → Account Management", at the sign-in icon to the right of the site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code" - generates `providerProfiles` configuration for Kilo Code / Roo Code, supporting copying `apiConfigs` snippets or downloading `settings.json` for import (import is incremental and won't clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long text like site names, now truncating them.
  - Dropdown Selectors: Improved empty state prompts and fixed overflow issues with long option text.

**Location Tips:**
- Export to Kilo Code: In the key list under "Settings → Key Management", click the Kilo Code icon to the upper right of a specific key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder. When an existing identical/similar channel is detected, a warning dialog will pop up, allowing you to choose to continue creation or cancel (no longer blocking creation with error toasts).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long text like site names, now truncating them.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will open within the current incognito window (to maintain incognito login state).
  - Account Management: Disabled accounts also support clicking site links, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, charts and lists prioritize displaying the site name (instead of username) for more intuitive information.
  - Shield Bypass Assistant: Temporary shield bypass windows now support CAP (cap.js) PoW verification, improving success rates.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Hint Layer: Fixed Toaster layering issues, preventing hints from being obscured by webpages.

**Location Tips:**
- Site Link: In the account list under "Settings → Account Management", click the site name.
- Shield Bypass Assistant: Refer to [Cloudflare Shield Bypass Assistant](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added "Manual Balance (USD)" field to accounts. When a site cannot automatically fetch balance/quota, you can manually enter it for display and statistics.
  - Account Management: Added "Exclude from Total Balance" switch to accounts. This removes specific accounts from "Total Balance" statistics (does not affect refresh, sign-in, or other functions).
  - Settings: Added "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Auto Sign-in: Refreshes relevant data and synchronizes the interface after execution is complete.

**Location Tips:**
- Add/Edit Account: Open the add/edit account dialog in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added a "Usage Analysis" page to help you visualize usage trends across multiple sites and accounts, allowing you to quickly see "where usage is high / spending is high / performance has slowed down", facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (original logs are not saved). Supports setting retention days, automatic sync methods, and minimum sync intervals, and view sync results and error messages for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage" and enable "Usage History Sync". Set as needed and click "Sync Now".
  - Then, view charts in the left-side menu "Usage Analysis". Click "Export" when you need to retain data or perform reconciliation.

## 3.7.0
- **New Features:**
  - Sorting: Account list supports sorting by "Income". Sorting priority now includes "Disabled accounts at the bottom", preventing inactive/invalid accounts from interfering with daily use.
  - Auto Sign-in: Added "Pre-trigger today's sign-in when opening interface". When opening the popup/sidebar/settings page within the time window, it will automatically attempt to run today's sign-in early, without waiting for the scheduled time.
- **Bug Fixes:**
  - Auto Sign-in: Each account will only be executed once per day. Retries are only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Tips:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Auto Sign-in Pre-trigger/Retry: Configure in the left-side menu "Auto Sign-in".

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enabling/disabling of accounts. Disabled accounts will be skipped by all functions, making it convenient to retain data after an account becomes invalid.
  - Tags: Added global tag management, with synchronized UI and interaction optimizations for easier account classification and management.
  - Popup: Displays the current version number in the title bar and provides a direct link to this changelog.
  - Quick Export: CCSwitch export supports selecting upstream models, making export configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized display strategy for extremely small values to prevent unexpected results due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Sign-in" switch (moved above the custom sign-in URL) for more intuitive configuration.
  - Interface: Removed gradient background from dialog title icons for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details caused a white screen.

## 3.5.0
- **New Features:**
  - Auto-detect: Added a "Detection Slow" prompt and related documentation links to help users troubleshoot and resolve issues.
  - Batch Open External Sign-in: Supports opening all in new windows, facilitating batch closing and reducing interference.
- **Bug Fixes:**
  - Batch Open External Sign-in: Refactored the process to execute in the background service, ensuring correct opening of all sites in popup scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to allow direct selection of upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always have the `sk-` prefix, preventing identification/copying issues due to inconsistent formats.

## 3.3.0
- **New Features:**
  - Auto Sign-in: Account identification now includes "username" information for easier differentiation in multi-account scenarios.
  - External Sign-in: Supports batch triggering of external sign-ins, reducing the number of individual operations.
  - Auto Refresh: The minimum refresh interval no longer has a maximum limit, allowing larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce false triggers in non-copying scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying prompts, reducing invalid redemption notifications.
  - Storage: Added write locks to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text for "Copy Model Name".

## 3.2.0
- **New Features:**
  - The "Model List" page now includes "Interface Availability Test" (Beta) for quickly confirming if the current key is usable with a specified model (e.g., text generation, tool/function calling, structured output (return JSON structure), web search (Grounding), etc.).
  - The "Model List" page now includes "CLI Tool Compatibility Test" (Beta), simulating tool invocation flows for Claude Code / Codex CLI / Gemini CLI to assess interface compatibility within these tools.
  - The "About" page now includes "Rate and Download": Automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and download links for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason for easier problem localization.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Features:**
  - In self-managed API settings, added guidance for administrator credentials.
  - Redemption Assistant supports batch redemption and single-code retries.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing them to coexist and all functions to be available. This is mainly for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy and model alias lists when exporting CLIProxyAPI.
  - Separated site sign-in and custom sign-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed incorrect web page path for manual sign-in on New-API sites.

## 2.39.0
- Automatically detects and modifies the sign-in support status of account sites during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Directly select specific redemption accounts using up/down arrow keys.
  - Press Enter to confirm redemption.
- Added prompts to temporary shield bypass tabs, indicating they originate from this plugin and their purpose.
- Improved shield bypass window display: single window with multiple tabs, meaning short-term requests reuse the same window, minimizing interference.
- Supports sign-in status detection and automatic sign-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added more lenient redemption code format detection options. Custom redemption code formats can now be correctly identified and the Redemption Assistant will pop up.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific channels for management.
- Fixed an issue that would reset the channel model synchronization time.

## 2.35.1
- Fixed an issue that would reset the auto sign-in execution time.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to remind users to redeem when copying any potential redemption codes.
- Added cdk.linux.do to the default URL whitelist for the Redemption Assistant.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error when comparing account IDs.
  - Ensured all temporary contexts are closed correctly.

## 2.33.0
- **New Features:**
  - Added "Temporary Context Mode" for more effective website protection bypass.
  - API error messages are now internationalized.
  - Optimized website type detection, which can now be identified by the title of the temporary window.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 3.22.0
- **New Features:**
  - Model redirection is now smarter, supporting version numbers with hyphens and dots.
  - Added the ability to directly redeem via the context menu after selecting text.
  - Auto sign-in is enabled by default, and the sign-in time window has been extended.

## 3.21.0
- **New Features:**
  - Enhanced cookie isolation for temporary windows, improving security.
  - You can now quickly perform sign-in operations within the popup.
  - Redemption Assistant now supports a URL whitelist feature, giving you better control over which websites can use it.

## 3.20.0
- **New Features:**
  - Added sign-in support for Wong sites.
  - Added sign-in support for AnyRouter sites.
  - Optimized detection capabilities for Cloudflare challenge pages.
  - WebDAV backups now support encryption, and recovery includes a decryption retry popup, while preserving your WebDAV configuration.

## 3.19.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website cookie interception issues during automatic detection.
  - Optimized centering of blank state content in Firefox.
  - Migrated the Switch component to a custom implementation for improved compatibility and stability.

## 3.18.0
- **New Features:**
  - Introduced the "Hosted Sites" service, laying the groundwork for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" in settings to "Hosted Sites" for clarity.
- **Bug Fixes:**
  - Optimized translation text and removed redundant fallback strings.

## 3.17.0
- **New Features:**
  - Account health status now includes more detailed codes for easier problem identification.
  - Temporary window bypass feature now includes a health status indicator.
  - Optimized descriptions for bypassing website protection to make them clearer.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed display issues for Firefox popup prompts in Chinese settings.
- **Performance Optimizations:**
  - Improved the performance of the sorting function.

## 3.16.0
- **New Features:**
  - Added model pricing cache service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Model pricing information for multiple accounts can now be displayed simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 3.15.0
- **New Features:**
  - When the account list is empty, a new onboarding card is displayed.
  - When the pin/manual sort features are disabled, related UI elements will be automatically hidden.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

## 3.14.0
- **New Features:**
  - Updated application description and about page content.
  - Extension name now includes a subtitle.
  - Tag filter now has visibility control based on row count.
  - WebDAV connection tests now support more success status codes.
- **Bug Fixes:**
  - Removed extraneous periods at the end of JSON strings.

## 3.13.0
- **New Features:**
  - Enhanced account tagging functionality.
  - Temporary window bypass feature now supports smarter judgment based on error codes.

## 3.12.0
- **New Features:**
  - Account management now includes tagging functionality for easier account classification.
  - Redemption Assistant popup UI now supports lazy loading and fixes potential website style conflicts.
  - Added global channel filter and JSON editing mode.

## 3.11.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed duplicate "Signed in today" checks in auto sign-in.
  - Simplified and fixed the temporary window fetching logic.
  - Restored parsing of search parameters in URL query strings.

## 3.10.0
- **New Features:**
  - Added permission guidance during initial installation to help you understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed an issue where action buttons in the account dialog overflowed.
  - Redemption amount conversion coefficients now use constants for improved accuracy.
  - Limited the cookie interceptor to only be used in Firefox.

## 3.9.0
- **New Features:**
  - Added loading status and prompt messages during redemption.
  - Removed clipboard reading functionality from the Redemption Assistant.
- **Bug Fixes:**
  - Added missing background error message translations.
  - Prevented concurrent initialization and race conditions for improved stability.
  - Resolved intermittent "Unable to establish connection" errors.
  - Prevented race conditions during the destruction of temporary window pools.

## 3.8.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Assistant feature.
  - Firefox browser now supports WebRequest-based cookie injection.
  - Redemption functionality now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and settings links.
- **Bug Fixes:**
  - Fixed path issues for Tailwind CSS files.

## 3.7.0
- **New Features:**
  - Added automatic popup prompts for one-click redemption.
  - Unified data format for import/export and WebDAV backups using a V2 versioning scheme for improved compatibility and stability.

## 3.6.0
- **New Features:**
  - Added warning prompts when creating accounts in Firefox desktop.
  - API model synchronization now supports a channel filtering system.

## 3.5.0
- **New Features:**
  - MultiSelect component now supports parsing comma-separated strings.
- **Bug Fixes:**
  - Ensured caching only occurs during complete channel data synchronization.
- **Performance Optimizations:**
  - Optimized upstream model caching logic.

## 3.4.0
- **New Features:**
  - Refreshing now automatically detects site metadata.
  - When auto sign-in fails, new retry and manual sign-in options are available.
  - Enhanced auto sign-in functionality, including retry strategies, skip reasons, and account snapshots.
  - Optimized auto sign-in execution method to concurrent processing for improved efficiency.
- **Bug Fixes:**
  - Fixed the default behavior issue of the `autoCheckInEnabled` flag.

## 3.3.0
- **New Features:**
  - Added "New API Channel Management" functionality.
  - Added "Warning" button style.
  - Introduced Radix UI components and Tanstack Table for improved interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed issues with model count display and sorting in the channel table.

## 3.2.1
- **Bug Fixes:**
  - Fixed unnecessary reloads of channels when manually selecting tabs.
  - The sidebar now hides the "New API Model Sync" option when the configuration is invalid.

## 3.2.0
- **New Features:**
  - "New API Model Sync" now includes an allowlist filtering feature for models.
  - The sidebar now supports collapsing/expanding with smooth animations.

## 3.1.0
- **New Features:**
  - Enhanced account management functionality with search and navigation optimizations.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed logic errors in auto sign-in status.

## 3.0.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanisms for improved communication stability.
  - Model sync now includes a manual execution tab and supports channel selection.
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
  - Added fault tolerance for partial account updates.
  - Account information can now be saved even if data fetching fails during manual account addition.
  - Added "Settings Partition" functionality to the settings page, allowing settings to be reset by section.

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
  - User preferences like `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now required to ensure complete default configurations.
- **Bug Fixes:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed the issue of missing "New API Preferences" in configuration checks.
  - Corrected sign-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 2.6.0
- **New Features:**
  - The user interface for "New API Channel Import" has been optimized, supporting key switching and batch model selection.
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
  - Optimized the performance of multi-select components with a large number of selections.

## 2.3.0
- **New Features:**
  - Added account pinning and unpinning functionality, with priority sorting for pinned accounts.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration, prioritizing the current site condition.

## 2.2.1
- **Bug Fixes:**
  - Removed the `isDetected` check for the auto-configuration button.
  - Ensured that account detection correctly refreshes when displayed data changes.
  - Fixed the issue where Access Token is no longer required for Cookie authentication type.

## 2.2.0
- **New Features:**
  - Auto sign-in functionality now includes a results/history interface, with optimized default settings and user experience.
  - Implemented daily site auto sign-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case sensitivity issues in auto sign-in status detection.
  - Handled edge cases in sign-in time window calculation.

## 2.1.0
- **New Features:**
  - Account list now includes username search and highlighting.
- **Bug Fixes:**
  - Added configuration validation warnings when API settings are missing.
  - "New API" functionality now includes configuration validation assistance and internationalized error messages.

## 2.0.0
- **New Features:**
  - The "New API Model Sync" filter bar now includes execution statistics.
  - Each row in the results table now has a sync operation button.
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
  - Account search functionality has been enhanced to support multi-field composite searches across different UI interfaces.
  - Added the functionality to open the sidebar.
- **Bug Fixes:**
  - Added translation for the "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with redemption page paths and support redirection.
  - After signing in, you can choose whether to automatically open the redemption page.
  - Supports opening both sign-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - The sign-in icon has been updated to a "Yen" icon for better intuitiveness.
- **Bug Fixes:**
  - Custom sign-in accounts will now automatically reset their sign-in status daily.
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
  - Dialog components have been replaced with a custom `Modal` component for improved consistency.
  - Introduced a comprehensive set of UI components for enhanced interface aesthetics and development efficiency.
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
  - After successful auto-configuration to New API, the account dialog will automatically close.
  - Implemented dynamic loading of localization resources for improved internationalization support.
- **Bug Fixes:**
  - Added internationalization support for error messages.
  - Fixed template syntax errors in Chinese and English currency switching.

## 1.26.0
- **Bug Fixes:**
  - Account error messages are now internationalized.
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
  - Fixed errors in Chinese Yuan currency conversion logic.

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
  - Added keyboard shortcuts for sidebar and popup actions.
  - Migrated the underlying framework from Plasmo to WXT for better performance and development experience.

## 1.20.0
- **New Features:**
  - Balance and health status indicators now include a refresh function.
  - Action button UI has been unified and optimized, supporting intelligent key handling.

## 1.19.0
- **New Features:**
  - All components now support dark mode.
  - Implemented a theme system supporting dark, light, and system-following modes.
- **Bug Fixes:**
  - The API configuration interface now requires the `authType` field.

## 1.18.0
- **New Features:**
  - Accounts now include a custom sign-in button (with a Yen icon).
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting functionality now includes custom sign-in URLs as sorting conditions.
- **Bug Fixes:**
  - Fixed an issue where the custom sign-in URL was not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication types.
  - Added "No Authentication" type to API authentication options.
  - Tooltip component migrated to the `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" functionality now supports automatic account configuration.
  - Site accounts now have sign-in functionality.
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
  - Fixed potential rendering issues when preferences were loading.

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
  - Key copying functionality now includes Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub token management and data fetching capabilities.
  - Added user group data conversion and API integration.
  - Implemented model fetching functionality for OneHub sites.

## 1.8.0
- **New Features:**
  - Account management now supports site types.
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
  - Optimized the rendering method for the model list to improve loading performance.

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
  - Added manual account addition support and optimized the UI flow.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and a warning prompt when adding accounts.
  - Introduced sidebar functionality, replacing popup-based auto site configuration.

## 0.0.3
- **New Features:**
  - Optimized account identification process, now supporting automatic access key creation.
  - Account list now includes sortable headers, a copy key dialog, and hover action buttons.
  - Account management now includes a remarks field.
  - Website names are now clickable for navigation.
  - Model list supports group selection.
  - Popup pages feature number rolling animations and site status indicators.
  - Optimized add/edit account dialogs, including recharge ratio settings and automatic site name extraction.
  - Fully implemented the settings page system, supporting persistent user preferences and automatic refresh.
  - Enhanced frontend interface and backend services for automatic refresh functionality.
  - Automatically adds the `sk-` prefix when copying keys.
  - Introduced industry-standard tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Added support for more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Popup interface refactored to API Manager style, with added display of total daily consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed issues with incompatible model data formats, `localStorage` access, and API request credentials.
  - Corrected API authentication methods.
  - Optimized URL input processing and auto-refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**