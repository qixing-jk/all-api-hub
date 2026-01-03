# Changelog

## 2.39.0
- When account data is refreshed, automatically detect and modify the check-in support status of account sites.
- When the version is updated, automatically open the changelog page and navigate to the corresponding version anchor.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Directly select specific redemption accounts using the up/down arrow keys.
  - Press Enter to confirm redemption.
- Added a prompt to the temporary bypass tab, explaining that the current tab is from this plugin and its specific purpose.
- Improved bypass window display method: single window with multiple tabs, meaning short-term requests will reuse the same window, minimizing interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API Channel Management.
- More lenient redemption code format detection option support: when encountering custom redemption code formats, it can correctly identify the redemption code and pop up the Redemption Assistant.
- Fixed some known issues.

## 2.36.0
- Supports quick jump to specific channels for management.
- Fixed an issue where channel model synchronization time would be reset.

## 2.35.1
- Fixed an issue where automatic check-in execution time would be reset.
- UI optimization.

## 2.35.0
- Added optional clipboard read permission to prompt for redemption when any possible redemption code is copied.
- Added cdk.linux.do to the Redemption Assistant's default URL whitelist.

## 2.34.0
- **New Feature:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open a popup or sidebar.
- **Bug Fixes:**
  - Fixed an internal error when comparing account IDs.
  - Ensured all temporary contexts are properly closed.

## 2.33.0
- **New Features:**
  - Added "Temporary Context Mode" to more effectively bypass website protection.
  - API error messages now support internationalization.
  - Optimized website type detection, now identifiable by the temporary window title.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 2.32.0
- **New Features:**
  - Model redirection is now smarter, supporting hyphenated and dot-separated version numbers.
  - Added a feature to directly redeem via the right-click menu after selecting text.
  - Automatic check-in feature is enabled by default, and the check-in time window has been extended.

## 2.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - You can now quickly perform check-in operations in the popup.
  - Redemption Assistant now includes a URL whitelist feature, giving you better control over which websites can use the Redemption Assistant.

## 2.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capabilities for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, and a decryption retry popup has been added during recovery, while retaining your WebDAV configuration.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website Cookie interception issue during auto-detection.
  - Optimized centered display of empty state content in Firefox.
  - Migrated Switch component to a custom implementation, improving compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced "Managed Sites" service, laying the foundation for more site integrations in the future.
  - Added support for Veloera sites.
  - Updated the term "New API" to "Managed Sites" in settings for clearer understanding.
- **Bug Fixes:**
  - Optimized translation text, removing redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes, allowing you to understand specific issues.
  - Temporary window bypass feature now includes a health status indicator.
  - Optimized the description of bypassing website protection for better clarity.
  - Added an alert system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency of token selection strategy.
  - Fixed display issue of Firefox popup prompts in Chinese settings.
- **Performance Optimization:**
  - Improved sorting function performance.

## 2.26.0
- **New Features:**
  - Added model pricing cache service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Now supports displaying model pricing information for multiple accounts simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 2.25.0
- **New Features:**
  - Added a new user guide card when the account list is empty.
  - When pinning/manual sorting is disabled, related UI elements will be automatically hidden.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

## 2.24.0
- **New Features:**
  - Updated app description and about page content.
  - Extension name now includes a subtitle.
  - Tag filter now includes row-based visibility control.
  - WebDAV connection test now supports more successful status codes.
- **Bug Fixes:**
  - Removed superfluous period at the end of JSON strings.

## 2.23.0
- **New Features:**
  - Enhanced account tagging feature.
  - Temporary window bypass feature now supports more intelligent judgment based on error codes.

## 2.22.0
- **New Features:**
  - Added tagging feature to account management for classifying accounts.
  - Redemption Assistant popup UI now supports lazy loading and fixed an issue that could cause website style disruption.
  - Added global channel filter and JSON editing mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed duplicate "checked in today" check in automatic check-in.
  - Simplified and fixed the temporary window capture logic.
  - Restored parsing of search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guide on first installation to help you understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed an issue of action buttons overflowing in the account dialog.
  - Redemption amount conversion factor now uses constants, improving accuracy.
  - Cookie interceptor restricted to Firefox browser only.

