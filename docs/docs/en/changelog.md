# Changelog

## 3.0.0
- **New Features:**
  - Supports multiple cookie authenticated accounts on a single site, ensuring all accounts coexist normally and all functions are available, primarily for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy, models, and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic; they no longer interfere with each other.
- **Bug Fixes:**
  - Fixed an incorrect webpage path redirection issue for manual check-in on New-API sites.

## 2.39.0
- Added automatic detection and modification of account site check-in support status when refreshing account data.
- Automatically opens the changelog page and navigates to the corresponding version anchor when the version is updated.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the redemption assistant:
  - Directly select specific redemption accounts using the up and down arrow keys.
  - Press Enter to confirm redemption.
- Added a hint for the temporary shield bypass tab, explaining that the current tab is from this plugin and its specific purpose.
- Improved display of the shield bypass window, using a single window with multiple tabs, meaning short-term requests will reuse the same window to minimize interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- More lenient redemption code format detection option support, correctly identifying redemption codes and popping up the redemption assistant for custom formats.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific channels for management.
- Fixed an issue where channel model synchronization time would be reset.

## 2.35.1
- Fixed an issue where the auto check-in execution time would be reset.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to prompt for redemption when any potential redemption code is copied.
- Added cdk.linux.do to the redemption assistant's default URL whitelist.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open a popup or a sidebar.
- **Bug Fixes:**
  - Fixed an internal error during account ID comparison.
  - Ensured all temporary contexts are correctly closed.

## 2.33.0
- **New Features:**
  - Added "Temporary Context Mode" to more effectively bypass website protection.
  - API error messages now support internationalization.
  - Optimized website type detection, now identifiable via temporary window titles.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 2.32.0
- **New Features:**
  - Model redirection is now smarter, supporting version numbers indicated by hyphens and dots.
  - Added the ability to redeem directly from the right-click menu after selecting text.
  - Automatic check-in is enabled by default, and the check-in time window has been extended.

## 2.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Check-in operations can now be quickly performed in the popup.
  - The redemption assistant now includes a URL whitelist feature, giving you better control over which websites can use it.

## 2.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capabilities for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, and a decryption retry popup has been added during restoration, while also preserving your WebDAV configuration.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website Cookie interception issues during automatic detection.
  - Optimized centering of blank state content in Firefox.
  - Migrated Switch component to a custom implementation, improving compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced "Managed Sites" service, laying the foundation for more site integrations in the future.
  - Added support for Veloera sites.
  - Updated "New API" terminology in settings to "Managed Sites" for clarity.
- **Bug Fixes:**
  - Optimized translation text, removing redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes for easier problem identification.
  - Temporary window bypass feature now includes a health status indicator.
  - Optimized the description for bypassing website protection, making it clearer.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in Token selection strategy.
  - Fixed display issues with Firefox popup prompts in Chinese settings.
- **Performance Optimizations:**
  - Improved sorting function performance.

## 2.26.0
- **New Features:**
  - Added model pricing caching service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Now supports displaying model pricing information for multiple accounts simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property for button components.

## 2.25.0
- **New Features:**
  - Added a new user guide card when the account list is empty.
  - Related UI elements will automatically hide when pinning/manual sorting is disabled.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

## 2.24.0
- **New Features:**
  - Updated app description and about page content.
  - Extension name now includes a subtitle.
  - Tag filter now includes visibility control based on line count.
  - WebDAV connection tests now support more successful status codes.
- **Bug Fixes:**
  - Removed extra period at the end of JSON strings.

## 2.23.0
- **New Features:**
  - Enhanced account tagging feature.
  - Temporary window bypass now supports more intelligent judgment based on error codes.

