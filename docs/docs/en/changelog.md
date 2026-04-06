title: "Changelog"
tagline: "记录面向普通用户的主要更新点（功能变化 / 体验优化 / 问题修复）。"
heroText: "更新日志"
footer: "MIT Licensed | Copyright © 2023-present qixing-jk"
actions:
  - text: "GitHub Releases"
    link: "https://github.com/qixing-jk/all-api-hub/releases"
    type: "secondary"
  - text: "返回首页"
    link: "/"
    type: "primary"
features:
  - title: "新用户先读"
    details: |
      - **How to confirm your current version**: Open the extension popup, the version number will be displayed in the title bar; you can also check it on the settings page.
      - **How to stop this page from opening automatically**: You can control whether to "Automatically open changelog after update" in "Settings → General → Changelog".
      - **Troubleshooting**: You can enable console logs in "Settings → General → Logs", and report reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
```

# Changelog

This page records the main updates for general users (feature changes / experience optimizations / bug fixes). For a complete history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip For New Users
- **How to confirm your current version**: Open the extension popup, the version number will be displayed in the title bar; you can also check it on the settings page.
- **How to stop this page from opening automatically**: You can control whether to "Automatically open changelog after update" in "Settings → General → Changelog".
- **Troubleshooting**: You can enable console logs in "Settings → General → Logs", and report reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.32.0
- **New Features:**
  - Automatic Check-in: Each row in the results table can now directly open the corresponding site; if the current site type does not support automatic check-in, a clearer prompt will be provided to help you decide whether to switch to manual processing or to check the rules on the site first.
  - New API Hosted Site Verification: When the verification process finds that `Base URL`, username, or password is missing, you can now fill them in directly in the verification popup and continue by clicking `Save and Retry`, without needing to exit the dialog and go back to the settings page to fill them in.
- **Experience Optimizations:**
  - Account List Sorting: The default sorting priority has been adjusted to better respect the sorting field you select in the list. For example, when sorting by `Balance`, `Consumption`, or `Income`, it will take effect earlier than the previous manual order; old preferences will be automatically migrated, no manual reconfiguration is needed.
- **Bug Fixes:**
  - Account Management: When importing Cookies encounters insufficient permissions, the account dialog will not close prematurely due to redirection to `Permission Settings`; after handling permissions, you can continue the current input process.
  - Automatic Recognition: If the current tab was already open before installing or updating the extension, automatic recognition will now clearly prompt you to refresh the current page and provide a one-click refresh entry, reducing cases that appear to be random failures.
  - Temporary Page / Window Flows: Fixed the issue where context was released too early in some flows that required assistance from temporary pages, reducing mid-process failures, closed pages, or exceptions like `No tab with id`.

**Location Hints:**
- Automatic Check-in Result Quick Actions: In each row of the results table in "Settings → Automatic Check-in".
- New API Quick Configuration Supplement: In "Settings → Self-Built Site Management" and related `New API` verification popups.
- Account Permission Hints / Automatic Recognition Refresh Hints for Cookie Import: In the new or edit account dialogs in "Settings → Account Management".
- Sorting Priority Settings: In "Settings → Account Management → Sorting Priority Settings".

## 3.31.0
- **New Features:**
  - Safari Support: Added Safari installation documentation and release package for easy installation and use on macOS via Xcode.
  - Account Management: Added an independent advanced filter bar that can be combined to filter by `Site Type`, `Check-in Status`, `Refresh Status`, and `Account Status`; each option will also display the count, making filtering more intuitive.
  - Model List: When the model list for a single account fails to load, you can now use a `API Key` from that account to continue loading, reducing the situation where models are completely invisible due to interface exceptions.
  - CLIProxyAPI: Added `Connection Detection` in `CLIProxyAPI Settings`, which can automatically check after saving the address or managing keys, or be manually re-detected.
- **Experience Optimizations:**
  - Hosted Site Channel Import: Before importing, it will be more clearly prompted whether the current channel might be a duplicate, reducing the need to investigate after accidental import.
  - Hosted Site Channel Import: When further confirmation is needed, you can complete the verification in the dialog before deciding whether it's a duplicate, without directly blocking the operation.
  - Export to Channel: If models cannot be obtained, the channel dialog will still open normally, and you will be clearly prompted to fill them in manually, without the operation being interrupted due to automatic loading failure.
  - Account Cookie Import: It now distinguishes between different reasons such as "current site has no readable cookies," "missing cookie permission," and "read failure"; when permissions are missing, a prompt will be given in the account dialog, and the permission settings page can be opened directly.
  - Channel Management: The channel list defaults to displaying the latest records first, making newly created or recently added channels easier to see.
  - Automatic Check-in: Accounts with the status `Skipped` will be sorted to the end, making frequently used and pending accounts easier to see.
  - Operation Prompts: For some operations where the server does not return prompt text, local success prompts will also be added, avoiding a lack of feedback after clicking.
  - Multilingual: Added back some missing translations and continued to improve interface text and error messages in multiple places.
- **Bug Fixes:**
  - Mobile Browser Compatibility: When the browser does not allow creating temporary windows, it will automatically switch to continuing the process in a tab, reducing cases where clicking has no response.
  - Sub2API: When creating keys, it is now mandatory to explicitly select a group, avoiding the creation of API keys with invalid groups.
  - Page Layout: Fixed the issue of z-index conflict between the operation column of the channel table in the settings page and the sidebar mask.
  - Changelog Popup: Fixed the issue where bottom buttons are easily squeezed out or the layout is messy on small screens.

**Location Hints:**
- Account Advanced Filtering: In the filter area at the top of the list in "Settings → Account Management".
- Account Key Fallback Model Loading: In "Settings → Model List", after selecting a single account as the data source, if loading fails, you can continue the operation in the error prompt area.
- `CLIProxyAPI` Connection Detection: In "Settings → CLIProxyAPI Settings".
- Hosted Site Channel Import Reminders / Deduplication Verification / Model Pre-loading Failure Prompts: In "Settings → Key Management" or related `Import to Channel` / `New Channel` dialogs.

## 3.30.0
- **New Features:**
  - Channel Management: Added `Channel Migration`, which supports previewing the migration before migrating the current filter results or selected channels to other hosted sites.
  - Hosted Sites:
    - You can directly switch the current hosted site type in "Settings → Self-Built Site Management".
    - `Done Hub` / `Veloera` support reading real channel keys.
  - CC Switch Export: Added `OpenCode` / `OpenClaw` types.
  - Multilingual: Added Japanese and Traditional Chinese (`zh-TW`) interface languages.
- **Experience Optimizations:**
  - First Use and Interface:
    - Welcome / Permission Guide popups support direct language selection.
    - Added quick switching for themes and languages at the top of the settings page.
  - API Verification: Saved `API Credentials` and model verification will retain the results and time of the last probe.
  - Resource Usage: Some settings pages, extension popups, and views are now loaded on demand, reducing unnecessary initialization and resource consumption.
- **Bug Fixes:**
  - WebDAV: Compatible with Nutstore's `409 AncestorsNotFound` scenarios, which will be handled as "remote backup does not exist," reducing false failure reports during initial synchronization or for empty directories.

**Location Hints:**
- Hosted Site Type Switching: In "Settings → Self-Built Site Management".
- Channel Migration: In the `Channel Migration` at the top of the "Settings → Channel Management" page.
- CC Switch Export: In the export entry points of "Settings → Key Management" or "Settings → API Credentials".
- Quick Control for Theme / Language: On the top right of the settings page; the initial language selection will appear in the welcome/permission guide popup when the extension is first opened.
- Last API Verification Result: Can be viewed in related verification dialogs and supported `API Credentials` / model verification interfaces.

## 3.29.0
- **New Features:**
  - Automatic Check-in: Added `Batch Open Manual Check-in Pages`, which can open the manual check-in pages for failed accounts at once, displaying progress, completion, and partial failure prompts; holding `Shift` while clicking will open them in a new window.
  - Feedback and Support: The `Feedback` menu in the extension popup and the "About" page now have a `Community Communication Group` entry, which directly jumps to the community summary page to view WeChat group QR codes, Telegram groups, and other communication channels.
- **Experience Optimizations:**
  - Browser Language: Added compatibility for browser language environments such as Traditional Chinese and adjusted the default language fallback logic, making language recognition more stable on first launch.
  - Documentation Links: Optimized multilingual documentation jump rules; unsupported language environments will automatically fall back to English documentation, reducing the chance of jumping to the wrong language page.
  - Multilingual: Unified the retrieval method for some translations and cleaned up some unused text, improving the multilingual experience.
- **Bug Fixes:**
  - Sidebar: Fixed the issue where the sidebar might occasionally not open after clicking the toolbar in Chrome/Edge (MV3).
  - Key Management: When viewing masked keys, a loading state is now added and supports parsing and displaying the full key; it will not re-request when expanded again.
  - Browser Background: Temporary pages will be cleaned up more promptly when the extension is suspended, reducing temporary page residue issues.

**Location Hints:**
- Batch Manual Check-in: In the related operations for failed accounts on the "Settings → Automatic Check-in" page.
- Community Entry: In the `Feedback` menu in the top right corner of the extension popup, and in the `Feedback and Support` section of "Settings → About".
- Key Display: In the "Settings → Key Management" key list, click the show/hide button.

## 3.28.0
- **New Features:**
  - API Credentials: Added `Verify CLI Compatibility` operation; during verification, it supports automatic retrieval or manual input of model IDs and will clearly indicate whether a temporary `API Type` override is currently in use, preventing temporary test results from being mistaken for saved configurations.
  - API Credentials / Model List: You can now jump from `API Credentials` to the corresponding `Model List` data source with one click. The `Model List` also supports directly using API credentials as a data source to view model directories and verification results without creating a site account first.
  - Key Management: `Key Management` now displays hosted site channel status, matching signals, and jumpable entry points; when saving keys to `API Credentials`, clearer names are generated, making them easier to find and reuse later.
  - New API Hosted Sites: Added login auxiliary information (username, password, optional TOTP) and session verification in the hosted site configuration; when the status needs to be verified or real channel keys need to be read, verification can be completed directly within the extension.
  - Hosted Site Matching: Channel identification is now based on a comprehensive sort of `URL`, keys, and models; for scenarios where the backend only returns masked tokens, channel status judgment, copying, and integration operations can still be completed.
  - First Use: The Welcome / Permission Guide popup now includes a language selector, allowing you to switch the interface language upon first opening and remember your subsequent usage preferences.
- **Experience Optimizations:**
  - Veloera: For scenarios that currently do not support channel localization and status detection based on `Base URL`, related entry points will be automatically hidden or disabled, with explanations provided, reducing confusion from clicking and getting no results.
- **Bug Fixes:**
  - Language: Fixed the issue of not consistently following the browser's detected language on startup, and synchronized the correction of interface text and date/time localization.
  - Permission Guide: Optimized the button layout of the permission explanation popup, making it neater and easier to click when the window is small or buttons wrap.

**Location Hints:**
- API Credentials: In "Settings → API Credentials", you can use operations like `Verify CLI Compatibility`, `Open in Model Management`.
- Model List Data Source: In the data source selection area at the top of "Settings → Model List", you can switch to `API Credentials`.
- Hosted Site Channel Status: View the hosted site status and matching prompts for each key in "Settings → Key Management".
- New API Hosted Site Login Assistance: In the `New API Integration Settings` area of "Settings → Self-Built Site Management".
- Initial Language Selection: In the Welcome / Permission Guide popup that appears when the extension is first opened.

## 3.27.0
- **New Features:**
  - Account Management: Added filtering by enabled status to the account list, allowing quick switching between `Enabled` / `Disabled` accounts, making it easier to batch manage invalid accounts.
  - Feedback and Support: Added a quick `Feedback` entry point in the extension popup title bar, and a `Feedback and Support` section in the "About" page, which directly opens GitHub for issue reporting, feature suggestions, and discussions.
- **Experience Optimizations:**
  - Account Display: When multiple accounts have the same site name, the username will be automatically appended to display as `Site Name · Username`, making them easier to distinguish in lists, search results, selectors, and statistics views.
- **Bug Fixes:**
  - Sidebar: Further optimized sidebar support detection; when the browser or mobile environment does not support sidebars, invalid entry points will be automatically hidden or fall back to the settings page, reducing cases of clicking with no response.

**Location Hints:**
- Account Status Filtering: In the filter area at the top of the list in "Settings → Account Management".
- Feedback Entry: In the `Feedback` button in the title bar of the extension popup, and in the `Feedback and Support` section of "Settings → About".

## 3.26.0
- **New Features:**
  - Account Management: Added `Locate Corresponding Channel` quick action, allowing one-click jump with filtering to the corresponding "Channel Management" list from a hosted site account; also supports enabling "Remind before adding duplicate accounts" to reduce accidental addition of duplicate accounts.
  - Duplicate Account Cleanup: Added `Duplicate Account Cleanup` tool, which can scan and delete duplicates by URL source site + user ID, making batch management of duplicate accounts more convenient.
  - Account Management: The operation menu for disabled accounts now has a direct delete entry, making it faster to clean up invalid accounts.
  - API Credentials: The `API Credentials` page supports direct access from the settings navigation and extension popup; when exporting configurations, token remarks will also be retained, facilitating migration between multiple tools.
  - WebDAV: Added synchronization data selection, allowing you to selectively synchronize shared data such as `Accounts`, `Bookmarks`, `API Credentials`, etc., reducing unnecessary overwrites between multiple devices.
  - Sub2API: Added key management support for `Sub2API` accounts, allowing direct viewing, creation, editing, and deletion of keys.
  - CLIProxyAPI: Added Provider type selection during import, and automatically standardizes common endpoint addresses, reducing manual URL modifications.
- **Experience Optimizations:**
  - Redemption Assistant: After successful redemption, the account balance will be automatically refreshed, reducing the need for manual refreshes to confirm results.
- **Bug Fixes:**
  - Automatic Check-in: Fixed time check-ins have added a more stable re-run mechanism, reducing missed check-ins due to missed execution windows caused by extension updates.
  - Automatic Recognition: Fixed the issue where custom check-in configurations might be lost after re-recognizing accounts, preventing accidental loss of configurations.
  - Automatic Check-in: Fixed the issue where Turnstile assistance or manual check-in prompts incorrectly used `External Check-in URL` for some accounts, now it always opens the site's default check-in page, reducing jumping to the wrong page or failing to complete check-in.
  - Hosted Sites: When importing or synchronizing data to hosted sites, the target site's default group will be prioritized, reducing anomalies caused by group mismatches.

::: warning Note
- WebDAV's `Synchronized Data Selection` and local device settings like automatic account refresh will not overwrite each other between devices via WebDAV.
:::

**Location Hints:**
- Duplicate Account Reminders: In "Settings → Basic Settings → Account Management" under `Remind before adding duplicate accounts`.
- Duplicate Account Cleanup: In the toolbar of the "Settings → Account Management" page.
- Locate Channel: In the operation menu for a single account in "Settings → Account Management".
- API Credentials: In "Settings → API Credentials", the extension popup can also switch to the `API Credentials` view.
- WebDAV Synchronized Data Selection: In "Settings → Import/Export" under `WebDAV Settings`.

## 3.25.0
- **New Features:**
  - Automatic Check-in: Supports Cloudflare Turnstile (anti-bot/CAPTCHA) scenarios; when a site requires Turnstile verification, it will attempt to complete the verification on a temporary page and continue check-in, providing a manually openable check-in link and prompt when necessary.
  - CC Switch: When exporting to `Codex`, the default value of the base address will be automatically appended with `/v1` (if the interface address has not been manually modified), reducing issues of the interface being unavailable after direct import.
  - Model Redirect: Added an optional switch `Clean up invalid redirect targets after sync`, which automatically deletes mappings in `model_mapping` that point to non-existent models after model synchronization refresh (dangerous operation, off by default).
- **Experience Optimizations:**
  - Temporary Windows: More accurately identifies challenge/login pages, reducing misjudgments and unnecessary interruptions.
- **Bug Fixes:**
  - Cookie Authentication: Corrected the text description to match current actual behavior and capabilities, reducing misguidance.
  - Sidebar: Fixed the issue where the sidebar cannot be scrolled to see bottom menu items in small windows.

**Location Hints:**
- Turnstile Verification: View new prompts in the execution results of "Settings → Automatic Check-in".
- CC Switch Export: In "Settings → Key Management", select a key and click `Export to CC Switch`, then select `Codex` as the target application.
- Model Redirect Cleanup: In "Settings → Basic Settings → Model Redirect", enable `Clean up invalid redirect targets after sync`.

## 3.24.0
- **New Features:**
  - Changelog: The plugin will no longer automatically open a new tab in the browser after an update; instead, when you first open the plugin interface, the update content will be displayed in a popup within the plugin, with an option to open the full changelog.
  - LDOH: Added `View in LDOH` (LDOH icon) quick entry in the account list, which directly jumps to LDOH and automatically filters to the corresponding site; when adding an account, an `Open LDOH Site List` entry is also provided to help find sites.
- **Experience Optimizations:**
  - Documentation Links: When opening documentation/changelogs from the plugin, it will automatically jump to the corresponding language's documentation page based on the current plugin language.

**Location Hints:**
- Changelog Switch: In "Settings → General → Changelog" under `Automatically display update content after update`.
- Changelog Popup: After updating the plugin, it will automatically pop up the first time you open the "Extension Popup / Settings Page / Sidebar" (once per version).
- LDOH Quick Entry: To the right of the site name in the account list in "Account Management" (LDOH icon, prompts `View in LDOH`); you can also click `Open LDOH Site List` in the add account dialog.

## 3.23.0
- **New Features:**
  - Automatic Check-in: Added `Quick Check-in` to the account operation menu, which allows immediate execution of a check-in for a single account and refreshes its status upon completion.
  - Key Management: Added `All Accounts` view, aggregating keys by account group for easier cross-account search and copying.
  - Model Redirect: Added `Clear Model Redirect Mappings` batch operation, which allows quick resetting of `model_mapping` by selecting channels and confirming twice (irreversible).
- **Experience Optimizations:**
  - New API Channel Management: URLs in the channel list are now clickable and the search experience has been optimized.
- **Bug Fixes:**
  - Channel Management: Fixed the inaccurate prompt text for `Priority` in the channel dialog.
  - Model Redirect: Added a "version guard" to automatically generated mappings to prevent cross-version mismatches.
  - Sidebar: When the runtime environment does not support sidebars, it will automatically fall back to opening the popup/settings page, preventing unresponsive clicks.

## 3.22.0
- **New Features:**
  - Model List: Added "Model Corresponding Key" tool (key icon) to check if a current model has an available key; if no available key is found, you can create a default key with one click based on the model's available groups, or enter a custom creation process, and it supports one-click key copying.
  - Share Snapshot: Supports one-click sharing of "Overview Snapshot / Account Snapshot", prioritizing copying the image to the clipboard, and automatically downloading a PNG if not supported; snapshots only contain shareable information (no sensitive fields like `API Key`), and the title text can be copied with one click.
- **Experience Optimizations:**
  - Disabled Accounts: Disabled accounts will be automatically skipped in refresh and scheduled tasks such as "Balance History / Usage Analysis / Usage Sync", reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed the issue where the spinner is not visible when a button is in a "loading" state and also displays a left icon.

**Location Hints:**
- Model Corresponding Key: In "Settings → Model List", click the key icon to the right of the model name (`Model Corresponding Key`).
- Share Overview Snapshot: In the button on the right side of the title bar of the extension popup overview page (`Share Overview Snapshot`).
- Share Account Snapshot: In the operation menu for a single account in "Settings → Account Management" (`Share Account Snapshot`).

## 3.21.0
- **New Features:**
  - API Credentials: Added "API Credentials" page, suitable for scenarios with only `Base URL` + `API Key` and no account; supports unified management of tags/remarks, and allows direct availability verification and quick export (e.g., Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added multi-account view (Overview / Account Distribution / Trend), and provides a unified "Account Summary" table for quick comparison and summary statistics.
  - Self-Built Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for functions like "Channel Management" and "Model Sync".
- **Experience Optimizations:**
  - Right-Click Menu: "Redemption Assistant" and "AI API Detection" entries can be toggled on/off separately, and the changes take effect immediately after switching.
  - Copy Key: When an account has no key, the popup provides entry points for "Quickly Create Default Key / Create Custom Key", reducing back-and-forth navigation.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Built Site Management", select `Done Hub`, and fill in "Done Hub Integration Settings".
- Right-Click Menu Entry Toggles: In "Settings → Basic Settings → Check-in and Redemption / AI API Testing", under their respective "Show in Browser Right-Click Menu".
- Copy Key Popup: Opened by clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown options when adding a new key now display both the group ID and description, making it easier to distinguish and select among multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" when adding a new account is now changed to off; if you wish to automatically generate a default key after adding an account, please enable it manually in the settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add Key", view in the group dropdown options.
- Automatic Default Key Creation Switch: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Built Site Management: Added `Octopus` hosted site support, allowing connection to the Octopus backend and importing account API keys as channels in "Channel Management", as well as fetching available model lists.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default), and provides a one-click "Ensure at least one key" to automatically supplement default keys for accounts missing them.
  - AI API Testing: "Model List Probing" for interface verification now supports OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and other interface types, and provides suggested available model IDs, reducing manual model guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account recognition logic, improving stability in scenarios with multiple accounts for the same site.
  - Usage/Log Fetching: Added rate limiting protection to log-related interfaces, reducing errors caused by frequent refreshes or triggering site rate limits.
  - Channel Management: Improved duplicate channel detection during creation, with confirmation prompts to avoid accidental creation of duplicate routes.
- **Bug Fixes:**
  - Disable Accounts: Disabled accounts are now automatically filtered out in dropdowns/lists such as Key Management, preventing invalid operations.
  - Language: Fixed the issue where the extension's language setting might affect the webpage's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Built Site Management", select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Automatic Default Key Creation Switch: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Default Key Supplement: In "Settings → Key Management", at the top right, "Ensure at least one key".
- AI API Testing Entry: Right-click menu "Quickly test AI API functionality availability".

## 3.18.0
- **New Features:**
  - Balance History: Charts now support switching "Currency Unit" (`USD` / `CNY`), and display currency symbols on axes/tooltips; when `CNY` is selected, it will be converted based on the account's "Recharge Amount Ratio", making it easier to view trends and reconcile by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are too many tag/account options, it defaults to "Expand to display", making browsing and selection more intuitive.
  - Tabs: Added left and right scroll buttons to the group tabs in "Settings" and the vendor tabs in "Model List", making switching easier in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Automatic Recognition" is more accurate, fixing the issue of unknown site types appearing frequently in recent versions.

**Location Hints:**
- Balance History Currency Unit: In the "Currency Unit" filter area of the "Settings → Balance History" page.
- Account Exchange Rate (Recharge Amount Ratio): In the "Recharge Amount Ratio" field of the add/edit account form in "Settings → Account Management".

## 3.17.0
- **New Features:**
  - Balance History: Added "Balance History" feature (off by default), which records daily balance and income/expense snapshots, and displays trends in charts; supports filtering by tag/account and time range, and provides convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added settings to control whether to enable it, the number of days to retain, and "End-of-day Fetch". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-day Fetch", the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar on small screens/narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed the responsive display issue of the export area on some screen sizes.
  - Popups: Fixed the layout anomaly where the scrollbar position in popups was incorrect.

**Location Hints:**
- Balance History Switch/Retention Days/End-of-day Fetch: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added Sub2API site type, supporting balance/quota query; supports reading login state via "Automatic Recognition" from the console; and supports the "Plugin Hosted Session (Multiple Accounts, Recommended)" mode, which can independently renew authentication for each account, improving the experience for multiple accounts on the same site.
  - Display Settings: Added "Show Today's Income/Expenses" switch (on by default), which hides and stops fetching statistics like "Today's Consumption/Income", reducing log fetching requests during refreshes.
- **Note:**
  - Sub2API currently does not support site check-in, today's usage, income, or related functions, only basic balance/quota query. Related functions will be gradually improved based on site capabilities in the future.
  - "Plugin Hosted Session (Multiple Accounts)" saves `refresh_token` as account-private credentials, which will be included in exports/WebDAV backups; please keep backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Add/Mode Description: In "Settings → Account Management", add/edit account, select Sub2API as the site type; for more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved background Service Worker stability, reducing the issue of asynchronous timed tasks (WebDAV auto-sync / usage sync / model sync / automatic check-in, etc.) being missed due to premature termination of the background process; and automatically resuming related timed tasks after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" for saving quick links to site consoles/documentation/management pages without needing to create a full account; supports adding/editing/deleting, pinning, tagging, search filtering, drag-and-drop sorting; the popup now has "Account / Bookmarks" switching; bookmark data will be included in backups/restores and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests, reducing unnecessary network calls (some sites already return `today_income` in their refresh interface).
  - Automatic Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is now 30 seconds; old configurations will be automatically corrected to a valid range after updating, and related prompt text and documentation have been improved.

::: warning Important: Automatic Refresh Configuration Will Be Forced Adjusted
Due to feedback indicating that **overly short automatic refresh intervals can trigger site rate limits and place excessive load on sites**,

v3.15.0 **has forced adjustments to automatic refresh configurations**:
- Automatic refresh and refresh on plugin open are now disabled. If you still need to enable them, you must re-enable them manually.
- The minimum `Refresh Interval` is 60 seconds, and the `Minimum Refresh Interval Protection` is 30 seconds. If your pre-upgrade setting was below these thresholds, it will be automatically raised to the minimum value after upgrading; if your previous setting was within the new valid range, it will not be affected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; the top of the popup can switch between "Account / Bookmarks".
- Automatic Refresh: In "Settings → Basic Settings → Automatic Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly test AI API functionality availability" to open the test panel directly on the current webpage; supports filling in/pasting `Base URL` and `API Key`, and performs basic capability probes for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible also supports one-click model list retrieval).
  - (Optional) Automatic Detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist; when a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear first, and the test panel will only open after confirmation (disabled by default, and keys are not saved).
  - Automatic Check-in: Added more troubleshooting prompts to the execution results list – including handling suggestions and documentation links for common exceptions like "Temporary shield bypass tab manually closed" and "Access Token invalid".
- **Bug Fixes:**
  - WebDAV: Automatic synchronization has been migrated from timers to the browser Alarms API, reducing the probability of missed synchronization due to background sleep/power saving policies.

**Location Hints:**
- AI API Test Panel: Select "Quickly test AI API functionality availability" from the right-click menu on any webpage; related settings for automatic detection are in "Settings → AI API Test".
- Automatic Check-in Prompts: View in the execution results list in "Settings → Automatic Check-in".

## 3.13.0
- **New Features:**
  - Account Management: Added "Check-in Status Expired" prompt – when the "Checked in today / Not checked in today" status is not from today's detection, an orange warning icon will be displayed; clicking it will one-click refresh the account data, preventing misguidance by old status.
  - Interface: Multi-select controls have been upgraded to more compact selectors (saving space, supporting search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and check-in logic, improving usability.
  - Cookie Authentication: Removed the Cookie caching mechanism, reducing anomalies caused by still reading old values after Cookie updates.

**Location Hints:**
- Check-in Status Expired Prompt: In the account list in "Settings → Account Management", at the check-in icon to the right of the site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code" – generates Kilo Code / Roo Code providerProfiles configuration, supports copying apiConfigs snippets or downloading settings JSON for import (import is incremental addition, will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed the issue where site names and other text being too long caused layout overflow, now it is automatically truncated.
  - Dropdown Selectors: Optimized empty state prompts and fixed overflow issues with long option text.

**Location Hints:**
- Export to Kilo Code: In the "Settings → Key Management" key list, click the Kilo Code icon in the top right corner of a key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder – when a duplicate/similar channel is detected, a warning dialog will pop up, allowing you to choose to continue creating or cancel (no longer blocking creation with error toasts).
- **Bug Fixes:**
  - Account Management: Fixed the issue where site names and other text being too long caused layout overflow, now it is automatically truncated.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will open within the current incognito window (to maintain incognito login state).
  - Account Management: Disabled accounts also support clicking site links, making them useful as bookmarks.
  - Usage Analysis: When there is only a single account, the charts and lists prioritize displaying the site name (instead of the username), making the information more intuitive.
  - Shield Bypass Assistant: Temporary shield bypass windows now support CAP (cap.js) Pow verification, improving the pass rate.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Floating Tips: Fixed Toaster z-index issues, preventing tips from being obscured by webpages.

**Location Hints:**
- Site Links: Click the site name in the account list in "Settings → Account Management".
- Shield Bypass Assistant: Refer to [Cloudflare Shield Bypass Assistant](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added "Manual Balance (USD)" field – when the site cannot automatically retrieve balance/quota, you can manually fill it in for display and statistics.
  - Account Management: Added "Exclude from Total Balance" switch – used to remove specific accounts from "Total Balance" statistics (does not affect refresh/check-in functions).
  - Settings: Added "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings, allowing control over whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Automatic Check-in: After execution, relevant data will be refreshed and the interface will be synchronized and refreshed.

**Location Hints:**
- Add/Edit Account: Open add/edit account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added "Usage Analysis" page, helping you visualize usage trends across multiple sites and accounts with charts, allowing you to quickly see "where usage/spending is high / where it's slowing down", facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (raw logs are not saved); supports setting retention days, automatic sync methods, and minimum sync intervals, and view sync results and error prompts for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage", enable "Usage History Sync", set as needed, and click "Sync Now".
  - Then, go to "Usage Analysis" in the left menu to view charts; click "Export" when you need to retain or reconcile data.

## 3.7.0
- **New Features:**
  - Sorting: The account list now supports sorting by "Income"; the sorting priority now includes "Disable accounts at the bottom", preventing disabled/invalid accounts from interfering with your daily use.
  - Automatic Check-in: Added "Trigger today's check-in in advance when opening the interface" – when opening the popup/sidebar/settings page within the time window, it will automatically attempt to run today's check-in in advance, without waiting for the scheduled time.
- **Bug Fixes:**
  - Automatic Check-in: Each account will only be checked in once per day; retries are only for failed accounts, reducing meaningless requests and repeated interruptions.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Automatic Check-in Pre-trigger/Retry: Configure in the "Automatic Check-in" section of the left menu.

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enable/disable accounts; after disabling, various functions will skip the account, making it easier to retain data after an account becomes invalid.
  - Tags: Added global tag management and optimized related interfaces and interactions for easier classification and management of accounts.
  - Popup: Displays the current version number in the title bar and provides an entry point directly to this changelog.
  - Quick Export: CC Switch export supports selecting upstream models, making exported configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to prevent display inconsistencies due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Automatic Check-in" switch (moved above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from the dialog title icon for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed the issue where closing the dialog while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Automatic Recognition: Added "Slow Detection" prompts and related documentation links to help users troubleshoot and resolve issues.
  - Batch Opening External Check-in: Supports opening all in new windows, making batch closing easier and reducing interference.
- **Bug Fixes:**
  - Batch Opening External Check-in: Refactored the process to execute in the background service, ensuring correct opening of all sites in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to support direct selection of upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always have the `sk-` prefix, preventing recognition/copying issues due to inconsistent formats.

## 3.3.0
- **New Features:**
  - Automatic Check-in: Added "Username" information to account recognition, facilitating differentiation of accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the number of individual operations.
  - Automatic Refresh: The minimum refresh interval no longer has a maximum limit, allowing for larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce accidental triggers in non-copy scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying popup prompts, reducing invalid redemption notifications.
  - Storage: Added write locks to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text for "Copy Model Name".

## 3.2.0
- **New Features:**
  - The "Model List" page now includes an "Interface Availability Detection" (Beta) for quickly confirming if the current key is usable for a specified model (e.g., text generation, tool/function calling, structured output (returning JSON structure), web search (Grounding), etc.).
  - The "Model List" page now includes "CLI Tool Compatibility Detection" (Beta), simulating the tool calling process of Claude Code / Codex CLI / Gemini CLI to assess interface compatibility in these tools.
  - The "About" page now includes "Rate and Download": automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and entry points for downloading from other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will now display the status code and error reason, facilitating problem identification.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Features:**
  - In self-managed API settings, added administrator credential filling guidance.
  - Redemption Assistant now supports batch redemption and single code retry.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing them to coexist normally with all functions available, primarily for sites with cookie-only authentication like AnyRouter.
  - Supports setting proxy and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed incorrect web path redirection for manual check-in on New-API sites.

## 2.39.0
- Automatically detects and modifies the check-in support status of site accounts during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Select specific redemption accounts directly using the up/down arrow keys.
  - Press Enter to confirm redemption.
- Added prompts for temporary shield bypass tabs, indicating that the tab originates from this plugin and its purpose.
- Improved display of shield bypass windows: single window with multiple tabs, meaning short-term requests will reuse the same window to minimize interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added more lenient detection options for custom redemption code formats, correctly identifying redemption codes and popping up the Redemption Assistant when encountering them.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific channels for management.
- Fixed an issue where the channel model sync time was reset.

## 2.35.1
- Fixed an issue where the automatic check-in execution time was reset.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to remind users about redemption when copying any potential redemption codes.
- Added cdk.linux.do to the default URL whitelist for the Redemption Assistant.

## 3.24.0
- **New Features:**
  - Changelog: The plugin will no longer automatically open a new tab in the browser after an update; instead, when you first open the plugin interface, the update content will be displayed in a popup within the plugin, with an option to open the full changelog.
  - LDOH: Added `View in LDOH` (LDOH icon) quick entry in the account list, which directly jumps to LDOH and automatically filters to the corresponding site; when adding an account, an `Open LDOH Site List` entry is also provided to help find sites.
- **Experience Optimizations:**
  - Documentation Links: When opening documentation/changelogs from the plugin, it will automatically jump to the corresponding language's documentation page based on the current plugin language.

**Location Hints:**
- Changelog Switch: In "Settings → General → Changelog" under `Automatically display update content after update`.
- Changelog Popup: After updating the plugin, it will automatically pop up the first time you open the "Extension Popup / Settings Page / Sidebar" (once per version).
- LDOH Quick Entry: To the right of the site name in the account list in "Account Management" (LDOH icon, prompts `View in LDOH`); you can also click `Open LDOH Site List` in the add account dialog.

## 3.23.0
- **New Features:**
  - Automatic Check-in: Added `Quick Check-in` to the account operation menu, which allows immediate execution of a check-in for a single account and refreshes its status upon completion.
  - Key Management: Added `All Accounts` view, aggregating keys by account group for easier cross-account search and copying.
  - Model Redirect: Added `Clear Model Redirect Mappings` batch operation, which allows quick resetting of `model_mapping` by selecting channels and confirming twice (irreversible).
- **Experience Optimizations:**
  - New API Channel Management: URLs in the channel list are now clickable and the search experience has been optimized.
- **Bug Fixes:**
  - Channel Management: Fixed the inaccurate prompt text for `Priority` in the channel dialog.
  - Model Redirect: Added a "version guard" to automatically generated mappings to prevent cross-version mismatches.
  - Sidebar: When the runtime environment does not support sidebars, it will automatically fall back to opening the popup/settings page, preventing unresponsive clicks.

## 3.22.0
- **New Features:**
  - Model List: Added "Model Corresponding Key" tool (key icon) to check if a current model has an available key; if no available key is found, you can create a default key with one click based on the model's available groups, or enter a custom creation process, and it supports one-click key copying.
  - Share Snapshot: Supports one-click sharing of "Overview Snapshot / Account Snapshot", prioritizing copying the image to the clipboard, and automatically downloading a PNG if not supported; snapshots only contain shareable information (no sensitive fields like `API Key`), and the title text can be copied with one click.
- **Experience Optimizations:**
  - Disabled Accounts: Disabled accounts will be automatically skipped in refresh and scheduled tasks such as "Balance History / Usage Analysis / Usage Sync", reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed the issue where the spinner is not visible when a button is in a "loading" state and also displays a left icon.

**Location Hints:**
- Model Corresponding Key: In "Settings → Model List", click the key icon to the right of the model name (`Model Corresponding Key`).
- Share Overview Snapshot: In the button on the right side of the title bar of the extension popup overview page (`Share Overview Snapshot`).
- Share Account Snapshot: In the operation menu for a single account in "Settings → Account Management" (`Share Account Snapshot`).

## 3.21.0
- **New Features:**
  - API Credentials: Added "API Credentials" page, suitable for scenarios with only `Base URL` + `API Key` and no account; supports unified management of tags/remarks, and allows direct availability verification and quick export (e.g., Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added multi-account view (Overview / Account Distribution / Trend), and provides a unified "Account Summary" table for quick comparison and summary statistics.
  - Self-Built Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for functions like "Channel Management" and "Model Sync".
- **Experience Optimizations:**
  - Right-Click Menu: "Redemption Assistant" and "AI API Detection" entries can be toggled on/off separately, and the changes take effect immediately after switching.
  - Copy Key: When an account has no key, the popup provides entry points for "Quickly Create Default Key / Create Custom Key", reducing back-and-forth navigation.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Built Site Management", select `Done Hub`, and fill in "Done Hub Integration Settings".
- Right-Click Menu Entry Toggles: In "Settings → Basic Settings → Check-in and Redemption / AI API Testing", under their respective "Show in Browser Right-Click Menu".
- Copy Key Popup: Opened by clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown options when adding a new key now display both the group ID and description, making it easier to distinguish and select among multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" when adding a new account is now changed to off; if you wish to automatically generate a default key after adding an account, please enable it manually in the settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add Key", view in the group dropdown options.
- Automatic Default Key Creation Switch: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Built Site Management: Added `Octopus` hosted site support, allowing connection to the Octopus backend and importing account API keys as channels in "Channel Management", as well as fetching available model lists.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default), and provides a one-click "Ensure at least one key" to automatically supplement default keys for accounts missing them.
  - AI API Testing: "Model List Probing" for interface verification now supports OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and other interface types, and provides suggested available model IDs, reducing manual model guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account recognition logic, improving stability in scenarios with multiple accounts for the same site.
  - Usage/Log Fetching: Added rate limiting protection to log-related interfaces, reducing errors caused by frequent refreshes or triggering site rate limits.
  - Channel Management: Improved duplicate channel detection during creation, with confirmation prompts to avoid accidental creation of duplicate routes.
- **Bug Fixes:**
  - Disable Accounts: Disabled accounts are now automatically filtered out in dropdowns/lists such as Key Management, preventing invalid operations.
  - Language: Fixed the issue where the extension's language setting might affect the webpage's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Built Site Management", select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Automatic Default Key Creation Switch: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Default Key Supplement: In "Settings → Key Management", at the top right, "Ensure at least one key".
- AI API Testing Entry: Right-click menu "Quickly test AI API functionality availability".

## 3.18.0
- **New Features:**
  - Balance History: Charts now support switching "Currency Unit" (`USD` / `CNY`), and display currency symbols on axes/tooltips; when `CNY` is selected, it will be converted based on the account's "Recharge Amount Ratio", making it easier to view trends and reconcile by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are too many tag/account options, it defaults to "Expand to display", making browsing and selection more intuitive.
  - Tabs: Added left and right scroll buttons to the group tabs in "Settings" and the vendor tabs in "Model List", making switching easier in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Automatic Recognition" is more accurate, fixing the issue of unknown site types appearing frequently in recent versions.

**Location Hints:**
- Balance History Currency Unit: In the "Currency Unit" filter area of the "Settings → Balance History" page.
- Account Exchange Rate (Recharge Amount Ratio): In the "Recharge Amount Ratio" field of the add/edit account form in "Settings → Account Management".

## 3.17.0
- **New Features:**
  - Balance History: Added "Balance History" feature (off by default), which records daily balance and income/expense snapshots, and displays trends in charts; supports filtering by tag/account and time range, and provides convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added settings to control whether to enable it, the number of days to retain, and "End-of-day Fetch". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-day Fetch", the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar on small screens/narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed the responsive display issue of the export area on some screen sizes.
  - Popups: Fixed the layout anomaly where the scrollbar position in popups was incorrect.

**Location Hints:**
- Balance History Switch/Retention Days/End-of-day Fetch: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added Sub2API site type, supporting balance/quota query; supports reading login state via "Automatic Recognition" from the console; and supports the "Plugin Hosted Session (Multiple Accounts, Recommended)" mode, which can independently renew authentication for each account, improving the experience for multiple accounts on the same site.
  - Display Settings: Added "Show Today's Income/Expenses" switch (on by default), which hides and stops fetching statistics like "Today's Consumption/Income", reducing log fetching requests during refreshes.
- **Note:**
  - Sub2API currently does not support site check-in, today's usage, income, or related functions, only basic balance/quota query. Related functions will be gradually improved based on site capabilities in the future.
  - "Plugin Hosted Session (Multiple Accounts)" saves `refresh_token` as account-private credentials, which will be included in exports/WebDAV backups; please keep backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Add/Mode Description: In "Settings → Account Management", add/edit account, select Sub2API as the site type; for more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved background Service Worker stability, reducing the issue of asynchronous timed tasks (WebDAV auto-sync / usage sync / model sync / automatic check-in, etc.) being missed due to premature termination of the background process; and automatically resuming related timed tasks after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" for saving quick links to site consoles/documentation/management pages without needing to create a full account; supports adding/editing/deleting, pinning, tagging, search filtering, drag-and-drop sorting; the popup now has "Account / Bookmarks" switching; bookmark data will be included in backups/restores and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests, reducing unnecessary network calls (some sites already return `today_income` in their refresh interface).
  - Automatic Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is now 30 seconds; old configurations will be automatically corrected to a valid range after upgrading, and related prompt text and documentation have been improved.

::: warning Important: Automatic Refresh Configuration Will Be Forced Adjusted
Due to feedback indicating that **overly short automatic refresh intervals can trigger site rate limits and place excessive load on sites**,

v3.15.0 **has forced adjustments to automatic refresh configurations**:
- Automatic refresh and refresh on plugin open are now disabled. If you still need to enable them, you must re-enable them manually.
- The minimum `Refresh Interval` is 60 seconds, and the `Minimum Refresh Interval Protection` is 30 seconds. If your pre-upgrade setting was below these thresholds, it will be automatically raised to the minimum value after upgrading; if your previous setting was within the new valid range, it will not be affected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; the top of the popup can switch between "Account / Bookmarks".
- Automatic Refresh: In "Settings → Basic Settings → Automatic Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly test AI API functionality availability" to open the test panel directly on the current webpage; supports filling in/pasting `Base URL` and `API Key`, and performs basic capability probes for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible also supports one-click model list retrieval).
  - (Optional) Automatic Detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist; when a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear first, and the test panel will only open after confirmation (disabled by default, and keys are not saved).
  - Automatic Check-in: Added troubleshooting prompts to the execution results list – including handling suggestions and documentation links for common exceptions like "Temporary shield bypass tab manually closed" and "Access Token invalid".
- **Bug Fixes:**
  - WebDAV: Automatic synchronization has been migrated from timers to the browser Alarms API, reducing the probability of missed synchronization due to background sleep/power saving policies.

**Location Hints:**
- AI API Test Panel: Select "Quickly test AI API functionality availability" from the right-click menu on any webpage; related settings for automatic detection are in "Settings → AI API Test".
- Automatic Check-in Prompts: View in the execution results list in "Settings → Automatic Check-in".

## 3.13.0
- **New Features:**
  - Account Management: Added "Check-in Status Expired" prompt – when the "Checked in today / Not checked in today" status is not from today's detection, an orange warning icon will be displayed; clicking it will one-click refresh the account data, preventing misguidance by old status.
  - Interface: Multi-select controls have been upgraded to more compact selectors (saving space, supporting search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and check-in logic, improving usability.
  - Cookie Authentication: Removed the Cookie caching mechanism, reducing anomalies caused by still reading old values after Cookie updates.

**Location Hints:**
- Check-in Status Expired Prompt: In the account list in "Settings → Account Management", at the check-in icon to the right of the site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code" – generates Kilo Code / Roo Code providerProfiles configuration, supports copying apiConfigs snippets or downloading settings JSON for import (import is incremental addition, will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed the issue where site names and other text being too long caused layout overflow, now it is automatically truncated.
  - Dropdown Selectors: Optimized empty state prompts and fixed overflow issues with long option text.

**Location Hints:**
- Export to Kilo Code: In the "Settings → Key Management" key list, click the Kilo Code icon in the top right corner of a key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder – when a duplicate/similar channel is detected, a warning dialog will pop up, allowing you to choose to continue creating or cancel (no longer blocking creation with error toasts).
- **Bug Fixes:**
  - Account Management: Fixed the issue where site names and other text being too long caused layout overflow, now it is automatically truncated.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will open within the current incognito window (to maintain incognito login state).
  - Account Management: Disabled accounts also support clicking site links, making them useful as bookmarks.
  - Usage Analysis: When there is only a single account, the charts and lists prioritize displaying the site name (instead of the username), making the information more intuitive.
  - Shield Bypass Assistant: Temporary shield bypass windows now support CAP (cap.js) Pow verification, improving the pass rate.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Floating Tips: Fixed Toaster z-index issues, preventing tips from being obscured by webpages.

**Location Hints:**
- Site Links: Click the site name in the account list in "Settings → Account Management".
- Shield Bypass Assistant: Refer to [Cloudflare Shield Bypass Assistant](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added "Manual Balance (USD)" field – when the site cannot automatically retrieve balance/quota, you can manually fill it in for display and statistics.
  - Account Management: Added "Exclude from Total Balance" switch – used to remove specific accounts from "Total Balance" statistics (does not affect refresh/check-in functions).
  - Settings: Added "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings, allowing control over whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Automatic Check-in: After execution, relevant data will be refreshed and the interface will be synchronized and refreshed.

**Location Hints:**
- Add/Edit Account: Open add/edit account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added "Usage Analysis" page, helping you visualize usage trends across multiple sites and accounts with charts, allowing you to quickly see "where usage/spending is high / where it's slowing down", facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (raw logs are not saved); supports setting retention days, automatic sync methods, and minimum sync intervals, and view sync results and error prompts for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage", enable "Usage History Sync", set as needed, and click "Sync Now".
  - Then, go to "Usage Analysis" in the left menu to view charts; click "Export" when you need to retain or reconcile data.

## 3.7.0
- **New Features:**
  - Sorting: The account list now supports sorting by "Income"; the sorting priority now includes "Disable accounts at the bottom", preventing disabled/invalid accounts from interfering with your daily use.
  - Automatic Check-in: Added "Trigger today's check-in in advance when opening the interface" – when opening the popup/sidebar/settings page within the time window, it will automatically attempt to run today's check-in in advance, without waiting for the scheduled time.
- **Bug Fixes:**
  - Automatic Check-in: Each account will only be checked in once per day; retries are only for failed accounts, reducing meaningless requests and repeated interruptions.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Automatic Check-in Pre-trigger/Retry: Configure in the "Automatic Check-in" section of the left menu.

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enable/disable accounts; after disabling, various functions will skip the account, making it easier to retain data after an account becomes invalid.
  - Tags: Added global tag management and optimized related interfaces and interactions for easier classification and management of accounts.
  - Popup: Displays the current version number in the title bar and provides an entry point directly to this changelog.
  - Quick Export: CC Switch export supports selecting upstream models, making exported configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to prevent display inconsistencies due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Automatic Check-in" switch (moved above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from the dialog title icon for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed the issue where closing the dialog while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Automatic Recognition: Added "Slow Detection" prompts and related documentation links to help users troubleshoot and resolve issues.
  - Batch Opening External Check-in: Supports opening all in new windows, making batch closing easier and reducing interference.
- **Bug Fixes:**
  - Batch Opening External Check-in: Refactored the process to execute in the background service, ensuring correct opening of all sites in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to support direct selection of upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always have the `sk-` prefix, preventing recognition/copying issues due to inconsistent formats.

## 3.3.0
- **New Features:**
  - Automatic Check-in: Added "Username" information to account recognition, facilitating differentiation of accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the number of individual operations.
  - Automatic Refresh: The minimum refresh interval no longer has a maximum limit, allowing for larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce accidental triggers in non-copy scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying popup prompts, reducing invalid redemption notifications.
  - Storage: Added write locks to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text for "Copy Model Name".

## 3.2.0
- **New Features:**
  - The "Model List" page now includes an "Interface Availability Detection" (Beta) for quickly confirming if the current key is usable for a specified model (e.g., text generation, tool/function calling, structured output (returning JSON structure), web search (Grounding), etc.).
  - The "Model List" page now includes "CLI Tool Compatibility Detection" (Beta), simulating the tool calling process of Claude Code / Codex CLI / Gemini CLI to assess interface compatibility in these tools.
  - The "About" page now includes "Rate and Download": automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and entry points for downloading from other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will now display the status code and error reason, facilitating problem identification.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Features:**
  - In self-managed API settings, added administrator credential filling guidance.
  - Redemption Assistant now supports batch redemption and single code retry.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing them to coexist normally with all functions available, primarily for sites with cookie-only authentication like AnyRouter.
  - Supports setting proxy and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed incorrect web path redirection for manual check-in on New-API sites.

## 2.39.0
- Automatically detects and modifies the check-in support status of site accounts during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Select specific redemption accounts directly using the up/down arrow keys.
  - Press Enter to confirm redemption.
- Added prompts for temporary shield bypass tabs, indicating that the tab originates from this plugin and its purpose.
- Improved display of shield bypass windows: single window with multiple tabs, meaning short-term requests will reuse the same window to minimize interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added more lenient detection options for custom redemption code formats, correctly identifying redemption codes and popping up the Redemption Assistant when encountering them.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific channels for management.
- Fixed an issue where the channel model sync time was reset.

## 2.35.1
- Fixed an issue where the automatic check-in execution time was reset.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to remind users about redemption when copying any potential redemption codes.
- Added cdk.linux.do to the default URL whitelist for the Redemption Assistant.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error when comparing account IDs.
  - Ensured that all temporary contexts are closed correctly.

## 2.33.0
- **New Features:**
  - Introduced "Temporary Context Mode" to more effectively bypass website protections.
  - API error messages are now internationalized.
  - Optimized website type detection, which can now be identified by the title of the temporary window.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 3.24.0
- **New Features:**
  - Changelog: The plugin will no longer automatically open a new tab in the browser after an update; instead, when you first open the plugin interface, the update content will be displayed in a popup within the plugin, with an option to open the full changelog.
  - LDOH: Added `View in LDOH` (LDOH icon) quick entry in the account list, which directly jumps to LDOH and automatically filters to the corresponding site; when adding an account, an `Open LDOH Site List` entry is also provided to help find sites.
- **Experience Optimizations:**
  - Documentation Links: When opening documentation/changelogs from the plugin, it will automatically jump to the corresponding language's documentation page based on the current plugin language.

**Location Hints:**
- Changelog Switch: In "Settings → General → Changelog" under `Automatically display update content after update`.
- Changelog Popup: After updating the plugin, it will automatically pop up the first time you open the "Extension Popup / Settings Page / Sidebar" (once per version).
- LDOH Quick Entry: To the right of the site name in the account list in "Account Management" (LDOH icon, prompts `View in LDOH`); you can also click `Open LDOH Site List` in the add account dialog.

## 3.23.0
- **New Features:**
  - Automatic Check-in: Added `Quick Check-in` to the account operation menu, which allows immediate execution of a check-in for a single account and refreshes its status upon completion.
  - Key Management: Added `All Accounts` view, aggregating keys by account group for easier cross-account search and copying.
  - Model Redirect: Added `Clear Model Redirect Mappings` batch operation, which allows quick resetting of `model_mapping` by selecting channels and confirming twice (irreversible).
- **Experience Optimizations:**
  - New API Channel Management: URLs in the channel list are now clickable and the search experience has been optimized.
- **Bug Fixes:**
  - Channel Management: Fixed the inaccurate prompt text for `Priority` in the channel dialog.
  - Model Redirect: Added a "version guard" to automatically generated mappings to prevent cross-version mismatches.
  - Sidebar: When the runtime environment does not support sidebars, it will automatically fall back to opening the popup/settings page, preventing unresponsive clicks.

## 3.22.0
- **New Features:**
  - Model List: Added "Model Corresponding Key" tool (key icon) to check if a current model has an available key; if no available key is found, you can create a default key with one click based on the model's available groups, or enter a custom creation process, and it supports one-click key copying.
  - Share Snapshot: Supports one-click sharing of "Overview Snapshot / Account Snapshot", prioritizing copying the image to the clipboard, and automatically downloading a PNG if not supported; snapshots only contain shareable information (no sensitive fields like `API Key`), and the title text can be copied with one click.
- **Experience Optimizations:**
  - Disabled Accounts: Disabled accounts will be automatically skipped in refresh and scheduled tasks such as "Balance History / Usage Analysis / Usage Sync", reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed the issue where the spinner is not visible when a button is in a "loading" state and also displays a left icon.

**Location Hints:**
- Model Corresponding Key: In "Settings → Model List", click the key icon to the right of the model name (`Model Corresponding Key`).
- Share Overview Snapshot: In the button on the right side of the title bar of the extension popup overview page (`Share Overview Snapshot`).
- Share Account Snapshot: In the operation menu for a single account in "Settings → Account Management" (`Share Account Snapshot`).

## 3.21.0
- **New Features:**
  - API Credentials: Added "API Credentials" page, suitable for scenarios with only `Base URL` + `API Key` and no account; supports unified management of tags/remarks, and allows direct availability verification and quick export (e.g., Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added multi-account view (Overview / Account Distribution / Trend), and provides a unified "Account Summary" table for quick comparison and summary statistics.
  - Self-Built Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for functions like "Channel Management" and "Model Sync".
- **Experience Optimizations:**
  - Right-Click Menu: "Redemption Assistant" and "AI API Detection" entries can be toggled on/off separately, and the changes take effect immediately after switching.
  - Copy Key: When an account has no key, the popup provides entry points for "Quickly Create Default Key / Create Custom Key", reducing back-and-forth navigation.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Built Site Management", select `Done Hub`, and fill in "Done Hub Integration Settings".
- Right-Click Menu Entry Toggles: In "Settings → Basic Settings → Check-in and Redemption / AI API Testing", under their respective "Show in Browser Right-Click Menu".
- Copy Key Popup: Opened by clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown options when adding a new key now display both the group ID and description, making it easier to distinguish and select among multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" when adding a new account is now changed to off; if you wish to automatically generate a default key after adding an account, please enable it manually in the settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add Key", view in the group dropdown options.
- Automatic Default Key Creation Switch: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Built Site Management: Added `Octopus` hosted site support, allowing connection to the Octopus backend and importing account API keys as channels in "Channel Management", as well as fetching available model lists.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default), and provides a one-click "Ensure at least one key" to automatically supplement default keys for accounts missing them.
  - AI API Testing: "Model List Probing" for interface verification now supports OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and other interface types, and provides suggested available model IDs, reducing manual model guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account recognition logic, improving stability in scenarios with multiple accounts for the same site.
  - Usage/Log Fetching: Added rate limiting protection to log-related interfaces, reducing errors caused by frequent refreshes or triggering site rate limits.
  - Channel Management: Improved duplicate channel detection during creation, with confirmation prompts to avoid accidental creation of duplicate routes.
- **Bug Fixes:**
  - Disable Accounts: Disabled accounts are now automatically filtered out in dropdowns/lists such as Key Management, preventing invalid operations.
  - Language: Fixed the issue where the extension's language setting might affect the webpage's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Built Site Management", select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Automatic Default Key Creation Switch: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Default Key Supplement: In "Settings → Key Management", at the top right, "Ensure at least one key".
- AI API Testing Entry: Right-click menu "Quickly test AI API functionality availability".

## 3.18.0
- **New Features:**
  - Balance History: Charts now support switching "Currency Unit" (`USD` / `CNY`), and display currency symbols on axes/tooltips; when `CNY` is selected, it will be converted based on the account's "Recharge Amount Ratio", making it easier to view trends and reconcile by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are too many tag/account options, it defaults to "Expand to display", making browsing and selection more intuitive.
  - Tabs: Added left and right scroll buttons to the group tabs in "Settings" and the vendor tabs in "Model List", making switching easier in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Automatic Recognition" is more accurate, fixing the issue of unknown site types appearing frequently in recent versions.

**Location Hints:**
- Balance History Currency Unit: In the "Currency Unit" filter area of the "Settings → Balance History" page.
- Account Exchange Rate (Recharge Amount Ratio): In the "Recharge Amount Ratio" field of the add/edit account form in "Settings → Account Management".

## 3.17.0
- **New Features:**
  - Balance History: Added "Balance History" feature (off by default), which records daily balance and income/expense snapshots, and displays trends in charts; supports filtering by tag/account and time range, and provides convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added settings to control whether to enable it, the number of days to retain, and "End-of-day Fetch". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-day Fetch", the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar on small screens/narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed the responsive display issue of the export area on some screen sizes.
  - Popups: Fixed the layout anomaly where the scrollbar position in popups was incorrect.

**Location Hints:**
- Balance History Switch/Retention Days/End-of-day Fetch: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added Sub2API site type, supporting balance/quota query; supports reading login state via "Automatic Recognition" from the console; and supports the "Plugin Hosted Session (Multiple Accounts, Recommended)" mode, which can independently renew authentication for each account, improving the experience for multiple accounts on the same site.
  - Display Settings: Added "Show Today's Income/Expenses" switch (on by default), which hides and stops fetching statistics like "Today's Consumption/Income", reducing log fetching requests during refreshes.
- **Note:**
  - Sub2API currently does not support site check-in, today's usage, income, or related functions, only basic balance/quota query. Related functions will be gradually improved based on site capabilities in the future.
  - "Plugin Hosted Session (Multiple Accounts)" saves `refresh_token` as account-private credentials, which will be included in exports/WebDAV backups; please keep backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Add/Mode Description: In "Settings → Account Management", add/edit account, select Sub2API as the site type; for more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved background Service Worker stability, reducing the issue of asynchronous timed tasks (WebDAV auto-sync / usage sync / model sync / automatic check-in, etc.) being missed due to premature termination of the background process; and automatically resuming related timed tasks after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" for saving quick links to site consoles/documentation/management pages without needing to create a full account; supports adding/editing/deleting, pinning, tagging, search filtering, drag-and-drop sorting; the popup now has "Account / Bookmarks" switching; bookmark data will be included in backups/restores and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests, reducing unnecessary network calls (some sites already return `today_income` in their refresh interface).
  - Automatic Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is now 30 seconds; old configurations will be automatically corrected to a valid range after upgrading, and related prompt text and documentation have been improved.

::: warning Important: Automatic Refresh Configuration Will Be Forced Adjusted
Due to feedback indicating that **overly short automatic refresh intervals can trigger site rate limits and place excessive load on sites**,

v3.15.0 **has forced adjustments to automatic refresh configurations**:
- Automatic refresh and refresh on plugin open are now disabled. If you still need to enable them, you must re-enable them manually.
- The minimum `Refresh Interval` is 60 seconds, and the `Minimum Refresh Interval Protection` is 30 seconds. If your pre-upgrade setting was below these thresholds, it will be automatically raised to the minimum value after upgrading; if your previous setting was within the new valid range, it will not be affected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; the top of the popup can switch between "Account / Bookmarks".
- Automatic Refresh: In "Settings → Basic Settings → Automatic Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly test AI API functionality availability" to open the test panel directly on the current webpage; supports filling in/pasting `Base URL` and `API Key`, and performs basic capability probes for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible also supports one-click model list retrieval).
  - (Optional) Automatic Detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist; when a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear first, and the test panel will only open after confirmation (disabled by default, and keys are not saved).
  - Automatic Check-in: Added troubleshooting prompts to the execution results list – including handling suggestions and documentation links for common exceptions like "Temporary shield bypass tab manually closed" and "Access Token invalid".
- **Bug Fixes:**
  - WebDAV: Automatic synchronization has been migrated from timers to the browser Alarms API, reducing the probability of missed synchronization due to background sleep/power saving policies.

**Location Hints:**
- AI API Test Panel: Select "Quickly test AI API functionality availability" from the right-click menu on any webpage; related settings for automatic detection are in "Settings → AI API Test".
- Automatic Check-in Prompts: View in the execution results list in "Settings → Automatic Check-in".

## 3.13.0
- **New Features:**
  - Account Management: Added "Check-in Status Expired" prompt – when the "Checked in today / Not checked in today" status is not from today's detection, an orange warning icon will be displayed; clicking it will one-click refresh the account data, preventing misguidance by old status.
  - Interface: Multi-select controls have been upgraded to more compact selectors (saving space, supporting search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and check-in logic, improving usability.
  - Cookie Authentication: Removed the Cookie caching mechanism, reducing anomalies caused by still reading old values after Cookie updates.

**Location Hints:**
- Check-in Status Expired Prompt: In the account list in "Settings → Account Management", at the check-in icon to the right of the site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code" – generates Kilo Code / Roo Code providerProfiles configuration, supports copying apiConfigs snippets or downloading settings JSON for import (import is incremental addition, will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed the issue where site names and other text being too long caused layout overflow, now it is automatically truncated.
  - Dropdown Selectors: Optimized empty state prompts and fixed overflow issues with long option text.

**Location Hints:**
- Export to Kilo Code: In the "Settings → Key Management" key list, click the Kilo Code icon in the top right corner of a key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder – when a duplicate/similar channel is detected, a warning dialog will pop up, allowing you to choose to continue creating or cancel (no longer blocking creation with error toasts).
- **Bug Fixes:**
  - Account Management: Fixed the issue where site names and other text being too long caused layout overflow, now it is automatically truncated.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will open within the current incognito window (to maintain incognito login state).
  - Account Management: Disabled accounts also support clicking site links, making them useful as bookmarks.
  - Usage Analysis: When there is only a single account, the charts and lists prioritize displaying the site name (instead of the username), making the information more intuitive.
  - Shield Bypass Assistant: Temporary shield bypass windows now support CAP (cap.js) Pow verification, improving the pass rate.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Floating Tips: Fixed Toaster z-index issues, preventing tips from being obscured by webpages.

**Location Hints:**
- Site Links: Click the site name in the account list in "Settings → Account Management".
- Shield Bypass Assistant: Refer to [Cloudflare Shield Bypass Assistant](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added "Manual Balance (USD)" field – when the site cannot automatically retrieve balance/quota, you can manually fill it in for display and statistics.
  - Account Management: Added "Exclude from Total Balance" switch – used to remove specific accounts from "Total Balance" statistics (does not affect refresh/check-in functions).
  - Settings: Added "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings, allowing control over whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Automatic Check-in: After execution, relevant data will be refreshed and the interface will be synchronized and refreshed.

**Location Hints:**
- Add/Edit Account: Open add/edit account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added "Usage Analysis" page, helping you visualize usage trends across multiple sites and accounts with charts, allowing you to quickly see "where usage/spending is high / where it's slowing down", facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (raw logs are not saved); supports setting retention days, automatic sync methods, and minimum sync intervals, and view sync results and error prompts for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage", enable "Usage History Sync", set as needed, and click "Sync Now".
  - Then, go to "Usage Analysis" in the left menu to view charts; click "Export" when you need to retain or reconcile data.

## 3.7.0
- **New Features:**
  - Sorting: The account list now supports sorting by "Income"; the sorting priority now includes "Disable accounts at the bottom", preventing disabled/invalid accounts from interfering with your daily use.
  - Automatic Check-in: Added "Trigger today's check-in in advance when opening the interface" – when opening the popup/sidebar/settings page within the time window, it will automatically attempt to run today's check-in in advance, without waiting for the scheduled time.
- **Bug Fixes:**
  - Automatic Check-in: Each account will only be checked in once per day; retries are only for failed accounts, reducing meaningless requests and repeated interruptions.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Automatic Check-in Pre-trigger/Retry: Configure in the "Automatic Check-in" section of the left menu.

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enable/disable accounts; after disabling, various functions will skip the account, making it easier to retain data after an account becomes invalid.
  - Tags: Added global tag management and optimized related interfaces and interactions for easier classification and management of accounts.
  - Popup: Displays the current version number in the title bar and provides an entry point directly to this changelog.
  - Quick Export: CC Switch export supports selecting upstream models, making exported configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to prevent display inconsistencies due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Automatic Check-in" switch (moved above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from the dialog title icon for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed the issue where closing the dialog while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Automatic Recognition: Added "Slow Detection" prompts and related documentation links to help users troubleshoot and resolve issues.
  - Batch Opening External Check-in: Supports opening all in new windows, making batch closing easier and reducing interference.
- **Bug Fixes:**
  - Batch Opening External Check-in: Refactored the process to execute in the background service, ensuring correct opening of all sites in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to support direct selection of upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always have the `sk-` prefix, preventing recognition/copying issues due to inconsistent formats.

## 3.3.0
- **New Features:**
  - Automatic Check-in: Added "Username" information to account recognition, facilitating differentiation of accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the number of individual operations.
  - Automatic Refresh: The minimum refresh interval no longer has a maximum limit, allowing for larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce accidental triggers in non-copy scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying popup prompts, reducing invalid redemption notifications.
  - Storage: Added write locks to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text for "Copy Model Name".

## 3.2.0
- **New Features:**
  - The "Model List" page now includes an "Interface Availability Detection" (Beta) for quickly confirming if the current key is usable for a specified model (e.g., text generation, tool/function calling, structured output (returning JSON structure), web search (Grounding), etc.).
  - The "Model List" page now includes "CLI Tool Compatibility Detection" (Beta), simulating the tool calling process of Claude Code / Codex CLI / Gemini CLI to assess interface compatibility in these tools.
  - The "About" page now includes "Rate and Download": automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and entry points for downloading from other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will now display the status code and error reason, facilitating problem identification.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Features:**
  - In self-managed API settings, added administrator credential filling guidance.
  - Redemption Assistant now supports batch redemption and single code retry.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing them to coexist normally with all functions available, primarily for sites with cookie-only authentication like AnyRouter.
  - Supports setting proxy and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed incorrect web path redirection for manual check-in on New-API sites.

## 2.39.0
- Automatically detects and modifies the check-in support status of site accounts during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Select specific redemption accounts directly using the up/down arrow keys.
  - Press Enter to confirm redemption.
- Added prompts for temporary shield bypass tabs, indicating that the tab originates from this plugin and its purpose.
- Improved display of shield bypass windows: single window with multiple tabs, meaning short-term requests will reuse the same window to minimize interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added more lenient detection options for custom redemption code formats, correctly identifying redemption codes and popping up the Redemption Assistant when encountering them.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific channels for management.
- Fixed an issue where the channel model sync time was reset.

## 2.35.1
- Fixed an issue where the automatic check-in execution time was reset.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to remind users about redemption when copying any potential redemption codes.
- Added cdk.linux.do to the default URL whitelist for the Redemption Assistant.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error when comparing account IDs.
  - Ensured that all temporary contexts are closed correctly.

## 2.33.0
- **New Features:**
  - Introduced "Temporary Context Mode" to more effectively bypass website protections.
  - API error messages are now internationalized.
  - Optimized website type detection, which can now be identified by the title of the temporary window.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 2.32.0
- **New Features:**
  - Model redirects are now smarter, supporting version numbers with hyphens and dots.
  - Added the functionality to perform redemption directly via the right-click menu after selecting text.
  - Automatic check-in is enabled by default, and the check-in time window has been extended.

## 2.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - You can now quickly perform check-in operations within the popup.
  - The Redemption Assistant now includes a URL whitelist feature, giving you better control over which websites can use it.

## 2.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capabilities for Cloudflare challenge pages.
  - WebDAV backups now support encryption, and a decryption retry popup has been added for restoration, while preserving your WebDAV configuration.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website Cookie interception issues during automatic detection.
  - Optimized the centering of blank state content in Firefox.
  - Migrated the Switch component to a custom implementation, improving compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced "Hosted Site" service, laying the foundation for more site integrations in the future.
  - Added support for Veloera sites.
  - Updated the term "New API" in settings to "Hosted Site" for clarity.
- **Bug Fixes:**
  - Optimized translation texts and removed redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes, helping you understand specific issues.
  - The temporary window bypass feature now includes a health status indicator.
  - Optimized the description of bypassing website protection for better clarity.
  - Added a notification system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed display issues with Firefox popup notifications in Chinese settings.
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
  - When the pin/manual sort feature is disabled, related UI elements will be automatically hidden.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

## 2.24.0
- **New Features:**
  - Updated application description and about page content.
  - The extension name now includes a subtitle.
  - The tag filter now includes visibility control based on row count.
  - WebDAV connection tests now support more success status codes.
- **Bug Fixes:**
  - Removed extra periods at the end of JSON strings.

## 2.23.0
- **New Features:**
  - Enhanced account tagging functionality.
  - The temporary window bypass feature now supports more intelligent judgment based on error codes.

## 2.22.0
- **New Features:**
  - Account management now includes tagging functionality for account classification.
  - The Redemption Assistant popup UI now supports lazy loading and has fixed issues that could cause website style conflicts.
  - Added global channel filters and JSON editing mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed duplicate "Checked in today" checks from automatic check-in.
  - Simplified and fixed the temporary window capture logic.
  - Restored the parsing of search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guidance during initial installation for better understanding of required permissions.
  - Cookie interceptor headers can now be controlled by optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed the issue of operation buttons overflowing in the account dialog.
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
  - The redemption function now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and setting links.
- **Bug Fixes:**
  - Fixed path issues with Tailwind CSS files.

## 2.17.0
- **New Features:**
  - Added automatic popup notification functionality for one-click redemption.
  - Unified data format for import/export and WebDAV backups using a V2 versioning scheme, improving compatibility and stability.

## 2.16.0
- **New Features:**
  - Added warning prompts when creating accounts in Firefox desktop.
  - API model synchronization now supports a channel filtering system.

## 2.15.0
- **New Features:**
  - The MultiSelect component now supports parsing comma-separated strings.
- **Bug Fixes:**
  - Ensured that caching only occurs during full channel data synchronization.
- **Performance Optimizations:**
  - Optimized upstream model caching logic.

## 2.14.0
- **New Features:**
  - Site metadata is now automatically detected during refresh.
  - When automatic check-in fails, retry and manual check-in options are now available.
  - Enhanced automatic check-in functionality, including retry strategies, skip reasons, and account snapshots.
  - Optimized the execution method for automatic check-in to use concurrent processing for improved efficiency.
- **Bug Fixes:**
  - Fixed the default behavior issue of the `autoCheckInEnabled` flag.

## 2.13.0
- **New Features:**
  - Added "New API Channel Management" functionality.
  - Added a "Warning" button style.
  - Introduced Radix UI components and Tanstack Table to enhance interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed issues with model count display and sorting in the channel table.

## 2.12.1
- **Bug Fixes:**
  - Fixed unnecessary reloads of channels when manually selecting tabs.
  - The "New API Model Sync" option is hidden when the configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Sync" now includes an allowlist filter for models.
  - The sidebar now supports collapsing/expanding with smooth animations.

## 2.11.0
- **New Features:**
  - Enhanced account management features, including search functionality and navigation optimization.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed logic errors in automatic check-in status.

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
  - Optimized dropdown menu positioning and accessibility for the multi-select component.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can now be saved even if data retrieval fails during manual account addition.
  - The settings page now includes "Settings Partitions" for resetting settings by section.

## 2.7.1
- **Bug Fixes:**
  - Fixed an issue where redirected models were not appearing in the model list during API synchronization.

## 2.7.0
- **New Features:**
  - The account dialog can now dynamically update new account site data.
- **Bug Fixes:**
  - Hidden the password visibility button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - User preferences like `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now mandatory to ensure complete default configurations.
