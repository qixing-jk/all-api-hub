# Changelog

This page records major updates for general users (feature changes / experience optimizations / bug fixes). For a complete history of versions and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip New Users Start Here
- **How to confirm your current version**: Open the extension popup; the title bar will display the version number. You can also view it on the Settings page.
- **How to stop automatically opening this page**: You can control whether to "Automatically open changelog after update" in "Settings → General → Changelog".
- **Troubleshooting issues**: You can enable console logs in "Settings → General → Logs" and attach reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.20.0
- **Experience Optimization:**
  - Key Management: The Group dropdown option when adding a new key will now display both the Group ID and description, making it easier to quickly distinguish and select among multiple groups/routes.
- **Bug Fix:**
  - Account Management: The default setting for "Automatically create default key after adding account" is now set to off when adding a new account. If you wish to automatically generate a default key after adding an account, please enable it manually in the settings.

**Location Tips:**
- Group ID Display: Go to "Settings → Key Management," click "Add New Key," and view the Group dropdown option.
- Automatic Default Key Creation Switch: Located in "Settings → Basic Settings → Account Management → API Key."

## 3.19.0
- **New Feature:**
  - Self-Hosted Site Management: Added support for `Octopus` hosted sites. You can connect to the Octopus backend and import account API keys as Channels in "Channel Management," while also supporting fetching the list of available models.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default), and provided a "Ensure at least one key" one-click option to automatically complete default keys for accounts missing them.
  - AI API Testing: The "Model List Probe" for interface verification supports OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and other interface types, and provides suggestions for available model IDs, reducing manual model guessing.
- **Experience Optimization:**
  - Account Management: Enhanced site/account recognition logic to improve stability in multi-account scenarios on the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-type interfaces to reduce errors or triggering site rate limits caused by frequent refreshing.
  - Channel Management: More precise duplicate detection when creating a Channel, providing a confirmation prompt to avoid mistakenly creating duplicate routes.
- **Bug Fix:**
  - Disabled Accounts: Automatically filter out disabled accounts in key management and other related dropdowns/lists to prevent invalid operations.
  - Language: Fixed an issue where the extension language setting might affect the language value of the webpage itself.

**Location Tips:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Hosted Site Management," select `Octopus` and fill in the `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management."
- Automatic Default Key Creation Switch: Located in "Settings → Basic Settings → Account Management → API Key."
- One-Click Default Key Completion: In "Settings → Key Management," click "Ensure at least one key" in the upper right corner.
- AI API Testing Entry: Right-click menu on the webpage, select "Quickly test AI API functionality availability."

## 3.18.0
- **New Feature:**
  - Balance History: Charts now include a "Currency Unit" toggle (`USD` / `CNY`) and display currency symbols on the axes/tooltips. When `CNY` is selected, conversion is performed based on the account's "Recharge Amount Ratio," making it easier to view trends and reconcile accounts based on monetary value.
- **Experience Optimization:**
  - Tag Filtering: When there are too many tag/account options, the default is changed to "Expand Display" for more intuitive browsing and selection.
  - Tabs: Added left and right scroll buttons to the "Settings" group tags and "Model List" vendor tags, making switching easier in narrow windows.
- **Bug Fix:**
  - Account Management: Site type "Automatic Detection" is more accurate, fixing the frequent unknown site type issues in recent versions.

**Location Tips:**
- Balance History Currency Unit: In the filter area of the "Settings → Balance History" page, under "Currency Unit."
- Account Exchange Rate (Recharge Amount Ratio): In the "Settings → Account Management" add/edit account form, under "Recharge Amount Ratio."

## 3.17.0
- **New Feature:**
  - Balance History: Added the "Balance History" feature (disabled by default), which records daily balance and income/expense snapshots and displays trends in charts. It supports filtering by tags/accounts and time range, and provides convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added settings to control whether to enable it, the retention days, and "End-of-Day Fetch." Note: If you disable "Display Today's Income/Expense" and do not enable "End-of-Day Fetch," the "Daily Income/Expense" chart will have no data.
