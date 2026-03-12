# Changelog

This page records the main updates for general users (feature changes / experience optimizations / bug fixes). For the complete history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip New User Guide
- **How to confirm your current version**: Open the extension popup; the version number will be displayed in the title bar. You can also check it on the settings page.
- **How to stop this page from opening automatically**: You can control whether to "Automatically open the changelog after updates" in "Settings → General → Changelog".
- **Troubleshooting**: In "Settings → General → Logs", you can enable console logs and report issues with reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.27.0
- **New Features:**
  - Account Management: The account list now includes filtering by enabled status, allowing quick switching between `Enabled` / `Disabled` accounts for easier management of invalid accounts.
  - Feedback & Support: A quick `Feedback` entry point has been added to the extension popup's title bar, and a "Feedback & Support" section has been added to the "About" page, allowing direct access to GitHub issues, feature suggestions, and discussions.
- **Experience Optimizations:**
  - Account Display: When multiple accounts have the same site name, the username will be automatically appended, displayed as `Site Name · Username`, making it easier to distinguish in lists, search results, selectors, and statistics views.
- **Bug Fixes:**
  - Sidebar: Further optimized sidebar detection. When the browser or mobile environment does not support the sidebar, invalid entries will be automatically hidden or fall back to the settings page, reducing instances of unresponsive clicks.

**Location Hints:**
- Account Status Filter: In the filter area at the top of the list in "Settings → Account Management".
- Feedback Entry Points: The `Feedback` button in the extension popup's title bar, and the "Feedback & Support" section in "Settings → About".

## 3.26.0
- **New Features:**
  - Account Management: Added `Locate Corresponding Channel` quick action. This allows a one-click jump from a managed site account to the corresponding "Channel Management" list with filters applied. It also supports enabling "Remind before adding duplicate accounts" to reduce accidental additions.
  - Duplicate Account Cleanup: Added a `Duplicate Account Cleanup` tool that scans and deletes duplicates based on the URL source site + User ID, making batch cleanup more convenient.
  - Account Management: The operation menu for disabled accounts now includes a direct delete entry, streamlining the process of cleaning up invalid accounts.
  - API Credentials: The `API Credentials` page is now accessible directly from the settings navigation and the extension popup. Token remarks are also preserved during configuration export, facilitating migration between different tools.
  - WebDAV: Added synchronization data selection, allowing users to sync only specific shared data like `Accounts`, `Bookmarks`, `API Credentials`, etc., as needed, reducing unnecessary overwrites between devices.
  - Sub2API: Added key management support for `Sub2API` accounts, allowing direct viewing, creation, editing, and deletion of keys.
  - CLIProxyAPI: Added Provider type selection during import and automatically normalizes common endpoint addresses, reducing manual URL modifications.
- **Experience Optimizations:**
  - Redemption Assistant: Automatically refreshes account balance after successful redemption, reducing the need for manual refreshes to confirm results.
- **Bug Fixes:**
  - Auto Sign-in: Added a more stable retry mechanism for scheduled sign-ins to reduce missed sign-ins due to missed execution windows caused by extension updates, etc.
  - Auto Recognition: Fixed an issue where custom sign-in configurations might be lost after account re-recognition, preventing accidental configuration loss.
  - Auto Sign-in: Fixed an issue where Turnstile assistance or manual sign-in prompts incorrectly used `External Sign-in URL` for some accounts. It now always opens the site's default sign-in page, reducing errors and failed sign-ins.
  - Managed Sites: When importing or syncing data to managed sites, the target site's default group is now prioritized, reducing anomalies caused by group mismatches.

::: warning Note
- The `Sync Data Selection` for WebDAV and local device settings like automatic account refresh will not overwrite each other between devices via WebDAV.
:::

**Location Hints:**
- Duplicate Account Reminder: In "Settings → Basic Settings → Account Management" under `Remind before adding duplicate accounts`.
- Duplicate Account Cleanup: In the page toolbar of "Settings → Account Management".
- Locate Channel: In the operation menu for individual accounts in "Settings → Account Management".
- API Credentials: In "Settings → API Credentials"; the extension popup can also switch to the `API Credentials` view.
- WebDAV Sync Data Selection: In "Settings → Import/Export" under `WebDAV Settings`.