- **Bug Fixes:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed the issue of missing "New API Preferences" in configuration checks.
  - Corrected check-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 2.6.0
- **New Features:**
  - Optimized the user interface for "New API Channel Import", supporting key switching and batch model selection.
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
  - Automatic import functionality now integrates with the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - The multi-select component now supports a collapsible selected area and optimized input experience.
- **Bug Fixes:**
  - Optimized the retry mechanism and added user feedback.
  - Improved the performance of the multi-select component with a large number of selections.

## 2.3.0
- **New Features:**
  - Added account pinning and unpinning functionality, with pinned accounts prioritized in sorting.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration by increasing the priority of the current site condition.

## 2.2.1
- **Bug Fixes:**
  - Removed the `isDetected` check for the automatic configuration button.
  - Ensured that the account detection correctly refreshes when displayed data changes.
  - Fixed an issue where Access Tokens were no longer required for Cookie authentication types.

## 2.2.0
- **New Features:**
  - Automatic check-in functionality now includes a results/history interface and optimized default settings and user experience.
  - Implemented daily site automatic check-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case sensitivity issues in automatic check-in status detection.
  - Handled edge cases in check-in time window calculations.

## 2.1.0
- **New Features:**
  - Added username search and highlighting functionality to the account list.
- **Bug Fixes:**
  - Added configuration validation warnings when API settings are missing.
  - Added configuration validation assistance and internationalized error messages for "New API" features.

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
  - Supports pinning accounts with custom check-in or redemption URLs.
  - Added custom redemption and opening tab matching as sorting rules.
