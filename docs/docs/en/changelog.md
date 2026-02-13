# Changelog

This page records major updates for general users (feature changes / experience optimizations / bug fixes). For the complete version history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip New Users Start Here
- **How to check your current version**: Open the extension pop-up; the version number will be displayed in the title bar. You can also view it on the Settings page.
- **How to stop this page from opening automatically**: Control whether to "Automatically open the changelog after updating" in "Settings → General → Changelog".
- **Troubleshooting**: Enable console logs in "Settings → General → Logs" and attach the reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.19.0
- **New Features:**
  - Self-hosted Site Management: Added support for `Octopus` hosted sites. You can connect to the Octopus backend and import account API keys as Channels in "Channel Management," while also supporting fetching the list of available models.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default), and provided a one-click option "Ensure at least one key" to automatically complete the default key for accounts missing one.
  - AI API Testing: The "Model List Detection" in interface validation supports OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and other interface types, providing suggested available model IDs to reduce manual guessing.
- **Experience Optimization:**
  - Account Management: Enhanced site/account recognition logic to improve stability in multi-account scenarios on the same site.
  - Usage/Log Fetching: Added rate limit protection for log-type interfaces to reduce errors or triggering site rate limits caused by frequent refreshing.
  - Channel Management: More precise duplicate detection when creating Channels, providing a prompt for confirmation to avoid mistakenly creating duplicate routes.
- **Bug Fixes:**
  - Disabled Accounts: Automatically filter disabled accounts in related dropdowns/lists (e.g., Key Management) to prevent invalid operations.
  - Language: Fixed an issue where the extension language setting might affect the language value of the webpage itself.

