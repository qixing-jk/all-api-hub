# Changelog

This page records major updates for general users (feature changes / experience optimizations / bug fixes). For a complete history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip New Users Start Here
- **How to confirm your current version**: Open the extension pop-up; the version number is displayed in the title bar; you can also view it on the Settings page.
- **Automatically open this page after update**: You can control whether to "Automatically open the changelog after update" in "Settings → General → Changelog".
- **Troubleshooting issues**: You can enable console logs in "Settings → General → Logs" and attach reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" warning—a warning dialog will pop up when identical/similar channels are detected, allowing you to choose whether to continue creation or cancel (no longer blocking creation with an error Toast).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow caused by excessively long text, such as site names; now automatically truncates display.

## 3.10.0
- **New Features:**
  - Account Management: Clicking site links in Incognito mode will open them within the current Incognito window (to maintain the Incognito login state).
  - Account Management: Disabled accounts also support clicking site links, making them useful as bookmarks.
  - Usage Analysis: When there is only a single account, charts and lists prioritize displaying the site name (instead of the username) for more intuitive information.
  - Bypass Helper: The temporary bypass window now supports CAP (cap.js) Proof-of-Work verification, improving success rates.
- **Bug Fixes:**
  - Redemption Helper: Prioritizes reading the redemption code from the clipboard, improving trigger accuracy.
  - Notification Overlay: Fixed the Toaster layer issue, so notifications are no longer obscured by the webpage.

