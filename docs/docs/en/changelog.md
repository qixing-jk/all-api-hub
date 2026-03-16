# Changelog

This page records major updates for general users (feature changes / experience optimizations / bug fixes). For full historical versions and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip For New Users
- **How to confirm your current version**: Open the extension popup; the version number will be displayed in the title bar. You can also check it on the settings page.
- **How to stop this page from opening automatically**: You can control whether to "Automatically open changelog after update" in "Settings → General → Changelog".
- **Troubleshooting**: In "Settings → General → Logs", you can enable console logging and report issues with reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.28.0
- **New Features:**
  - API Credentials: Added `Verify CLI Compatibility` operation. During verification, you can automatically fetch or manually enter the model ID. It will also clearly indicate if a temporary `API Type` override is currently in use, preventing misinterpretation of one-time test results as saved configurations.
  - API Credentials / Model List: You can now jump directly to the corresponding `Model List` data source from `API Credentials`. The `Model List` also supports using API credentials as a data source to view model directories and verification results without first creating a site account.
  - Key Management: `Key Management` now displays the status, matching signals, and jump-in entry points for hosted sites. When saving keys to `API Credentials`, clearer names are generated, making future lookup and reuse easier.
  - New API Hosted Sites: Added login auxiliary information (username, password, optional TOTP) and session verification to hosted site configurations. When verifying status or reading actual channel keys is required, it can be completed directly within the extension.
  - Hosted Site Matching: Channel identification now uses a combination of `URL`, keys, and models for ranking. For scenarios where the backend only returns masked tokens, channel status judgment, copying, and integration operations can still be completed.
  - First Use: The Welcome / Permission Guide popup now includes a language selector, allowing you to switch the interface language upon first opening and remembering your subsequent preferences.
- **Experience Optimizations:**
  - Veloera: For scenarios that currently do not support channel localization and status detection based on `Base URL`, relevant entries will be automatically hidden or disabled with explanations, reducing confusion from clicking without results.
- **Bug Fixes:**
  - Language: Fixed an issue where the browser's detected language was not consistently followed on startup. Synchronized and corrected interface copy and date/time localization.
  - Permission Guide: Optimized the button layout of the permission explanation popup for neater alignment and easier clicking, especially in small windows or when buttons wrap.

**Location Hints:**
- API Credentials: In "Settings → API Credentials", you can use operations like `Verify CLI Compatibility` and `Open in Model Management`.
- Model List Data Source: In the data source selection area at the top of "Settings → Model List", you can switch to `API Credentials`.
- Hosted Site Channel Status: View the hosted site status and matching prompts for each key in "Settings → Key Management".
- New API Hosted Site Login Auxiliary: In the `New API Integration Settings` area within "Settings → Self-Built Site Management".
- Initial Language Selection: In the Welcome / Permission Guide popup that appears when you first open the extension.

## 3.27.0
- **New Features:**
  - Account Management: The account list now includes filtering by enabled status, allowing quick switching between `Enabled` / `Disabled` accounts for easier batch management of invalid accounts.
  - Feedback & Support: A `Feedback` shortcut entry has been added to the extension popup's title bar. The "About" page also includes a `Feedback & Support` section, which directly opens GitHub for issue reporting, feature suggestions, and discussions.
- **Experience Optimizations:**
  - Account Display: When multiple accounts have the same site name, the username will be automatically appended, displaying as `Site Name · Username`, making them easier to distinguish in lists, search results, selectors, and statistical views.
- **Bug Fixes:**
  - Sidebar: Further optimized sidebar detection support. When the browser or mobile environment does not support sidebars, invalid entries will be automatically hidden, or it will fall back to the settings page, reducing instances of clicking without response.

**Location Hints:**
- Account Status Filter: In the filter area at the top of the list in "Settings → Account Management".
- Feedback Entry: The `Feedback` button in the extension popup's title bar, and the `Feedback & Support` section in "Settings → About".

## 3.26.0
- **New Features:**
  - Account Management: Added a `Locate Corresponding Channel` quick operation to jump directly from a hosted site account to the corresponding "Channel Management" list with filters applied. Also supports enabling "Remind before adding duplicate accounts" to reduce accidental additions of duplicate accounts.
  - Duplicate Account Cleanup: Added a `Duplicate Account Cleanup` tool that can scan and delete duplicates by URL source site + User ID, making batch cleanup of duplicate accounts easier.
  - Account Management: The operation menu for disabled accounts now includes a direct delete entry, streamlining the process of cleaning up invalid accounts.
  - API Credentials: The `API Credentials` page can now be accessed directly from the settings navigation and the extension popup. When exporting configurations, token remarks will be preserved, facilitating migration between multiple tools.
  - WebDAV: Added data synchronization selection, allowing you to sync only shared data such as `Accounts`, `Bookmarks`, `API Credentials`, etc., as needed, reducing unnecessary overwrites between multiple devices.
  - Sub2API: Added key management support for `Sub2API` accounts, allowing direct viewing, creation, editing, and deletion of keys.
  - CLIProxyAPI: Added Provider type selection during import, and common endpoint addresses will be automatically standardized, reducing manual URL modifications.