**Location Tips:**
- Octopus Configuration: Select `Octopus` in "Settings → Basic Settings → Self-hosted Site Management" and fill in the `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Auto-create Default Key Switch: In "Settings → Basic Settings → Account Management → API Key".
- One-click Default Key Completion: In "Settings → Key Management" in the top right corner, "Ensure at least one key".
- AI API Testing Entry: Right-click menu on the webpage, "Quickly test AI API functionality availability".

## 3.18.0
- **New Features:**
  - Balance History: Added "Currency Unit" toggle (`USD` / `CNY`) to the chart, displaying currency symbols on the axis/tooltips. When `CNY` is selected, conversion is performed based on the account's "Recharge Amount Ratio," making it easier to view trends and reconcile accounts based on monetary value.
- **Experience Optimization:**
  - Tag Filtering: When there are too many tag/account options, the default is changed to "Expand Display" for more intuitive browsing and selection.
  - Tab Page: Added left and right scroll buttons to the "Settings" Group Tags and "Model List" Vendor Tags, making switching easier in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Auto-detection" is more accurate, fixing frequent unknown site type issues in recent versions.

**Location Tips:**
- Balance History Currency Unit: In the filter area "Currency Unit" on the "Settings → Balance History" page.
- Account Exchange Rate (Recharge Amount Ratio): In the "Recharge Amount Ratio" field of the Add/Edit Account form in "Settings → Account Management".

## 3.17.0
- **New Features:**
  - Balance History: Added "Balance History" feature (disabled by default), which records daily balance and income/expenditure snapshots, allowing trends to be viewed in a chart. Supports filtering by tag/account and time range, and provides "Refresh Now / Clean Up Now" convenient operations.
  - Balance History: Added settings to control whether to enable it, retention days, and "End-of-Day Fetch." Note: If you disable "Display Today's Income/Expenditure" and do not enable "End-of-Day Fetch," the "Daily Income/Expenditure" chart will have no data.
- **Experience Optimization:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar on small screens/narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed responsive display issues in the export area on some screen sizes.
  - Pop-up: Fixed layout anomaly where the pop-up scrollbar position was incorrect.

**Location Tips:**
- Balance History Switch/Retention Days/End-of-Day Fetch: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Site): Added Sub2API site type, supporting balance/Quota query; supports reading console login status via "Auto-detection"; and supports "Plugin-hosted Session (Multi-account, Recommended)" mode, which can independently renew authentication for each account, improving the multi-account experience on the same site.
  - Display Settings: Added "Display Today's Income/Expenditure" switch (enabled by default), which can hide and stop fetching statistics like "Today's Consumption/Income," reducing log fetching requests during refresh.
- **Note:**
  - Sub2API currently does not support site check-in/today's usage/income and related features, only providing basic balance/Quota queries. Related features will be gradually improved based on site capabilities.
  - "Plugin-hosted Session (Multi-account)" saves the `refresh_token` as private account credentials and will be included in exports/WebDAV backups; please properly safeguard backup files and WebDAV credentials.

**Location Tips:**
- Sub2API Addition/Mode Description: In "Settings → Account Management," add/edit an account, select Sub2API as the site type; see [FAQ](./faq.md) for more detailed steps (search for "Sub2API").
- Today's Income/Expenditure Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved background Service Worker stability, reducing the chance of asynchronous scheduled tasks (WebDAV automatic sync / usage sync / model sync / auto check-in, etc.) being missed due to premature background termination; and automatically resumes related scheduled tasks after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" to save quick links for site consoles/documentation/management pages without creating a full account; supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting; the pop-up added an "Account / Bookmark" toggle; bookmark data is included in backup/restore and WebDAV automatic synchronization.
- **Bug Fixes:**
  - Account Refresh: Removed redundant "Today's Income" fetching requests, reducing unnecessary network calls (some sites already return `today_income` in the refresh interface).
  - Auto Refresh: The minimum refresh interval is 60 seconds, and the minimum refresh interval protection is 30 seconds; old configurations will be automatically corrected to the legal range after the update, and related prompt text and documentation have been improved.

::: warning Important: Auto Refresh Configuration Will Be Forcibly Adjusted
Due to feedback indicating that **too short an automatic refresh interval easily triggers site rate limits and can cause excessive load on the site**

v3.15.0 **made mandatory changes to the automatic refresh configuration**:
- Automatic refresh and refresh upon opening the plugin have been disabled. If you still need to enable them, you must manually re-enable them.
- `Refresh Interval` minimum is 60 seconds, and `Minimum Refresh Interval Protection` minimum is 30 seconds. If your setting before the upgrade was below these thresholds, it will be automatically raised to the minimum value after the upgrade; if your previous setting was within the new legal range, there will be no impact.
:::

**Location Tips:**
- Bookmark Management: In "Settings → Bookmark Management"; the top of the pop-up can toggle between "Account / Bookmark".
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added right-click menu "Quickly test AI API functionality availability," which opens the test panel directly on the current webpage; supports filling/pasting `Base URL` and `API Key`, and performs basic capability detection for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible also supports one-click model list fetching).
  - (Optional) Auto-detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist; when a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (disabled by default, and the Key will not be saved).
  - Auto Check-in: The execution result list added more troubleshooting tips—including suggestions for handling common exceptions like "temporary bypass tab manually closed" and "Access Token invalid," along with documentation entries.
- **Bug Fixes:**
  - WebDAV: Automatic synchronization migrated from the timer to the browser Alarms API, reducing the probability of missed synchronization caused by background sleep/power saving policies.

**Location Tips:**
- AI API Test Panel: Right-click on any webpage and select "Quickly test AI API functionality availability"; related auto-detection settings are in "Settings → AI API Test".
- Auto Check-in Tips: View in the execution result list in "Settings → Auto Check-in".

## 3.13.0
- **New Features:**
  - Account Management: Added "Check-in Status Expired" prompt—when the "Checked in today/Not checked in" status was not detected today, an orange warning icon will be displayed; clicking it allows for a one-click refresh of the account data, preventing misleading old statuses.
  - Interface: Multi-select controls upgraded to a more compact selector (saves space, supports search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and check-in logic, improving usability.
  - Cookie Authentication: Removed the Cookie caching mechanism, reducing anomalies caused by reading old values after a Cookie update.

**Location Tips:**
- Check-in Status Expired Prompt: In the account list in "Settings → Account Management," next to the site information's check-in icon.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code"—generates providerProfiles configuration for Kilo Code / Roo Code, supporting copying the apiConfigs snippet or downloading settings JSON for import (import is incremental addition, will not clear existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by overly long text like site names, changed to automatic truncated display.
  - Dropdown Selector: Optimized empty state prompts and fixed overflow issues when option text is too long.

**Location Tips:**
- Export to Kilo Code: In the key list in "Settings → Key Management," click the Kilo Code icon in the top right corner of a specific key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder—when the existence of the same/similar Channel is detected, a warning dialog will pop up, allowing the user to choose to continue creation or cancel (no longer blocking creation with an error Toast).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by overly long text like site names, changed to automatic truncated display.

## 3.10.0
- **New Features:**
  - Account Management: Clicking the site link in Incognito Mode will open it within the current incognito window (convenient for maintaining incognito login state).
  - Account Management: Disabled accounts also support clicking the site link, allowing them to be used as bookmarks.
  - Usage Analysis: When there is only a single account, the chart and list prioritize displaying the site name (instead of the username) for more intuitive information.
  - Bypass Helper: The temporary bypass window added support for CAP (cap.js) Pow verification, improving the success rate.
- **Bug Fixes:**
  - Redemption Helper: Prioritized reading the redemption code from the clipboard, improving trigger accuracy.
  - Notification Overlay: Fixed the Toaster layer issue, preventing notifications from being obscured by the webpage.

**Location Tips:**
- Site Link: Click the site name in the account list in "Settings → Account Management".
- Bypass Helper: Refer to [Cloudflare Bypass Helper](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added "Manual Balance (USD)" field to accounts—when the site cannot automatically fetch the balance/Quota, it can be manually filled in for display and statistics.
  - Account Management: Added "Exclude from Total Balance" switch to accounts—used to remove specific accounts from the "Total Balance" statistics (does not affect features like refresh/check-in).
  - Settings: Added "Automatically open the changelog after updating" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Auto Check-in: Refreshes related data and synchronously updates the interface after execution is complete.

**Location Tips:**
- Account Add/Edit: Open Add/Edit Account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added "Usage Analysis" page to chart usage trends across multiple sites and accounts, providing an immediate view of "where usage is high / spending is high / performance has slowed," facilitating cost control, account reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overview (request count, Tokens, Quota), model distribution/spending distribution, account comparison, usage time hotspots, and latency trends/histograms.
  - Usage History Sync: Added "Usage History Sync" capability, used to fetch and save "aggregated usage data" (does not save raw logs); supports setting retention days, automatic synchronization method, and minimum synchronization interval, and allows viewing the synchronization result and error prompts for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage" to enable "Usage History Sync," set as needed, and click "Sync Now."
  - Then, go to the left menu "Usage Analysis" to view the charts; click "Export" when retention or reconciliation is needed.

## 3.7.0
- **New Features:**
  - Sorting: Account list supports sorting by "Income"; sorting priority added "Disabled accounts sink to the bottom," preventing deactivated/invalid accounts from interfering with daily use.
  - Auto Check-in: Added "Proactively trigger today's check-in when opening the interface"—when opening the pop-up/sidebar/settings page within the time window, it will automatically attempt to run today's check-in once, without waiting for the scheduled time.
- **Bug Fixes:**
  - Auto Check-in: The same account will only execute once per day; retry only targets failed accounts, reducing meaningless requests and repeated disturbance.
- **Location Tips:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Auto Check-in Pre-trigger/Retry: Configure in the left menu "Auto Check-in".

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enable/disable account; after disabling, all features will skip this account, allowing data to be retained after the account becomes invalid.
  - Tags: Added Global Tag Management, and synchronously optimized related interfaces and interactions, facilitating categorized account management.
  - Pop-up: Displays the current version number in the title bar and provides a direct link to this changelog.
  - Quick Export: CCSwitch export supports selecting upstream models, making the export configuration closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values, preventing display inconsistencies due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Check-in" switch (moved above the custom check-in URL), making configuration more intuitive.
  - Interface: Dialog title icons removed gradient background color, providing a cleaner, unified visual.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would lead to a white screen.

## 3.5.0
- **New Features:**
  - Auto-detection: Added "Slow Detection" warning and related documentation links to help users troubleshoot and resolve issues.
  - External Check-in Batch Open: Supports opening all in a new window, facilitating batch closing and reducing interference.
- **Bug Fixes:**
  - External Check-in Batch Open: The process was refactored to execute in the background service, ensuring all sites can be opened correctly in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration, supporting direct selection of upstream models for more precise model mapping.
- **Bug Fixes:**
  - API: Ensured access keys always include the `sk-` prefix, preventing recognition/copying issues caused by inconsistent formatting.

## 3.3.0
- **New Features:**
  - Auto Check-in: Account recognition added "Username" information, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-in, reducing the steps for individual operation.
  - Auto Refresh: The minimum refresh interval no longer limits the maximum value, allowing for a larger minimum interval to control the refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce false triggers in non-copy scenarios.
  - Redemption Helper: Validated all redemption codes before the pop-up prompt, reducing invalid redemption prompts.
  - Storage: Added a write lock to write operations, improving data consistency during concurrent writing.
  - Interface: Adjusted the localized copy for "Copy Model Name."

## 3.2.0
- **New Features:**
  - The "Model List" page added "API Availability Detection" (Beta), used to quickly confirm whether the current key is available for specified models (e.g., text generation, tool/function calling, structured output (return as JSON structure), web search (Grounding), etc.).
  - The "Model List" page added "CLI Tool Compatibility Detection" (Beta), simulating the tool calling process of Claude Code / Codex CLI / Gemini CLI to assess interface compatibility within these tools.
  - The "About" page added "Rating and Download": Automatically recognizes the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entries for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating troubleshooting.
  - The "Open in Sidebar" button is no longer displayed in sidebar mode, preventing duplicate opening.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`), reducing Cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Features:**
  - Added guidance for filling in administrator credentials in Self-managed API Settings.
  - Redemption Helper supports batch redemption and single code retry.

