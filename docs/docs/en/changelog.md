# Changelog

This page records major updates for general users (feature changes / experience optimizations / bug fixes). For the complete history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip New User Guide
- **How to confirm your current version**: Open the extension popup; the version number will be displayed in the title bar. You can also check it on the settings page.
- **How to stop this page from opening automatically**: You can control whether to "Automatically open changelog after update" in "Settings → General → Changelog".
- **Troubleshooting**: In "Settings → General → Log", you can enable console logs and report issues with reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.29.0
- **New Features:**
  - Auto Sign-in: Added `Batch Open Manual Sign-in Pages`. This allows you to open manual sign-in pages for failed accounts all at once, displaying progress, completion, and partial failure notifications. Holding `Shift` while clicking will open them in a new window.
  - Feedback & Support: The `Feedback` menu in the extension popup and the "About" page now include an entry for `Community Groups`, which directly links to a community page displaying QR codes for WeChat groups, Telegram groups, and other communication channels.
- **Experience Optimizations:**
  - Browser Language: Improved compatibility with browser language environments such as Traditional Chinese. The default language fallback logic has been adjusted for more stable language recognition on first launch.
  - Documentation Links: Optimized multilingual documentation redirection rules. Unsupported language environments will now automatically fall back to English documentation, reducing instances of being directed to the wrong language page.
  - Multilingual Support: Unified the retrieval method for some translations and cleaned up some redundant copy, improving the multilingual experience.
- **Bug Fixes:**
  - Sidebar: Fixed an occasional issue where the sidebar could not be opened after clicking the toolbar in Chrome/Edge (MV3).
  - Key Management: When viewing masked keys, a new loading state has been added, and the full key can be displayed. Expanding it again will not trigger duplicate requests.
  - Browser Background: Temporary pages are now cleaned up more promptly when the extension is suspended, reducing issues with lingering temporary pages.

**Location Hints:**
- Batch Manual Sign-in: Found in the failed account related operations on the "Settings → Auto Sign-in" page.
- Community Entry: Located in the `Feedback` menu in the upper right corner of the extension popup, and in the `Feedback & Support` section of "Settings → About".
- Key Display: Click the show/hide button in the key list within "Settings → Key Management".

## 3.28.0
- **New Features:**
  - API Credentials: Added `Verify CLI Compatibility` operation. During verification, it supports automatic retrieval or manual input of the model ID and clearly indicates if a temporary `API Type` override is currently in use, preventing misinterpretation of one-time test results as saved configurations.
  - API Credentials / Model List: You can now jump from `API Credentials` to the corresponding `Model List` data source with a single click. The `Model List` also supports using API credentials directly as a data source to view model directories and verification results, without needing to create a site account first.
  - Key Management: `Key Management` now displays the hosting site channel status, matching signals, and jumpable entry points. When saving keys to `API Credentials`, clearer names are generated, making them easier to find and reuse later.
  - New API Hosted Sites: Added login auxiliary information (username, password, optional TOTP) and session verification to hosted site configurations. When status validation or reading actual channel keys is required, verification can be completed directly within the extension.
  - Hosted Site Matching: Channel identification now uses a comprehensive ranking of `URL`, keys, and models. For scenarios where the backend only returns masked tokens, channel status judgment, copying, and integration operations can still be completed.
  - First-time Use: The Welcome / Permission Guide popup now includes a language selector, allowing you to switch the interface language on the first opening and remember your subsequent preferences.
- **Experience Optimizations:**
  - Veloera: For scenarios where channel location and status detection based on `Base URL` are not currently supported, relevant entries will be automatically hidden or disabled, with explanations provided to reduce confusion from clicking and getting no results.
- **Bug Fixes:**
  - Language: Fixed an issue where the browser-detected language was not consistently followed on startup. Interface copy and date/time localization have also been synchronized and corrected.
  - Permission Guide: Optimized the button layout of the permission explanation popup, making it neater and easier to click, especially in small windows or when buttons wrap.

**Location Hints:**
- API Credentials: In "Settings → API Credentials", you can use operations like `Verify CLI Compatibility` and `Open in Model Management`.
- Model List Data Source: In the data source selection area at the top of "Settings → Model List", you can switch to `API Credentials`.
- Hosted Site Channel Status: View the hosting site status and matching prompts for each key in "Settings → Key Management".
- New API Hosted Site Login Auxiliary: In the `New API Integration Settings` area of "Settings → Self-Hosted Site Management".
- Initial Language Selection: In the Welcome / Permission Guide popup that appears when you first open the extension.

## 3.27.0
- **New Features:**
  - Account Management: The account list now includes filtering by enabled status, allowing quick switching between `Enabled` / `Disabled` accounts for easier batch management of inactive accounts.
  - Feedback & Support: A `Feedback` quick entry has been added to the extension popup title bar, and the "About" page now includes a `Feedback & Support` section, which directly opens GitHub for issue reporting, feature suggestions, and discussions.