- **Experience Optimizations:**
  - Redemption Assistant: Automatically refreshes account balance after successful redemption, reducing the need for manual refreshes to confirm results.
- **Bug Fixes:**
  - Auto Sign-in: Added a more stable retry mechanism for scheduled sign-ins to reduce missed sign-ins due to extension updates or other reasons affecting execution windows.
  - Auto Recognition: Fixed an issue where custom sign-in configurations might be lost after account re-recognition, preventing accidental configuration loss.
  - Auto Sign-in: Fixed an issue where Turnstile assistance or manual sign-in prompts incorrectly used `External Sign-in URL` for some accounts. It will now always open the site's default sign-in page, reducing errors or failures to complete sign-in.
  - Hosted Sites: When importing or syncing data to hosted sites, the target site's default group will be prioritized, reducing anomalies caused by group mismatches.

::: warning Note
- WebDAV's `Data Synchronization Selection` and local device settings like automatic account refresh will no longer overwrite each other between devices via WebDAV.
:::

**Location Hints:**
- Duplicate Account Reminder: In "Settings → Basic Settings → Account Management" under `Remind before adding duplicate accounts`.
- Duplicate Account Cleanup: In the page toolbar of "Settings → Account Management".
- Locate Channel: In the operation menu for individual accounts in "Settings → Account Management".
- API Credentials: In "Settings → API Credentials"; the extension popup can also switch to the `API Credentials` view.
- WebDAV Data Synchronization Selection: In `WebDAV Settings` under "Settings → Import/Export".

## 3.25.0
- **New Features:**
  - Auto Sign-in: Supports Cloudflare Turnstile (anti-bot/human verification) scenarios. When a site requires Turnstile verification, it will attempt to complete verification on a temporary page before proceeding with sign-in. If necessary, it will provide a sign-in link and prompt that can be manually opened.
  - CC Switch: When exporting to `Codex`, the `/v1` suffix will be automatically appended to the default base URL (if the interface address has not been manually modified), reducing issues with unavailable interfaces after direct import.
  - Model Redirect: Added an optional switch `Clean up invalid redirect targets after sync`. This will automatically delete mappings in `model_mapping` that point to non-existent models after model synchronization refresh (a dangerous operation, disabled by default).
- **Experience Optimizations:**
  - Temporary Windows: More accurately identify challenge/login pages, reducing misjudgments and unnecessary interruptions.
- **Bug Fixes:**
  - Cookie Authentication: Corrected the text description to align with current actual behavior and capabilities, reducing misguidance.
  - Sidebar: Fixed an issue where the sidebar was not scrollable to see bottom menu items in small windows.

**Location Hints:**
- Turnstile Verification: View new prompts in the execution results of "Settings → Auto Sign-in".
- CC Switch Export: In "Settings → Key Management", select a key, click `Export to CC Switch`, and choose `Codex` as the target application.
- Model Redirect Cleanup: Enable `Clean up invalid redirect targets after sync` in "Settings → Basic Settings → Model Redirect".

## 3.24.0
- **New Features:**
  - Changelog: The plugin will no longer automatically open a new browser tab after an update. Instead, it will display the update content in a popup within the plugin the first time you open the plugin interface, with an option to open the full changelog.
  - LDOH: The account list now includes a `View in LDOH` (LDOH icon) quick entry, which directly jumps to LDOH and automatically filters to the corresponding site. When adding an account, an `Open LDOH Site List` entry is also provided for easier site finding.
- **Experience Optimizations:**
  - Documentation Links: When opening documentation/changelogs from the plugin, it will automatically redirect to the corresponding language version of the documentation page based on the current plugin language.

**Location Hints:**
- Changelog Switch: In "Settings → General → Changelog" under `Automatically display update content after update`.
- Changelog Popup: Appears automatically after plugin updates when you first open the "Extension Popup / Settings Page / Sidebar" (once per version).
- LDOH Quick Entry: To the right of the site name in the account list of "Account Management" (LDOH icon, prompts `View in LDOH`); you can also click `Open LDOH Site List` in the add account dialog.

