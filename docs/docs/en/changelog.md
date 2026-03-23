# Changelog

This page records major updates for general users (feature changes / experience optimizations / bug fixes). For the complete history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip For New Users
- **How to confirm your current version**: Open the extension popup; the version number will be displayed in the title bar. You can also check it on the settings page.
- **How to stop this page from opening automatically**: You can control whether to "Automatically open the changelog after updates" in "Settings → General → Changelog".
- **Troubleshooting**: In "Settings → General → Logs", you can enable console logs and report reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.30.0
- **New Features:**
  - Channel Management: Added `Channel Migration`, supporting previewing migration before migrating current filter results or selected channels to other hosted sites.
  - Hosted Sites:
    - You can now switch the current hosted site type directly in "Settings → Self-Hosted Site Management".
    - `Done Hub` / `Veloera` now support reading real channel keys.
  - CC Switch Export: Added `OpenCode` / `OpenClaw` types.
  - Multi-language: Added Japanese and Traditional Chinese (`zh-TW`) interface languages.
- **Experience Optimizations:**
  - First Use & Interface:
    - Welcome / Permission Guide popups now support direct language selection.
    - Added quick theme and language switching at the top of the settings page.
  - API Verification: Saved `API Credentials` and model verification will retain the last probe result and timestamp.
  - Resource Usage: Some settings pages, extension popups, and views are now loaded on demand, reducing unnecessary initialization and resource consumption.
- **Bug Fixes:**
  - WebDAV: Compatible with Nutstore returning `409 AncestorsNotFound`. These cases will be handled as "remote backup does not exist", reducing false failure reports during initial synchronization or with empty directories.

**Location Hints:**
- Hosted Site Type Switching: In "Settings → Self-Hosted Site Management".
- Channel Migration: At the top of the "Settings → Channel Management" page under `Channel Migration`.
- CC Switch Export: In the export entry of "Settings → Key Management" or "Settings → API Credentials".
- Quick Theme/Language Control: On the top right of the settings page; the initial language selection will appear in the welcome/permission guide popup when the extension is first opened.
- Last API Verification Result: Can be viewed in relevant verification dialogs and supported `API Credentials` / model verification interfaces.

## 3.29.0
- **New Features:**
  - Auto Sign-in: Added `Batch Open Manual Sign-in Pages`, allowing you to open manual sign-in pages for failed accounts at once, displaying progress, completion, and partial failure hints. Holding `Shift` while clicking will open them in new windows.
  - Feedback & Support: Added a `Community Discussion Group` entry in the "Feedback" menu of the extension popup and on the "About" page, directly linking to the community hub page for WeChat group QR codes, Telegram groups, and other communication channels.
- **Experience Optimizations:**
  - Browser Language: Improved compatibility with browser language environments like Traditional Chinese and adjusted the default language fallback logic for more stable language recognition on initial startup.
  - Documentation Links: Optimized multi-language document jump rules. Unsupported language environments will automatically fall back to English documentation, reducing the chance of landing on an incorrect language page.
  - Multi-language: Unified some translation value retrieval methods and cleaned up some unused text to optimize the multi-language experience.
- **Bug Fixes:**
  - Sidebar: Fixed an occasional issue where the sidebar could not be opened after clicking the toolbar in Chrome/Edge (MV3).
  - Key Management: When viewing masked keys, added a loading state and support for displaying the full key. It will not re-request when expanded again.
  - Browser Background: Temporary pages will be cleaned up more promptly when the extension is suspended, reducing issues with lingering temporary pages.

**Location Hints:**
- Batch Manual Sign-in: In the failed account related operations on the "Settings → Auto Sign-in" page.
- Community Entry: In the `Feedback` menu in the top right of the extension popup, and in the `Feedback & Support` section of "Settings → About".
- Key Display: Click the show/hide button in the key list of "Settings → Key Management".

## 3.28.0
- **New Features:**
  - API Credentials: Added `Verify CLI Compatibility` operation. During verification, it supports automatic retrieval or manual input of model IDs and clearly indicates if a temporary `API Type` override is currently in use, preventing misinterpretation of one-time test results as saved configurations.
  - API Credentials / Model List: You can now jump from `API Credentials` to the corresponding `Model List` data source with one click. The `Model List` also supports directly using API credentials as a data source to view model directories and verification results without needing to create a site account first.
  - Key Management: `Key Management` now displays hosted site channel status, matching signals, and jumpable entries. When saving keys to `API Credentials`, clearer names are generated, making future lookup and reuse easier.
  - New API Hosted Sites: Added login auxiliary information (username, password, optional TOTP) and session verification in hosted site configurations. When verifying status or reading real channel keys, verification can be completed directly within the extension.
  - Hosted Site Matching: Channel identification now uses a comprehensive ranking based on `URL`, keys, and models. For scenarios where the backend only returns masked tokens, channel status judgment, copying, and integration operations can still be completed.
  - First Use: The Welcome / Permission Guide popup now includes a language selector, allowing you to switch interface languages upon first opening and remember your subsequent preferences.