## 3.0.0
- **New Features:**
  - Supports the normal coexistence and full functionality of multiple cookie-authenticated accounts on a single site, primarily for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy, model, and model alias list when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed the incorrect web path redirection for manual check-in on New-API sites.

## 2.39.0
- Added automatic detection and modification of account site check-in support status during account data refresh.
- Automatically opens the changelog page and navigates to the corresponding version anchor point upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Helper:
  - Select specific redemption accounts directly using the up and down arrow keys.
  - Press Enter to confirm redemption.
- Added a prompt to the temporary bypass tab, explaining that the current tab is from this plugin and its specific purpose.
- Improved bypass window display method: single window with multiple tabs, meaning short-term requests will reuse the same window, minimizing interference.
- Supports check-in status detection and auto check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API Channel Management.
- More lenient redemption code format detection support; when encountering custom redemption code formats, the redemption code can be correctly identified and the Redemption Helper pop-up will appear.
- Fixed some known issues.

## 2.36.0
- Supports quick jump to specific Channels for management.
- Fixed an issue where the channel model synchronization time would be reset.

## 2.35.1
- Fixed an issue where the automatic check-in execution time would be reset.
- UI optimization.

## 2.35.0
- Added optional clipboard read permission to prompt for redemption when any potential redemption code is copied.
- Added cdk.linux.do to the Redemption Helper default URL whitelist.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the pop-up or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error during account ID comparison.
  - Ensured all temporary contexts are correctly closed.