- **Experience Optimization:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar on small screens/narrow windows.
- **Bug Fix:**
  - Import/Export: Fixed responsive display issues in the export area on some screen sizes.
  - Popup: Fixed layout anomalies where the popup scrollbar position was incorrect.

**Location Tips:**
- Balance History Switch/Retention Days/End-of-Day Fetch: In "Settings → Basic Settings → Balance History."
- Balance History Chart Entry: In "Settings → Balance History."

## 3.16.0
- **New Feature:**
  - Sub2API (JWT Site): Added the Sub2API site type, supporting balance/quota queries. Supports reading console login status via "Automatic Detection," and supports the "Plugin Managed Session (Multi-Account, Recommended)" mode, which allows independent authentication renewal for each account, improving the multi-account experience on the same site.
  - Display Settings: Added the "Display Today's Income/Expense" switch (enabled by default), which can hide and stop fetching statistics like "Today's Consumption/Income," reducing log fetching requests during refresh.
- **Note:**
  - Sub2API currently does not support site check-in/today's usage/income and related features, only providing basic balance/quota queries. Related features will be gradually improved based on site capabilities.
  - The "Plugin Managed Session (Multi-Account)" mode saves the `refresh_token` as a private account credential, and it will be included in export/WebDAV backups. Please ensure the backup files and WebDAV credentials are kept secure.

**Location Tips:**
- Sub2API Addition/Mode Description: In "Settings → Account Management," add/edit an account, selecting Sub2API as the site type. For more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expense Switch: In "Settings → Basic Settings → Display Settings."

## 3.15.1
- **Bug Fix:**
  - Chrome/Edge (MV3): Improved Service Worker stability in the background, reducing the chance of asynchronous scheduled tasks (WebDAV automatic sync / usage sync / model sync / automatic check-in, etc.) being missed due to premature background termination. Related scheduled tasks are automatically resumed after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Feature:**
  - Bookmark Management: Added "Bookmark Management" to save quick links to site consoles/documentation/management pages without needing to create a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now includes an "Account / Bookmark" toggle. Bookmark data is included in backup/restore and WebDAV automatic synchronization.
- **Bug Fix:**
  - Account Refresh: Removed redundant "Today's Income" fetching requests, reducing unnecessary network calls (some sites already return `today_income` in the refresh interface).
  - Automatic Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is 30 seconds. After the update, old configurations will be automatically corrected to the legal range, and related prompt text and documentation have been improved.

::: warning Important: Automatic Refresh Configuration Will Be Forced Adjusted
Feedback indicates that **an excessively short automatic refresh interval can easily trigger site rate limits and impose too large a load on the site.**

v3.15.0 **makes mandatory adjustments to the automatic refresh configuration**:
- Automatic refresh and refresh upon opening the plugin are disabled. If you still need to enable them, you must do so manually.
- The `Refresh Interval` minimum is 60 seconds, and the `Minimum Refresh Interval Protection` minimum is 30 seconds. If your setting before the upgrade was below these thresholds, it will be automatically raised to the minimum value. If your previous setting was within the new legal range, it will remain unaffected.
:::

**Location Tips:**
- Bookmark Management: In "Settings → Bookmark Management"; the top of the popup allows switching between "Account / Bookmark."
- Automatic Refresh: In "Settings → Basic Settings → Automatic Refresh."

## 3.14.0
- **New Feature:**
  - Web AI API Functionality Availability Test (Beta): Added a right-click menu option "Quickly test AI API functionality availability," which opens the test panel directly on the current webpage. Supports filling/pasting `Base URL` and `API Key`, and performs basic capability probes for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible also supports one-click model list fetching).
  - (Optional) Automatic Detection: Can be enabled in "Settings → AI API Testing," where you can configure a URL whitelist. When a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear first. The test panel will only open after confirmation (disabled by default, and Key is not saved).
  - Automatic Check-in: The execution result list now includes more troubleshooting tips—including suggestions for handling common exceptions like "Temporary anti-bot bypass tab was manually closed" and "Access Token invalid," along with documentation links.
- **Bug Fix:**
  - WebDAV: Automatic synchronization migrated from timers to the browser's Alarms API, reducing the probability of missed synchronization due to background sleep/power-saving policies.

