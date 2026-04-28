# Changelog

This page records major updates for general users (feature changes / experience optimizations / bug fixes). For complete historical versions and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip For New Users
- **How to confirm your current version**: Open the extension popup; the version number will be displayed in the title bar. You can also check it on the settings page.
- **How to stop this page from opening automatically**: You can control whether to "Automatically open the changelog after updates" in "Settings → General → Changelog".
- **Troubleshooting**: You can enable console logs in "Settings → General → Logs" and report reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.35.0
- **New Features:**
  - Hosted Sites: Added `AxonHub` integration settings. You can configure `Base URL`, administrator email, and password within the extension. After verifying the connection, you can directly read, create, edit, and delete AxonHub channels, and import existing accounts/keys as AxonHub channels.
  - Hosted Sites: Added `Claude Code Hub` integration settings. You can configure `Base URL` and administrator token to directly manage the `Provider` list. It also supports importing existing accounts/keys as Claude Code Hub providers, reducing duplicate entries across multiple backends.
- **Bug Fixes:**
  - Import/Export: After importing a backup containing preference settings, the settings state will now be immediately refreshed, and the interface language from the backup will be applied. This reduces instances where old settings or languages are still displayed after import, requiring a manual page reload.
  - Account Management: The descriptions and actual behavior of the `Prioritize Current Login Account` and `Match Open Tabs` sorting/matching rules have been aligned. When you search for an account using a full URL, tab title, or current page related content, relevant accounts are more likely to be correctly identified and ranked higher.

::: tip Scope of Use
`Claude Code Hub` currently does not support `Channel Migration`, `Model Sync`, `Model Redirect`, or full key viewing. `AxonHub` currently only covers basic channel management and import processes, not migration or model synchronization capabilities.
:::

**Location Hints:**
- `AxonHub` / `Claude Code Hub` Integration Settings and Verification: In "Settings → Basic Settings → Self-Hosted Site Management".
- `AxonHub` Channel Management, `Claude Code Hub` Provider Management, and Import to Target Backend: In "Settings → Channel Management" and related import processes.
- Preference Backup Import: In "Settings → Import/Export".
- Account Sorting Priority and Account Search: In "Settings → Account Management".

## 3.34.0
- **New Features:**
  - Model List: Added price comparison capabilities, allowing filtering by billing method, sorting by price, and in the "All Accounts" view, supporting "cheapest first for the same model" to find low-priced models more directly with multiple accounts.
  - API Credentials: Configuration cards now include usage telemetry overview and manual refresh, allowing viewing of health status, balance, daily usage, request count, available models, etc. It also supports automatic recognition by site type or the use of custom read-only query endpoints.
  - Model List: In the "All Accounts" view, added filtering by account, account group, and other dimensions, making it easier to narrow down the scope when there are many sources.
  - Model Verification: Supports batch verification of the current filter results and can be used directly in the "All Accounts" view, making batch troubleshooting of model availability more convenient.
  - Account Management: Added batch selection, batch disabling, and batch deletion for easier organization of large numbers of accounts.
  - Account Management: Supports sorting by `Creation Time` and displays the creation time directly in the list.
  - Automatic Check-in: Failed results now allow direct execution of `Disable Account` or `Delete Account`, enabling in-place handling of abnormal accounts on the results page after troubleshooting, without needing to switch back to account management.
  - Hosted Sites: Even if the current site is not yet fully configured, entries like `Channel Management` and `Model Sync` will be retained, with direct prompts within the page indicating missing configurations and providing links to the setup entry.
  - Account Management: When adding accounts, you can now choose to automatically fill in the current site URL, reducing operational steps.
- **Experience Optimizations:**
  - Account Management: Added a global refresh button at the top of the account management page for one-click refresh of all accounts.
  - Account Management: Drag-and-drop sorting and filtering now have smoother animation experiences.
  - Model List: The "All Accounts" view will more clearly distinguish between "Loading," "Load Failed," and "Format Incompatible" states. Expanded items will also be preserved as much as possible after refreshing, reducing repeated searches.
  - Key Management: When adding keys in the current account or "All Accounts" filter view, the corresponding account will be automatically pre-selected, reducing duplicate selections.
  - Refresh Experience: Multiple settings pages and history pages will try to retain current content when refreshing data, avoiding frequent clearing and reloading, making viewing less interrupted.
- **Performance Optimizations:**
  - Account Management: Optimized the loading performance of large lists, resulting in faster loading speeds when there are many accounts.
- **Bug Fixes:**
  - WebDAV: Compatible with backup download responses that return `206 Partial Content` from some services, reducing instances where downloads are mistakenly marked as failed.
  - WONG Public Welfare Site: Fixed the real key reading method for masked `token`s, restoring normal parsing of related account or key information.
  - Temporary Window Reminder Required: Only prompts for adjustments when account refresh has confirmed the need for temporary window fallback, but the relevant settings are currently disabled or permissions are missing, reducing unnecessary reminders in unrelated scenarios.

**Location Hints:**
- Model Price Comparison, Account Filtering, Batch Verification: In "Settings → Model List".
- API Credentials Telemetry Overview and Configuration: In the cards and add/edit dialogs of "Settings → API Credentials".
- Account Auto-fill on Addition, Batch Management, Creation Time Sorting: In "Settings → Account Management".
- Automatic Check-in Failed Account Handling: In the results list of "Settings → Automatic Check-in".
- Automatic Pre-selection of Account on Key Management Addition: In "Settings → Key Management".
- Hosted Site Missing Configuration Prompt: On the relevant hosted site pages in "Settings → Self-Hosted Site Management".
- WebDAV Backup Synchronization: In the relevant processes of `WebDAV Settings` within "Settings → Import/Export".

## 3.33.0
- **New Features:**
  - Account Addition: When a hosted site configuration is incomplete, you will now be prompted to complete the settings before `Save and Auto-configure`. You can directly jump to the relevant configuration page, reducing the situation where you discover missing configurations only after clicking auto-configure.
  - Hosted Site Verification: The `New API` verification dialog has been changed to an `OTP` style more suitable for CAPTCHA input, making it more convenient to enter one-time verification codes.
  - API Verification Records: Verification history status is now displayed more clearly. When viewing the last verification result in `API Credentials`, Model List, or other locations, it's easier to determine the current status.
  - Hosted Site Settings: Administrator User IDs are now restricted to pure numbers only. Invalid values will be directly intercepted and prompted on the settings page, reducing verification or read exceptions caused by incorrect values.
  - Model List: When no data source is selected, clearer empty state descriptions and next steps are provided, reducing confusion about what to do first after entering the page.
  - Key Management: When there are no keys under an account or key loading fails, clearer empty state prompts are provided, along with options to retry or navigate to relevant pages.
  - Model to Key Dialog: You can now directly jump to the `Key Management` for the corresponding account and quickly filter by account badges to identify the source. This makes it easier to troubleshoot models and keys for a specific account.
  - Update Reminders: Users who manually install packages can now view the differences between the current version and the latest stable version, and directly open the download page or update notes, reducing the chance of staying on an old version unknowingly for extended periods.
