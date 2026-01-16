# Changelog

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Check-in" toggle (moved above the custom check-in URL) for more intuitive configuration.
  - UI: Removed gradient background from dialog title icons for a cleaner, more unified visual.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog after expanding key details would lead to a white screen.

## 3.5.0
- **New Features:**
  - Auto Detection: Added a "Slow Detection" hint and a link to relevant documentation to help users troubleshoot and resolve issues.
  - Batch Open External Check-ins: Supports opening all in new windows, facilitating batch closing and reducing interference.
- **Bug Fixes:**
  - Batch Open External Check-ins: Refactored the process to execute in a background service, ensuring all sites can be opened correctly in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to support direct selection of upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured access keys always have the `sk-` prefix to prevent identification/copying issues caused by inconsistent formatting.

## 3.3.0
- **New Features:**
  - Auto Check-in: Added "Username" information for account identification, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the number of individual operations.
  - Auto Refresh: The minimum refresh interval no longer has a maximum limit, allowing for larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce false positives in non-copying scenarios.
  - Redemption Assistant: Validated all redemption codes before popping up a prompt, reducing invalid redemption prompts.
  - Storage: Added write locks to write operations to improve data consistency during concurrent writes.
  - UI: Adjusted localization text for "Copy Model Name".

## 3.2.0
- **New Features:**
  - Added "API Availability Detection" (Beta) to the "Model List" page, used to quickly confirm whether the current key is available for specified models (e.g., text generation, tool/function calling, structured output (return as JSON structure), web search (Grounding), etc. detection items).
  - Added "CLI Tool Compatibility Detection" (Beta) to the "Model List" page, simulating Claude Code / Codex CLI / Gemini CLI tool calling processes to evaluate API compatibility with these tools.
  - Added "Rating and Download" to the "About" page: Automatically identifies the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entry points for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating problem localization.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid redundant opening.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Features:**
  - Added administrator credential filling guidance in the self-managed API settings.
  - Redemption Assistant supports batch redemption and single code retry.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts on a single site, where each account can coexist normally and all functions are available, primarily for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy, models, and model alias list when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic; they no longer affect each other.
- **Bug Fixes:**
  - Fixed an issue where manual check-in for New-API sites redirected to the wrong web path.

## 2.39.0
- Added automatic detection and modification of check-in support for account sites when account data is refreshed.
- Automatically opens the changelog page and navigates to the corresponding version anchor when the version is updated.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant.
  - Select specific redemption accounts directly using the up/down arrow keys.
  - Press Enter to confirm redemption.
- Added a hint for temporary shield tabs, explaining that the current tab is from this plugin and its specific purpose.
- Improved shield window display: single window with multiple tabs, meaning short-term requests will reuse the same window, minimizing interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API Channel management.
- More lenient redemption code format detection options support: when encountering custom redemption code formats, it can correctly identify the redemption code and pop up the Redemption Assistant.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific Channels for management.
- Fixed an issue that would reset the Channel model sync time.

## 2.35.1
- Fixed an issue that would reset the automatic check-in execution time.
- UI optimization.

## 2.35.0
- Added optional clipboard read permission to prompt for redemption when any possible redemption code is copied.
- Added cdk.linux.do to the Redemption Assistant default URL whitelist.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open a pop-up or sidebar.
- **Bug Fixes:**
  - Fixed an internal error during account ID comparison.
  - Ensured all temporary contexts are properly closed.

## 2.33.0
- **New Features:**
  - Added "Temporary Context Mode" to bypass website protection more effectively.
  - API error messages now support internationalization.
  - Optimized website type detection, now identifiable by temporary window titles.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 2.32.0
- **New Features:**
  - Model redirection is now smarter, supporting version numbers with hyphens and dots.
  - Added the ability to redeem directly via the right-click menu after selecting text.
  - Auto check-in is enabled by default, and the check-in time window has been extended.

## 3.21.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Check-in operations can now be performed quickly in the pop-up.
  - Redemption Assistant now includes a URL whitelist feature, giving you better control over which websites can use the Redemption Assistant.

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
  - Fixed website Cookie interception during auto-detection.
  - Optimized centering of blank status content in Firefox.
  - Migrated Switch component to a custom implementation, improving compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced "Managed Sites" service, laying the foundation for more site integrations in the future.
  - Added support for Veloera sites.
  - Updated "New API" terminology in settings to "Managed Sites" for clearer understanding.
