# Changelog

## 3.3.0
- **New Features:**
  - Automatic Check-in: Account identification now includes "Username" information, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports triggering external check-ins in batches, reducing the steps required for individual operations.
  - Automatic Refresh: The minimum refresh interval no longer has a maximum limit, allowing for a larger minimum interval to control the refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce false positives in non-copying scenarios.
  - Redemption Assistant: All redemption codes are now validated before the popup prompt appears, reducing invalid redemption notifications.
  - Storage: Write operations now include a write lock to improve data consistency during concurrent writes.
  - UI: Adjusted localization text related to "Copy Model Name."

## 3.2.0
- **New Features:**
  - The "Model List" page now includes "API Availability Detection" (Beta), used to quickly confirm whether the current key is available for specified models (e.g., Text Generation, Tool/Function Calling, Structured Output (return as JSON structure), Web Search (Grounding), and other detection items).
  - The "Model List" page now includes "CLI Tool Compatibility Detection" (Beta), simulating the tool calling process of Claude Code / Codex CLI / Gemini CLI to evaluate API compatibility with these tools.
  - The "About" page now includes "Rating and Download": Automatically identifies the current store source (Chrome / Edge / Firefox) and provides one-click rating and download links for other stores.
- **Bug Fixes:**
  - When a site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating problem identification.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed, preventing redundant opening.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures caused by insufficient permissions.

## 3.1.0
- **New Features:**
  - Added administrator credential filling guidance in the Self-Managed API settings.
  - Redemption Assistant supports batch redemption and single-code retry.

## 3.0.0
- **New Features:**
  - Supports the normal coexistence of multiple cookie-authenticated accounts on a single site, with all features available. This is primarily for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy, model, and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic; they no longer affect each other.
- **Bug Fixes:**
  - Fixed an incorrect webpage path for manual check-in on the New-API site.

## 2.39.0
- When refreshing account data, automatically detect and modify the check-in support status for the account's site.
- When the version is updated, automatically open the changelog page and navigate to the corresponding version anchor.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Select specific redemption accounts directly using the up and down arrow keys.
  - Press Enter to confirm redemption.
- Added a prompt for temporary shield bypass tabs, explaining that the current tab originates from this extension and its specific purpose.
- Improved display method for the shield bypass window: single window with multiple tabs, meaning short-term requests will reuse the same window, minimizing interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized the user experience for New-API Channel Management.
- Support for more lenient redemption code format detection options. When encountering a custom redemption code format, the code can be correctly identified, and the Redemption Assistant will pop up.
- Fixed some known issues.

## 2.36.0
- Supports quick jump to specific channels for management.
- Fixed an issue where channel model synchronization time would be reset.

## 2.35.1
- Fixed an issue where the automatic check-in execution time would be reset.
- UI optimization.

## 2.35.0
- Added optional clipboard read permission to prompt for redemption when any possible redemption code is copied.
- Added cdk.linux.do to the Redemption Assistant default URL whitelist.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the extension icon, choosing to open a popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error during account ID comparison.
  - Ensured all temporary contexts are closed correctly.

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
  - Added the ability to redeem directly via the right-click menu after selecting text.
  - Automatic check-in is enabled by default, and the check-in time window has been extended.

## 2.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Check-in operations can now be quickly executed in the popup.
  - Redemption Assistant added a URL whitelist feature, allowing better control over which websites can use the assistant.

## 2.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capability for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, adds a decryption retry popup during restoration, and preserves your WebDAV configuration.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed the issue of site Cookie interception during automatic detection.
  - Optimized the centering of blank status content in Firefox.
  - Migrated the Switch component to a custom implementation to improve compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced "Managed Sites" service, laying the foundation for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" in settings to "Managed Sites" for clarity.
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
  - Fixed the display issue of Firefox popup prompts in Chinese settings.
- **Performance Optimization:**
  - Improved the performance of the sorting function.

## 2.26.0
- **New Features:**
  - Added a model pricing cache service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Now supports displaying model pricing information for multiple accounts simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 2.25.0
- **New Features:**
  - Added a beginner's guide card when the account list is empty.
  - Related UI elements are automatically hidden when pinning/manual sorting is disabled.
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
  - Enhanced account tagging functionality.
  - Temporary window bypass now supports smarter judgment based on error codes.

