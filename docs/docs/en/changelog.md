# Changelog

This page records the main updates for general users (feature changes / experience optimizations / bug fixes). For a complete history of versions and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip New User Guide
- **How to confirm your current version**: Open the extension popup; the version number will be displayed in the title bar. You can also check it on the settings page.
- **How to stop this page from opening automatically**: You can control whether to "Automatically open changelog after update" in "Settings → General → Changelog".
- **Troubleshooting**: In "Settings → General → Logs", you can enable console logs and report issues with reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.25.0
- **New Features:**
  - Auto Sign-in: Supports Cloudflare Turnstile (anti-bot/human verification) scenarios. When a site requires Turnstile verification, it will attempt to complete the verification on a temporary page before proceeding with sign-in, and provide a manual sign-in link and prompt if necessary.
  - CC Switch: When exporting to `Codex`, it automatically appends `/v1` to the base address's default interface address (when the interface address is not manually modified), reducing issues with unavailable interfaces after direct import.
  - Model Redirect: Added an optional switch `Clean up invalid redirect targets after sync`. After model synchronization and refresh, it automatically deletes mappings in `model_mapping` that point to non-existent models (dangerous operation, off by default).
- **Experience Optimizations:**
  - Temporary Window: More accurately identifies challenge/login pages, reducing misjudgments and unnecessary interruptions.
- **Bug Fixes:**
  - Cookie Authentication: Corrected the wording to align with current actual behavior and capabilities, reducing misleading information.
  - Sidebar: Fixed an issue where the sidebar could not be scrolled to see bottom menu items in small windows.

**Location Hints:**
- Turnstile Verification: Check new prompts in the execution results under "Settings → Auto Sign-in".
- CC Switch Export: In "Settings → Key Management", select a key, click `Export to CC Switch`, and choose `Codex` as the target application.
- Model Redirect Cleanup: Enable `Clean up invalid redirect targets after sync` in "Settings → Basic Settings → Model Redirect".

## 3.24.0
- **New Features:**
  - Changelog: The plugin will no longer automatically open a new tab in the browser after an update. Instead, it will display the update content in a popup within the plugin the first time you open the plugin interface, with an option to open the full changelog.
  - LDOH: The account list now includes a `View in LDOH` (LDOH icon) quick entry, which directly jumps to LDOH and automatically filters to the corresponding site. When adding an account, there's also an `Open LDOH Site List` entry to facilitate finding sites.
- **Experience Optimizations:**
  - Documentation Links: When opening documentation/changelogs from the plugin, it will automatically redirect to the corresponding language page based on the current plugin language.

**Location Hints:**
- Changelog Switch: `Automatically display update content after update` in "Settings → General → Changelog".
- Changelog Popup: Appears automatically after plugin update upon first opening "Extension Popup / Settings Page / Sidebar" (once per version).
- LDOH Quick Entry: To the right of the site name in the account list under "Account Management" (LDOH icon, prompts `View in LDOH`); also available by clicking `Open LDOH Site List` in the add account dialog.

## 3.23.0
- **New Features:**
  - Auto Sign-in: The account operation menu now includes `Quick Sign-in`, allowing an immediate sign-in for a single account and refreshing its status upon completion.
  - Key Management: Added an `All Accounts` view that aggregates and displays keys by account group, facilitating cross-account search and copying.
  - Model Redirect: Added a batch operation `Clear All Model Redirect Mappings` that allows selecting by channel and quickly resetting `model_mapping` after secondary confirmation (irreversible).
- **Experience Optimizations:**
  - New API Channel Management: URLs in the channel list are now clickable, and the search experience has been optimized.
- **Bug Fixes:**
  - Channel Management: Fixed inaccurate prompt text for `Priority` in the channel dialog.
  - Model Redirect: Automatic mapping generation now includes a "version guard" to prevent cross-version mismatches.
  - Sidebar: Automatically falls back to opening a popup/settings page when the environment does not support the sidebar, preventing unresponsive clicks.

