# Changelog

This page records the main updates for general users (feature changes / experience optimizations / bug fixes). For the complete history and more detailed technical changes, please visit GitHub Releases.

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enabling/disabling of accounts; disabled accounts will be skipped by all features, allowing data retention even after the account becomes invalid.
  - Tags: Added global tag management, along with synchronized optimization of related interfaces and interactions, facilitating categorized account management.
  - Popup: Displays the current version number in the title bar and provides a direct link to this changelog.
  - Quick Export: CCSwitch export now supports selecting upstream models, making the exported configuration closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to prevent unexpected display results due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Automatic Check-in" switch (moved above the Custom Check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from dialog title icons for a cleaner, unified visual look.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Automatic Detection: Added a "Slower Detection" warning prompt and a link to relevant documentation to help users troubleshoot and resolve issues.
  - Batch Open External Check-in: Supports opening all sites in new windows, facilitating batch closing and reducing interference.
- **Bug Fixes:**
  - Batch Open External Check-in: The process was refactored to execute in the background service, ensuring all sites open correctly in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to support direct selection of upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured access keys always start with the `sk-` prefix to prevent identification/copying issues caused by inconsistent formatting.

## 3.3.0
- **New Features:**
  - Automatic Check-in: Added "Username" information to account identification, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the steps required for individual operations.
  - Automatic Refresh: The minimum refresh interval no longer has a maximum limit, allowing for larger minimum intervals to control the refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened the trigger conditions to reduce false triggers in non-copying scenarios.
  - Redemption Assistant: Validated all redemption codes before displaying the pop-up prompt, reducing invalid redemption prompts.
  - Storage: Added write locks to write operations to improve data consistency during concurrent writes.
  - Interface: Adjusted the localization text related to "Copy Model Name."

## 3.2.0
- **New Features:**
  - Added "API Availability Detection" (Beta) to the "Model List" page, used to quickly confirm whether the current key is available for specified models (e.g., Text Generation, Tool/Function Calling, Structured Output (Return as JSON structure), Grounding/Web Search detection items).
  - Added "CLI Tool Compatibility Detection" (Beta) to the "Model List" page, simulating the tool calling process of Claude Code / Codex CLI / Gemini CLI to assess interface compatibility with these tools.
  - Added "Rating and Download" to the "About" page: Automatically identifies the current store source (Chrome / Edge / Firefox) and provides one-click rating and download links for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating problem location.
  - The "Open in Sidebar" button is no longer displayed in sidebar mode to prevent redundant opening.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures caused by insufficient permissions.

## 3.1.0
- **New Features:**
  - Added administrator credential filling guidance in the self-managed API settings.
  - Redemption Assistant supports batch redemption and single-code retry.

## 3.0.0
- **New Features:**
  - Supports the normal coexistence of multiple cookie-authenticated accounts on a single site, with all features available, primarily for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy, model, and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic; they no longer affect each other.
- **Bug Fixes:**
  - Fixed an incorrect web page path redirection during manual check-in for New-API sites.

## 2.39.0
- Added automatic detection and modification of account site check-in support status when account data is refreshed.
- Automatically opens the changelog page and navigates to the corresponding version anchor upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation in the Redemption Assistant:
  - Select the specific redemption account directly using the keyboard up/down keys.
  - Press Enter to confirm redemption.
- Added a prompt for temporary bypass tabs, explaining that the tab originates from this extension and its specific purpose.
- Improved display method for bypass windows: single window, multiple tabs, meaning short-term requests will reuse the same window, minimizing interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized the user experience for New-API Channel Management.
- Added support for a more lenient redemption code format detection option; custom redemption code formats can now be correctly identified, triggering the Redemption Assistant pop-up.
- Fixed several known issues.

## 2.36.0
- Supports quick jump to specific channels for management.
- Fixed an issue where channel model synchronization time would be reset.

## 2.35.1
- Fixed an issue where the automatic check-in execution time would be reset.
- UI Optimization.

## 2.35.0
- Added optional clipboard reading permission to prompt for redemption when any possible redemption code is copied.
- Added `cdk.linux.do` to the Redemption Assistant default URL whitelist.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the extension icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error during account ID comparison.
  - Ensured all temporary contexts are correctly closed.