- **Experience Optimizations:**
  - In-Page Navigation: For multiple entry points that require jumping from the current flow to the settings, account, or hosted site pages, navigation history is now better preserved, making returning to the previous step more natural.
  - Exit Flow Prompts: Button copy will more clearly distinguish between "Leave Current Flow" and "Continue to Next Step," reducing accidental clicks that lead to leaving the current page.
  - Warning Prompts: Some scenarios described as "partially successful / requires subsequent processing" are now displayed with a unified warning prompt style, accompanied by directly executable follow-up actions.
  - Account Data Reading: Manually fetching account data that takes longer than approximately `20` seconds will now stop, preventing prolonged waiting and preserving any results that can still be saved, reducing instances of being stuck in a waiting state.
- **Bug Fixes:**
  - WebDAV Sync: Before automatic synchronization, the system will make its best effort to upload local changes for deleted accounts, reducing the chance of deleted accounts being reintroduced in other devices or subsequent synchronizations.
  - Account Management: Temporary windows will only be suggested to assist the process when the current environment is genuinely restricted, reducing false alarms.
  - Model List: Restored the original account name badge display, making it easier to identify which account a model originates from when viewing account-sourced models.
  - DoneHub: Compatible with some sites' daily usage query methods, reducing abnormal reads or unstable results.
- **Performance Optimizations:**
  - Data Statistics: Reduced extra requests in the fast path for reading daily usage, lowering the refresh waiting time for some sites.

**Location Hints:**
- Hosted Site Configuration Completion: In the add or edit account dialog within "Settings → Account Management".
- `OTP` Verification and Hosted Site Configuration: In "Settings → Self-Hosted Site Management", within `New API Integration Settings` and related verification dialogs.
- Hosted Site Administrator User ID Validation: In "Settings → Self-Hosted Site Management", within the relevant hosted site settings.
- Model List Empty State and Source Filtering: In "Settings → Model List".
- Key Management Empty State and Quick Jump: In "Settings → Key Management" and the model-to-key dialog.
- Version Update Reminder: In the extension popup or the version number at the top of the settings page, and in "Settings → About".
- WebDAV Automatic Sync: In "Settings → Import/Export", under `WebDAV Settings` and `WebDAV Automatic Sync`.

## 3.32.0
- **New Features:**
  - Automatic Check-in: Each row in the results table can now open its corresponding site directly. If the current site type does not support automatic check-in, the extension now shows a clearer message so you can decide whether to handle it manually or check the site's rules first.
  - New API Hosted Site Verification: If verification finds that `Base URL`, username, or password is missing, you can now fill them in directly inside the verification dialog and continue with `Save and Retry`, without leaving the dialog to go back to the settings page.
- **Experience Optimizations:**
  - Account List Sorting: The default sort priority now gives precedence to the field you actively choose in the list. For example, when sorting by `Balance`, `Spend`, or `Income`, that selection now takes effect before the old manual order. Existing preferences are migrated automatically, so no reconfiguration is required.
- **Bug Fixes:**
  - Account Management: When cookie import runs into missing permissions, the account dialog no longer closes early when redirecting you to `Permission Settings`; after handling permissions, you can continue the current input flow.
  - Automatic Recognition: If the current tab was already open before the extension was installed or updated, automatic recognition now clearly prompts you to refresh the page and provides a one-click refresh action, reducing failures that looked random.
  - Temporary Page / Window Flows: Fixed cases where context was released too early in flows that rely on temporary pages, reducing mid-process failures, closed-page issues, and errors like `No tab with id`.

**Location Hints:**
- Automatic Check-in result quick actions: In each row of the results table under "Settings → Automatic Check-in".
- New API quick config completion: In "Settings → Self-Hosted Site Management" and related `New API` verification dialogs.
- Cookie import permission hints / automatic recognition refresh hints: In the new or edit account dialogs under "Settings → Account Management".
- Sorting priority settings: In "Settings → Account Management → Sorting Priority Settings".

## 3.31.0
- **New Features:**
  - Safari Support: Added Safari installation documentation and release packages for easier installation and use on macOS via Xcode.
  - Account Management: Added an independent advanced filter bar to filter by `Site Type`, `Check-in Status`, `Refresh Status`, and `Account Status`. Each option will also display the count, making filtering more intuitive.
  - Model List: When the model list for a single account fails to load, you can now use an `API Key` from that account to continue loading, reducing the situation where models are completely invisible due to API exceptions.
  - CLIProxyAPI: Added `Connection Detection` in `CLIProxyAPI Settings`. It can automatically check after saving the address or managing keys, or you can manually re-detect.
- **Experience Optimizations:**
  - Hosted Site Channel Import: Clearer prompts will be shown before importing to indicate if the current channel might be a duplicate, reducing the need for post-import investigation.
  - Hosted Site Channel Import: When confirmation is needed, you can now complete verification in the dialog box before proceeding to check for duplicates, without directly blocking the operation.
  - Export to Channel: If models cannot be fetched, the channel dialog will still open normally, prompting you to fill them in manually, rather than interrupting the process due to automatic loading failure.
  - Account Cookie Import: Now distinguishes between reasons like "current site has no readable cookies," "missing cookie permission," and "read failure." When permissions are missing, a prompt will appear in the account dialog, with a direct link to the permission settings page.
  - Channel Management: The channel list now defaults to displaying the most recent records first, making newly created or recently added channels easier to find.
  - Automatic Check-in: Accounts with the `Skipped` status will be moved to the end, making it easier to see frequently used and pending accounts.
  - Operation Prompts: For some operations where the server does not return a prompt message, local success prompts will be added to avoid a lack of feedback after clicking.
  - Multi-language: Restored some missing translations and continued to improve interface copy and error messages in multiple places.