## 2.19.0
- **New Features:**
  - Added loading status and prompt messages during redemption.
  - Removed clipboard read functionality from Redemption Assistant.
- **Bug Fixes:**
  - Supplemented missing backend error message translations.
  - Prevented concurrent service initialization and race conditions, improving stability.
  - Resolved intermittent "cannot establish connection" errors.
  - Prevented race conditions during temporary window pool destruction.

## 2.18.0
- **New Features:**
  - Added protection settings for temporary window bypass feature.
  - Added documentation for the Redemption Assistant feature.
  - Firefox browser now supports WebRequest-based Cookie injection mechanism.
  - Redemption feature now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and settings link.
- **Bug Fixes:**
  - Fixed Tailwind CSS file path issue.

## 2.17.0
- **New Features:**
  - Added one-click redemption automatic popup prompt feature.
  - Unified data format for import/export and WebDAV backup, adopting a V2 versioning scheme for improved compatibility and stability.

## 2.16.0
- **New Features:**
  - Added a warning prompt when creating an account in Firefox desktop.
  - API model synchronization now supports channel filtering system.

## 2.15.0
- **New Features:**
  - MultiSelect component now supports comma-separated string parsing.
- **Bug Fixes:**
  - Ensured caching only occurs during full channel data synchronization.
- **Performance Optimization:**
  - Optimized upstream model caching logic.

## 2.14.0
- **New Features:**
  - Automatically detects site metadata upon refresh.
  - Added retry and manual check-in options when automatic check-in fails.
  - Enhanced automatic check-in feature, including retry strategy, skip reasons, and account snapshots.
  - Optimized automatic check-in execution method to concurrent processing, improving efficiency.
- **Bug Fixes:**
  - Fixed default behavior issue of the `autoCheckInEnabled` flag.

## 2.13.0
- **New Features:**
  - Added "New API Channel Management" feature.
  - Added "Warning" button style.
  - Introduced Radix UI components and Tanstack Table, improving interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed incorrect display and sorting of model counts in the channel table.

## 2.12.1
- **Bug Fixes:**
  - Fixed unnecessary channel reload issue when manually selecting tabs.
  - Sidebar hides the "New API Model Sync" option when configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Sync" now includes a model allowlist filtering feature.
  - Sidebar now supports collapse/expand with smooth animation effects.

## 2.11.0
- **New Features:**
  - Account management enhanced with new search functionality and navigation optimization.
  - Added CC Switch export feature.
- **Bug Fixes:**
  - Fixed automatic check-in status logic error.

## 2.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanism, improving communication stability.
  - Model sync now includes a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection, and automatically attempts to bypass protection via temporary windows when encountered.
  - Introduced temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support "month-day" and "month_day" date suffix patterns.
  - Optimized dropdown menu positioning and accessibility of the multi-select component.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can still be saved even if data fetching fails when manually adding an account.
  - Settings page now includes "Settings Partition" feature, supporting region-based settings reset.

## 2.7.1
- **Bug Fixes:**
  - Fixed issue where redirected models do not appear in the model list during API sync.

## 2.7.0
- **New Features:**
  - Account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Password display button hidden in Edge/IE browsers.

## 2.6.1
- **Important Update (for internal):**
  - `newApiModelSync`, `autoCheckin`, and `modelRedirect` user preferences are now mandatory to ensure complete default configuration.
- **Bug Fixes:**
  - Enhanced robustness of configuration migration checks.
  - Fixed missing "New API Preferences" in configuration checks.
  - Corrected check-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 2.6.0
- **New Features:**
  - New API Channel Import user interface optimized, supporting key switching and bulk model selection.
  - Model mapping now uses a multi-stage standardization process, improving accuracy.
- **Bug Fixes:**
  - Model name standardization now consistent with Veloera backend and preserves hyphens.
  - Resolved browser storage quota issues and improved model matching.

## 2.5.0
- **New Features:**
  - Added support for Neo-API site types.
- **Bug Fixes:**
  - Fixed Base64 encoding issue during CherryStudio URL generation.
  - Removed redundant account fetching and token validation in the channel dialog, improving efficiency.