## 2.33.0
- **New Features:**
  - Added "Temporary Context Mode" to bypass website protection more effectively.
  - API error messages now support internationalization (i18n).
  - Optimized website type detection, now identifiable via the temporary window title.
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
  - Check-in operations can now be quickly executed in the popup.
  - Redemption Assistant added a URL whitelist feature, allowing better control over which websites can use the assistant.

## 3.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized the detection capability for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, and added a decryption retry dialog during restoration, while also preserving your WebDAV configuration.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed the issue of website Cookie interception during automatic detection.
  - Optimized the centering of blank status content in Firefox.
  - Migrated the Switch component to a custom implementation, improving compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced "Managed Sites" service, laying the foundation for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" in settings to "Managed Sites" for better clarity.
- **Bug Fixes:**
  - Optimized translation text, removing redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes, making it easier to understand specific issues.
  - Added a health status indicator for the temporary window bypass feature.
  - Optimized the description for bypassing website protection, making it clearer.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed the display issue of Firefox popup prompts in Chinese settings.
- **Performance Optimization:**
  - Improved the performance of the sorting function.

## 2.26.0
- **New Features:**
  - Added a Model Pricing Cache Service to speed up data loading.
  - Added an Account Overview Bar at the top of the model list for quick viewing.
  - Now supports displaying model pricing information for multiple accounts simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 2.25.0
- **New Features:**
  - Added a New User Guide Card when the account list is empty.
  - Related UI elements are automatically hidden when pinning/manual sorting features are disabled.
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
  - Temporary window bypass now supports smarter judgment based on error codes.

## 2.22.0
- **New Features:**
  - Account management added a Tag feature for classifying accounts.
  - Redemption Assistant popup UI now supports lazy loading and fixed issues that could cause website style corruption.
  - Added Global Channel Filter and JSON Editing Mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed the redundant "Checked in today" check in automatic check-in.
  - Simplified and fixed the temporary window fetching logic.
  - Restored the parsing of search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guidance upon first installation to inform users of required permissions.
  - Cookie Interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed the issue of operation buttons overflowing in the account dialog.
  - Redemption amount conversion factor now uses constants for improved accuracy.
  - Restricted the Cookie Interceptor to only be used in the Firefox browser.

## 2.19.0
- **New Features:**
  - Added loading status and prompt information during the redemption process.
  - Removed the clipboard reading function from the Redemption Assistant.
- **Bug Fixes:**
  - Added missing translations for background error messages.
  - Prevented concurrent service initialization and race conditions, improving stability.
  - Resolved intermittent "Could not establish connection" errors.
  - Prevented race conditions during temporary window pool destruction.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Assistant feature.
  - Firefox browser now supports WebRequest-based Cookie injection mechanism.
  - The redemption feature now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and a link to settings.
- **Bug Fixes:**
  - Fixed the path issue for Tailwind CSS files.

## 2.17.0
- **New Features:**
  - Added automatic pop-up prompt function for one-click redemption.
  - Unified data format for Import/Export and WebDAV Backup, adopting V2 versioning scheme to enhance compatibility and stability.

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
  - Added retry and manual check-in options upon automatic check-in failure.
  - Enhanced automatic check-in functionality, including retry strategy, skip reasons, and account snapshots.
  - Optimized automatic check-in execution to concurrent processing, improving efficiency.
- **Bug Fixes:**
  - Fixed the default behavior issue of the `autoCheckInEnabled` flag.

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
  - The "New API Model Sync" option is hidden in the sidebar when the configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Sync" added model allow list filtering functionality.
  - The sidebar now supports collapsing/expanding with smooth animation effects.

## 2.11.0
- **New Features:**
  - Account management functionality enhanced, adding search capabilities and navigation optimization.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed logical error in automatic check-in status.

## 2.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanism, improving communication stability.
  - Model synchronization added a manual execution tab, supporting channel selection.