## 2.33.0
- **New Features:**
  - Added "Temporary Context Mode" to more effectively bypass website protection.
  - API error messages now support internationalization.
  - Optimized website type detection, now recognizable via the temporary window title.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 2.32.0
- **New Features:**
  - Model redirection is now smarter, supporting version numbers indicated by hyphens and dots.
  - Added the ability to redeem directly via the right-click menu after selecting text.
  - Auto check-in feature is enabled by default, and the check-in time window has been extended.

## 2.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Check-in operation can now be quickly executed in the pop-up.
  - Redemption Helper added URL whitelist functionality, allowing better control over which websites can use the helper.

## 2.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capability for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, and added a decryption retry pop-up during restoration, while also retaining your WebDAV configuration.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website Cookie interception issue during auto-detection.
  - Optimized the centering of blank state content in Firefox.
  - Migrated the Switch component to a custom implementation, improving compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced "Hosted Site" service, laying the foundation for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" to "Hosted Site" in settings for clarity.
- **Bug Fixes:**
  - Optimized translated text, removing redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes, making it easier to understand specific issues.
  - Temporary window bypass feature added a health status indicator.
  - Optimized the description of bypassing website protection for clarity.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed display issues with Firefox pop-up prompts in Chinese settings.
- **Performance Optimization:**
  - Improved sorting functionality performance.