- **Experience Optimizations:**
  - Account Display: When multiple accounts have the same site name, the username will be automatically appended to display as `Site Name · Username`, making them easier to distinguish in lists, searches, selectors, and statistical views.
- **Bug Fixes:**
  - Sidebar: Further optimized sidebar detection support. When the browser or mobile environment does not support sidebars, invalid entries will be automatically hidden or fall back to the settings page, reducing instances of unresponsive clicks.

**Location Hints:**
- Account Status Filtering: In the filter area at the top of the list in "Settings → Account Management".
- Feedback Entry: In the `Feedback` button in the extension popup title bar, and in the `Feedback & Support` section of "Settings → About".

## 3.26.0
- **New Features:**
  - Account Management: Added `Locate Corresponding Channel` quick operation. From a hosted site account, you can jump directly to the corresponding "Channel Management" list with filtering applied. It also supports enabling "Remind before adding duplicate accounts" to reduce accidental additions of duplicate accounts.
  - Duplicate Account Cleanup: Added a `Duplicate Account Cleanup` tool that scans and deletes duplicates by URL source site + user ID, making batch cleanup of duplicate accounts more convenient.
  - Account Management: The operation menu for disabled accounts now includes a direct delete entry, streamlining the process of cleaning up inactive accounts.
  - API Credentials: The `API Credentials` page can now be accessed directly from the settings navigation and the extension popup. Exported configurations will also retain token remarks, facilitating migration between multiple tools.
  - WebDAV: Added data synchronization selection, allowing you to selectively sync shared data such as `Accounts`, `Bookmarks`, `API Credentials`, etc., reducing unnecessary overwrites between devices.
  - Sub2API: Added key management support for `Sub2API` accounts, allowing direct viewing, creation, editing, and deletion of keys.
  - CLIProxyAPI: Added Provider type selection during import and automatically standardizes common endpoint addresses, reducing manual URL modifications.
- **Experience Optimizations:**
  - Redemption Assistant: After successful redemption, the account balance will be automatically refreshed, reducing the need for manual refreshes to confirm results.
- **Bug Fixes:**
  - Auto Sign-in: Fixed-time sign-ins now have a more stable retry mechanism, reducing missed sign-ins due to missed execution windows caused by extension updates.
  - Auto Recognition: Fixed an issue where custom sign-in configurations might be lost after account re-recognition, preventing accidental configuration loss.
  - Auto Sign-in: Fixed an issue where Turnstile assistance or manual sign-in prompts incorrectly used `External Sign-in URL` for some accounts. It now always opens the site's default sign-in page, reducing instances of being directed to the wrong page or failing to sign in.
  - Hosted Sites: When importing or syncing data to hosted sites, the target site's default group is now prioritized, reducing anomalies caused by group mismatches.

::: warning Note
- WebDAV's `Data Synchronization Selection` and local device settings like automatic account refresh will no longer overwrite each other across devices via WebDAV.
:::

**Location Hints:**
- Duplicate Account Reminder: In "Settings → Basic Settings → Account Management" under `Remind before adding duplicate accounts`.
- Duplicate Account Cleanup: In the page toolbar of "Settings → Account Management".
- Locate Channel: In the operation menu for individual accounts in "Settings → Account Management".
- API Credentials: In "Settings → API Credentials"; the extension popup can also switch to the `API Credentials` view.
- WebDAV Data Synchronization Selection: In "Settings → Import/Export" under `WebDAV Settings`.

## 3.25.0
- **New Features:**
  - Auto Sign-in: Supports Cloudflare Turnstile (anti-bot/human verification) scenarios. When a site requires Turnstile verification, it will attempt to complete the verification on a temporary page before proceeding with sign-in. If necessary, it will provide a sign-in link that can be manually opened, along with instructions.
  - CC Switch: When exporting to `Codex`, the default value of the base address will be automatically appended with `/v1` (if the interface address has not been manually modified), reducing issues with the interface being unavailable after direct import.
  - Model Redirect: Added an optional switch `Clean up invalid redirect targets after sync`. This will automatically delete mappings in `model_mapping` that point to non-existent models after model synchronization refresh (a dangerous operation, disabled by default).
- **Experience Optimizations:**
  - Temporary Windows: More accurately identifies challenge/login pages, reducing misjudgments and unnecessary interruptions.
- **Bug Fixes:**
  - Cookie Authentication: Corrected the descriptive text to align with current actual behavior and capabilities, reducing misguidance.
  - Sidebar: Fixed an issue where the sidebar could not be scrolled to see bottom menu items in small windows.

**Location Hints:**
- Turnstile Verification: View new prompts in the execution results of "Settings → Auto Sign-in".
- CC Switch Export: In "Settings → Key Management", select a key, click `Export to CC Switch`, and choose `Codex` as the target application.
- Model Redirect Cleanup: Enable `Clean up invalid redirect targets after sync` in "Settings → Basic Settings → Model Redirect".