- **Bug Fixes:**
  - Optimized translated text, removed redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes, making it easier to understand specific issues.
  - Temporary window bypass feature now includes a health status indicator.
  - Optimized the description for bypassing website protection, making it clearer and easier to understand.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in Token selection strategy.
  - Fixed display issues with Firefox pop-up prompts in Chinese settings.
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
  - When pinning/manual sorting is disabled, related UI elements will automatically hide.
  - You can now manually drag and sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

## 2.24.0
- **New Features:**
  - Updated app description and about page content.
  - Extension name now includes a subtitle.
  - Tag filter now includes visibility control based on line count.
  - WebDAV connection test now supports more successful status codes.
- **Bug Fixes:**
  - Removed redundant periods at the end of JSON strings.

## 2.23.0
- **New Features:**
  - Enhanced account tagging functionality.
  - Temporary window bypass now supports smarter judgment based on error codes.

## 2.22.0
- **New Features:**
  - Account management now includes a tagging feature to categorize your accounts.
  - Redemption Assistant pop-up UI now supports lazy loading and fixes potential issues causing website style disruption.
  - Added global Channel filter and JSON editing mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed redundant "Already checked in today" check in auto check-in.
  - Simplified and fixed temporary window fetching logic.
  - Restored parsing of search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guidance on first installation to help you understand required permissions.
  - Cookie interceptor headers can now be controlled by optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed account dialog action button overflow issue.
  - Redemption amount conversion factor now uses constants, improving accuracy.
  - Restricted Cookie interceptor to Firefox browser only.

## 2.19.0
- **New Features:**
  - Added loading status and prompt messages during the redemption process.
  - Removed clipboard reading functionality from the Redemption Assistant.
- **Bug Fixes:**
  - Supplemented missing background error message translations.
  - Prevented concurrent service initialization and race conditions, improving stability.
  - Resolved intermittent "could not establish connection" errors.
  - Prevented race conditions during temporary window pool destruction.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Assistant feature.
  - Firefox browser now supports WebRequest-based Cookie injection mechanism.
  - Redemption feature now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and a settings link.
- **Bug Fixes:**
  - Fixed Tailwind CSS file path issue.

## 2.17.0
- **New Features:**
  - Added automatic pop-up prompt for one-click redemption.
  - Unified data format for import/export and WebDAV backup, adopting V2 versioning scheme to improve compatibility and stability.

## 2.16.0
- **New Features:**
  - Added a warning prompt when creating an account in Firefox desktop.
  - API model sync now supports Channel filtering system.

## 2.15.0
- **New Features:**
  - MultiSelect component now supports comma-separated string parsing.
- **Bug Fixes:**
  - Ensured caching only occurs during complete Channel data synchronization.
- **Performance Optimizations:**
  - Optimized upstream model caching logic.

## 2.14.0
- **New Features:**
  - Automatically detects site metadata during refresh.
  - Added retry and manual check-in options when auto check-in fails.
  - Enhanced auto check-in functionality, including retry strategy, skip reasons, and account snapshots.
  - Optimized auto check-in execution to concurrent processing, improving efficiency.
- **Bug Fixes:**
  - Fixed default behavior issue of `autoCheckInEnabled` flag.

## 2.13.0
- **New Features:**
  - Added "New API Channel Management" feature.
  - Added "Warning" button style.
  - Introduced Radix UI components and Tanstack Table to enhance interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed incorrect model count display and sorting in the Channel table.

## 2.12.1
- **Bug Fixes:**
  - Fixed unnecessary Channel reloading when manually selecting tabs.
  - Sidebar hides "New API Model Sync" option when configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Sync" now includes model allowlist filtering.
  - Sidebar now supports collapsing/expanding with smooth animation effects.

## 2.11.0
- **New Features:**
  - Account management functionality enhanced with new search feature and navigation optimization.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed auto check-in status logic error.

## 2.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanism, improving communication stability.
  - Model sync now includes a manual execution tab and supports Channel selection.