**Location Tips:**
- AI API Test Panel: Right-click on any webpage and select "Quickly test AI API functionality availability"; automatic detection settings are in "Settings → AI API Testing."
- Automatic Check-in Tips: View in the execution result list under "Settings → Automatic Check-in."

## 3.13.0
- **New Feature:**
  - Account Management: Added an "Check-in status expired" prompt—an orange warning icon is displayed when the "Checked in today/Not checked in" status was not detected today. Clicking it allows one-click refreshing of the account data, preventing misleading old statuses.
  - Interface: Multi-select controls upgraded to a more compact selector (saves space, supports search, and clearer display of selected items).
- **Bug Fix:**
  - Veloera: Fixed account data refresh and check-in logic to improve availability.
  - Cookie Authentication: Removed the Cookie caching mechanism to reduce exceptions caused by reading old values after a Cookie update.

**Location Tips:**
- Check-in Status Expired Prompt: In the account list under "Settings → Account Management," next to the site information check-in icon.

## 3.12.0
- **New Feature:**
  - Key Management: Added "Export to Kilo Code"—generates Kilo Code / Roo Code `providerProfiles` configuration, supporting copying the `apiConfigs` snippet or downloading the settings JSON for import (import is additive and will not clear existing providers).
- **Bug Fix:**
  - Account Management: Fixed layout overflow issues caused by overly long text like site names, changing to automatic truncation.
  - Dropdown Selector: Optimized empty state prompts and fixed overflow issues when option text is too long.

**Location Tips:**
- Export to Kilo Code: In the key list under "Settings → Key Management," click the Kilo Code icon in the upper right corner of a specific key.

## 3.11.0
- **New Feature:**
  - New API Channel Management: Added "Duplicate Channel" reminder—when a duplicate or similar Channel is detected, a warning dialog will pop up, allowing the user to choose to continue creation or cancel (no longer blocking creation with an error Toast).
- **Bug Fix:**
  - Account Management: Fixed layout overflow issues caused by overly long text like site names, changing to automatic truncation.

## 3.10.0
- **New Feature:**
  - Account Management: Clicking the site link in Incognito Mode will open it within the current Incognito window (convenient for maintaining Incognito login status).
  - Account Management: Disabled accounts also support clicking the site link, allowing them to be used as bookmarks.
  - Usage Analysis: When there is only a single account, charts and lists prioritize displaying the site name (instead of the username) for more intuitive information.
  - Anti-Bot Bypass Helper: The temporary anti-bot bypass window now supports CAP (cap.js) Pow verification, improving success rates.
- **Bug Fix:**
  - Redemption Helper: Prioritized reading the redemption code from the clipboard, improving trigger accuracy.
  - Prompt Overlay: Fixed the Toaster layer issue so prompts are no longer obscured by the webpage.

**Location Tips:**
- Site Link: Click the site name in the account list under "Settings → Account Management."
- Anti-Bot Bypass Helper: Refer to [Cloudflare Anti-Bot Bypass Helper](./cloudflare-helper.md).

## 3.9.0
- **New Feature:**
  - Account Management: Added a new "Manual Balance (USD)" field for accounts—when the site cannot automatically retrieve the balance/quota, this can be manually filled in for display and statistics.
  - Account Management: Added an "Exclude from Total Balance" switch for accounts—used to remove specific accounts from the "Total Balance" statistics (does not affect refresh/check-in and other functions).
  - Settings: Added "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added Log settings, allowing control over whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Automatic Check-in: Related data is refreshed and the interface is synchronized after execution is complete.

**Location Tips:**
- Account Add/Edit: Open add/edit account in "Settings → Account Management."
- Changelog Switch, Log Settings: Configure in "Settings → General."

## 3.8.0
- **New Feature:**
  - Usage Analysis: Added the "Usage Analysis" page to help visualize usage trends across multiple sites and accounts in charts, providing a clear view of "where usage is high / spending is high / slowdowns," facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overview (requests, Tokens, Quota), model distribution/spending distribution, account comparison, usage time hotspots, and latency trends/histograms.
  - Usage History Synchronization: Added "Usage History Synchronization" capability, used to fetch and save "aggregated usage data" (raw logs are not saved). Supports setting retention days, automatic synchronization methods, and minimum synchronization interval, and allows viewing the synchronization results and error prompts for each account in "Sync Status."