- **Bug Fixes:**
  - Mobile Browser Compatibility: When the browser does not allow creating temporary windows, the process will automatically continue in a tab, reducing instances of clicks having no effect.
  - Sub2API: When creating keys, it is now mandatory to explicitly select a group, preventing the creation of API keys with invalid groups.
  - Page Layout: Fixed the z-index conflict between the channel table operation column and the sidebar mask on the settings page.
  - Changelog Popup: Fixed issues where bottom buttons were easily pushed out or displayed chaotically on small screens.

**Location Hints:**
- Account Advanced Filtering: In the filtering area at the top of the list in "Settings → Account Management".
- Account Key Fallback Loading Models: In "Settings → Model List", after selecting a single account as the data source, if loading fails, you can continue the operation in the error prompt area.
- `CLIProxyAPI` Connection Detection: In "Settings → CLIProxyAPI Settings".
- Hosted Site Channel Import Prompts / Deduplication Verification / Model Preload Failure Prompts: In "Settings → Key Management" or related "Import to Channel" / "New Channel" dialogs.

## 3.30.0
- **New Features:**
  - Channel Management: Added `Channel Migration`, supporting previewing the migration before migrating the current filter results or selected channels to other hosted sites.
  - Hosted Sites:
    - You can now switch the current hosted site type directly in "Settings → Self-Hosted Site Management".
    - `Done Hub` / `Veloera` now support reading real channel keys.
  - CC Switch Export: Added `OpenCode` / `OpenClaw` types.
  - Multi-language: Added Japanese and Traditional Chinese (`zh-TW`) interface languages.
- **Experience Optimizations:**
  - First Use and Interface:
    - Welcome / Permission Guide popups now support direct language selection.
    - Added quick theme and language switching at the top of the settings page.
  - API Verification: Saved `API Credentials` and model verification will now retain the last probe result and timestamp.
  - Resource Usage: Some settings pages, extension popups, and views now use on-demand loading, reducing unnecessary initialization and resource consumption.
- **Bug Fixes:**
  - WebDAV: Compatible with scenarios where Nutstore returns `409 AncestorsNotFound`. These cases will be treated as "remote backup does not exist," reducing false failure reports during initial synchronization or with empty directories.

**Location Hints:**
- Hosted Site Type Switching: In "Settings → Self-Hosted Site Management".
- Channel Migration: In the `Channel Migration` at the top of the "Settings → Channel Management" page.
- CC Switch Export: In the export entry points of "Settings → Key Management" or "Settings → API Credentials".
- Quick Theme / Language Control: On the top right of the settings page; initial language selection will appear in the welcome/permission guide popup when the extension is first opened.
- Last API Verification Result: Can be viewed in relevant verification dialogs and supported `API Credentials` / model verification interfaces.

## 3.29.0
- **New Features:**
  - Automatic Check-in: Added `Batch Open Manual Check-in Pages`, allowing you to open the manual check-in pages for failed accounts all at once, displaying progress, completion, and partial failure prompts. Holding `Shift` while clicking will open them in new windows.
  - Feedback and Support: Added a `Feedback` menu in the extension popup and a `Community Communication Group` entry in the "About" page, which directly links to the community summary page for WeChat group QR codes, Telegram groups, and other communication channels.
- **Experience Optimizations:**
  - Browser Language: Improved compatibility with browser language environments like Traditional Chinese and adjusted the default language fallback logic for more stable language recognition on first launch.
  - Documentation Links: Optimized multi-language document jump rules. Unsupported language environments will now automatically fall back to English documentation, reducing instances of jumping to incorrect language pages.
  - Multi-language: Unified some translation retrieval methods and cleaned up some unused copy to improve the multi-language experience.
- **Bug Fixes:**
  - Sidebar: Fixed an occasional issue where the sidebar could not be opened after clicking the toolbar in Chrome/Edge (MV3).
  - Key Management: When viewing masked keys, a loading state is now displayed, supporting the parsing and display of the complete key. It will not re-request when expanded again.
  - Browser Background: Temporary pages are now cleaned up more promptly when the extension is suspended, reducing issues with temporary page residue.

**Location Hints:**
- Batch Manual Check-in: In the relevant operations for failed accounts on the "Settings → Automatic Check-in" page.
- Community Entry: In the `Feedback` menu in the top right of the extension popup, and in the `Feedback and Support` section of "Settings → About".
- Key Display: In the "Settings → Key Management" key list, click the show/hide button.

## 3.28.0
- **New Features:**
  - API Credentials: Added `Verify CLI Compatibility` operation. During verification, it supports automatic retrieval or manual input of model IDs and clearly indicates if a temporary `API Type` override is currently in use, preventing misinterpretation of one-time test results as saved configurations.
  - API Credentials / Model List: You can now jump from `API Credentials` to the corresponding `Model List` data source with one click. The `Model List` also supports directly using API credentials as a data source to view model directories and verification results without needing to create a site account first.
  - Key Management: `Key Management` now displays hosted site channel status, matching signals, and jumpable entry points. When saving keys to `API Credentials`, clearer names are generated, making future lookup and reuse easier.
  - New API Hosted Sites: Added login auxiliary information (username, password, optional TOTP) and session verification in hosted site configurations. When status verification or reading real channel keys is required, it can be completed directly within the extension.
  - Hosted Site Matching: Channel identification is now based on a comprehensive ranking of `URL`, keys, and models. For scenarios where the backend only returns masked tokens, channel status judgment, copying, and integration operations can still be completed.
  - First Use: The Welcome / Permission Guide popup now includes a language selector, allowing you to switch the interface language upon first opening and remember your subsequent preferences.
- **Experience Optimizations:**
  - Veloera: For scenarios where channel localization and status detection based on `Base URL` are not currently supported, relevant entries will be automatically hidden or disabled with explanations, reducing confusion from clicking and getting no results.
- **Bug Fixes:**
  - Language: Fixed an issue where the browser's detected language was not consistently followed on startup, and synchronized corrections for interface copy and date/time localization.
  - Permission Guide: Optimized the button layout of the permission explanation popup, making it neater and easier to click on small windows or when buttons wrap.

**Location Hints:**
- API Credentials: In "Settings → API Credentials", you can use operations like `Verify CLI Compatibility` and `Open in Model Management`.
- Model List Data Source: In the data source selection area at the top of "Settings → Model List", you can switch to `API Credentials`.
- Hosted Site Channel Status: View the hosted site status and matching prompts for each key in "Settings → Key Management".
- New API Hosted Site Login Auxiliary: In "Settings → Self-Hosted Site Management" under the `New API Integration Settings` area.
- Initial Language Selection: In the welcome/permission guide popup that appears when the extension is first opened.

