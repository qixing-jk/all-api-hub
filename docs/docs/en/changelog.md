# Changelog

This page records major updates for general users (feature changes / experience optimizations / bug fixes). For a complete history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip New Users Start Here
- **How to confirm your current version**: Open the extension pop-up; the version number will be displayed in the title bar. You can also view it on the Settings page.
- **Automatically open this page after updating**: You can control whether to "Automatically open the changelog after updating" in "Settings → General → Changelog".
- **Troubleshooting issues**: You can enable console logs in "Settings → General → Logs" and attach the reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved background Service Worker stability, reducing issues where asynchronous scheduled tasks (WebDAV auto-sync / usage sync / model sync / automatic check-in, etc.) are missed due to premature background termination; related scheduled tasks are automatically resumed after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" to save shortcuts for site consoles, documentation, management pages, etc., without needing to create a full account; supports adding/editing/deleting, pinning, tags, search filtering, and drag-and-drop sorting; the pop-up now includes an "Accounts / Bookmarks" toggle; bookmark data is included in backup/restore and WebDAV automatic synchronization.
- **Bug Fixes:**
  - Account Refresh: Removed redundant "today's income" fetching requests, reducing unnecessary network calls (some sites already return `today_income` in the refresh interface).
  - Automatic Refresh: Minimum refresh interval is 60 seconds, and minimum refresh interval protection is 30 seconds; old configurations will be automatically corrected to the legal range upon update, and related prompt text and documentation have been improved.

::: warning Important: Automatic Refresh Configuration Will Be Forcibly Adjusted
Feedback indicates that **overly short automatic refresh intervals easily trigger site rate limits and can cause excessive load on the site.**

v3.15.0 **makes mandatory changes to the automatic refresh configuration**:
- Automatic refresh and refresh-on-plugin-open features have been disabled. If you need to enable them, you must do so manually.
- The `Refresh Interval` minimum is 60 seconds, and the `Minimum Refresh Interval Protection` minimum is 30 seconds. If your setting before the upgrade was below these thresholds, it will be automatically raised to the minimum value; if your previous setting was within the new legal range, it will remain unchanged.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; the pop-up top bar allows switching between "Accounts / Bookmarks".
- Automatic Refresh: In "Settings → Basic Settings → Automatic Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly test AI API functionality availability," which opens the test panel directly on the current webpage; supports filling/pasting `Base URL` and `API Key`, and performs basic capability detection for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible can also pull the model list with one click).
  - (Optional) Automatic Detection: Can be enabled in "Settings → AI API Test," where you can configure a URL whitelist; when a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (default is off, and the Key is never saved).
  - Automatic Check-in: The execution result list now includes more troubleshooting tips—including suggestions for handling common exceptions like "Temporary shield tab manually closed" and "Access Token invalid," along with documentation links.
- **Bug Fixes:**
  - WebDAV: Automatic synchronization migrated from timers to the browser's Alarms API, reducing the probability of missed synchronization caused by background sleep/power saving policies.

**Location Hints:**
- AI API Test Panel: Select "Quickly test AI API functionality availability" from the right-click menu on any webpage; automatic detection settings are in "Settings → AI API Test".
- Automatic Check-in Tips: View in the execution results list in "Settings → Automatic Check-in".