- **How to Use:**
  - First, go to "Settings → Account Usage" and enable "Usage History Synchronization," set as needed, and click "Sync Now."
  - Then, go to the left menu "Usage Analysis" to view the charts. Click "Export" when retention or reconciliation is needed.

## 3.7.0
- **New Feature:**
  - Sorting: Account list supports sorting by "Income"; sorting priority added "Disabled Accounts Sink to Bottom," preventing disabled/invalid accounts from interfering with daily use.
  - Automatic Check-in: Added "Pre-trigger today's check-in when interface is opened"—when the popup/sidebar/settings page is opened within the time window, it automatically attempts to run today's check-in once, without waiting for the scheduled time.
- **Bug Fix:**
  - Automatic Check-in: The same account will only execute once per day; retries are only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Tips:**
  - Sorting Priority: Adjust in "Settings → Account Management."
  - Automatic Check-in Pre-trigger/Retry: Configure in the left menu "Automatic Check-in."

## 3.6.0
- **New Feature:**
  - Account Management: Supports one-click enabling/disabling of accounts; after disabling, all functions will skip this account, making it easy to retain data after an account becomes invalid.
  - Tags: Added global tag management, and synchronized optimization of related interfaces and interactions, facilitating categorized management of accounts.
  - Popup: Displays the current version number in the title bar and provides a direct link to this changelog.
  - Quick Export: CCSwitch export supports selecting upstream models, making the exported configuration closer to actual usage scenarios.

## 3.5.2
- **Bug Fix:**
  - Amount Display: Optimized the display strategy for extremely small values to prevent display inconsistencies due to precision/rounding.