## 3.27.0
- **New Features:**
  - Account Management: Added filtering by enabled status to the account list, allowing quick switching between `Enabled` / `Disabled` accounts for easier batch management of invalid accounts.
  - Feedback and Support: Added a `Feedback` quick entry in the extension popup title bar, and a `Feedback and Support` section in the "About" page, which directly opens GitHub for issue reporting, feature suggestions, and discussions.
- **Experience Optimizations:**
  - Account Display: When multiple accounts have the same site name, the username will now be automatically appended as `Site Name · Username`, making them easier to distinguish in lists, search results, selectors, and statistics views.
- **Bug Fixes:**
  - Sidebar: Further optimized sidebar detection support. When the browser or mobile environment does not support sidebars, invalid entries will be automatically hidden or fall back to the settings page, reducing instances of clicks having no effect.

**Location Hints:**
- Account Status Filtering: In the filtering area at the top of the list in "Settings → Account Management".
- Feedback Entry: In the `Feedback` button in the extension popup title bar, and in the `Feedback and Support` section of "Settings → About".

## 3.26.0
- **New Features:**
  - Account Management: Added `Locate Corresponding Channel` quick operation, allowing one-click navigation from a hosted site account to the corresponding "Channel Management" list with filters applied. It also supports enabling "Remind before adding duplicate accounts" to reduce accidental additions of duplicates.
  - Duplicate Account Cleanup: Added a `Duplicate Account Cleanup` tool that can scan and delete duplicates by URL source site + user ID, making batch cleanup of duplicate accounts easier.
  - Account Management: The operation menu for disabled accounts now includes a direct delete entry, streamlining the process of cleaning up invalid accounts.
  - API Credentials: The `API Credentials` page now supports direct access from the settings navigation and the extension popup. Exported configurations will also retain token remarks, facilitating migration between different tools.
  - WebDAV: Added synchronization data selection, allowing you to selectively sync shared data like `Accounts`, `Bookmarks`, `API Credentials`, etc., reducing unnecessary overwrites between multiple devices.
  - Sub2API: Added key management support for `Sub2API` accounts, allowing direct viewing, creation, editing, and deletion of keys.
  - CLIProxyAPI: Added Provider type selection during import and automatically standardizes common endpoint addresses, reducing the need for manual URL modifications.
- **Experience Optimizations:**
  - Redemption Assistant: After successful redemption, the account balance will be automatically refreshed, reducing the need for manual refreshes to confirm results.
- **Bug Fixes:**
  - Automatic Check-in: Fixed-time check-ins now have a more stable retry mechanism to reduce missed check-ins due to missed execution windows caused by extension updates or other factors.
  - Automatic Recognition: Fixed an issue where custom check-in configurations might be lost after account re-recognition, preventing accidental configuration loss.
  - Automatic Check-in: Fixed an issue where Turnstile assistance or manual check-in prompts incorrectly used `External Check-in URL` for some accounts. It now always opens the site's default check-in page, reducing instances of jumping to the wrong page or failing to complete check-in.
  - Hosted Sites: When importing or synchronizing data to hosted sites, the target site's default group will be prioritized, reducing anomalies caused by group mismatches.

::: warning Note
- WebDAV's `Synchronize Data Selection` and device-local settings like automatic account refresh will no longer overwrite each other across devices via WebDAV.
:::

**Location Hints:**
- Duplicate Account Reminder: In "Settings → Basic Settings → Account Management" under `Remind before adding duplicate accounts`.
- Duplicate Account Cleanup: In the toolbar of the "Settings → Account Management" page.
- Locate Channel: In the operation menu for a single account in "Settings → Account Management".
- API Credentials: In "Settings → API Credentials"; the extension popup can also switch to the `API Credentials` view.
- WebDAV Synchronize Data Selection: In "Settings → Import/Export" under `WebDAV Settings`.

## 3.25.0
- **New Features:**
  - Automatic Check-in: Supports Cloudflare Turnstile (anti-bot/human verification) scenarios. When a site requires Turnstile verification, it will attempt to complete the verification on a temporary page before proceeding with the check-in, and provide a manually openable check-in link and prompts when necessary.
  - CC Switch: When exporting to `Codex`, the default value for the base address will be automatically appended with `/v1` (if the interface address has not been manually modified), reducing issues with unusable interfaces after direct import.
  - Model Redirect: Added an optional switch `Clean up invalid redirect targets after sync`. This will automatically delete mappings in `model_mapping` that point to non-existent models after model synchronization refresh (a dangerous operation, off by default).
- **Experience Optimizations:**
  - Temporary Windows: More accurately identifies challenge/login pages, reducing misjudgments and unnecessary interruptions.
- **Bug Fixes:**
  - Cookie Authentication: Corrected copy to align with current actual behavior and capabilities, reducing misguidance.
  - Sidebar: Fixed an issue where the sidebar could not be scrolled to see bottom menu items on small windows.

**Location Hints:**
- Turnstile Verification: View new prompts in the execution results of "Settings → Automatic Check-in".
- CC Switch Export: In "Settings → Key Management", select a key and click `Export to CC Switch`, then select `Codex` as the target application.
- Model Redirect Cleanup: In "Settings → Basic Settings → Model Redirect", enable `Clean up invalid redirect targets after sync`.

## 3.24.0
- **New Features:**
  - Changelog: The plugin will no longer automatically open a new tab in the browser after an update. Instead, when you first open the plugin interface, a popup will display the update content within the plugin, with an option to open the full changelog.
  - LDOH: Added a `View in LDOH` (LDOH icon) quick entry to the account list, which directly jumps to LDOH and automatically filters to the corresponding site. When adding an account, an `Open LDOH Site List` entry is also provided to help find sites.
- **Experience Optimizations:**
  - Documentation Links: When opening documentation/changelogs from the plugin, it will automatically jump to the corresponding language version based on the current plugin language.

**Location Hints:**
- Changelog Switch: In "Settings → General → Changelog" under `Automatically display update content after update`.
- Changelog Popup: After updating the plugin, it will automatically pop up the first time you open the "Extension Popup / Settings Page / Sidebar" (once per version).
- LDOH Quick Entry: To the right of the site name in the account list in "Account Management" (LDOH icon, prompt `View in LDOH`); you can also click `Open LDOH Site List` in the add account dialog.