## 3.23.0
- **New Features:**
  - Auto Sign-in: Added a `Quick Sign-in` option to the account operation menu, allowing immediate sign-in for a single account and refreshing its status upon completion.
  - Key Management: Added an `All Accounts` view that aggregates keys by account group, facilitating cross-account search and copying.
  - Model Redirect: Added a `Clear Model Redirect Mappings` batch operation that allows quick resetting of `model_mapping` after selecting channels and confirming (irreversible).
- **Experience Optimizations:**
  - New API Channel Management: URLs in the channel list are now clickable, and the search experience has been optimized.
- **Bug Fixes:**
  - Channel Management: Fixed an inaccurate `Priority` prompt text in the channel dialog.
  - Model Redirect: Added a "version guard" to automatically generated mappings to prevent cross-version mismatches.
  - Sidebar: When the runtime environment does not support sidebars, it will automatically fall back to opening the popup/settings page, preventing unresponsive clicks.

## 3.22.0
- **New Features:**
  - Model List: Added a "Model Corresponding Key" tool (key icon) to check if a current model has an available key. If no key is available, you can create a default key with one click based on the model's available groups, or enter a custom creation process, with one-click key copying support.
  - Share Snapshot: Supports one-click sharing of "Overview Snapshot / Account Snapshot". It prioritizes copying the image to the clipboard, and automatically downloads a PNG if that's not supported. Snapshots only contain shareable information (no sensitive fields like `API Key`) and allow one-click copying of the title text.
- **Experience Optimizations:**
  - Disabled Accounts: In refresh and scheduled tasks for "Balance History / Usage Analysis / Usage Sync", disabled accounts will be automatically skipped, reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed an issue where the spinner was not visible on buttons in a "loading" state when a left-side icon was also displayed.

**Location Hints:**
- Model Corresponding Key: In "Settings → Model List", click the key icon ( `Model Corresponding Key` ) to the right of the model name.
- Share Overview Snapshot: The button ( `Share Overview Snapshot` ) to the right of the title bar on the overview page of the extension popup.
- Share Account Snapshot: In the operation menu for individual accounts in "Settings → Account Management" ( `Share Account Snapshot` ).

## 3.21.0
- **New Features:**
  - API Credentials: Added an "API Credentials" page, suitable for scenarios with only `Base URL` + `API Key` and no account. Supports unified management of tags/remarks, and allows direct availability verification and quick export (e.g., for Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added multi-account views (Overview / Account Distribution / Trends) and a unified "Account Summary" table for quick comparison and statistical aggregation.
  - Self-Built Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for functions like "Channel Management" and "Model Sync".
- **Experience Optimizations:**
  - Right-Click Menu: "Redemption Assistant" and "AI API Test" entries can now be enabled/disabled separately. Changes take effect immediately after switching.
  - Copy Key: When an account has no key, the popup provides entries for "Quickly Create Default Key / Create Custom Key", reducing the need to navigate back and forth.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Built Site Management", select `Done Hub`, and fill in "Done Hub Integration Settings".
- Right-Click Menu Entry Switch: In "Settings → Basic Settings → Sign-in & Redemption / AI API Test", under "Show in browser right-click menu" for each.
- Copy Key Popup: Opens when clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown options when adding a new key now display both the Group ID and description, facilitating quick differentiation and selection among multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" has been changed to off. If you wish to generate a default key after adding an account, please enable it manually in the settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add Key", and view in the group dropdown options.
- Auto Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Built Site Management: Added support for `Octopus` hosted sites. After connecting to the Octopus backend, you can import API keys as channels in "Channel Management" and also pull available model lists.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default), and provided a one-click "Ensure at least one key" option to automatically complete default keys for accounts missing them.
  - AI API Test: The "Model List Probing" for interface verification now supports interface types like OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and provides suggestions for available model IDs, reducing the need for manual guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account recognition logic to improve stability in scenarios with multiple accounts on the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-related interfaces to reduce errors caused by frequent refreshes or triggering site rate limits.
  - Channel Management: Improved duplicate detection when creating channels, with prompts for confirmation to prevent accidental creation of duplicate routes.
- **Bug Fixes:**
  - Disable Account: Disabled accounts are now automatically filtered out from dropdowns/lists in Key Management and related sections, preventing invalid operations.
  - Language: Fixed an issue where the extension's language setting might affect the webpage's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Built Site Management", select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Auto Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Complete Default Key: In "Settings → Key Management", at the top right, "Ensure at least one key".
