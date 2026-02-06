# Changelog

This page records major updates for general users (feature changes / experience optimizations / bug fixes). For the complete version history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip New Users Start Here
- **How to check your current version**: Open the extension pop-up; the title bar displays the version number. You can also view it on the Settings page.
- **Automatically open this page after updating**: You can control whether to "Automatically open the changelog after updating" in "Settings → General → Changelog".
- **Troubleshooting Issues**: You can enable console logs in "Settings → General → Logs" and attach the reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.14.0
- **New Features:**
  - Web AI API Functionality Availability Test (Beta): Added right-click menu option "Quickly test AI API functionality availability," which opens the test panel directly on the current webpage. Supports filling/pasting `Base URL` and `API Key`, and performs basic capability detection for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible also supports one-click model list retrieval).
  - (Optional) Automatic Detection: Can be enabled in "Settings → AI API Test," where you can also configure a URL whitelist. When a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (disabled by default, and the Key will not be saved).
  - Automatic Check-in: The execution result list now includes more troubleshooting tips—including suggestions and documentation links for common exceptions like "Temporary bypass tab manually closed" and "Access Token invalid."
- **Bug Fixes:**
  - WebDAV: Automatic synchronization migrated from timers to the browser Alarms API, reducing the probability of missed synchronization caused by background sleep/power-saving policies.

**Location Tip:**
- AI API Test Panel: Select "Quickly test AI API functionality availability" from the right-click menu on any webpage; automatic detection settings are in "Settings → AI API Test."
- Automatic Check-in Prompt: View in the execution result list under "Settings → Automatic Check-in."