## 3.23.0
- **New Features:**
  - Automatic Check-in: Added `Quick Check-in` to the account operation menu, allowing immediate execution of a check-in for a single account and refreshing its status upon completion.
  - Key Management: Added an `All Accounts` view, aggregating keys by account group for easier cross-account searching and copying.
  - Model Redirect: Added a `Clear Model Redirect Mappings` batch operation, allowing you to select by channel and confirm a quick reset of `model_mapping` (irreversible).
- **Experience Optimizations:**
  - New API Channel Management: URLs in the channel list are now clickable and search experience has been optimized.
- **Bug Fixes:**
  - Channel Management: Fixed an issue with inaccurate prompt copy for `Priority` in the channel dialog.
  - Model Redirect: Automatic mapping generation now includes a "version guard" to prevent cross-version mismatches.
  - Sidebar: When the runtime environment does not support sidebars, it will automatically fall back to opening the popup/settings page, preventing clicks with no response.

## 3.22.0
- **New Features:**
  - Model List: Added a "Model to Key Mapping" tool (key icon) to check if available keys exist for the current model. If no available keys are found, you can create a default key with one click based on the model's available groups, or enter a custom creation process, with support for one-click key copying.
  - Share Snapshot: Supports one-click sharing of "Overview Snapshot / Account Snapshot". It prioritizes copying the image to the clipboard, and automatically downloads a PNG if that's not supported. Snapshots only contain shareable information (no sensitive fields like `API Key`) and allow one-click copying of the title text.
- **Experience Optimizations:**
  - Disabled Accounts: Automatic refreshes and scheduled tasks for "Balance History / Usage Analysis / Usage Sync" will now automatically skip disabled accounts, reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed an issue where the spinner was not visible on buttons in a "loading" state that also displayed a left-side icon.

**Location Hints:**
- Model to Key Mapping: In "Settings → Model List", click the key icon ( `Model to Key Mapping` ) to the right of the model name.
- Share Overview Snapshot: In the button ( `Share Overview Snapshot` ) on the right side of the title bar of the overview page in the extension popup.
- Share Account Snapshot: In the operation menu for a single account in "Settings → Account Management" ( `Share Account Snapshot` ).

