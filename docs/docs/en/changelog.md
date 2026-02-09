# Changelog

This page records major updates for general users (feature changes / experience optimizations / bug fixes). For the complete version history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip New Users Start Here
- **How to check your current version**: Open the extension pop-up, and the version number will be displayed in the title bar; you can also view it on the Settings page.
- **How to stop this page from opening automatically**: You can control whether to "Automatically open changelog after update" in "Settings → General → Changelog".
- **Troubleshooting**: You can enable console logs in "Settings → General → Logs" and attach the reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.18.0
- **New Feature:**
  - Balance History: The chart now includes a "Currency Unit" toggle (`USD` / `CNY`) and displays the currency symbol on the axis/tooltip; when `CNY` is selected, conversion is performed based on the account's "Recharge Amount Ratio" to facilitate viewing trends and reconciliation by monetary value.
- **Experience Optimization:**
  - Tag Filtering: When there are too many tag/account options, the default view is changed to "Expand Display" for more intuitive browsing and selection.
  - Tabs: Added left/right scroll buttons to the "Settings" group tabs and the "Model List" vendor tabs, making switching easier in narrow windows.
- **Bug Fix:**
  - Account Management: Site type "Auto Detect" is more accurate, fixing the frequent issue of unknown site types in recent versions.

**Location Tips:**
- Balance History Currency Unit: In the filter area "Currency Unit" on the "Settings → Balance History" page.
- Account Exchange Rate (Recharge Amount Ratio): In the "Recharge Amount Ratio" field of the Add/Edit Account form under "Settings → Account Management".

## 3.17.0
- **New Feature:**
  - Balance History: Added the "Balance History" feature (off by default), which records daily balance and income/expense snapshots and displays trends in a chart; supports filtering by tag/account and time range, and provides convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added settings to control enablement, retention days, and "End-of-Day Fetch". Note: If you disable "Show Today's Income/Expense" and do not enable "End-of-Day Fetch", the "Daily Income/Expense" chart will have no data.
- **Experience Optimization:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar on small screens/narrow windows.
- **Bug Fix:**
  - Import/Export: Fixed responsive display issues in the export area on some screen sizes.
  - Pop-up: Fixed layout anomalies where the pop-up scrollbar position was incorrect.

**Location Tips:**
- Balance History Switch/Retention Days/End-of-Day Fetch: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Feature:**
  - Sub2API (JWT Site): Added Sub2API site type, supporting balance/quota query; supports reading console login status via "Auto Detect"; and supports the "Plugin Managed Session (Multi-Account, Recommended)" mode, which can renew authentication independently for each account, improving the multi-account experience on the same site.
  - Display Settings: Added "Show Today's Income/Expense" switch (on by default), which can hide and stop fetching statistics like "Today's Consumption/Income," reducing log fetching requests during refresh.
- **Note:**
  - Sub2API currently does not support site check-in/today's usage/income-related features, only providing basic balance/quota queries. Related features will be gradually improved based on site capabilities.
  - The "Plugin Managed Session (Multi-Account)" mode saves the `refresh_token` as a private account credential, which will be included in exports/WebDAV backups; please safeguard your backup files and WebDAV credentials.

**Location Tips:**
- Sub2API Addition/Mode Description: In "Settings → Account Management," select Sub2API as the site type when adding/editing an account; see [FAQ](./faq.md) for more detailed steps (search for "Sub2API").
- Today's Income/Expense Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fix:**
  - Chrome/Edge (MV3): Improved background Service Worker stability, reducing missed execution of asynchronous scheduled tasks (WebDAV auto-sync / usage sync / model sync / auto check-in, etc.) due to premature background termination; and automatically resumes related scheduled tasks after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Feature:**
  - Bookmark Management: Added "Bookmark Management" to save quick links for site consoles/documentation/management pages without needing to create a full account; supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting; the pop-up now includes an "Accounts / Bookmarks" toggle; bookmark data is included in backups/restores and WebDAV auto-sync.
- **Bug Fix:**
  - Account Refresh: Removed redundant "Today's Income" fetch requests, reducing unnecessary network calls (some sites already return `today_income` in the refresh interface).
  - Auto Refresh: The minimum refresh interval is 60 seconds, and the minimum refresh interval protection is 30 seconds; after the update, old configurations will be automatically corrected to the legal range, and related prompts and documentation have been improved.