## 2.26.0
- **New Features:**
  - Added model pricing caching service to speed up data loading.
  - Model list added an account overview bar at the top for quick viewing.
  - Now supports displaying model pricing information for multiple accounts simultaneously.
  - Introduced new command and dialog UI components.
  - Added searchable select component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 2.25.0
- **New Features:**
  - Added a beginner's guide card when the account list is empty.
  - When pinning/manual sorting features are disabled, related UI elements are automatically hidden.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

## 2.24.0
- **New Features:**
  - Updated application description and About page content.
  - Extension name now includes a subtitle.
  - Tag filter added visibility control based on the number of rows.
  - WebDAV connection test now supports more successful status codes.
- **Bug Fixes:**
  - Removed the extra period at the end of JSON strings.

## 2.23.0
- **New Features:**
  - Enhanced account tagging functionality.
  - Temporary window bypass feature now supports smarter judgment based on error codes.

## 2.22.0
- **New Features:**
  - Account Management added tagging functionality, making it easier to categorize accounts.
  - Redemption Helper pop-up UI now supports lazy loading and fixed issues that could cause website style corruption.
  - Added global channel filter and JSON editing mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed redundant "Checked in today" check in auto check-in.
  - Simplified and fixed the temporary window fetching logic.
  - Restored the functionality to parse search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guidance upon first installation, making it easier to understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed operation button overflow issue in the account dialog.
  - Redemption amount conversion coefficient now uses constants, improving accuracy.
  - Restricted the Cookie interceptor to only be used in the Firefox browser.

## 2.19.0
- **New Features:**
  - Added loading status and prompt information during the redemption process.
  - Removed the clipboard reading function from the Redemption Helper.
- **Bug Fixes:**
  - Added missing backend error message translations.
  - Prevented service concurrent initialization and race conditions, improving stability.
  - Resolved intermittent "Could not establish connection" errors.
  - Prevented race conditions during temporary window pool destruction.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Helper feature.
  - Firefox browser now supports WebRequest-based Cookie injection mechanism.
  - Redemption feature now supports themes and optimized prompt information.
  - Redemption prompt information now includes source information and settings link.
- **Bug Fixes:**
  - Fixed path issues with Tailwind CSS files.

## 2.17.0
- **New Features:**
  - Added automatic pop-up prompt feature for one-click redemption.
  - Unified data format for import/export and WebDAV backup, adopting V2 versioning scheme, improving compatibility and stability.

## 2.16.0
- **New Features:**
  - Added a warning prompt when creating an account in Firefox desktop version.
  - API model synchronization now supports channel filtering system.