## 2.22.0
- **New Features:**
  - Account management added a tagging feature for easier account classification.
  - The Redemption Assistant popup UI now supports lazy loading and fixed issues that could cause website style disruption.
  - Added global channel filter and JSON editing mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed redundant "Already checked in today" check in automatic check-in.
  - Simplified and fixed the temporary window fetching logic.
  - Restored the parsing of search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guidance upon first installation to help users understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed the issue of operation button overflow in the account dialog.
  - Redemption amount conversion coefficient now uses constants for improved accuracy.
  - Restricted the Cookie interceptor to only be used in the Firefox browser.

## 2.19.0
- **New Features:**
  - Added loading status and prompt information during the redemption process.
  - Removed the clipboard reading function from the Redemption Assistant.
- **Bug Fixes:**
  - Supplemented missing backend error message translations.
  - Prevented concurrent service initialization and race conditions, improving stability.
  - Resolved intermittent "Could not establish connection" errors.
  - Prevented race conditions during temporary window pool destruction.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Assistant feature.
  - Firefox browser now supports WebRequest-based Cookie injection mechanism.
  - Redemption feature now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and a settings link.
- **Bug Fixes:**
  - Fixed the path issue for Tailwind CSS files.

## 2.17.0
- **New Features:**
  - Added automatic popup notification for one-click redemption.
  - Unified data format for Import/Export and WebDAV backup, adopting V2 versioning scheme to enhance compatibility and stability.

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
  - Optimized automatic check-in execution method to concurrent processing, improving efficiency.
- **Bug Fixes:**
  - Fixed the default behavior issue of the `autoCheckInEnabled` flag.

## 2.13.0
- **New Features:**
  - Added "New API Channel Management" feature.
  - Added "Warning" button style.
  - Introduced Radix UI components and Tanstack Table to enhance interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed incorrect display and sorting of model counts in the channel table.

## 2.12.1
- **Bug Fixes:**
  - Fixed unnecessary channel reloading when manually selecting a tab.
  - The "New API Model Sync" option is hidden in the sidebar when the configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Sync" added model allow list filtering.
  - The sidebar now supports collapsing/expanding with smooth animation effects.

## 2.11.0
- **New Features:**
  - Account management functionality enhanced with new search features and navigation optimization.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed logical errors in automatic check-in status.

## 2.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanism, improving communication stability.
  - Model synchronization added a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection, and automatically attempts to bypass using a temporary window when protection is encountered.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "Month-Day" and "Month_Day."
  - Optimized dropdown menu positioning and accessibility for the MultiSelect component.

## 2.8.0
- **New Features:**
  - Added fault tolerance for partial account updates.
  - Account information can be saved even if data fetching fails when manually adding an account.
  - The settings page added a "Settings Partition" feature, supporting resetting settings by area.

## 2.7.1
- **Bug Fixes:**
  - Fixed an issue where redirected models did not appear in the model list during API synchronization.

## 2.7.0
- **New Features:**
  - The account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hidden the password display button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - User preferences such as `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now required fields to ensure the integrity of default configurations.
- **Bug Fixes:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed the absence of "New API Preferences" in configuration checks.
  - Corrected the check-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 2.6.0
- **New Features:**
  - The user interface for "New API Channel Import" has been optimized, supporting key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process for improved accuracy.
- **Bug Fixes:**
  - Model name standardization now aligns with the Veloera backend and preserves hyphens.
  - Addressed browser storage quota issues and improved model matching.

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
  - Optimized the retry mechanism and added user feedback.
  - Optimized the performance of the MultiSelect component with a large number of selections.

## 2.3.0
- **New Features:**
  - Added account pinning and unpinning features, and supports prioritizing pinned accounts in sorting.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration, giving higher priority to the current site condition.

## 2.2.1
- **Bug Fixes:**
  - Removed the `isDetected` check for the auto-configure button.
  - Ensured account detection refreshes correctly when displaying data changes.
  - Fixed the issue where Access Token is no longer required for Cookie authentication type.

## 2.2.0
- **New Features:**
  - Automatic check-in feature added a results/history interface, and optimized default settings and user experience.
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
  - Each row in the results table added a sync operation button.
  - Implemented the initial service, background logic, and settings interface for "New API Model Sync."
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
  - Account search functionality enhanced, supporting multi-field compound search across UI interfaces.
  - Added open sidebar functionality.
- **Bug Fixes:**
  - Supplemented the translation for the "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with a redemption page path and support jumping to it.
  - Option to automatically open the redemption page after check-in.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API routing paths for multiple sites.

## 1.35.0
- **New Features:**
  - Check-in icon updated to the "Yen" icon for better visualization.
- **Bug Fixes:**
  - Custom check-in accounts now automatically reset check-in status daily.
  - Fixed the default value issue for the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic account data synchronization with a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` to improve cross-browser compatibility and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced a reusable `AppLayout` component to enhance interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed incorrect width of the right content container on small screens.