::: warning Important: Auto-Refresh Configuration Will Be Forcibly Adjusted
Due to feedback indicating that **too short an auto-refresh interval easily triggers site rate limits and can cause excessive load on the site.**

v3.15.0 **forcibly modified the auto-refresh configuration**:
- Auto-refresh and refresh upon opening the plugin features have been disabled. If you still need to enable them, you must do so manually.
- `Refresh Interval` minimum is 60 seconds, `Minimum Refresh Interval Protection` minimum is 30 seconds. If your setting before the upgrade was below these thresholds, it will be automatically raised to the minimum value; if your previous setting was within the new legal range, it will remain unchanged.
:::

**Location Tips:**
- Bookmark Management: In "Settings → Bookmark Management"; the top of the pop-up can toggle between "Accounts / Bookmarks".
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Feature:**
  - Web AI API Functionality Availability Test (Beta): Added a right-click menu option "Quick Test AI API Functionality Availability," which opens the test panel directly on the current webpage; supports filling/pasting `Base URL` and `API Key`, and performs basic capability detection for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible can also pull the model list with one click).
  - (Optional) Auto Detection: Can be enabled in "Settings → AI API Test," where you can configure a URL whitelist; when a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (default is off, and the Key is not saved).
  - Auto Check-in: The execution result list now includes more troubleshooting tips—including suggestions for handling common exceptions like "temporary bypass tab manually closed" and "Access Token invalid," along with documentation links.
- **Bug Fix:**
  - WebDAV: Automatic synchronization migrated from timers to the browser's Alarms API, reducing the probability of missed synchronization due to background sleep/power-saving policies.

**Location Tips:**
- AI API Test Panel: Select "Quick Test AI API Functionality Availability" from the right-click menu on any webpage; auto-detection settings are in "Settings → AI API Test".
- Auto Check-in Tips: View in the execution result list under "Settings → Auto Check-in".

## 3.13.0
- **New Feature:**
  - Account Management: Added "Check-in Status Expired" prompt—when the "Checked In Today / Not Checked In" status was not detected today, an orange warning icon will be displayed; clicking it refreshes the account data with one click, preventing misleading old status.
  - Interface: Multi-select controls upgraded to a more compact selector (saves space, supports search, and clearer display of selected items).
- **Bug Fix:**
  - Veloera: Fixed account data refresh and check-in logic, improving availability.
  - Cookie Authentication: Removed the Cookie caching mechanism, reducing exceptions caused by reading old values after Cookie updates.

**Location Tips:**
- Check-in Status Expired Prompt: In the account list under "Settings → Account Management," next to the check-in icon on the right side of the site information.

## 3.12.0
- **New Feature:**
  - Key Management: Added "Export to Kilo Code"—generates providerProfiles configuration for Kilo Code / Roo Code, supporting copying the apiConfigs snippet or downloading the settings JSON for import (import is additive and will not clear existing providers).
- **Bug Fix:**
  - Account Management: Fixed layout overflow issues caused by long text like site names, changing to automatic truncation.
  - Dropdown Selector: Optimized empty state prompts and fixed overflow issues when option text is too long.

**Location Tips:**
- Export to Kilo Code: In the key list under "Settings → Key Management," click the Kilo Code icon in the top right corner of a specific key.

## 3.11.0
- **New Feature:**
  - New API Channel Management: Added "Duplicate Channel" reminder—when the existence of an identical/similar Channel is detected, a warning dialog pops up, allowing the user to choose to continue creation or cancel (no longer blocking creation with an error Toast).
- **Bug Fix:**
  - Account Management: Fixed layout overflow issues caused by long text like site names, changing to automatic truncation.

## 3.10.0
- **New Feature:**
  - Account Management: Clicking a site link in Incognito Mode opens it in the current incognito window (facilitating maintaining incognito login status).
  - Account Management: Disabled accounts also support clicking the site link, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, the chart and list prioritize displaying the site name (instead of the username) for more intuitive information.
  - Protection Bypass Helper: The temporary bypass window now supports CAP (cap.js) Pow verification, improving success rates.
- **Bug Fix:**
  - Redemption Helper: Prioritized reading the redemption code from the clipboard, improving trigger accuracy.
  - Prompt Overlay: Fixed Toaster layer issues, preventing prompts from being obscured by the webpage.