## 2.15.0
- **New Features:**
  - MultiSelect component now supports comma-separated string parsing.
- **Bug Fixes:**
  - Ensured caching only occurs during complete channel data synchronization.
- **Performance Optimization:**
  - Optimized upstream model caching logic.

## 2.14.0
- **New Features:**
  - Site metadata is automatically detected during refresh.
  - Added retry and manual check-in options when auto check-in fails.
  - Enhanced auto check-in feature, including retry strategy, skip reasons, and account snapshot.
  - Optimized auto check-in execution method, changed to concurrent processing, improving efficiency.
- **Bug Fixes:**
  - Fixed default behavior issue with the `autoCheckInEnabled` flag.

## 2.13.0
- **New Features:**
  - Added "New API Channel Management" feature.
  - Added "Warning" button style.
  - Introduced Radix UI components and Tanstack Table, improving interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed incorrect display and sorting of model count in the channel table.

## 2.12.1
- **Bug Fixes:**
  - Fixed unnecessary channel reloading when manually selecting tabs.
  - The "New API Model Sync" option is hidden in the sidebar when the configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Sync" added model allow list filtering functionality.
  - Sidebar now supports collapse/expand with smooth animation effects.

## 2.11.0
- **New Features:**
  - Account Management functionality enhanced, adding search and navigation optimization.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed auto check-in status logic error.

## 2.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanism, improving communication stability.
  - Model synchronization added a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection, and automatically attempts to bypass using a temporary window when protection is encountered.
  - Introduced temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized dropdown menu positioning and accessibility for multi-select components.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can be saved even if data fetching fails during manual account addition.
  - Settings page added "Settings Partition" feature, supporting resetting settings by area.

## 2.7.1
- **Bug Fixes:**
  - Fixed an issue where redirected models did not appear in the model list during API synchronization.

## 2.7.0
- **New Features:**
  - Account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hid the password display button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - User preferences such as `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now required fields to ensure the integrity of default configurations.
- **Bug Fixes:**
  - Enhanced robustness of configuration migration checks.
  - Fixed missing "New API Preferences" in configuration checks.
  - Corrected check-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 2.6.0
- **New Features:**
  - "New API Channel Import" user interface optimized, supporting key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process, improving accuracy.
- **Bug Fixes:**
  - Model name standardization now aligns with the Veloera backend and preserves hyphens.
  - Resolved browser storage quota issues and improved model matching.

## 2.5.0
- **New Features:**
  - Added support for Neo-API site type.
- **Bug Fixes:**
  - Fixed Base64 encoding issue during CherryStudio URL generation.
  - Removed redundant account fetching and token validation in the channel dialog, improving efficiency.

## 2.4.1
- **Bug Fixes:**
  - Ensured the settings page always opens in a new tab.

## 2.4.0
- **New Features:**
  - Auto-import feature now integrates the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - Multi-select component now supports collapsible selected areas and optimized input experience.
- **Bug Fixes:**
  - Optimized retry mechanism and added user feedback.
  - Optimized multi-select component performance with a large number of selections.

## 2.3.0
- **New Features:**
  - Added account pinning and unpinning functionality, supporting priority sorting for pinned accounts.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration, increasing the priority of the current site condition.

## 2.2.1
- **Bug Fixes:**
  - Removed the `isDetected` check for the auto-configure button.
  - Ensured account detection refreshes correctly when displaying data changes.
  - Fixed an issue where Access Token was no longer required for Cookie authentication type.

## 2.2.0
- **New Features:**
  - Auto check-in feature added results/history interface, and optimized default settings and user experience.
  - Implemented daily site auto check-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case sensitivity issue in auto check-in status detection.
  - Handled edge cases in check-in time window calculation.

## 2.1.0
- **New Features:**
  - Account list added username search and highlighting functionality.
- **Bug Fixes:**
  - Added configuration validation warning when API settings are missing.
  - "New API" feature added configuration validation assistance and internationalized error messages.

## 2.0.0
- **New Features:**
  - "New API Model Sync" filter bar added execution statistics.
  - Each row in the results table added a sync operation button.
  - Implemented initial service, background logic, and settings interface for "New API Model Sync."
- **Bug Fixes:**
  - Row retry operation now only updates the target and progress UI.
  - Updated channel list response handling and types.

## 1.38.0
- **New Features:**
  - Supports pinning accounts with custom check-in or redemption URLs set.
  - Added custom redemption and open tab matching as sorting rules.
- **Bug Fixes:**
  - Ensured deep copying of default sorting rules.
  - New sorting conditions are disabled by default after migration.

## 1.37.0
- **New Features:**
  - Account search functionality enhanced, supporting multi-field composite search across UI interfaces.
  - Added open sidebar functionality.
- **Bug Fixes:**
  - Added translation for the "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with a redemption page path and support redirection.
  - Option to automatically open the redemption page after check-in.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - Check-in icon updated to a "Yen" icon for better visualization.
- **Bug Fixes:**
  - Custom check-in accounts now automatically reset check-in status daily.
  - Fixed default value issue with the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic account data synchronization with a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` to improve cross-browser compatibility and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced reusable `AppLayout` component to improve interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed incorrect width of the right content container on small screens.