- **Bug Fixes:**
  - Ensured missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection, automatically attempting to bypass with a temporary window when protection is encountered.
  - Introduced temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support "month-day" and "month_day" date suffix patterns.
  - Optimized dropdown menu positioning and accessibility for multi-select components.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can be saved even if data fetching fails when manually adding an account.
  - Added "Settings Partition" feature to the settings page, supporting resetting settings by region.

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
  - Prevented unnecessary WebDAV configuration reset during configuration migration.

## 2.6.0
- **New Features:**
  - "New API Channel Import" UI optimized to support key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process, improving accuracy.
- **Bug Fixes:**
  - Model name standardization now consistent with Veloera backend and preserves hyphens.
  - Resolved browser storage quota issues and improved model matching.

## 2.5.0
- **New Features:**
  - Added support for Neo-API site types.
- **Bug Fixes:**
  - Fixed Base64 encoding issue during CherryStudio URL generation.
  - Removed redundant account fetching and Token validation in Channel dialog, improving efficiency.

## 2.4.1
- **Bug Fixes:**
  - Ensured settings page always opens in a new tab.

## 2.4.0
- **New Features:**
  - Auto-import feature now integrates with the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - Multi-select component now supports collapsible selected areas and optimized input experience.
- **Bug Fixes:**
  - Optimized retry mechanism and added user feedback.
  - Optimized multi-select component performance with a large number of selections.

## 2.3.0
- **New Features:**
  - Added account pinning and unpinning functionality, supporting priority sorting for pinned accounts.
- **Bug Fixes:**
  - Shrunk pin icon and fixed configuration migration version issue.
  - Optimized sorting configuration, increasing priority for current site conditions.

## 2.2.1
- **Bug Fixes:**
  - Removed `isDetected` check for auto-configure button.
  - Ensured account detection refreshes correctly when displaying data changes.
  - Fixed an issue where Access Token is no longer required for Cookie authentication type.

## 2.2.0
- **New Features:**
  - Auto check-in feature now includes a results/history interface, with optimized default settings and user experience.
  - Implemented daily site auto check-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case-sensitive issue in auto check-in status detection.
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
  - Each row in the results table now has a sync operation button.
  - Implemented initial service, background logic, and settings interface for "New API Model Sync".
- **Bug Fixes:**
  - Row retry operations now only update target and progress UI.
  - Updated Channel list response handling and types.

## 1.38.0
- **New Features:**
  - Supports pinning accounts with custom check-in or redemption URLs configured.
  - Added custom redemption and open tab matching as sorting rules.
- **Bug Fixes:**
  - Ensured deep copy of default sorting rules.
  - New sorting conditions are disabled by default after migration.

## 1.37.0
- **New Features:**
  - Account search functionality enhanced to support multi-field compound search across UI interfaces.
  - Added open sidebar functionality.
- **Bug Fixes:**
  - Supplemented translation for "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with a redemption page path and support redirection.
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
  - Replaced `chrome.runtime` with `browser.runtime` to improve cross-browser compatibility and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced reusable `AppLayout` component to enhance UI consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed incorrect right content container width on small screens.

## 1.32.0
- **New Features:**
  - Account management interface layout and responsiveness improved.
  - Added configurable React DevTools auto-plugin and caching.
- **Bug Fixes:**
  - Fixed mobile sidebar overlay `z-index` issue.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Account management added "Create Account" button and optimized layout.
  - Account management added "Usage Log" feature.
  - Sorting priority settings now support drag-and-drop auto-save, removing the manual save button.
- **Bug Fixes:**
  - Updated SiteInfo icon button size and accessibility labels.

## 1.30.0
- **New Features:**
  - Dialog components replaced with custom `Modal` component for improved consistency.
  - Added a comprehensive UI component library to enhance interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priority.
  - Optimized mobile sidebar overlay transparency and layering for improved user experience.

## 1.29.0
- **New Features:**
  - Pop-ups now support detection and automatic closing.
  - Pop-ups added mobile responsive layout to avoid scaling on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent auto-detection functionality.
  - Migrated `chrome.*` API to `browser.*` API, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functional compatibility and user interface design on mobile devices.
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
  - Fixed RMB currency conversion logic error.

## 1.23.1
- **Bug Fixes:**
  - Amount extraction now supports exchange rate conversion.

## 1.23.0
- **New Features:**
  - Added Chinese and English localization support.
  - Added language switching functionality and Suspense loading support.