**Location Tips:**
- Site Link: Click the site name in the account list under "Settings → Account Management".
- Protection Bypass Helper: Refer to [Cloudflare Helper](./cloudflare-helper.md).

## 3.9.0
- **New Feature:**
  - Account Management: Added a "Manual Balance (USD)" field to accounts—when the site cannot automatically retrieve the balance/quota, this can be manually filled for display and statistics.
  - Account Management: Added an "Exclude from Total Balance" switch to accounts—used to remove specific accounts from the "Total Balance" statistics (does not affect refresh/check-in or other functions).
  - Settings: Added "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added Log settings, allowing control over whether console logs are output and the minimum log level, facilitating troubleshooting.
  - Auto Check-in: Related data is refreshed and the interface is synchronized after execution is complete.

**Location Tips:**
- Account Add/Edit: Open Add/Edit Account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Feature:**
  - Usage Analysis: Added the "Usage Analysis" page to chart usage trends across multiple sites and accounts, providing an immediate view of "where usage is high / spending is high / slowdowns," facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overview (requests, Tokens, Quota), model distribution/spending distribution, account comparison, usage time hotspots, and latency trends/histograms.
  - Usage History Sync: Added "Usage History Sync" capability, used to fetch and save "aggregated usage data" (does not save raw logs); supports setting retention days, automatic sync method, and minimum sync interval, and allows viewing the sync result and error prompt for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage" and enable "Usage History Sync," set preferences as needed, and click "Sync Now".
  - Then, go to the left menu "Usage Analysis" to view the charts; click "Export" when retention or reconciliation is needed.

## 3.7.0
- **New Feature:**
  - Sorting: The account list supports sorting by "Income"; sorting priority now includes "Disabled Accounts Sink to Bottom," preventing deactivated/invalid accounts from interfering with daily use.
  - Auto Check-in: Added "Trigger Today's Check-in Early When Interface Opens"—when the pop-up/sidebar/settings page is opened within the time window, it automatically attempts to run today's check-in once, without waiting for the scheduled time.
- **Bug Fix:**
  - Auto Check-in: The same account will only execute once per day; retries are only for failed accounts, reducing meaningless requests and repeated interruptions.
- **Location Tips:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Auto Check-in Pre-trigger/Retry: Configure in the left menu "Auto Check-in".

## 3.6.0
- **New Feature:**
  - Account Management: Supports one-click enable/disable of accounts; disabling skips the account for all functions, allowing data retention after an account expires.
  - Tags: Added global tag management, and synchronized optimization of related interfaces and interactions, facilitating categorized account management.
  - Pop-up: Displays the current version number in the title bar and provides a direct link to this changelog.
  - Quick Export: CCSwitch export supports selecting upstream models, making the export configuration closer to actual usage scenarios.

## 3.5.2
- **Bug Fix:**
  - Amount Display: Optimized the display strategy for extremely small values, preventing display discrepancies due to precision/rounding.