## 1.32.0
- **New Features:**
  - Account Management interface layout and responsiveness improved.
  - Added configurable React DevTools automatic plugin and caching.
- **Bug Fixes:**
  - Fixed mobile sidebar overlay `z-index` issue.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Account Management added "Create Account" button and optimized layout.
  - Account Management added "Usage Log" feature.
  - Sorting priority settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fixes:**
  - Updated SiteInfo icon button size and accessibility labels.

## 1.30.0
- **New Features:**
  - Dialog component replaced with custom `Modal` component, improving consistency.
  - Added a comprehensive set of UI components, enhancing interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priority.
  - Optimized mobile sidebar overlay transparency and layering for better user experience.

## 1.29.0
- **New Features:**
  - Pop-up now supports detection and automatic closing.
  - Pop-up added mobile responsive layout, avoiding the need for zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent auto-detection functionality.
  - Migrated `chrome.*` API to `browser.*` API, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured feature compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed `tabId` parsing issue after window creation.
  - Prevented spinning animation on button borders during refresh.

## 1.27.0
- **New Features:**
  - Account dialog automatically closes after successful auto-configuration to New API.
  - Implemented dynamic loading of localization resources, improving internationalization support.
- **Bug Fixes:**
  - Added internationalization support for error messages.
  - Fixed template syntax error in Chinese/English currency switching.

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
  - Fixed incorrect RMB currency conversion logic.

## 1.23.1
- **Bug Fixes:**
  - Amount extraction now supports exchange rate conversion.

## 1.23.0
- **New Features:**
  - Added Chinese and English localization support.
  - Added language switching feature and supports Suspense loading.
- **Bug Fixes:**
  - Completed internationalization of remaining hardcoded text.
  - Fixed successful message display when no accounts were refreshed.

## 1.22.0
- **New Features:**
  - Account added "Today's Total Income" field and income display interface.
  - Supports redemption code recharge type.
- **Bug Fixes:**
  - Fixed rendering logic for the custom URL check-in interface.
  - Corrected check-in field names and return structure.

## 1.21.0
- **New Features:**
  - Added favicon and extension icons for pop-up, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and pop-up operations.
  - Underlying framework migrated from Plasmo to WXT, bringing better performance and development experience.

## 1.20.0
- **New Features:**
  - Balance and health status indicators added refresh functionality.
  - Operation button UI unified and optimized, supporting intelligent key handling.

## 1.19.0
- **New Features:**
  - All components now support dark mode.
  - Implemented a theme system, supporting dark, light, and system-following modes.
- **Bug Fixes:**
  - API configuration interface now strictly requires the `authType` field.

