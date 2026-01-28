# Changelog

This page records the main updates for general users (feature changes / experience optimizations / bug fixes). For a complete version history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip New Users Start Here
- **How to confirm your current version**: Open the extension pop-up; the version number will be displayed in the title bar; you can also view it on the Settings page.
- **Automatically open this page after updating**: You can control whether to "Automatically open the changelog after updating" in 'Settings → General → Changelog'.
- **Troubleshooting Issues**: You can enable console logs in 'Settings → General → Logs' and attach the reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.9.0
- **New Features:**
  - Account management: Added "Manual Balance (USD)" field to accounts — When the site cannot automatically retrieve the balance/quota, you can manually fill it in for display and statistics.
  - Account management: Added "Exclude from Total Balance" toggle to accounts — Used to remove specific accounts from the "Total Balance" statistics (does not affect functions like refresh/check-in).
  - Settings: Added "Automatically open changelog after update" toggle (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings, allowing control over whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Automatic Check-in: Related data will be refreshed and the interface will be synchronously updated upon completion.

**Location Tips:**
- Account Add/Edit: Open Add/Edit Account in 'Settings → Account Management'.
- Changelog toggle, Log settings: Configure in 'Settings → General'.

## 3.8.0
- **New Features:**
  - Usage Analysis: Added the "Usage Analysis" page, which helps chart the usage trends of multiple sites and accounts, allowing you to clearly see "where usage is high / spending is high / performance has slowed down," facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (Requests, Tokens, Quota), Model/Spending distribution, Account comparison, usage time hotspots, and latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability, used to fetch and save "aggregated usage data" (raw logs are not saved); supports setting retention days, automatic sync method, and minimum sync interval, and viewing the sync result and error message for each account in "Sync Status".
- **How to Use:**
  - First, go to 'Settings → Account Usage' to enable "Usage History Sync," set preferences as needed, and click "Sync Now."
  - Then, go to the left menu "Usage Analysis" to view charts; click "Export" when retention or reconciliation is required.

## 3.7.0
- **New Features:**
  - Sorting: Account list supports sorting by "Revenue"; sorting priority now includes "Disabled Accounts to Bottom," ensuring deactivated/expired accounts do not interfere with your daily use.
  - Automatic Check-in: Added "Pre-trigger today's check-in when opening the interface" — when opening the pop-up/sidebar/settings page within the time window, it will automatically attempt to run today's check-in once, without waiting for the scheduled time.
- **Bug Fixes:**
  - Automatic Check-in: Each account will only execute once per day; retries are only for failed accounts, reducing meaningless requests and repeated interruptions.
- **Location Tips:**
  - Sorting Priority: Adjust in 'Settings → Account Management'.
  - Automatic Check-in pre-trigger/retry: Configure in the left menu "Automatic Check-in".

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enable/disable account; after disabling, all functions will skip this account, allowing data retention even after the account expires.
  - Tags: Added global tag management, and synchronously optimized related interfaces and interactions, making it easier to categorize and manage accounts.
  - Pop-up: Displays the current version number in the title bar and provides a direct entry to this changelog.
  - Quick Export: CCSwitch export supports selecting upstream models, making the export configuration closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized display strategy for extremely small values to prevent unexpected display due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Automatic Check-in" toggle (moved it above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from dialog title icons for a cleaner, unified visual look.
- **Bug Fixes:**
  - Key List: Fixed the issue where closing the dialog box while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Auto-detection: Added "Detection Slow" prompt and relevant documentation link to help users troubleshoot and resolve issues.
  - External Check-in Batch Open: Supports opening all in new windows, facilitating batch closing and reducing interference.
- **Bug Fixes:**
  - External Check-in Batch Open: Process refactored to execute in the background service, ensuring all sites can be opened correctly in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration, supporting direct selection of upstream models for more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always start with the `sk-` prefix, preventing identification/copying issues caused by inconsistent formatting.

## 3.3.0
- **New Features:**
  - Automatic Check-in: Account identification now includes "Username" information, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the steps required for individual operations.
  - Automatic Refresh: Minimum refresh interval no longer limits the maximum value, allowing for larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce false triggers in non-copying scenarios.
  - Redemption Assistant: Validated all redemption codes before prompting the pop-up, reducing invalid redemption prompts.
  - Storage: Write operations now include a write lock to improve data consistency during concurrent writes.
  - Interface: Adjusted the localized text related to "Copy Model Name."

## 3.2.0
- **New Features:**
  - Added "API Availability Detection" (Beta) to the "Model List" page, used to quickly confirm whether the current key is available for specified models (e.g., detection items like text generation, tool/function calling, structured output (return as JSON structure), web search (Grounding)).
  - Added "CLI Tool Compatibility Detection" (Beta) to the "Model List" page, simulating the tool calling process of Claude Code / Codex CLI / Gemini CLI to evaluate API compatibility in these tools.
  - Added "Rating and Download" to the "About" page: Automatically identifies the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entries for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating problem location.
  - The "Open in Sidebar" button is no longer displayed in sidebar mode to prevent duplicate opening.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Features:**
  - Added admin credential filling guide in Self-managed API Settings.
  - Redemption Assistant supports batch redemption and single-code retry.

## 3.0.0
- **New Features:**
  - Supports normal coexistence and full functionality for multiple cookie-authenticated accounts on a single site, primarily for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy, model, and model alias list when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic; the two no longer interfere with each other.
- **Bug Fixes:**
  - Fixed the incorrect web page path redirection for manual check-in on the New-API site.

## 2.39.0
- When refreshing account data, automatically detect and modify the check-in support status of the account site.
- When the version updates, automatically open the changelog page and navigate to the corresponding version anchor.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Select specific redemption accounts directly using the up and down arrow keys.
  - Press Enter to confirm redemption.
- Added a prompt for temporary shield bypass tabs, explaining that the current tab is from this extension and its specific purpose.
- Better shield bypass window display method, single window with multiple tabs, meaning short-term requests will reuse the same window, minimizing interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API Channel Management.
- Supports more lenient redemption code format detection options; custom redemption code formats can now be correctly identified, and the Redemption Assistant will pop up.
- Fixed several known issues.

## 2.36.0
- Supports quick jump to specific channels for management.
- Fixed the issue where channel model sync time would be reset.

## 2.35.1
- Fixed the issue where automatic check-in execution time would be reset.
- UI optimization.

## 2.35.0
- Added optional clipboard read permission to prompt for redemption when any potential redemption code is copied.
- Added cdk.linux.do to the Redemption Assistant default URL whitelist.

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
  - Optimized site type detection, which can now be identified via the temporary window title.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 3.32.0
- **New Features:**
  - Model redirection is now smarter, supporting version numbers indicated by hyphens and dots.
  - Added the function to redeem directly via the right-click menu after selecting text.
  - Automatic check-in is enabled by default, and the check-in time window has been extended.

## 3.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Check-in operations can now be quickly executed in the pop-up.
  - Redemption Assistant added a URL whitelist feature, allowing better control over which websites can use the Redemption Assistant.

## 2.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capability for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, and a decryption retry pop-up has been added during recovery, while retaining your WebDAV configuration.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed the issue of site Cookie interception during auto-detection.
  - Optimized the centering of blank status content in Firefox.
  - Migrated the Switch component to a custom implementation, improving compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced "Managed Sites" service, laying the foundation for future site integrations.
  - Added support for Veloera sites.
  - Updated "New API" terminology in Settings to "Managed Sites" for clarity.
- **Bug Fixes:**
  - Optimized translation text, removing redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes, helping you understand specific issues.
  - Temporary window bypass feature added a health status indicator.
  - Optimized the description for bypassing website protection, making it clearer.
  - Added an alert system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed the display issue of Firefox pop-up prompts in Chinese settings.
- **Performance Optimization:**
  - Improved sorting functionality performance.

## 2.26.0
- **New Features:**
  - Added model pricing cache service to speed up data loading.
  - Added an account overview bar at the top of the Model List page for quick viewing.
  - Now supports displaying model pricing information for multiple accounts simultaneously.
  - Introduced new command and dialog UI components.
  - Added searchable selection component, improving selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 2.25.0
- **New Features:**
  - Added a new user guide card when the account list is empty.
  - Related UI elements are automatically hidden when pinning/manual sorting features are disabled.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed the issue where the tag array could be empty when updating an account.

## 2.24.0
- **New Features:**
  - Updated application description and About page content.
  - Extension name now includes a subtitle.
  - Tag filter added visibility control based on row count.
  - WebDAV connection test now supports more successful status codes.
- **Bug Fixes:**
  - Removed the extra period at the end of JSON strings.

## 2.23.0
- **New Features:**
  - Enhanced account tagging functionality.
  - Temporary window bypass feature now supports more intelligent judgment based on error codes.

## 2.22.0
- **New Features:**
  - Account management added tagging functionality, making it easier to categorize accounts.
  - Redemption Assistant pop-up UI now supports lazy loading and fixed issues that could cause website style corruption.
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
  - Added permission guide upon first installation, helping users understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed the issue of operation button overflow in the account dialog.
  - Redemption amount conversion ratio now uses constants, improving accuracy.
  - Limited the Cookie interceptor to Firefox browser only.

## 2.19.0
- **New Features:**
  - Added loading status and prompt messages during the redemption process.
  - Removed clipboard reading functionality from the Redemption Assistant.
- **Bug Fixes:**
  - Added missing background error message translations.
  - Prevented concurrent service initialization and race conditions, improving stability.
  - Resolved intermittent "Could not establish connection" errors.
  - Prevented race conditions during temporary window pool destruction.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Assistant feature.
  - Firefox browser now supports a WebRequest-based Cookie injection mechanism.
  - Redemption feature now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and a link to settings.
- **Bug Fixes:**
  - Fixed path issues for Tailwind CSS files.

## 2.17.0
- **New Features:**
  - Added automatic pop-up prompt feature for one-click redemption.
  - Unified data formats for Import/Export and WebDAV backup, adopting the V2 versioning scheme, improving compatibility and stability.

## 2.16.0
- **New Features:**
  - Added a warning prompt when creating an account in Firefox desktop version.
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
  - Added retry and manual check-in options upon automatic check-in failure.
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
  - "New API Model Sync" added model allow-list filtering feature.
  - Sidebar now supports collapse/expand with smooth animation effects.

## 2.11.0
- **New Features:**
  - Account management functionality enhanced, adding search and navigation optimization.
  - Added CC Switch export feature.
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
  - Added Cloudflare Challenge Detection, automatically attempting to bypass via temporary window when protection is encountered.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized dropdown menu positioning and accessibility for the MultiSelect component.

## 2.8.0
- **New Features:**
  - Added a fault tolerance mechanism for partial account updates.
  - Account information can be saved even if data fetching fails during manual account addition.
  - Settings page added "Settings Partition" feature, supporting resetting settings by area.

## 2.7.1
- **Bug Fixes:**
  - Fixed the issue where redirected models did not appear in the model list during API sync.

## 2.7.0
- **New Features:**
  - Account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hid the password visibility button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - User preferences such as `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now mandatory to ensure complete default configuration.
- **Bug Fixes:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed the lack of "New API Preferences" in configuration checks.
  - Corrected the check-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 2.6.0
- **New Features:**
  - "New API Channel Import" user interface optimized, supporting key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process, improving accuracy.
- **Bug Fixes:**
  - Model name standardization now aligns with the Veloera backend and retains hyphens.
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
  - MultiSelect component now supports a collapsible selected area and optimized input experience.
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
  - Automatic Check-in feature added results/history interface, and optimized default settings and user experience.
  - Implemented daily site automatic check-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case sensitivity issue in automatic check-in status detection.
  - Handled edge cases in check-in time window calculation.

## 2.1.0
- **New Features:**
  - Account list added username search and highlighting features.
- **Bug Fixes:**
  - Added configuration validation warning when API settings are missing.
  - "New API" feature added configuration validation assistance and internationalized error messages.

## 2.0.0
- **New Features:**
  - "New API Model Sync" filter bar added execution statistics.
  - Added sync operation button to each row in the results table.
  - Implemented initial service, background logic, and settings interface for "New API Model Sync".
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
  - Added open sidebar feature.
- **Bug Fixes:**
  - Added translation for the "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now configure redemption page paths and support redirection.
  - Option to automatically open the redemption page after check-in.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - Check-in icon updated to the "Yen" icon for better visual representation.
- **Bug Fixes:**
  - Custom check-in accounts now automatically reset check-in status daily.
  - Fixed the default value issue of the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic account data synchronization using a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` to improve cross-browser compatibility and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced a reusable `AppLayout` component, improving interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed incorrect width of the right content container on small screens.

## 1.32.0
- **New Features:**
  - Account management interface layout and responsiveness improved.
  - Added configurable React DevTools auto-plugin and caching.
- **Bug Fixes:**
  - Fixed mobile sidebar overlay `z-index` issue.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Account management added a "Create Account" button and optimized the layout.
  - Account management added "Usage Log" feature.
  - Sorting priority settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fixes:**
  - Updated SiteInfo icon button size and accessibility labels.

## 1.30.0
- **New Features:**
  - Dialog component replaced with a custom `Modal` component, improving consistency.
  - Added a comprehensive UI component library, enhancing interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priority.
  - Optimized mobile sidebar overlay transparency and layering, improving user experience.

## 1.29.0
- **New Features:**
  - Pop-ups now support detection and automatic closing.
  - Pop-ups added mobile responsive layout, avoiding the need for zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent auto-detection feature.
  - Migrated `chrome.*` API to `browser.*` API, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functional compatibility and user interface design on mobile devices.
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
  - Fixed RMB currency conversion logic error.

## 1.23.1
- **Bug Fixes:**
  - Amount extraction now supports exchange rate conversion.

## 1.23.0
- **New Features:**
  - Added Chinese and English localization support.
  - Added language switching feature and supports Suspense loading.
- **Bug Fixes:**
  - Completed internationalization of remaining hardcoded text.
  - Fixed the issue where a success message was still displayed when no accounts were refreshed.

## 1.22.0
- **New Features:**
  - Account added "Total Revenue Today" field and revenue display interface.
  - Supports Redemption code top-up type.
- **Bug Fixes:**
  - Fixed rendering logic for the custom URL check-in interface.
  - Corrected check-in field names and return structure.

## 1.21.0
- **New Features:**
  - Added favicon and extension icon to pop-up, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and pop-up operations.
  - Underlying framework migrated from Plasmo to WXT, bringing better performance and development experience.

## 1.20.0
- **New Features:**
  - Balance and health status indicators added refresh functionality.
  - Operation button UI unified and optimized, supporting smart key handling.

## 1.19.0
- **New Features:**
  - All components now support Dark Mode.
  - Implemented a theming system, supporting dark, light, and system-following modes.
- **Bug Fixes:**
  - API configuration interface now enforces the `authType` field.

## 1.18.0
- **New Features:**
  - Account added custom check-in button (with Yen icon).
  - Implemented a versioned configuration migration system, ensuring compatibility during updates.
  - Sorting functionality added custom check-in URL as a sorting condition.
- **Bug Fixes:**
  - Fixed the issue where the custom check-in URL was not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication type.
  - API authentication options added "No Authentication" type.
  - Tooltip component migrated to the `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" feature added account auto-configuration support.
  - Site accounts added check-in functionality.
  - Implemented a customizable sorting priority system.

## 1.15.0
- **Bug Fixes:**
  - Fixed the issue where unnecessary updates and notifications were triggered even when the value had not changed.

## 1.14.0
- **New Features:**
  - Added tab activation and update listeners for auto-detection.

## 1.13.0
- **New Features:**
  - Added "New API" integration, supporting token import.
  - Added "New API" integration settings in preferences.
  - Added password visibility toggle feature.

## 1.12.1
- **Bug Fixes:**
  - Moved default sorting values to `UserPreferencesContext`.
  - Fixed potential rendering issues when preferences are loading.

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
  - Key copying feature added Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub Token management and data fetching functionality.
  - Added user group data conversion and API integration.
  - Implemented model fetching functionality for OneHub sites.

## 1.8.0
- **New Features:**
  - Account management added site type support.
  - Added site type detection and optimized the auto-detection process.
  - Implemented model pricing functionality for OneHub sites.

## 1.7.1
- **Bug Fixes:**
  - Fixed logic error in using site status detection for check-in support.

## 1.7.0
- **New Features:**
  - Added check-in support detection and toggle feature.
  - Account added check-in status support.

## 1.6.0
- **New Features:**
  - Account management added support for the Notes field.

## 1.5.0
- **Performance Optimization:**
  - Optimized the rendering method of the model list, improving loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed the issue of automatically resetting the detected account status when no existing account is found.

## 1.4.0
- **New Features:**
  - Control panel added Copy Model Name feature.
  - Added Baidu and Yi model provider support.

## 1.3.1
- **Bug Fixes:**
  - Updated release PR workflow configuration.

## 1.3.0
- **New Features:**
  - Added WebDAV backup and synchronization features.

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
  - Optimized account identification process, now supporting automatic creation of access keys.
  - Account list added sortable table headers, copy key dialog, and hover operation buttons.
  - Account management added a Notes field.
  - Website names are clickable for redirection.
  - Model list supports group selection.
  - Pop-up page added number scrolling animation and site status indicator.
  - Optimized Add/Edit Account dialog, including recharge ratio setting and automatic extraction of site name.
  - Fully implemented the Settings page system, supporting user preference persistence and automatic refresh.
  - Enhanced front-end interface and background service for automatic refresh functionality.
  - Automatically added `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Supported more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Pop-up interface refactored to API Manager style, adding display of total amount consumed today.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed model data format incompatibility, `localStorage` access, and API request credential issues.
  - Corrected API authentication methods.
  - Optimized URL input handling and automatic refresh configuration.
  - Added pagination logic to handle log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**