## 2.4.1
- **Bug Fixes:**
  - Ensured settings page always opens in a new tab.

## 2.4.0
- **New Features:**
  - Auto-import feature now integrates the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - Multi-select component now supports collapsible selected areas and optimized input experience.
- **Bug Fixes:**
  - Optimized retry mechanism and added user feedback.
  - Optimized performance of multi-select component with large number of selections.

## 2.3.0
- **New Features:**
  - Added account pinning and unpinning features, and supports prioritized sorting for pinned accounts.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issue.
  - Optimized sorting configuration, increasing the priority of current site conditions.

## 2.2.1
- **Bug Fixes:**
  - Removed `isDetected` check from auto-configure button.
  - Ensured account detection refreshes correctly when displaying data changes.
  - Fixed issue where Access Token is no longer required under Cookie authentication type.

## 2.2.0
- **New Features:**
  - Automatic check-in feature now includes a results/history interface, and optimized default settings and user experience.
  - Implemented daily site automatic check-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case-sensitivity issue in automatic check-in status detection.
  - Handled edge cases in check-in time window calculation.

## 2.1.0
- **New Features:**
  - Account list now includes username search and highlighting features.
- **Bug Fixes:**
  - Added configuration validation warning when API settings are missing.
  - "New API" feature now includes configuration validation assistance and internationalized error messages.

## 2.0.0
- **New Features:**
  - "New API Model Sync" filter bar now includes execution statistics.
  - Each row in the results table now includes a sync action button.
  - Implemented initial service, backend logic, and settings interface for "New API Model Sync".
- **Bug Fixes:**
  - Row retry operations now only update target and progress UI.
  - Updated channel list response handling and types.

## 1.38.0
- **New Features:**
  - Supports pinning accounts with custom check-in or redemption URLs.
  - Added custom redemption and open tab matching as sorting rules.
- **Bug Fixes:**
  - Ensured deep copying of default sorting rules.
  - New sorting conditions are disabled by default after migration.

## 1.37.0
- **New Features:**
  - Account search functionality enhanced, supporting multi-field composite search across UI interfaces.
  - Added open sidebar functionality.
- **Bug Fixes:**
  - Supplemented translation for "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with redemption page paths and support navigation.
  - Can choose whether to automatically open the redemption page after check-in.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - Check-in icon updated to 'Yen' icon for better intuitiveness.
- **Bug Fixes:**
  - Custom check-in accounts now automatically reset check-in status daily.
  - Fixed default value issue of the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic account data synchronization with a merge strategy.
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
  - Account management interface layout and responsiveness improved.
  - Added configurable React DevTools auto-plugin and caching.
- **Bug Fixes:**
  - Fixed mobile sidebar overlay `z-index` issue.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Added "Create Account" button to account management and optimized layout.
  - Added "Usage Log" feature to account management.
  - Sorting priority settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fixes:**
  - Updated size and accessibility labels of SiteInfo icon buttons.

## 1.30.0
- **New Features:**
  - Dialog component replaced with custom `Modal` component, improving consistency.
  - Added a comprehensive UI component library, improving interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priority.
  - Optimized transparency and layering of mobile sidebar overlay, improving user experience.

## 1.29.0
- **New Features:**
  - Popups now support detection and automatic closing.
  - Popups now include mobile-responsive layout, avoiding the need for zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent auto-detection feature.
  - Migrated `chrome.*` API to `browser.*` API, enhancing cross-browser compatibility and optimizing error handling.
  - Ensured full functional compatibility and UI design on mobile devices.
- **Bug Fixes:**
  - Fixed `tabId` parsing issue after window creation.
  - Prevented button border rotation animation during refresh.

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
  - Improved WebDAV settings form accessibility.
- **Bug Fixes:**
  - Replaced hardcoded Chinese text in `TokenHeader` prompts with translation keys.

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
  - Added language switching feature with Suspense loading support.
- **Bug Fixes:**
  - Completed internationalization of remaining hardcoded text.
  - Fixed issue where success message was still displayed when no accounts were refreshed.

## 1.22.0
- **New Features:**
  - Added "Today's Total Revenue" field and revenue display interface to accounts.
  - Supports redemption code top-up type.