- AI API Test Entry: Right-click menu "Quickly test AI API functionality".

## 3.18.0
- **New Features:**
  - Balance History: The chart now includes a "Currency Unit" switch (`USD` / `CNY`) and displays currency symbols on the axes/tooltips. When `CNY` is selected, it will be converted based on the account's "Recharge Amount Ratio" for easier trend viewing and reconciliation by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are many tags/account options, it defaults to "Expand to display", making browsing and selection more intuitive.
  - Tabbed Settings: Added left and right scroll buttons to the setting group tabs and manufacturer tabs in "Model List", making switching easier in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Auto-recognition" is now more accurate, fixing frequent unknown site type issues in recent versions.

**Location Hints:**
- Balance History Currency Unit: In the filter area of the "Settings → Balance History" page, under "Currency Unit".
- Account Exchange Rate (Recharge Amount Ratio): In the "Add/Edit Account" form in "Settings → Account Management", under "Recharge Amount Ratio".

## 3.17.0
- **New Features:**
  - Balance History: Added "Balance History" functionality (disabled by default). It records daily balance and income/expense snapshots, allowing you to view trends in charts. Supports filtering by tags/accounts and time range, and provides convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added a setting to control whether to enable it, the number of days to retain data, and "End-of-Day Fetching". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-Day Fetching", the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar in small/narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed responsive display issues in the export area for some screen sizes.
  - Popups: Fixed layout anomalies with incorrect scrollbar positions in popups.

**Location Hints:**
- Balance History Switch / Retention Days / End-of-Day Fetching: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added the Sub2API site type, supporting balance/quota queries. Supports reading login status from the console via "Auto-recognition". Also supports the "Plugin Hosted Session (Multi-account, Recommended)" mode, which allows independent authentication renewal for each account, improving the experience for multiple accounts on the same site.
  - Display Settings: Added a "Show Today's Income/Expenses" switch (enabled by default). This hides and stops fetching statistics like "Today's Consumption/Income", reducing log fetching requests during refreshes.
- **Note:**
  - Sub2API currently does not support site sign-in, today's usage, or income-related functions; it only provides basic balance/quota queries. Related functions will be gradually improved based on site capabilities.
  - "Plugin Hosted Session (Multi-account)" saves the `refresh_token` as private account credentials, which will be included in exports/WebDAV backups. Please keep backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Addition/Mode Explanation: In "Settings → Account Management", add/edit an account, and select Sub2API as the site type. For more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved the stability of background Service Workers, reducing instances where asynchronous timed tasks (WebDAV auto-sync / Usage sync / Model sync / Auto sign-in, etc.) are missed due to premature background termination. Automatically resumes related timed tasks after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" to save quick links to site consoles/documentation/management pages without needing to create a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now includes "Account / Bookmark" switching. Bookmark data will be included in backups/restores and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests, reducing unnecessary network calls (some sites already return `today_income` in their refresh interface).
  - Auto Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is now 30 seconds. Old configurations will be automatically corrected to a valid range after updating, and related prompts and documentation have been improved.

::: warning Important: Auto-refresh configuration will be forcibly adjusted
Feedback indicates that **overly short auto-refresh intervals can trigger site rate limits and place excessive load on sites**.

v3.15.0 **has made mandatory changes to auto-refresh configurations**:
- Auto-refresh and refresh on opening the plugin are now disabled by default. If you still wish to enable them, you must re-enable them manually.
- The minimum `Refresh Interval` is 60 seconds, and the `Minimum Refresh Interval Protection` is 30 seconds. If your pre-upgrade setting was below these thresholds, it will be automatically increased to the minimum value after upgrading. If your previously set value was within the new legal range, it will remain unaffected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; the top of the popup allows switching between "Account / Bookmark".
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly test AI API functionality" to open the test panel directly on the current webpage. Supports filling/pasting `Base URL` and `API Key`, and performs basic capability probing for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible also supports one-click model list fetching).
  - (Optional) Auto-Detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist. When a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (disabled by default, and keys are not saved).
  - Auto Sign-in: The execution results list now includes more troubleshooting tips, such as "Temporary shield tab manually closed" and "Access Token invalid," with suggestions and documentation links for common exceptions.
- **Bug Fixes:**
  - WebDAV: Auto-sync has been migrated from timers to the browser's Alarms API, reducing the probability of missed syncs due to background sleep/power saving policies.

**Location Hints:**
- AI API Test Panel: Right-click menu on any webpage, select "Quickly test AI API functionality"; auto-detection related settings are in "Settings → AI API Test".
- Auto Sign-in Prompts: View in the execution results list of "Settings → Auto Sign-in".

