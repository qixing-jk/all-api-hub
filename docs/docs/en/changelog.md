# Changelog

This page records the main updates for general users (feature changes / experience optimizations / bug fixes). For the complete history and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip New Users Read First
- **How to confirm your current version**: Open the extension popup; the version number will be displayed in the title bar; you can also check it on the Settings page.
- **How to stop this page from opening automatically**: You can control whether to "Automatically open Changelog after update" in 「Settings → General → Changelog」.
- **Troubleshooting**: You can enable console logs in 「Settings → General → Logs」 and attach reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.21.0
- **New Features:**
  - API Credentials: Added the "API Credentials" page, suitable for scenarios where you "don't have an account, only `Base URL` + `API Key`"; supports unified management via tags/remarks, and allows direct availability verification and quick export (e.g., for Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting across different places.
  - Balance History: Added multi-account views (Overview / Account Distribution / Trends) and provided a unified "Account Summary" table for quick comparison and summary statistics.
  - Self-Hosted Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for use in "Channel Management," "Model Sync," and other features.
- **Experience Optimizations:**
  - Right-Click Menu: The entries for "Redemption Assistant" and "AI API Test" can now be individually toggled on/off, taking effect immediately upon switching.
  - Copy Key: When an account currently has no key, the popup provides entry points for "Quickly Create Default Key / Create Custom Key," reducing back-and-forth navigation.

**Location Hints:**
- API Credentials: In 「Settings → API Credentials」.
- Balance History: In 「Settings → Balance History」.
- Done Hub Configuration: In 「Settings → Basic Settings → Self-Hosted Site Management」, select `Done Hub`, and fill in the 「Done Hub Integration Settings」.
- Right-Click Menu Entry Toggles: In 「Settings → Basic Settings → Check-in & Redemption / AI API Test」, under the respective "Show in browser right-click menu" options.
- Copy Key Popup: Opened by clicking "Copy Key" on pages like "Account Management."

## 3.20.0
- **Experience Optimizations:**
  - Key Management: When adding a new key, the group dropdown option now simultaneously displays the Group ID and description, facilitating quick distinction and selection across multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default setting for "Automatically create default key upon adding account" is now changed to off; if you wish to automatically generate a default key after adding an account, please manually enable it in settings.

**Location Hints:**
- Group ID Display: In 「Settings → Key Management」, click "Add New Key," view in the group dropdown option.
- Auto-Create Default Key Toggle: In 「Settings → Basic Settings → Account Management → API Keys」.

## 3.19.0
- **New Features:**
  - Self-Hosted Site Management: Added support for `Octopus` hosted sites, allowing connection to the Octopus backend and importing account API keys as channels in "Channel Management," along with fetching the available model list.
  - Key Management: Added "Automatically create default key upon adding account" (enabled by default), and provided a one-click option "Ensure at least one key exists" to automatically complete default keys for accounts missing them.
  - AI API Test: The "Model List Probe" for interface verification now supports OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and other interface types, and will suggest available Model IDs, reducing manual guessing of models.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account recognition logic, improving stability in scenarios with multiple accounts on the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-type interfaces to reduce errors or triggering site rate limits caused by frequent refreshing.
  - Channel Management: Improved duplicate detection when creating channels, providing a confirmation prompt to avoid accidental duplicate route creation.
- **Bug Fixes:**
  - Deactivating Accounts: Disabled accounts are now automatically filtered out from dropdowns/lists in Key Management and related areas, preventing invalid operations.
  - Language: Fixed an issue where the extension language setting might affect the language value of the webpage itself.

**Location Hints:**
- Octopus Configuration: In 「Settings → Basic Settings → Self-Hosted Site Management」, select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In 「Settings → Channel Management」.
- Auto-Create Default Key Toggle: In 「Settings → Basic Settings → Account Management → API Keys」.
- One-Click Complete Default Key: In 「Settings → Key Management」, top right corner, "Ensure at least one key exists."
- AI API Test Entry: Right-click menu on the webpage, "Quickly Test AI API Functionality."

## 3.18.0
- **New Features:**
  - Balance History: Charts now support "Currency Unit" switching (`USD` / `CNY`), and currency symbols are displayed on axes/tooltips; when `CNY` is selected, conversion is performed based on the account's "Recharge Amount Ratio," facilitating trend viewing and reconciliation based on monetary value.
- **Experience Optimizations:**
  - Tag Filtering: When there are many tags/account options, the default is now "expanded display" for more intuitive browsing and selection.
  - Tabs: Added left/right scroll buttons to the settings group tags and vendor tags in the "Model List" for easier switching in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Auto-Detect" is more accurate, fixing the issue of unknown site types frequently appearing in recent versions.

**Location Hints:**
- Balance History Currency Unit: In 「Settings → Balance History」, in the filter area, "Currency Unit."
- Account Exchange Rate (Recharge Amount Ratio): In 「Settings → Account Management」, in the Add/Edit Account form, "Recharge Amount Ratio."

## 3.17.0
- **New Features:**
  - Balance History: Added "Balance History" feature (disabled by default), which records daily balance and income/expense snapshots, allowing trend viewing in charts; supports filtering by tags/accounts and time range, and provides convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added settings to control enabling, retention days, and "End-of-Day Fetch." Note: If you disable "Show Today's Income/Expense" and do not enable "End-of-Day Fetch," the "Daily Income/Expense" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar on small/narrow screens.
- **Bug Fixes:**
  - Import/Export: Fixed responsive display issues for the export area on certain screen sizes.
  - Popups: Fixed layout anomalies where the popup scrollbar position was incorrect.

**Location Hints:**
- Balance History Toggle/Retention Days/End-of-Day Fetch: In 「Settings → Basic Settings → Balance History」.
- Balance History Chart Entry: In 「Settings → Balance History」.

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added Sub2API site type, supporting balance/quota query; supports reading login status via "Auto-Detect"; and supports the "Plugin Hosted Session (Multi-Account, Recommended)" mode, allowing independent authentication renewal for each account, improving the multi-account experience on the same site.
  - Display Settings: Added "Show Today's Income/Expense" toggle (enabled by default), which can hide and stop fetching statistics like "Today's Consumption/Income," reducing log fetching requests during refreshes.
- **Notes:**
  - Sub2API temporarily does not support site check-in / today's usage / income and related features, only basic balance/quota query. Related features will be gradually added based on site capabilities.
  - "Plugin Hosted Session (Multi-Account)" saves the `refresh_token` as private credentials for the account and will be included in exports/WebDAV backups; please keep your backup files and WebDAV credentials safe.

**Location Hints:**
- Sub2API Addition/Mode Description: In 「Settings → Account Management」, add/edit an account, select Sub2API as the site type; see [FAQ](./faq.md) (search for "Sub2API") for more detailed steps.
- Today's Income/Expense Toggle: In 「Settings → Basic Settings → Display Settings」.

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved background Service Worker stability, reducing issues where asynchronous timed tasks (WebDAV auto-sync / usage sync / model sync / auto check-in, etc.) are missed due to early termination of the background process; and automatically resumes related timed tasks after browser restart.
  - Installation/Update/Startup Process: Enhanced error handling and logging during the initialization phase to prevent unexpected crashes.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" to save quick links to site consoles/documentation/management pages without needing to create a full account; supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting; the popup now supports switching between "Account / Bookmark"; bookmark data will be included in backups/restores and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "Today's Income" fetch requests, reducing unnecessary network calls (some sites already return `today_income` in the refresh interface).
  - Auto Refresh: Minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is now 30 seconds; upon update, old configurations will be automatically corrected to valid ranges, and related prompt texts and documentation have been improved.

::: warning Important: Auto-Refresh Configuration Will Be Forced Adjusted
Due to feedback indicating that **overly short auto-refresh intervals can easily trigger site rate limits and cause excessive load on the site**

v3.15.0 **has made forced adjustments to auto-refresh configurations**:
- Both automatic refresh and refresh-on-plugin-open features are turned off. If you still need them, you must manually re-enable them.
- The minimum `Refresh Interval` is 60 seconds, and the minimum `Minimum Refresh Interval Protection` is 30 seconds. If your setting before the upgrade was below these thresholds, it will be automatically raised to the minimum upon upgrade; if your previously set value is within the new valid range, there will be no impact.
:::

**Location Hints:**
- Bookmark Management: In 「Settings → Bookmark Management」; switch between "Account / Bookmark" at the top of the popup.
- Auto-Refresh: In 「Settings → Basic Settings → Auto Refresh」.

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly Test AI API Functionality" to open the test panel directly on the current webpage; supports filling in/pasting `Base URL` and `API Key`, and performs basic capability probing for OpenAI compatible / OpenAI / Anthropic / Google interfaces (OpenAI compatible also supports one-click model list fetching).
  - (Optional) Auto Detection: Can be enabled in 「Settings → AI API Test」, with URL whitelisting configuration; when a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (disabled by default, and the Key is not saved).
  - Auto Check-in: The execution result list now includes more troubleshooting hints—including suggested actions and documentation links for common exceptions like "Temporary shield bypass tab manually closed" or "Access Token invalid."
- **Bug Fixes:**
  - WebDAV: Auto-sync migrated from timers to the browser Alarms API, reducing the probability of missed synchronization caused by background sleep/power-saving policies.

**Location Hints:**
- AI API Test Panel: Right-click menu on any webpage, select "Quickly Test AI API Functionality"; Auto-detection settings are in 「Settings → AI API Test」.
- Auto Check-in Hints: View in the execution results list in 「Settings → Auto Check-in」.

## 3.13.0
- **New Features:**
  - Account Management: Added "Check-in Status Expired" prompt—when the "Checked in Today / Not Checked in Today" status is not detected for the current day, an orange warning icon will be displayed; clicking it allows one-click refresh of that account's data, preventing misleading by old status.
  - Interface: Multi-select controls upgraded to a more compact selector (saves space, supports search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and check-in logic, improving usability.
  - Cookie Authentication: Removed Cookie caching mechanism, reducing issues caused by reading old values after Cookie updates.

**Location Hints:**
- Check-in Status Expired Prompt: In 「Settings → Account Management」 account list, next to the site information's check-in icon.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code"—generates Kilo Code / Roo Code providerProfiles configuration, supporting copying the apiConfigs snippet or downloading the settings JSON for import (import adds incrementally, it will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by overly long text like site names, now truncated for display.
  - Dropdown Selectors: Improved empty state prompts and fixed overflow issues when option text is too long.

**Location Hints:**
- Export to Kilo Code: In 「Settings → Key Management」 key list, click the Kilo Code icon in the top right corner of a specific key.

## 3.11.0
- **New Features:**
  - New API Channel Management: Added "Duplicate Channel" reminder—when a duplicate/similar channel is detected, a warning dialog box will pop up, allowing you to choose to continue creation or cancel (no longer using error Toast to block creation).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by overly long text like site names, now truncated for display.

## 3.10.0
- **New Features:**
  - Account Management: Clicking a site link in Incognito mode will open it in the current Incognito window (to maintain Incognito login status).
  - Account Management: Disabled accounts also support clicking site links, useful as bookmarks.
  - Usage Analysis: When there is only a single account, the chart and list prioritize displaying the site name (instead of the username) for more intuitive information.
  - Shield Bypass Assistant: The temporary shield bypass window now supports CAP (cap.js) Pow verification, improving success rates.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Toast Layer: Fixed Toaster layering issue, preventing prompts from being obscured by the webpage.

**Location Hints:**
- Site Link: In 「Settings → Account Management」 account list, click the site name.
- Shield Bypass Assistant: Refer to [Cloudflare Shield Bypass Assistant](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added "Manual Balance (USD)" field—when the site cannot automatically fetch balance/quota, you can manually fill this in for display and statistics.
  - Account Management: Added "Exclude from Total Balance" toggle—used to remove a specific account from the "Total Balance" statistics (does not affect refresh/check-in functions).
  - Settings: Added "Automatically open Changelog after update" toggle (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether console logs are output and the minimum log level, facilitating troubleshooting.
  - Auto Check-in: Refreshes relevant data and updates the interface upon completion.

**Location Hints:**
- Account Add/Edit: Open Add/Edit Account in 「Settings → Account Management」.
- Changelog Toggle, Log Settings: Configured in 「Settings → General」.

## 3.8.0
- **New Features:**
  - Usage Analysis: Added "Usage Analysis" page, helping you chart the usage trends across multiple sites and accounts, allowing you to see at a glance "where usage/spending is high / where it's slowing down," facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparison, usage time hotspots, and latency trends/histograms.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "summarized usage data" (raw logs are not saved); supports setting retention days, automatic sync methods, and minimum sync intervals, and viewing sync results and error prompts for each account in "Sync Status."
- **How to Use:**
  - First, go to 「Settings → Account Usage」 to enable "Usage History Sync," set as needed, and click "Sync Now."
  - Then, view the charts in the "Usage Analysis" menu on the left; click "Export" if you need to retain data or reconcile accounts.

## 3.7.0
- **New Features:**
  - Sorting: Account list now supports sorting by "Income"; sorting priority now includes "Disabled accounts at the bottom," preventing inactive/expired accounts from interfering with your daily use.
  - Auto Check-in: Added "Trigger today's check-in early when opening the interface"—when opening the popup/sidebar/settings page within the time window, it will automatically attempt to run today's check-in early, without waiting for the scheduled time.
- **Bug Fixes:**
  - Auto Check-in: Each account is executed only once per day; retries are only for failed accounts, reducing unnecessary requests and repeated interruptions.
- **Location Hints:**
  - Sorting Priority: Adjusted in 「Settings → Account Management」.
  - Auto Check-in Pre-trigger/Retry: Configured in the "Auto Check-in" menu on the left.

## 3.6.0
- **New Features:**
  - Account Management: Supports one-click enable/disable accounts; disabled accounts are skipped by all features, making it easy to retain data after an account expires.
  - Tags: Added global tag management and synchronized optimization of related interfaces and interactions, facilitating classified management of accounts.
  - Popup: Displays the current version number in the title bar and provides a direct link to this Changelog.
  - Quick Export: CCSwitch export supports selecting upstream models, making the export configuration closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized display strategy for extremely small values, avoiding display discrepancies due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Check-in" switch (moved above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from dialog box title icons for a cleaner, more unified look.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog box while expanding key details caused a white screen.

## 3.5.0
- **New Features:**
  - Auto-Detection: Added "Detection is slow" prompts and relevant documentation links to help users troubleshoot and resolve issues.
  - External Check-in Batch Open: Supports opening all in new windows, making it easier to close them in bulk and reduce interference.
- **Bug Fixes:**
  - External Check-in Batch Open: The process was refactored to execute in the background service, ensuring all sites can be correctly opened in the popup scenario.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to support direct selection of upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured access keys always carry the `sk-` prefix, avoiding recognition/copying issues caused by inconsistent formats.

## 3.3.0
- **New Features:**
  - Auto Check-in: Account recognition now includes "Username" information, facilitating distinction between accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the steps required for individual operations.
  - Auto Refresh: The minimum refresh interval no longer has a maximum limit, allowing setting a larger minimum interval to control refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce false triggers in non-copy scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying the popup prompt, reducing invalid redemption notifications.
  - Storage: Write locks added to write operations, improving data consistency during concurrent writes.
  - Interface: Adjusted localization text related to "Copy Model Name."

## 3.2.0
- **New Features:**
  - The "Model List" page now includes "Interface Availability Test" (Beta), used to quickly confirm if the current key is available for a specified model (e.g., text generation, tool/function calling, structured output (return as JSON structure), web search (Grounding), etc., detection items).
  - The "Model List" page now includes "CLI Tool Compatibility Test" (Beta), simulating tool invocation flows for Claude Code / Codex CLI / Gemini CLI to assess interface compatibility in these tools.
  - The "About" page now includes "Rate and Download": automatically identifies the current store source (Chrome / Edge / Firefox) and provides one-click rating and download links for other stores.
- **Bug Fixes:**
  - When a site refresh encounters an HTTP error, the health status will display the status code and error reason, facilitating problem localization.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed, avoiding duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce failures in fetching Cookies due to insufficient permissions.

## 3.1.0
- **New Features:**
  - Added guidance for filling in administrator credentials in self-managed API settings.
  - Redemption Assistant supports batch redemption and single-code retry.

## 3.0.0
- **New Features:**
  - Supports coexistence and full functionality for multiple cookie-authenticated accounts on a single site, mainly for sites that only support cookie authentication like AnyRouter.
  - Supports setting proxy, model, and model alias lists when exporting for CLIProxyAPI.
  - Separated site check-in and custom check-in logic, which no longer affect each other.
- **Bug Fixes:**
  - Fixed incorrect redirection path for manual check-in on New-API sites.

## 2.39.0
- Automatically detects and modifies the check-in support status of the account site during account data refresh.
- Upon version update, automatically opens the Changelog page and jumps to the corresponding version anchor.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Use up/down arrow keys to select the specific redemption account directly.
  - Press Enter to confirm redemption.
- Added a prompt to the temporary shield bypass tab, explaining that the current tab originates from this extension and its specific purpose.
- Better display method for shield bypass windows: single window with multiple tabs, meaning short-term requests reuse the same window, minimizing interference to the greatest extent.
- Supports check-in status detection and auto check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Support for more lenient redemption code format detection options, correctly identifying redemption codes and popping up the Redemption Assistant when encountering custom formats.
- Fixed some known issues.

## 2.36.0
- Supports quick jumps to specific channels for management.
- Fixed an issue where the channel model sync time was being reset.

## 2.35.1
- Fixed an issue where the auto check-in execution time was being reset.
- UI optimization.

## 2.35.0
- Added optional clipboard reading permission to prompt for redemption when copying any potential redemption code.
- Added cdk.linux.do to the default whitelist for the Redemption Assistant URL.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed internal errors during account ID comparison.
  - Ensured all temporary contexts are closed correctly.

## 2.33.0
- **New Features:**
  - Added "Temporary Context Mode" for more effective bypassing of website protection.
  - API error messages now support internationalization.
  - Optimized website type detection, now identifiable by the title of the temporary window.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation messages for refresh interval settings.
  - Fixed development dependency issues.

## 2.32.0
- **New Features:**
  - Model redirection is now smarter, supporting version numbers represented by hyphens and dots.
  - Added functionality to directly redeem via the right-click menu after selecting text.
  - Auto Check-in feature is enabled by default, and the check-in time window has been extended.

## 2.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Check-in operations can now be executed quickly in the popup.
  - Redemption Assistant added URL whitelist functionality, giving you better control over which sites can use the assistant.

## 2.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capability for Cloudflare challenge pages.
  - WebDAV backup now supports encryption, and a decryption retry popup is added upon recovery, while your WebDAV configuration is retained.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed website Cookie interception issues during automatic detection.
  - Optimized centering display of blank content in Firefox.
  - Migrated the Switch component to a custom implementation for improved compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced the "Hosted Site" service, laying the foundation for integrating more sites in the future.
  - Added support for Veloera sites.
  - Updated the term "New API" in settings to "Hosted Site" for better clarity.
- **Bug Fixes:**
  - Optimized translation texts, removing redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes to help you understand specific issues.
  - The temporary window bypass feature now includes a health status indicator.
  - Optimized the description for bypassing website protection to make it clearer and easier to understand.
  - Added a notification system for when temporary window bypass fails.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed display issues for Firefox popup notifications in Chinese settings.
- **Performance Optimization:**
  - Improved the performance of the sorting feature.

## 2.26.0
- **New Features:**
  - Added model pricing cache service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Model pricing information for multiple accounts can now be displayed simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 2.25.0
- **New Features:**
  - Added a new user guide card when the account list is empty.
  - When pinning or manual sorting features are disabled, related UI elements will automatically hide.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

## 2.24.0
- **New Features:**
  - Updated application description and About page content.
  - Extension name now includes a subtitle.
  - Tag filter added visibility control based on the number of lines.
  - WebDAV connection tests now support more success status codes.
- **Bug Fixes:**
  - Removed the extraneous period at the end of JSON strings.

## 2.23.0
- **New Features:**
  - Enhanced account tagging functionality.
  - The temporary window bypass feature now supports smarter judgment based on error codes.

## 2.22.0
- **New Features:**
  - Account management now supports tagging for classified management of accounts.
  - The Redemption Assistant popup UI now supports lazy loading and fixes an issue that might cause website style conflicts.
  - Added global channel filter and JSON editing mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed redundant "Checked in Today" checks from auto check-in.
  - Simplified and fixed the logic for temporary window fetching.
  - Restored the parsing function for search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guidance during initial installation to help you understand the required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed overflow of operation buttons in the account dialog.
  - Redemption amount conversion factors now use constants to improve accuracy.
  - Restricted the Cookie Interceptor to be used only in the Firefox browser.

## 2.19.0
- **New Features:**
  - Added loading status and prompt information during the redemption process.
  - Removed the clipboard reading feature from the Redemption Assistant.
- **Bug Fixes:**
  - Added translations for missing background error messages.
  - Prevented concurrent initialization and race conditions in services, improving stability.
  - Resolved intermittent "Cannot establish connection" errors.
  - Prevented race conditions when destroying the temporary window pool.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation instructions for the Redemption Assistant feature.
  - Firefox browser now supports Cookie injection based on WebRequest.
  - Redemption functionality now supports themes and optimized prompt messages.
  - Redemption prompts now include source information and a link to settings.
- **Bug Fixes:**
  - Fixed path issues for Tailwind CSS files.

## 2.17.0
- **New Features:**
  - Added one-click redemption automatic popup notification feature.
  - Unified data formats for Import/Export and WebDAV backups using a V2 versioning scheme, improving compatibility and stability.

## 2.16.0
- **New Features:**
  - Added warning prompts when creating accounts in Firefox desktop.
  - API model sync now supports a channel filtering system.

## 2.15.0
- **New Features:**
  - The MultiSelect component now supports parsing comma-separated strings.
- **Bug Fixes:**
  - Ensured caching only occurs during the complete channel data synchronization period.
- **Performance Optimization:**
  - Optimized upstream model caching logic.

## 2.14.0
- **New Features:**
  - Automatically detects site metadata upon refresh.
  - Added retry and manual check-in options when auto check-in fails.
  - Enhanced auto check-in functionality, including retry strategies, skip reasons, and account snapshots.
  - Optimized auto check-in execution method to concurrent processing for improved efficiency.
- **Bug Fixes:**
  - Fixed the default behavior issue for the `autoCheckInEnabled` flag.

## 2.13.0
- **New Features:**
  - Added "New API Channel Management" feature.
  - Added "Warning" button style.
  - Introduced Radix UI components and Tanstack Table to improve interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed incorrect display and sorting of model counts in the channel table.

## 2.12.1
- **Bug Fixes:**
  - Fixed unnecessary reloading of channels when manually selecting tabs.
  - The "New API Model Sync" option is hidden in the sidebar when the configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Sync" now includes a model allowlist filtering feature.
  - The sidebar now supports collapsing/expanding with smooth animation effects.

## 2.11.0
- **New Features:**
  - Account management functionality has been enhanced with search functionality and navigation optimization.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed logic errors in auto check-in status.

## 2.10.0
- **New Features:**
  - Browser messaging now supports an exponential backoff retry mechanism to improve communication stability.
  - Model sync added a manual execution tab, supporting channel selection.
- **Bug Fixes:**
  - Ensured missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection, with automatic attempts to bypass using a temporary window upon encountering protection.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "Month-Day" and "Month_Day."
  - Optimized dropdown menu positioning and accessibility for multi-select components.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanism for partial account updates.
  - Account information can be saved even if data fetching fails during manual account addition.
  - Settings page added "Settings Partition" feature, supporting resetting settings by area.

## 2.7.1
- **Bug Fixes:**
  - Fixed a logic error in detecting check-in support during API sync where redirected models were not appearing in the model list.

## 2.7.0
- **New Features:**
  - The account dialog can now dynamically update site data for newly added accounts.
- **Bug Fixes:**
  - Hidden the password visibility toggle button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - User preferences such as `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now mandatory to ensure the completeness of default configurations.
- **Bug Fixes:**
  - Enhanced robustness of configuration migration checks.
  - Fixed the issue of missing "New API Preferences" in configuration checks.
  - Corrected check-in requirement sorting logic.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 2.6.0
- **New Features:**
  - Optimized the user interface for "New API Channel Import," supporting key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process to improve accuracy.
- **Bug Fixes:**
  - Model name standardization now aligns with the Veloera backend and retains hyphens.
  - Resolved browser storage quota issues and improved model matching.

## 2.5.0
- **New Features:**
  - Added support for the Neo-API site type.
- **Bug Fixes:**
  - Fixed Base64 encoding issues during CherryStudio URL generation.
  - Removed redundant account fetching and token verification from the channel dialog to improve efficiency.

## 2.4.1
- **Bug Fixes:**
  - Ensured the settings page always opens in a new tab.

## 2.4.0
- **New Features:**
  - Auto-import functionality now integrates with the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - Multi-select components now support collapsible selected areas and optimized input experience.
- **Bug Fixes:**
  - Optimized retry mechanisms and added user feedback.
  - Improved performance of multi-select components with large selections.

## 2.3.0
- **New Features:**
  - Added account pinning and unpinning functionality, supporting priority sorting for pinned accounts.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration, increasing the priority of the current site condition.

## 2.2.1
- **Bug Fixes:**
  - Removed the `isDetected` check for the automatic configuration button.
  - Ensured account detection correctly refreshes when data changes are displayed.
  - Fixed the issue where Access Token was no longer required for Cookie authentication types.

## 2.2.0
- **New Features:**
  - Auto Check-in feature added results/history interface and optimized default settings and user experience.
  - Implemented daily site auto check-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case sensitivity issues in auto check-in status detection.
  - Handled edge cases in check-in time window calculation.

## 2.1.0
- **New Features:**
  - Account list added username search and highlighting functionality.
- **Bug Fixes:**
  - Added configuration validation warnings when API settings are missing.
  - "New API" feature added configuration validation assistance and internationalized error messages.

## 2.0.0
- **New Features:**
  - The "New API Model Sync" filter bar now includes execution statistics.
  - Added sync operation buttons to every row in the results table.
  - Implemented the initial service, background logic, and settings interface for "New API Model Sync."
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
  - Account search functionality has been enhanced to support multi-field composite search across UI interfaces.
  - Added functionality to open the sidebar.
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
  - Check-in icon updated to a "Yen" icon for better intuition.
- **Bug Fixes:**
  - Custom check-in accounts now automatically reset their check-in status daily.
  - Fixed the default value issue for the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic synchronization of account data using a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` to improve cross-browser compatibility and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced a reusable `AppLayout` component to improve interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed an issue where the width of the right content container was incorrect on small screens.

## 1.32.0
- **New Features:**
  - Improved layout and responsiveness of the Account Management interface.
  - Added configurable React DevTools auto-plugin and caching.
- **Bug Fixes:**
  - Fixed the `z-index` issue for the overlay layer of the mobile sidebar.
  - Buttons, cards, and icons now support responsive size adjustments.

## 1.31.0
- **New Features:**
  - Account Management added a "Create Account" button and optimized layout.
  - Account Management added a "Usage Log" feature.
  - Sorting priority settings now support drag-and-drop auto-saving, removing the manual save button.
- **Bug Fixes:**
  - Updated the size and accessibility label for the SiteInfo icon button.

## 1.30.0
- **New Features:**
  - Replaced the dialog component with a custom `Modal` component for improved consistency.
  - Added a comprehensive UI component library to enhance interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priorities.
  - Optimized the transparency and layering of the mobile sidebar overlay for a better user experience.

## 1.29.0
- **New Features:**
  - Popups now support detection and automatic closing.
  - Popup added responsive layout for mobile devices to avoid the need for zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent auto-detection functionality.
  - Migrated `chrome.*` APIs to `browser.*` APIs, enhancing cross-browser compatibility and optimizing error handling.
  - Fully ensured functional compatibility and UI design on mobile devices.
- **Bug Fixes:**
  - Fixed the issue of `tabId` parsing after window creation.
  - Prevented the border rotation animation on buttons during refresh.

## 1.27.0
- **New Features:**
  - When successfully auto-configured to a New API, the account dialog automatically closes.
  - Implemented dynamic loading of localization resources to enhance internationalization support.
- **Bug Fixes:**
  - Added internationalization support for error messages.
  - Fixed template syntax errors in Chinese/English currency switching.

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
  - Fixed errors in the RMB currency conversion logic.

## 1.23.1
- **Bug Fixes:**
  - Amount extraction now supports exchange rate conversion.

## 1.23.0
- **New Features:**
  - Added Chinese and English localization support.
  - Added language switching functionality, supporting Suspense loading.
- **Bug Fixes:**
  - Completed internationalization of remaining hardcoded texts.
  - Fixed the issue where a success message was displayed even when no account refresh occurred.

## 1.22.0
- **New Features:**
  - Accounts now have a "Today's Total Income" field and an income display interface.
  - Supports redemption code recharge types.
- **Bug Fixes:**
  - Fixed rendering logic for the custom URL check-in interface.
  - Corrected check-in field names and return structures.

## 1.21.0
- **New Features:**
  - Added favicon and extension icons for the popup, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and popup operations.
  - Migrated the underlying framework from Plasmo to WXT, resulting in better performance and development experience.

## 1.20.0
- **New Features:**
  - Balance and health status indicators now support refreshing.
  - Operation button UI has been unified and optimized, supporting intelligent key handling.

## 1.19.0
- **New Features:**
  - All components now support dark mode.
  - Implemented a theme system supporting dark, light, and system-following modes.
- **Bug Fixes:**
  - The API configuration interface now mandates the `authType` field.

## 1.18.0
- **New Features:**
  - Accounts now have a custom check-in button (with a Yen icon).
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting functionality now includes custom check-in URLs as sorting criteria.
- **Bug Fixes:**
  - Fixed an issue where the custom check-in URL was not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting an authentication type.
  - API authentication options now include a "No Authentication" type.
  - The Tooltip component migrated to the `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" feature now supports automatic account configuration.
  - Site accounts now support check-in functionality.
  - Implemented a customizable sorting priority system.

## 1.15.0
- **Bug Fixes:**
  - Fixed an issue where unnecessary updates and notifications were triggered even when the value was unchanged.

## 1.14.0
- **New Features:**
  - Added tab activation and update listeners for automatic detection.

## 1.13.0
- **New Features:**
  - Added "New API" integration, supporting token import.
  - Added "New API" integration settings in Preferences.
  - Added password visibility toggle functionality.

## 1.12.1
- **Bug Fixes:**
  - Moved default sorting values to `UserPreferencesContext`.
  - Fixed potential rendering issues when loading preferences.

## 1.12.0
- **New Features:**
  - Account sorting now includes health status priority.
  - Health status now contains more detailed reason information.

## 1.11.0
- **New Features:**
  - Refresh functionality has been enhanced to support detailed status tracking.
  - Added a minimum refresh interval to prevent overly frequent requests.

## 1.10.0
- **New Features:**
  - Key copy functionality now includes Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub token management and data fetching capabilities.
  - Added user group data transformation and API integration.
  - Implemented model fetching functionality for OneHub sites.

## 1.8.0
- **New Features:**
  - Account management now supports additional site types.
  - Added site type detection and optimized the auto-detection process.
  - Implemented model pricing functionality for OneHub sites.

## 1.7.1
- **Bug Fixes:**
  - Fixed a logic error in detecting check-in support using site status detection.

## 1.7.0
- **New Features:**
  - Added check-in support detection and switching functionality.
  - Accounts now support check-in status.

## 1.6.0
- **New Features:**
  - Account management now supports a remarks field.

## 1.5.0
- **Performance Optimization:**
  - The rendering method for the model list has been optimized, improving loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed an issue where the detected account status was automatically reset when no existing account was found.

## 1.4.0
- **New Features:**
  - Control panel now includes a function to copy model names.
  - Added support for Baidu and Yi model providers.

## 1.3.1
- **Bug Fixes:**
  - Updated the configuration for the release PR workflow.

## 1.3.0
- **New Features:**
  - Added WebDAV backup and synchronization functionality.

## 1.2.0
- **New Features:**
  - Added an Account Management page supporting full CRUD operations.
  - Custom dialogs in the popup have been replaced with direct function calls to simplify operations.

## 1.1.1
- **Bug Fixes:**
  - Fixed logic for handling missing system names and checks.

## 1.1.0
- **New Features:**
  - Added manual addition support for accounts and optimized the UI flow.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting for the current site.
  - Added warning prompts for Firefox browser detection and when adding accounts.
  - Introduced the sidebar feature, replacing automatic site configuration in the popup.

## 0.0.3
- **New Features:**
  - Optimized account recognition process, now supporting automatic creation of access keys.
  - Account list now includes sortable headers, a copy key dialog, and hover action buttons.
  - Account management added a remarks field.
  - Website names are clickable for navigation.
  - Model list supports grouped selection.
  - The popup page adds digital rolling animations and a site status indicator.
  - Optimized the Add/Edit Account dialog, including recharge ratio settings and automatic extraction of site names.
  - Fully implemented the settings page system, supporting persistence of user preferences and automatic refresh.
  - Enhanced the frontend interface and background service for automatic refresh functionality.
  - Automatically adds the `sk-` prefix when copying keys.
  - Introduced industry-standard Tab scrolling interaction experience.
  - Optimized dynamic updating and deletion of account health status.
  - Supports more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - The popup interface was refactored to an API Manager style, adding display for today's total consumed amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed issues with incompatible model data formats, `localStorage` access, and API request credentials.
  - Corrected API authentication methods.
  - Optimized URL input handling and auto-refresh configuration.
  - Added pagination logic to handle log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**