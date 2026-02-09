# Changelog

This page records major updates for general users (feature changes / experience optimizations / bug fixes). For the complete version history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip New Users Start Here
- **How to confirm your current version**: Open the extension popup; the title bar will display the version number. You can also view it on the Settings page.
- **How to stop automatically opening this page**: You can control whether to "Automatically open changelog after update" in "Settings → General → Changelog".
- **Troubleshooting Issues**: You can enable console logs in "Settings → General → Logs" and attach the reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.17.0
- **New Features:**
  - Balance History: Added the "Balance History" feature (disabled by default), which records daily balance and income/expenditure snapshots, allowing you to view trends in a chart. It supports filtering by tag/account and time range, and provides convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added new settings to control whether to enable it, the retention period in days, and "End-of-Day Fetch." Note: If you disable "Display Today's Income/Expenditure" and do not enable "End-of-Day Fetch," the "Daily Income/Expenditure" chart will have no data.
- **Experience Optimization:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar on small screens/narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed responsive display issues in the export area on certain screen sizes.
  - Popup: Fixed a layout anomaly where the popup scrollbar position was incorrect.

**Location Hints:**
- Balance History switch/Retention days/End-of-Day Fetch: In "Settings → Basic Settings → Balance History."
- Balance History chart entry: In "Settings → Balance History."

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added the Sub2API site type, supporting balance/quota queries. It supports reading the console login status via "Automatic Detection" and supports the "Plugin Managed Session (Multi-Account, Recommended)" mode, which allows independent authentication renewal for each account, improving the multi-account experience on the same site.
  - Display Settings: Added a "Display Today's Income/Expenditure" switch (enabled by default), which can hide and stop fetching statistics like "Today's Consumption/Income," reducing log fetching requests during refresh.
- **Note:**
  - Sub2API currently does not support site check-in, today's usage, income, or related features, providing only basic balance/quota queries. Related features will be gradually improved based on site capabilities.
  - The "Plugin Managed Session (Multi-Account)" saves the `refresh_token` as a private account credential, and it will be included in export/WebDAV backups. Please keep backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API addition/mode description: In "Settings → Account Management," add/edit an account, selecting Sub2API as the site type. See [FAQ](./faq.md) for more detailed steps (search for "Sub2API").
- Today's Income/Expenditure switch: In "Settings → Basic Settings → Display Settings."

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved background Service Worker stability, reducing the probability of asynchronous scheduled tasks (WebDAV automatic synchronization / usage synchronization / model synchronization / automatic check-in, etc.) being missed due to premature background termination. Related scheduled tasks are automatically resumed after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" to save quick links for site consoles/documentation/management pages without needing to create a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now includes an "Account / Bookmark" toggle. Bookmark data is included in backup/restore and WebDAV automatic synchronization.
- **Bug Fixes:**
  - Account Refresh: Removed redundant "Today's Income" fetching requests to reduce unnecessary network calls (some sites already return `today_income` in the refresh interface).
  - Automatic Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is 30 seconds. If your old configuration was below these thresholds, it will be automatically corrected to the legal range upon update. Related prompt text and documentation have been improved.

::: warning Important: Automatic Refresh Configuration Will Be Forcibly Adjusted
Feedback indicates that **too short an automatic refresh interval easily triggers site rate limits and can cause excessive load on the site.**

v3.15.0 **made mandatory modifications to the automatic refresh configuration**:
- Automatic refresh and refresh upon opening the plugin features have been disabled. If you still need to enable them, you must do so manually.
- The `Refresh Interval` is a minimum of 60 seconds, and `Minimum Refresh Interval Protection` is a minimum of 30 seconds. If your settings before the upgrade were below these thresholds, they will be automatically raised to the minimum value. If your previous settings were within the new legal range, there will be no impact.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; the top of the popup allows switching between "Account / Bookmark."
- Automatic Refresh: In "Settings → Basic Settings → Automatic Refresh."

