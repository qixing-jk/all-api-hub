# Changelog

This page records major updates for general users (feature changes / experience optimizations / bug fixes). For the complete version history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip First Read for New Users
- **How to confirm your current version**: Open the extension pop-up, and the version number will be displayed in the title bar; you can also view it on the Settings page.
- **Automatically open this page after update**: You can control whether to "Automatically open the changelog after update" in "Settings → General → Changelog".
- **Troubleshooting exceptions**: You can enable console logs in "Settings → General → Logs" and attach the reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.16.0
- **New Features:**
  - Sub2API (JWT Site): Added Sub2API site type, supporting balance/quota queries; supports reading console login status via "Automatic Detection"; and supports "Plugin Managed Session (Multi-Account, Recommended)" mode, allowing independent renewal of authentication for each account, improving the multi-account experience for the same site.
  - Display Settings: Added "Show Today's Income/Expense" switch (enabled by default), which can hide and stop fetching statistics like "Today's Consumption/Income," reducing log fetching requests during refresh.
- **Note:**
  - Sub2API currently does not support site check-in/today's usage/income and related features, only providing basic balance/quota queries. Related features will be gradually improved based on site capabilities.
  - "Plugin Managed Session (Multi-Account)" saves the `refresh_token` as a private account credential, and it will be included in exports/WebDAV backups; please keep backup files and WebDAV credentials secure.

**Location Tips:**
- Sub2API Add/Mode Description: Add/Edit account in "Settings → Account Management," select Sub2API for Site Type; see [FAQ](./faq.md) for more detailed steps (search for "Sub2API").
- Today's Income/Expense Switch: In "Settings → Basic Settings → Display Settings."

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved background Service Worker stability, reducing instances where asynchronous scheduled tasks (WebDAV automatic sync / usage sync / model sync / automatic check-in, etc.) are missed due to premature background termination; and automatically resumes related scheduled tasks after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" for saving quick links to site consoles/documentation/management pages without creating a full account; supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting; the pop-up now includes an "Account / Bookmark" toggle; bookmark data is included in backup/restore and WebDAV automatic synchronization.
- **Bug Fixes:**
  - Account Refresh: Removed redundant "Today's Income" fetching requests, reducing unnecessary network calls (some sites already return `today_income` in the refresh interface).
  - Automatic Refresh: Minimum refresh interval is 60 seconds, and the minimum refresh interval protection is 30 seconds; old configurations will be automatically corrected to the legal range upon update, and related prompt text and documentation have been improved.

::: warning Important: Automatic Refresh Configuration Will Be Forcibly Adjusted
Due to feedback indicating that **too short an automatic refresh interval easily triggers site rate limits and can cause excessive load on the site**,

v3.15.0 **has made mandatory changes to the automatic refresh configuration**:
- Automatic refresh and refresh upon opening the plugin have been disabled. If you still need to enable them, you must manually re-enable them.
- `Refresh Interval` minimum is 60 seconds, `Minimum Refresh Interval Protection` minimum is 30 seconds. If your setting before the upgrade was below these thresholds, it will be automatically raised to the minimum value; if your previous setting was within the new legal range, it will remain unaffected.
:::

**Location Tips:**
- Bookmark Management: In "Settings → Bookmark Management"; toggle between "Account / Bookmark" at the top of the pop-up.
- Automatic Refresh: In "Settings → Basic Settings → Automatic Refresh."

## 3.14.0
- **New Features:**
  - Web AI API Function Availability Test (Beta): Added right-click menu "Quick Test AI API Function Availability," which opens the test panel directly on the current page; supports filling/pasting `Base URL` and `API Key`, and performs basic capability detection for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible also supports one-click fetching of the model list).
  - (Optional) Automatic Detection: Can be enabled in "Settings → AI API Test," along with configuring a URL whitelist; when a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (disabled by default, and Key is not saved).
  - Automatic Check-in: The execution result list now includes more troubleshooting tips—including suggestions for handling common exceptions like "Temporary bypass tab manually closed" and "Access Token invalid," along with documentation links.
- **Bug Fixes:**
  - WebDAV: Automatic synchronization migrated from timers to the browser's Alarms API, reducing the probability of missed synchronization due to background sleep/power-saving policies.

**Location Tips:**
- AI API Test Panel: Right-click on any webpage and select "Quick Test AI API Function Availability"; automatic detection settings are in "Settings → AI API Test."
- Automatic Check-in Tips: View in the execution result list in "Settings → Automatic Check-in."