## 1.32.0
- **New Features:**
  - Improved the layout and responsiveness of the account management interface.
  - Added configurable React DevTools auto-plugin and caching.
- **Bug Fixes:**
  - Fixed the `z-index` issue of the mobile sidebar overlay.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Account management added a "Create Account" button and optimized the layout.
  - Account management added a "Usage Log" feature.
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
  - Popups now support detection and automatic closing.
  - Popups added mobile responsive layout to avoid requiring zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform smart automatic detection.
  - Migrated `chrome.*` API to `browser.*` API, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured feature compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed the issue of `tabId` parsing after window creation.
  - Prevented the button border from showing a spinning animation during refresh.

## 1.27.0
- **New Features:**
  - The account dialog automatically closes after successful automatic configuration to the New API.
  - Implemented dynamic loading of localization resources to enhance internationalization support.
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
  - Fixed logical error in RMB currency conversion.

## 1.23.1
- **Bug Fixes:**
  - Amount extraction now supports exchange rate conversion.

## 1.23.0
- **New Features:**
  - Added Chinese and English localization support.
  - Added language switching feature and supports Suspense loading.
- **Bug Fixes:**
  - Completed internationalization for remaining hardcoded text.
  - Fixed the issue where a success message was still displayed when no accounts were refreshed.

## 1.22.0
- **New Features:**
  - Accounts added "Today's Total Revenue" field and revenue display interface.
  - Supports redemption code recharge type.
- **Bug Fixes:**
  - Fixed the rendering logic for the custom URL check-in interface.
  - Corrected check-in field names and return structure.

## 1.21.0
- **New Features:**
  - Added favicon and extension icons for popup, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and popup operations.
  - Underlying framework migrated from Plasmo to WXT, bringing better performance and development experience.

## 1.20.0
- **New Features:**
  - Balance and health status indicators added refresh functionality.
  - Operation button UI unified and optimized, supporting smart key handling.

## 1.19.0
- **New Features:**
  - All components now support dark mode.
  - Implemented a theme system, supporting dark, light, and system-following modes.
- **Bug Fixes:**
  - API configuration interface now strictly requires the `authType` field.

## 1.18.0
- **New Features:**
  - Accounts added a custom check-in button (with Yen icon).
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
  - Fixed unnecessary updates and notifications being triggered when values had not changed.

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
  - Fixed potential rendering issues when preferences were loading.

## 1.12.0
- **New Features:**
  - Account sorting added health status priority.
  - Health status now includes more detailed reason information.

## 1.11.0
- **New Features:**
  - Refresh functionality enhanced, now supporting detailed status tracking.
  - Added a minimum refresh interval to prevent frequent requests.

## 1.10.0
- **New Features:**
  - Key copying feature added Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub token management and data fetching functionality.
  - Added user group data conversion and API integration.
  - Implemented model fetching functionality for OneHub sites.

## 1.8.0
- **New Features:**
  - Account management added site type support.
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
  - Account management added support for a remarks field.

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
  - Added account management page, supporting complete CRUD functionality (Create, Read, Update, Delete).
  - Custom dialogs in the popup replaced with direct function calls, simplifying operations.

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
  - Introduced sidebar functionality, replacing automatic site configuration in the popup.

## 0.0.3
- **New Features:**
  - Optimized the account identification process, now supporting automatic creation of access keys.
  - Account list added sortable headers, copy key dialog, and hover operation buttons.
  - Account management added a remarks field.
  - Website names are clickable for navigation.
  - Model list supports group selection.
  - Popup page added number scrolling animation and site status indicator.
  - Optimized Add/Edit Account dialog, including recharge ratio setting and automatic extraction of site name.
  - Fully implemented the settings page system, supporting user preference persistence and automatic refresh.
  - Enhanced frontend interface and backend service for automatic refresh functionality.
  - Automatically added `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic updating and deletion of account health status.
  - Supported more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Popup interface refactored to API Manager style, adding display of today's total consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed model data format incompatibility, `localStorage` access, and API request credential issues.
  - Corrected API authentication method.
  - Optimized URL input handling and automatic refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**