## 3.5.1
- **New Feature:**
  - Account Management: Adjusted the position of the "Automatic Check-in" switch (moved above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from dialog title icons for a cleaner, unified visual look.
- **Bug Fix:**
  - Key List: Fixed the issue where closing the dialog would lead to a white screen when expanding key details.

## 3.5.0
- **New Feature:**
  - Automatic Detection: Added a "Slow detection" reminder prompt and related documentation link to help users troubleshoot and resolve issues.
  - External Check-in Batch Open: Supports opening all in new windows, facilitating batch closing and reducing interference.
- **Bug Fix:**
  - External Check-in Batch Open: Refactored the process to execute in the background service, ensuring all sites can be opened correctly in pop-up scenarios.

## 3.4.0
- **New Feature:**
  - CLIProxy: Enhanced model mapping configuration, supporting direct selection of upstream models for more precise model mapping.
- **Bug Fix:**
  - API: Ensured access keys always have the `sk-` prefix to prevent recognition/copying issues due to inconsistent formatting.

## 3.3.0
- **New Feature:**
  - Automatic Check-in: Account recognition now includes "Username" information, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the steps required for individual operations.
  - Automatic Refresh: The minimum refresh interval no longer restricts the maximum value, allowing larger minimum intervals to control the refresh frequency.
- **Bug Fix:**
  - Clipboard Reading: Tightened trigger conditions to reduce false triggers in non-copying scenarios.
  - Redemption Helper: Validated all redemption codes before the popup prompt, reducing invalid redemption prompts.
  - Storage: Added write locks to write operations to improve data consistency during concurrent writes.
  - Interface: Adjusted the localization text related to "Copy Model Name."

## 3.2.0
- **New Feature:**
  - The "Model List" page added "Interface Availability Detection" (Beta), used to quickly confirm whether the current key is available for specified models (e.g., text generation, tool/function calling, structured output (return as JSON structure), web search (Grounding), etc.).
  - The "Model List" page added "CLI Tool Compatibility Detection" (Beta), simulating the tool calling process of Claude Code / Codex CLI / Gemini CLI to evaluate interface compatibility with these tools.
  - The "About" page added "Rating and Download": Automatically identifies the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entries for other stores.
- **Bug Fix:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating troubleshooting.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to prevent redundant opening.

## 3.1.1
- **Bug Fix:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Feature:**
  - Added administrator credential filling guidance in the self-managed API settings.
  - Redemption Helper supports batch redemption and single-code retry.

## 3.0.0
- **New Feature:**
  - Supports normal coexistence and full functionality for multiple cookie-authenticated accounts on a single site, primarily for sites like AnyRouter that only use cookie authentication.
  - Supports setting proxy, model, and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic; the two no longer affect each other.
- **Bug Fix:**
  - Fixed incorrect webpage path redirection for manual check-in on New-API sites.

## 2.39.0
- When refreshing account data, automatically detect and modify the check-in support status of the account site.
- When updating the version, automatically open the changelog page and navigate to the corresponding version anchor.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Helper:
  - Select specific redemption accounts directly using the keyboard up/down keys.
  - Press Enter to confirm redemption.
- Added a prompt to the temporary anti-bot bypass tab, explaining that the current tab is from this plugin and its specific purpose.
- Better anti-bot bypass window display method: single window with multiple tabs, meaning short-term requests will reuse the same window, minimizing interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API Channel Management.
- More lenient redemption code format detection support; when encountering custom redemption code formats, the redemption code can be correctly identified, and the Redemption Helper will pop up.
- Fixed some known issues.

## 2.36.0
- Supports quick jump to specific Channels for management.
- Fixed the issue where Channel model synchronization time would be reset.

## 2.35.1
- Fixed the issue where automatic check-in execution time would be reset.
- UI optimization.

## 2.35.0
- Added optional clipboard reading permission to prompt for redemption when any possible redemption code is copied.
- Added cdk.linux.do to the Redemption Helper default URL whitelist.

## 2.34.0
- **New Feature:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fix:**
  - Fixed an internal error during account ID comparison.
  - Ensured all temporary contexts are correctly closed.

## 2.33.0
- **New Feature:**
  - Added "Temporary Context Mode" to more effectively bypass website protection.
  - API error messages now support internationalization.
  - Optimized website type detection, now supporting identification via the temporary window title.
  - Added optional permission status tracking.
- **Bug Fix:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 2.32.0
- **New Feature:**
  - Model redirection is now smarter, supporting version numbers indicated by hyphens and dots.
  - Added the ability to redeem directly via the right-click menu after selecting text.
  - Automatic check-in is enabled by default, and the check-in time window has been extended.

## 2.31.0
- **New Feature:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Check-in operations can now be quickly executed in the popup.
  - Redemption Helper added a URL whitelist feature, allowing better control over which websites can use the Redemption Helper.

## 2.30.0
- **New Feature:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capability for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, and a decryption retry dialog has been added during recovery. Your WebDAV configuration will also be retained.

## 2.29.0
- **New Feature:**
  - Integrated Claude Code Router.
- **Bug Fix:**
  - Fixed website Cookie interception during automatic detection.
  - Optimized the centering of blank state content in Firefox.
  - Migrated the Switch component to a custom implementation, improving compatibility and stability.

## 2.28.0
- **New Feature:**
  - Introduced the "Hosted Site" service, laying the groundwork for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" to "Hosted Site" in settings for clarity.
- **Bug Fix:**
  - Optimized translated text, removing redundant fallback strings.

## 2.27.0
- **New Feature:**
  - Account health status now includes more detailed codes, allowing you to understand specific issues.
  - Temporary window bypass feature added a health status indicator.
  - Optimized the description of bypassing website protection, making it clearer.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fix:**
  - Ensured consistency in Token selection strategy.
  - Fixed display issues with Firefox popup prompts in Chinese settings.
- **Performance Optimization:**
  - Improved the performance of the sorting function.

## 2.26.0
- **New Feature:**
  - Added model pricing caching service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Model pricing information for multiple accounts can now be displayed simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fix:**
  - Added a customizable loading animation (spinner) property to button components.

## 2.25.0
- **New Feature:**
  - Added a beginner's guide card when the account list is empty.
  - When pinning/manual sorting features are disabled, related UI elements are automatically hidden.
  - You can now manually drag and drop to sort the account list.
- **Bug Fix:**
  - Fixed an issue where the tag array could be empty when updating an account.

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
  - Temporary window bypass feature now supports more intelligent judgment based on error codes.

## 2.22.0
- **New Feature:**
  - Account Management added tagging functionality, making it easy to categorize accounts.
  - Redemption Helper popup UI now supports lazy loading and fixed issues that could cause website style corruption.
  - Added global Channel filter and JSON editing mode.

## 2.21.0
- **New Feature:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fix:**
  - Removed duplicate "Checked in today" check in automatic check-in.
  - Simplified and fixed the temporary window fetching logic.
  - Restored the parsing of search parameters in URL query strings.

## 2.20.0
- **New Feature:**
  - Added permission guidance upon first installation, making it easy to understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fix:**
  - Fixed overflow issues with action buttons in the account dialog.
  - Redemption amount conversion factor now uses constants to improve accuracy.
  - Limited the Cookie interceptor to only be used in the Firefox browser.

## 2.19.0
- **New Feature:**
  - Added loading status and prompt information during the redemption process.
  - Removed the clipboard reading function from the Redemption Helper.
- **Bug Fix:**
  - Supplemented missing background error message translations.
  - Prevented service concurrent initialization and race conditions, improving stability.
  - Resolved intermittent "Could not establish connection" errors.
  - Prevented race conditions during temporary window pool destruction.

## 2.18.0
- **New Feature:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Helper feature.
  - Firefox browser now supports WebRequest-based Cookie injection mechanism.
  - Redemption feature now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and a settings link.
- **Bug Fix:**
  - Fixed path issues with Tailwind CSS files.

## 2.17.0
- **New Feature:**
  - Added automatic popup prompt feature for one-click redemption.
  - Unified data format for import/export and WebDAV backup, adopting V2 versioning scheme to improve compatibility and stability.

## 2.16.0
- **New Feature:**
  - Added a warning prompt when creating an account in Firefox desktop version.
  - API model synchronization now supports the Channel filtering system.

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
  - When automatic check-in fails, added retry and manual check-in options.
  - Enhanced automatic check-in functionality, including retry strategy, skip reasons, and account snapshots.
  - Optimized automatic check-in execution method, changing to concurrent processing to improve efficiency.
- **Bug Fix:**
  - Fixed the default behavior issue of the `autoCheckInEnabled` flag.

## 2.13.0
- **New Feature:**
  - Added "New API Channel Management" feature.
  - Added "Warning" button style.
  - Introduced Radix UI components and Tanstack Table to enhance interface aesthetics and functionality.
- **Bug Fix:**
  - Fixed incorrect model count display and sorting in the Channel table.

## 2.12.1
- **Bug Fix:**
  - Fixed unnecessary Channel reloading when manually selecting tabs.
  - The "New API Model Sync" option is hidden in the sidebar when the configuration is invalid.

## 2.12.0
- **New Feature:**
  - "New API Model Sync" added model allow list filtering.
  - The sidebar now supports collapsing/expanding with smooth animation effects.

## 2.11.0
- **New Feature:**
  - Account Management functionality enhanced, adding search and navigation optimization.
  - Added CC Switch export functionality.
- **Bug Fix:**
  - Fixed automatic check-in status logic error.

## 2.10.0
- **New Feature:**
  - Browser messages now support exponential backoff retry mechanism, improving communication stability.
  - Model synchronization added a manual execution tab, supporting Channel selection.
- **Bug Fix:**
  - Ensured missing fields in user preferences are filled with default values.

## 2.9.0
- **New Feature:**
  - Added Cloudflare challenge detection, and automatically attempts to bypass protection using a temporary window when encountered.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fix:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized the dropdown menu positioning and accessibility of the multi-select component.

## 2.8.0
- **New Feature:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can be saved even if data fetching fails during manual account addition.
  - Settings page added "Settings Partition" feature, supporting resetting settings by area.

## 2.7.1
- **Bug Fix:**
  - Fixed an issue where redirected models did not appear in the model list during API synchronization.

## 2.7.0
- **New Feature:**
  - Account dialog can now dynamically update site data for new accounts.
- **Bug Fix:**
  - Hid the password display button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - `newApiModelSync`, `autoCheckin`, and `modelRedirect` user preferences are now required to ensure the integrity of default configurations.
- **Bug Fix:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed missing "New API Preferences" in configuration checks.
  - Corrected check-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 2.6.0
- **New Feature:**
  - "New API Channel Import" user interface optimized, supporting key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process to improve accuracy.
- **Bug Fix:**
  - Model name standardization now aligns with the Veloera backend and preserves hyphens.
  - Resolved browser storage quota issues and improved model matching.

## 2.5.0
- **New Feature:**
  - Added support for Neo-API site type.
- **Bug Fix:**
  - Fixed Base64 encoding issue during CherryStudio URL generation.
  - Removed redundant account fetching and Token validation in the Channel dialog, improving efficiency.

## 2.4.1
- **Bug Fix:**
  - Ensured the settings page always opens in a new tab.

## 2.4.0
- **New Feature:**
  - Automatic import feature now integrates the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - Multi-select component now supports collapsible selected areas and optimized input experience.
- **Bug Fix:**
  - Optimized retry mechanism and added user feedback.
  - Optimized the performance of the multi-select component with a large number of selections.

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
  - Automatic check-in feature added results/history interface, and optimized default settings and user experience.
  - Implemented daily site automatic check-in, supporting time window settings and status display.
- **Bug Fix:**
  - Fixed case-sensitive issue in automatic check-in status detection.
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
  - Added sync operation button to each row in the results table.
  - Implemented initial service, background logic, and settings interface for "New API Model Sync."
- **Bug Fix:**
  - Row retry operation now only updates the target and progress UI.
  - Updated Channel list response handling and types.

## 1.38.0
- **New Feature:**
  - Supports pinning accounts with custom check-in or redemption URLs configured.
  - Added custom redemption and open tab matching as sorting rules.
- **Bug Fix:**
  - Ensured deep copying of default sorting rules.
  - New sorting conditions are disabled by default after migration.

## 1.37.0
- **New Feature:**
  - Account search functionality enhanced, supporting multi-field composite search across UI interfaces.
  - Added functionality to open the sidebar.
- **Bug Fix:**
  - Supplemented translation for the "Clear" operation.

## 1.36.0
- **New Feature:**
  - Accounts can now be configured with a redemption page path and support jumping to it.
  - Option to automatically open the redemption page after check-in.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fix:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Feature:**
  - Check-in icon updated to a "Yen" icon for better visualization.
- **Bug Fix:**
  - Custom check-in accounts now automatically reset check-in status daily.
  - Fixed the default value issue of the `isCheckedInToday` flag.

## 1.34.0
- **New Feature:**
  - WebDAV now supports automatic synchronization of account data, using a merge strategy.
- **Bug Fix:**
  - Replaced `chrome.runtime` with `browser.runtime` to improve cross-browser compatibility and optimized error handling.

## 1.33.0
- **New Feature:**
  - Introduced reusable `AppLayout` component to improve interface consistency.

## 1.32.1
- **Bug Fix:**
  - Fixed incorrect width of the right content container on small screens.

## 1.32.0
- **New Feature:**
  - Account Management interface layout and responsiveness improved.
  - Added configurable React DevTools automatic plugin and caching.
- **Bug Fix:**
  - Fixed `z-index` issue with mobile sidebar overlay.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Feature:**
  - Account Management added "Create Account" button and optimized layout.
  - Account Management added "Usage Log" feature.
  - Sorting priority settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fix:**
  - Updated SiteInfo icon button size and accessibility labels.

## 1.30.0
- **New Feature:**
  - Dialog components replaced with custom `Modal` component to improve consistency.
  - Added a comprehensive set of UI components to enhance interface aesthetics and development efficiency.
- **Bug Fix:**
  - Corrected check-in logic and sorting priority.
  - Optimized the transparency and layering of the mobile sidebar overlay to improve user experience.

## 1.29.0
- **New Feature:**
  - Popup now supports detection and automatic closing.
  - Popup added mobile responsive layout to avoid needing to zoom on mobile devices.

## 1.28.0
- **New Feature:**
  - Implemented cross-platform intelligent automatic detection functionality.
  - Migrated `chrome.*` API to `browser.*` API, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functional compatibility and user interface design on mobile devices.
- **Bug Fix:**
  - Fixed `tabId` parsing issue after window creation.
  - Prevented button border rotation animation during refresh.

## 1.27.0
- **New Feature:**
  - Account dialog automatically closes after successful automatic configuration to New API.
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
  - Fixed incorrect RMB currency conversion logic.

## 1.23.1
- **Bug Fix:**
  - Amount extraction now supports exchange rate conversion.

## 1.23.0
- **New Feature:**
  - Added Chinese and English localization support.
  - Added language switching functionality, supporting Suspense loading.
- **Bug Fix:**
  - Completed internationalization of remaining hardcoded text.
  - Fixed issue where success message was still displayed when no accounts were refreshed.

## 1.22.0
- **New Feature:**
  - Account added "Today's Total Income" field and income display interface.
  - Supports redemption code recharge type.
- **Bug Fix:**
  - Fixed rendering logic for custom URL check-in interface.
  - Corrected check-in field name and return structure.

## 1.21.0
- **New Feature:**
  - Added favicon and extension icon to popup, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and popup actions.
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
  - API configuration interface now strictly requires the `authType` field.

## 1.18.0
- **New Feature:**
  - Account added custom check-in button (with Yen icon).
  - Implemented versioned configuration migration system to ensure compatibility during updates.
  - Sorting functionality added custom check-in URL as a sorting condition.
- **Bug Fix:**
  - Fixed issue where custom check-in URL was not correctly passed to the handler.

## 1.17.0
- **New Feature:**
  - Accounts now support selecting authentication type.
  - API authentication options added "No Authentication" type.
  - Tooltip component migrated to `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Feature:**
  - "New API" feature added account automatic configuration support.
  - Site accounts added check-in functionality.
  - Implemented a customizable sorting priority system.

## 1.15.0
- **Bug Fix:**
  - Fixed issue where unnecessary updates and notifications were triggered even when the value had not changed.

## 1.14.0
- **New Feature:**
  - Added tab activation and update listeners for automatic detection.

## 1.13.0
- **New Feature:**
  - Added "New API" integration, supporting Token import.
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
  - Key copy functionality added Cherry Studio integration.

## 1.9.0
- **New Feature:**
  - Added OneHub Token management and data fetching functionality.
  - Added user Group data conversion and API integration.
  - Implemented model fetching functionality for OneHub sites.

## 1.8.0
- **New Feature:**
  - Account Management added site type support.
  - Added site type detection and optimized automatic detection process.
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
  - Account Management added remark field support.

## 1.5.0
- **Performance Optimization:**
  - Optimized model list rendering method, improving loading performance.

## 1.4.1
- **Bug Fix:**
  - Fixed issue where the detected account status was automatically reset when an existing account was not found.

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
  - Custom dialogs in the popup replaced with direct function calls, simplifying operations.

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
  - Introduced sidebar functionality, replacing the popup's automatic site configuration.

## 0.0.3
- **New Feature:**
  - Optimized account recognition process, now supporting automatic creation of access keys.
  - Account list added sortable table headers, copy key dialog, and hover action buttons.
  - Account Management added remark field.
  - Website names are clickable for navigation.
  - Model list supports Group selection.
  - Popup page added number scrolling animation and site status indicator.
  - Optimized add/edit account dialog, including recharge ratio settings and automatic site name extraction.
  - Fully implemented the Settings page system, supporting user preference persistence and automatic refresh.
  - Enhanced automatic refresh functionality for both frontend interface and background service.
  - Automatically added `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic update and deletion of account health status.
  - Supported more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Popup interface refactored to an API Manager style, adding display of today's total consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fix:**
  - Fixed model data format incompatibility, `localStorage` access, and API request credential issues.
  - Corrected API authentication method.
  - Optimized URL input handling and automatic refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**