## 3.21.0
- **New Features:**
  - API Credentials: Added an "API Credentials" page suitable for scenarios where you only have a `Base URL` + `API Key` without an account. It supports unified management of tags/remarks, and allows direct availability verification and quick export (e.g., to Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added multi-account views (Overview / Account Distribution / Trends) and a unified "Account Summary" table for quick comparison and summary statistics.
  - Self-Hosted Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for use in "Channel Management", "Model Sync", and other functions.
- **Experience Optimizations:**
  - Right-Click Menu: "Redemption Assistant" and "AI API Detection" entries can now be enabled/disabled separately. Changes take effect immediately after switching.
  - Copy Key: When an account has no key, the popup provides an entry for "Quickly Create Default Key / Create Custom Key", reducing the need to navigate back and forth.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Done Hub` and fill in "Done Hub Integration Settings".
- Right-Click Menu Entry Switch: In "Settings → Basic Settings → Check-in and Redemption / AI API Testing", under "Show in Browser Right-Click Menu" respectively.
- Copy Key Popup: Opened by clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown option when adding a new key now displays both the group ID and description, making it easier to distinguish and select among multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" is now disabled. If you wish to automatically generate a default key after adding an account, please enable it manually in the settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add Key", and view it in the group dropdown option.
- Auto-Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Hosted Site Management: Added `Octopus` hosted site support, allowing connection to the Octopus backend and importing account API keys as channels in "Channel Management", with support for fetching available model lists.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default), and a one-click option "Ensure at least one key" to automatically complete default keys for accounts missing them.
  - AI API Testing: "Model List Probing" for interface verification now supports interface types like OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and provides suggested available model IDs, reducing manual guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account recognition logic to improve stability in multi-account scenarios for the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-related interfaces to reduce errors or triggered site rate limits due to frequent refreshes.
  - Channel Management: Improved duplicate detection when creating channels and added confirmation prompts to prevent accidental creation of duplicate routes.
- **Bug Fixes:**
  - Disable Accounts: Disabled accounts are now automatically filtered out from dropdowns/lists in Key Management and related sections, preventing invalid operations.
  - Language: Fixed an issue where the extension's language setting might affect the webpage's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Auto-Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Complete Default Key: In "Settings → Key Management", at the top right, "Ensure at least one key".
- AI API Testing Entry: Right-click menu "Quickly test AI API functionality".

## 3.18.0
- **New Features:**
  - Balance History: Charts now support switching between "Currency Units" (`USD` / `CNY`) and display currency symbols on axes/tooltips. When `CNY` is selected, it will be converted based on the account's "Recharge Amount Ratio" for easier trend viewing and reconciliation by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are too many tag/account options, it now defaults to "Expand to display," making browsing and selection more intuitive.
  - Tabs: Added left and right scroll buttons to the "Settings" group tabs and "Model List" vendor tabs, making switching easier in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Automatic Recognition" is now more accurate, fixing the frequent occurrence of unknown site types in recent versions.

**Location Hints:**
- Balance History Currency Unit: In "Settings → Balance History", in the filter area, "Currency Unit".
- Account Exchange Rate (Recharge Amount Ratio): In "Settings → Account Management" add/edit account form, "Recharge Amount Ratio".

## 3.17.0
- **New Features:**
  - Balance History: Added "Balance History" feature (off by default), which records daily balance and income/expenditure snapshots, viewable in charts for trends. Supports filtering by tag/account and time range, with convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added settings to control enabling, retention days, and "End-of-Day Fetch". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-Day Fetch," the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar on small screens/narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed responsive display issues in the export area on some screen sizes.
  - Popups: Fixed layout anomalies where the scrollbar position in popups was incorrect.

**Location Hints:**
- Balance History Switch/Retention Days/End-of-Day Fetch: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added Sub2API site type, supporting balance/quota queries. Supports reading login state via "Automatic Recognition" from the console. Also supports the "Plugin Hosted Session (Multi-account, Recommended)" mode, which allows independent authentication renewal for each account, improving the experience for multiple accounts on the same site.
  - Display Settings: Added a "Show Today's Income/Expenses" switch (on by default), which hides and stops fetching statistics like "today's consumption/income," reducing log fetching requests during refreshes.
- **Note:**
  - Sub2API currently does not support site check-in, daily usage, or income-related functions; it only provides basic balance/quota queries. Related functions will be gradually improved based on site capabilities.
  - "Plugin Hosted Session (Multi-account)" saves `refresh_token` as account-private credentials and will be included in exports/WebDAV backups. Please keep your backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Addition/Mode Explanation: In "Settings → Account Management", add/edit an account, select Sub2API as the site type; for more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved background Service Worker stability, reducing instances where asynchronous timed tasks (WebDAV auto-sync / usage sync / model sync / auto check-in, etc.) are missed due to premature background termination. Restored relevant timed tasks automatically after browser restart.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" for saving quick links to site consoles/documentation/management pages without needing to create a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now includes an "Account / Bookmark" switch. Bookmark data will be included in backup/restore and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "today's income" fetch requests, reducing unnecessary network calls (some sites already return `today_income` in their refresh interface).
  - Auto Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is now 30 seconds. Old configurations will be automatically corrected to a valid range after updating, and related prompts and documentation have been improved.

::: warning Important: Auto-refresh configuration will be forcibly adjusted
Due to feedback indicating that **overly short auto-refresh intervals can trigger site rate limits and place excessive load on sites**,

v3.15.0 **has forcibly modified auto-refresh configurations**:
- Auto-refresh and refresh on plugin open features have been turned off. If you still need to enable them, you must re-enable them manually.
- The minimum `Refresh Interval` is now 60 seconds, and the `Minimum Refresh Interval Protection` is now 30 seconds. If your pre-upgrade setting was below these thresholds, it will be automatically raised to the minimum value after upgrading. If your previous setting was within the new valid range, it will remain unaffected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; the top of the popup allows switching between "Account / Bookmark".
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly test AI API functionality" which opens a test panel directly on the current webpage. Supports filling/pasting `Base URL` and `API Key`, and performs basic capability probes for interfaces like OpenAI-compatible / OpenAI / Anthropic / Google (OpenAI-compatible also supports one-click model list retrieval).
  - (Optional) Automatic Detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist. When a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (off by default, and keys are not saved).
  - Automatic Check-in: The execution results list now includes more troubleshooting prompts, such as "Temporary shield bypass tab manually closed," "Invalid Access Token," and other common exceptions with suggested handling and documentation links.
- **Bug Fixes:**
  - WebDAV: Auto-sync has been migrated from timers to the browser's Alarms API, reducing the probability of missed syncs caused by background hibernation/power-saving policies.

**Location Hints:**
- AI API Test Panel: Right-click menu on any webpage, select "Quickly test AI API functionality"; automatic detection settings are in "Settings → AI API Test".
- Automatic Check-in Prompts: View in the execution results list of "Settings → Automatic Check-in".

## 3.13.0
- **New Features:**
  - Account Management: Added "Check-in Status Expired" prompt. When the "Checked in Today / Not Checked in Today" status is not from today's detection, an orange warning icon will be displayed. Clicking it will refresh the account data with one click, preventing misguidance by old status.
  - Interface: Multi-select controls have been upgraded to more compact selectors (saving space, supporting search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and check-in logic, improving usability.
  - Cookie Authentication: Removed the cookie caching mechanism, reducing anomalies caused by reading old values after cookie updates.

**Location Hints:**
- Check-in Status Expired Prompt: In the account list of "Settings → Account Management", at the check-in icon to the right of the site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code" - generates Kilo Code / Roo Code providerProfiles configurations, supporting copying `apiConfigs` snippets or downloading `settings.json` for import (import is incremental and will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long text in site names, now automatically truncated.
  - Dropdown Selectors: Improved empty state prompts and fixed overflow issues with long option text.

**Location Hints:**
- Export to Kilo Code: In "Settings → Key Management", in the key list, click the Kilo Code icon in the top right of a key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder. When a duplicate/similar channel is detected, a warning dialog will pop up, allowing you to choose to continue creation or cancel (no longer blocking creation with error toasts).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long text in site names, now automatically truncated.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will now open within the current incognito window (facilitating maintaining incognito login state).
  - Account Management: Disabled accounts also support clicking site links, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, the charts and lists will prioritize displaying the site name (instead of the username), making the information more intuitive.
  - Shield Bypass Assistant: The temporary shield bypass window now supports CAP (cap.js) Pow verification, improving pass rates.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Toast Layer: Fixed Toaster z-index issues, preventing prompts from being obscured by web pages.

**Location Hints:**
- Site Links: In "Settings → Account Management", click the site name in the account list.
- Shield Bypass Assistant: Refer to [Cloudflare Shield Bypass Assistant](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added "Manual Balance (USD)" field to accounts. When a site cannot automatically fetch balance/quota, you can manually enter it for display and statistics.
  - Account Management: Added "Exclude from Total Balance" switch for accounts, used to remove specific accounts from "Total Balance" statistics (does not affect refresh/check-in functions).
  - Settings: Added "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether console logs are output and the minimum log level, facilitating troubleshooting.
  - Automatic Check-in: After execution, relevant data will be refreshed and the interface will be synchronized.

**Location Hints:**
- Add/Edit Account: Open add/edit account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added a "Usage Analysis" page to help you visualize usage trends across multiple sites and accounts in charts, allowing you to quickly see "where you're using more / spending more / slowing down," facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (raw logs are not saved). Supports setting retention days, automatic sync methods, and minimum sync intervals, and viewing sync results and error prompts for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage", enable "Usage History Sync", set as needed, and click "Sync Now".
  - Then, view charts in "Usage Analysis" in the left menu; click "Export" when you need to retain data or reconcile.

## 3.7.0
- **New Features:**
  - Sorting: The account list now supports sorting by "Income." Priority sorting now includes "Disabled Accounts at Bottom," preventing inactive/invalid accounts from interfering with your daily use.
  - Automatic Check-in: Added "Trigger Today's Check-in Early When Opening Interface" - when opening the popup/sidebar/settings page within the time window, it will automatically attempt to run today's check-in early, without waiting for the scheduled time.
- **Bug Fixes:**
  - Automatic Check-in: Each account will only be checked in once per day. Retries are only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Automatic Check-in Early Trigger/Retry: Configure in "Automatic Check-in" in the left menu.

## 3.6.0
- **New Features:**
  - Account Management: Supports enabling/disabling accounts with one click. Disabled accounts will be skipped by all functions, allowing you to retain data after an account becomes invalid.
  - Tags: Added global tag management and synchronized related interface and interaction optimizations for easier category management of accounts.
  - Popup: Displays the current version number in the title bar and provides a direct entry to this changelog.
  - Quick Export: CC Switch export now supports selecting upstream models, making exported configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to avoid unexpected results due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Check-in" switch (moved above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from dialog title icons for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Automatic Recognition: Added a "Slow Detection" prompt and related documentation links to help users troubleshoot and resolve issues.
  - Batch Open External Check-in: Supports opening all in new windows, making batch closing easier and reducing interference.
- **Bug Fixes:**
  - Batch Open External Check-in: The process has been refactored to execute in the background service, ensuring correct opening of all sites in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to directly select upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always have the `sk-` prefix, preventing recognition/copying issues due to inconsistent formats.

## 3.3.0
- **New Features:**
  - Automatic Check-in: Added "Username" information to account recognition, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the number of individual operations.
  - Auto Refresh: The minimum refresh interval no longer has a maximum limit, allowing larger minimum intervals to be set for controlling refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce accidental triggers in non-copying scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying popup prompts, reducing invalid redemption notifications.
  - Storage: Write operations now include write locks to improve data consistency during concurrent writes.
  - Interface: Adjusted localization copy for "Copy Model Name".

## 3.2.0
- **New Features:**
  - The "Model List" page now includes an "Interface Availability Test" (Beta) for quickly confirming if the current key is usable with a specified model (e.g., text generation, tool/function calling, structured output (returning JSON structure), web search (Grounding), etc.).
  - The "Model List" page now includes a "CLI Tool Compatibility Test" (Beta) that simulates the tool calling process for Claude Code / Codex CLI / Gemini CLI to evaluate interface compatibility within these tools.
  - The "About" page now includes "Rate and Download": Automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entry points for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will now display the status code and error reason, facilitating problem localization.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Features:**
  - Added administrator credential filling guidance in self-managed API settings.
  - Redemption Assistant now supports batch redemption and single code retries.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing them to coexist normally with all functions available. This is mainly for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy, models, and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed an issue with incorrect web path redirection for manual check-ins on New-API sites.

## 2.39.0
- Automatically detects and modifies the check-in support status of account sites during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Directly select specific redemption accounts using the up/down arrow keys.
  - Press Enter to confirm redemption.
- Added prompts to temporary shield bypass tabs, explaining that the tab originates from this plugin and its purpose.
- Improved shield bypass window display: single window with multiple tabs, meaning short-term requests will reuse the same window to minimize interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added more lenient detection options for redemption code formats, correctly identifying redemption codes with custom formats and popping up the Redemption Assistant.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific channels for management.
- Fixed an issue that would reset channel model sync times.

## 2.35.1
- Fixed an issue that would reset automatic check-in execution times.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to prompt for redemption when copying any potential redemption code.
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
  - Optimized website type detection, which can now be identified by the title of temporary windows.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 2.32.0
- **New Features:**
  - Model redirects are now smarter, supporting version numbers represented by hyphens and dots.
  - Added the ability to redeem directly through the right-click menu after selecting text.
  - Automatic check-in is enabled by default, and the check-in time window has been extended.

## 2.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Check-in operations can now be quickly performed within the popup.
  - The Redemption Assistant now includes a URL whitelist feature, giving you better control over which websites can use it.

## 2.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capabilities for Cloudflare challenge pages.
  - WebDAV backups now support encryption, and recovery includes a decryption retry popup. Your WebDAV configuration will be preserved.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed an issue with website cookie interception during automatic detection.
  - Optimized the centering of blank status content in Firefox.
  - Migrated the Switch component to a custom implementation for improved compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced the "Hosted Site" service, laying the groundwork for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" in settings to "Hosted Site" for clarity.
- **Bug Fixes:**
  - Optimized translation text and removed redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes to help you understand specific issues.
  - Temporary window bypass feature now includes a health status indicator.
  - Optimized the description of bypassing website protections for better clarity.
  - Added a notification system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed display issues with Firefox pop-up prompts in Chinese settings.
- **Performance Optimizations:**
  - Improved the performance of the sorting function.

## 3.26.0
- **New Features:**
  - Added a model pricing cache service to speed up data loading.
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
  - Tag filters now have visibility control based on line count.
  - WebDAV connection tests now support more success status codes.
- **Bug Fixes:**
  - Removed extraneous periods from the end of JSON strings.

## 3.23.0
- **New Features:**
  - Enhanced account tagging functionality.
  - Temporary window bypass feature now supports more intelligent judgment based on error codes.

## 3.22.0
- **New Features:**
  - Account management now includes a tagging feature for classifying accounts.
  - The Redemption Assistant popup UI now supports lazy loading and fixes issues that could cause website style conflicts.
  - Added global channel filters and JSON editing mode.

## 3.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed duplicate "Checked in Today" checks from automatic check-in.
  - Simplified and fixed the temporary window capture logic.
  - Restored parsing of search parameters in URL query strings.

## 3.20.0
- **New Features:**
  - Added permission guidance upon first installation for easier understanding of required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed an issue with operation buttons overflowing in the account dialog.
  - Redemption amount conversion coefficients now use constants for improved accuracy.
  - Limited the Cookie interceptor to use only in Firefox browsers.

## 3.19.0
- **New Features:**
  - Added loading status and prompts during the redemption process.
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
  - The redemption feature now supports themes and optimized prompt messages.
  - Redemption prompts now include source information and links to settings.
- **Bug Fixes:**
  - Fixed path issues with Tailwind CSS files.

## 3.17.0
- **New Features:**
  - Added an automatic pop-up prompt for one-click redemption.
  - Unified the data format for import/export and WebDAV backups using a V2 versioning scheme for improved compatibility and stability.

## 3.16.0
- **New Features:**
  - Added a warning prompt when creating accounts on Firefox desktop.
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
  - When automatic check-in fails, retry and manual check-in options are now available.
  - Enhanced automatic check-in functionality, including retry strategies, skip reasons, and account snapshots.
  - Optimized the execution method for automatic check-in to use concurrency for improved efficiency.
- **Bug Fixes:**
  - Fixed the default behavior issue with the `autoCheckInEnabled` flag.

## 3.13.0
- **New Features:**
  - Added "New API Channel Management" functionality.
  - Added a "Warning" button style.
  - Introduced Radix UI components and Tanstack Table for improved interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed incorrect display and sorting of model counts in the channel table.

## 3.12.1
- **Bug Fixes:**
  - Fixed unnecessary reloading of channels when manually selecting tabs.
  - The "New API Model Sync" option is now hidden in the sidebar when the configuration is invalid.

## 3.12.0
- **New Features:**
  - "New API Model Sync" now includes an allowlist filtering feature for models.
  - The sidebar now supports collapsing/expanding with smooth animations.

## 3.11.0
- **New Features:**
  - Account management functionality has been enhanced with search and navigation optimizations.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed logical errors in automatic check-in status.

## 3.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanisms for improved communication stability.
  - Model synchronization now includes a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured that missing fields in user preferences are populated with default values.

## 3.9.0
- **New Features:**
  - Added Cloudflare challenge detection and automatic temporary window bypass attempts when encountering protection.
  - Introduced a temporary context management system.

## 3.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized the positioning and accessibility of dropdown menus in multi-select components.

## 3.8.0
- **New Features:**
  - Added fault tolerance mechanisms for partial account updates.
  - Account information can now be saved even if data retrieval fails during manual account addition.
  - The settings page now includes a "Settings Section" feature, allowing settings to be reset by section.

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
  - User preferences like `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now mandatory to ensure completeness of default configurations.
- **Bug Fixes:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed the issue of missing "New API Preferences" in configuration checks.
  - Corrected the sorting logic for check-in requirements.
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
  - Fixed Base64 encoding issues when generating CherryStudio URLs.
  - Removed redundant account fetching and token verification from the channel dialog for improved efficiency.

## 3.4.1
- **Bug Fixes:**
  - Ensured that the settings page always opens in a new tab.

## 3.4.0
- **New Features:**
  - The auto-import feature now integrates the "New API Channel" dialog.
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
  - Removed the `isDetected` check for the auto-configuration button.
  - Ensured that the account detection correctly refreshes when displayed data changes.
  - Fixed an issue where Access Tokens were no longer required for Cookie authentication types.

## 3.2.0
- **New Features:**
  - The Automatic Check-in feature now includes a results/history interface and optimized default settings and user experience.
  - Implemented daily site automatic check-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case sensitivity issues in automatic check-in status detection.
  - Handled edge cases in check-in time window calculations.

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
  - Implemented the initial service, backend logic, and settings interface for "New API Model Sync".
- **Bug Fixes:**
  - Row retry operations now only update the target and progress UI.
  - Updated channel list response handling and types.

## 1.38.0
- **New Features:**
  - Accounts with custom check-in or redemption URLs set can now be pinned.
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
  - After check-in, you can choose whether to automatically open the redemption page.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - The check-in icon has been updated to a "Yen" icon for better clarity.
- **Bug Fixes:**
  - Custom check-in accounts now have their check-in status reset daily.
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
  - Improved the layout and responsiveness of the account management interface.
  - Added configurable React DevTools auto-plugin and caching.
- **Bug Fixes:**
  - Fixed the `z-index` issue of the mobile sidebar overlay.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Added a "Create Account" button to account management and optimized the layout.
  - Added "Usage Logs" functionality to account management.
  - Sorting priority settings now support drag-and-drop auto-saving, removing the manual save button.
- **Bug Fixes:**
  - Updated the size and accessibility labels for SiteInfo icon buttons.

## 1.30.0
- **New Features:**
  - Replaced the dialog component with a custom `Modal` component for improved consistency.
  - Introduced a comprehensive set of UI components for enhanced interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priorities.
  - Optimized the transparency and layering of the mobile sidebar overlay for a better user experience.

## 1.29.0
- **New Features:**
  - Popups now support detection and automatic closing.
  - Popups now feature responsive mobile layouts to avoid the need for zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent automatic detection functionality.
  - Migrated `chrome.*` APIs to `browser.*` APIs for enhanced cross-browser compatibility and optimized error handling.
  - Fully ensured functional compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed `tabId` parsing issues after window creation.
  - Prevented rotation animations on button borders during refresh.

## 1.27.0
- **New Features:**
  - After successful automatic configuration to New API, the account dialog will automatically close.
  - Implemented dynamic loading of localization resources for improved internationalization support.
- **Bug Fixes:**
  - Added internationalization support for error messages.
  - Fixed syntax errors in currency switching templates between Chinese and English.

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
  - Fixed the issue where a success message was still displayed when refreshing without any accounts.

## 1.22.0
- **New Features:**
  - Accounts now include a "Today's Total Income" field and an income display interface.
  - Supports redemption code recharge types.
- **Bug Fixes:**
  - Fixed rendering logic for custom URL check-in interfaces.
  - Corrected check-in field names and return structures.

## 1.21.0
- **New Features:**
  - Added favicon and extension icons for popup, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and popup operations.
  - Migrated the underlying framework from Plasmo to WXT, offering better performance and development experience.

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
  - Accounts now include a custom check-in button (with a Yen icon).
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting functionality now includes custom check-in URLs as sorting conditions.
- **Bug Fixes:**
  - Fixed an issue where custom check-in URLs were not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication types.
  - Added an "No Authentication" type to API authentication options.
  - Migrated the tooltip component to the `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" functionality now supports automatic account configuration.
  - Site accounts now support check-in functionality.
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
  - Added user group data transformation and API integration.
  - Implemented model retrieval functionality for OneHub sites.

## 1.8.0
- **New Features:**
  - Account management now supports site type.
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
  - Optimized the rendering method for the model list to improve loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed an issue where the status of detected accounts was reset when no existing accounts were found.

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
  - Introduced sidebar functionality, replacing popup-based automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized the account recognition process, now supporting automatic access key creation.
  - The account list now includes sortable headers, a copy key dialog, and hover action buttons.
  - Account management now includes a remarks field.
  - Website names are now clickable for navigation.
  - Model lists support group selection.
  - Popup pages now feature digital rolling animations and site status indicators.
  - Optimized the add/edit account dialog, including recharge ratio settings and automatic site name extraction.
  - Fully implemented the settings page system, supporting persistent user preferences and automatic refresh.
  - Enhanced the frontend interface and backend service for automatic refresh functionality.
  - Added the `sk-` prefix automatically when copying keys.
  - Introduced industry-standard tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Added support for more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - The popup interface has been refactored to an API manager style, with the addition of displaying today's total consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed issues with incompatible model data formats, `localStorage` access, and API request credentials.
  - Corrected API authentication methods.
  - Optimized URL input processing and auto-refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**