## 3.13.0
- **New Features:**
  - Account Management: Added "Check-in Status Expired" prompt—an orange warning icon is displayed when the "Checked in today/Not checked in" status was not detected today. Clicking it refreshes the account data instantly, preventing misleading old statuses.
  - Interface: Multi-select controls upgraded to a more compact selector (saves space, supports searching, and provides clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and check-in logic, improving availability.
  - Cookie Authentication: Removed the Cookie caching mechanism, reducing exceptions caused by reading old values after Cookie updates.

**Location Tip:**
- Check-in Status Expired Prompt: In the account list under "Settings → Account Management," next to the check-in icon on the right side of the site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code"—generates providerProfiles configuration for Kilo Code / Roo Code, supporting copying the apiConfigs snippet or downloading settings JSON for import (import is additive and will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by overly long texts such as site names; changed to automatically truncated display.
  - Dropdown Selector: Optimized empty state prompts and fixed overflow issues when option text is too long.

**Location Tip:**
- Export to Kilo Code: In the key list under "Settings → Key Management," click the Kilo Code icon in the top right corner of a specific key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder—a warning dialog pops up when the existence of the same/similar channel is detected, allowing the user to choose whether to continue creation or cancel (no longer blocked by an error Toast).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by overly long texts such as site names; changed to automatically truncated display.

## 3.10.0
- **New Features:**
  - Account Management: Clicking the site link in Incognito Mode will open it within the current incognito window (facilitating persistent incognito login status).
  - Account Management: Disabled accounts also support clicking the site link, allowing them to be used as bookmarks.
  - Usage Analytics: When there is only a single account, charts and lists prioritize displaying the site name (instead of the username) for more intuitive information.
  - Bypass Helper: The temporary bypass window now supports CAP (cap.js) Proof-of-Work verification, improving the success rate.
- **Bug Fixes:**
  - Redemption Helper: Prioritizes reading the redemption code from the clipboard, improving trigger accuracy.
  - Notification Overlay: Fixed Toaster layer issues; notifications are no longer obscured by the webpage.

**Location Tip:**
- Site Link: Click the site name in the account list under "Settings → Account Management."
- Bypass Helper: Refer to [Cloudflare Bypass Helper](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Account added "Manual Balance (USD)" field—when the site cannot automatically retrieve the balance/quota, this can be manually filled for display and statistics.
  - Account Management: Account added "Exclude from Total Balance" toggle—used to remove specific accounts from the "Total Balance" statistics (does not affect functions like refresh/check-in).
  - Settings: Added "Automatically open changelog after updating" toggle (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings, controlling whether to output console logs and the minimum log level, facilitating troubleshooting.
  - Automatic Check-in: Related data is refreshed and the interface is synchronized after execution is complete.

**Location Tip:**
- Account Add/Edit: Open Add/Edit Account in "Settings → Account Management."
- Changelog Toggle, Log Settings: Configure in "Settings → General."

## 3.8.0
- **New Features:**
  - Usage Analytics: Added "Usage Analytics" page, helping you chart usage trends across multiple sites and accounts, making it clear "where usage is high / spending is high / performance is slow," facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overview (request count, Tokens, Quota), model distribution/spending distribution, account comparison, usage time hotspots, and latency trends/histograms.
  - Usage History Synchronization: Added "Usage History Synchronization" capability, used to retrieve and save "aggregated usage data" (does not save raw logs). Supports setting retention days, automatic synchronization method, and minimum synchronization interval, and allows viewing the synchronization result and error prompt for each account in "Synchronization Status."
- **How to Use:**
  - First, go to "Settings → Account Usage" to enable "Usage History Synchronization," set as needed, and click "Sync Now."
  - Then, go to the left menu "Usage Analytics" to view charts; click "Export" when retention or reconciliation is needed.

## 3.7.0
- **New Features:**
  - Sorting: Account list supports sorting by "Revenue"; sorting priority added "Disabled Accounts Sink to Bottom," preventing deactivated/invalid accounts from interfering with daily use.
  - Automatic Check-in: Added "Pre-trigger Today's Check-in when opening the interface"—when opening the pop-up/sidebar/settings page within the time window, it automatically attempts to run today's check-in once, without waiting for the scheduled time.
- **Bug Fixes:**
  - Automatic Check-in: Each account will only execute once per day; retries are only for failed accounts, reducing meaningless requests and repeated interruptions.
- **Location Tip:**
  - Sorting Priority: Adjust in "Settings → Account Management."
  - Automatic Check-in Pre-trigger/Retry: Configure in the left menu "Automatic Check-in."

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enabling/disabling of accounts; disabling skips the account for various functions, allowing data retention after the account expires.
  - Tags: Added global tag management, and synchronized optimization of related interfaces and interactions, facilitating categorized account management.
  - Pop-up: Displays the current version number in the title bar and provides a direct entry to this changelog.
  - Quick Export: CCSwitch export supports selecting upstream models, making the export configuration closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized display strategy for extremely small values, preventing unexpected display due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Automatic Check-in" toggle (moved above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed gradient background color from dialog title icons for a cleaner, unified visual look.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Automatic Detection: Added "Detection Slow" prompt and related documentation link to help users troubleshoot and resolve issues.
  - External Check-in Batch Open: Supports opening all in a new window, facilitating batch closing and reducing interference.
- **Bug Fixes:**
  - External Check-in Batch Open: Process refactored to execute in the background service, ensuring all sites can be opened correctly in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration, supporting direct selection of upstream models for more precise model mapping.
- **Bug Fixes:**
  - API: Ensured access keys always have the `sk-` prefix, preventing recognition/copy issues caused by inconsistent formatting.

## 3.3.0
- **New Features:**
  - Automatic Check-in: Account recognition added "Username" information, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the steps required for individual operations.
  - Automatic Refresh: Minimum refresh interval no longer restricts the maximum value, allowing larger minimum intervals to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions, reducing false triggers in non-copy scenarios.
  - Redemption Helper: Validates all redemption codes before the pop-up prompt, reducing invalid redemption prompts.
  - Storage: Write operations now include a write lock, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text for "Copy Model Name."

## 3.2.0
- **New Features:**
  - "Model List" page added "API Availability Detection" (Beta), used to quickly confirm whether the current key is available for specified models (e.g., text generation, tool/function calling, structured output (returning in JSON structure), Web Search (Grounding), etc.).
  - "Model List" page added "CLI Tool Compatibility Detection" (Beta), simulating the tool calling process of Claude Code / Codex CLI / Gemini CLI to evaluate interface compatibility with these tools.
  - "About" page added "Rating and Download": Automatically identifies the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entries for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating problem location.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed, preventing redundant opening.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`), reducing Cookie retrieval failures due to insufficient permissions.

## 3.1.0
- **New Features:**
  - Added guidance for filling in administrator credentials in Self-Managed API Settings.
  - Redemption Helper supports batch redemption and single-code retry.

## 3.0.0
- **New Features:**
  - Supports normal coexistence and full functionality for multiple cookie authenticated accounts on a single site, primarily for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy, model, and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic; the two no longer interfere with each other.
- **Bug Fixes:**
  - Fixed incorrect web path redirection for manual check-in on New-API sites.

## 2.39.0
- Added automatic detection and modification of check-in support status for account sites during account data refresh.
- Automatically opens the changelog page and navigates to the corresponding version anchor upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Helper:
  - Use keyboard up/down arrows to select the specific redemption account.
  - Press Enter to confirm redemption.
- Added a prompt to temporary bypass tabs, explaining that the current tab is from this extension and its specific purpose.
- Improved bypass window display: single window, multiple tabs, meaning short-term requests will reuse the same window, minimizing interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API Channel Management.
- More lenient redemption code format detection options supported; when encountering custom redemption code formats, the code can be correctly identified and the Redemption Helper will pop up.
- Fixed some known issues.

## 2.36.0
- Supports quick jump to specific channels for management.
- Fixed an issue where channel model synchronization time would be reset.

## 2.35.1
- Fixed an issue where automatic check-in execution time would be reset.
- UI optimization.

## 2.35.0
- Added optional clipboard read permission to prompt for redemption when any potential redemption code is copied.
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

## 2.32.0
- **New Features:**
  - Model redirection is now smarter, supporting version numbers indicated by hyphens and dots.
  - Added the ability to redeem directly via the right-click menu after selecting text.
  - Automatic check-in feature is enabled by default, and the check-in time window has been extended.

## 2.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Check-in operation can now be quickly executed in the pop-up.
  - Redemption Helper added URL whitelist functionality, allowing better control over which websites can use the helper.

## 2.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capability for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, and added a decryption retry dialog during restoration, while also retaining your WebDAV configuration.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website Cookie interception issue during automatic detection.
  - Optimized centering of blank state content in Firefox.
  - Migrated Switch component to a custom implementation, improving compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced "Managed Sites" service, laying the foundation for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" in settings to "Managed Sites" for clarity.
- **Bug Fixes:**
  - Optimized translation text, removing redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes, helping you understand specific issues.
  - Temporary window bypass feature added a health status indicator.
  - Optimized the description for bypassing website protection, making it clearer.
  - Added a reminder system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed display issues with Firefox pop-up prompts in Chinese settings.
- **Performance Optimization:**
  - Improved sorting function performance.

## 2.26.0
- **New Features:**
  - Added model pricing caching service to speed up data loading.
  - Account overview bar added to the top of the model list for quick viewing.
  - Now supports displaying model pricing information for multiple accounts simultaneously.
  - Introduced new command and dialog UI components.
  - Added searchable selection component to improve selection efficiency.
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
  - Tag filter added visibility control based on row count.
  - WebDAV connection test now supports more successful status codes.
- **Bug Fixes:**
  - Removed the extra period at the end of JSON strings.

## 2.23.0
- **New Features:**
  - Enhanced account tag functionality.
  - Temporary window bypass feature now supports smarter judgment based on error codes.

## 2.22.0
- **New Features:**
  - Account Management added tag functionality, facilitating account categorization.
  - Redemption Helper pop-up UI now supports lazy loading and fixed issues that could cause website style corruption.
  - Added global channel filter and JSON editing mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed redundant "Checked in today" check in automatic check-in.
  - Simplified and fixed the temporary window fetching logic.
  - Restored parsing of search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guidance upon first installation, helping users understand required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed overflow issue with action buttons in the account dialog.
  - Redemption amount conversion factor now uses constants, improving accuracy.
  - Limited the Cookie interceptor to Firefox browser only.

## 2.19.0
- **New Features:**
  - Added loading status and prompt information during the redemption process.
  - Removed clipboard reading function from the Redemption Helper.
- **Bug Fixes:**
  - Supplemented missing background error message translations.
  - Prevented concurrent service initialization and race conditions, improving stability.
  - Resolved intermittent "Could not establish connection" errors.
  - Prevented race conditions during temporary window pool destruction.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Helper feature.
  - Firefox browser now supports WebRequest-based Cookie injection mechanism.
  - Redemption feature now supports themes and optimized prompt messages.
  - Redemption prompt messages now include source information and settings link.
- **Bug Fixes:**
  - Fixed path issue with Tailwind CSS files.

## 2.17.0
- **New Features:**
  - Added automatic pop-up prompt function for one-click redemption.
  - Unified data format for Import/Export and WebDAV Backup, adopting V2 versioning scheme, improving compatibility and stability.

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
  - Enhanced automatic check-in feature, including retry strategy, skip reason, and account snapshot.
  - Optimized automatic check-in execution method to concurrent processing, improving efficiency.
- **Bug Fixes:**
  - Fixed default behavior issue with the `autoCheckInEnabled` flag.

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
  - "New API Model Synchronization" option is hidden in the sidebar when configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Synchronization" added model allow list filtering functionality.
  - Sidebar now supports collapsing/expanding with smooth animation effects.

## 2.11.0
- **New Features:**
  - Account Management functionality enhanced, adding search and navigation optimization.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed logical error in automatic check-in status.

## 2.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanism, improving communication stability.
  - Model synchronization added manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection, and automatically attempts to bypass protection using a temporary window when encountered.
  - Introduced temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support "Month-Day" and "Month_Day" date suffix patterns.
  - Optimized dropdown menu positioning and accessibility for multi-select components.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can be saved even if data retrieval fails during manual account addition.
  - Settings page added "Settings Partition" feature, supporting resetting settings by area.

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
  - User preferences such as `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now required fields to ensure default configuration completeness.
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
  - Removed redundant account retrieval and token validation in the channel dialog, improving efficiency.

## 2.4.1
- **Bug Fixes:**
  - Ensured the settings page always opens in a new tab.

## 2.4.0
- **New Features:**
  - Automatic import feature now integrates the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - Multi-select component now supports collapsible selected area and optimized input experience.
- **Bug Fixes:**
  - Optimized retry mechanism and increased user feedback.
  - Optimized multi-select component performance with a large number of selections.

## 2.3.0
- **New Features:**
  - Added account pinning and unpinning functionality, supporting priority sorting for pinned accounts.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration, increasing the priority of the current site condition.

## 2.2.1
- **Bug Fixes:**
  - Removed `isDetected` check for the auto-configure button.
  - Ensured account detection refreshes correctly when displaying data changes.
  - Fixed issue where Access Token is no longer required for Cookie authentication type.

## 2.2.0
- **New Features:**
  - Automatic check-in feature added result/history interface, and optimized default settings and user experience.
  - Implemented daily site automatic check-in, supporting time window setting and status display.
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
  - "New API Model Synchronization" filter bar added execution statistics.
  - Each row in the result table added a synchronization operation button.
  - Implemented initial service, background logic, and settings interface for "New API Model Synchronization."
- **Bug Fixes:**
  - Row retry operation now only updates the target and progress UI.
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
  - Account search functionality enhanced, supporting multi-field compound search across UI interfaces.
  - Added open sidebar functionality.
- **Bug Fixes:**
  - Supplemented translation for the "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with a redemption page path and support redirection.
  - Option to automatically open the redemption page after check-in.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - Check-in icon updated to a "Yen" icon for better intuition.
- **Bug Fixes:**
  - Custom check-in accounts now automatically reset check-in status daily.
  - Fixed default value issue for the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic account data synchronization with a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` to improve cross-browser compatibility, and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced reusable `AppLayout` component to improve interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed incorrect width of the right content container on small screens.

## 1.32.0
- **New Features:**
  - Account Management interface layout and responsiveness improved.
  - Added configurable React DevTools auto-plugin and caching.
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
  - Dialog component replaced with custom `Modal` component for improved consistency.
  - Added a comprehensive set of UI components, enhancing interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priority.
  - Optimized transparency and layering of the mobile sidebar overlay for better user experience.

## 1.29.0
- **New Features:**
  - Pop-up now supports detection and automatic closing.
  - Pop-up added mobile responsive layout, avoiding the need for zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent automatic detection functionality.
  - Migrated `chrome.*` API to `browser.*` API, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured feature compatibility and UI design on mobile devices.
- **Bug Fixes:**
  - Fixed issue with `tabId` parsing after window creation.
  - Prevented spinning animation on button borders during refresh.

## 1.27.0
- **New Features:**
  - Account dialog automatically closes after successful automatic configuration to New API.
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
  - Fixed logical error in RMB currency conversion.

## 1.23.1
- **Bug Fixes:**
  - Amount extraction now supports exchange rate conversion.

## 1.23.0
- **New Features:**
  - Added Chinese and English localization support.
  - Added language switching functionality and supports Suspense loading.
- **Bug Fixes:**
  - Completed internationalization of remaining hardcoded text.
  - Fixed issue where success message was still displayed when no accounts were refreshed.

## 1.22.0
- **New Features:**
  - Account added "Total Revenue Today" field and revenue display interface.
  - Supports redemption code recharge type.
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
  - Action button UI unified and optimized, supporting intelligent key handling.

## 1.19.0
- **New Features:**
  - All components now support Dark Mode.
  - Implemented a theme system, supporting Dark, Light, and Follow System modes.
- **Bug Fixes:**
  - API configuration interface now enforces the `authType` field requirement.

## 1.18.0
- **New Features:**
  - Account added custom check-in button (with Yen icon).
  - Implemented a versioned configuration migration system, ensuring compatibility during updates.
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
  - Fixed issue where unnecessary updates and notifications were triggered even when the value had not changed.

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
  - Key copy functionality added Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub token management and data retrieval functionality.
  - Added user group data conversion and API integration.
  - Implemented model retrieval functionality for OneHub sites.

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
  - Account Management added support for a remarks field.

## 1.5.0
- **Performance Optimization:**
  - Optimized rendering method for the model list, improving loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed issue where the status of a detected account was automatically reset when no existing account was found.

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
  - Account added manual addition support and optimized UI flow.

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
  - Site names are clickable for redirection.
  - Model list supports group selection.
  - Pop-up page added number scrolling animation and site status indicator.
  - Optimized Add/Edit Account dialog, including recharge Ratio setting and automatic extraction of site name.
  - Fully implemented the settings page system, supporting user preference persistence and automatic refresh.
  - Enhanced frontend interface and background service for automatic refresh functionality.
  - Automatically adds `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Supports more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - Pop-up interface refactored to API Manager style, adding display of total consumption amount today.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed model data format incompatibility, `localStorage` access, and API request credential issues.
  - Corrected API authentication methods.
  - Optimized URL input handling and automatic refresh configuration.
  - Added pagination logic to handle log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**