- **Bug Fixes:**
  - Completed internationalization of remaining hardcoded text.
  - Fixed an issue where a success message was still displayed when no accounts were refreshed.

## 1.22.0
- **New Features:**
  - Account added "Today's Total Revenue" field and revenue display interface.
  - Supports redemption code top-up type.
- **Bug Fixes:**
  - Fixed rendering logic for custom URL check-in interface.
  - Corrected check-in field names and return structure.

## 1.21.0
- **New Features:**
  - Added favicon and extension icons for pop-up, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and pop-up operations.
  - Migrated underlying framework from Plasmo to WXT, bringing better performance and development experience.

## 1.20.0
- **New Features:**
  - Balance and health status indicators now include refresh functionality.
  - Action button UI unified and optimized, supporting intelligent key handling.

## 1.19.0
- **New Features:**
  - All components now support dark mode.
  - Implemented theme system, supporting dark, light, and system-follow modes.
- **Bug Fixes:**
  - API configuration interface now enforces `authType` field.

## 1.18.0
- **New Features:**
  - Account added custom check-in button (with Yen icon).
  - Implemented versioned configuration migration system to ensure compatibility during updates.
  - Sorting feature added custom check-in URL as a sorting condition.
- **Bug Fixes:**
  - Fixed an issue where custom check-in URL was not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication types.
  - API authentication options added "No Authentication" type.
  - Tooltip component migrated to `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" feature added account auto-configuration support.
  - Site accounts added check-in functionality.
  - Implemented a customizable sorting priority system.

## 1.15.0
- **Bug Fixes:**
  - Fixed an issue where unnecessary updates and notifications were triggered even when values did not change.

## 1.14.0
- **New Features:**
  - Added tab activation and update listeners for auto-detection.

## 1.13.0
- **New Features:**
  - Added "New API" integration, supporting Token import.
  - Added "New API" integration settings in preferences.
  - Added password visibility toggle functionality.

## 1.12.1
- **Bug Fixes:**
  - Moved default sort values to `UserPreferencesContext`.
  - Fixed potential rendering issues when preferences are loaded.

## 1.12.0
- **New Features:**
  - Account sorting added health status priority.
  - Health status now includes more detailed reason information.

## 1.11.0
- **New Features:**
  - Refresh functionality enhanced, now supporting detailed status tracking.
  - Added minimum refresh interval to avoid frequent requests.

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
  - Account management added site type support.
  - Added site type detection and optimized auto-detection process.
  - Implemented model pricing functionality for OneHub sites.

## 1.7.1
- **Bug Fixes:**
  - Fixed logic error when using site status detection for check-in support.

## 1.7.0
- **New Features:**
  - Added check-in support detection and toggle functionality.
  - Accounts added check-in status support.

## 1.6.0
- **New Features:**
  - Account management added remark field support.

## 1.5.0
- **Performance Optimizations:**
  - Model list rendering optimized, improving loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed an issue where detected account status was automatically reset when no existing account was found.

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
  - Added account management page, supporting full CRUD functionality.
  - Custom dialogs in pop-ups replaced with direct function calls, simplifying operations.

## 1.1.1
- **Bug Fixes:**
  - Fixed logic for handling missing system names and checks.

## 1.1.0
- **New Features:**
  - Accounts added manual addition support and optimized UI flow.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and warning prompt when adding an account.
  - Introduced sidebar functionality, replacing pop-up auto-site configuration.

## 0.0.3
- **New Features:**
  - Optimized account identification process, now supporting automatic creation of access keys.
  - Account list added sortable table headers, copy key dialog, and hover action buttons.
  - Account management added remark field.
  - Website names are clickable for navigation.
  - Model list supports Group selection.
  - Pop-up page added number scrolling animation and site status indicator.
  - Optimized add/edit account dialog, including top-up Ratio settings and automatic site name extraction.
  - Fully implemented settings page system, supporting user preference persistence and auto-refresh.
  - Enhanced auto-refresh frontend interface and background service.
  - Automatically adds `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic update and deletion of account health status.
  - Supports more AI model providers (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Pop-up interface refactored to API manager style, adding today's total consumption display.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed model data format incompatibility, `localStorage` access, and API request credential issues.
  - Corrected API authentication methods.
  - Optimized URL input handling and auto-refresh configuration.
  - Added pagination logic for log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**