**Position Tips:**
- Site Link: Click the site name in the account list under "Settings → Account Management".
- Bypass Helper: Refer to [Cloudflare Bypass Helper](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added a "Manual Balance (USD)" field to accounts—when the site cannot automatically retrieve the balance/quota, you can manually fill it in for display and statistics.
  - Account Management: Added an "Exclude from Total Balance" switch to accounts—used to remove specific accounts from the "Total Balance" statistics (does not affect functions like refresh/check-in).
  - Settings: Added an "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added Log settings, allowing control over whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Automatic Check-in: After execution, relevant data will be refreshed, and the interface will be updated synchronously.

**Position Tips:**
- Add/Edit Account: Open Add/Edit Account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added the "Usage Analysis" page to help you chart usage trends across multiple sites and accounts, providing an immediate view of "where usage is high / spending is high / performance is slow," facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (requests, Tokens, Quota), model distribution/spending distribution, account comparison, usage time hotspots, and latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability, used to fetch and save "aggregated usage data" (raw logs are not saved); supports setting retention days, automatic sync method, and minimum sync interval, and viewing the sync result and error message for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage" to enable "Usage History Sync," configure as needed, and click "Sync Now."
  - Then, go to the left menu "Usage Analysis" to view charts; click "Export" when you need to retain data or perform reconciliation.

## 3.7.0
- **New Features:**
  - Sorting: The account list supports sorting by "Revenue"; sorting priority now includes "Disabled Accounts to Bottom," preventing deactivated/invalid accounts from interfering with your daily use.
  - Automatic Check-in: Added "Pre-trigger today's check-in when opening the interface"—when opening the pop-up/sidebar/settings page within the time window, it will automatically attempt to run today's check-in once, without waiting for the scheduled time.
- **Bug Fixes:**
  - Automatic Check-in: Each account will only execute once per day; retries are only performed for failed accounts, reducing meaningless requests and repeated disturbances.
- **Position Tips:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Automatic Check-in Pre-trigger/Retry: Configure in the left menu "Automatic Check-in".

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enabling/disabling of accounts; when disabled, all functions will skip this account, making it easy to retain data after an account expires.
  - Tags: Added global tag management and optimized related interfaces and interactions, making it easier to categorize accounts.
  - Pop-up: Displays the current version number in the title bar and provides a direct link to this changelog.
  - Quick Export: CCSwitch export supports selecting upstream models, making the exported configuration closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to prevent display inconsistencies due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Automatic Check-in" switch (moved it above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background color from dialog title icons for a cleaner, unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Automatic Detection: Added a "Slower Detection" warning and a link to relevant documentation to help users troubleshoot and resolve issues.
  - External Check-in Batch Open: Supports opening all links in new windows, facilitating batch closing and reducing interference.
- **Bug Fixes:**
  - External Check-in Batch Open: The process was refactored to execute in the background service, ensuring all sites can be opened correctly in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to support direct selection of upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured access keys always start with the `sk-` prefix, preventing identification/copying issues due to inconsistent formatting.

## 3.3.0
- **New Features:**
  - Automatic Check-in: Account identification now includes "Username" information, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the steps required for individual operations.
  - Automatic Refresh: The minimum refresh interval no longer limits the maximum value, allowing larger minimum intervals to be set to control the refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce false triggers in non-copy scenarios.
  - Redemption Helper: Validates all redemption codes before displaying the pop-up prompt, reducing invalid redemption alerts.
  - Storage: Added write locks to write operations to improve data consistency during concurrent writes.
  - Interface: Adjusted the localized text for "Copy Model Name."

## 3.2.0
- **New Features:**
  - The "Model List" page added "API Availability Check" (Beta), used to quickly confirm whether the current key is available for specified models (e.g., text generation, tool/function calling, structured output (return as JSON structure), web search (Grounding), etc.).
  - The "Model List" page added "CLI Tool Compatibility Check" (Beta), simulating the tool calling process of Claude Code / Codex CLI / Gemini CLI to evaluate interface compatibility within these tools.
  - The "About" page added "Rating and Download": Automatically identifies the current store source (Chrome / Edge / Firefox) and provides one-click rating and download links for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating problem location.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to prevent redundant opening.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie retrieval failures caused by insufficient permissions.

## 3.1.0
- **New Features:**
  - Added guidance for filling in administrator credentials in the Self-Managed API Settings.
  - Redemption Helper supports batch redemption and single-code retry.

## 3.0.0
- **New Features:**
  - Supports the normal coexistence and availability of various functions for multiple cookie-authenticated accounts on a single site, primarily for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy, model, and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic; the two no longer affect each other.
- **Bug Fixes:**
  - Fixed the incorrect web page path redirection for manual check-in on New-API sites.

## 2.39.0
- Added automatic detection and modification of check-in support status for account sites when account data is refreshed.
- Automatically opens the changelog page and navigates to the corresponding version anchor upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Helper:
  - Select specific redemption accounts directly using the keyboard up/down keys.
  - Press Enter to confirm redemption.
- Added a prompt to the temporary bypass tab, explaining that the current tab is from this extension and its specific purpose.
- Better bypass window display method: single window with multiple tabs, meaning short-term requests will reuse the same window, minimizing interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized the user experience for New-API Channel Management.
- More lenient redemption code format detection options are supported; when encountering custom redemption code formats, the redemption code can be correctly identified, and the Redemption Helper will pop up.
- Fixed some known issues.

## 2.36.0
- Supports quick jump to specific Channels for management.
- Fixed the issue where channel model sync time would be reset.

## 2.35.1
- Fixed the issue where automatic check-in execution time would be reset.
- UI optimization.

## 2.35.0
- Added optional clipboard read permission to prompt for redemption when any possible redemption code is copied.
- Added cdk.linux.do to the Redemption Helper default URL whitelist.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the extension icon, choosing to open the pop-up or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error during account ID comparison.
  - Ensured all temporary contexts are correctly closed.

## 2.33.0
- **New Features:**
  - Added "Temporary Context Mode" to bypass website protection more effectively.
  - API error messages now support internationalization.
  - Optimized website type detection; now supports identification via the temporary window title.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 3.32.0
- **New Features:**
  - Model redirection is now smarter, supporting version numbers indicated by hyphens and dots.
  - Added the ability to redeem directly via the right-click menu after selecting text.
  - Automatic check-in is enabled by default, and the check-in time window has been extended.

## 3.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Check-in operations can now be executed quickly in the pop-up window.
  - Redemption Helper added a URL whitelist feature, allowing better control over which websites can use the helper.

## 3.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capability for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, and a decryption retry dialog is added during recovery, while retaining your WebDAV configuration.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed the website Cookie interception issue during automatic detection.
  - Optimized the centering of blank status content in Firefox.
  - Migrated the Switch component to a custom implementation, improving compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced the "Managed Sites" service, laying the foundation for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" to "Managed Sites" in settings for clearer understanding.
- **Bug Fixes:**
  - Optimized translation text, removing redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes, allowing you to understand specific issues.
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
  - Added an account overview bar at the top of the model list for quick viewing.
  - Now supports displaying model pricing information for multiple accounts simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 2.25.0
- **New Features:**
  - Added a beginner's guide card when the account list is empty.
  - Related UI elements will automatically hide when pinning/manual sorting features are disabled.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

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
  - Account Management added a tagging feature for account classification.
  - Redemption Helper pop-up UI now supports lazy loading and fixed potential issues causing website style corruption.
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
  - Added permission guidance upon first installation, helping users understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed the issue of operation button overflow in the account dialog.
  - Redemption amount conversion coefficient now uses constants for improved accuracy.
  - Restricted the Cookie interceptor to only be used in the Firefox browser.

## 2.19.0
- **New Features:**
  - Added loading status and prompt information during the redemption process.
  - Removed the clipboard reading function from the Redemption Helper.
- **Bug Fixes:**
  - Supplemented missing background error message translations.
  - Prevented service concurrent initialization and race conditions, improving stability.
  - Resolved intermittent "Unable to establish connection" errors.
  - Prevented race conditions during temporary window pool destruction.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Helper feature.
  - Firefox browser now supports WebRequest-based Cookie injection mechanism.
  - Redemption feature now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and a settings link.
- **Bug Fixes:**
  - Fixed the path issue for Tailwind CSS files.

## 2.17.0
- **New Features:**
  - Added automatic pop-up prompt for one-click redemption.
  - Unified data format for Import/Export and WebDAV Backup, adopting V2 versioning scheme, improving compatibility and stability.

## 2.16.0
- **New Features:**
  - Added a warning prompt when creating an account in Firefox desktop.
  - API model sync now supports a channel filtering system.

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
  - Model sync added a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection and automatically attempts to bypass via a temporary window when protection is encountered.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support "month-day" and "month_day" date suffix patterns.
  - Optimized dropdown menu positioning and accessibility for the MultiSelect component.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can be saved even if data fetching fails when manually adding an account.
  - Settings page added "Settings Partition" feature, supporting resetting settings by area.

## 2.7.1
- **Bug Fixes:**
  - Fixed an issue where redirected models did not appear in the model list during API sync.

## 2.7.0
- **New Features:**
  - Account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hidden the password display button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - `newApiModelSync`, `autoCheckin`, and `modelRedirect` user preferences are now required to ensure default configuration completeness.
- **Bug Fixes:**
  - Enhanced robustness of configuration migration checks.
  - Fixed missing "New API Preferences" in configuration checks.
  - Corrected check-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration reset during configuration migration.

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
  - Automatic import feature now integrates the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - MultiSelect component now supports collapsible selected areas and optimized input experience.
- **Bug Fixes:**
  - Optimized retry mechanism and added user feedback.
  - Optimized MultiSelect component performance with a large number of selections.

## 2.3.0
- **New Features:**
  - Added account pinning and unpinning features, supporting priority sorting for pinned accounts.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration, increasing the priority of the current site condition.

## 2.2.1
- **Bug Fixes:**
  - Removed the `isDetected` check for the auto-configure button.
  - Ensured account detection refreshes correctly when displaying data changes.
  - Fixed the issue where Access Token is no longer required for Cookie authentication type.

## 2.2.0
- **New Features:**
  - Automatic Check-in feature added results/history interface and optimized default settings and user experience.
  - Implemented daily site automatic check-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case sensitivity issue in automatic check-in status detection.
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
  - Added sync operation button to each row in the results table.
  - Implemented initial service, background logic, and settings interface for "New API Model Sync."
- **Bug Fixes:**
  - Row retry operation now only updates the target and progress UI.
  - Updated channel list response handling and types.

## 1.38.0
- **New Features:**
  - Supports pinning accounts with custom check-in or redemption URLs configured.
  - Added custom redemption and open tab matching as sorting rules.
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
  - Accounts can now be configured with a redemption page path, supporting redirection.
  - Option to automatically open the redemption page after check-in.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - Check-in icon updated to a "Yen" icon for better visualization.
- **Bug Fixes:**
  - Custom check-in accounts now automatically reset check-in status daily.
  - Fixed the default value issue for the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic account data synchronization, adopting a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` to improve cross-browser compatibility and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced reusable `AppLayout` component, improving interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed incorrect width of the right content container on small screens.

## 1.32.0
- **New Features:**
  - Improved layout and responsiveness of the Account Management interface.
  - Added configurable React DevTools automatic plugin and caching.
- **Bug Fixes:**
  - Fixed mobile sidebar overlay `z-index` issue.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Account Management added a "Create Account" button and optimized the layout.
  - Account Management added "Usage Log" functionality.
  - Sorting Priority settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fixes:**
  - Updated the size and accessibility labels for the SiteInfo icon button.

## 1.30.0
- **New Features:**
  - Dialog components replaced with custom `Modal` component, improving consistency.
  - Added a comprehensive set of UI components, enhancing interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priority.
  - Optimized mobile sidebar overlay transparency and layering, improving user experience.

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
  - Account dialog automatically closes after successful automatic configuration to the New API.
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
  - Fixed Chinese Yuan currency conversion logic error.

## 1.23.1
- **Bug Fixes:**
  - Amount extraction now supports exchange rate conversion.

## 1.23.0
- **New Features:**
  - Added Chinese and English localization support.
  - Added language switching functionality and supports Suspense loading.
- **Bug Fixes:**
  - Completed internationalization for remaining hardcoded text.
  - Fixed issue where success message was still displayed when no accounts were refreshed.

## 1.22.0
- **New Features:**
  - Account added "Total Revenue Today" field and revenue display interface.
  - Supports redemption code top-up type.
- **Bug Fixes:**
  - Fixed rendering logic for the custom URL check-in interface.
  - Corrected check-in field name and return structure.

## 1.21.0
- **New Features:**
  - Added favicon and extension icon to pop-up, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and pop-up actions.
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
  - API configuration interface now enforces the `authType` field requirement.

## 1.18.0
- **New Features:**
  - Account added custom check-in button (with Yen icon).
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting feature added custom check-in URL as a sorting condition.
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
  - Fixed issue where unnecessary updates and notifications were triggered even when the value had not changed.

## 1.14.0
- **New Features:**
  - Added tab activation and update listeners for automatic detection.

## 1.13.0
- **New Features:**
  - Added "New API" integration, supporting token import.
  - Added "New API" integration settings in preferences.
  - Added password visibility toggle feature.

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
  - Added check-in support detection and toggle functionality.
  - Account added check-in status support.

## 1.6.0
- **New Features:**
  - Account Management added support for a remarks field.

## 1.5.0
- **Performance Optimization:**
  - Optimized the rendering method of the model list, improving loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed issue where the detected account status was automatically reset when no existing account was found.

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
  - Custom dialogs in the pop-up replaced with direct function calls, simplifying operations.

## 1.1.1
- **Bug Fixes:**
  - Fixed logic for handling missing system names and checks.

## 1.1.0
- **New Features:**
  - Account added manual addition support and optimized the UI flow.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and a warning prompt when adding an account.
  - Introduced sidebar functionality, replacing the pop-up's automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized account recognition process, now supporting automatic creation of access keys.
  - Account list added sortable headers, copy key dialog, and hover action buttons.
  - Account Management added a remarks field.
  - Website names are clickable for redirection.
  - Model list supports group selection.
  - Pop-up page added number scrolling animation and site status indicator.
  - Optimized Add/Edit Account dialog, including top-up ratio settings and automatic extraction of site names.
  - Fully implemented the Settings page system, supporting user preference persistence and automatic refresh.
  - Enhanced front-end interface and background service for automatic refresh functionality.
  - Automatically added `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic update and deletion of account health status.
  - Supported more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Pop-up interface refactored to API Manager style, adding display of total amount consumed today.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed model data format incompatibility, `localStorage` access, and API request credential issues.
  - Corrected API authentication method.
  - Optimized URL input handling and automatic refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**