## 3.22.0
- **New Features:**
  - Model List: Added a "Model-to-Key Mapping" tool (key icon) to check if a current model has an available key. If no key is available, it allows one-click creation of a default key based on the model's available groups, or entry into a custom creation process, with support for one-click key copying.
  - Share Snapshot: Supports one-click sharing of "Overview Snapshot / Account Snapshot". It prioritizes copying the image to the clipboard, and automatically downloads a PNG if clipboard copying is not supported. Snapshots only contain shareable information (no sensitive fields like `API Key`) and allow one-click copying of the title text.
- **Experience Optimizations:**
  - Disable Account: Disabled accounts are now automatically skipped in refresh and scheduled tasks like "Balance History / Usage Analysis / Usage Sync", reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed an issue where the spinner was not visible on buttons when in a "loading" state and simultaneously displaying a left-side icon.

**Location Hints:**
- Model-to-Key Mapping: Click the key icon ( `Model-to-Key Mapping` ) to the right of the model name in "Settings → Model List".
- Share Overview Snapshot: Button ( `Share Overview Snapshot` ) in the title bar of the overview page in the extension popup.
- Share Account Snapshot: In the operation menu for a specific account in "Settings → Account Management" ( `Share Account Snapshot` ).

## 3.21.0
- **New Features:**
  - API Credentials: Added an "API Credentials" page, suitable for scenarios where you only have `Base URL` + `API Key` without an account. It supports unified management of tags/remarks, direct availability verification, and quick export (e.g., Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added a multi-account view (Overview / Account Distribution / Trends) and a unified "Account Summary" table for quick comparison and summary statistics.
  - Self-Hosted Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for functions like "Channel Management" and "Model Sync".
- **Experience Optimizations:**
  - Context Menu: "Redemption Assistant" and "AI API Detection" entries can now be toggled independently and take effect immediately after switching.
  - Copy Key: When an account has no key, the popup provides entries for "Quick Create Default Key / Custom Create Key", reducing navigation back and forth.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Done Hub` and fill in "Done Hub Integration Settings".
- Context Menu Entry Toggles: In "Settings → Basic Settings → Sign-in and Redemption / AI API Testing", under "Show in Browser Context Menu" for each.
- Copy Key Popup: Opens when clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown options when adding a key now display both the Group ID and description, facilitating quick differentiation and selection across multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" is now off. If you wish to automatically generate a default key after adding an account, please enable it manually in settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add Key", view in the group dropdown options.
- Auto Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Hosted Site Management: Added support for `Octopus` hosted sites. After connecting to the Octopus backend, you can import account API keys as channels in "Channel Management" and also pull available model lists.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default) and a "Ensure at least one key" option to automatically populate default keys for accounts missing them.
  - AI API Testing: "Model List Probing" for interface verification now supports OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and other interface types, providing suggested available model IDs to reduce manual guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account identification logic for improved stability in multi-account scenarios on the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-related interfaces to reduce errors or triggering site rate limits due to frequent refreshes.
  - Channel Management: More precise duplicate detection when creating channels, with confirmation prompts to avoid accidental creation of duplicate routes.
- **Bug Fixes:**
  - Disable Account: Disabled accounts are now automatically filtered out from relevant dropdowns/lists in Key Management, preventing invalid operations.
  - Language: Fixed an issue where the extension language setting might affect the webpage's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Auto Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Populate Default Key: In "Settings → Key Management", top right corner, "Ensure at least one key".
- AI API Testing Entry: Right-click menu "Quickly test AI API functionality".

## 3.18.0
- **New Features:**
  - Balance History: Charts now include a "Currency Unit" switch (`USD` / `CNY`) and display currency symbols on axes/tooltips. When `CNY` is selected, it converts based on the account's "Recharge Amount Ratio" for easier viewing of trends and reconciliation by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are too many tag/account options, it defaults to "Expand to display" for more intuitive browsing and selection.
  - Tabs: Added left and right scroll buttons to vendor tags in "Model List" and group tags in "Settings" for easier switching in narrow windows.
- **Bug Fixes:**
  - Account Management: More accurate "Auto-detect" for site types, fixing issues with unknown site types in recent versions.

**Location Hints:**
- Balance History Currency Unit: "Currency Unit" in the filter area of the "Settings → Balance History" page.
- Account Exchange Rate (Recharge Amount Ratio): "Recharge Amount Ratio" in the add/edit account form in "Settings → Account Management".

## 3.17.0
- **New Features:**
  - Balance History: Added "Balance History" feature (off by default), which records daily balance and income/expense snapshots and displays trends in charts. Supports filtering by tag/account and time range, with convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added settings to control whether to enable it, retention days, and "End-of-day Fetch". Note: If you disable "Show Today's Income and Expenses" and do not enable "End-of-day Fetch", the "Daily Income and Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar in small/narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed responsive display issues with the export area on some screen sizes.
  - Popup: Fixed layout anomalies with incorrect scrollbar positions in popups.

**Location Hints:**
- Balance History Switch/Retention Days/End-of-day Fetch: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added Sub2API site type, supporting balance/quota queries. Supports reading login status from the console via "Auto-detect". Also supports "Plugin Hosted Session (Multi-account, Recommended)" mode, which allows independent authentication renewal for each account, improving the experience for multiple accounts on the same site.
  - Display Settings: Added a "Show Today's Income and Expenses" switch (on by default), which hides and stops fetching statistics like "Today's Consumption/Income", reducing log fetching requests during refreshes.
- **Note:**
  - Sub2API currently does not support site sign-in, daily usage, or income-related functions, only basic balance/quota queries. Related functions will be gradually improved based on site capabilities.
  - "Plugin Hosted Session (Multi-account)" saves `refresh_token` as private account credentials and will be included in exports/WebDAV backups. Please keep backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Add/Mode Explanation: In "Settings → Account Management", add/edit account, select Sub2API as the site type; for more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income and Expenses Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved Service Worker stability in the background, reducing issues where asynchronous timed tasks (WebDAV auto-sync / Usage sync / Model sync / Auto sign-in, etc.) might be missed due to premature background termination. It also automatically restores related timed tasks after the browser restarts.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" for saving quick links to site consoles/documentation/management pages without needing to create a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now has an "Accounts / Bookmarks" switch. Bookmark data will be included in backups/restores and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests, reducing unnecessary network calls (some sites already return `today_income` in their refresh interface).
  - Auto Refresh: Minimum refresh interval set to 60 seconds, and minimum refresh interval protection set to 30 seconds. Old configurations will be automatically corrected to a valid range after updating, and related prompts and documentation have been improved.

::: warning Important: Auto Refresh Configuration Will Be Forced Adjusted
Feedback indicates that **overly short auto-refresh intervals can easily trigger site rate limits and place excessive load on sites.**

v3.15.0 **has forced changes to auto-refresh configurations**:
- Auto-refresh and refresh on plugin open are now disabled. If you still need them, you must re-enable them manually.
- Minimum `Refresh Interval` is 60 seconds, and `Minimum Refresh Interval Protection` is 30 seconds. If your pre-upgrade setting was below these thresholds, it will be automatically raised to the minimum value after upgrading. If your previous setting was within the new valid range, it will remain unaffected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; switch between "Accounts / Bookmarks" at the top of the popup.
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly test AI API functionality" to open a test panel directly on the current webpage. Supports filling/pasting `Base URL` and `API Key`, and performs basic capability probing for OpenAI-compatible / OpenAI / Anthropic / Google, etc. interfaces (OpenAI-compatible also supports one-click model list retrieval).
  - (Optional) Auto-Detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist. When a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (off by default and does not save the Key).
  - Auto Sign-in: The execution results list now includes more troubleshooting prompts, such as suggestions and documentation links for handling common exceptions like "Temporary anti-bot tab manually closed" and "Access Token invalid".
- **Bug Fixes:**
  - WebDAV: Auto-sync migrated from timers to the browser Alarms API, reducing the probability of missed syncs caused by background hibernation/power saving policies.

**Location Hints:**
- AI API Test Panel: Right-click menu on any webpage, select "Quickly test AI API functionality"; auto-detection settings are in "Settings → AI API Test".
- Auto Sign-in Prompts: View in the execution results list under "Settings → Auto Sign-in".

## 3.13.0
- **New Features:**
  - Account Management: Added "Sign-in Status Expired" prompt. When the "Signed in today / Not signed in today" status is not from today's detection, an orange warning icon will be displayed. Clicking it will refresh the account data with one click, preventing misguidance by old status.
  - Interface: Multi-select controls have been upgraded to more compact selectors (space-saving, support search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and sign-in logic, improving usability.
  - Cookie Authentication: Removed the cookie caching mechanism, reducing anomalies caused by reading old values after cookie updates.

**Location Hints:**
- Sign-in Status Expired Prompt: In the account list under "Settings → Account Management", next to the sign-in icon for site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code" - generates Kilo Code / Roo Code providerProfiles configuration, supporting copying apiConfigs snippets or downloading settings JSON for import (import adds incrementally, does not clear existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by long text like site names, now truncated automatically.
  - Dropdown Selectors: Optimized empty state prompts and fixed overflow issues with long option text.

**Location Hints:**
- Export to Kilo Code: In "Settings → Key Management", in the key list, click the Kilo Code icon in the top right corner of a key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder. When a duplicate/similar channel is detected, a warning dialog will pop up, allowing you to choose to continue creation or cancel (no longer blocking creation with error toasts).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by long text like site names, now truncated automatically.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will open in the current incognito window (to maintain incognito login status).
  - Account Management: Disabled accounts also support clicking site links, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, the chart and list prioritize displaying the site name (instead of username) for more intuitive information.
  - Anti-Bot Helper: Temporary anti-bot window now supports CAP (cap.js) Pow verification, improving pass rates.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Toast Layer: Fixed Toaster layering issues, preventing toasts from being obscured by web pages.

**Location Hints:**
- Site Link: In "Settings → Account Management", click the site name in the account list.
- Anti-Bot Helper: Refer to [Cloudflare Anti-Bot Helper](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added "Manual Balance (USD)" field. When a site cannot automatically retrieve balance/quota, you can manually fill it in for display and statistics.
  - Account Management: Added "Exclude from Total Balance" switch. Used to remove specific accounts from "Total Balance" statistics (does not affect refresh/sign-in functions).
  - Settings: Added "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Auto Sign-in: Refreshes relevant data and synchronizes the interface after execution.

**Location Hints:**
- Add/Edit Account: Open add/edit account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added a "Usage Analysis" page to help you visualize usage trends across multiple sites and accounts, allowing you to quickly see "where usage is high / spending is high / performance has slowed", facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (original logs are not saved). Supports setting retention days, automatic sync methods, and minimum sync intervals, and view sync results and error prompts for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage", enable "Usage History Sync", set as needed, and click "Sync Now".
  - Then, view charts in the left-side menu "Usage Analysis"; click "Export" when you need to retain or reconcile data.

## 3.7.0
- **New Features:**
  - Sorting: Account list supports sorting by "Income". Sorting priority now includes "Disabled Accounts at Bottom", so inactive/invalid accounts no longer interfere with your daily use.
  - Auto Sign-in: Added "Pre-trigger today's sign-in when opening interface". When opening the popup/sidebar/settings page within the time window, it will automatically attempt to run today's sign-in early, without waiting for the scheduled time.
- **Bug Fixes:**
  - Auto Sign-in: Each account will only execute once per day. Retries are only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Auto Sign-in Pre-trigger/Retry: Configure in the left-side menu "Auto Sign-in".

## 3.6.0
- **New Features:**
  - Account Management: Supports enabling/disabling accounts with one click. After disabling, all functions will skip the account, making it easy to retain data when an account becomes invalid.
  - Tags: Added global tag management, and optimized related interfaces and interactions accordingly, making it easier to classify and manage accounts.
  - Popup: Displays the current version number in the title bar and provides a direct entry to this changelog.
  - Quick Export: CC Switch export supports selecting upstream models, making export configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized display strategy for extremely small values to avoid unexpected displays due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Moved the "Auto Sign-in" switch position (above the custom sign-in URL) for more intuitive configuration.
  - Interface: Removed gradient background from dialog title icons for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Auto-detect: Added "Slow Detection" prompt and related documentation links to help users troubleshoot and resolve issues.
  - Batch Open External Sign-in: Supports opening all in new windows, making batch closing easier and reducing interference.
- **Bug Fixes:**
  - Batch Open External Sign-in: Refactored the process to execute in the background service, ensuring correct opening of all sites in popup scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to directly select upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always have the `sk-` prefix, preventing recognition/copying issues due to inconsistent formats.

## 3.3.0
- **New Features:**
  - Auto Sign-in: Account identification now includes "username" information, making it easier to distinguish accounts in multi-account scenarios.
  - External Sign-in: Supports batch triggering of external sign-ins, reducing the number of individual operations.
  - Auto Refresh: The minimum refresh interval no longer has a maximum limit, allowing for larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce false triggers in non-copying scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying prompts, reducing invalid redemption notifications.
  - Storage: Added write locks to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text for "Copy Model Name".

## 3.2.0
- **New Features:**
  - "Model List" page now includes "Interface Availability Test" (Beta) for quickly confirming if the current key is usable with a specified model (e.g., text generation, tool/function calling, structured output (return JSON structure), web search (Grounding), etc.).
  - "Model List" page now includes "CLI Tool Compatibility Test" (Beta), simulating tool invocation flows for Claude Code / Codex CLI / Gemini CLI to assess interface compatibility with these tools.
  - "About" page now includes "Rate and Download": Automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entry points for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating problem identification.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce failures in obtaining cookies due to insufficient permissions.

## 3.1.0
- **New Features:**
  - In self-managed API settings, added administrator credential filling guidelines.
  - Redemption Assistant supports batch redemption and single-code retry.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing them to coexist and all functions to be available. Primarily for sites with cookie-only authentication like AnyRouter.
  - Supports setting proxy and model alias lists when exporting for CLIProxyAPI.
  - Separated site sign-in and custom sign-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed incorrect web page path redirection for manual sign-in on New-API sites.

## 2.39.0
- Automatically detects and modifies the sign-in support status of account sites during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number during version updates.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Directly select specific redemption accounts using up/down arrow keys.
  - Press Enter to confirm redemption.
- Added prompts to temporary anti-bot tabs, indicating they originate from this plugin and their purpose.
- Improved anti-bot window display: single window with multiple tabs, meaning short-term requests reuse the same window, minimizing interference.
- Supports sign-in status detection and automatic sign-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added more lenient redemption code format detection options. When encountering custom redemption code formats, it can correctly identify the code and pop up the Redemption Assistant.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific channels for management.
- Fixed an issue that would reset the channel model sync time.

## 2.35.1
- Fixed an issue that would reset the auto sign-in execution time.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to remind users to redeem when copying any potential redemption codes.
- Added cdk.linux.do to the default URL whitelist for the Redemption Assistant.

## 3.24.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open a popup or a sidebar.
- **Bug Fixes:**
  - Fixed an internal error when comparing account IDs.
  - Ensured all temporary contexts are closed correctly.

## 3.23.0
- **New Features:**
  - Introduced "Temporary Context Mode" for more effective bypassing of website defenses.
  - API error messages are now internationalized.
  - Optimized website type detection, which can now be identified by the title of the temporary window.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 3.22.0
- **New Features:**
  - Model redirection is now smarter, supporting version numbers represented by hyphens and dots.
  - Added the ability to redeem directly via the right-click menu after selecting text.
  - Auto sign-in is enabled by default, and the sign-in time window has been extended.

## 3.21.0
- **New Features:**
  - Enhanced cookie isolation for temporary windows, improving security.
  - Sign-in operations can now be quickly performed within the popup.
  - Redemption Assistant now supports a URL whitelist feature, giving you better control over which websites can use it.

## 3.20.0
- **New Features:**
  - Added sign-in support for Wong sites.
  - Added sign-in support for AnyRouter sites.
  - Optimized the detection capability for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, and recovery includes a decryption retry popup, while preserving your WebDAV configuration.

## 3.19.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website cookie interception issues during automatic detection.
  - Optimized the centering of blank state content in Firefox.
  - Migrated the Switch component to a custom implementation, improving compatibility and stability.

## 3.18.0
- **New Features:**
  - Introduced "Hosted Sites" service, laying the groundwork for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" to "Hosted Sites" in settings for clarity.
- **Bug Fixes:**
  - Optimized translation text and removed redundant fallback strings.

## 3.17.0
- **New Features:**
  - Account health status now includes more detailed codes, making it easier to understand specific issues.
  - Temporary window bypass feature now includes a health status indicator.
  - Optimized descriptions for bypassing website defenses to make them clearer and easier to understand.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed display issues with Firefox popup prompts in Chinese settings.
- **Performance Optimizations:**
  - Improved the performance of the sorting feature.

## 3.16.0
- **New Features:**
  - Added model pricing cache service, speeding up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Model pricing information for multiple accounts can now be displayed simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 3.15.0
- **New Features:**
  - When the account list is empty, a new onboarding card is displayed.
  - When the pin/manual sort features are disabled, related UI elements will automatically hide.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

## 3.14.0
- **New Features:**
  - Updated application description and about page content.
  - Extension name now includes a subtitle.
  - Tag filter now includes visibility control based on line count.
  - WebDAV connection test now supports more success status codes.
- **Bug Fixes:**
  - Removed extraneous periods at the end of JSON strings.

## 3.13.0
- **New Features:**
  - Enhanced account tagging functionality.
  - Temporary window bypass feature now supports more intelligent judgment based on error codes.

## 3.12.0
- **New Features:**
  - Account management now includes tagging functionality for easy account classification.
  - Redemption Assistant popup UI now supports lazy loading and fixes issues that could cause website style conflicts.
  - Added global channel filter and JSON editing mode.

## 3.11.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed duplicate "Already signed in today" checks in auto sign-in.
  - Simplified and fixed the temporary window fetching logic.
  - Restored the parsing of search parameters in URL query strings.

## 3.10.0
- **New Features:**
  - Added permission guidance during initial installation to help users understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed an issue where operation buttons in the account dialog overflowed.
  - Redemption amount conversion factor now uses constants for improved accuracy.
  - Limited the Cookie interceptor to only be used in Firefox browsers.

## 3.9.0
- **New Features:**
  - Added loading status and prompt messages during redemption.
  - Removed clipboard reading functionality from the Redemption Assistant.
- **Bug Fixes:**
  - Added missing background error message translations.
  - Prevented concurrent initialization and race conditions in services, improving stability.
  - Resolved intermittent "Unable to establish connection" errors.
  - Prevented race conditions during the destruction of the temporary window pool.

## 3.8.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Assistant feature.
  - Firefox browsers now support WebRequest-based cookie injection.
  - Redemption functionality now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and a link to settings.
- **Bug Fixes:**
  - Fixed path issues with Tailwind CSS files.

## 3.7.0
- **New Features:**
  - Added automatic popup prompts for one-click redemption.
  - Unified data format for import/export and WebDAV backups using a V2 versioning scheme, improving compatibility and stability.

## 3.6.0
- **New Features:**
  - Added warning prompts when creating accounts in Firefox desktop.
  - API model sync now supports a channel filtering system.

## 3.5.0
- **New Features:**
  - MultiSelect component now supports comma-separated string parsing.
- **Bug Fixes:**
  - Ensured caching only occurs during full channel data synchronization.
- **Performance Optimizations:**
  - Optimized upstream model caching logic.

## 3.4.0
- **New Features:**
  - Site metadata is now automatically detected during refresh.
  - When auto sign-in fails, retry and manual sign-in options are now available.
  - Enhanced auto sign-in functionality, including retry strategies, skip reasons, and account snapshots.
  - Optimized auto sign-in execution method to concurrent processing for improved efficiency.
- **Bug Fixes:**
  - Fixed the default behavior issue of the `autoCheckInEnabled` flag.

## 3.3.0
- **New Features:**
  - Added "New API Channel Management" functionality.
  - Added a "Warning" button style.
  - Introduced Radix UI components and Tanstack Table, enhancing interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed issues with model count display and sorting in the channel table.

## 3.12.1
- **Bug Fixes:**
  - Fixed unnecessary reloads of channels when manually selecting tabs.
  - The "New API Model Sync" option is now hidden when the configuration is invalid.

## 3.12.0
- **New Features:**
  - "New API Model Sync" now includes an allowlist filtering feature for models.
  - The sidebar now supports collapsing/expanding with smooth animations.

## 3.11.0
- **New Features:**
  - Account management functionality has been enhanced with search capabilities and navigation optimizations.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed logic errors in auto sign-in status.

## 3.10.0
- **New Features:**
  - Browser messages now support an exponential backoff retry mechanism, improving communication stability.
  - Model sync now includes a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured that missing fields in user preferences are populated with default values.

## 3.9.0
- **New Features:**
  - Added Cloudflare challenge detection and automatically attempt to bypass using a temporary window when encountering protection.
  - Introduced a temporary context management system.

## 3.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "Month-Day" and "Month_Day".
  - Optimized dropdown menu positioning and accessibility for multi-select components.

## 3.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can now be saved even if data retrieval fails during manual account addition.
  - Added "Setting Partitions" to the settings page, supporting resetting settings by section.

## 3.7.1
- **Bug Fixes:**
  - Fixed an issue where redirected models did not appear in the model list during API sync.

## 3.7.0
- **New Features:**
  - The account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hidden the password visibility button in Edge/IE browsers.

## 3.6.1
- **Important Update (Internal):**
  - User preferences like `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now required to ensure the completeness of default configurations.
- **Bug Fixes:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed the issue of missing "New API Preferences" in configuration checks.
  - Corrected the sign-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 3.6.0
- **New Features:**
  - The user interface for "New API Channel Import" has been optimized to support key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process for improved accuracy.
- **Bug Fixes:**
  - Model name standardization is now consistent with the Veloera backend and retains hyphens.
  - Resolved browser storage quota issues and improved model matching.

## 3.5.0
- **New Features:**
  - Added support for the Neo-API site type.
- **Bug Fixes:**
  - Fixed Base64 encoding issues during CherryStudio URL generation.
  - Removed redundant account fetching and token verification from the channel dialog for improved efficiency.

## 3.4.1
- **Bug Fixes:**
  - Ensured that the settings page always opens in a new tab.

## 3.4.0
- **New Features:**
  - Auto-import functionality now integrates the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - Multi-select components now support collapsible selected areas and optimized input experience.
- **Bug Fixes:**
  - Optimized the retry mechanism and added user feedback.
  - Optimized the performance of multi-select components with a large number of selections.

## 3.3.0
- **New Features:**
  - Added account pinning and unpinning functionality, and supports prioritizing pinned accounts in sorting.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration by increasing the priority of the current site condition.

## 3.2.1
- **Bug Fixes:**
  - Removed the `isDetected` check for the auto-configuration button.
  - Ensured that account detection correctly refreshes when displayed data changes.
  - Fixed the issue where Access Tokens are no longer required for Cookie authentication types.

## 3.2.0
- **New Features:**
  - The "Auto Sign-in" feature now includes a results/history interface and optimized default settings and user experience.
  - Implemented daily site auto sign-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case sensitivity issues in auto sign-in status detection.
  - Handled edge cases in sign-in time window calculations.

## 3.1.0
- **New Features:**
  - Account list now includes username search and highlighting functionality.
- **Bug Fixes:**
  - Added configuration validation warnings when API settings are missing.
  - "New API" features now include configuration validation assistance and internationalized error messages.

## 3.0.0
- **New Features:**
  - The "New API Model Sync" filter bar now includes execution statistics.
  - Each row in the results table now includes a sync operation button.
  - Implemented the initial service, backend logic, and settings interface for "New API Model Sync".
- **Bug Fixes:**
  - Row retry operations now only update the target and progress UI.
  - Updated channel list response handling and types.

## 1.38.0
- **New Features:**
  - Supports pinning accounts with custom sign-in or redemption URLs.
  - Added custom redemption and opening tab matching as sorting rules.
- **Bug Fixes:**
  - Ensured deep copying of default sorting rules.
  - New sorting conditions are disabled by default after migration.

## 1.37.0
- **New Features:**
  - Account search functionality has been enhanced to support multi-field composite searches across UI interfaces.
  - Added the "Open Sidebar" function.
- **Bug Fixes:**
  - Added translation for the "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with a redemption page path, and support redirection.
  - After signing in, you can choose whether to automatically open the redemption page.
  - Supports opening both sign-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - The sign-in icon has been updated to a "Yen" icon for better clarity.
- **Bug Fixes:**
  - Custom sign-in accounts will now automatically reset their sign-in status daily.
  - Fixed the default value issue of the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic synchronization of account data with a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` to improve cross-browser compatibility and optimize error handling.

## 1.33.0
- **New Features:**
  - Introduced a reusable `AppLayout` component to improve interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed an issue where the right content container width was incorrect on small screens.

## 1.32.0
- **New Features:**
  - Improved layout and responsiveness of the account management interface.
  - Added configurable React DevTools auto-plugin and caching.
- **Bug Fixes:**
  - Fixed the `z-index` issue of the mobile sidebar overlay.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Added a "Create Account" button to account management and optimized the layout.
  - Added "Usage Logs" functionality to account management.
  - Sorting priority settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fixes:**
  - Updated the size and accessibility labels of SiteInfo icon buttons.

## 1.30.0
- **New Features:**
  - Replaced the dialog component with a custom `Modal` component for improved consistency.
  - Introduced a comprehensive set of UI components to enhance interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected sign-in logic and sorting priority.
  - Optimized the transparency and layering of the mobile sidebar overlay for a better user experience.

## 1.29.0
- **New Features:**
  - Popups now support detection and automatic closing.
  - Popups now feature responsive mobile layout to avoid the need for zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent auto-detection functionality.
  - Migrated `chrome.*` APIs to `browser.*` APIs, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functional compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed the `tabId` parsing issue after window creation.
  - Prevented rotation animations on button borders during refresh.

## 1.27.0
- **New Features:**
  - The account dialog will now automatically close after successful auto-configuration to New API.
  - Implemented dynamic loading of localization resources to improve internationalization support.
- **Bug Fixes:**
  - Added internationalization support for error messages.
  - Fixed syntax errors in currency switching templates between Chinese and English.

## 1.26.0
- **Bug Fixes:**
  - Account error messages now support internationalization.
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
  - Fixed rendering logic for the custom URL sign-in interface.
  - Corrected sign-in field names and return structures.

## 1.21.0
- **New Features:**
  - Added favicon and extension icons for popup, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and popup operations.
  - Migrated the underlying framework from Plasmo to WXT for better performance and development experience.

## 1.20.0
- **New Features:**
  - Added refresh functionality for balance and health status indicators.
  - Optimized and unified operation button UI, supporting intelligent key handling.

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
  - Sorting functionality now includes custom sign-in URLs as a sorting condition.
- **Bug Fixes:**
  - Fixed an issue where custom sign-in URLs were not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication types.
  - Added "No Authentication" type to API authentication options.
  - Migrated the tooltip component to the `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" functionality now supports automatic account configuration.
  - Site accounts now support sign-in functionality.
  - Implemented a customizable sorting priority system.

## 1.15.0
- **Bug Fixes:**
  - Fixed an issue where unnecessary updates and notifications were triggered even when values were not changed.

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
  - Key copying functionality now includes Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub token management and data retrieval functionality.
  - Added user group data transformation and API integration.
  - Implemented model retrieval functionality for OneHub sites.

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
  - Optimized the rendering method of the model list to improve loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed an issue where the status of detected accounts was reset when no existing accounts were found.

## 1.4.0
- **New Features:**
  - The control panel now includes a "Copy Model Name" function.
  - Added support for Baidu and Yi model providers.

## 1.3.1
- **Bug Fixes:**
  - Updated the release PR workflow configuration.

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
  - Manual account addition is now supported, with an optimized UI flow.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting for the current site.
  - Added Firefox browser detection and a warning prompt when adding accounts.
  - Introduced sidebar functionality, replacing popup-based automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized account identification process, now supporting automatic access key creation.
  - Account list now includes sortable headers, a copy key dialog, and hover action buttons.
  - Account management now includes a remarks field.
  - Website names are now clickable for navigation.
  - Model list supports group selection.
  - Popup page includes digital rolling animations and site status indicators.
  - Optimized add/edit account dialogs, including recharge ratio settings and automatic site name extraction.
  - Fully implemented the settings page system, supporting user preference persistence and automatic refresh.
  - Enhanced frontend interface and backend service for automatic refresh functionality.
  - Automatically adds the `sk-` prefix when copying keys.
  - Introduced industry-standard tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Added support for more AI model providers (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Refactored popup interface to API Manager style, adding display of total daily consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed issues with incompatible model data formats, `localStorage` access, and API request credentials.
  - Corrected API authentication methods.
  - Optimized URL input processing and auto-refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**