## 3.24.0
- **New Features:**
  - Changelog: The plugin will no longer automatically open a new browser tab after an update. Instead, when you first open the plugin interface, the update content will be displayed in a popup within the plugin, with an option to open the full changelog.
  - LDOH: The account list now includes a `View in LDOH` (LDOH icon) quick entry, which directly jumps to LDOH and automatically filters to the corresponding site. When adding an account, an `Open LDOH Site List` entry is also provided to help find sites.
- **Experience Optimizations:**
  - Documentation Links: When opening documentation or the changelog from the plugin, it will automatically redirect to the documentation page in the corresponding language based on the current plugin language.

**Location Hints:**
- Changelog Switch: In "Settings → General → Changelog" under `Automatically display update content after update`.
- Changelog Popup: After updating the plugin, it will pop up automatically the first time you open the "Extension Popup / Settings Page / Sidebar" (once per version).
- LDOH Quick Entry: To the right of the site name in the account list of "Account Management" (LDOH icon, prompts `View in LDOH`); you can also click `Open LDOH Site List` in the add account dialog.

## 3.23.0
- **New Features:**
  - Auto Sign-in: The account operation menu now includes `Quick Sign-in`, which allows you to immediately perform a sign-in for a single account and refresh its status upon completion.
  - Key Management: Added an `All Accounts` view that aggregates keys by account group, facilitating cross-account search and copying.
  - Model Redirect: Added a `Clear Model Redirect Mappings` batch operation, allowing you to select by channel, confirm, and quickly reset `model_mapping` (irreversible).
- **Experience Optimizations:**
  - New API Channel Management: URLs in the channel list are now clickable and jumpable, and the search experience has been optimized.
- **Bug Fixes:**
  - Channel Management: Fixed an inaccurate prompt text for `Priority` in the channel dialog.
  - Model Redirect: Automatic mapping generation now includes a "version guard" to prevent cross-version mismatches.
  - Sidebar: When the operating environment does not support sidebars, it will automatically fall back to opening the popup/settings page, preventing unresponsive clicks.

## 3.22.0
- **New Features:**
  - Model List: Added a "Model Corresponding Key" tool (key icon) to check if a current model has an available key. If no key is available, you can create a default key with one click based on the model's available groups, or enter a custom creation process, with support for one-click key copying.
  - Share Snapshot: Supports one-click sharing of "Overview Snapshot / Account Snapshot". It prioritizes copying the image to the clipboard; if not supported, it automatically downloads a PNG. Snapshots only contain shareable information (sensitive fields like `API Key` are excluded) and allow one-click copying of the title text.
- **Experience Optimizations:**
  - Disabled Accounts: Disabled accounts are now automatically skipped in refresh and scheduled tasks such as "Balance History / Usage Analysis / Usage Sync", reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed an issue where the spinner was not visible on buttons in a "loading" state when a left-side icon was also displayed.

**Location Hints:**
- Model Corresponding Key: In "Settings → Model List", click the key icon to the right of the model name (`Model Corresponding Key`).
- Share Overview Snapshot: The button on the right side of the title bar on the overview page of the extension popup (`Share Overview Snapshot`).
- Share Account Snapshot: In the operation menu for individual accounts in "Settings → Account Management" (`Share Account Snapshot`).