- **Bug Fixes:**
  - Ensured missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection, automatically attempting to bypass via a temporary window when protection is encountered.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized dropdown menu positioning and accessibility for the multi-select component.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can be saved even if data fetching fails during manual account addition.
  - Settings page added "Settings Partition" feature, supporting resetting settings by area.

## 2.7.1
- **Bug Fixes:**
  - Fixed an issue where redirected models did not appear in the model list during API synchronization.

## 2.7.0
- **New Features:**
  - Account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hid the password display button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - User preferences such as `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now required fields to ensure the integrity of default configuration.
- **Bug Fixes:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed the absence of "New API Preferences" in configuration checks.
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
  - Optimized the performance of the multi-select component with a large number of selections.

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
  - Automatic check-in feature added a results/history interface, and optimized default settings and user experience.
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
  - Added sync operation buttons to each row in the results table.
  - Implemented initial service, background logic, and settings interface for "New API Model Sync".
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
  - Accounts can now be configured with a redemption page path and support redirection.
  - Option to automatically open the redemption page after check-in.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API routing paths for multiple sites.

## 1.35.0
- **New Features:**
  - Check-in icon updated to the "Yen" icon for better intuition.
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
  - Introduced reusable `AppLayout` component to improve interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed incorrect width of the right content container on small screens.

## 1.32.0
- **New Features:**
  - Improved layout and responsiveness of the account management interface.
  - Added configurable React DevTools automatic plugin and caching.
- **Bug Fixes:**
  - Fixed mobile sidebar overlay `z-index` issue.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Account management added a "Create Account" button and optimized the layout.
  - Account management added "Usage Log" functionality.
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
  - Implemented cross-platform intelligent automatic detection functionality.
  - Migrated `chrome.*` API to `browser.*` API, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured feature compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed `tabId` parsing issue after window creation.
  - Prevented rotating animation on button borders during refresh.

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
  - Replaced hardcoded Chinese text in `TokenHeader` prompt with translation keys.

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
  - Added language switching feature, supporting Suspense loading.
- **Bug Fixes:**
  - Completed internationalization of remaining hardcoded text.
  - Fixed issue where success message was still displayed when no accounts were refreshed.

## 1.22.0
- **New Features:**
  - Accounts added "Today's Total Revenue" field and revenue display interface.
  - Supports redemption code recharge type.
- **Bug Fixes:**
  - Fixed rendering logic for the custom URL check-in interface.
  - Corrected check-in field names and return structure.

## 1.21.0
- **New Features:**
  - Added favicon and extension icons for popup, settings, and sidebar pages.
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
  - API configuration interface now enforces the `authType` field requirement.

## 1.18.0
- **New Features:**
  - Accounts added a custom check-in button (with the Yen icon).
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting functionality added custom check-in URL as a sorting condition.
- **Bug Fixes:**
  - Fixed issue where the custom check-in URL was not correctly passed to the handler.

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
  - Fixed potential rendering issues during preferences loading.

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
  - Added check-in support detection and switching functionality.
  - Accounts added check-in status support.

## 1.6.0
- **New Features:**
  - Account management added support for a remarks field.

## 1.5.0
- **Performance Optimization:**
  - Optimized the rendering method of the model list, improving loading performance.

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
  - Added Firefox browser detection and warning prompt when adding an account.
  - Introduced sidebar functionality, replacing the popup's automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized account identification process, now supporting automatic creation of access keys.
  - Account list added sortable headers, copy key dialog, and hover action buttons.
  - Account management added a remarks field.
  - Website names are now clickable for redirection.
  - Model list supports group selection.
  - Popup page added number scrolling animation and site status indicator.
  - Optimized Add/Edit Account dialog, including recharge ratio settings and automatic extraction of site names.
  - Fully implemented the Settings page system, supporting user preference persistence and automatic refresh.
  - Enhanced frontend interface and background service for automatic refresh functionality.
  - Automatically adds `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic updates and deletion functionality for account health status.
  - Supported more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Popup interface refactored to an API Manager style, adding display of today's total consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed incompatible model data format, `localStorage` access, and API request credential issues.
  - Corrected API authentication methods.
  - Optimized URL input handling and automatic refresh configuration.
  - Added pagination logic to handle log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**