## 1.18.0
- **New Features:**
  - Account added custom check-in button (with Yen icon).
  - Implemented versioned configuration migration system, ensuring compatibility during updates.
  - Sorting functionality added custom check-in URL as a sorting condition.
- **Bug Fixes:**
  - Fixed an issue where the custom check-in URL was not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication type.
  - API authentication options added "No Authentication" type.
  - Tooltip component migrated to `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" feature added account auto-configuration support.
  - Site accounts added check-in functionality.
  - Implemented a customizable sorting priority system.

## 1.15.0
- **Bug Fixes:**
  - Fixed an issue where unnecessary updates and notifications were triggered even when the value had not changed.

## 1.14.0
- **New Features:**
  - Added tab activation and update listeners for auto-detection.

## 1.13.0
- **New Features:**
  - Added "New API" integration, supporting token import.
  - Added "New API" integration settings in preferences.
  - Added password visibility toggle functionality.

## 1.12.1
- **Bug Fixes:**
  - Moved default sorting values to `UserPreferencesContext`.
  - Fixed potential rendering issues during preference loading.

## 1.12.0
- **New Features:**
  - Account sorting added health status priority.
  - Health status now includes more detailed reason information.

## 1.11.0
- **New Features:**
  - Refresh functionality enhanced, now supporting detailed status tracking.
  - Added minimum refresh interval to prevent frequent requests.

## 1.10.0
- **New Features:**
  - Key copy functionality added Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub token management and data fetching functionality.
  - Added user group data conversion and API integration.
  - Implemented model fetching functionality for OneHub sites.

## 1.8.0
- **New Features:**
  - Account Management added site type support.
  - Added site type detection and optimized auto-detection process.
  - Implemented model pricing functionality for OneHub sites.

## 1.7.1
- **Bug Fixes:**
  - Fixed logical error in using site status detection for check-in support.

## 1.7.0
- **New Features:**
  - Added check-in support detection and toggle functionality.
  - Accounts added check-in status support.

## 1.6.0
- **New Features:**
  - Account Management added support for the Notes field.

## 1.5.0
- **Performance Optimization:**
  - Optimized the rendering method of the model list, improving loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed an issue where the detected account status was automatically reset when no existing account was found.

## 1.4.0
- **New Features:**
  - Control panel added copy model name functionality.
  - Added Baidu and Yi model provider support.

## 1.3.1
- **Bug Fixes:**
  - Updated release PR workflow configuration.

## 1.3.0
- **New Features:**
  - Added WebDAV backup and synchronization functionality.

## 1.2.0
- **New Features:**
  - Added Account Management page, supporting full CRUD (Create, Read, Update, Delete) functionality.
  - Custom dialogs in the pop-up replaced with direct function calls, simplifying operations.

## 1.1.1
- **Bug Fixes:**
  - Fixed logic for handling missing system names and checks.

## 1.1.0
- **New Features:**
  - Accounts added manual addition support and optimized the UI flow.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and a warning prompt when adding an account.
  - Introduced sidebar functionality, replacing the pop-up's automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized account recognition process, now supporting automatic creation of access keys.
  - Account list added sortable headers, copy key dialog, and hover operation buttons.
  - Account Management added a Notes field.
  - Site names are clickable for redirection.
  - Model list supports group selection.
  - Pop-up page added number scrolling animation and site status indicator.
  - Optimized Add/Edit Account dialog, including recharge Ratio settings and automatic site name extraction.
  - Fully implemented the Settings page system, supporting user preference persistence and auto-refresh.
  - Enhanced front-end interface and background service for auto-refresh functionality.
  - Automatically adds `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic updating and deletion of account health status.
  - Supports more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Pop-up interface refactored to an API manager style, adding display of today's total consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed model data format incompatibility, `localStorage` access, and API request credential issues.
  - Corrected API authentication methods.
  - Optimized URL input handling and auto-refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**