## 3.13.0
- **New Features:**
  - Account Management: Added "Check-in status expired" warning—an orange warning icon is displayed when the "Checked in today/Not checked in" status was not detected today; clicking it refreshes the account data instantly, preventing misleading old statuses.
  - Interface: Multi-select controls upgraded to a more compact selector (saves space, supports search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and check-in logic, improving availability.
  - Cookie Authentication: Removed the Cookie caching mechanism, reducing exceptions caused by reading old values after Cookie updates.

**Location Tips:**
- Check-in Status Expired Warning: In the account list in "Settings → Account Management," next to the check-in icon on the right side of the site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code"—generates providerProfiles configuration for Kilo Code / Roo Code, supporting copying the apiConfigs snippet or downloading settings JSON for import (import is additive, existing providers will not be cleared).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long text like site names, changing to automatic truncation.
  - Dropdown Selector: Optimized empty state prompts and fixed overflow issues when option text is too long.

**Location Tips:**
- Export to Kilo Code: In the key list in "Settings → Key Management," click the Kilo Code icon in the upper right corner of a specific key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder—a warning dialog pops up when the existence of the same/similar channel is detected, allowing the user to choose to continue creation or cancel (no longer blocked by an error Toast).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long text like site names, changing to automatic truncation.

## 3.10.0
- **New Features:**
  - Account Management: Clicking site links in Incognito mode opens them within the current Incognito window (facilitating persistent Incognito login status).
  - Account Management: Disabled accounts also support clicking site links, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, charts and lists prioritize displaying the site name (instead of the username), making the information more intuitive.
  - Cloudflare Helper: The temporary bypass window now supports CAP (cap.js) Pow verification, improving success rate.
- **Bug Fixes:**
  - Exchange Helper: Prioritizes reading the exchange code from the clipboard, improving trigger accuracy.
  - Prompt Overlay: Fixed Toaster layer issues, preventing prompts from being obscured by the webpage.

**Location Tips:**
- Site Link: Click the site name in the account list in "Settings → Account Management."
- Cloudflare Helper: Refer to [Cloudflare Helper](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added "Manual Balance (USD)" field to accounts—allows manual entry for display and statistics when the site cannot automatically retrieve balance/quota.
  - Account Management: Added "Exclude from Total Balance" switch to accounts—used to remove specific accounts from the "Total Balance" statistics (does not affect refresh/check-in and other functions).
  - Settings: Added "Automatically open changelog after update" switch (allows disabling the behavior of automatically opening this page after an update).
  - Settings: Added Log settings, allowing control over whether console logs are output and the minimum log level, facilitating troubleshooting.
  - Automatic Check-in: Refreshes related data and synchronizes the interface upon execution completion.

**Location Tips:**
- Account Add/Edit: Open Add/Edit Account in "Settings → Account Management."
- Changelog Switch, Log Settings: Configure in "Settings → General."

## 3.8.0
- **New Features:**
  - Usage Analysis: Added a "Usage Analysis" page to chart usage trends across multiple sites and accounts, providing an immediate view of "where usage is high / spending is high / slowdowns occurred," facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overview (requests, Tokens, quota), model distribution/spending distribution, account comparison, usage time hotspots, and latency trends/histograms.
  - Usage History Sync: Added "Usage History Sync" capability, used to fetch and save "aggregated usage data" (does not save raw logs); supports setting retention days, automatic synchronization method, and minimum synchronization interval, and allows viewing synchronization results and error prompts for each account in "Sync Status."
- **How to Use:**
  - First, go to "Settings → Account Usage" and enable "Usage History Sync," set as needed, and click "Sync Now."
  - Then, go to the left menu "Usage Analysis" to view charts; click "Export" when retention or reconciliation is needed.

## 3.7.0
- **New Features:**
  - Sorting: Account list supports sorting by "Income"; sorting priority added "Disabled Accounts Sink to Bottom," preventing deactivated/invalid accounts from interfering with daily use.
  - Automatic Check-in: Added "Pre-trigger today's check-in when opening the interface"—automatically attempts to run today's check-in once when opening the pop-up/sidebar/settings page within the time window, without waiting for the scheduled time.
- **Bug Fixes:**
  - Automatic Check-in: Each account will only execute once per day; retry is only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Tips:**
  - Sorting Priority: Adjust in "Settings → Account Management."
  - Automatic Check-in Pre-trigger/Retry: Configure in the left menu "Automatic Check-in."

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enabling/disabling of accounts; disabled accounts will be skipped by all functions, allowing data retention after an account expires.
  - Tags: Added global tag management, and synchronized optimization of related interfaces and interactions, facilitating categorized account management.
  - Pop-up: Displays the current version number in the title bar and provides a direct link to this changelog.
  - Quick Export: CCSwitch export supports selecting upstream models, making the export configuration closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to prevent display inconsistencies due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Automatic Check-in" switch (moved above the custom check-in URL), making configuration more intuitive.
  - Interface: Removed gradient background color from dialog title icons, resulting in a cleaner, unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would lead to a white screen.

## 3.5.0
- **New Features:**
  - Automatic Detection: Added a "Detection is slow" reminder prompt and related documentation link to help users troubleshoot and resolve issues.
  - External Check-in Batch Open: Supports opening all in new windows, facilitating batch closing and reducing interference.
- **Bug Fixes:**
  - External Check-in Batch Open: The process was refactored to execute in the background service, ensuring all sites can be opened correctly in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration, supporting direct selection of upstream models for more precise model mapping.
- **Bug Fixes:**
  - API: Ensured access keys always have the `sk-` prefix, preventing identification/copying issues due to inconsistent formatting.

## 3.3.0
- **New Features:**
  - Automatic Check-in: Account identification now includes "Username" information, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-in, reducing the steps required for individual operations.
  - Automatic Refresh: The minimum refresh interval no longer limits the maximum value, allowing for a larger minimum interval to control the refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce false triggers in non-copying scenarios.
  - Exchange Helper: Validates all exchange codes before the pop-up prompt, reducing invalid exchange prompts.
  - Storage: Added write locks to write operations to improve data consistency during concurrent writes.
  - Interface: Adjusted the localization text related to "Copy Model Name."

## 3.2.0
- **New Features:**
  - The "Model List" page added "Interface Availability Detection" (Beta), used to quickly confirm whether the current key is available for specified models (e.g., Text Generation, Tool/Function Calling, Structured Output (Return as JSON Structure), Web Search (Grounding), etc.).
  - The "Model List" page added "CLI Tool Compatibility Detection" (Beta), simulating the tool calling process of Claude Code / Codex CLI / Gemini CLI to evaluate interface compatibility with these tools.
  - The "About" page added "Rating and Download": Automatically identifies the current store source (Chrome / Edge / Firefox) and provides one-click rating and download links for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating troubleshooting.
  - The "Open in Sidebar" button is no longer displayed in sidebar mode, preventing redundant opening.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`), reducing Cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Features:**
  - Added administrator credential filling guidance in Self-Managed API Settings.
  - Exchange Helper supports batch exchange and single-code retry.

## 3.0.0
- **New Features:**
  - Supports the normal coexistence and full functionality of multiple cookie-authenticated accounts for a single site, primarily for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy, model, and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic; they no longer affect each other.
- **Bug Fixes:**
  - Fixed the incorrect web path redirection for manual check-in on New-API sites.

## 2.39.0
- Added automatic detection and modification of account site check-in support status during account data refresh.
- Automatically opens the changelog page and navigates to the corresponding version anchor upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation in the Exchange Helper:
  - Select specific exchange accounts directly using the keyboard up/down keys.
  - Press Enter to confirm the exchange.
- Added a prompt to the temporary bypass tab, explaining that the current tab is from this plugin and its specific purpose.
- Better display method for the bypass window: single window with multiple tabs, meaning short-term requests will reuse the same window, minimizing interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API Channel Management.
- More lenient exchange code format detection support; when encountering custom exchange code formats, the exchange code can be correctly identified, and the Exchange Helper will pop up.
- Fixed some known issues.

## 2.36.0
- Supports quick jump to specific channels for management.
- Fixed the issue where channel model synchronization time would be reset.

## 2.35.1
- Fixed the issue where automatic check-in execution time would be reset.
- UI optimization.

## 2.35.0
- Added optional clipboard read permission to prompt for exchange when any possible exchange code is copied.
- Added cdk.linux.do to the Exchange Helper default URL whitelist.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the pop-up or the sidebar.
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
  - Added the ability to exchange directly via the right-click menu after selecting text.
  - Automatic check-in is enabled by default, and the check-in time window has been extended.

## 2.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Check-in operation can now be quickly executed in the pop-up.
  - Exchange Helper added a URL whitelist feature, allowing better control over which websites can use the Exchange Helper.

## 2.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capability for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, and a decryption retry dialog is added during recovery, while retaining your WebDAV configuration.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website Cookie interception during automatic detection.
  - Optimized centering of blank state content in Firefox.
  - Migrated the Switch component to a custom implementation, improving compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced the "Managed Site" service, laying the foundation for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" in settings to "Managed Site" for clarity.
- **Bug Fixes:**
  - Optimized translation text, removing redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes, making it easier to understand specific issues.
  - Temporary window bypass feature added a health status indicator.
  - Optimized the description of bypassing website protection, making it clearer.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed the display issue of Firefox pop-up prompts in Chinese settings.
- **Performance Optimization:**
  - Improved sorting function performance.

## 2.26.0
- **New Features:**
  - Added model pricing caching service to speed up data loading.
  - Account overview bar added to the top of the model list for quick viewing.
  - Now supports displaying model pricing information for multiple accounts simultaneously.
  - Introduced new command and dialog UI components.
  - Added searchable selection components to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 2.25.0
- **New Features:**
  - Added a novice guide card when the account list is empty.
  - Related UI elements are automatically hidden when pinning/manual sorting features are disabled.
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
  - Account Management added tagging functionality to facilitate account categorization.
  - Exchange Helper pop-up UI now supports lazy loading and fixed issues that might cause website style corruption.
  - Added global channel filter and JSON editing mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed redundant "Checked in today" check in automatic check-in.
  - Simplified and fixed the temporary window fetching logic.
  - Restored the parsing of search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guidance upon first installation to inform users of required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed overflow of action buttons in the account dialog.
  - Exchange amount conversion factor now uses constants to improve accuracy.
  - Restricted the Cookie interceptor to Firefox browser only.

## 2.19.0
- **New Features:**
  - Added loading status and prompt information during the exchange process.
  - Removed clipboard reading functionality from the Exchange Helper.
- **Bug Fixes:**
  - Added missing background error message translations.
  - Prevented concurrent service initialization and race conditions, improving stability.
  - Resolved intermittent "Could not establish connection" errors.
  - Prevented race conditions during temporary window pool destruction.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Exchange Helper feature.
  - Firefox browser now supports WebRequest-based Cookie injection mechanism.
  - Exchange feature now supports themes and optimized prompt messages.
  - Exchange prompt messages now include source information and settings links.
- **Bug Fixes:**
  - Fixed path issues for Tailwind CSS files.

## 2.17.0
- **New Features:**
  - Added automatic pop-up prompt feature for one-click exchange.
  - Unified data format for Import/Export and WebDAV backup, adopting V2 versioning for improved compatibility and stability.

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
  - Enhanced automatic check-in feature, including retry strategy, skip reasons, and account snapshots.
  - Optimized automatic check-in execution method to concurrent processing, improving efficiency.
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
  - The "New API Model Sync" option is hidden in the sidebar when the configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Sync" added model allow list filtering.
  - Sidebar now supports collapsing/expanding with smooth animation effects.

## 2.11.0
- **New Features:**
  - Account Management functionality enhanced, adding search and navigation optimization.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed automatic check-in status logic error.

## 2.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanism, improving communication stability.
  - Model synchronization added a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured missing fields in user preferences are filled with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection and automatically attempts to bypass via a temporary window when protection is encountered.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized dropdown menu positioning and accessibility for multi-select components.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can be saved even if data fetching fails during manual account addition.
  - Settings page added "Settings Partition" feature, supporting resetting settings by region.

## 2.7.1
- **Bug Fixes:**
  - Fixed an issue where redirected models did not appear in the model list during API synchronization.

## 2.7.0
- **New Features:**
  - Account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hidden the password display button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - User preferences such as `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now required to ensure the completeness of default configurations.
- **Bug Fixes:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed the issue of missing "New API Preferences" in configuration checks.
  - Corrected the check-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 2.6.0
- **New Features:**
  - "New API Channel Import" user interface optimized, supporting key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process to improve accuracy.
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
  - Automatic import feature now integrates the "New API Channel" dialog.
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
  - Ensured account detection correctly refreshes when displaying data changes.
  - Fixed the issue where Access Token is no longer required for Cookie authentication type.

## 2.2.0
- **New Features:**
  - Automatic check-in feature added result/history interface, and optimized default settings and user experience.
  - Implemented daily site automatic check-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case-sensitive issue in automatic check-in status detection.
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
  - Supports pinning accounts configured with custom check-in or exchange URLs.
  - Added custom exchange and open tab matching as sorting rules.
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
  - Accounts can now be configured with an exchange page path and support redirection.
  - Option to automatically open the exchange page after check-in.
  - Supports opening both check-in and exchange pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - Check-in icon updated to a "Yen" icon for better visualization.
- **Bug Fixes:**
  - Custom check-in accounts now automatically reset check-in status daily.
  - Fixed the default value issue of the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic account data synchronization with a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` to improve cross-browser compatibility and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced a reusable `AppLayout` component to improve interface consistency.

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
  - Account Management added "Usage Log" functionality.
  - Sorting priority settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fixes:**
  - Updated SiteInfo icon button size and accessibility labels.

## 1.30.0
- **New Features:**
  - Dialog component replaced with a custom `Modal` component for improved consistency.
  - Added a comprehensive set of UI component libraries to enhance interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priority.
  - Optimized mobile sidebar overlay transparency and layering for better user experience.

## 1.29.0
- **New Features:**
  - Pop-up now supports detection and automatic closing.
  - Pop-up added mobile responsive layout to avoid scaling on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent automatic detection functionality.
  - Migrated `chrome.*` API to `browser.*` API, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functional compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed `tabId` parsing issue after window creation.
  - Prevented spinning animation on button borders during refresh.

## 1.27.0
- **New Features:**
  - Account dialog automatically closes after successful automatic configuration to New API.
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
  - Added language switching functionality and supports Suspense loading.
- **Bug Fixes:**
  - Completed internationalization of remaining hardcoded text.
  - Fixed issue where success message was displayed even when no accounts were refreshed.

## 1.22.0
- **New Features:**
  - Account added "Today's Total Income" field and income display interface.
  - Supports exchange code recharge type.
- **Bug Fixes:**
  - Fixed rendering logic for the custom URL check-in interface.
  - Corrected check-in field names and return structure.

## 1.21.0
- **New Features:**
  - Added favicon and extension icon for pop-up, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and pop-up actions.
  - Underlying framework migrated from Plasmo to WXT, bringing better performance and development experience.

## 1.20.0
- **New Features:**
  - Balance and health status indicators added refresh functionality.
  - Action button UI unified and optimized, supporting intelligent key handling.

## 1.19.0
- **New Features:**
  - All components now support dark mode.
  - Implemented a theme system, supporting dark, light, and follow-system modes.
- **Bug Fixes:**
  - API configuration interface now strictly requires the `authType` field.

## 1.18.0
- **New Features:**
  - Account added custom check-in button (with Yen icon).
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting functionality added custom check-in URL as a sorting condition.
- **Bug Fixes:**
  - Fixed issue where custom check-in URL was not correctly passed to the handler.

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
  - Fixed issue where unnecessary updates and notifications were triggered even when values hadn't changed.

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
  - Fixed logical error in using site status detection for check-in support.

## 1.7.0
- **New Features:**
  - Added check-in support detection and toggle functionality.
  - Account added check-in status support.

## 1.6.0
- **New Features:**
  - Account Management added support for the notes field.

## 1.5.0
- **Performance Optimization:**
  - Model list rendering method optimized, improving loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed issue where the detected account status was automatically reset when no existing account was found.

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
  - Account added manual addition support and optimized the UI process.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and warning prompt when adding accounts.
  - Introduced sidebar functionality, replacing the pop-up's automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized account identification process, now supporting automatic creation of access keys.
  - Account list added sortable headers, copy key dialog, and hover action buttons.
  - Account Management added notes field.
  - Website names are clickable for navigation.
  - Model list supports group selection.
  - Pop-up page added number scrolling animation and site status indicator.
  - Optimized Add/Edit Account dialog, including recharge ratio settings and automatic extraction of site names.
  - Fully implemented the Settings page system, supporting user preference persistence and automatic refresh.
  - Enhanced front-end interface and background service for automatic refresh functionality.
  - Automatically added `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Supported more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Pop-up interface refactored to an API Manager style, adding display of today's total consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed model data format incompatibility, `localStorage` access, and API request credential issues.
  - Corrected API authentication methods.
  - Optimized URL input handling and automatic refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**