- **Bug Fixes:**
  - Ensured deep copying of default sorting rules.
  - New sorting conditions are disabled by default after migration.

## 1.37.0
- **New Features:**
  - Enhanced account search functionality to support multi-field composite searches across UI interfaces.
  - Added the functionality to open the sidebar.
- **Bug Fixes:**
  - Added translation for the "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with redemption page paths and support redirection.
  - Option to automatically open the redemption page after check-in.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - Check-in icon updated to a "Yen" icon for better clarity.
- **Bug Fixes:**
  - Custom check-in accounts now automatically reset their check-in status daily.
  - Fixed the default value issue of the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic synchronization of account data with a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` for improved cross-browser compatibility and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced a reusable `AppLayout` component to enhance interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed incorrect width of the right content container on small screens.

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
  - Added "Usage Log" functionality to account management.
  - Sorting priority settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fixes:**
  - Updated the size and accessibility labels for SiteInfo icon buttons.

## 1.30.0
- **New Features:**
  - Replaced the dialog component with a custom `Modal` component for improved consistency.
  - Introduced a comprehensive set of UI components to enhance interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priority.
  - Optimized the transparency and layering of the mobile sidebar overlay for a better user experience.

## 1.29.0
- **New Features:**
  - Popups now support detection and automatic closing.
  - Popups now have responsive mobile layout to avoid the need for zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent automatic detection.
  - Migrated `chrome.*` APIs to `browser.*` APIs, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functional compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed `tabId` parsing issues after window creation.
  - Prevented rotation animation on button borders during refresh.

## 1.27.0
- **New Features:**
  - The account dialog will automatically close after successful automatic configuration to New API.
  - Implemented dynamic loading of localization resources for improved internationalization support.
- **Bug Fixes:**
  - Added internationalization support for error messages.
  - Fixed template syntax errors in Chinese and English currency switching.

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
  - Added "Today's Total Income" field and income display interface to accounts.
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
  - Added refresh functionality to balance and health status indicators.
  - Unified and optimized operation button UI, supporting intelligent key handling.

## 1.19.0
- **New Features:**
  - All components now support dark mode.
  - Implemented a theme system supporting dark, light, and system-following modes.
- **Bug Fixes:**
  - API configuration interface now requires the `authType` field.

## 1.18.0
- **New Features:**
  - Added custom check-in button (with Yen icon) to accounts.
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting functionality now includes custom check-in URLs as sorting conditions.
- **Bug Fixes:**
  - Fixed an issue where the custom check-in URL was not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication types.
  - Added "No Authentication" type to API authentication options.
  - Migrated the tooltip component to the `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - Added automatic account configuration support for "New API" features.
  - Accounts now support check-in functionality.
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
  - Enhanced refresh functionality with detailed status tracking.
  - Added minimum refresh interval to prevent frequent requests.

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
  - Optimized the rendering method for the model list, improving loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed an issue where the status of detected accounts was reset when no existing accounts were found.