## 2.22.0
- **New Features:**
  - Added tagging functionality to account management for easier account classification.
  - Redemption assistant popup UI now supports lazy loading and fixed potential website style corruption issues.
  - Added global channel filter and JSON editing mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed redundant "Checked in today" check in automatic check-in.
  - Simplified and fixed temporary window fetching logic.
  - Restored parsing of search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guidance on first installation to help you understand required permissions.
  - Cookie interceptor headers can now be controlled by optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed overflow issues with action buttons in the account dialog.
  - Redemption amount conversion Ratio now uses constants for improved accuracy.
  - Restricted Cookie interceptor to Firefox browser only.

## 2.19.0
- **New Features:**
  - Added loading status and prompt messages during redemption.
  - Removed clipboard reading functionality from the redemption assistant.
- **Bug Fixes:**
  - Supplemented missing background error message translations.
  - Prevented concurrent service initialization and race conditions, improving stability.
  - Resolved intermittent "cannot establish connection" errors.
  - Prevented race conditions during temporary window pool destruction.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the redemption assistant feature.
  - Firefox browser now supports WebRequest-based Cookie injection mechanism.
  - Redemption feature now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and a settings link.
- **Bug Fixes:**
  - Fixed Tailwind CSS file path issues.

## 2.17.0
- **New Features:**
  - Added one-click redemption automatic popup prompt feature.
  - Unified data format for import/export and WebDAV backup, adopting V2 versioning scheme for improved compatibility and stability.

## 2.16.0
- **New Features:**
  - Added a warning prompt when creating an account in Firefox desktop.
  - API model synchronization now supports a channel filtering system.

## 2.15.0
- **New Features:**
  - MultiSelect component now supports comma-separated string parsing.
- **Bug Fixes:**
  - Ensured caching only occurs during full channel data synchronization.
- **Performance Optimizations:**
  - Optimized upstream model caching logic.

## 2.14.0
- **New Features:**
  - Automatically detects site metadata upon refresh.
  - Added retry and manual check-in options when automatic check-in fails.
  - Enhanced automatic check-in feature, including retry strategy, skip reasons, and account snapshots.
  - Optimized automatic check-in execution to concurrent processing for improved efficiency.
- **Bug Fixes:**
  - Fixed default behavior issue of `autoCheckInEnabled` flag.

## 2.13.0
- **New Features:**
  - Added "New API Channel Management" feature.
  - Added "Warning" button style.
  - Introduced Radix UI components and Tanstack Table, enhancing interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed incorrect model count display and sorting in the channel table.

## 2.12.1
- **Bug Fixes:**
  - Fixed unnecessary channel reloading when manually selecting tabs.
  - Sidebar hides "New API Model Sync" option when configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Sync" now includes model allow list filtering.
  - Sidebar now supports collapsing/expanding with smooth animation effects.

## 2.11.0
- **New Features:**
  - Account management functionality enhanced with new search feature and navigation optimizations.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed incorrect automatic check-in status logic.

## 2.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanism, improving communication stability.
  - Model synchronization now includes a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection, automatically attempting to bypass with a temporary window when protection is encountered.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support "month-day" and "month_day" date suffix patterns.
  - Optimized dropdown menu positioning and accessibility for multi-select components.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can be saved even if data fetching fails during manual account addition.
  - Added "Settings Partition" feature to the settings page, supporting resetting settings by area.

## 2.7.1
- **Bug Fixes:**
  - Fixed an issue where redirected models did not appear in the model list during API synchronization.

## 2.7.0
- **New Features:**
  - Account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hidden password display button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - `newApiModelSync`, `autoCheckin`, and `modelRedirect` user preferences are now required to ensure complete default configuration.
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
  - Model name standardization now aligns with Veloera backend and preserves hyphens.
  - Resolved browser storage quota issues and improved model matching.

## 2.5.0
- **New Features:**
  - Added support for Neo-API site types.
- **Bug Fixes:**
  - Fixed Base64 encoding issue during CherryStudio URL generation.
  - Removed redundant account fetching and Token validation in the channel dialog, improving efficiency.