## 3.13.0
- **New Features:**
  - Account Management: Added "Check-in status expired" prompt—an orange warning icon is displayed when the "Checked in today / Not checked in" status was not detected today; clicking it refreshes the account data immediately, preventing misleading old statuses.
  - Interface: Multi-select controls upgraded to a more compact selector (saves space, supports search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and check-in logic to improve availability.
  - Cookie Authentication: Removed the Cookie caching mechanism to reduce exceptions caused by reading old values after Cookie updates.

**Location Hints:**
- Check-in Status Expired Prompt: In the account list in "Settings → Account Management," next to the check-in icon on the right side of the site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code"—generates providerProfiles configuration for Kilo Code / Roo Code, supporting copying the apiConfigs snippet or downloading settings JSON for import (import is additive, will not clear existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by long site names or other text, now automatically truncated.
  - Dropdown Selector: Optimized empty state prompts and fixed overflow issues when option text is too long.

**Location Hints:**
- Export to Kilo Code: In the key list in "Settings → Key Management," click the Kilo Code icon in the top right corner of a specific key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder—a warning dialog pops up when the existence of the same/similar Channel is detected, allowing the user to choose to continue creation or cancel (no longer blocked by an error Toast).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by long site names or other text, now automatically truncated.

## 3.10.0
- **New Features:**
  - Account Management: Clicking a site link in Incognito mode will open it within the current Incognito window (facilitating persistent Incognito login state).
  - Account Management: Disabled accounts also support clicking the site link, allowing them to be used as bookmarks.
  - Usage Analysis: When there is only a single account, charts and lists prioritize displaying the site name (instead of the username) for more intuitive information.
  - Shield Bypass Helper: The temporary shield bypass window now supports CAP (cap.js) Pow verification, improving success rates.
- **Bug Fixes:**
  - Exchange Helper: Prioritized reading the exchange code from the clipboard, improving trigger accuracy.
  - Notification Overlay: Fixed Toaster layer issues, preventing notifications from being obscured by the webpage.

**Location Hints:**
- Site Link: Click the site name in the account list in "Settings → Account Management".
- Shield Bypass Helper: Refer to [Cloudflare Shield Bypass Helper](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added a "Manual Balance (USD)" field to accounts—allows manually filling in the balance for display and statistics when the site cannot automatically retrieve the balance/quota.
  - Account Management: Added an "Exclude from Total Balance" switch to accounts—used to remove specific accounts from the "Total Balance" statistics (does not affect functions like refresh/check-in).
  - Settings: Added a switch for "Automatically open changelog after updating" (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether console logs are output and the minimum log level, facilitating troubleshooting.
  - Automatic Check-in: Related data is refreshed and the interface is synchronized after execution completes.

**Location Hints:**
- Add/Edit Account: Open Add/Edit Account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added the "Usage Analysis" page to chart usage trends across multiple sites and accounts, providing clear visibility into "where usage is high / spending is high / slowdowns," facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overview (requests, Tokens, quota), model distribution/cost distribution, account comparison, usage time heat map, and latency trends/histograms.
  - Usage History Synchronization: Added "Usage History Synchronization" capability, used to pull and save "aggregated usage data" (raw logs are not saved); supports setting retention days, automatic synchronization methods, and minimum synchronization interval, and allows viewing the synchronization results and error prompts for each account in the "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage" to enable "Usage History Synchronization," set preferences as needed, and click "Sync Now."
  - Then, go to the left menu "Usage Analysis" to view the charts; click "Export" when retention or reconciliation is needed.

## 3.7.0
- **New Features:**
  - Sorting: Account list supports sorting by "Income"; sorting priority added "Disabled accounts sink to bottom," preventing deactivated/invalid accounts from interfering with daily use.
  - Automatic Check-in: Added "Pre-trigger today's check-in when opening the interface"—automatically attempts to run today's check-in once when the pop-up/sidebar/settings page is opened within the time window, without waiting for the scheduled time.
- **Bug Fixes:**
  - Automatic Check-in: The same account will only execute once per day; retries are only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Automatic Check-in Pre-trigger/Retry: Configure in the left menu "Automatic Check-in".

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enable/disable of accounts; disabled accounts will be skipped by various functions, allowing data retention after an account becomes invalid.
  - Tags: Added global tag management, and optimized related interface and interaction, making account classification easier.
  - Pop-up: Displays the current version number in the title bar and provides a direct link to this changelog.
  - Quick Export: CCSwitch export supports selecting upstream models, making the export configuration closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to prevent display discrepancies due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Automatic Check-in" switch (moved above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from dialog title icons for a cleaner, unified look.
- **Bug Fixes:**
  - Key List: Fixed the issue where closing the dialog after expanding key details caused a white screen.

## 3.5.0
- **New Features:**
  - Automatic Detection: Added a "Slower detection" prompt reminder and related documentation link to help users troubleshoot and resolve issues.
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
  - Automatic Refresh: The minimum refresh interval no longer has a maximum limit, allowing for larger minimum intervals to control the refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened the trigger conditions to reduce false triggers in non-copy scenarios.
  - Exchange Helper: Validates all exchange codes before prompting the pop-up, reducing invalid exchange prompts.
  - Storage: Added a write lock to write operations to improve data consistency during concurrent writes.
  - Interface: Adjusted the localization text for "Copy Model Name."

## 3.2.0
- **New Features:**
  - The "Model List" page added "Interface Availability Detection" (Beta), used to quickly confirm whether the current key is available for specified models (e.g., text generation, tool/function calling, structured output (return as JSON structure), web search (Grounding) detection items).
  - The "Model List" page added "CLI Tool Compatibility Detection" (Beta), simulating Claude Code / Codex CLI / Gemini CLI tool calling processes to evaluate interface compatibility with these tools.
  - The "About" page added "Rating and Download": automatically identifies the current store source (Chrome / Edge / Firefox) and provides one-click rating and download links for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating troubleshooting.
  - The "Open in Sidebar" button is no longer displayed when in sidebar mode, avoiding duplicate opening.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Features:**
  - Added administrator credentials guidance in the self-managed API settings.
  - Exchange Helper supports batch exchange and single-code retry.

## 3.0.0
- **New Features:**
  - Supports the normal coexistence and full functionality of multiple cookie authentication accounts for a single site, primarily for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy, model, and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic; the two no longer interfere with each other.
- **Bug Fixes:**
  - Fixed the incorrect web page path for manual check-in on New-API sites.

## 2.39.0
- Added automatic detection and modification of account site check-in support status during account data refresh.
- Automatically opens the changelog page and navigates to the corresponding version anchor upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation in the Exchange Helper:
  - Use keyboard up/down keys to select the specific exchange account.
  - Press Enter to confirm the exchange.
- Added a prompt to the temporary shield bypass tab, explaining that the tab is from this plugin and its specific purpose.
- Improved shield bypass window display: single window, multiple tabs, meaning short-term requests will reuse the same window, minimizing interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API Channel Management.
- More lenient exchange code format detection support; when encountering custom exchange code formats, the exchange code can be correctly identified, and the Exchange Helper will pop up.
- Fixed some known issues.

## 2.36.0
- Supports quick jump to specific Channels for management.
- Fixed the issue where Channel model synchronization time was reset.

## 2.35.1
- Fixed the issue where automatic check-in execution time was reset.
- UI optimization.

## 2.35.0
- Added optional clipboard read permission to prompt for exchange when any possible exchange code is copied.
- Added cdk.linux.do to the default URL whitelist for the Exchange Helper.

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
  - Optimized website type detection, now identifiable via the temporary window title.
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
  - WebDAV backup now supports encryption, and a decryption retry dialog has been added during restoration, while also retaining your WebDAV configuration.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website Cookie interception issues during automatic detection.
  - Optimized the centering of blank state content in Firefox.
  - Migrated the Switch component to a custom implementation, improving compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced the "Managed Sites" service, laying the foundation for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" to "Managed Sites" in settings for clarity.
- **Bug Fixes:**
  - Optimized translation text, removing redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes, helping you understand specific issues.
  - Temporary window bypass feature added a health status indicator.
  - Optimized the description of bypassing website protection for clarity.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in Token selection strategy.
  - Fixed the display issue of Firefox pop-up prompts in Chinese settings.
- **Performance Optimization:**
  - Improved sorting function performance.

## 2.26.0
- **New Features:**
  - Added model pricing caching service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Now supports displaying model pricing information for multiple accounts simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable select component to improve selection efficiency.
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
  - WebDAV connection testing now supports more successful status codes.
- **Bug Fixes:**
  - Removed the extra period at the end of JSON strings.

## 2.23.0
- **New Features:**
  - Enhanced account tag functionality.
  - Temporary window bypass feature now supports smarter judgment based on error codes.

## 2.22.0
- **New Features:**
  - Account Management added a tag feature for account classification.
  - Exchange Helper pop-up UI now supports lazy loading and fixed potential issues causing website style corruption.
  - Added global Channel filter and JSON editing mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed duplicate "Checked in today" checks in automatic check-in.
  - Simplified and fixed the temporary window fetching logic.
  - Restored the parsing of search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guidance upon first installation to inform users of required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed the issue where action buttons overflowed in the account dialog.
  - Exchange amount conversion ratio now uses constants to improve accuracy.
  - Restricted the Cookie interceptor to only be used in the Firefox browser.

## 2.19.0
- **New Features:**
  - Added loading status and prompt information during the exchange process.
  - Removed the clipboard reading function from the Exchange Helper.
- **Bug Fixes:**
  - Supplemented missing background error message translations.
  - Prevented concurrent service initialization and race conditions, improving stability.
  - Resolved intermittent "Could not establish connection" errors.
  - Prevented race conditions during temporary window pool destruction.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Exchange Helper feature.
  - Firefox browser now supports WebRequest-based Cookie injection mechanism.
  - Exchange feature now supports themes and optimized prompt information.
  - Exchange prompt information now includes source information and a settings link.
- **Bug Fixes:**
  - Fixed the path issue for Tailwind CSS files.

## 2.17.0
- **New Features:**
  - Added automatic pop-up prompt function for one-click exchange.
  - Unified the data format for import/export and WebDAV backup, adopting the V2 versioning scheme to improve compatibility and stability.

## 2.16.0
- **New Features:**
  - Added a warning prompt when creating an account in Firefox desktop version.
  - API model synchronization now supports a Channel filtering system.

## 2.15.0
- **New Features:**
  - MultiSelect component now supports comma-separated string parsing.
- **Bug Fixes:**
  - Ensured caching only occurs during complete Channel data synchronization.
- **Performance Optimization:**
  - Optimized upstream model caching logic.

## 2.14.0
- **New Features:**
  - Site metadata is automatically detected during refresh.
  - Added retry and manual check-in options when automatic check-in fails.
  - Enhanced automatic check-in functionality, including retry strategy, skip reasons, and account snapshots.
  - Optimized automatic check-in execution method to concurrent processing, improving efficiency.
- **Bug Fixes:**
  - Fixed the default behavior issue of the `autoCheckInEnabled` flag.

## 2.13.0
- **New Features:**
  - Added "New API Channel Management" feature.
  - Added "Warning" button style.
  - Introduced Radix UI components and Tanstack Table, improving interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed incorrect display and sorting of model count in the Channel table.

## 2.12.1
- **Bug Fixes:**
  - Fixed unnecessary Channel reloading when manually selecting tabs.
  - The "New API Model Synchronization" option is hidden in the sidebar when the configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Synchronization" added model allow list filtering.
  - Sidebar now supports collapsing/expanding with smooth animation effects.

## 2.11.0
- **New Features:**
  - Account Management functionality enhanced with search feature and navigation optimization.
  - Added CCSwitch export functionality.
- **Bug Fixes:**
  - Fixed automatic check-in status logic error.

## 2.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanism, improving communication stability.
  - Model synchronization added a manual execution tab and supports Channel selection.
- **Bug Fixes:**
  - Ensured missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection, automatically attempting to bypass via a temporary window when protection is encountered.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized dropdown positioning and accessibility for multi-select components.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can be saved even if data fetching fails during manual account addition.
  - Settings page added "Settings Partition" feature, supporting resetting settings by area.

## 2.7.1
- **Bug Fixes:**
  - Fixed the issue where redirected models did not appear in the model list during API synchronization.

## 2.7.0
- **New Features:**
  - Account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hid the password display button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - User preferences such as `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now mandatory to ensure the integrity of default configurations.
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
  - Added support for Neo-API site type.
- **Bug Fixes:**
  - Fixed Base64 encoding issue during CherryStudio URL generation.
  - Removed redundant account fetching and Token verification in the Channel dialog, improving efficiency.

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
  - Automatic Check-in functionality added a results/history interface, and optimized default settings and user experience.
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
  - Each row in the results table added a synchronization action button.
  - Implemented the initial service, background logic, and settings interface for "New API Model Synchronization".
- **Bug Fixes:**
  - Row retry operations now only update the target and progress UI.
  - Updated Channel list response handling and types.

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
  - Supplemented translation for the "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with an exchange page path and support jumping to it.
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
  - WebDAV now supports automatic synchronization of account data, using a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` to improve cross-browser compatibility, and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced a reusable `AppLayout` component to improve interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed incorrect width of the right content container on small screens.

## 1.32.0
- **New Features:**
  - Layout and responsiveness of the Account Management interface have been improved.
  - Added configurable React DevTools automatic plugin and caching.
- **Bug Fixes:**
  - Fixed mobile sidebar overlay `z-index` issue.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Account Management added a "Create Account" button and optimized the layout.
  - Account Management added a "Usage Log" feature.
  - Sorting priority settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fixes:**
  - Updated the size and accessibility labels for the SiteInfo icon button.

## 1.30.0
- **New Features:**
  - Dialog components replaced with a custom `Modal` component for improved consistency.
  - Added a comprehensive set of UI components to enhance interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priority.
  - Optimized the transparency and layer hierarchy of the mobile sidebar overlay for better user experience.

## 1.29.0
- **New Features:**
  - Pop-ups now support detection and automatic closing.
  - Pop-ups added mobile responsive layout to avoid scaling on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent automatic detection functionality.
  - Migrated `chrome.*` API to `browser.*` API, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functional compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed `tabId` parsing issue after window creation.
  - Prevented button border rotation animation during refresh.

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
  - Improved accessibility of the WebDAV settings form.
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
  - Added language switching function and supports Suspense loading.
- **Bug Fixes:**
  - Completed internationalization for remaining hardcoded text.
  - Fixed the issue where a success message was still displayed when no account was refreshed.

## 1.22.0
- **New Features:**
  - Accounts added "Total Income Today" field and income display interface.
  - Supports exchange code recharge type.
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
  - Action button UI unified and optimized, supporting intelligent key handling.

## 1.19.0
- **New Features:**
  - All components now support dark mode.
  - Implemented a theme system, supporting dark, light, and system-following modes.
- **Bug Fixes:**
  - API configuration interface now strictly requires the `authType` field.

## 1.18.0
- **New Features:**
  - Accounts added a custom check-in button (with a Yen icon).
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting feature added custom check-in URL as a sorting condition.
- **Bug Fixes:**
  - Fixed the issue where the custom check-in URL was not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication type.
  - API authentication options added "No Authentication" type.
  - Tooltip component migrated to the `react-tooltip` library, resolving overflow display issues.

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
  - Added "New API" integration, supporting Token import.
  - Added "New API" integration settings in preferences.
  - Added password visibility toggle function.

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
  - Added OneHub Token management and data fetching functionality.
  - Added user Group data conversion and API integration.
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
  - Accounts added manual addition support and optimized the UI process.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and a warning prompt when adding an account.
  - Introduced sidebar functionality, replacing the pop-up's automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized account identification process, now supporting automatic creation of access keys.
  - Account list added sortable headers, copy key dialog, and hover action buttons.
  - Account Management added a remarks field.
  - Site names are clickable for navigation.
  - Model list supports Group selection.
  - Pop-up page added digital scrolling animation and site status indicator.
  - Optimized Add/Edit Account dialog, including recharge Ratio settings and automatic extraction of site names.
  - Fully implemented the Settings page system, supporting user preference persistence and automatic refresh.
  - Enhanced automatic refresh frontend interface and background service.
  - Automatically added `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Supported more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Pop-up interface refactored to API Manager style, adding display of total consumption amount today.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed model data format incompatibility, `localStorage` access, and API request credential issues.
  - Corrected API authentication methods.
  - Optimized URL input handling and automatic refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**