- **Experience Optimizations:**
  - Veloera: For scenarios where channel localization and status detection based on `Base URL` are not currently supported, relevant entries will be automatically hidden or disabled with explanations, reducing confusion from clicking and getting no results.
- **Bug Fixes:**
  - Language: Fixed an issue where the browser's detected language was not consistently followed on startup, and synchronized corrections for interface text and date/time localization.
  - Permission Guide: Optimized the button layout of the permission explanation popup for better alignment and easier clicking in small windows or when buttons wrap.

**Location Hints:**
- API Credentials: In "Settings → API Credentials", you can use operations like `Verify CLI Compatibility` and `Open in Model Management`.
- Model List Data Source: In the data source selection area at the top of "Settings → Model List", you can switch to `API Credentials`.
- Hosted Site Channel Status: View hosted site status and matching hints for each key in "Settings → Key Management".
- New API Hosted Site Login Auxiliary: In the `New API Integration Settings` area of "Settings → Self-Hosted Site Management".
- Initial Language Selection: In the Welcome / Permission Guide popup that appears when the extension is first opened.

## 3.27.0
- **New Features:**
  - Account Management: Added filtering by enabled status to the account list, allowing quick switching between viewing `Enabled` / `Disabled` accounts, making bulk management of invalid accounts easier.
  - Feedback & Support: Added a quick `Feedback` entry in the extension popup title bar, and a `Feedback & Support` section on the "About" page, which directly opens GitHub for issue reporting, feature suggestions, and discussions.
- **Experience Optimizations:**
  - Account Display: When multiple accounts have the same site name, the username will be automatically appended, displayed as `Site Name · Username`, making them easier to distinguish in lists, searches, selectors, and statistics views.
- **Bug Fixes:**
  - Sidebar: Further optimized sidebar detection. When the browser or mobile environment does not support sidebars, invalid entries will be automatically hidden or fall back to the settings page, reducing instances of unresponsive clicks.

**Location Hints:**
- Account Status Filtering: In the filter area at the top of the list in "Settings → Account Management".
- Feedback Entry: In the `Feedback` button in the extension popup title bar, and in the `Feedback & Support` section of "Settings → About".

## 3.26.0
- **New Features:**
  - Account Management: Added `Locate Corresponding Channel` quick action, allowing one-click navigation from a hosted site account to the corresponding "Channel Management" list with filters applied. Also supports enabling "Remind before adding duplicate accounts" to reduce accidental additions of duplicate accounts.
  - Duplicate Account Cleanup: Added a `Duplicate Account Cleanup` tool that scans and deletes duplicates by URL source site + User ID, making bulk cleanup of duplicate accounts easier.
  - Account Management: The operation menu for disabled accounts now includes a direct delete entry, streamlining the cleanup of invalid accounts.
  - API Credentials: The `API Credentials` page is now accessible directly from the settings navigation and the extension popup. Exported configurations will also retain token remarks, facilitating migration between multiple tools.
  - WebDAV: Added synchronization data selection, allowing selective synchronization of shared data such as `Accounts`, `Bookmarks`, `API Credentials`, etc., reducing unnecessary overwrites between devices.
  - Sub2API: Added key management support for `Sub2API` accounts, allowing direct viewing, creation, editing, and deletion of keys.
  - CLIProxyAPI: Added Provider type selection during import and automatically standardizes common endpoint addresses, reducing manual URL modifications.
- **Experience Optimizations:**
  - Redemption Assistant: Automatically refreshes account balances after successful redemption, reducing the need for manual refreshes to confirm results.
- **Bug Fixes:**
  - Auto Sign-in: Fixed time-based sign-in to include a more stable retry mechanism, reducing missed sign-ins due to missed execution windows caused by extension updates.
  - Auto Recognition: Fixed an issue where custom sign-in configurations might be lost after account re-recognition, preventing accidental configuration loss.
  - Auto Sign-in: Fixed an issue where Turnstile assistance or manual sign-in prompts might incorrectly use `External Sign-in URL` for some accounts. It now always opens the site's default sign-in page, reducing instances of incorrect page jumps or failed sign-ins.
  - Hosted Sites: When importing or synchronizing data to hosted sites, the target site's default group is now prioritized, reducing anomalies caused by group mismatches.

::: warning Note
- WebDAV's `Sync Data Selection` and automatic account refresh, along with other local device settings, will no longer overwrite each other between devices via WebDAV.
:::

**Location Hints:**
- Duplicate Account Reminder: In "Settings → Basic Settings → Account Management" under `Remind before adding duplicate accounts`.
- Duplicate Account Cleanup: In the toolbar of the "Settings → Account Management" page.
- Locate Channel: In the operation menu for individual accounts in "Settings → Account Management".
- API Credentials: In "Settings → API Credentials"; the extension popup can also switch to the `API Credentials` view.
- WebDAV Sync Data Selection: In "Settings → Import & Export" under `WebDAV Settings`.