## 3.25.0
- **New Features:**
  - Auto Sign-in: Supports Cloudflare Turnstile (anti-bot/human verification) scenarios. When a site requires Turnstile verification, it will attempt to complete the verification on a temporary page before proceeding with sign-in. It also provides a sign-in link and prompts for manual opening when necessary.
  - CC Switch: When exporting to `Codex`, the default base address will be automatically appended with `/v1` (if the interface address has not been manually modified), reducing issues with unavailable interfaces after direct import.
  - Model Redirect: Added an optional switch `Clean up invalid redirect targets after sync`. This automatically deletes mappings in `model_mapping` that point to non-existent models after model synchronization refresh (a dangerous operation, disabled by default).
- **Experience Optimizations:**
  - Temporary Window: More accurately identifies challenge/login pages, reducing misjudgments and unnecessary interruptions.
- **Bug Fixes:**
  - Cookie Authentication: Corrected the wording to align with current actual behavior and capabilities, reducing misguidance.
  - Sidebar: Fixed an issue where the sidebar could not be scrolled to see bottom menu items in small windows.

**Location Hints:**
- Turnstile Verification: Check new prompts in the execution results of "Settings → Auto Sign-in".
- CC Switch Export: In "Settings → Key Management", select a key, click `Export to CC Switch`, and choose `Codex` as the target application.
- Model Redirect Cleanup: Enable `Clean up invalid redirect targets after sync` in "Settings → Basic Settings → Model Redirect".

## 3.24.0
- **New Features:**
  - Changelog: The plugin will no longer automatically open a new browser tab after an update. Instead, when you open the plugin interface for the first time, the update content will be displayed in a popup within the plugin, with an option to open the full changelog.
  - LDOH: The account list now includes a `View in LDOH` (LDOH icon) quick entry point, which directly jumps to LDOH and automatically filters to the corresponding site. An `Open LDOH Site List` entry is also provided when adding accounts to facilitate finding sites.
- **Experience Optimizations:**
  - Documentation Links: When opening documentation/changelogs from the plugin, it will automatically redirect to the documentation page in the corresponding language based on the current plugin language.

**Location Hints:**
- Changelog Switch: In "Settings → General → Changelog" under `Show update content automatically after update`.
- Changelog Popup: After updating the plugin, it will automatically pop up the first time you open the "Extension Popup / Settings Page / Sidebar" (once per version).
- LDOH Quick Entry: To the right of the site name in the account list of "Account Management" (LDOH icon, prompts `View in LDOH`); you can also click `Open LDOH Site List` in the add account dialog.

## 3.23.0
- **New Features:**
  - Auto Sign-in: Added `Quick Sign-in` to the account operation menu, allowing immediate execution of a sign-in for a single account and refreshing its status upon completion.
  - Key Management: Added an `All Accounts` view that aggregates keys by account group, facilitating cross-account search and copying.
  - Model Redirect: Added a `Clear Model Redirect Mappings` batch operation. You can select channels and confirm a second time to quickly reset `model_mapping` (irreversible).
- **Experience Optimizations:**
  - New API Channel Management: URLs in the channel list are now clickable, and the search experience has been optimized.
- **Bug Fixes:**
  - Channel Management: Fixed an inaccurate prompt for `Priority` in the channel dialog.
  - Model Redirect: Added a "version guard" to automatically generated mappings to prevent cross-version mismatches.
  - Sidebar: When the operating environment does not support the sidebar, it will automatically fall back to opening the popup/settings page, preventing unresponsive clicks.

## 3.22.0
- **New Features:**
  - Model List: Added a "Model Corresponding Key" tool (key icon) to check if a current model has an available key. If no key is available, it allows one-click creation of a default key based on the model's available groups, or entry into a custom creation process, with support for one-click key copying.
  - Share Snapshot: Supports one-click sharing of "Overview Snapshot / Account Snapshot". It prioritizes copying the image to the clipboard; if not supported, it automatically downloads a PNG. Snapshots only contain shareable information (no sensitive fields like `API Key`) and allow one-click copying of the title text.