## 3.5.1
- **New Feature:**
  - Account Management: Adjusted the position of the "Auto Check-in" switch (moved above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from dialog box title icons for a cleaner, unified visual look.
- **Bug Fix:**
  - Key List: Fixed the issue where closing the dialog box resulted in a white screen when expanding key details.

## 3.5.0
- **New Feature:**
  - Auto Detect: Added a "Slower Detection" warning prompt and related documentation links to help users troubleshoot and resolve issues.
  - External Check-in Batch Open: Supports opening all in new windows, facilitating batch closing and reducing interference.
- **Bug Fix:**
  - External Check-in Batch Open: The process was refactored to execute in the background service, ensuring all sites can be opened correctly in pop-up scenarios.

## 3.4.0
- **New Feature:**
  - CLIProxy: Enhanced model mapping configuration, supporting direct selection of upstream models for more precise model mapping.
- **Bug Fix:**
  - API: Ensured access keys always start with the `sk-` prefix, preventing identification/copying issues due to inconsistent formatting.

## 3.3.0
- **New Feature:**
  - Auto Check-in: Account identification now includes "Username" information, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing step-by-step operations.
  - Auto Refresh: The minimum refresh interval no longer limits the maximum value, allowing for a larger minimum interval to control refresh frequency.
- **Bug Fix:**
  - Clipboard Reading: Tightened trigger conditions to reduce false triggers in non-copy scenarios.
  - Redemption Helper: Validated all redemption codes before the pop-up prompt, reducing invalid redemption prompts.
  - Storage: Added write locks to write operations to improve data consistency during concurrent writes.
  - Interface: Adjusted the localization text related to "Copy Model Name".

## 3.2.0
- **New Feature:**
  - The "Model List" page added "API Availability Detection" (Beta), used to quickly confirm whether the current key is available for specified models (e.g., text generation, tool/function calling, structured output (return as JSON structure), web search (Grounding) and other detection items).
  - The "Model List" page added "CLI Tool Compatibility Detection" (Beta), simulating the tool calling process of Claude Code / Codex CLI / Gemini CLI to evaluate interface compatibility within these tools.
  - The "About" page added "Rating and Download": Automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entry for other stores.
- **Bug Fix:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating troubleshooting.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed, preventing duplicate opening.

## 3.1.1
- **Bug Fix:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Feature:**
  - Added administrator credential filling guidance in the self-managed API settings.
  - Redemption Helper supports batch redemption and single-code retry.

## 3.0.0
- **New Feature:**
  - Supports normal coexistence and full functionality for multiple cookie authenticated accounts on a single site, primarily for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy, model, and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic; the two no longer affect each other.
- **Bug Fix:**
  - Fixed the incorrect web page path for manual check-in on New-API sites.

## 2.39.0
- Added automatic detection and modification of account site check-in support status during account data refresh.
- Automatically opens the changelog page and navigates to the corresponding version anchor point upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Helper:
  - Select specific redemption accounts directly using the keyboard up/down keys.
  - Press Enter to confirm redemption.
- Added a prompt to the temporary protection bypass tab, explaining that the current tab is from this plugin and its specific purpose.
- Better protection bypass window display method: single window with multiple tabs, meaning short-term requests will reuse the same window, minimizing interference.
- Supports check-in status detection and auto check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API Channel Management.
- More lenient redemption code format detection support; when encountering custom redemption code formats, the redemption code can be correctly identified, and the Redemption Helper will pop up.
- Fixed some known issues.

## 2.36.0
- Supports quick jump to specific Channels for management.
- Fixed the issue where Channel model sync time was reset.

## 2.35.1
- Fixed the issue where the auto check-in execution time was reset.
- UI optimization.

## 2.35.0
- Added optional clipboard read permission to prompt for redemption when any possible redemption code is copied.
- Added cdk.linux.do to the Redemption Helper default URL whitelist.

## 2.34.0
- **New Feature:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the pop-up or the sidebar.
- **Bug Fix:**
  - Fixed an internal error during account ID comparison.
  - Ensured all temporary contexts are correctly closed.

## 2.33.0
- **New Feature:**
  - Added "Temporary Context Mode" to bypass website protection more effectively.
  - API error messages now support internationalization.
  - Optimized website type detection, now identifiable via the temporary window title.
  - Added optional permission status tracking.
- **Bug Fix:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 2.32.0
- **New Feature:**
  - Model redirection is now smarter, supporting version numbers indicated by hyphens and dots.
  - Added the ability to redeem directly via the right-click menu after selecting text.
  - Auto check-in feature is enabled by default, and the check-in time window has been extended.

## 2.31.0
- **New Feature:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Check-in operation can now be performed quickly in the pop-up.
  - Redemption Helper added a URL whitelist feature, allowing better control over which websites can use the Redemption Helper.

## 2.30.0
- **New Feature:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capability for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, and added a decryption retry pop-up during restoration, while retaining your WebDAV configuration.

## 2.29.0
- **New Feature:**
  - Integrated Claude Code Router.
- **Bug Fix:**
  - Fixed website Cookie interception issue during auto-detection.
  - Optimized centering of blank state content in Firefox.
  - Migrated the Switch component to a custom implementation, improving compatibility and stability.

## 2.28.0
- **New Feature:**
  - Introduced "Managed Site" service, laying the foundation for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" to "Managed Site" in settings for clarity.
- **Bug Fix:**
  - Optimized translated text, removing redundant fallback strings.

## 2.27.0
- **New Feature:**
  - Account health status now includes more detailed codes, allowing you to understand specific issues.
  - Temporary window bypass feature added a health status indicator.
  - Optimized the description of bypassing website protection for better clarity.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fix:**
  - Ensured consistency in token selection strategy.
  - Fixed display issues with Firefox pop-up prompts in Chinese settings.
- **Performance Optimization:**
  - Improved sorting function performance.

## 2.26.0
- **New Feature:**
  - Added model pricing caching service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Now supports displaying model pricing information for multiple accounts simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable select component to improve selection efficiency.
- **Bug Fix:**
  - Added a customizable loading animation (spinner) property to the button component.

## 2.25.0
- **New Feature:**
  - Added a novice guide card when the account list is empty.
  - Related UI elements are automatically hidden when pinning/manual sorting features are disabled.
  - You can now manually drag and drop to sort the account list.
- **Bug Fix:**
  - Fixed the issue where the tag array could be empty when updating an account.

## 2.24.0
- **New Feature:**
  - Updated application description and About page content.
  - Extension name now includes a subtitle.
  - Tag filter added visibility control based on the number of rows.
  - WebDAV connection test now supports more successful status codes.
- **Bug Fix:**
  - Removed the extra period at the end of JSON strings.

## 2.23.0
- **New Feature:**
  - Enhanced account tagging functionality.
  - Temporary window bypass feature now supports smarter judgment based on error codes.

## 2.22.0
- **New Feature:**
  - Account Management added tagging functionality to facilitate account classification.
  - Redemption Helper pop-up UI now supports lazy loading and fixed issues that could cause website style corruption.
  - Added global Channel filter and JSON editing mode.

## 2.21.0
- **New Feature:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fix:**
  - Removed redundant "Checked In Today" check in auto check-in.
  - Simplified and fixed the temporary window fetching logic.
  - Restored the parsing of search parameters in URL query strings.

## 2.20.0
- **New Feature:**
  - Added permission guidance upon first installation, helping users understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fix:**
  - Fixed overflow issue with action buttons in the account dialog.
  - Redemption amount conversion coefficient now uses constants to improve accuracy.
  - Restricted the Cookie interceptor to only be used in the Firefox browser.

## 2.19.0
- **New Feature:**
  - Added loading status and prompt information during the redemption process.
  - Removed the clipboard reading function from the Redemption Helper.
- **Bug Fix:**
  - Supplemented missing background error message translations.
  - Prevented concurrent service initialization and race conditions, improving stability.
  - Resolved intermittent "could not establish connection" errors.
  - Prevented race conditions during temporary window pool destruction.

## 2.18.0
- **New Feature:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Helper feature.
  - Firefox browser now supports WebRequest-based Cookie injection mechanism.
  - Redemption feature now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and a settings link.
- **Bug Fix:**
  - Fixed path issues for Tailwind CSS files.

## 2.17.0
- **New Feature:**
  - Added automatic pop-up prompt feature for one-click redemption.
  - Unified data format for Import/Export and WebDAV backup, adopting V2 versioning scheme to improve compatibility and stability.

## 2.16.0
- **New Feature:**
  - Added a warning prompt when creating an account in Firefox desktop version.
  - API model synchronization now supports a Channel filtering system.

## 2.15.0
- **New Feature:**
  - MultiSelect component now supports comma-separated string parsing.
- **Bug Fix:**
  - Ensured caching only occurs during complete Channel data synchronization.
- **Performance Optimization:**
  - Optimized upstream model caching logic.

## 2.14.0
- **New Feature:**
  - Site metadata is automatically detected during refresh.
  - Added retry and manual check-in options when auto check-in fails.
  - Enhanced auto check-in feature, including retry strategy, skip reasons, and account snapshots.
  - Optimized auto check-in execution method, changing to concurrent processing to improve efficiency.
- **Bug Fix:**
  - Fixed default behavior issue with the `autoCheckInEnabled` flag.

## 2.13.0
- **New Feature:**
  - Added "New API Channel Management" feature.
  - Added "Warning" button style.
  - Introduced Radix UI components and Tanstack Table, improving interface aesthetics and functionality.
- **Bug Fix:**
  - Fixed incorrect model count display and sorting in the Channel table.

## 2.12.1
- **Bug Fix:**
  - Fixed unnecessary Channel reloading when manually selecting tabs.
  - Sidebar hides the "New API Model Sync" option when configuration is invalid.

## 2.12.0
- **New Feature:**
  - "New API Model Sync" added model allow list filtering functionality.
  - Sidebar now supports collapsing/expanding with smooth animation effects.

## 2.11.0
- **New Feature:**
  - Account Management functionality enhanced, adding search and navigation optimization.
  - Added CC Switch export functionality.
- **Bug Fix:**
  - Fixed auto check-in status logic error.

## 2.10.0
- **New Feature:**
  - Browser messages now support exponential backoff retry mechanism, improving communication stability.
  - Model sync added a manual execution tab and supports Channel selection.
- **Bug Fix:**
  - Ensured missing fields in user preferences are populated with default values.

## 2.9.0
- **New Feature:**
  - Added Cloudflare challenge detection, and automatically attempts to bypass via a temporary window when protection is encountered.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fix:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized dropdown menu positioning and accessibility for the multi-select component.

## 2.8.0
- **New Feature:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can be saved even if data fetching fails during manual account addition.
  - Settings page added "Settings Partition" feature, supporting resetting settings by area.

## 2.7.1
- **Bug Fix:**
  - Fixed the issue where redirected models did not appear in the model list during API synchronization.

## 2.7.0
- **New Feature:**
  - Account dialog can now dynamically update site data for new accounts.
- **Bug Fix:**
  - Hid the password visibility button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - `newApiModelSync`, `autoCheckin`, and `modelRedirect` user preferences are now required to ensure complete default configuration.
- **Bug Fix:**
  - Enhanced robustness of configuration migration checks.
  - Fixed missing "New API Preferences" in configuration checks.
  - Corrected check-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 2.6.0
- **New Feature:**
  - "New API Channel Import" user interface optimized, supporting key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process, improving accuracy.
- **Bug Fix:**
  - Model name standardization now aligns with the Veloera backend and retains hyphens.
  - Resolved browser storage quota issues and improved model matching.

## 2.5.0
- **New Feature:**
  - Added support for Neo-API site type.
- **Bug Fix:**
  - Fixed Base64 encoding issue during CherryStudio URL generation.
  - Removed redundant account fetching and token validation in the Channel dialog, improving efficiency.

## 2.4.1
- **Bug Fix:**
  - Ensured the settings page always opens in a new tab.

## 2.4.0
- **New Feature:**
  - Auto-import feature now integrates the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - Multi-select component now supports collapsible selected areas and optimized input experience.
- **Bug Fix:**
  - Optimized retry mechanism and increased user feedback.
  - Optimized multi-select component performance with a large number of selections.

## 2.3.0
- **New Feature:**
  - Added account pinning and unpinning functionality, supporting priority sorting for pinned accounts.
- **Bug Fix:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration, increasing the priority of the current site condition.

## 2.2.1
- **Bug Fix:**
  - Removed the `isDetected` check for the auto-configure button.
  - Ensured account detection refreshes correctly when displaying data changes.
  - Fixed the issue where Access Token is no longer required for Cookie authentication type.

## 2.2.0
- **New Feature:**
  - Auto check-in feature added result/history interface, and optimized default settings and user experience.
  - Implemented daily site auto check-in, supporting time window settings and status display.
- **Bug Fix:**
  - Fixed case sensitivity issue in auto check-in status detection.
  - Handled edge cases in check-in time window calculation.

## 2.1.0
- **New Feature:**
  - Account list added username search and highlighting functionality.
- **Bug Fix:**
  - Added configuration validation warning when API settings are missing.
  - "New API" feature added configuration validation assistance and internationalized error messages.

## 2.0.0
- **New Feature:**
  - "New API Model Sync" filter bar added execution statistics.
  - Each row in the results table added a sync operation button.
  - Implemented initial service, background logic, and settings interface for "New API Model Sync".
- **Bug Fix:**
  - Row retry operation now only updates the target and progress UI.
  - Updated Channel list response handling and types.

## 1.38.0
- **New Feature:**
  - Supports pinning accounts configured with custom check-in or redemption URLs.
  - Added custom redemption and open tab matching as sorting rules.
- **Bug Fix:**
  - Ensured deep copying of default sorting rules.
  - New sorting conditions are disabled by default after migration.

## 1.37.0
- **New Feature:**
  - Account search functionality enhanced, supporting multi-field composite search across UI interfaces.
  - Added open sidebar functionality.
- **Bug Fix:**
  - Supplemented translation for the "Clear" operation.

## 1.36.0
- **New Feature:**
  - Accounts can now be configured with a redemption page path and support jumping to it.
  - Can choose whether to automatically open the redemption page after check-in.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fix:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Feature:**
  - Check-in icon updated to a "Yen" icon for better intuition.
- **Bug Fix:**
  - Custom check-in accounts now automatically reset check-in status daily.
  - Fixed default value issue for the `isCheckedInToday` flag.

## 1.34.0
- **New Feature:**
  - WebDAV now supports automatic account data synchronization, adopting a merge strategy.
- **Bug Fix:**
  - Replaced `chrome.runtime` with `browser.runtime` to improve cross-browser compatibility, and optimized error handling.

## 1.33.0
- **New Feature:**
  - Introduced reusable `AppLayout` component to improve interface consistency.

## 1.32.1
- **Bug Fix:**
  - Fixed incorrect width of the right content container on small screens.

## 1.32.0
- **New Feature:**
  - Account Management interface layout and responsiveness improved.
  - Added configurable React DevTools auto-plugin and caching.
- **Bug Fix:**
  - Fixed mobile sidebar overlay `z-index` issue.
  - Buttons, cards, and icons now support responsive size adjustment.

## 1.31.0
- **New Feature:**
  - Account Management added a "Create Account" button and optimized layout.
  - Account Management added "Usage Log" functionality.
  - Sorting priority settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fix:**
  - Updated SiteInfo icon button size and accessibility labels.

## 1.30.0
- **New Feature:**
  - Dialog components replaced with custom `Modal` components to improve consistency.
  - Added a comprehensive set of UI components to enhance interface aesthetics and development efficiency.
- **Bug Fix:**
  - Corrected check-in logic and sorting priority.
  - Optimized mobile sidebar overlay transparency and layering for better user experience.

## 1.29.0
- **New Feature:**
  - Pop-up now supports detection and automatic closing.
  - Pop-up added mobile responsive layout to avoid needing to zoom on mobile devices.

## 1.28.0
- **New Feature:**
  - Implemented cross-platform intelligent auto-detection functionality.
  - Migrated `chrome.*` API to `browser.*` API, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functionality compatibility and user interface design on mobile devices.
- **Bug Fix:**
  - Fixed `tabId` parsing issue after window creation.
  - Prevented button borders from showing rotation animation during refresh.

## 1.27.0
- **New Feature:**
  - Account dialog automatically closes after successful auto-configuration to New API.
  - Implemented dynamic loading of localization resources, improving internationalization support.
- **Bug Fix:**
  - Added internationalization support for error messages.
  - Fixed template syntax error in Chinese/English currency switching.

## 1.26.0
- **Bug Fix:**
  - Account error messages now support internationalization.
  - Replaced hardcoded Chinese text in `newApiService` with internationalization keys.

## 1.25.0
- **New Feature:**
  - Improved accessibility of the WebDAV settings form.
- **Bug Fix:**
  - Replaced hardcoded Chinese text in the `TokenHeader` prompt with translation keys.

## 1.24.0
- **New Feature:**
  - Added health status translation keys and refactored error messages.
  - `dayjs` localization now updates with language switching.

## 1.23.2
- **Bug Fix:**
  - Fixed logical error in RMB currency conversion.

## 1.23.1
- **Bug Fix:**
  - Amount extraction now supports exchange rate conversion.

## 1.23.0
- **New Feature:**
  - Added Chinese and English localization support.
  - Added language switching functionality and supports Suspense loading.
- **Bug Fix:**
  - Completed internationalization of remaining hardcoded text.
  - Fixed issue where success message was still displayed when no accounts were refreshed.

## 1.22.0
- **New Feature:**
  - Account added "Today's Total Income" field and income display interface.
  - Supports redemption code recharge type.
- **Bug Fix:**
  - Fixed rendering logic for the custom URL check-in interface.
  - Corrected check-in field name and return structure.

## 1.21.0
- **New Feature:**
  - Added favicon and extension icon to pop-up, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and pop-up operations.
  - Underlying framework migrated from Plasmo to WXT, bringing better performance and development experience.

## 1.20.0
- **New Feature:**
  - Balance and health status indicators added refresh functionality.
  - Action button UI unified and optimized, supporting intelligent key handling.

## 1.19.0
- **New Feature:**
  - All components now support dark mode.
  - Implemented a theme system, supporting dark, light, and follow-system modes.
- **Bug Fix:**
  - API configuration interface now enforces the `authType` field requirement.

## 1.18.0
- **New Feature:**
  - Account added custom check-in button (with Yen icon).
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting functionality added custom check-in URL as a sorting condition.
- **Bug Fix:**
  - Fixed issue where custom check-in URL was not correctly passed to the handler.

## 1.17.0
- **New Feature:**
  - Accounts now support selecting authentication type.
  - API authentication options added "No Auth" type.
  - Tooltip component migrated to `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Feature:**
  - "New API" feature added account auto-configuration support.
  - Site accounts added check-in functionality.
  - Implemented a customizable sorting priority system.

## 1.15.0
- **Bug Fix:**
  - Fixed issue where unnecessary updates and notifications were triggered even when the value had not changed.

## 1.14.0
- **New Feature:**
  - Added tab activation and update listeners for auto-detection.

## 1.13.0
- **New Feature:**
  - Added "New API" integration, supporting token import.
  - Added "New API" integration settings in preferences.
  - Added password visibility toggle functionality.

## 1.12.1
- **Bug Fix:**
  - Moved default sorting values to `UserPreferencesContext`.
  - Fixed potential rendering issues when preferences were loading.

## 1.12.0
- **New Feature:**
  - Account sorting added health status priority.
  - Health status now includes more detailed reason information.

## 1.11.0
- **New Feature:**
  - Refresh functionality enhanced, now supporting detailed status tracking.
  - Added minimum refresh interval to prevent frequent requests.

## 1.10.0
- **New Feature:**
  - Key copying functionality added Cherry Studio integration.

## 1.9.0
- **New Feature:**
  - Added OneHub token management and data fetching functionality.
  - Added user Group data conversion and API integration.
  - Implemented model fetching functionality for OneHub sites.

## 1.8.0
- **New Feature:**
  - Account Management added site type support.
  - Added site type detection and optimized the auto-detection process.
  - Implemented model pricing functionality for OneHub sites.

## 1.7.1
- **Bug Fix:**
  - Fixed logical error in using site status detection for check-in support.

## 1.7.0
- **New Feature:**
  - Added check-in support detection and toggle functionality.
  - Account added check-in status support.

## 1.6.0
- **New Feature:**
  - Account Management added support for a notes field.

## 1.5.0
- **Performance Optimization:**
  - Optimized model list rendering method, improving loading performance.

## 1.4.1
- **Bug Fix:**
  - Fixed issue where detected account status was automatically reset when no existing account was found.

## 1.4.0
- **New Feature:**
  - Control panel added copy model name functionality.
  - Added Baidu and Yi model provider support.

## 1.3.1
- **Bug Fix:**
  - Updated release PR workflow configuration.

## 1.3.0
- **New Feature:**
  - Added WebDAV backup and synchronization functionality.

## 1.2.0
- **New Feature:**
  - Added Account Management page, supporting full CRUD (Create, Read, Update, Delete) functionality.
  - Custom dialogs in the pop-up replaced with direct function calls, simplifying operations.

## 1.1.1
- **Bug Fix:**
  - Fixed logic for handling missing system names and checks.

## 1.1.0
- **New Feature:**
  - Account added manual addition support and optimized UI flow.

## 1.0.0
- **New Feature:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and warning prompt when adding an account.
  - Introduced sidebar functionality, replacing the pop-up's automatic site configuration.

## 0.0.3
- **New Feature:**
  - Optimized account identification process, now supporting automatic creation of access keys.
  - Account list added sortable headers, copy key dialog, and hover action buttons.
  - Account Management added a notes field.
  - Site names are clickable for navigation.
  - Model list supports Group selection.
  - Pop-up page added number scrolling animation and site status indicator.
  - Optimized Add/Edit Account dialog, including recharge Ratio settings and automatic site name extraction.
  - Fully implemented the Settings page system, supporting user preference persistence and auto-refresh.
  - Enhanced front-end interface and background service for auto-refresh functionality.
  - Automatically added `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic updates and deletion functionality for account health status.
  - Supports more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Pop-up interface refactored to API Manager style, adding display of today's total consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fix:**
  - Fixed model data format incompatibility, `localStorage` access, and API request credential issues.
  - Corrected API authentication method.
  - Optimized URL input handling and auto-refresh configuration.
  - Added pagination logic to handle log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**