## 3.21.0
- **New Features:**
  - API Credentials: Added an "API Credentials" page suitable for scenarios where you only have a `Base URL` + `API Key` without a full account. It supports unified management of tags/remarks and allows direct availability verification and quick export (e.g., for Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added multi-account views (Overview / Account Distribution / Trends) and a unified "Account Summary" table for quick comparison and summary statistics.
  - Self-Hosted Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for use in functions like "Channel Management" and "Model Sync".
- **Experience Optimizations:**
  - Right-Click Menu: "Redemption Assistant" and "AI API Test" entries can now be enabled/disabled independently. Changes take effect immediately after switching.
  - Copy Key: When an account has no key, the popup provides entries for "Quickly Create Default Key / Create Custom Key", reducing the need to navigate back and forth.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Done Hub` and fill in the "Done Hub Integration Settings".
- Right-Click Menu Entry Switch: In "Settings → Basic Settings → Sign-in & Redemption / AI API Testing", under their respective "Show in Browser Right-Click Menu" options.
- Copy Key Popup: Opened by clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: When adding a new key, the group dropdown option now displays both the group ID and description, making it easier to quickly distinguish and select among multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" when adding an account has been changed to disabled. If you wish to automatically generate a default key after adding an account, please enable it manually in the settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add New Key" and view the group ID and description in the group dropdown options.
- Auto Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Hosted Site Management: Added support for `Octopus` hosted sites. You can connect to the Octopus backend and import account API keys as channels in "Channel Management", with support for fetching available model lists.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default) and a one-click "Ensure at least one key" option to automatically complete default keys for accounts missing them.
  - AI API Test: The "Model List Probing" for interface verification now supports interface types such as OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, etc., and will provide suggested available model IDs, reducing manual model guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account recognition logic to improve stability in scenarios with multiple accounts on the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-related interfaces to reduce errors or triggering site rate limits due to frequent refreshes.
  - Channel Management: Improved duplicate channel detection during creation and added confirmation prompts to prevent accidental duplicate route creation.
- **Bug Fixes:**
  - Disable Account: Disabled accounts are now automatically filtered out from dropdowns/lists in Key Management and related sections, preventing invalid operations.
  - Language: Fixed an issue where the extension language setting might affect the webpage's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Octopus` and fill in the `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Auto Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Complete Default Key: In "Settings → Key Management", at the top right, "Ensure at least one key".
- AI API Test Entry: Right-click menu "Quickly test the functionality availability of AI APIs".

## 3.18.0
- **New Features:**
  - Balance History: The chart now includes a "Currency Unit" switch (`USD` / `CNY`). Currency symbols are displayed on the axes/tooltips. When `CNY` is selected, it will be converted based on the account's "Recharge Amount Ratio" for easier trend viewing and reconciliation by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are too many tags/account options, it now defaults to "Expand to show", making browsing and selection more intuitive.
  - Tabbed Views: Added left and right scroll buttons to the "Settings" group tabs and "Model List" vendor tabs, making switching easier in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Auto-recognition" is now more accurate, fixing the issue of unknown site types appearing frequently in recent versions.

**Location Hints:**
- Balance History Currency Unit: In the filter area of the "Settings → Balance History" page, under "Currency Unit".
- Account Exchange Rate (Recharge Amount Ratio): In the "Add/Edit Account" form in "Settings → Account Management", under "Recharge Amount Ratio".

## 3.17.0
- **New Features:**
  - Balance History: Added a "Balance History" feature (disabled by default). It records daily balance and income/expense snapshots, allowing you to view trends in charts. It supports filtering by tag/account and time range, and provides convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added a setting to control whether to enable it, the number of days to retain, and "End-of-day Capture". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-day Capture", the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar in small/narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed a responsive display issue in the export area for some screen sizes.
  - Popup: Fixed a layout anomaly where the scrollbar position in the popup was incorrect.

**Location Hints:**
- Balance History Switch/Retention Days/End-of-day Capture: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added Sub2API site type, supporting balance/quota queries. It supports reading login status from the console via "Auto Recognition" and also supports the "Plugin Hosted Session (Multi-Account, Recommended)" mode, which allows independent authentication renewal for each account, improving the experience for multiple accounts on the same site.
  - Display Settings: Added a "Show Today's Income/Expenses" switch (enabled by default). This hides and stops fetching statistics like "Today's Consumption/Income", reducing log fetching requests during refreshes.
- **Note:**
  - Sub2API currently does not support site sign-in, today's usage, income, or related functions; it only provides basic balance/quota queries. Related functions will be gradually improved based on site capabilities.
  - "Plugin Hosted Session (Multi-Account)" saves the `refresh_token` as an account's private credential, which will be included in exports/WebDAV backups. Please keep backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Addition/Mode Description: In "Settings → Account Management", add/edit an account, select Sub2API as the site type. For more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved the stability of background Service Workers, reducing the likelihood of asynchronous timed tasks (WebDAV auto-sync / usage sync / model sync / auto sign-in, etc.) being missed due to early termination of the background process. Related timed tasks are automatically restored after the browser restarts.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" to save quick links to site consoles/documentation/management pages without needing to create a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now includes an "Accounts / Bookmarks" switch. Bookmark data will be included in backups/restores and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests, reducing unnecessary network calls (some sites already return `today_income` in the refresh interface).
  - Auto Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is now 30 seconds. Old configurations will be automatically corrected to a valid range after updating, and related prompt texts and documentation have been improved.

::: warning Important: Auto-refresh configuration will be forcibly adjusted
Due to feedback indicating that **overly short auto-refresh intervals can trigger site rate limits and place excessive load on sites**,

v3.15.0 **has made forced changes to auto-refresh configurations**:
- Auto-refresh and refresh on plugin open have been disabled. If you still need to enable them, you must re-enable them manually.
- The minimum `Refresh Interval` is 60 seconds, and the `Minimum Refresh Interval Protection` is 30 seconds. If your pre-upgrade setting was below these thresholds, it will be automatically increased to the minimum value after upgrading. If your previously set value was within the new legal range, it will remain unaffected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; the top of the popup allows switching between "Accounts / Bookmarks".
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly Test AI API Functionality Availability" to open a test panel directly on the current webpage. Supports filling/pasting `Base URL` and `API Key`, and performs basic capability probing for interfaces like OpenAI-compatible / OpenAI / Anthropic / Google (OpenAI-compatible can also fetch the model list with one click).
  - (Optional) Auto Detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist. When a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear first. The test panel will only open after confirmation (disabled by default, and keys are not saved).
  - Auto Sign-in: The execution results list now includes more troubleshooting prompts, such as suggestions and documentation links for common exceptions like "Temporary anti-bot tab manually closed" and "Access Token invalid".
- **Bug Fixes:**
  - WebDAV: Auto-sync has been migrated from timers to the browser Alarms API, reducing the probability of missed syncs caused by background hibernation/power-saving policies.

**Location Hints:**
- AI API Test Panel: Right-click menu on any webpage, select "Quickly Test AI API Functionality Availability"; auto-detection related settings are in "Settings → AI API Test".
- Auto Sign-in Prompts: View them in the execution results list of "Settings → Auto Sign-in".

## 3.13.0
- **New Features:**
  - Account Management: Added an "Sign-in Status Expired" prompt. When the "Signed in today / Not signed in today" status is not detected today, an orange warning icon will be displayed. Clicking it will refresh the account data with one click, preventing misguidance by old status.
  - Interface: Multi-select controls have been upgraded to more compact selectors (space-saving, support search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and sign-in logic, improving usability.
  - Cookie Authentication: Removed the Cookie caching mechanism, reducing anomalies caused by reading old values after Cookie updates.

**Location Hints:**
- Sign-in Status Expired Prompt: In the account list of "Settings → Account Management", next to the site information, at the sign-in icon.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code" - generates Kilo Code / Roo Code providerProfiles configurations, supporting copying `apiConfigs` snippets or downloading `settings.json` for import (imports are additive and will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed an issue where site names and other text that were too long caused layout overflow; it now truncates automatically.
  - Dropdown Selectors: Optimized empty state prompts and fixed overflow issues when option text was too long.

**Location Hints:**
- Export to Kilo Code: In "Settings → Key Management", in the key list, click the Kilo Code icon in the upper right corner of a key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder. When an existing identical/similar channel is detected, a warning dialog will pop up, allowing you to choose to continue creation or cancel (no longer blocking creation with error toasts).
- **Bug Fixes:**
  - Account Management: Fixed an issue where site names and other text that were too long caused layout overflow; it now truncates automatically.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will open within the current incognito window (to maintain incognito login state).
  - Account Management: Disabled accounts also support clicking site links, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, the chart and list prioritize displaying the site name (instead of the username), making the information more intuitive.
  - Anti-Bot Helper: The temporary anti-bot window now supports CAP (cap.js) Pow verification, improving the success rate.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Toast Layer: Fixed the Toaster layer issue, preventing the prompt from being obscured by the webpage.

**Location Hints:**
- Site Link: In "Settings → Account Management", click the site name in the account list.
- Anti-Bot Helper: Refer to [Cloudflare Anti-Bot Helper](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added a "Manual Balance (USD)" field to accounts. When a site cannot automatically retrieve balance/quota, you can manually enter it for display and statistics.
  - Account Management: Added an "Exclude from Total Balance" switch to accounts. This removes specific accounts from the "Total Balance" statistics (does not affect refresh/sign-in functions).
  - Settings: Added a "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Auto Sign-in: After execution, relevant data will be refreshed, and the interface will be synchronized and refreshed.

**Location Hints:**
- Add/Edit Account: Open the add/edit account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added a "Usage Analysis" page to help you visualize usage trends across multiple sites and accounts in charts. This allows you to quickly see "where usage is high / costs are high / performance has slowed", facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/cost distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (raw logs are not saved). Supports setting retention days, automatic sync methods, and minimum sync intervals, and viewing sync results and error prompts for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage", enable "Usage History Sync", set as needed, and click "Sync Now".
  - Then, view charts in "Usage Analysis" on the left-hand menu; click "Export" when you need to retain or reconcile data.

## 3.7.0
- **New Features:**
  - Sorting: The account list now supports sorting by "Income". The sorting priority now includes "Disabled accounts at the bottom", preventing inactive/invalid accounts from interfering with your daily use.
  - Auto Sign-in: Added "Trigger today's sign-in in advance when opening the interface". When the popup, sidebar, or settings page is opened within the time window, it will automatically attempt to run today's sign-in once, without waiting for the scheduled time.
- **Bug Fixes:**
  - Auto Sign-in: Each account will only be signed in once per day. Retries are only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Auto Sign-in Advance Trigger/Retries: Configure in "Auto Sign-in" on the left-hand menu.

## 3.6.0
- **New Features:**
  - Account Management: Added the ability to enable/disable accounts with one click. Disabled accounts will be skipped by all features, allowing you to retain data even after an account becomes invalid.
  - Tags: Added global tag management and optimized related interfaces and interactions for easier category-based account management.
  - Popup: Displays the current version number in the title bar and provides a direct entry to this changelog.
  - Quick Export: CC Switch export now supports selecting upstream models, making exported configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to prevent unexpected results due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Sign-in" switch (moved above the custom sign-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from dialog title icons for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Auto Recognition: Added a "Detection is slow" prompt and related documentation links to help users troubleshoot and resolve issues.
  - Batch Open External Sign-in: Supports opening all in new windows, making batch closing easier and reducing interference.
- **Bug Fixes:**
  - Batch Open External Sign-in: The process has been refactored to execute in the background service, ensuring correct opening of all sites in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to directly select upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always have the `sk-` prefix, preventing recognition/copying issues due to inconsistent formats.

## 3.3.0
- **New Features:**
  - Auto Sign-in: Account recognition now includes "Username" information to help distinguish accounts in multi-account scenarios.
  - External Sign-in: Supports batch triggering of external sign-ins, reducing the number of individual operations.
  - Auto Refresh: The minimum refresh interval is no longer limited by a maximum value, allowing for larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce accidental triggers in non-copy scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying popup prompts, reducing invalid redemption notifications.
  - Storage: Added write locks to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization copy for "Copy Model Name".

## 3.2.0
- **New Features:**
  - The "Model List" page now includes an "Interface Availability Test" (Beta) to quickly confirm if the current key is usable with a specified model (e.g., text generation, tool/function calling, structured output (return JSON structure), web search (Grounding), etc.).
  - The "Model List" page now includes a "CLI Tool Compatibility Test" (Beta) that simulates the tool calling process of Claude Code / Codex CLI / Gemini CLI to assess interface compatibility with these tools.
  - The "About" page now includes "Rate and Download": automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entry points for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will now display the status code and error reason, facilitating problem identification.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce failures in obtaining Cookies due to insufficient permissions.

## 3.1.0
- **New Features:**
  - In self-managed API settings, added administrator credential entry guidance.
  - Redemption Assistant now supports batch redemption and single-code retries.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing them to coexist normally with all functions available. This is mainly for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy and model alias lists when exporting CLIProxyAPI.
  - Separated site sign-in and custom sign-in logic; they no longer affect each other.
- **Bug Fixes:**
  - Fixed an incorrect web page path for manual sign-in on New-API sites.

## 2.39.0
- Added automatic detection and modification of account site sign-in support status during account data refresh.
- When updating the version, the changelog page is automatically opened and positioned to the corresponding version number anchor.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Directly select specific redemption accounts using the up/down arrow keys.
  - Press Enter to confirm redemption.
- Added a prompt to temporary anti-bot tabs, explaining that the current tab is from this plugin and its purpose.
- Improved anti-bot window display: single window with multiple tabs, meaning short-term requests will reuse the same window, minimizing interference.
- Supports sign-in status detection and automatic sign-in for New-API site accounts.

## 2.37.0
- Optimized the user experience for New-API channel management.
- Added more lenient options for redemption code format detection, correctly identifying redemption codes with custom formats and popping up the Redemption Assistant.
- Fixed some known issues.

## 2.36.0
- Supports quick jumps to specific channels for management.
- Fixed an issue that would reset channel model sync time.

## 2.35.1
- Fixed an issue that would reset auto sign-in execution time.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to remind users to redeem when copying any potential redemption code.
- Added cdk.linux.do to the default URL whitelist for the Redemption Assistant.

## 3.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error when comparing account IDs.
  - Ensured all temporary contexts are closed correctly.

## 3.33.0
- **New Features:**
  - Introduced "Temporary Context Mode" for more effective bypassing of website defenses.
  - API error messages are now internationalized.
  - Optimized website type detection, which can now be identified by the title of temporary windows.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation for refresh interval settings.
  - Fixed development dependency issues.

## 3.32.0
- **New Features:**
  - Model redirection is now smarter, supporting version numbers represented by hyphens and dots.
  - Added the ability to redeem directly through the right-click menu after selecting text.
  - Auto sign-in is enabled by default, and the sign-in time window has been extended.

## 3.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Sign-in operations can now be quickly executed within the popup.
  - Redemption Assistant now includes a URL whitelist feature, giving you better control over which websites can use it.

## 3.30.0
- **New Features:**
  - Added sign-in support for Wong sites.
  - Added sign-in support for AnyRouter sites.
  - Optimized detection capabilities for Cloudflare challenge pages.
  - WebDAV backups now support encryption, and recovery now includes a decryption retry popup. Your WebDAV configuration will be preserved.

## 3.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website Cookie interception issues during automatic detection.
  - Optimized centering of blank state content in Firefox.
  - Migrated the Switch component to a custom implementation for improved compatibility and stability.

## 3.28.0
- **New Features:**
  - Introduced the "Hosted Site" service, laying the foundation for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" in settings to "Hosted Site" for clarity.
- **Bug Fixes:**
  - Optimized translation text and removed redundant fallback strings.

## 3.27.0
- **New Features:**
  - Account health status now includes more detailed codes, helping you understand specific issues.
  - Temporary window bypass feature now includes a health status indicator.
  - Optimized the description for bypassing website defenses to be clearer and easier to understand.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed display issues for Firefox pop-up prompts in Chinese settings.
- **Performance Optimizations:**
  - Improved the performance of the sorting function.

## 3.26.0
- **New Features:**
  - Introduced a model pricing cache service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Model pricing information for multiple accounts can now be displayed simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 3.25.0
- **New Features:**
  - When the account list is empty, a new beginner's guide card is displayed.
  - When the pin/manual sort feature is disabled, related UI elements will be automatically hidden.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

## 3.24.0
- **New Features:**
  - Updated application description and about page content.
  - Extension name now includes a subtitle.
  - Tag filter now includes visibility control based on line count.
  - WebDAV connection tests now support more success status codes.
- **Bug Fixes:**
  - Removed extraneous periods at the end of JSON strings.

## 3.23.0
- **New Features:**
  - Enhanced account tagging functionality.
  - Temporary window bypass feature now supports more intelligent judgment based on error codes.

## 3.22.0
- **New Features:**
  - Account management now includes tagging functionality for easy account categorization.
  - The Redemption Assistant popup UI now supports lazy loading and fixes issues that could cause website style conflicts.
  - Added global channel filter and JSON editing mode.

## 3.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed duplicate "Already signed in today" checks in auto sign-in.
  - Simplified and fixed the temporary window scraping logic.
  - Restored parsing of search parameters in URL query strings.

## 3.20.0
- **New Features:**
  - Added permission guidance during initial installation for a better understanding of required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed an issue where action buttons in the account dialog overflowed.
  - Redemption amount conversion factors now use constants for improved accuracy.
  - Limited the Cookie interceptor to use only in Firefox browsers.

## 3.19.0
- **New Features:**
  - Added loading states and prompts during the redemption process.
  - Removed clipboard reading functionality from the Redemption Assistant.
- **Bug Fixes:**
  - Added translations for missing background error messages.
  - Prevented concurrent initialization and race conditions in services for improved stability.
  - Resolved intermittent "Unable to establish connection" errors.
  - Prevented race conditions during the destruction of the temporary window pool.

## 3.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Assistant feature.
  - Firefox browsers now support WebRequest-based Cookie injection.
  - The redemption feature now supports themes and optimized prompt messages.
  - Redemption prompts now include source information and settings links.
- **Bug Fixes:**
  - Fixed path issues with Tailwind CSS files.

## 3.17.0
- **New Features:**
  - Added an automatic pop-up prompt for one-click redemption.
  - Unified data formats for import/export and WebDAV backups using a V2 versioning scheme for improved compatibility and stability.

## 3.16.0
- **New Features:**
  - Added a warning prompt during account creation in Firefox desktop.
  - API model synchronization now supports a channel filtering system.

## 3.15.0
- **New Features:**
  - The MultiSelect component now supports parsing comma-separated strings.
- **Bug Fixes:**
  - Ensured caching only occurs during complete channel data synchronization.
- **Performance Optimizations:**
  - Optimized upstream model caching logic.

## 3.14.0
- **New Features:**
  - Site metadata is now automatically detected during refresh.
  - When auto sign-in fails, retry and manual sign-in options are now available.
  - Enhanced auto sign-in functionality, including retry policies, skip reasons, and account snapshots.
  - Optimized the auto sign-in execution method to use concurrent processing for improved efficiency.
- **Bug Fixes:**
  - Fixed the default behavior issue of the `autoCheckInEnabled` flag.

## 3.13.0
- **New Features:**
  - Added "New API Channel Management" functionality.
  - Added a "Warning" button style.
  - Introduced Radix UI components and Tanstack Table for improved interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed issues with model count display and sorting in the channel table.

## 3.12.1
- **Bug Fixes:**
  - Fixed unnecessary reloads of channels when manually selecting tabs.
  - The "New API Model Sync" option is now hidden in the sidebar when the configuration is invalid.

## 3.12.0
- **New Features:**
  - "New API Model Sync" now includes a model allowlist filtering feature.
  - The sidebar now supports collapsing/expanding with smooth animations.

## 3.11.0
- **New Features:**
  - Enhanced account management functionality with search and navigation optimizations.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed logic errors in auto sign-in status.

## 3.10.0
- **New Features:**
  - Browser messages now support an exponential backoff retry mechanism for improved communication stability.
  - Model synchronization now includes a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured that missing fields in user preferences are populated with default values.

## 3.9.0
- **New Features:**
  - Added Cloudflare challenge detection and automatically attempt to bypass using temporary windows when protection is encountered.
  - Introduced a temporary context management system.

## 3.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "Month-Day" and "Month_Day".
  - Optimized the positioning and accessibility of dropdown menus in the multi-select component.

## 3.8.0
- **New Features:**
  - Added fault tolerance mechanisms for partial account updates.
  - Account information can now be saved even if data retrieval fails during manual account addition.
  - The settings page now includes "Setting Partitions" for resetting settings by section.

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
  - User preferences such as `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now mandatory to ensure the completeness of default configurations.
- **Bug Fixes:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed the issue of missing "New API Preference Settings" in configuration checks.
  - Corrected the sign-in requirement sorting logic.
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
  - The multi-select component now supports collapsible selected areas and has an optimized input experience.
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
  - Removed the `isDetected` check for the auto-configuration button.
  - Ensured that account detection correctly refreshes when displayed data changes.
  - Fixed an issue where an Access Token was no longer required for Cookie authentication type.

## 3.2.0
- **New Features:**
  - The auto sign-in function now includes a results/history interface and optimized default settings and user experience.
  - Implemented daily site auto sign-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case sensitivity issues in auto sign-in status detection.
  - Handled edge cases in sign-in time window calculations.

## 3.1.0
- **New Features:**
  - The account list now includes username search and highlighting functionality.
- **Bug Fixes:**
  - Added configuration validation warnings when API settings are missing.
  - "New API" functionality now includes configuration validation assistance and internationalized error messages.

## 3.0.0
- **New Features:**
  - The "New API Model Sync" filter bar now includes execution statistics.
  - Each row in the results table now includes a sync operation button.
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
  - After signing in, you can choose whether to automatically open the redemption page.
  - Supports opening both sign-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - The sign-in icon has been updated to a "Yen" icon for better clarity.
- **Bug Fixes:**
  - Custom sign-in accounts now have their sign-in status reset daily.
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
  - Fixed an issue where the width of the right content container was incorrect on small screens.

## 1.32.0
- **New Features:**
  - Improved the layout and responsiveness of the account management interface.
  - Added configurable React DevTools auto-plugin and caching.
- **Bug Fixes:**
  - Fixed the `z-index` issue of the mobile sidebar overlay.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Account management now includes a "Create Account" button and optimized layout.
  - Account management now includes "Usage Logs" functionality.
  - Priority sorting settings now support drag-and-drop auto-save, removing the manual save button.
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
  - Popups now feature responsive mobile layouts to avoid the need for zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent auto-detection functionality.
  - Migrated `chrome.*` APIs to `browser.*` APIs, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functional compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed an issue with `tabId` parsing after window creation.
  - Prevented rotation animations on button borders during refresh.

## 1.27.0
- **New Features:**
  - After successful auto-configuration to New API, the account dialog will automatically close.
  - Implemented dynamic loading of localization resources for enhanced internationalization support.
- **Bug Fixes:**
  - Added internationalization support for error messages.
  - Fixed a template syntax error in Chinese and English currency switching.

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
  - Fixed an error in the RMB currency conversion logic.

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
  - Fixed the rendering logic for custom URL sign-in interfaces.
  - Corrected sign-in field names and return structures.

## 1.21.0
- **New Features:**
  - Added favicon and extension icons for popup, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and popup operations.
  - Migrated the underlying framework from Plasmo to WXT, offering better performance and development experience.

## 1.20.0
- **New Features:**
  - Added a refresh function for balance and health status indicators.
  - Unified and optimized operation button UI, supporting intelligent key handling.

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
  - Fixed an issue where custom sign-in URLs were not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication types.
  - Added a "No Authentication" type to API authentication options.
  - Migrated the tooltip component to the `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" functionality now supports automatic account configuration.
  - Site accounts now include sign-in functionality.
  - Implemented a configurable sorting priority system.

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
  - Optimized the rendering method of the model list for improved loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed an issue where the detected account status was reset when no existing accounts were found.

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
  - Replaced custom dialogs in the popup with direct function calls for simplified operations.

## 1.1.1
- **Bug Fixes:**
  - Fixed logic for handling missing system names and checks.

## 1.1.0
- **New Features:**
  - Accounts now support manual addition, with an optimized UI flow.

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
  - Website names are now clickable links.
  - Model list supports group selection.
  - Popup pages feature number rolling animations and site status indicators.
  - Optimized the add/edit account dialog, including recharge ratio settings and automatic site name extraction.
  - Implemented a comprehensive settings page system supporting user preference persistence and auto-refresh.
  - Enhanced the frontend interface and backend service for auto-refresh functionality.
  - Added `sk-` prefix automatically when copying keys.
  - Introduced industry-standard tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Added support for more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Popup interface has been refactored to an API Manager style, with the addition of displaying today's total consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed issues with incompatible model data formats, `localStorage` access, and API request credentials.
  - Corrected API authentication methods.
  - Optimized URL input processing and auto-refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**