## 3.25.0
- **New Features:**
  - Auto Sign-in: Supports Cloudflare Turnstile (anti-bot/human verification) scenarios. When a site requires Turnstile verification, it will attempt to complete the verification on a temporary page and then proceed with sign-in. It also provides a manually openable sign-in link and prompt when necessary.
  - CC Switch: When exporting to `Codex`, it will automatically append `/v1` to the default base address's interface address (if the interface address has not been manually modified), reducing issues with unavailable interfaces after direct import.
  - Model Redirect: Added an optional switch `Clean up invalid redirect targets after sync`. This will automatically delete mappings in `model_mapping` that point to non-existent models after model synchronization refresh (a dangerous operation, disabled by default).
- **Experience Optimizations:**
  - Temporary Windows: More accurately identifies challenge/login pages, reducing misjudgments and unnecessary interruptions.
- **Bug Fixes:**
  - Cookie Authentication: Corrected the wording to align with current actual behavior and capabilities, reducing misguidance.
  - Sidebar: Fixed an issue where the sidebar could not be scrolled to see bottom menu items in small windows.

**Location Hints:**
- Turnstile Verification: View new prompts in the execution results of "Settings → Auto Sign-in".
- CC Switch Export: In "Settings → Key Management", select a key, click `Export to CC Switch`, and choose `Codex` as the target application.
- Model Redirect Cleanup: In "Settings → Basic Settings → Model Redirect", enable `Clean up invalid redirect targets after sync`.

## 3.24.0
- **New Features:**
  - Changelog: The plugin will no longer automatically open a new tab in the browser after an update. Instead, when you first open the plugin interface, the update content will be displayed in a popup within the plugin, with an option to open the full changelog.
  - LDOH: Added a `View in LDOH` (LDOH icon) quick entry in the account list, allowing direct navigation to LDOH with the corresponding site pre-filtered. An `Open LDOH Site List` entry is also provided when adding accounts to facilitate finding sites.
- **Experience Optimizations:**
  - Documentation Links: When opening documentation/changelogs from the plugin, it will automatically jump to the corresponding language version of the documentation based on the current plugin language.

**Location Hints:**
- Changelog Switch: In "Settings → General → Changelog" under `Automatically display update content after updates`.
- Changelog Popup: After updating the plugin, it will automatically pop up the first time you open the "Extension Popup / Settings Page / Sidebar" (once per version).
- LDOH Quick Entry: To the right of the site name in the account list of "Account Management" (LDOH icon, prompt `View in LDOH`); you can also click `Open LDOH Site List` in the add account dialog.

## 3.23.0
- **New Features:**
  - Auto Sign-in: Added `Quick Sign-in` to the account operation menu, allowing immediate execution of a sign-in for a single account and status refresh upon completion.
  - Key Management: Added an `All Accounts` view that aggregates keys by account group, facilitating cross-account search and copying.
  - Model Redirect: Added a `Clear Model Redirect Mappings` bulk operation, allowing quick reset of `model_mapping` by selecting channels and confirming (irreversible).
- **Experience Optimizations:**
  - New API Channel Management: URLs in the channel list are now clickable and searchable.
- **Bug Fixes:**
  - Channel Management: Fixed inaccurate prompt text for `Priority` in the channel dialog.
  - Model Redirect: Automatic mapping generation now includes a "version guard" to prevent cross-version mismatches.
  - Sidebar: When the runtime environment does not support sidebars, it will automatically fall back to opening a popup/settings page, preventing unresponsive clicks.

## 3.22.0
- **New Features:**
  - Model List: Added a "Model Corresponding Key" tool (key icon) to check if a current model has an available key. If no key is available, it allows one-click creation of a default key based on the model's available group, or entering a custom creation process, and supports one-click key copying.
  - Share Snapshot: Supports one-click sharing of "Overview Snapshot / Account Snapshot". It prioritizes copying the image to the clipboard, and downloads a PNG if not supported. Snapshots only contain shareable information (no sensitive fields like `API Key`) and allow one-click copying of the title text.
- **Experience Optimizations:**
  - Disabled Accounts: In refresh and scheduled tasks for "Balance History / Usage Analysis / Usage Sync", disabled accounts will be automatically skipped, reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed an issue where the spinner was not visible on buttons in a "loading" state when a left-side icon was also displayed.

**Location Hints:**
- Model Corresponding Key: In "Settings → Model List", click the key icon ( `Model Corresponding Key` ) to the right of the model name.
- Share Overview Snapshot: In the button ( `Share Overview Snapshot` ) on the right side of the title bar of the overview page in the extension popup.
- Share Account Snapshot: In the operation menu for individual accounts in "Settings → Account Management" ( `Share Account Snapshot` ).