## 3.14.0
- **New Features:**
  - Web AI API Functionality Availability Test (Beta): Added a context menu option "Quickly test AI API functionality availability," which opens the test panel directly on the current webpage. It supports filling/pasting `Base URL` and `API Key`, and performs basic capability detection for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible can also fetch the model list with one click).
  - (Optional) Automatic Detection: Can be enabled in "Settings → AI API Test," where you can configure a URL whitelist. When a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear first, and the test panel will only open after confirmation (disabled by default, and the Key is not saved).
  - Automatic Check-in: The execution result list now includes more troubleshooting tips—including suggestions for common exceptions like "temporary shield-bypass tab manually closed" or "Access Token invalid," along with links to relevant documentation.
- **Bug Fixes:**
  - WebDAV: Automatic synchronization migrated from timers to the browser Alarms API, reducing the probability of missed synchronization caused by background sleep/power-saving policies.

**Location Hints:**
- AI API Test Panel: Right-click on any webpage and select "Quickly test AI API functionality availability"; automatic detection settings are in "Settings → AI API Test."
- Automatic Check-in prompts: View in the execution results list in "Settings → Automatic Check-in."

## 3.13.0
- **New Features:**
  - Account Management: Added a "Check-in Status Expired" prompt—an orange warning icon is displayed when the "Checked in today / Not checked in" status was not detected today. Clicking it refreshes the account data with one click, preventing misleading old statuses.
  - Interface: Multi-select controls upgraded to a more compact selector (saves space, supports search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and check-in logic, improving usability.
  - Cookie Authentication: Removed the Cookie caching mechanism to reduce exceptions caused by reading old values after a Cookie update.

**Location Hints:**
- Check-in Status Expired prompt: In the account list in "Settings → Account Management," next to the check-in icon on the right side of the site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code"—generates providerProfiles configuration for Kilo Code / Roo Code, supporting copying the apiConfigs snippet or downloading settings JSON for import (import is incremental addition and will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long text like site names, changing to automatic truncation display.
  - Dropdown Selector: Optimized empty state prompts and fixed overflow issues when option text was too long.

**Location Hints:**
- Export to Kilo Code: In the key list in "Settings → Key Management," click the Kilo Code icon in the upper right corner of a specific key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder—when the existence of an identical/similar channel is detected, a warning dialog pops up, allowing the user to choose to continue creation or cancel (no longer blocking creation with an error Toast).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long text like site names, changing to automatic truncation display.

## 3.10.0
- **New Features:**
  - Account Management: Clicking a site link in Incognito Mode opens it within the current incognito window (facilitating the maintenance of the incognito login state).
  - Account Management: Disabled accounts also support clicking the site link, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, charts and lists prioritize displaying the site name (instead of the username) for more intuitive information.
  - Shield Bypass Helper: The temporary shield-bypass window now supports CAP (cap.js) Pow verification, improving the success rate.
- **Bug Fixes:**
  - Redemption Helper: Prioritized reading the redemption code from the clipboard, improving trigger accuracy.
  - Prompt Overlay: Fixed the Toaster layer issue, preventing prompts from being obscured by the webpage.

**Location Hints:**
- Site Link: In the account list in "Settings → Account Management," click the site name.
- Shield Bypass Helper: Refer to [Cloudflare Shield Bypass Helper](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added a "Manual Balance (USD)" field to accounts—when a site cannot automatically fetch the balance/quota, this can be manually filled in for display and statistics.
  - Account Management: Added an "Exclude from Total Balance" switch to accounts—used to remove specific accounts from the "Total Balance" statistics (does not affect features like refresh/check-in).
  - Settings: Added an "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Automatic Check-in: Related data is refreshed and the interface is synchronized after execution is complete.

**Location Hints:**
- Account Add/Edit: Open Add/Edit Account in "Settings → Account Management."
- Changelog switch, Log Settings: Configure in "Settings → General."

## 3.8.0
- **New Features:**
  - Usage Analysis: Added the "Usage Analysis" page to chart usage trends across multiple sites and accounts, allowing you to quickly see "where usage is high / spending is high / slowdowns," facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overview (requests, Tokens, quota), model distribution/spending distribution, account comparison, usage time hotspots, and latency trends/histograms.
  - Usage History Synchronization: Added "Usage History Synchronization" capability, used to fetch and save "aggregated usage data" (does not save raw logs). Supports setting retention days, automatic synchronization method, and minimum synchronization interval, and allows viewing the synchronization result and error prompt for each account in "Synchronization Status."
- **How to Use:**
  - First, go to "Settings → Account Usage" to enable "Usage History Synchronization," set as needed, and click "Sync Now."
  - Then, go to the left menu "Usage Analysis" to view the charts; click "Export" when retention or reconciliation is needed.

## 3.7.0
- **New Features:**
  - Sorting: The account list supports sorting by "Income"; a new sorting priority "Disabled accounts sink to bottom" has been added, preventing deactivated/invalid accounts from interfering with daily use.
  - Automatic Check-in: Added "Pre-trigger today's check-in when opening the interface"—when the popup/sidebar/settings page is opened within the time window, it automatically attempts to run today's check-in once, without waiting for the scheduled time.
- **Bug Fixes:**
  - Automatic Check-in: Each account will only execute once per day; retry is only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management."
  - Automatic Check-in Pre-trigger/Retry: Configure in the left menu "Automatic Check-in."

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enabling/disabling of accounts; after disabling, all functions will skip this account, making it easy to retain data after an account expires.
  - Tags: Added global tag management, and synchronized optimization of related interfaces and interactions, facilitating categorized account management.
  - Popup: Displays the current version number in the title bar and provides a direct link to this changelog.
  - Quick Export: CCSwitch export supports selecting upstream models, making the export configuration closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to prevent display inconsistencies due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Automatic Check-in" switch (moved above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background color from dialog title icons for a cleaner, unified visual look.
- **Bug Fixes:**
  - Key List: Fixed the issue where closing the dialog would lead to a white screen when expanding key details.

## 3.5.0
- **New Features:**
  - Automatic Detection: Added a "Slower detection" prompt reminder and related documentation links to help users troubleshoot and resolve issues.
  - External Check-in Batch Open: Supports opening all in new windows, facilitating batch closing and reducing interference.
- **Bug Fixes:**
  - External Check-in Batch Open: The process was refactored to execute in the background service, ensuring all sites can be opened correctly in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to support direct selection of upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured access keys always start with the `sk-` prefix to prevent identification/copying issues caused by inconsistent formatting.

## 3.3.0
- **New Features:**
  - Automatic Check-in: Account identification now includes "Username" information, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the steps required for individual operations.
  - Automatic Refresh: The minimum refresh interval no longer restricts the maximum value, allowing for larger minimum intervals to control the refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened the trigger conditions to reduce false triggers in non-copy scenarios.
  - Redemption Helper: Validated all redemption codes before the popup prompt, reducing invalid redemption prompts.
  - Storage: Added a write lock to write operations to improve data consistency during concurrent writes.
  - Interface: Adjusted the localization text related to "Copy Model Name."

## 3.2.0
- **New Features:**
  - The "Model List" page added "Interface Availability Detection" (Beta), used to quickly confirm whether the current key is available for specified models (e.g., text generation, tool/function calling, structured output (return as JSON structure), web search (Grounding), etc.).
  - The "Model List" page added "CLI Tool Compatibility Detection" (Beta), simulating the tool calling process of Claude Code / Codex CLI / Gemini CLI to evaluate interface compatibility in these tools.
  - The "About" page added "Rating and Download": Automatically identifies the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entries for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status displays the status code and error reason, facilitating problem localization.
  - The "Open in Sidebar" button is no longer displayed in sidebar mode to prevent redundant opening.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Features:**
  - Added administrator credential filling guidance in the Self-Managed API Settings.
  - Redemption Helper supports batch redemption and single-code retry.

## 3.0.0
- **New Features:**
  - Supports the normal coexistence and full functionality of multiple cookie-authenticated accounts for a single site, primarily for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy, model, and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic; the two no longer affect each other.
- **Bug Fixes:**
  - Fixed the incorrect web page path redirection for manual check-in on New-API sites.

## 2.39.0
- Added automatic detection and modification of check-in support status for account sites during account data refresh.
- Upon version update, the changelog page automatically opens and navigates to the corresponding version anchor.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation in the Redemption Helper:
  - Select specific redemption accounts directly using the up and down arrow keys.
  - Press Enter to confirm redemption.
- Added a prompt to the temporary shield-bypass tab, explaining that the tab is from this plugin and its specific purpose.
- Better shield-bypass window display method: single window with multiple tabs, meaning short-term requests reuse the same window, minimizing interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized the user experience for New-API Channel Management.
- More lenient redemption code format detection support: when encountering custom redemption code formats, the redemption code can be correctly identified, and the Redemption Helper will pop up.
- Fixed some known issues.

## 2.36.0
- Supports quick jump to specific channels for management.
- Fixed the issue where channel model synchronization time would be reset.

## 2.35.1
- Fixed the issue where automatic check-in execution time would be reset.
- UI optimization.

## 2.35.0
- Added optional clipboard read permission to prompt for redemption when any possible redemption code is copied.
- Added cdk.linux.do to the Redemption Helper default URL whitelist.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error during account ID comparison.
  - Ensured all temporary contexts are correctly closed.

## 2.33.0
- **New Features:**
  - Added "Temporary Context Mode" to bypass website protection more effectively.
  - API error messages now support internationalization.
  - Optimized website type detection; it can now be identified via the temporary window title.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 2.32.0
- **New Features:**
  - Model redirection is now smarter, supporting version numbers indicated by hyphens and dots.
  - Added the ability to redeem directly via the context menu after selecting text.
  - Automatic check-in is enabled by default, and the check-in time window has been extended.

## 2.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Check-in operation can now be quickly executed in the popup.
  - Redemption Helper added a URL whitelist feature, allowing better control over which websites can use the helper.

## 2.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized the detection capability for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, adds a decryption retry dialog during recovery, and retains your WebDAV configuration.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed the issue of website Cookie interception during automatic detection.
  - Optimized the centering of blank state content in Firefox.
  - Migrated the Switch component to a custom implementation, improving compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced "Managed Sites" service, laying the foundation for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" in settings to "Managed Sites" for clarity.
- **Bug Fixes:**
  - Optimized translation text, removing redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes, allowing you to understand specific issues.
  - Temporary window bypass feature added a health status indicator.
  - Optimized the description of bypassing website protection for better clarity.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed the display issue of Firefox popup prompts in Chinese settings.
- **Performance Optimization:**
  - Improved the performance of the sorting function.

## 2.26.0
- **New Features:**
  - Added model pricing caching service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Can now display model pricing information for multiple accounts simultaneously.
  - Introduced new command and dialog UI components.
  - Added searchable selection components to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 2.25.0
- **New Features:**
  - Added a beginner's guide card when the account list is empty.
  - Related UI elements are automatically hidden when pinning/manual sorting features are disabled.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed the issue where the tag array could be empty when updating an account.

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
  - Account Management added tagging functionality to facilitate account categorization.
  - Redemption Helper popup UI now supports lazy loading and fixed issues that could cause website style corruption.
  - Added global channel filter and JSON editing mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed redundant "Checked in today" check in automatic check-in.
  - Simplified and fixed the temporary window fetching logic.
  - Restored the parsing function for search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guidance upon first installation to help users understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed the issue of operation button overflow in the account dialog.
  - Redemption amount conversion factor now uses constants to improve accuracy.
  - Restricted the Cookie interceptor to be used only in the Firefox browser.

## 2.19.0
- **New Features:**
  - Added loading status and prompt information during the redemption process.
  - Removed the clipboard reading function from the Redemption Helper.
- **Bug Fixes:**
  - Added missing background error message translations.
  - Prevented concurrent service initialization and race conditions, improving stability.
  - Resolved intermittent "Could not establish connection" errors.
  - Prevented race conditions during temporary window pool destruction.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Helper feature.
  - Firefox browser now supports WebRequest-based Cookie injection mechanism.
  - Redemption feature now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and a settings link.
- **Bug Fixes:**
  - Fixed path issues for Tailwind CSS files.

## 2.17.0
- **New Features:**
  - Added automatic popup prompt feature for one-click redemption.
  - Unified the data format for Import/Export and WebDAV Backup, adopting the V2 versioning scheme to improve compatibility and stability.

## 2.16.0
- **New Features:**
  - Added a warning prompt when creating an account in Firefox desktop version.
  - API model synchronization now supports a channel filtering system.

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
  - Added retry and manual check-in options when automatic check-in fails.
  - Enhanced automatic check-in features, including retry strategy, skip reasons, and account snapshots.
  - Optimized automatic check-in execution method, changing to concurrent processing to improve efficiency.
- **Bug Fixes:**
  - Fixed the default behavior issue of the `autoCheckInEnabled` flag.

## 2.13.0
- **New Features:**
  - Added "New API Channel Management" feature.
  - Added "Warning" button style.
  - Introduced Radix UI components and Tanstack Table, improving interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed incorrect model count display and sorting in the channel table.

## 2.12.1
- **Bug Fixes:**
  - Fixed unnecessary channel reloading when manually selecting tabs.
  - The "New API Model Synchronization" option is hidden in the sidebar when the configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Synchronization" added model allow list filtering functionality.
  - The sidebar now supports collapsing/expanding with smooth animation effects.

## 2.11.0
- **New Features:**
  - Account Management functionality enhanced, adding search functionality and navigation optimization.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed automatic check-in status logic error.

## 2.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanism, improving communication stability.
  - Model synchronization added a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection, and automatically attempts to bypass protection using a temporary window when encountered.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized the dropdown menu positioning and accessibility of the multi-select component.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can be saved even if data fetching fails when manually adding an account.
  - Settings page added "Settings Partition" feature, supporting resetting settings by area.

## 2.7.1
- **Bug Fixes:**
  - Fixed the issue where redirected models did not appear in the model list during API synchronization.

## 2.7.0
- **New Features:**
  - The account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hidden the password display button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - User preferences such as `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now required to ensure the integrity of default configurations.
- **Bug Fixes:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed the issue of missing "New API Preferences" in configuration checks.
  - Corrected the check-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 2.6.0
- **New Features:**
  - The user interface for "New API Channel Import" has been optimized, supporting key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process, improving accuracy.
- **Bug Fixes:**
  - Model name standardization now aligns with the Veloera backend and preserves hyphens.
  - Resolved browser storage quota issues and improved model matching.

## 2.5.0
- **New Features:**
  - Added support for the Neo-API site type.
- **Bug Fixes:**
  - Fixed Base64 encoding issues during CherryStudio URL generation.
  - Removed redundant account fetching and token validation in the channel dialog, improving efficiency.

## 2.4.1
- **Bug Fixes:**
  - Ensured the settings page always opens in a new tab.

## 2.4.0
- **New Features:**
  - Automatic import feature now integrates the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - Multi-select component now supports collapsible selected areas and optimized input experience.
- **Bug Fixes:**
  - Optimized the retry mechanism and added user feedback.
  - Optimized the performance of the multi-select component with a large number of selections.

## 2.3.0
- **New Features:**
  - Added account pinning and unpinning functionality, and supports prioritizing pinned accounts in sorting.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration, increasing the priority of the current site condition.

## 2.2.1
- **Bug Fixes:**
  - Removed the `isDetected` check for the automatic configuration button.
  - Ensured account detection correctly refreshes when displaying data changes.
  - Fixed the issue where Access Token is no longer required for Cookie authentication type.

## 2.2.0
- **New Features:**
  - Automatic Check-in feature added results/history interface, and optimized default settings and user experience.
  - Implemented daily site automatic check-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case sensitivity issues in automatic check-in status detection.
  - Handled edge cases in check-in time window calculation.

## 2.1.0
- **New Features:**
  - Account list added username search and highlighting functionality.
- **Bug Fixes:**
  - Added configuration validation warning when API settings are missing.
  - "New API" feature added configuration validation assistance and internationalized error messages.

## 2.0.0
- **New Features:**
  - "New API Model Synchronization" filter bar added execution statistics.
  - Each row in the results table added a synchronization operation button.
  - Implemented the initial service, background logic, and settings interface for "New API Model Synchronization."
- **Bug Fixes:**
  - Row retry operations now only update the target and progress UI.
  - Updated channel list response handling and types.

## 1.38.0
- **New Features:**
  - Supports pinning accounts configured with custom check-in or redemption URLs.
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
  - Accounts can now be configured with a redemption page path and support jumping to it.
  - Option to automatically open the redemption page after check-in.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API routing paths for multiple sites.

## 1.35.0
- **New Features:**
  - Check-in icon updated to a "Yen" icon for better intuition.
- **Bug Fixes:**
  - Custom check-in accounts now automatically reset the check-in status daily.
  - Fixed the default value issue of the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic synchronization of account data, adopting a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` to improve cross-browser compatibility and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced reusable `AppLayout` component to enhance interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed incorrect width of the right content container on small screens.

## 1.32.0
- **New Features:**
  - The layout and responsiveness of the Account Management interface have been improved.
  - Added configurable React DevTools automatic plugin and caching.
- **Bug Fixes:**
  - Fixed mobile sidebar overlay `z-index` issue.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Account Management added a "Create Account" button and optimized the layout.
  - Account Management added "Usage Log" functionality.
  - Sorting priority settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fixes:**
  - Updated the size and accessibility labels for the SiteInfo icon button.

## 1.30.0
- **New Features:**
  - Dialog components replaced with a custom `Modal` component for improved consistency.
  - Added a comprehensive set of UI components to enhance interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priority.
  - Optimized the transparency and layering of the mobile sidebar overlay for better user experience.

## 1.29.0
- **New Features:**
  - The popup now supports detection and automatic closing.
  - The popup added mobile responsive layout to avoid the need for zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent automatic detection.
  - Migrated `chrome.*` API to `browser.*` API, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functionality compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed `tabId` parsing issue after window creation.
  - Prevented the button border from displaying a rotating animation during refresh.

## 1.27.0
- **New Features:**
  - The account dialog automatically closes after successful automatic configuration to the New API.
  - Implemented dynamic loading of localization resources, enhancing internationalization support.
- **Bug Fixes:**
  - Added internationalization support for error messages.
  - Fixed template syntax error in Chinese/English currency switching.

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
  - Fixed Chinese Yuan currency conversion logic error.

## 1.23.1
- **Bug Fixes:**
  - Amount extraction now supports exchange rate conversion.

## 1.23.0
- **New Features:**
  - Added Chinese and English localization support.
  - Added language switching functionality and supports Suspense loading.
- **Bug Fixes:**
  - Completed internationalization of remaining hardcoded text.
  - Fixed the issue where a success message was still displayed when no accounts were refreshed.

## 1.22.0
- **New Features:**
  - Accounts added "Today's Total Income" field and income display interface.
  - Supports redemption code recharge type.
- **Bug Fixes:**
  - Fixed rendering logic for the custom URL check-in interface.
  - Corrected check-in field names and return structure.

## 1.21.0
- **New Features:**
  - Added favicon and extension icon to popup, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and popup operations.
  - Underlying framework migrated from Plasmo to WXT, bringing better performance and development experience.

## 1.20.0
- **New Features:**
  - Balance and health status indicators added refresh functionality.
  - Operation button UI unified and optimized, supporting intelligent key handling.

## 1.19.0
- **New Features:**
  - All components now support Dark Mode.
  - Implemented a theme system, supporting Dark, Light, and Follow System modes.
- **Bug Fixes:**
  - API configuration interface now mandates the `authType` field.

## 1.18.0
- **New Features:**
  - Accounts added custom check-in button (with Yen icon).
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting functionality added custom check-in URL as a sorting condition.
- **Bug Fixes:**
  - Fixed the issue where the custom check-in URL was not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication type.
  - API authentication options added "No Authentication" type.
  - Tooltip component migrated to `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" feature added account automatic configuration support.
  - Site accounts added check-in functionality.
  - Implemented a customizable sorting priority system.

## 1.15.0
- **Bug Fixes:**
  - Fixed the issue where unnecessary updates and notifications were triggered even when the value had not changed.

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
  - Account sorting added health status priority.
  - Health status now includes more detailed reason information.

## 1.11.0
- **New Features:**
  - Refresh functionality enhanced, now supporting detailed status tracking.
  - Added minimum refresh interval to prevent frequent requests.

## 1.10.0
- **New Features:**
  - Key copying functionality added Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub token management and data fetching functionality.
  - Added user group data conversion and API integration.
  - Implemented model fetching functionality for OneHub sites.

## 1.8.0
- **New Features:**
  - Account Management added site type support.
  - Added site type detection and optimized the automatic detection process.
  - Implemented model pricing functionality for OneHub sites.

## 1.7.1
- **Bug Fixes:**
  - Fixed logic error in using site status detection for check-in support.

## 1.7.0
- **New Features:**
  - Added check-in support detection and switching functionality.
  - Accounts added check-in status support.

## 1.6.0
- **New Features:**
  - Account Management added support for a remarks field.

## 1.5.0
- **Performance Optimization:**
  - Optimized the rendering method of the model list, improving loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed the issue of automatically resetting the detected account status when no existing account was found.

## 1.4.0
- **New Features:**
  - Control panel added copy model name functionality.
  - Added support for Baidu and Yi model providers.

## 1.3.1
- **Bug Fixes:**
  - Updated release PR workflow configuration.

## 1.3.0
- **New Features:**
  - Added WebDAV backup and synchronization functionality.

## 1.2.0
- **New Features:**
  - Added Account Management page, supporting full CRUD (Create, Read, Update, Delete) functionality.
  - Custom dialogs in the popup replaced with direct function calls, simplifying operations.

## 1.1.1
- **Bug Fixes:**
  - Fixed logic for handling missing system names and checks.

## 1.1.0
- **New Features:**
  - Accounts added manual addition support and optimized the UI process.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and a warning prompt when adding an account.
  - Introduced sidebar functionality, replacing the popup's automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized account identification process, now supporting automatic creation of access keys.
  - Account list added sortable headers, copy key dialog, and hover operation buttons.
  - Account Management added a remarks field.
  - Site names are clickable for navigation.
  - Model list supports group selection.
  - Popup page added number scrolling animation and site status indicator.
  - Optimized add/edit account dialog, including recharge Ratio settings and automatic extraction of site name.
  - Fully implemented the Settings page system, supporting user preference persistence and automatic refresh.
  - Enhanced automatic refresh frontend interface and background service.
  - Automatically added `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic updating and deletion of account health status.
  - Supports more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Popup interface refactored to an API Manager style, adding display of today's total consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed model data format incompatibility, `localStorage` access, and API request credential issues.
  - Corrected API authentication methods.
  - Optimized URL input handling and automatic refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**