## 3.13.0
- **New Features:**
  - Account Management: Added a "Sign-in Status Expired" prompt. When the "Signed in today / Not signed in today" status is not from today's detection, an orange warning icon will be displayed. Clicking it will refresh the account data with one click, preventing misinterpretation due to old status.
  - Interface: Multi-select controls have been upgraded to more compact selectors (more space-saving, support search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and sign-in logic, improving usability.
  - Cookie Authentication: Removed the Cookie caching mechanism, reducing anomalies caused by reading old values after Cookie updates.

**Location Hints:**
- Sign-in Status Expired Prompt: In the account list of "Settings → Account Management", at the sign-in icon to the right of the site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code" - generates Kilo Code / Roo Code providerProfiles configurations, supporting copying apiConfigs snippets or downloading settings JSON for import (imports are incremental additions and will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long text like site names, now displaying truncated text automatically.
  - Dropdown Selectors: Optimized empty state prompts and fixed overflow issues with long option text.

**Location Hints:**
- Export to Kilo Code: In the key list of "Settings → Key Management", click the Kilo Code icon in the top right of a key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder. When an existing identical/similar channel is detected, a warning dialog will pop up, allowing you to choose to continue creation or cancel (no longer blocking creation with error toasts).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long text like site names, now displaying truncated text automatically.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will open within the current incognito window (facilitating maintaining incognito login status).
  - Account Management: Disabled accounts also support clicking site links, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, the chart and list will prioritize displaying the site name (instead of the username), making the information more intuitive.
  - Shield Assistant: The temporary shield window now supports CAP (cap.js) Proof-of-Work verification, improving pass rates.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Toast Notifications: Fixed toaster layer issues, preventing notifications from being obscured by web pages.

**Location Hints:**
- Site Links: In the account list of "Settings → Account Management", click the site name.
- Shield Assistant: Refer to [Cloudflare Shield Assistant](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added a "Manual Balance (USD)" field to accounts. When a site cannot automatically fetch balance/quota, you can manually enter it for display and statistics.
  - Account Management: Added an "Exclude from Total Balance" switch to accounts, used to remove specific accounts from "Total Balance" statistics (does not affect refresh/sign-in functions).
  - Settings: Added a "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Auto Sign-in: Refreshes relevant data and synchronizes the interface after execution.

**Location Hints:**
- Add/Edit Account: Open add/edit account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added a "Usage Analysis" page to help you visualize usage trends across multiple sites and accounts, allowing you to quickly see "where usage is high / costs are high / performance has slowed," facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (raw logs are not saved). Supports setting retention days, automatic sync methods, and minimum sync intervals, and viewing sync results and error prompts for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage", enable "Usage History Sync", set as needed, and click "Sync Now".
  - Then, view charts in "Usage Analysis" in the left-side menu; click "Export" when you need to retain data or perform reconciliation.

## 3.7.0
- **New Features:**
  - Sorting: The account list now supports sorting by "Income". The sorting priority now includes "Disabled accounts at the bottom," so inactive/invalid accounts no longer interfere with your daily use.
  - Auto Sign-in: Added "Trigger today's sign-in early when opening the interface." When opening the popup/sidebar/settings page within the time window, it will automatically attempt to run today's sign-in early, eliminating the need to wait for the scheduled time.
- **Bug Fixes:**
  - Auto Sign-in: Each account will only be signed in once per day. Retries are only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Auto Sign-in Early Trigger/Retries: Configure in "Auto Sign-in" in the left-side menu.

## 3.6.0
- **New Features:**
  - Account Management: Added one-click enable/disable accounts. After disabling, various functions will skip the account, allowing you to retain data even after an account becomes invalid.
  - Tags: Added global tag management and synchronized optimizations to related interfaces and interactions, facilitating classified management of accounts.
  - Popup: Displays the current version number in the title bar and provides a direct entry to this changelog.
  - Quick Export: CC Switch export now supports selecting upstream models, making exported configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to prevent display inconsistencies due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Sign-in" switch (moved above the custom sign-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from dialog title icons for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed a white screen issue that occurred when closing the dialog after expanding key details.

## 3.5.0
- **New Features:**
  - Auto Recognition: Added a "Detection is slow" prompt and related documentation links to help users troubleshoot and resolve issues.
  - Batch Open External Sign-in: Supports opening all in new windows, facilitating batch closing and reducing interference.
- **Bug Fixes:**
  - Batch Open External Sign-in: Refactored the process to execute in the background service, ensuring correct opening of all sites in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to directly select upstream models, enabling more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always have the `sk-` prefix, preventing recognition/copying issues due to inconsistent formats.

## 3.3.0
- **New Features:**
  - Auto Sign-in: Added "Username" information to account recognition, making it easier to distinguish accounts in multi-account scenarios.
  - External Sign-in: Supports batch triggering of external sign-ins, reducing the number of individual operations.
  - Auto Refresh: The minimum refresh interval no longer has a maximum limit, allowing for larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce accidental triggers in non-copying scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying prompts, reducing invalid redemption notifications.
  - Storage: Added write locks to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text for "Copy Model Name".

## 3.2.0
- **New Features:**
  - The "Model List" page now includes "Interface Availability Test" (Beta) for quickly confirming if the current key is usable with a specified model (e.g., text generation, tool/function calling, structured output (return JSON structure), web search (Grounding), etc.).
  - The "Model List" page now includes "CLI Tool Compatibility Test" (Beta) to simulate tool calling workflows for Claude Code / Codex CLI / Gemini CLI and assess interface compatibility within these tools.
  - The "About" page now includes "Rate and Download": Automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entry points for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will now display the status code and error reason, facilitating problem identification.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce failures in obtaining Cookies due to insufficient permissions.

## 3.1.0
- **New Features:**
  - Added administrator credential guidance in self-managed API settings.
  - Redemption Assistant now supports batch redemption and single-code retries.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing each account to coexist normally and all functions to be available. This is mainly for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy and model alias lists when exporting CLIProxyAPI.
  - Separated site sign-in and custom sign-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed an incorrect web path jump for manual sign-in on New-API sites.

## 2.39.0
- Automatically detects and modifies the sign-in support status of account sites during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number during version updates.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Directly select a specific redemption account using the up/down arrow keys.
  - Press Enter to confirm redemption.
- Added prompts to temporary shield tabs, explaining that the tab originates from this plugin and its purpose.
- Improved display of shield windows: single window with multiple tabs, meaning short-term requests will reuse the same window to minimize interference.
- Supports sign-in status detection and automatic sign-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added a more lenient option for redemption code format detection, correctly identifying redemption codes and popping up the Redemption Assistant when encountering custom formats.
- Fixed some known issues.

## 2.36.0
- Supports quick jumps to specific channels for management.
- Fixed an issue where the channel model sync time was reset.

## 2.35.1
- Fixed an issue where the auto sign-in execution time was reset.
- UI optimization.

## 2.35.0
- Added optional clipboard read permission to remind users to redeem when any potential redemption code is copied.
- Added cdk.linux.do to the default URL whitelist for the Redemption Assistant.

## 3.24.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error when comparing account IDs.
  - Ensured all temporary contexts are closed correctly.

## 3.23.0
- **New Features:**
  - Introduced "Temporary Context Mode" to more effectively bypass website protections.
  - API error messages are now internationalized.
  - Optimized website type detection, which can now be identified by the title of temporary windows.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation for refresh interval settings.
  - Fixed development dependency issues.

## 3.22.0
- **New Features:**
  - Model redirection is now smarter, supporting version numbers represented by hyphens and dots.
  - Added the ability to directly redeem via right-click menu after selecting text.
  - Auto sign-in is enabled by default, and the sign-in time window has been extended.

## 3.21.0
- **New Features:**
  - Enhanced cookie isolation for temporary windows, improving security.
  - Sign-in operations can now be quickly performed within the popup.
  - Redemption Assistant now supports a URL whitelist feature, allowing better control over which websites can use the assistant.

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
  - Optimized the centering of blank state content in Firefox.
  - Migrated the Switch component to a custom implementation for improved compatibility and stability.

## 3.18.0
- **New Features:**
  - Introduced the "Hosted Site" service, laying the groundwork for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" to "Hosted Site" in settings for clarity.
- **Bug Fixes:**
  - Optimized translation text, removing redundant fallback strings.

## 3.17.0
- **New Features:**
  - Account health status now includes more detailed codes, helping you understand specific issues.
  - Temporary window bypass feature now includes a health status indicator.
  - Optimized descriptions for bypassing website protections for better clarity.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategies.
  - Fixed display issues with Firefox popup prompts in Chinese settings.
- **Performance Optimizations:**
  - Improved the performance of the sorting feature.

## 3.16.0
- **New Features:**
  - Introduced a model pricing cache service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Model pricing information for multiple accounts can now be displayed simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component for improved selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 3.15.0
- **New Features:**
  - Added a new user guide card when the account list is empty.
  - When the pin/manual sort feature is disabled, related UI elements will be automatically hidden.
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
  - Removed extraneous periods at the end of JSON strings.

## 3.13.0
- **New Features:**
  - Enhanced account tagging functionality.
  - Temporary window bypass feature now supports more intelligent judgment based on error codes.

## 3.12.0
- **New Features:**
  - Account management now includes tagging functionality for classifying accounts.
  - Redemption Assistant popup UI now supports lazy loading and fixes issues that could cause website style conflicts.
  - Added global channel filter and JSON editing mode.

## 3.11.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed duplicate "Already signed in today" checks in auto sign-in.
  - Simplified and fixed the temporary window capture logic.
  - Restored parsing of search parameters in URL query strings.

## 3.10.0
- **New Features:**
  - Added permission prompts during initial installation to help you understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed an issue where operation buttons in the account dialog overflowed.
  - Redemption amount conversion coefficients now use constants for improved accuracy.
  - Limited the Cookie interceptor to only be used in Firefox browsers.

## 3.9.0
- **New Features:**
  - Added loading status and prompt messages during redemption.
  - Removed clipboard reading functionality from the Redemption Assistant.
- **Bug Fixes:**
  - Added missing backend error message translations.
  - Prevented concurrent initialization and race conditions in services, improving stability.
  - Resolved intermittent "Unable to establish connection" errors.
  - Prevented race conditions when destroying the temporary window pool.

## 3.8.0
- **New Features:**
  - Introduced a "Temporary Window Bypass" protection setting.
  - Added documentation for the Redemption Assistant feature.
  - Firefox browsers now support WebRequest-based Cookie injection.
  - Redemption functionality now supports themes and optimized prompt messages.
  - Redemption prompts now include source information and settings links.
- **Bug Fixes:**
  - Fixed path issues with Tailwind CSS files.

## 3.7.0
- **New Features:**
  - Added one-click redemption automatic popup prompt functionality.
  - Unified import/export and WebDAV backup data formats using a V2 versioning scheme for improved compatibility and stability.

## 3.6.0
- **New Features:**
  - Added a warning prompt when creating accounts in Firefox desktop.
  - API model synchronization now supports a channel filtering system.

## 3.5.0
- **New Features:**
  - MultiSelect component now supports parsing comma-separated strings.
- **Bug Fixes:**
  - Ensured caching is only performed during full channel data synchronization.
- **Performance Optimizations:**
  - Optimized upstream model caching logic.

## 3.4.0
- **New Features:**
  - Site metadata will be automatically detected during refresh.
  - When auto sign-in fails, retry and manual sign-in options are now available.
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

## 3.12.1
- **Bug Fixes:**
  - Fixed unnecessary reloads of channels when manually selecting tabs.
  - The "New API Model Sync" option is hidden when the configuration is invalid.

## 3.12.0
- **New Features:**
  - "New API Model Sync" now includes an allowlist filtering feature for models.
  - The sidebar now supports collapsing/expanding with smooth animations.

## 3.11.0
- **New Features:**
  - Account management functionality has been enhanced with search and navigation optimizations.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed logic errors in auto sign-in status.

## 3.10.0
- **New Features:**
  - Browser messages now support an exponential backoff retry mechanism for improved communication stability.
  - Model sync now includes a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured that missing fields in user preferences are populated with default values.

## 3.9.0
- **New Features:**
  - Introduced Cloudflare challenge detection and automatically attempts to bypass using temporary windows when encountering protection.
  - Introduced a temporary context management system.

## 3.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized dropdown menu positioning and accessibility for multi-select components.

## 3.8.0
- **New Features:**
  - Added fault tolerance mechanisms for partial account updates.
  - Account information can be saved even if data fetching fails during manual account addition.
  - The settings page now includes a "Settings Partition" feature for resetting settings by section.

## 3.7.1
- **Bug Fixes:**
  - Fixed an issue where redirected models were not appearing in the model list during API sync.

## 3.7.0
- **New Features:**
  - The account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hidden the password visibility button in Edge/IE browsers.

## 3.6.1
- **Important Update (Internal):**
  - User preferences such as `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now required to ensure the integrity of default configurations.
- **Bug Fixes:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed the issue of missing "New API Preference Settings" in configuration checks.
  - Corrected the sorting logic for sign-in requirements.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 3.6.0
- **New Features:**
  - The user interface for "New API Channel Import" has been optimized, supporting key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process for improved accuracy.
- **Bug Fixes:**
  - Model name standardization is now consistent with the Veloera backend and preserves hyphens.
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
  - The auto-import function now integrates the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - The multi-select component now supports a collapsible selected area and optimized input experience.
- **Bug Fixes:**
  - Optimized the retry mechanism and added user feedback.
  - Optimized the performance of the multi-select component with a large number of selections.

## 3.3.0
- **New Features:**
  - Added account pinning and unpinning functionality, with pinned accounts prioritized in sorting.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration, prioritizing the current site condition.

## 3.2.1
- **Bug Fixes:**
  - Removed the `isDetected` check for the auto-configure button.
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
  - Added username search and highlighting to the account list.
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
  - Added the functionality to open the sidebar.
- **Bug Fixes:**
  - Added translation for the "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with redemption page paths and support redirection.
  - You can choose to automatically open the redemption page after signing in.
  - Supports opening both sign-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API routing paths for multiple sites.

## 1.35.0
- **New Features:**
  - The sign-in icon has been updated to a "Yen" icon for better clarity.
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
  - Added a "Create Account" button to account management and optimized the layout.
  - Added "Usage Logs" functionality to account management.
  - The sorting priority setting now supports drag-and-drop auto-save, removing the manual save button.
- **Bug Fixes:**
  - Updated the size and accessibility labels for SiteInfo icon buttons.

## 1.30.0
- **New Features:**
  - Replaced the dialog component with a custom `Modal` component for improved consistency.
  - Introduced a comprehensive set of UI components for enhanced interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected sign-in logic and sorting priority.
  - Optimized the transparency and layering of the mobile sidebar overlay for an improved user experience.

## 1.29.0
- **New Features:**
  - Popups now support detection and automatic closing.
  - Popups now feature responsive mobile layouts to avoid zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent auto-detection functionality.
  - Migrated `chrome.*` APIs to `browser.*` APIs, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functional compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed `tabId` parsing issues after window creation.
  - Prevented rotation animations on button borders during refresh.

## 1.27.0
- **New Features:**
  - The account dialog now automatically closes after successful auto-configuration to New API.
  - Implemented dynamic loading of localization resources for improved internationalization support.
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
  - Replaced hardcoded Chinese text in `TokenHeader` prompts with translation keys.

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
  - Fixed the issue where a success message was still displayed when refreshing without accounts.

## 1.22.0
- **New Features:**
  - Accounts now include a "Today's Total Income" field and an income display interface.
  - Supports redemption code recharge types.
- **Bug Fixes:**
  - Fixed rendering logic for custom URL sign-in interfaces.
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
  - API configuration interfaces now require the `authType` field.

## 1.18.0
- **New Features:**
  - Accounts now include a custom sign-in button (with a Yen icon).
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting functionality now includes custom sign-in URLs as sorting conditions.
- **Bug Fixes:**
  - Fixed an issue where custom sign-in URLs were not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication types.
  - API authentication options now include a "No Authentication" type.
  - The tooltip component has been migrated to the `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" functionality now supports automatic account configuration.
  - Site accounts now support sign-in functionality.
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
  - Refresh functionality has been enhanced to support detailed status tracking.
  - Added a minimum refresh interval to prevent frequent requests.

## 1.10.0
- **New Features:**
  - Key copying functionality now includes Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub token management and data fetching capabilities.
  - Added user group data transformation and API integration.
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
  - Optimized the rendering method of the model list for improved loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed an issue where the detected account status was reset when no existing account was found.

## 1.4.0
- **New Features:**
  - Added a "Copy Model Name" function to the control panel.
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
  - Added manual account addition support and optimized the UI flow.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and a warning prompt when adding accounts.
  - Introduced sidebar functionality, replacing popup-based auto site configuration.

## 0.0.3
- **New Features:**
  - Optimized account recognition flow, now supporting automatic access key creation.
  - Account list now includes sortable headers, a copy key dialog, and hover action buttons.
  - Account management now includes a remarks field.
  - Website names are now clickable for navigation.
  - Model list supports group selection.
  - Popup pages now feature animated number rolling and site status indicators.
  - Optimized add/edit account dialogs, including recharge ratio settings and automatic site name extraction.
  - Implemented a comprehensive settings page system supporting user preference persistence and auto-refresh.
  - Enhanced frontend interface and backend services for auto-refresh functionality.
  - Automatically adds the `sk-` prefix when copying keys.
  - Introduced industry-standard tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Added support for more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Redesigned the popup interface to an API Manager style, including display of today's total consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed issues with incompatible model data formats, `localStorage` access, and API request credentials.
  - Corrected API authentication methods.
  - Optimized URL input handling and auto-refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**