## 3.21.0
- **New Features:**
  - API Credentials: Added an "API Credentials" page suitable for scenarios with only `Base URL` + `API Key` and no account. Supports unified management of tags/remarks and direct availability verification and quick export (e.g., Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added multi-account views (Overview / Account Distribution / Trends) and a unified "Account Summary" table for quick comparison and summary statistics.
  - Self-Hosted Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for functions like "Channel Management" and "Model Sync".
- **Experience Optimizations:**
  - Right-Click Menu: "Redemption Assistant" and "AI API Detection" entries can now be toggled independently. Changes take effect immediately after switching and refreshing.
  - Copy Key: When an account has no key, the popup provides entries for "Quickly Create Default Key / Create Custom Key", reducing the need to navigate back and forth.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Done Hub` and fill in "Done Hub Integration Settings".
- Right-Click Menu Entry Switch: In "Settings → Basic Settings → Sign-in & Redemption / AI API Testing", under "Show in Browser Right-Click Menu" respectively.
- Copy Key Popup: Opens when clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown options when adding a new key now display both the group ID and description, facilitating quick differentiation and selection among multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" has been changed to off. If you wish to automatically generate a default key upon adding a new account, please enable it manually in the settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add Key" and view in the group dropdown options.
- Auto Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Hosted Site Management: Added `Octopus` hosted site support, allowing connection to the Octopus backend and importing account API keys as channels in "Channel Management". It also supports fetching available model lists.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default) and a "Ensure at least one key" option to automatically complete default keys for accounts missing them.
  - AI API Testing: The "Model List Probe" for interface verification now supports OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and other interface types, providing suggestions for available model IDs to reduce manual guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account recognition logic to improve stability in scenarios with multiple accounts on the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-related interfaces to reduce errors or triggering site rate limits due to frequent refreshes.
  - Channel Management: Improved duplicate channel detection during creation, with a confirmation prompt to prevent accidental creation of duplicate routes.
- **Bug Fixes:**
  - Disable Accounts: Disabled accounts are now automatically filtered out from relevant dropdowns/lists like key management, preventing invalid operations.
  - Language: Fixed an issue where the extension's language setting might affect the webpage's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Auto Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Default Key Completion: In "Settings → Key Management", in the top right corner, "Ensure at least one key".
- AI API Testing Entry: Right-click menu "Quickly test AI API functionality availability".

## 3.18.0
- **New Features:**
  - Balance History: Charts now support switching between "Currency Units" (`USD` / `CNY`) and display currency symbols on axes/tooltips. When `CNY` is selected, it converts based on the account's "Recharge Amount Ratio" for easier trend viewing and reconciliation by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are many tags/account options, it defaults to "Expand to display", making browsing and selection more intuitive.
  - Tabbed Labels: Added left and right scroll buttons to "Settings" group tabs and "Model List" vendor tabs, making switching easier in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Auto-detection" is now more accurate, fixing the issue of unknown site types appearing frequently in recent versions.

**Location Hints:**
- Balance History Currency Unit: In the filter area of the "Settings → Balance History" page, under "Currency Unit".
- Account Exchange Rate (Recharge Amount Ratio): In the "Add/Edit Account" form in "Settings → Account Management", under "Recharge Amount Ratio".

## 3.17.0
- **New Features:**
  - Balance History: Added "Balance History" feature (disabled by default), which records daily balance and income/expenditure snapshots and displays trends in charts. Supports filtering by tags/accounts and time range, with convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added a setting to control whether to enable it, the number of days to retain, and "End-of-Day Capture". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-Day Capture", the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar in small/narrow screens.
- **Bug Fixes:**
  - Import/Export: Fixed responsive display issues in the export area on some screen sizes.
  - Popups: Fixed layout anomalies with incorrect scrollbar positions in popups.

**Location Hints:**
- Balance History Switch/Retention Days/End-of-Day Capture: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added Sub2API site type, supporting balance/quota queries. Supports reading login status via "Auto-detection" from the console. Also supports the "Plugin Hosted Session (Multi-account, Recommended)" mode, which allows independent authentication renewal for each account, improving the experience for multiple accounts on the same site.
  - Display Settings: Added a "Show Today's Income/Expenses" switch (enabled by default), which hides and stops fetching statistics like "Today's Consumption/Income", reducing log fetching requests during refreshes.
- **Note:**
  - Sub2API currently does not support site sign-in, daily usage, or income-related functions; it only provides basic balance/quota queries. Related functions will be gradually improved based on site capabilities.
  - "Plugin Hosted Session (Multi-account)" saves the `refresh_token` as private account credentials and will be included in exports/WebDAV backups. Please keep backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Addition/Mode Explanation: In "Settings → Account Management", add/edit account, select Sub2API as the site type; for more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved background Service Worker stability, reducing instances where asynchronous timed tasks (WebDAV auto-sync / usage sync / model sync / auto sign-in, etc.) are missed due to premature background termination. Resumes related timed tasks automatically after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" for saving quick links to site consoles/documentation/management pages without needing to create a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now has an "Accounts / Bookmarks" toggle. Bookmark data will be included in backups/restores and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests, reducing unnecessary network calls (some sites already return `today_income` in their refresh interface).
  - Auto Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is now 30 seconds. Old configurations will be automatically corrected to a valid range after updating, and related prompts and documentation have been improved.

::: warning Important: Auto Refresh Configuration Will Be Forced Adjusted
Due to feedback indicating that **overly short auto-refresh intervals can trigger site rate limits and place excessive load on sites**,

v3.15.0 **has forced adjustments to auto-refresh configurations**:
- Auto-refresh and refresh on plugin open are now disabled. If you still need to enable them, you must re-enable them manually.
- The minimum `Refresh Interval` is 60 seconds, and the `Minimum Refresh Interval Protection` is 30 seconds. If your pre-upgrade setting was below these thresholds, it will be automatically raised to the minimum value after upgrading. If your previous setting was within the new valid range, it will remain unaffected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; the top of the popup allows switching between "Accounts / Bookmarks".
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly test AI API functionality availability" to open the test panel directly on the current webpage. Supports filling/pasting `Base URL` and `API Key`, and performs basic capability probes for OpenAI-compatible / OpenAI / Anthropic / Google interfaces (OpenAI-compatible also supports one-click model list retrieval).
  - (Optional) Auto-Detection: Can be enabled in "Settings → AI API Test" with a configurable URL whitelist. When a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (disabled by default, and keys are not saved).
  - Auto Sign-in: The execution results list now includes more troubleshooting hints, such as suggestions and documentation links for common exceptions like "Temporary shield bypass tab manually closed" and "Access Token invalid".
- **Bug Fixes:**
  - WebDAV: Auto-sync has been migrated from timers to the browser Alarms API, reducing the probability of missed synchronization due to background sleep/power saving policies.

**Location Hints:**
- AI API Test Panel: Right-click on any webpage and select "Quickly test AI API functionality availability"; auto-detection settings are in "Settings → AI API Test".
- Auto Sign-in Hints: View in the execution results list of "Settings → Auto Sign-in".

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
  - Key Management: Added "Export to Kilo Code" - generates Kilo Code / Roo Code providerProfiles configurations, supporting copying `apiConfigs` snippets or downloading `settings.json` for import (imports are additive, will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long site names, now displaying truncated text.
  - Dropdown Selectors: Improved empty state prompts and fixed overflow issues with long option text.

**Location Hints:**
- Export to Kilo Code: In the key list of "Settings → Key Management", click the Kilo Code icon in the top right corner of a key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder. When an existing identical/similar channel is detected, a warning dialog will pop up, allowing you to choose to continue creation or cancel (no longer blocking creation with error toasts).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long site names, now displaying truncated text.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will open within the current incognito window (to maintain incognito login status).
  - Account Management: Disabled accounts also support clicking site links, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, charts and lists prioritize displaying the site name (instead of username) for more intuitive information.
  - Shield Helper: The temporary shield bypass window now supports CAP (cap.js) Proof-of-Work verification, improving success rates.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Hint Popups: Fixed Toaster layering issues, preventing hints from being obscured by web pages.

**Location Hints:**
- Site Links: In the account list of "Settings → Account Management", click the site name.
- Shield Helper: Refer to [Cloudflare Shield Helper](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added "Manual Balance (USD)" field. When a site cannot automatically fetch balance/quota, you can manually enter it for display and statistics.
  - Account Management: Added "Exclude from Total Balance" switch. This removes specific accounts from "Total Balance" statistics (does not affect refresh/sign-in functions).
  - Settings: Added "Automatically open changelog after update" switch (disables the behavior of automatically opening this page after updates).
  - Settings: Added log settings to control whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Auto Sign-in: Refreshes relevant data and synchronizes interface refresh upon completion.

**Location Hints:**
- Add/Edit Account: Open add/edit account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added a "Usage Analysis" page to help you visualize usage trends across multiple sites and accounts, allowing you to quickly see "where usage is high / spending is high / performance is slow", facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (original logs are not saved). Supports setting retention days, automatic sync methods, and minimum sync intervals, and viewing sync results and error hints for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage" and enable "Usage History Sync", configure as needed, and click "Sync Now".
  - Then, view charts in "Usage Analysis" on the left-side menu; click "Export" when you need to retain or reconcile data.

## 3.7.0
- **New Features:**
  - Sorting: Account list now supports sorting by "Income". Sorting priority now includes "Disable accounts at the bottom", preventing disabled/invalid accounts from interfering with your daily use.
  - Auto Sign-in: Added "Trigger today's sign-in early when opening the interface". When opening the popup/sidebar/settings page within the time window, it will automatically attempt to perform today's sign-in early, without waiting for the scheduled time.
- **Bug Fixes:**
  - Auto Sign-in: Each account will only be signed in once per day. Retries are only for failed accounts, reducing unnecessary requests and repeated disturbances.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Auto Sign-in Early Trigger/Retries: Configure in the "Auto Sign-in" menu on the left.

## 3.6.0
- **New Features:**
  - Account Management: Added one-click enable/disable accounts. Disabled accounts will be skipped by all functions, preserving data after account expiration.
  - Tags: Added global tag management and synchronized optimizations to related interfaces and interactions for easier category-based account management.
  - Popup: Displays the current version number in the title bar and provides a direct entry to this changelog.
  - Quick Export: CC Switch export now supports selecting upstream models, making exported configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized display strategy for extremely small values to prevent unexpected results due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Sign-in" switch (moved above the custom sign-in URL) for more intuitive configuration.
  - Interface: Removed gradient background from dialog title icons for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Auto Recognition: Added "Slow Detection" prompts and related documentation links to help users troubleshoot and resolve issues.
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
  - Auto Sign-in: Added "Username" information to account recognition for easier differentiation in multi-account scenarios.
  - External Sign-in: Supports batch triggering of external sign-ins, reducing the number of individual operations.
  - Auto Refresh: The minimum refresh interval no longer has a maximum limit, allowing larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce accidental triggers in non-copying scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying popup prompts, reducing invalid redemption hints.
  - Storage: Added write locks to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text for "Copy Model Name".

## 3.2.0
- **New Features:**
  - "Model List" page now includes "Interface Availability Test" (Beta) for quickly confirming if the current key is usable for specified models (e.g., text generation, tool/function calling, structured output (returning JSON), web search (Grounding), etc.).
  - "Model List" page now includes "CLI Tool Compatibility Test" (Beta), simulating tool invocation flows for Claude Code / Codex CLI / Gemini CLI to assess interface compatibility within these tools.
  - "About" page now includes "Rate and Download": Automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entries for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason for easier problem identification.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Features:**
  - In self-managed API settings, added administrator credential input guidance.
  - Redemption Assistant now supports batch redemption and single-code retries.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing them to coexist and all functions to be available. This is mainly for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy and model alias lists when exporting CLIProxyAPI.
  - Separated site sign-in and custom sign-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed incorrect web page path redirection for manual sign-in on New-API sites.

## 2.39.0
- Automatically detects and modifies the sign-in support status of account sites during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Select specific redemption accounts directly using up/down arrow keys.
  - Press Enter to confirm redemption.
- Added prompts to temporary shield bypass tabs, explaining that the tab originates from this plugin and its purpose.
- Improved shield bypass window display: single window with multiple tabs, meaning short-term requests reuse the same window to minimize interference.
- Supports sign-in status detection and automatic sign-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added more flexible redemption code format detection options to correctly identify redemption codes and prompt the Redemption Assistant when encountering custom formats.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific channels for management.
- Fixed an issue that would reset channel model synchronization time.

## 2.35.1
- Fixed an issue that would reset auto sign-in execution time.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to remind users about redemption when copying any potential redemption codes.
- Added `cdk.linux.do` to the default URL whitelist for the Redemption Assistant.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error during account ID comparison.
  - Ensured all temporary contexts are closed correctly.

## 3.33.0
- **New Features:**
  - Introduced "Temporary Context Mode" for more effective bypassing of website protections.
  - API error messages are now internationalized.
  - Optimized website type detection, which can now be identified by the title of temporary windows.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 3.32.0
- **New Features:**
  - Model redirects are now smarter, supporting version numbers represented by hyphens and dots.
  - Added the ability to redeem directly via the right-click menu after selecting text.
  - Auto sign-in is enabled by default, and the sign-in time window has been extended.

## 3.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Sign-in operations can now be quickly performed within the popup.
  - Redemption Assistant now supports a URL whitelist feature, giving you better control over which websites can use it.

## 3.30.0
- **New Features:**
  - Added sign-in support for Wong sites.
  - Added sign-in support for AnyRouter sites.
  - Optimized detection capabilities for Cloudflare challenge pages.
  - WebDAV backups now support encryption, and a decryption retry popup has been added for restoration, while preserving your WebDAV configuration.

## 3.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website Cookie interception issues during automatic detection.
  - Optimized the centering of blank state content in Firefox.
  - Migrated the Switch component to a custom implementation, improving compatibility and stability.

## 3.28.0
- **New Features:**
  - Introduced "Hosted Sites" service, laying the foundation for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" in settings to "Hosted Sites" for clarity.
- **Bug Fixes:**
  - Optimized translation text and removed redundant fallback strings.

## 3.27.0
- **New Features:**
  - Account health status now includes more detailed codes for easier problem identification.
  - Temporary window bypass feature now includes a health status indicator.
  - Optimized descriptions for bypassing website protections for better clarity.
  - Added a notification system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed display issues with Firefox pop-up notifications in Chinese settings.
- **Performance Optimizations:**
  - Improved the performance of the sorting function.

## 3.26.0
- **New Features:**
  - Introduced a model pricing cache service for faster data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Model pricing information for multiple accounts can now be displayed simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 3.25.0
- **New Features:**
  - Added a new user guide card when the account list is empty.
  - When the pin/manual sort feature is disabled, related UI elements will be automatically hidden.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

## 3.24.0
- **New Features:**
  - Updated application description and about page content.
  - Extension name now includes a subtitle.
  - Tag filter now includes visibility control based on row count.
  - WebDAV connection tests now support more success status codes.
- **Bug Fixes:**
  - Removed extra periods at the end of JSON strings.

## 3.23.0
- **New Features:**
  - Enhanced account tagging functionality.
  - Temporary window bypass feature now supports more intelligent judgment based on error codes.

## 3.22.0
- **New Features:**
  - Account management now includes tagging for easy account categorization.
  - Redemption assistant popup UI now supports lazy loading and fixes issues that could cause website style conflicts.
  - Added global channel filter and JSON editing mode.

## 3.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed duplicate "Signed in today" checks from auto sign-in.
  - Simplified and fixed temporary window capture logic.
  - Restored parsing of search parameters in URL query strings.

## 3.20.0
- **New Features:**
  - Added permission guide during initial installation for better understanding of required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed an issue where action buttons in the account dialog would overflow.
  - Redemption amount conversion coefficients now use constants for improved accuracy.
  - Limited the Cookie interceptor to only be used in Firefox browsers.

## 3.19.0
- **New Features:**
  - Added loading states and prompts during the redemption process.
  - Removed clipboard reading functionality from the Redemption Assistant.
- **Bug Fixes:**
  - Added missing backend error message translations.
  - Prevented concurrent initialization and race conditions in services for improved stability.
  - Resolved intermittent "Unable to establish connection" errors.
  - Prevented race conditions during the destruction of temporary window pools.

## 3.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Assistant feature.
  - Firefox browsers now support WebRequest-based Cookie injection.
  - Redemption feature now supports themes and optimized prompt messages.
  - Redemption prompts now include source information and settings links.
- **Bug Fixes:**
  - Fixed path issues with Tailwind CSS files.

## 3.17.0
- **New Features:**
  - Added automatic popup notification for one-click redemption.
  - Unified import/export and WebDAV backup data formats using a V2 versioning scheme for improved compatibility and stability.

## 3.16.0
- **New Features:**
  - Added a warning prompt when creating accounts in Firefox desktop.
  - API model synchronization now supports a channel filtering system.

## 3.15.0
- **New Features:**
  - MultiSelect component now supports parsing comma-separated strings.
- **Bug Fixes:**
  - Ensured cache is only performed during full channel data synchronization.
- **Performance Optimizations:**
  - Optimized upstream model caching logic.

## 3.14.0
- **New Features:**
  - Site metadata is now automatically detected during refresh.
  - When auto sign-in fails, retry and manual sign-in options are now available.
  - Enhanced auto sign-in functionality, including retry policies, skip reasons, and account snapshots.
  - Optimized auto sign-in execution method to concurrent processing for improved efficiency.
- **Bug Fixes:**
  - Fixed default behavior issues with the `autoCheckInEnabled` flag.

## 3.13.0
- **New Features:**
  - Added "New API Channel Management" functionality.
  - Added a "Warning" button style.
  - Introduced Radix UI components and Tanstack Table for improved interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed incorrect display and sorting of model counts in the channel table.

## 3.12.1
- **Bug Fixes:**
  - Fixed unnecessary reloads of channels when manually selecting tabs.
  - The "New API Model Sync" option is hidden when the configuration is invalid.

## 3.12.0
- **New Features:**
  - "New API Model Sync" now includes a model allowlist filtering feature.
  - The sidebar now supports collapsing/expanding with smooth animations.

## 3.11.0
- **New Features:**
  - Enhanced account management functionality with search and navigation optimizations.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed incorrect auto sign-in status logic.

## 3.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanisms for improved communication stability.
  - Model synchronization now includes a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured missing fields in user preferences are populated with default values.

## 3.9.0
- **New Features:**
  - Added Cloudflare challenge detection and automatic temporary window bypass attempts when encountering protection.
  - Introduced a temporary context management system.

## 3.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized dropdown menu positioning and accessibility for multi-select components.

## 3.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can now be saved even if data retrieval fails during manual account addition.
  - Added "Settings Partition" function to the settings page, allowing settings to be reset by section.

## 3.7.1
- **Bug Fixes:**
  - Fixed an issue where redirected models were not appearing in the model list during API synchronization.

## 3.7.0
- **New Features:**
  - The account dialog can now dynamically update new account site data.
- **Bug Fixes:**
  - Hidden the password visibility button in Edge/IE browsers.

## 3.6.1
- **Important Update (Internal):**
  - User preferences such as `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now mandatory to ensure complete default configurations.
- **Bug Fixes:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed the issue of missing "New API Preferences" in configuration checks.
  - Corrected sign-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 3.6.0
- **New Features:**
  - The user interface for "New API Channel Import" has been optimized to support key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process for improved accuracy.
- **Bug Fixes:**
  - Model name standardization is now consistent with the Veloera backend and preserves hyphens.
  - Resolved browser storage quota issues and improved model matching.

## 3.5.0
- **New Features:**
  - Added support for the Neo-API site type.
- **Bug Fixes:**
  - Fixed Base64 encoding issues during CherryStudio URL generation.
  - Removed redundant account retrieval and token verification from the channel dialog for improved efficiency.

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
  - Optimized sorting configuration by increasing the priority of the current site condition.

## 3.2.1
- **Bug Fixes:**
  - Removed the `isDetected` check for the automatic configuration button.
  - Ensured that account detection correctly refreshes when displayed data changes.
  - Fixed the issue where an Access Token is no longer required for Cookie authentication types.

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
  - "New API" functionality now includes configuration validation assistance and internationalized error messages.

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
  - After signing in, you can choose whether to automatically open the redemption page.
  - Supports opening both sign-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - Sign-in icon updated to a "Yen" icon for better clarity.
- **Bug Fixes:**
  - Custom sign-in accounts now automatically reset their sign-in status daily.
  - Fixed the default value issue for the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic synchronization of account data with a merge strategy.
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
  - Fixed `z-index` issues with the mobile sidebar overlay.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Account management now includes a "Create Account" button and optimized layout.
  - Account management now includes a "Usage Log" feature.
  - Priority sorting settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fixes:**
  - Updated the size and accessibility labels for SiteInfo icon buttons.

## 1.30.0
- **New Features:**
  - Dialog components have been replaced with a custom `Modal` component for improved consistency.
  - Introduced a comprehensive UI component library for enhanced interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected sign-in logic and sorting priorities.
  - Optimized the transparency and layering of the mobile sidebar overlay for a better user experience.

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
  - Prevented rotation animation on button borders during refresh.

## 1.27.0
- **New Features:**
  - After successful auto-configuration to New API, the account dialog will automatically close.
  - Implemented dynamic loading of localization resources for improved internationalization support.
- **Bug Fixes:**
  - Added internationalization support for error messages.
  - Fixed syntax errors in currency conversion templates for Chinese and English.

## 1.26.0
- **Bug Fixes:**
  - Account error messages now support internationalization.
  - Hardcoded Chinese text in `newApiService` has been replaced with internationalization keys.

## 1.25.0
- **New Features:**
  - Improved accessibility of the WebDAV settings form.
- **Bug Fixes:**
  - Hardcoded Chinese text in the `TokenHeader` prompt has been replaced with translation keys.

## 1.24.0
- **New Features:**
  - Added health status translation keys and refactored error messages.
  - `dayjs` localization now updates with language switching.

## 1.23.2
- **Bug Fixes:**
  - Fixed errors in the CNY currency conversion logic.

## 1.23.1
- **Bug Fixes:**
  - Amount extraction now supports exchange rate conversion.

## 1.23.0
- **New Features:**
  - Added Chinese and English localization support.
  - Added language switching functionality and support for Suspense loading.
- **Bug Fixes:**
  - Completed internationalization of remaining hardcoded text.
  - Fixed the issue where a success message was displayed even when there were no accounts to refresh.

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
  - Added refresh functionality for balance and health indicators.
  - Unified and optimized action button UI, supporting intelligent key handling.

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
  - Sorting functionality now includes custom sign-in URLs as sorting conditions.
- **Bug Fixes:**
  - Fixed an issue where custom sign-in URLs were not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication types.
  - Added an "No Authentication" type to API authentication options.
  - Tooltip component migrated to the `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - Added account auto-configuration support for "New API" functionality.
  - Site accounts now support sign-in functionality.
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
  - Key copying functionality now includes Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub token management and data retrieval functionality.
  - Added user group data conversion and API integration.
  - Implemented model retrieval functionality for OneHub sites.

## 1.8.0
- **New Features:**
  - Account management now supports site type.
  - Added site type detection and optimized the auto-detection process.
  - Implemented model pricing functionality for OneHub sites.

## 1.7.1
- **Bug Fixes:**
  - Fixed a logic error when using site status detection for sign-in support.

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
  - Custom dialogs in popups have been replaced with direct function calls for simplified operations.

## 1.1.1
- **Bug Fixes:**
  - Fixed logic for handling missing system names and checks.

## 1.1.0
- **New Features:**
  - Accounts now support manual addition, with optimized UI flow.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and a warning prompt when adding accounts.
  - Introduced sidebar functionality, replacing popup-based automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized account recognition process, now supporting automatic access key creation.
  - Account list now includes sortable headers, a copy key dialog, and hover action buttons.
  - Account management now includes a remarks field.
  - Site names are now clickable for navigation.
  - Model list supports group selection.
  - Popup pages now feature animated number scrolling and site status indicators.
  - Optimized the add/edit account dialog, including recharge ratio settings and automatic site name extraction.
  - Fully implemented the settings page system, supporting persistence of user preferences and automatic refresh.
  - Enhanced the frontend interface and backend service for automatic refresh functionality.
  - Added `sk-` prefix automatically when copying keys.
  - Introduced industry-standard tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Supported more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Popup interface refactored to API Manager style, with added display of total daily consumption.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed issues with incompatible model data formats, `localStorage` access, and API request credentials.
  - Corrected API authentication methods.
  - Optimized URL input processing and auto-refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**