- **Experience Optimizations:**
  - Disabled Accounts: In refresh and scheduled tasks for "Balance History / Usage Analysis / Usage Sync", disabled accounts are automatically skipped, reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed an issue where the spinner was not visible on buttons that were "loading" and also displayed a left-side icon.

**Location Hints:**
- Model Corresponding Key: In "Settings → Model List", click the key icon ( `Model Corresponding Key` ) to the right of the model name.
- Share Overview Snapshot: The button ( `Share Overview Snapshot` ) in the upper right corner of the overview page in the extension popup.
- Share Account Snapshot: In the operation menu for individual accounts in "Settings → Account Management" ( `Share Account Snapshot` ).

## 3.21.0
- **New Features:**
  - API Credentials: Added an "API Credentials" page, suitable for scenarios where you only have a `Base URL` + `API Key` without a full account. It supports unified management of tags/remarks and allows direct availability verification and quick export (e.g., for Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added multi-account views (Overview / Account Distribution / Trends) and a unified "Account Summary" table for quick comparison and statistical aggregation.
  - Self-Hosted Site Management: Added `Done Hub` to managed sites, supporting configuration of administrator credentials for functions like "Channel Management" and "Model Sync".
- **Experience Optimizations:**
  - Context Menu: "Redemption Assistant" and "AI API Detection" entries can be individually enabled/disabled. Changes take effect immediately after switching.
  - Copy Key: When an account has no key, the popup provides entry points for "Quickly Create Default Key / Create Custom Key", reducing back-and-forth navigation.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Done Hub` and fill in "Done Hub Integration Settings".
- Context Menu Entry Switch: In "Settings → Basic Settings → Sign-in & Redemption / AI API Testing", under their respective "Show in Browser Context Menu" options.
- Copy Key Popup: Opened by clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown option when adding a new key now displays both the Group ID and description, facilitating quick differentiation and selection among multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" is now disabled. If you wish to automatically generate a default key after adding an account, please enable it manually in the settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add Key", and view it in the group dropdown option.
- Automatic Default Key Creation Switch: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Hosted Site Management: Added support for `Octopus` managed sites. After connecting to the Octopus backend, you can import account API keys as channels in "Channel Management" and also pull the list of available models.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default) and a "Ensure at least one key" option to automatically complete default keys for accounts missing them.
  - AI API Testing: "Model List Probing" for interface verification now supports interface types like OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, etc., and provides suggested available model IDs, reducing manual model guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account recognition logic for improved stability in scenarios with multiple accounts on the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-related interfaces to reduce errors or triggering site rate limits due to frequent refreshes.
  - Channel Management: Improved duplicate detection when creating channels, with confirmation prompts to prevent accidental duplicate route creation.
- **Bug Fixes:**
  - Disable Accounts: Disabled accounts are now automatically filtered out from dropdowns/lists related to key management, preventing invalid operations.
  - Language: Fixed an issue where the extension's language setting might affect the browser's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Automatic Default Key Creation Switch: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Default Key Completion: In "Settings → Key Management", in the upper right corner, "Ensure at least one key".
- AI API Testing Entry: Right-click menu "Quickly test AI API functionality availability".

## 3.18.0
- **New Features:**
  - Balance History: Charts now include a "Currency Unit" switch (`USD` / `CNY`) and display currency symbols on axes/tooltips. Selecting `CNY` will convert based on the account's "Recharge Amount Ratio", facilitating trend viewing and reconciliation by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are too many tag/account options, it defaults to "Expand to display", making browsing and selection more intuitive.
  - Tabbed Sections: Added left and right scroll buttons to the "Settings" group tabs and "Model List" vendor tabs, making switching easier in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Auto-recognition" is now more accurate, fixing frequent unknown site type issues in recent versions.

**Location Hints:**
- Balance History Currency Unit: In "Settings → Balance History" page filter section "Currency Unit".
- Account Exchange Rate (Recharge Amount Ratio): In "Settings → Account Management", in the "Recharge Amount Ratio" field of the add/edit account form.

## 3.17.0
- **New Features:**
  - Balance History: Added "Balance History" feature (disabled by default), which records daily balance and income/expense snapshots and displays trends in charts. Supports filtering by tag/account and time range, with convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added a setting to control whether it's enabled, the retention period, and "End-of-Day Fetching". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-Day Fetching", the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar in small/narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed responsive display issues of the export area on some screen sizes.
  - Popup: Fixed layout anomalies with incorrect scrollbar positions in popups.

**Location Hints:**
- Balance History Switch/Retention Days/End-of-Day Fetching: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added `Sub2API` site type, supporting balance/quota queries. Supports reading login status from the console via "Auto-recognition". Also supports the "Plugin Hosted Session (Multi-account, Recommended)" mode, allowing independent authentication renewal for each account, improving the experience for multiple accounts on the same site.
  - Display Settings: Added a "Show Today's Income/Expenses" switch (enabled by default), which hides and stops fetching statistics like "Today's Consumption/Income", reducing log fetching requests during refreshes.
- **Note:**
  - Sub2API currently does not support site sign-in, daily usage, or income-related functions, only basic balance/quota queries. Related functions will be gradually improved based on site capabilities.
  - "Plugin Hosted Session (Multi-account)" saves the `refresh_token` as a private account credential and will be included in exports/WebDAV backups. Please keep backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Addition/Mode Explanation: In "Settings → Account Management", add/edit an account, select Sub2API as the site type; for more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved background Service Worker stability, reducing the issue of missed executions for asynchronous timed tasks (WebDAV auto-sync / usage sync / model sync / auto sign-in, etc.) due to premature background termination. Automatically resumes related timed tasks after browser restart.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" to save quick links to site consoles/documentation/management pages without needing to create a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now includes "Account / Bookmark" switching. Bookmark data will be included in backups/restores and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests, reducing unnecessary network calls (some sites already return `today_income` in their refresh interface).
  - Auto Refresh: Minimum refresh interval set to 60 seconds, minimum refresh interval protection set to 30 seconds. Old configurations will be automatically corrected to a valid range after updating, and related prompts and documentation have been improved.

::: warning Important: Auto Refresh Configuration Will Be Forced Adjusted
Due to feedback indicating that **overly short auto-refresh intervals can trigger site rate limits and place excessive load on sites**,

v3.15.0 **has made forced changes to auto-refresh configurations**:
- Auto-refresh and refresh on plugin open features have been disabled. If you still need them, you must re-enable them manually.
- The minimum `Refresh Interval` is 60 seconds, and the `Minimum Refresh Interval Protection` is 30 seconds. If your pre-upgrade setting was below these thresholds, it will be automatically increased to the minimum value after the upgrade. If your previous setting was within the new valid range, it will not be affected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; the top of the popup allows switching between "Account / Bookmark".
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly test AI API functionality availability" to open a test panel directly on the current webpage. Supports filling/pasting `Base URL` and `API Key`, and performs basic capability probing for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible also allows one-click model list retrieval).
  - (Optional) Auto Detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist. When a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (disabled by default, and the Key will not be saved).
  - Auto Sign-in: The execution results list now includes more troubleshooting tips, such as suggestions and documentation links for handling common exceptions like "Temporary shield bypass tab manually closed" and "Access Token invalid".
- **Bug Fixes:**
  - WebDAV: Auto-sync migrated from timers to the browser's Alarms API, reducing the probability of missed syncs caused by background sleep or power-saving policies.

**Location Hints:**
- AI API Test Panel: Right-click menu on any webpage, select "Quickly test AI API functionality availability"; auto-detection related settings are in "Settings → AI API Test".
- Auto Sign-in Tips: View in the execution results list of "Settings → Auto Sign-in".

## 3.13.0
- **New Features:**
  - Account Management: Added "Sign-in Status Expired" prompt. When the "Signed in today / Not signed in today" status is not from today's detection, an orange warning icon will be displayed. Clicking it will refresh the account data with one click, preventing misguidance by old status.
  - Interface: Multi-select controls have been upgraded to more compact selectors (space-saving, support search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and sign-in logic, improving usability.
  - Cookie Authentication: Removed the Cookie cache mechanism, reducing anomalies caused by reading old values after Cookie updates.

**Location Hints:**
- Sign-in Status Expired Prompt: In the account list of "Settings → Account Management", at the sign-in icon to the right of the site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code" - generates Kilo Code / Roo Code providerProfiles configuration, supporting copying `apiConfigs` snippets or downloading `settings.json` for import (imports are incremental additions and will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long site names, now truncated automatically.
  - Dropdown Selector: Optimized empty state prompts and fixed overflow issues with long option text.

**Location Hints:**
- Export to Kilo Code: In "Settings → Key Management", in the key list, click the Kilo Code icon in the upper right corner of a key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder. When an existing identical/similar channel is detected, a warning dialog will pop up, allowing the user to choose to continue creation or cancel (no longer blocking creation with error toasts).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long site names, now truncated automatically.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will open within the current incognito window (facilitating maintaining incognito login status).
  - Account Management: Disabled accounts also support clicking site links, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, the charts and lists prioritize displaying the site name (instead of the username) for more intuitive information.
  - Shield Bypass Assistant: The temporary shield bypass window now supports CAP (cap.js) Proof-of-Work verification, improving success rates.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Toast Layer: Fixed Toaster layering issues, preventing prompts from being obscured by web pages.

**Location Hints:**
- Site Link: In "Settings → Account Management", click the site name in the account list.
- Shield Bypass Assistant: Refer to [Cloudflare Shield Bypass Assistant](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added a "Manual Balance (USD)" field. When a site cannot automatically retrieve balance/quota, you can manually fill this in for display and statistics.
  - Account Management: Added an "Exclude from Total Balance" switch. This is used to remove specific accounts from the "Total Balance" statistics (does not affect refresh/sign-in functions).
  - Settings: Added a "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether console logs are output and the minimum log level, facilitating troubleshooting.
  - Auto Sign-in: After execution, it will refresh relevant data and synchronize the interface refresh.

**Location Hints:**
- Add/Edit Account: Open the add/edit account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added a "Usage Analysis" page to help you visualize usage trends across multiple sites and accounts in charts, allowing you to quickly see "where usage is high / spending is high / performance has decreased", facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (original logs are not saved). Supports setting retention days, automatic sync methods, and minimum sync intervals, and viewing sync results and error messages for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage" and enable "Usage History Sync". Set as needed and click "Sync Now".
  - Then, go to "Usage Analysis" in the left menu to view charts. Click "Export" when you need to retain or reconcile data.

## 3.7.0
- **New Features:**
  - Sorting: The account list now supports sorting by "Income". The sorting priority now includes "Disable accounts at the bottom", so that disabled/invalid accounts no longer interfere with your daily use.
  - Auto Sign-in: Added "Trigger today's sign-in early when opening the interface". When opening the popup/sidebar/settings page within the time window, it will automatically attempt to run today's sign-in early, eliminating the need to wait for the scheduled time.
- **Bug Fixes:**
  - Auto Sign-in: Each account will only be signed in once per day. Retries are only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Auto Sign-in Early Trigger/Retry: Configure in the left menu "Auto Sign-in".

## 3.6.0
- **New Features:**
  - Account Management: Supports enabling/disabling accounts with one click. After disabling, various functions will skip the account, making it easy to retain data after an account becomes invalid.
  - Tags: Added global tag management and synchronized optimization of related interfaces and interactions for easier classification and management of accounts.
  - Popup: Displays the current version number in the title bar and provides a direct entry point to this changelog.
  - Quick Export: CC Switch export now supports selecting upstream models, making export configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized display strategy for extremely small values to avoid unexpected results due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Sign-in" switch (moved above the custom sign-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from dialog title icons for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Auto Recognition: Added a "Detection Slow" prompt and related documentation links to help users troubleshoot and resolve issues.
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
  - Auto Sign-in: Added "Username" information to account recognition for easier differentiation in multi-account scenarios.
  - External Sign-in: Supports batch triggering of external sign-ins, reducing the number of individual operations.
  - Auto Refresh: The minimum refresh interval no longer has a maximum limit, allowing larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce accidental triggers in non-copy scenarios.
  - Redemption Assistant: Validates all redemption codes before showing the popup prompt, reducing invalid redemption notifications.
  - Storage: Added write locks to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text for "Copy Model Name".

## 3.2.0
- **New Features:**
  - "Model List" page now includes "Interface Availability Detection" (Beta) for quickly confirming if the current key is usable for a specified model (e.g., text generation, tool/function calling, structured output (JSON), web search (Grounding), etc.).
  - "Model List" page now includes "CLI Tool Compatibility Detection" (Beta), simulating tool call flows for Claude Code / Codex CLI / Gemini CLI to assess interface compatibility.
  - "About" page now includes "Rate & Download": Automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and download links for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating problem identification.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures caused by insufficient permissions.

## 3.1.0
- **New Features:**
  - In self-managed API settings, added guidance for administrator credentials.
  - Redemption Assistant now supports batch redemption and single-code retries.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing them to coexist and all functions to be available. This is primarily for sites like AnyRouter that only use cookie authentication.
  - Supports setting proxies and model/model alias lists when exporting CLIProxyAPI.
  - Separated site sign-in and custom sign-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed incorrect web page jump path for manual sign-in on New-API sites.

## 2.39.0
- Automatically detects and modifies the sign-in support status of account sites during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Directly select a redemption account using the up/down arrow keys.
  - Press Enter to confirm redemption.
- Added prompts to temporary shield bypass tabs, indicating they originate from this plugin and their purpose.
- Improved shield bypass window display: single window with multiple tabs, meaning short-term requests reuse the same window to minimize interference.
- Supports sign-in status detection and automatic sign-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added a more lenient option for redemption code format detection, correctly identifying redemption codes and popping up the Redemption Assistant for custom formats.
- Fixed some known issues.

## 2.36.0
- Supports quick jumps to specific channels for management.
- Fixed an issue that would reset channel model sync times.

## 2.35.1
- Fixed an issue that would reset auto sign-in execution times.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to remind users when copying potential redemption codes.
- Added cdk.linux.do to the default URL whitelist for the Redemption Assistant.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error when comparing account IDs.
  - Ensured all temporary contexts are closed correctly.

## 2.33.0
- **New Features:**
  - Introduced "Temporary Context Mode" for more effective website protection bypass.
  - API error messages are now internationalized.
  - Optimized website type detection, which can now be identified by the title of the temporary window.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 3.22.0
- **New Features:**
  - Model redirection now supports version numbers represented by hyphens and periods.
  - Added the ability to redeem directly via the context menu after selecting text.
  - Auto sign-in is enabled by default, and the sign-in time window has been extended.

## 3.21.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Sign-in operations can now be quickly performed within the popup.
  - Redemption Assistant now supports a URL whitelist, giving you better control over which websites can use it.

## 3.20.0
- **New Features:**
  - Added sign-in support for Wong sites.
  - Added sign-in support for AnyRouter sites.
  - Optimized detection capabilities for Cloudflare challenge pages.
  - WebDAV backups now support encryption, and recovery includes a decryption retry popup. Your WebDAV configuration will be preserved.

## 3.19.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website Cookie interception issues during automatic detection.
  - Optimized the centering of blank state content in Firefox.
  - Migrated the Switch component to a custom implementation for improved compatibility and stability.

## 3.18.0
- **New Features:**
  - Introduced the "Managed Sites" service, laying the groundwork for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" to "Managed Sites" in settings for clarity.
- **Bug Fixes:**
  - Optimized translation text and removed redundant fallback strings.

## 3.17.0
- **New Features:**
  - Account health status now includes more detailed codes for easier problem identification.
  - Temporary window bypass feature now includes a health status indicator.
  - Optimized descriptions for bypassing website protection for better clarity.
  - Added a notification system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed display issues for Firefox popup notifications in Chinese settings.
- **Performance Optimizations:**
  - Improved the performance of the sorting function.

## 3.16.0
- **New Features:**
  - Added a model pricing cache service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Model pricing information for multiple accounts can now be displayed simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 3.15.0
- **New Features:**
  - When the account list is empty, a new user guide card is displayed.
  - When the pin/manual sorting features are disabled, related UI elements will be automatically hidden.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

## 3.14.0
- **New Features:**
  - Updated application description and about page content.
  - Extension name now includes a subtitle.
  - Tag filters now have visibility control based on line count.
  - WebDAV connection tests now support more success status codes.
- **Bug Fixes:**
  - Removed extraneous periods from the end of JSON strings.

## 3.13.0
- **New Features:**
  - Enhanced account tagging functionality.
  - Temporary window bypass now supports smarter judgment based on error codes.

## 3.12.0
- **New Features:**
  - Account management now includes tagging functionality for classifying accounts.
  - Redemption Assistant popup UI now supports lazy loading and fixes issues that could cause website style conflicts.
  - Added global channel filter and JSON editing mode.

## 3.11.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed duplicate "Signed in today" checks in auto sign-in.
  - Simplified and fixed temporary window capture logic.
  - Restored parsing of search parameters in URL query strings.

## 3.10.0
- **New Features:**
  - Added permission guidance during initial installation to help users understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed an issue where operation buttons in the account dialog would overflow.
  - Redemption amount conversion coefficients now use constants for improved accuracy.
  - Limited the Cookie interceptor to Firefox browsers only.

## 3.9.0
- **New Features:**
  - Added loading status and prompt messages during redemption.
  - Removed clipboard reading functionality from the Redemption Assistant.
- **Bug Fixes:**
  - Added missing background error message translations.
  - Prevented concurrent initialization and race conditions for services, improving stability.
  - Resolved intermittent "Unable to establish connection" errors.
  - Prevented race conditions during the destruction of the temporary window pool.

## 3.8.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Assistant feature.
  - Firefox browsers now support WebRequest-based Cookie injection.
  - Redemption feature now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and setting links.
- **Bug Fixes:**
  - Fixed path issues for Tailwind CSS files.

## 3.7.0
- **New Features:**
  - Added one-click redemption automatic popup notification feature.
  - Unified data format for import/export and WebDAV backups using a V2 versioning scheme, improving compatibility and stability.

## 3.6.0
- **New Features:**
  - Added warning prompts when creating accounts in Firefox desktop.
  - API model sync now supports a channel filtering system.

## 3.5.0
- **New Features:**
  - MultiSelect component now supports parsing comma-separated strings.
- **Bug Fixes:**
  - Ensured caching only occurs during complete channel data synchronization.
- **Performance Optimizations:**
  - Optimized upstream model caching logic.

## 3.4.0
- **New Features:**
  - Automatic detection now detects site metadata during refresh.
  - When auto sign-in fails, retry and manual sign-in options are added.
  - Enhanced auto sign-in functionality, including retry strategies, skip reasons, and account snapshots.
  - Optimized auto sign-in execution method to concurrent processing for improved efficiency.
- **Bug Fixes:**
  - Fixed default behavior issues with the `autoCheckInEnabled` flag.

## 3.3.0
- **New Features:**
  - Added "New API Channel Management" functionality.
  - Added a "Warning" button style.
  - Introduced Radix UI components and Tanstack Table for improved interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed issues with model count display and sorting in the channel table.

## 3.2.1
- **Bug Fixes:**
  - Fixed unnecessary channel reloads when manually selecting tabs.
  - The "New API Model Sync" option is hidden in the sidebar when the configuration is invalid.

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
  - Browser messages now support an exponential backoff retry mechanism for improved communication stability.
  - Model sync now includes a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured that missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection and automatically attempts to bypass using a temporary window when protection is encountered.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized dropdown menu positioning and accessibility for multi-select components.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanisms for partial account updates.
  - Account information can now be saved even if data retrieval fails during manual account addition.
  - Settings page now includes "Setting Partitions" for resetting settings by region.

## 2.7.1
- **Bug Fixes:**
  - Fixed an issue where redirected models were not appearing in the model list during API sync.

## 2.7.0
- **New Features:**
  - The account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hidden the password visibility button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - User preferences like `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now required to ensure the integrity of default configurations.
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
  - Removed redundant account retrieval and token verification from the channel dialog for improved efficiency.

## 2.4.1
- **Bug Fixes:**
  - Ensured that the settings page always opens in a new tab.

## 2.4.0
- **New Features:**
  - Auto-import functionality now integrates the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - Multi-select components now support collapsible selected areas and have optimized input experience.
- **Bug Fixes:**
  - Optimized retry mechanisms and added user feedback.
  - Optimized the performance of multi-select components with a large number of selections.

## 2.3.0
- **New Features:**
  - Added functionality to pin and unpin accounts, with pinned accounts having priority sorting.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration by increasing the priority of the current site condition.

## 2.2.1
- **Bug Fixes:**
  - Removed the `isDetected` check for the auto-configuration button.
  - Ensured that account detection correctly refreshes when displayed data changes.
  - Fixed the issue where Access Tokens are no longer required for Cookie authentication types.

## 2.2.0
- **New Features:**
  - Auto sign-in functionality now includes a results/history interface, with optimized default settings and user experience.
  - Implemented daily site auto sign-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case sensitivity issues in auto sign-in status detection.
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
  - Account search functionality has been enhanced to support multi-field composite searches across UI interfaces.
  - Added the "Open Sidebar" functionality.
- **Bug Fixes:**
  - Added translation for the "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with a redemption page path, supporting redirection.
  - Option to automatically open the redemption page after sign-in.
  - Supports opening both sign-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - Sign-in icon updated to a "Yen" icon for better clarity.
- **Bug Fixes:**
  - Custom sign-in accounts now have their sign-in status reset daily.
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
  - Fixed an issue with incorrect width of the right content container on small screens.

## 1.32.0
- **New Features:**
  - Improved layout and responsiveness of the account management interface.
  - Added configurable React DevTools auto-plugin and caching.
- **Bug Fixes:**
  - Fixed the `z-index` issue for the mobile sidebar overlay.
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
  - Corrected sign-in logic and sorting priority.
  - Optimized the transparency and layering of the mobile sidebar overlay for a better user experience.

## 1.29.0
- **New Features:**
  - Popups now support detection and automatic closing.
  - Popups now have a mobile responsive layout to avoid zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent auto-detection.
  - Migrated `chrome.*` APIs to `browser.*` APIs, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functional compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed `tabId` parsing issues after window creation.
  - Prevented rotation animations on button borders during refresh.

## 1.27.0
- **New Features:**
  - After successful auto-configuration to New API, the account dialog will automatically close.
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
  - Fixed the issue where a success message was still displayed when refreshing without accounts.

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
  - Accounts now support a custom sign-in button (with a Yen icon).
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting function now includes custom sign-in URLs as a sorting condition.
- **Bug Fixes:**
  - Fixed an issue where custom sign-in URLs were not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication types.
  - API authentication options now include a "No Authentication" type.
  - Tooltip component migrated to the `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" functionality now supports automatic account configuration.
  - Site accounts now include sign-in functionality.
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
  - Moved default sort values to `UserPreferencesContext`.
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
  - Added user group data conversion and API integration.
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
  - Replaced custom dialogs in the popup with direct function calls for simplified operations.

## 1.1.1
- **Bug Fixes:**
  - Fixed logic for handling missing system names and checks.

## 1.1.0
- **New Features:**
  - Manual account addition is now supported, with optimized UI flow.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and warning prompts when adding accounts.
  - Introduced sidebar functionality, replacing popup for automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized account recognition process, now supporting automatic access key creation.
  - Account list now includes sortable headers, copy key dialogs, and hover action buttons.
  - Account management now includes a remarks field.
  - Website names are now clickable for navigation.
  - Model list supports group selection.
  - Popup pages feature number rolling animations and site status indicators.
  - Optimized add/edit account dialogs, including recharge ratio settings and automatic site name extraction.
  - Implemented a comprehensive settings page system supporting user preference persistence and auto-refresh.
  - Enhanced frontend interface and backend service for auto-refresh functionality.
  - Automatically adds the `sk-` prefix when copying keys.
  - Introduced industry-standard tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Supports more AI model providers (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Popup interface refactored to API Manager style, adding display of total daily consumption.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed issues with incompatible model data formats, `localStorage` access, and API request credentials.
  - Corrected API authentication methods.
  - Optimized URL input handling and auto-refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**