- **Bug Fixes:**
  - Fixed rendering logic for custom URL check-in interface.
  - Corrected check-in field names and return structure.

## 1.21.0
- **New Features:**
  - Added favicon and extension icons to popup, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and popup actions.
  - Underlying framework migrated from Plasmo to WXT, bringing better performance and development experience.

## 1.20.0
- **New Features:**
  - Added refresh functionality to balance and health status indicators.
  - Action button UI unified and optimized, supporting intelligent key handling.

## 1.19.0
- **New Features:**
  - All components now support dark mode.
  - Implemented theme system, supporting dark, light, and system-follow modes.
- **Bug Fixes:**
  - API configuration interface now enforces `authType` field.

## 1.18.0
- **New Features:**
  - Added custom check-in button (with Yen icon) to accounts.
  - Implemented versioned configuration migration system, ensuring compatibility during updates.
  - Sorting feature now includes custom check-in URL as a sorting condition.
- **Bug Fixes:**
  - Fixed issue where custom check-in URL was not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication types.
  - API authentication options now include "No Authentication" type.
  - Tooltip component migrated to `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" feature now includes account auto-configuration support.
  - Site accounts now include check-in functionality.
  - Implemented a customizable sorting priority system.

## 1.15.0
- **Bug Fixes:**
  - Fixed issue where unnecessary updates and notifications were triggered even when values did not change.

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
  - Fixed potential rendering issues during preference loading.

## 1.12.0
- **New Features:**
  - Account sorting now includes health status priority.
  - Health status now includes more detailed reason information.

## 1.11.0
- **New Features:**
  - Refresh functionality enhanced, now supporting detailed status tracking.
  - Added minimum refresh interval to prevent frequent requests.

## 1.10.0
- **New Features:**
  - Key copy feature now includes Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub token management and data fetching functionality.
  - Added user group data conversion and API integration.
  - Implemented model fetching functionality for OneHub sites.

## 1.8.0
- **New Features:**
  - Account management now supports site types.
  - Added site type detection and optimized auto-detection process.
  - Implemented model pricing functionality for OneHub sites.

## 1.7.1
- **Bug Fixes:**
  - Fixed logic error in check-in support detection using site status.

## 1.7.0
- **New Features:**
  - Added check-in support detection and toggle functionality.
  - Accounts now support check-in status.

## 1.6.0
- **New Features:**
  - Account management now supports a remarks field.

## 1.5.0
- **Performance Optimization:**
  - Model list rendering optimized, improving loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed issue where detected account status was automatically reset when no existing account was found.

## 1.4.0
- **New Features:**
  - Control panel now includes copy model name functionality.
  - Added Baidu and Yi model provider support.

## 1.3.1
- **Bug Fixes:**
  - Updated release PR workflow configuration.

## 1.3.0
- **New Features:**
  - Added WebDAV backup and sync functionality.

## 1.2.0
- **New Features:**
  - Added account management page, supporting full CRUD functionality.
  - Custom dialogs in popups replaced with direct function calls, simplifying operations.

## 1.1.1
- **Bug Fixes:**
  - Fixed logic for handling missing system names and checks.

## 1.1.0
- **New Features:**
  - Accounts now support manual addition, with optimized UI flow.

## 1.0.0
- **New Features:**
  - Implemented current site detection and highlighting.
  - Added Firefox browser detection and warning prompts when adding accounts.
  - Introduced sidebar functionality, replacing popup's automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized account recognition process, now supporting automatic access key creation.
  - Account list now includes sortable table headers, copy key dialog, and hover action buttons.
  - Account management now includes a remarks field.
  - Website names are clickable for navigation.
  - Model list supports group selection.
  - Popup page now includes number scrolling animation and site status indicator.
  - Optimized add/edit account dialog, including top-up ratio settings and automatic site name extraction.
  - Fully implemented settings page system, supporting user preference persistence and automatic refresh.
  - Enhanced frontend interface and backend services for automatic refresh.
  - Automatically adds `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Supports more AI model providers (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Popup interface refactored to API Manager style, with added display of today's total consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed model data format incompatibility, `localStorage` access, and API request credential issues.
  - Corrected API authentication methods.
  - Optimized URL input handling and auto-refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**