## 2.4.1
- **Bug Fixes:**
  - Ensured settings page always opens in a new tab.

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
  - Reduced pinned icon size and fixed configuration migration version issues.
  - Optimized sorting configuration, increasing priority for current site conditions.

## 2.2.1
- **Bug Fixes:**
  - Removed `isDetected` check for the auto-configure button.
  - Ensured account detection refreshes correctly when displaying data changes.
  - Fixed an issue where Access Token was no longer required for Cookie authentication types.

## 2.2.0
- **New Features:**
  - Automatic check-in feature now includes a results/history interface, with optimized default settings and user experience.
  - Implemented daily site automatic check-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case-sensitive issue in automatic check-in status detection.
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
  - Implemented initial service, background logic, and settings interface for "New API Model Sync".
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
  - Account search functionality enhanced, supporting multi-field compound search across UI interfaces.
  - Added open sidebar functionality.
- **Bug Fixes:**
  - Supplemented translation for "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with a redemption page path, supporting redirection.
  - Option to automatically open the redemption page after check-in.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - Check-in icon updated to "Yen" icon for better intuition.
- **Bug Fixes:**
  - Custom check-in accounts now automatically reset check-in status daily.
  - Fixed default value issue for `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic account data synchronization with a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` for improved cross-browser compatibility and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced reusable `AppLayout` component, improving interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed incorrect width of the right content container on small screens.

## 1.32.0
- **New Features:**
  - Improved layout and responsiveness of the account management interface.
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
  - Updated SiteInfo icon button size and accessibility labels.

## 1.30.0
- **New Features:**
  - Dialog components replaced with custom `Modal` component, improving consistency.
  - Added a comprehensive UI component library, enhancing interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priority.
  - Optimized transparency and layering of mobile sidebar overlay, improving user experience.

## 1.29.0
- **New Features:**
  - Popups now support detection and automatic closing.
  - Popups now have mobile responsive layout, avoiding the need for zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent automatic detection.
  - Migrated `chrome.*` API to `browser.*` API, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functional compatibility and UI design on mobile devices.
- **Bug Fixes:**
  - Fixed `tabId` parsing issue after window creation.
  - Prevented button border rotation animation during refresh.

## 1.27.0
- **New Features:**
  - Account dialog automatically closes after successful auto-configuration to New API.
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
  - Improved accessibility of WebDAV settings form.
- **Bug Fixes:**
  - Replaced hardcoded Chinese text in `TokenHeader` prompt with translation keys.

## 1.24.0
- **New Features:**
  - Added health status translation keys and refactored error messages.
  - `dayjs` localization now updates with language switching.

## 1.23.2
- **Bug Fixes:**
  - Fixed incorrect RMB currency conversion logic.

## 1.23.1
- **Bug Fixes:**
  - Amount extraction now supports exchange Rate conversion.

## 1.23.0
- **New Features:**
  - Added Chinese and English localization support.
  - Added language switching functionality and Suspense loading support.
- **Bug Fixes:**
  - Completed internationalization of remaining hardcoded text.
  - Fixed an issue where a success message was still displayed when no accounts were refreshed.

## 1.22.0
- **New Features:**
  - Account now includes "Today's Total Revenue" field and revenue display interface.
  - Supports redemption code top-up type.
- **Bug Fixes:**
  - Fixed rendering logic for custom URL check-in interface.
  - Corrected check-in field names and return structure.

## 1.21.0
- **New Features:**
  - Added favicon and extension icons for popup, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and popup actions.
  - Underlying framework migrated from Plasmo to WXT, bringing better performance and development experience.

## 1.20.0
- **New Features:**
  - Balance and health status indicators now include refresh functionality.
  - Action button UI unified and optimized, supporting intelligent key handling.

## 1.19.0
- **New Features:**
  - All components now support dark mode.
  - Implemented a theme system, supporting dark, light, and system-follow modes.
- **Bug Fixes:**
  - API configuration interface now enforces the `authType` field.