## 1.4.0
- **New Features:**
  - Added "Copy Model Name" functionality to the control panel.
  - Added support for Baidu and Yi model providers.

## 1.3.1
- **Bug Fixes:**
  - Updated release PR workflow configuration.

## 1.3.0
- **New Features:**
  - Added WebDAV backup and synchronization functionality.

## 1.2.0
- **New Features:**
  - Added an account management page with full CRUD (Create, Read, Update, Delete) functionality.
  - Replaced custom dialogs in popups with direct function calls for simplified operations.

## 1.1.1
- **Bug Fixes:**
  - Fixed logic for handling missing system names and checks.

## 1.1.0
- **New Features:**
  - Added manual account addition support and optimized the UI flow.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of current sites.
  - Added Firefox browser detection and warning prompts when adding accounts.
  - Introduced sidebar functionality, replacing popup-based automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized account recognition process, now supports automatic access key creation.
  - Account list now includes sortable headers, copy key dialog, and hover action buttons.
  - Account management includes a remarks field.
  - Website names are now clickable links.
  - Model list supports group selection.
  - Popup pages feature animated number rolling and site status indicators.
  - Optimized add/edit account dialogs, including recharge ratio settings and automatic site name extraction.
  - Fully implemented settings page system, supporting user preference persistence and automatic refresh.
  - Enhanced frontend interface and backend services for automatic refresh functionality.
  - Automatically adds `sk-` prefix when copying keys.
  - Introduced industry-standard tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Supports more AI model providers (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Popup interface refactored to API Manager style, with added display of today's total consumption.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed model data format incompatibility, `localStorage` access, and API request credential issues.
  - Corrected API authentication methods.
  - Optimized URL input processing and automatic refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**