## 1.18.0
- **New Features:**
  - Account now includes a custom check-in button (with Yen icon).
  - Implemented a versioned configuration migration system, ensuring compatibility during updates.
  - Sorting functionality now includes custom check-in URL as a sorting condition.
- **Bug Fixes:**
  - Fixed an issue where custom check-in URL was not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Account now supports selecting authentication type.
  - API authentication options now include "No Authentication" type.
  - Tooltip component migrated to `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" feature now supports account auto-configuration.
  - Site accounts now include check-in functionality.
  - Implemented a customizable sorting priority system.

## 1.15.0
- **Bug Fixes:**
  - Fixed an issue where unnecessary updates and notifications were still triggered when values had not changed.

## 1.14.0
- **New Features:**
  - Added tab activation and update listeners for automatic detection.

## 1.13.0
- **New Features:**
  - Added "New API" integration, supporting Token import.
  - Added "New API" integration settings in preferences.
  - Added password visibility toggle functionality.

## 1.12.1
- **Bug Fixes:**
  - Moved default sorting values to `UserPreferencesContext`.
  - Fixed potential rendering issues when preferences are loading.

## 1.12.0
- **New Features:**
  - Account sorting now includes health status priority.
  - Health status now includes more detailed reason information.

## 1.11.0
- **New Features:**
  - Refresh functionality enhanced, now supporting detailed status tracking.
  - Added minimum refresh interval to avoid frequent requests.

## 1.10.0
- **New Features:**
  - Key copying functionality now includes Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub Token management and data fetching functionality.
  - Added user Group data conversion and API integration.
  - Implemented model fetching functionality for OneHub sites.

## 1.8.0
- **New Features:**
  - Account management now supports site types.
  - Added site type detection and optimized automatic detection process.
  - Implemented model pricing functionality for OneHub sites.

## 1.7.1
- **Bug Fixes:**
  - Fixed logical error in using site status detection for check-in support.

## 1.7.0
- **New Features:**
  - Added check-in support detection and toggle functionality.
  - Account now includes check-in status support.

## 1.6.0
- **New Features:**
  - Account management now supports a remarks field.

## 1.5.0
- **Performance Optimizations:**
  - Optimized model list rendering, improving loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed an issue where the detected account status was automatically reset when no existing account was found.

## 1.4.0
- **New Features:**
  - Control panel now includes copy model name functionality.
  - Added Baidu and Yi model provider support.

## 1.3.1
- **Bug Fixes:**
  - Updated release PR workflow configuration.

## 1.3.0
- **New Features:**
  - Added WebDAV backup and synchronization functionality.

## 1.2.0
- **New Features:**
  - Added account management page, supporting full CRUD (Create, Read, Update, Delete) functionality.
  - Custom dialogs in popups replaced with direct function calls, simplifying operations.

## 1.1.1
- **Bug Fixes:**
  - Fixed logic for handling missing system names and checks.

## 1.1.0
- **New Features:**
  - Account now supports manual addition, with optimized UI flow.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and warning prompts when adding accounts.
  - Introduced sidebar functionality, replacing popup's automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized account identification process, now supporting automatic access key creation.
  - Account list now includes sortable table headers, copy key dialog, and hover action buttons.
  - Account management added a remarks field.
  - Website names are clickable for navigation.
  - Model list supports Group selection.
  - Popup page added number scrolling animation and site status indicator.
  - Optimized add/edit account dialog, including top-up Ratio settings and automatic site name extraction.
  - Fully implemented settings page system, supporting user preference persistence and automatic refresh.
  - Enhanced frontend interface and background service for automatic refresh.
  - Automatically adds `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Supports more AI model providers (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Popup interface refactored to API manager style, adding today's total consumption display.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed model data format incompatibility, `localStorage` access, and API request credential issues.
  - Corrected API authentication methods.
  - Optimized URL input handling and automatic refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**