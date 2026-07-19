# Changelog

This page records major updates for general users (feature changes / experience optimizations / bug fixes). For complete historical versions and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip For New Users
- **How to confirm your current version**: Open the extension popup; the version number will be displayed in the title bar. You can also check it on the settings page.
- **How to stop this page from opening automatically**: You can control whether to "Automatically open the changelog after updates" in "Settings → General → Changelog".
- **Troubleshooting**: You can enable console logs in "Settings → General → Logs" and report reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.52.0
- **New Features:**
  - Site Announcements: When newer New API-compatible sites publish multiple system announcements or additional notes at once, the extension can now retrieve them together, making site notices easier to review. See [Site Announcements](./site-announcements.md).
  - Model List: Added model-capability filters for images, audio, video, PDF, reasoning, tool calling, structured output, and more, with matching capability badges shown on model rows, making it easier to find models suited to a specific task. See [Model List](./model-list.md).
  - API Credential Library: Expiration dates are now easier to enter. Choose from a calendar or common durations, or type `tomorrow`, `in 7 days`, or a specific date instead of adjusting year, month, and day one field at a time in the browser date control. The same options are available when saving credentials from Web AI API verification results. See [API Credential Library](./api-credential-profiles.md) and [Web AI API Sniffing and Verification](./web-ai-api-check.md).
  - Kilo Code Export: Added support for `Kilo Code 7.x`, whose configuration format is incompatible with earlier versions. Selected API credentials or site keys can be downloaded as a settings file ready to import, or the corresponding configuration can be copied when existing settings need to be preserved. The existing Roo Code / Kilo Code 5.x export options remain available. See [Quick Export Site Configuration](./quick-export.md).
- **Experience Optimizations:**
  - Key Creation: New keys now receive a recommended name automatically. If the name has not been edited manually, changing the group also updates it, reducing cleanup after creation. See [Key Management](./key-management.md).
  - Add Account: When auto-detect fails, the extension now provides a troubleshooting guide and clear next steps. If the site is not supported yet, you can request support or save its `Base URL + API Key` to the API Credential Library and continue using it there. See [Account Management](./account-management.md), [Auto-detection Troubleshooting Guide](./auto-detect.md), and [API Credential Library](./api-credential-profiles.md).
- **Bug Fixes:**
  - New API Bulk Import: Key-check results are now more reliable at identifying matching channels and keys, reducing the large number of duplicate channels that could be created by repeated imports. If some preview items still cannot be confirmed, use `Verify and refresh preview` for an additional check. See [Key Management](./key-management.md) and [Self-Hosted Site Management](./self-hosted-site-management.md).
  - WebDAV: Existing backups can now be overwritten correctly when the backup folder uses Chinese or other non-English characters, reducing sync failures caused by folder names. See [WebDAV Backup and Auto Sync](./webdav-sync.md).
  - Browser Compatibility: A key fix targets the known issue in 360 Extreme Browser when "Open a new tab after closing the last tab" is enabled: blank windows could remain after account auto-detection or check-in finished. Related task pages now close correctly when their work is complete.
  - Add and Edit Forms: Using a dropdown, date picker, or combobox in account, API credential, key, and similar forms no longer closes the entire dialog by mistake. Pressing `Esc` now closes the currently expanded selection first.
  - Version Updates: When a store-installed extension detects a newer GitHub release that has not yet reached the browser store, it now clearly shows `GitHub has a newer release, but the store update is not ready yet` instead of incorrectly suggesting an immediate upgrade. See [Installation Channels and Updates](./extension-update-install.md).

**Location Hints:**
- Credential expiration date: Enter it when adding or editing a credential under "Settings → API Credential Library"; it is also available when saving a credential from the Web AI API verification dialog.
- Kilo Code 7.x export: Open a Kilo Code export action under "Settings → API Credential Library" or "Settings → Key Management", then select `Kilo Code 7.x`.
- Model capability filters and badges: View them in the filter area and model rows under "Settings → Model List".
- Site Announcements: View them under "Settings → Site Announcements"; automatic retrieval and notifications can still be managed in settings.
- Alternatives after account detection fails: Shown after adding an account and using auto-detect under "Settings → Account Management".

## 3.51.0
- **New Features:**
  - Data Import/Export: Before importing a backup, you can choose add, replace, or skip separately for `Accounts and bookmarks`, `API Credential Library`, `Channel configurations`, and `User settings`. When migrating data from another device, accounts and credentials are appended by default while current device settings are kept, instead of replacing everything at once. See [Data Import/Export](./data-management.md) and [WebDAV Backup and Auto Sync](./webdav-sync.md).
  - `SharedChat`: Supports account detection, Codex balance/usage refresh, and copying, verifying, rotating, saving, or exporting Codex service credentials in Key Management. See [Account Management](./account-management.md), [Key Management](./key-management.md), and [API Credential Library](./api-credential-profiles.md).
  - New `VoAPI`: Supports account detection, balance/usage refresh, built-in check-in, and key management. See [Account Management](./account-management.md), [Automatic Check-in](./auto-checkin.md), and [Key Management](./key-management.md).
  - `Sub2API`: Account refresh now includes today's request count, token usage, and cost statistics, so daily usage can be checked without returning to the site backend. See [Account Management](./account-management.md) and [Usage Analytics](./usage-analytics.md).
  - External Check-in: Configured external check-in links can now be opened in bulk from check-in run results, or from a single account result row. By default, accounts already marked as externally checked in today are skipped. See [Automatic Check-in](./auto-checkin.md).
  - Languages: Added `Spanish (Latin America)`, which is selected automatically when Spanish is the browser's preferred language.
- **Experience Optimizations:**
  - Self-hosted Site Management: Channel refresh can now be stopped mid-run, so large channel lists, slow backends, or a wrong site selection no longer require waiting for the current refresh to finish. See [Self-Hosted Site Management](./self-hosted-site-management.md).
  - Self-hosted Site Management: The channel list now distinguishes `No channels` from `No matching results`, making it clearer whether the site has no channels or the current search/status filters are too narrow. See [Self-Hosted Site Management](./self-hosted-site-management.md).
  - Key Management and Model List: For read-only service credentials, or when the current site does not support creating keys, updating keys, or reading models, the page now explains the available capabilities and provides a feedback entry point. See [Key Management](./key-management.md) and [Model List](./model-list.md).
- **Bug Fixes:**
  - Self-hosted Site Management: Adapted to the newer New API channel status interface, so enabling or disabling channels stays in sync with the backend more reliably.
  - Self-hosted Site Management: Adapted to the newer New API channel edit interface. When no new channel key is entered, the existing key is kept to avoid accidental clearing or save failures.
  - API Requests: When a site clearly returns business errors such as unauthorized access or insufficient quota, the extension now shows the error directly instead of opening an unnecessary temporary verification window.
  - Temporary windows: Temporary windows used for check-in or verification now enable download blocking before opening the target page, reducing the risk of accidental downloads.
  - Automatic Check-in: Daily bulk check-in now processes accounts in batches, reducing failures or unstable results caused by too much concurrency when many accounts are eligible.
  - Automatic Check-in: New API-compatible sites that clearly do not have the current check-in endpoint are now treated as `unsupported` instead of repeatedly trying temporary windows or showing a generic failure.

**Location Hints:**
- Import content selection: Under "Settings → Import/Export", choose a backup file or paste JSON, then select add, replace, or skip for each import section.
- External check-in: Use the bulk action on "Settings → Automatic Check-in", or click `External check-in` in a supported account result row. Ctrl/Cmd opens all, and Shift opens in a new window.
- `SharedChat` / new `VoAPI`: Add the account under "Settings → Account Management" and run auto detection; key-related capabilities appear under "Settings → Key Management".
- New API channel editing and channel refresh: Applies in the channel list and channel edit flow under "Settings → Self-hosted Site Management".

## 3.50.0
- **New Features:**
  - Account Management: You can now scan browser bookmarks and batch-import account sites. Choose the bookmark folder to scan, then review importable, duplicate, and failed sites in one place instead of adding each account manually. See [Account Management](./account-management.md) and [Bookmark Management](./bookmark-management.md).
  - Account List: Each account row now shows its `Site type`, making it easier to confirm which compatible site family an account belongs to and to use site-type filtering in mixed setups. See [Account Management](./account-management.md).
- **Experience Optimizations:**
  - Account Management: Sites that support built-in check-in status now check and show today's status during account refresh automatically, without a separate status-detection switch in the form. Joining daily automatic check-in is still controlled by its own switch. See [Account Management](./account-management.md) and [Automatic Check-in](./auto-checkin.md).
- **Bug Fixes:**
  - `AIHubMix`: Add and edit account flows no longer show built-in check-in status or daily automatic check-in controls when they do not apply, reducing confusion about whether the extension can check in for `AIHubMix` directly. See [Account Management](./account-management.md) and [Automatic Check-in](./auto-checkin.md).
  - API Credential Library: Exporting standalone credentials to `CC Switch`, `CLIProxyAPI`, `Kilo Code`, or `Claude Code Router` no longer mistakenly depends on account context. Credentials with only `Base URL + API Key` can also be exported or imported correctly. See [API Credential Library](./api-credential-profiles.md) and [Quick Export Site Configuration](./quick-export.md).
  - Settings: Fixed cases where quick repeated preference saves could be overwritten by stale state, fail unexpectedly, or show unclear failure copy. If settings changed elsewhere, the page now asks you to confirm before saving again.
  - Self-hosted Site Management: Channel changes now stay in sync more reliably after saving on real sites. `AxonHub` re-reads the channel list after creating, editing, or deleting a channel so later refresh and locate actions do not keep using stale cache; `Octopus` updates created and edited channels in the extension's unified format, reducing cases where the list, status, or follow-up actions still look like old data after a successful save. See [Self-Hosted Site Management](./self-hosted-site-management.md).

**Location Hints:**
- Bookmark batch import: Click `Batch import from bookmarks` under "Settings → Account Management", or open it from the add-account dialog.
- Account site type: Check account rows and the site-type filter under "Settings → Account Management".
- API credential export: Select a credential under "Settings → API Credential Library" and use the target export action.
- Permission onboarding: Bookmark import requests bookmark permission in the import flow; update-time optional permission prompts appear under "Settings → Overview".

## 3.49.1
- **Bug Fixes:**
  - Account auto detection: More `Sub2API` relay sites that changed their page branding or appearance can now be recognized as `Sub2API`, reducing cases where adding an account ends up as an unknown site or another compatible type. See [Account Management](./account-management.md) and [Auto Detect Troubleshooting Guide](./auto-detect.md).
  - Search and selection controls: Searchable dropdowns and multi-selects no longer crash when option names contain quotes, backslashes, plus signs, or similar special characters. They still search by the displayed label and select the correct item.

**Location Hints:**
- `Sub2API` auto detection: Applies when adding an account under "Settings → Account Management" and clicking `Auto Detect`.
- Search and selection control fix: Applies automatically in searchable dropdowns for models, groups, sites, and similar options.

## 3.49.0
- **New Features:**
  - Web AI API Sniffing and Verification: The test dialog now remembers recently used `Base URL` values, so you can choose from suggestions next time instead of pasting them repeatedly. See [Web AI API Sniffing and Verification](./web-ai-api-check.md).
  - Web AI API Sniffing and Verification: When you copy a Key from a web page or chat, common extra spaces, separators, hidden characters, and similar noise are handled automatically, reducing manual cleanup. See [Web AI API Sniffing and Verification](./web-ai-api-check.md).
  - Web AI API Sniffing and Verification: Added `API Key Cleanup Rules`, so you can add your own cleanup rules for fixed extra text and get a warning when a rule is invalid. See [Web AI API Sniffing and Verification](./web-ai-api-check.md).
  - Web AI API Sniffing and Verification: Before saving a temporary test Key to the `API Credential Library`, you can now add tags, notes, and an expiration date directly, so there is less cleanup after saving. See [Web AI API Sniffing and Verification](./web-ai-api-check.md) and [API Credential Library](./api-credential-profiles.md).
  - Web AI API Sniffing and Verification: Test results completed before saving are carried into the new credential, so you do not need to re-run the same test immediately after saving. See [Web AI API Sniffing and Verification](./web-ai-api-check.md) and [API Credential Library](./api-credential-profiles.md).
  - API Credential Library: Credentials can now record an `Expiration Date`, making it easier to see which Keys are long-term, close to expiring, or already expired. See [API Credential Library](./api-credential-profiles.md).
  - Key Management: Each key card can now check API availability and CLI compatibility directly, without copying the Key to another page first. See [Key Management](./key-management.md).
  - Settings: `Click extension icon` can now open the `Options page` by default, making the browser toolbar a direct entry point for users who often work in the full settings view.
- **Experience Optimizations:**
  - Automatic Check-in: For some New API-compatible sites that need a web page to complete check-in, the extension will keep trying when it can. If it cannot finish, it now explains the reason more clearly. See [Automatic Check-in](./auto-checkin.md).
  - Verification flows: Long-running model-list batch verification, API checks, and CLI compatibility checks can now be stopped. Completed results are kept, and unfinished items are marked as stopped.
  - Key Management: `Key coverage check` can be cancelled midway, and you can review the previous check result before deciding whether to run it again. See [Key Management](./key-management.md).
  - Key Management: When repairing missing keys, automatically created key names can be tidied to match the current group, with the result showing whether the rename succeeded. See [Key Management](./key-management.md).
  - Key Management: Sub2API-related key coverage checks now make skipped reasons and available repair entry points easier to understand. See [Key Management](./key-management.md).
  - Account Management: When adding or editing an account, authentication-method help and check-in detection descriptions are clearer, making it easier to distinguish "check status during refresh" from "actually perform check-in." See [Account Management](./account-management.md).
- **Bug Fixes:**
  - Web AI API Sniffing and Verification: Editing copied content without finding new credentials no longer clears the filled `Base URL` / `API Key`; if only one value is found, the other one is kept. See [Web AI API Sniffing and Verification](./web-ai-api-check.md).
  - Account and model key creation: Default keys now use a more suitable name based on the selected group, and Keys created from Model List no longer carry unwanted model limits. See [Account Management](./account-management.md), [Key Management](./key-management.md), and [Model List](./model-list.md).
  - Settings Search: Pressing `Home` / `End` in the search box now moves the text cursor normally, making search terms easier to edit.

**Location Hints:**
- Web AI API Sniffing and Verification: Select text on a web page and use the context menu, or trigger automatic detection on a whitelisted page. Related switches and `API Key Cleanup Rules` are under `AI API Test` in `Settings` on the left navigation of the extension settings page.
- API Credential Library expiration date: Fill it when adding or editing a credential under `API Credential Library` on the left navigation of the extension settings page.
- Key verification and key coverage check: Use them from key cards and the top check entry under `Key Management` on the left navigation of the extension settings page.
- Default target for clicking the extension icon: Choose it under `Settings → General → Click extension icon` on the left navigation of the extension settings page.
- Temporary-page assisted automatic check-in: Applies automatically when running manual or automatic check-in for supported accounts. The global switch is under `Automatic Check-in` on the left navigation of the extension settings page.

## 3.48.0
- **New Features:**
  - Key Management: You can now batch-save selected keys into the `API Credential Library`. This turns keys already organized on a site into reusable `Base URL + API Key` credentials, so you do not need to re-enter them one by one when copying, verifying, viewing models, or exporting them to other tools. See [Key Management](./key-management.md) and [API Credential Library](./api-credential-profiles.md).
  - Model List: Added filtering by latest verification result and sorting by verification duration, making it easier to revisit failed models, find models that have not been verified yet, or prioritize slower models. Batch verification applies to the currently filtered list. See [Model List](./model-list.md).
  - Managed Site Model Sync: Added `Max processing time per channel`. If a single channel takes too long to return results, it is marked as failed and sync continues with the remaining channels, preventing a full sync from being blocked by a few slow channels. See [Managed Site Model Sync](./managed-site-model-sync.md).
  - Version Update Check: Chrome / Edge store-version checks now compare both the latest stable GitHub release and browser store update status. If the browser has a store update ready, you can click `Reload to update` to apply the new version. See [Installation Channels and Updates](./extension-update-install.md).
- **Experience Optimizations:**
  - Web AI API Sniffing and Verification: After the page identifies `Base URL + API Key`, the verification dialog now shows the extracted `API Key` by default, making it easier to confirm the detected value before saving it to the `API Credential Library`. See [Web AI API Sniffing and Verification](./web-ai-api-check.md).
  - Web AI API Sniffing and Verification: You can stop an individual check or the whole group during testing, so services that do not respond for a long time no longer force you to wait for the entire verification run before handling other credentials. See [Web AI API Sniffing and Verification](./web-ai-api-check.md).
  - Managed Site Model Sync: Running progress refreshes more promptly. When automatic sync is disabled, the page now explains that only manual sync will run and provides a shortcut to automatic sync settings, reducing confusion about whether sync is running. See [Managed Site Model Sync](./managed-site-model-sync.md).
  - API Credential Library: When there are no credentials yet, the empty state now suggests saving existing site keys from Key Management and provides a shortcut, making the first credential setup easier to start. See [API Credential Library](./api-credential-profiles.md).
  - Settings navigation: The former "Basic Settings" entry is now named "Settings" and moved into the "System" group. Basic preferences, AI API Test, notifications, and related options remain on the same settings page; only the entry name and location now better match their role.
  - Docs and community: Added a QQ group entry and expanded installation-channel guidance, sponsor usage guides, and recommended-site information, making it easier to find update instructions, community support, or API service references.
- **Bug Fixes:**
  - WebDAV: Directory-style WebDAV URLs are now tested as directories, reducing cases where a usable directory was incorrectly reported as a failed connection. Direct `.json` backup file URLs are still tested as file URLs. See [WebDAV Backup and Automatic Synchronization](./webdav-sync.md).
  - Key Management: When multiple `Cookie authentication` accounts exist under the same site, the key list now preserves each account's own session information, reducing cases where key loading uses another account's login session. See [Key Management](./key-management.md).
  - Account Management: After adding or editing an account, refreshed balance, usage, and sync time now update in the account list and already-open account pages, reducing cases where saved accounts still show old data until a manual refresh. See [Account Management](./account-management.md).
  - Managed Site Model Sync: Channel loading or sync request failures no longer show strange English keys or code-like messages. Errors now fall back to readable localized text. See [Managed Site Model Sync](./managed-site-model-sync.md).

**Location Hints:**
- Batch-save keys: Select multiple keys under "Settings → Key Management".
- Model verification filters, verification-duration sorting, and batch verification: Use them under "Settings → Model List".
- Max processing time per channel, automatic sync guidance, and sync progress: Check them under "Settings → Self-Hosted Site Management → Model Sync Settings" and on the model sync page.
- Store-version update checks: Click `Check now` in the version and update area under "Settings → About".
- Web AI API Sniffing and Verification: Use it after a web page identifies `Base URL + API Key` and opens the verification dialog. Related switches are in the `AI API Test` tab under the left-side `Settings` entry.
- Post-save account refresh: Applies automatically after adding or editing an account under "Settings → Account Management".
- WebDAV connection testing: Use it under `WebDAV Settings` in "Settings → Import / Export".

## 3.47.0
- **New Features:**
  - `Sub2API` Model List: You can now view available models and estimated prices for `Sub2API` accounts in Model List. If an account has multiple API keys, you can also see which models each key can use. See [Model List](./model-list.md).
  - Model List: Added a `Compare Prices` shortcut that switches to a low-price comparison view, helping you compare model prices across accounts and keys faster. See [Model List](./model-list.md).
  - Model List / Key Management: You can now jump from a model to the matching account's keys, and from Key Management back to that account's model list. See [Model List](./model-list.md) and [Key Management](./key-management.md).
- **Experience Optimizations:**
  - Account Management: When adding or editing an account, the account is saved first and balance / usage refresh continues afterward. If the site responds slowly, you no longer need to keep waiting in the save dialog. See [Account Management](./account-management.md).
  - Model List: Model groups and usable keys are shown more clearly. Keys with the same name also show their group, reducing the chance of selecting the wrong key.
  - Crash Recovery: If a page error may be related to browser auto-translation, the extension now guides you to language feedback first; other errors still use the regular issue feedback path, making it easier to choose the right entry.
- **Bug Fixes:**
  - Account Management: Sites that use mixed letter-and-number user IDs can now be saved and edited normally, instead of failing because the user ID is not purely numeric. See [Account Management](./account-management.md).
  - Model List: Single-model verification now prefers a key that actually fits the model. If no usable key exists, the extension prompts you to add a model key first. See [Model List](./model-list.md).
  - Model List: Model verification failures now explain the reason more clearly, reducing cases where you only see a failure without knowing whether to check the account, model, or key. See [Model List](./model-list.md).

**Location Hints:**
- `Sub2API` model viewing, price comparison, and model verification: Use them under "Settings → Model List".
- Account model / key jumps: Use them after selecting a single account in "Settings → Model List" or "Settings → Key Management".
- Text user IDs and background refresh: They apply when adding or editing accounts under "Settings → Account Management".
- Crash recovery guidance: Shown automatically after an extension page crashes.

## 3.46.0
- **New Features:**
  - Key Management: Added a group key audit that checks whether each account group has a usable key, creates missing keys for supported sites, and lists keys whose groups are no longer available so you can review and delete them in one place. See [Key Management](./key-management.md).
  - Key Management: You can now batch import selected keys into `CLIProxyAPI`, with per-key results shown during the import. See [CLIProxyAPI Integration](./cliproxyapi-integration.md).
  - Feedback and languages: The feedback menu, About page, and first-time language selection flow now include a "Request a language" entry, making it easier to ask for missing languages or translation improvements.
- **Experience Optimizations:**
  - Auto Detect: If the extension popup closes during account auto detection, the extension now suggests continuing in the popup or switching to the side panel to finish adding the account, reducing confusion after an interrupted detection flow. See [Auto Detect Troubleshooting Guide](./auto-detect.md).
  - Multilingual display: Extension pages now keep the page language marker aligned with the current UI language, reducing browser auto-translation misjudgments. If a page still cannot display correctly, it provides a reload entry and suggests switching the extension language or disabling browser auto-translation before retrying.
  - Key Management: When managed-site administrator information is not configured, related checks now explain that the setup is optional and send you to a more accurate settings destination.
- **Bug Fixes:**
  - Model List: Restored per-row actions in the "All accounts" view, including key creation, single API verification, CLI verification, copying the site URL, and opening the site. See [Model List](./model-list.md).
  - Model List: Batch verification results now show the source account and site, making it easier to identify which site or account is unavailable. See [Model List](./model-list.md).
  - `Sub2API`: After creating a key, the list now refreshes automatically; after a successful deletion, the key is removed from the local list immediately, reducing manual refreshes and repeated checks.
  - WebDAV: Temporary files used during backup uploads no longer start with a dot, reducing upload failures caused by server-side security policies blocking temporary-file writes. See [WebDAV Backup and Auto Sync](./webdav-sync.md).
  - WebDAV: Connection tests, uploads, and downloads now save the current form changes first; directory URLs are also tested as directories, reducing cases where a valid configuration appears to fail testing. See [WebDAV Backup and Auto Sync](./webdav-sync.md).

**Location Hints:**
- Group key audit and batch import: Use them under "Settings → Key Management".
- `CLIProxyAPI` connection settings: Enter the management API URL and management key under "Settings → CLIProxyAPI".
- Language requests: Submit them from the `Feedback` menu in the extension popup or settings page title bar, from "Settings → About", or during first-time language selection.
- Auto-detect interruption hint: Check it after starting auto detection while adding an account from the extension popup.
- WebDAV settings: Test, upload, or download under `WebDAV Settings` in "Settings → Import / Export".

## 3.45.0
- **New Features:**
  - Product reminders: The extension popup and settings page now include an important-reminders entry for risk notices, service changes, and usage suggestions.
  - Account Management: The account list now includes `Clear sort`, so field sorting can be reset to the default display order in one action. See [Account Management](./account-management.md) and [Sorting Priority Settings](./sorting-priority.md).
- **Experience Optimizations:**
  - Changelog: After an upgrade, the changelog now opens automatically only when the current version has a matching release note, avoiding incorrect changelog opens for rollback, pre-release, or unpublished-note versions.
  - Account Management: When a site is already open in the browser, its matching account is shown higher in the list, making the account related to the current page easier to find. See [Account Management](./account-management.md).
- **Bug Fixes:**
  - Popups and dialogs: Fixed operation toasts that could appear twice while a dialog was open. Success / failure prompts for actions such as adding accounts and saving settings are no longer duplicated.

**Location Hints:**
- Product reminders: Check the extension popup title bar, settings page title bar, or "Settings → Overview".
- Account sorting: Use sorting and `Clear sort` in the "Settings → Account Management" list header; detailed sorting rules can be adjusted under "Settings → General → Sorting Priority".
- Changelog auto-open: Control it under "Settings → General → Changelog".

## 3.44.0
- **New Features:**
  - Settings Overview: The settings page now includes an `Overview` workbench that brings together accounts, API credentials, today's usage, items that need attention, automated tasks, and configuration status, with direct jumps to the pages that need action.
- **Experience Optimizations:**
  - Permission Onboarding: Optional permission explanations and grant entry points are now handled by `Overview`; when the extension needs new optional permissions, it explains the purpose of Cookies, web request observation, notifications, and related permissions in one place. See [Permission Management (Optional Permissions)](./permissions.md).
  - API Credential Library: The add-credential button is now consistently labeled `Save API Key`, better matching the `Base URL + API Key`-only use case. See [API Credential Library](./api-credential-profiles.md).
  - Extension Popup: Statistics on the `API Key` page now wrap on narrow screens, so balance, today's usage, and related metrics no longer crowd each other.
- **Bug Fixes:**
  - WebDAV: Compatible with China Science and Technology Cloud (CSTCloud) overwrite-move failures. The extension now retries replacing the official backup file, reducing upload failures during manual sync or auto sync. See [WebDAV Backup and Auto Sync](./webdav-sync.md).
  - Older Browser Compatibility: Fixed runtime messages that might not receive responses, improving compatibility for cross-entry tasks such as Auto Check-in, Model Sync, WebDAV Auto Sync, notifications, and in-page detection.

**Location Hints:**
- Settings Overview: Open "Settings" to enter `Overview` by default.
- Permission Onboarding: After upgrading, if new optional permissions are needed, check the prompt under "Settings → Overview"; you can also view the full permission status under "Settings → Permission Management".
- API Credential Library: Click `Save API Key` under "Settings → API Credential Library".
- WebDAV Sync: Use `WebDAV Settings` and auto-sync actions under "Settings → Import / Export".

## 3.43.0
- **Experience Optimizations:**
  - AIHubMix: After adding an account, the extension now checks whether tokens already exist first. If tokens are present, it no longer shows the default key creation prompt; if none exist, it still prompts you to create one and displays the one-time full key. See [Account Management](./account-management.md).
  - Auto Detect: When detecting certain AIHubMix page URLs from the extension popup, temporary-window minimization no longer causes the popup to close, making detection more stable. See [Auto Detect Troubleshooting Guide](./auto-detect.md).
- **Bug Fixes:**
  - AIHubMix: Compatible with cases where the site no longer returns the original numeric ID. The account is saved with an available text identifier instead, so adding, syncing, import / export, duplicate detection, pinning, and related flows no longer fail because the numeric ID is missing. See [Account Management](./account-management.md).
  - Account Management: Fixed cookie import potentially using the wrong browser cookie environment when adding a `Cookie Authentication` account from an incognito window or a Firefox container tab.
  - Account Management: Fixed `Use current page`-related prefill sometimes keeping a stale title or URL after fast tab switches, unavailable tabs, or non-webpage addresses.
  - AIHubMix: Fixed inconsistent duplicate-account warnings and current-site detection across `aihubmix.com`, `www.aihubmix.com`, and `console.aihubmix.com`.
  - In-page extension UI: Fixed in-page extension interfaces still showing Chinese after switching the extension language.
  - Cookie Authentication: When multiple accounts on the same site use `Cookie Authentication`, refresh, detection, and related operations now use the Cookie for the current account more accurately.
  - Model List: After creating a model-compatible key, the dialog now waits for the new key to appear in the site response, reducing cases where it still says no compatible key exists or cannot continue copying / managing the key. See [Model List](./model-list.md).

**Location Hints:**
- AIHubMix account saving, cookie import, and current-page prefill: Add an account under "Settings → Account Management".
- AIHubMix default key prompt: Add an `AIHubMix` account with "Automatically create a default token after adding an account" enabled.
- Auto-detect temporary window: Trigger auto detect from the extension popup after entering a site.
- Model-compatible keys: Create or copy a key for a model under "Settings → Model List".

## 3.42.0
- **New Features:**
  - Web AI API Check: Improved automatic detection of `Base URL` and `API Key` from web page content. When multiple candidates are found, you can choose the pair to verify, and the confirmation prompt can open settings or submit issue feedback directly. See [Web AI API Sniffing and Verification](./web-ai-api-check.md).
  - API Credential Profiles: One-time API keys can now be saved directly to `API Credential Profiles` from the dialog, reducing the need to copy them and create a profile manually. See [API Credential Profiles](./api-credential-profiles.md).
- **Experience Optimizations:**
  - Account Management: When adding an account, the default authentication method is selected more accurately from the site URL. AnyRouter accounts now default to `Cookie Authentication`. See [Account Management](./account-management.md).
  - Account Management: When `Cookie Authentication` is selected, the form now explains the required permission and provides a grant entry point, reducing trips back and forth to the settings page. See [Account Management](./account-management.md).
  - Account Management: The duplicate-account warning now includes **`Don't remind me again and continue`**, so you can continue the current add flow and disable future duplicate warnings in one step.
  - Auto Detect: When detection takes too long, the prompt can reload the extension and let you retry directly. See [Auto Detect Troubleshooting Guide](./auto-detect.md).
  - Settings Search: Added searchable entries for notification channels, Import / Export, WebDAV auto sync, and related settings. Results now distinguish between page sections and specific controls, making settings easier to locate.
  - Redemption Assistant: Selected text is now detected after mouse or touch release, making redemption-code capture on web pages more stable.
  - Web AI API Check: Selected text is now detected after mouse or touch release, making API configuration capture on web pages more stable.
- **Bug Fixes:**
  - WebDAV: Backup uploads now write to a temporary file first and verify it before replacing the official backup. If a remote backup is corrupted, you will be prompted to rebuild it from the current device, reducing data risk from interrupted syncs or damaged backups. See [WebDAV Backup and Auto Sync](./webdav-sync.md).
  - New API: Fixed login, check-in, redemption, usage, and related page shortcuts opening the wrong route on sites that use customized theme paths.
  - Key Management: Deleting a key now uses an explicit destructive confirmation dialog, reducing accidental deletion risk.

**Location Hints:**
- Web AI API Check: Select or copy `Base URL + API Key` on a web page and check the confirmation prompt. Related switches are under "Settings → Basic Settings → Web AI API Check".
- One-time API key saving: Use `Save to API Credential Profiles` from dialogs for adding accounts, creating keys, viewing model keys, or copying one-time keys.
- Cookie multi-account permission: Add an account under "Settings → Account Management" and select `Cookie Authentication`.
- Settings Search: Use the search box at the top of the settings page, or press `Ctrl+K` / `Cmd+K`.
- WebDAV fixes and rebuild: Use `WebDAV Settings` and sync actions under "Settings → Import / Export".

## 3.41.1
- **Bug Fixes:**
  - Account Management: Fixed the first add-account auto-detect flow not carrying detected check-in detection and auto check-in settings into the form. You can now confirm whether the account supports check-in, and whether it will join auto check-in, before saving. See [Account Management](./account-management.md).
  - Auto Check-in: Fixed `Quick Check-in` from an account menu being skipped when global auto check-in is disabled. Manual per-account check-ins now run independently from the background schedule switch. See [Auto Check-in](./auto-checkin.md).
  - Auto Check-in: Improved Turnstile handling for New API access-token accounts. The assisted flow now tries an incognito temporary window first and falls back to a normal temporary window when needed, reducing failures caused by mixed login states across multiple accounts.

**Location Hints:**
- Add-account check-in settings: Use auto-detect while adding an account under "Settings → Account Management".
- `Quick Check-in` and Turnstile results: Check "Settings → Auto Check-in" or the account action menu.

## 3.41.0
- **New Features:**
  - AIHubMix: `AIHubMix` accounts can now view available models and prices in Model List, with prices shown from the site's returned per-1M-token rates. When the account-specific model scope cannot be confirmed, a catalog-scope notice is shown so you do not mistake every catalog model as available to the account. See [Model List](./model-list.md).
  - Balance History: Added an optional, off-by-default "Estimated Today's Income" feature. The popup and Balance History can now show site-reported income separately from income estimated from balance changes. See [Balance History](./balance-history.md).
  - Account Management: The add/edit account form now includes an **`Exclude from Today's Income`** switch. Specific accounts can be excluded from today's income totals in the popup, account list, and shared overview without affecting refresh, check-in, or account display. See [Account Management](./account-management.md).
- **Experience Optimizations:**
  - Add Account: Improved the first-step input experience. Authentication method and site URL now adapt to the available width: narrow screens choose the authentication method first and then fill in the site URL, while wider screens keep them side by side, making the add-account flow less cramped.
  - Auto Check-in: When a result fails because Turnstile, PoW, or another web verification step is required, the results table now suggests opening the site and completing verification before retrying, reducing confusion from raw error messages. See [Auto Check-in](./auto-checkin.md).
- **Bug Fixes:**
  - WebDAV: Fixed an issue where deleted accounts or bookmarks could reappear from an older backup after merged sync. Deletion records now participate in later sync merges. See [WebDAV Backup and Auto Sync](./webdav-sync.md).

**Location Hints:**
- AIHubMix Model List: Open "Settings → Model List" and select an `AIHubMix` account as the data source.
- Estimated Today's Income: Enable it under "Settings → Basic Settings → Balance History", then view it in the popup and "Settings → Balance History".
- `Exclude from Today's Income`: Available in the balance statistics section of the add/edit account dialog under "Settings → Account Management".
- Auto Check-in Verification Hint: View it in failed account rows in the Auto Check-in execution results list.
- WebDAV Sync: Use it from `WebDAV Settings` and sync actions under "Settings → Import / Export".

## 3.40.0
::: warning Site Announcement Auto Polling Is Off by Default
Starting in this version, background auto polling for Site Announcements is opt-in: the extension will not proactively visit sites linked to your saved accounts on a schedule unless you explicitly enable it. Existing users will also be migrated to the disabled state after upgrading. You can still click **`Check Now`** manually on the Site Announcements page. To keep scheduled background polling, re-enable it under "Settings → General → Site Announcements" and adjust the polling interval as needed.
:::

- **New Features:**
  - Site Announcements: Added a custom background polling interval from `15` to `1440` minutes, so you can control how often site announcements are checked. See [Site Announcements](./site-announcements.md).
  - Settings Shortcuts: Added title-adjacent settings buttons to standalone pages such as Account Management, Auto Check-in, Balance History, Self-Hosted Site Channels, Model Sync, Site Announcements, and Usage Analytics, so you can jump directly to the related setting.
- **Experience Optimizations:**
  - Site Announcements: The site filter is now searchable and sorted by announcement count, with counts shown in the list, making the right site easier to find when many accounts are configured.
  - Site Announcements: Page descriptions, empty states, and title actions now point directly to automatic polling settings, making the next step clearer when polling is off.
  - Self-Hosted Site Management: Backend configuration is now passed by site type, reducing the risk of using the wrong configuration when switching between self-hosted backends, and sensitive configuration is better protected in diagnostics.
- **Bug Fixes:**
  - Site Announcements: Fixed polling cooldown alignment after browser alarm restoration, so background checks follow the configured interval more accurately.
  - Site Announcements: **`Check Now`** now respects the current filter scope and is disabled while data is loading or when filters have no results, avoiding unnecessary checks for unrelated sites.
  - Site Announcements: Fixed announcement titles with inline HTML being truncated or displayed incorrectly.
  - Settings Search: Corrected the Usage Sync interval search target so search results jump to the actual sync interval setting.

**Location Hints:**
- Site Announcements: Open "Settings → Site Announcements" to view, manually check, and filter announcements.
- Site Announcement Auto Polling: Open "Settings → General → Site Announcements" to enable or disable polling and set the interval.
- Page Settings Shortcuts: Use the gear button next to titles on supported standalone pages.
- Usage Sync Interval: Search for "Usage sync interval" in settings search, or open "Settings → Usage Analytics".

## 3.39.0
- **New Features:**
  - Site Support: Added `v-api` site type support. Accounts can now be detected and managed according to this site's compatibility rules. See [Supported Sites](./supported-sites.md).
  - Site Feedback: Added a "Site Support Request" flow. When auto-detection fails, you can submit feedback with the site URL and error details, and specify the capabilities you want supported, such as balance, keys, models, check-in, or redemption.
  - Interface Language: Added Vietnamese UI support. You can now select `Tiếng Việt` in the language switcher.
  - `Claude Code Hub`: Supports searching provider lists and revealing the real `Key`, making provider management and import-status troubleshooting more complete. See [Self-Hosted Site Management](./self-hosted-site-management.md).
- **Experience Optimizations:**
  - `API Credential Library`: Unified UI wording such as "Save API Key" and "API Credential Library", making it clearer that this area is for saving `Base URL + API Key` combinations for copying, verification, model lookup, and export.
  - Settings Navigation: Settings pages are now grouped by General, API, Automation, Insights, Site Management, and System, with adjusted entry order in the settings page and popup so common pages are easier to locate.
  - Settings Page: Improved the layout of controls such as language, theme, currency, default tab, and task notifications on small screens.
  - Key Management: Improved token card layout on narrow mobile screens, making key information easier to read and copy.
- **Bug Fixes:**
  - Hosted Sites: Improved duplicate channel checks and key matching accuracy, reducing false matches when real `Key` values are hidden or there are many candidate channels.
  - `sk-` Prefix: Copying, display, and matching now normalize optional `sk-` prefixes only for site types that support that semantics. Other sites keep their original key format, reducing false matches caused by format differences.

**Location Hints:**
- `v-api` Accounts: Add or auto-detect accounts under "Settings → Account Management".
- Site Support Feedback: Submit it from the auto-detection failure prompt or the top feedback menu.
- Vietnamese: Select `VI / Tiếng Việt` from the language switcher on any page.
- `API Credential Library`: Use it from the extension popup or "Settings → API Credential Library".
- `Claude Code Hub`: Configure and manage it under "Settings → Self-Hosted Site Management".

## 3.38.0
- **New Features:**
  - AIHubMix: Added `AIHubMix` site support. You can detect and manage AIHubMix accounts, with support for one-time key display, account URL normalization, and the correct sign-in entry. See [Supported Sites](./supported-sites.md).
  - Account Management: Added a foreground token confirmation flow after saving an account. After saving, you can continue creating an API Token, confirming a one-time key, selecting groups, and configuring hosted-site setup, reducing unclear outcomes when background auto-configuration fails.
  - Site Announcements: Added a site announcement center with background polling for new announcements, notification reminders, manual checks, mark-as-read actions, and per-site announcement viewing. See [Site Announcements](./site-announcements.md).
  - Task Notifications: Added Telegram, Webhook, Feishu, WeCom, DingTalk, and ntfy notification channels. You can configure different delivery methods for auto check-in, sync, and other tasks, and send test notifications. See [Task Notifications](./task-notifications.md).
  - Webhook Notifications: Webhook URLs now support template variables such as title, message, task, status, and counts, making it easier to integrate services like Bark that rely on URL parameters.
  - Product Experience Analytics: Added privacy-friendly product analytics foundations to help understand usage of core features and improve future experiences.
- **Experience Optimizations:**
  - Notification Settings: Task notification settings are now grouped under a dedicated entry, with clearer setup guidance, test feedback, and error messages for each channel.
  - WebDAV: Improved status messages for manual upload, import, sync, and settings save actions, making results more compact and easier to understand.
  - WebDAV: Added clearer draft-save guidance, reducing confusion about whether unsaved configuration has taken effect.
  - Add/Edit Account: Auto-detection actions remain available even when the manual form is currently invalid, making it easier to switch to the current login state to complete account details.
- **Bug Fixes:**
  - Auto Detection: Fixed request context handling in incognito and current-tab scenarios, improving auto-detection stability.
  - Content Page: The API check overlay no longer triggers page shortcuts, reducing accidental actions on the target page.
  - WebDAV: Fixed error handling when reading an empty backup before upload.
  - WebDAV: Fixed an issue where manual upload, import, and similar actions could stop working after clicking "Sync Now".

**Location Hints:**
- AIHubMix Accounts: Add or auto-detect accounts under "Settings → Account Management".
- AIHubMix One-Time Key: After saving an AIHubMix account, follow the dialog to create, view, and copy the key.
- Site Announcements: View them under "Settings → Site Announcements", or receive new announcement reminders through background notifications.
- Task Notifications: Configure Browser, Telegram, Webhook, Feishu, WeCom, DingTalk, and ntfy channels under "Settings → General → Notifications".
- Webhook URL Templates: Fill in and test them in the Webhook notification channel settings.
- WebDAV Sync: In `WebDAV Settings` and related manual actions under "Settings → Import/Export".

## 3.37.0
- **New Features:**
  - Settings Page: Added global settings search. You can search pages, settings tabs, and individual settings from the top search box or with `Ctrl+K` / `Cmd+K`; recently visited items are also remembered so configuration is easier to find.
  - Notifications: Added completion notifications for background scheduled tasks. You can control Auto Check-in, `WebDAV` Auto Sync, Model Sync, Usage History Sync, and Balance History Capture separately, and send a test notification to confirm the permission is working.
  - Model Sync: Channel filter rules now support verification probe-based matching, so models can be synced to channels based on capabilities such as text generation, tool calling, web search, and structured output.
  - Bookmarks: When adding a bookmark, you can fill in the current page title and URL with one click, making it easier to save site consoles, docs, or admin pages.
- **Experience Optimizations:**
  - Account Management: The add/edit account form is now split into sections for site information, account authentication, tags and notes, check-in configuration, and balance statistics. On small screens, sections can be collapsed to make long forms easier to complete.
  - Settings Navigation: On desktop, extra settings tabs are automatically collected into a "More" menu, reducing horizontal scrolling and making tabs easier to find.
  - Settings Search: On mobile, the search entry expands after scrolling, making it easier to find settings on small screens.
  - Model Sync: Channel filter rules can now be reordered, making it easier to control matching priority when multiple rules are combined.
  - Multi-select Controls: Multi-select chips support copying text, and large option sets collapse into a bulk action entry to avoid overcrowding rule-editing and similar screens.
- **Bug Fixes:**
  - Channel Management: After starting Model Sync from the channel list, successfully synced channels now immediately refresh their model lists, so you no longer need to manually refresh the page to see the latest results.
  - Auto Detection: Improved site type detection based on login-state error messages and made fallback from background detection to direct detection more stable, reducing cases where compatible sites are incorrectly detected as unknown.

**Location Hints:**
- Settings Search: In the top search box on the settings page, or use `Ctrl+K` / `Cmd+K` to open it.
- Task Notifications: In "Settings → General → Notifications" and "Settings → Permission Management".
- Model Sync Filter Rules: In the global channel filter rules under "Settings → Self-Hosted Site Management → Model Sync Settings", and in per-channel filter rules under "Settings → Channel Management".
- Bookmark Current Page Fill: In the add bookmark dialog under "Settings → Site Bookmarks".
- Account Form Sections: In the add or edit account dialog under "Settings → Account Management".

## 3.36.0
- **New Features:**
  - Account Management: Added a "One-Click Refresh" function for disabled accounts, making it easier to quickly check if accounts have become available again.
  - Key Management: Supports filtering and group selection for multiple accounts, organizing keys more efficiently.
  - Key Management: When batch exporting keys to hosted site channels, you can now directly edit the model list, reducing the need for manual modifications after export.
  - Channel Migration: Added migration support for `AxonHub` and `Claude Code Hub` sites, simplifying cross-site synchronization.
  - UI Optimization: Added a quick feedback entry in the header of the options page, allowing you to quickly go to GitHub to submit an Issue.
- **Experience Optimizations:**
  - Internationalization: Improved localized translations for details such as region tags and telemetry mode tags.
  - UI Display: Increased the maximum display height for dialog result lists and preview lists, providing clearer viewing of long lists.
- **Bug Fixes:**
  - UI Interaction: Fixed an issue where the indeterminate (uncertain) state of checkboxes was not correctly preserved during batch selection.

**Location Hints:**
- Disabled Account Refresh: In "Settings → Account Management", for disabled account entries.
- Key Batch Export and Filtering: In "Settings → Key Management".
- Feedback Entry: In the Header area at the top of the options page.

## 3.35.0
- **New Features:**
  - Hosted Sites: Added `AxonHub` integration settings. You can configure `Base URL`, administrator email, and password within the extension. After verifying the connection, you can directly read, create, edit, and delete AxonHub channels, and import existing accounts/keys as AxonHub channels, and use them as sources or targets in channel migration.
  - Hosted Sites: Added `Claude Code Hub` integration settings. You can configure `Base URL` and administrator token to directly manage the `Provider` list. It also supports importing existing accounts/keys as Claude Code Hub providers, reducing duplicate entries across multiple backends.
- **Bug Fixes:**
  - Import/Export: After importing a backup containing preference settings, the settings state will now be immediately refreshed, and the interface language from the backup will be applied. This reduces instances where old settings or languages are still displayed after import, requiring a manual page reload.
  - Account Management: The descriptions and actual behavior of the `Prioritize Current Login Account` and `Match Open Tabs` sorting/matching rules have been aligned. When you search for an account using a full URL, tab title, or current page related content, relevant accounts are more likely to be correctly identified and ranked higher.

::: tip Scope of Use
`Claude Code Hub` currently does not support `Channel Migration`, `Model Sync`, `Model Redirect`, or full key viewing; `AxonHub` currently does not support `Model Sync` and `Model Redirect` and other New API exclusive operations.
:::

**Location Hints:**
- `AxonHub` / `Claude Code Hub` Integration Settings and Verification: In "Settings → Basic Settings → Self-Hosted Site Management".
- `AxonHub` Channel Management, `Claude Code Hub` Provider Management, and Import to Target Backend: In "Settings → Channel Management" and related import processes.
- Preference Backup Import: In "Settings → Import/Export".
- Account Sorting Priority and Account Search: In "Settings → Account Management".

## 3.34.0
- **New Features:**
  - Model List: Added price comparison capabilities, allowing filtering by billing method, sorting by price, and in the "All Accounts" view, supporting "cheapest first for the same model" to find low-priced models more directly with multiple accounts.
  - API Credentials: Configuration cards now include usage telemetry overview and manual refresh, allowing viewing of health status, balance, daily usage, request count, available models, etc. It also supports automatic recognition by site type or the use of custom read-only query endpoints.
  - Model List: In the "All Accounts" view, added filtering by account, account group, and other dimensions, making it easier to narrow down the scope when there are many sources.
  - Model Verification: Supports batch verification of the current filter results and can be used directly in the "All Accounts" view, making batch troubleshooting of model availability more convenient.
  - Account Management: Added batch selection, batch disabling, and batch deletion for easier organization of large numbers of accounts.
  - Account Management: Supports sorting by `Creation Time` and displays the creation time directly in the list.
  - Automatic Check-in: Failed results now allow direct execution of `Disable Account` or `Delete Account`, enabling in-place handling of abnormal accounts on the results page after troubleshooting, without needing to switch back to account management.
  - Hosted Sites: Even if the current site is not yet fully configured, entries like `Channel Management` and `Model Sync` will be retained, with direct prompts within the page indicating missing configurations and providing links to the setup entry.
  - Account Management: When adding accounts, you can now choose to automatically fill in the current site URL, reducing operational steps.
- **Experience Optimizations:**
  - Account Management: Added a global refresh button at the top of the account management page for one-click refresh of all accounts.
  - Account Management: Drag-and-drop sorting and filtering now have smoother animation experiences.
  - Model List: The "All Accounts" view will more clearly distinguish between "Loading," "Load Failed," and "Format Incompatible" states. Expanded items will also be preserved as much as possible after refreshing, reducing repeated searches.
  - Key Management: When adding keys in the current account or "All Accounts" filter view, the corresponding account will be automatically pre-selected, reducing duplicate selections.
  - Refresh Experience: Multiple settings pages and history pages will try to retain current content when refreshing data, avoiding frequent clearing and reloading, making viewing less interrupted.
- **Performance Optimizations:**
  - Account Management: Optimized the loading performance of large lists, resulting in faster loading speeds when there are many accounts.
- **Bug Fixes:**
  - WebDAV: Compatible with backup download responses that return `206 Partial Content` from some services, reducing instances where downloads are mistakenly marked as failed.
  - WONG Public Welfare Site: Fixed the real key reading method for masked `token`s, restoring normal parsing of related account or key information.
  - Temporary Window Reminder Required: Only prompts for adjustments when account refresh has confirmed the need for temporary window fallback, but the relevant settings are currently disabled or permissions are missing, reducing unnecessary reminders in unrelated scenarios.

**Location Hints:**
- Model Price Comparison, Account Filtering, Batch Verification: In "Settings → Model List".
- API Credentials Telemetry Overview and Configuration: In the cards and add/edit dialogs of "Settings → API Credentials".
- Account Auto-fill on Addition, Batch Management, Creation Time Sorting: In "Settings → Account Management".
- Automatic Check-in Failed Account Handling: In the results list of "Settings → Automatic Check-in".
- Automatic Pre-selection of Account on Key Management Addition: In "Settings → Key Management".
- Hosted Site Missing Configuration Prompt: On the relevant hosted site pages in "Settings → Self-Hosted Site Management".
- WebDAV Backup Synchronization: In the relevant processes of `WebDAV Settings` within "Settings → Import/Export".

## 3.33.0
- **New Features:**
  - Account Addition: When a hosted site configuration is incomplete, you will now be prompted to complete the settings before `Save and Auto-configure`. You can directly jump to the relevant configuration page, reducing the situation where you discover missing configurations only after clicking auto-configure.
  - Hosted Site Verification: The `New API` verification dialog has been changed to an `OTP` style more suitable for CAPTCHA input, making it more convenient to enter one-time verification codes.
  - API Verification Records: Verification history status is now displayed more clearly. When viewing the last verification result in `API Credentials`, Model List, or other locations, it's easier to determine the current status.
  - Hosted Site Settings: Administrator User IDs are now restricted to pure numbers only. Invalid values will be directly intercepted and prompted on the settings page, reducing verification or read exceptions caused by incorrect values.
  - Model List: When no data source is selected, clearer empty state descriptions and next steps are provided, reducing confusion about what to do first after entering the page.
  - Key Management: When there are no keys under an account or key loading fails, clearer empty state prompts are provided, along with options to retry or navigate to relevant pages.
  - Model to Key Dialog: You can now directly jump to the `Key Management` for the corresponding account and quickly filter by account badges to identify the source. This makes it easier to troubleshoot models and keys for a specific account.
  - Update Reminders: Users who manually install packages can now view the differences between the current version and the latest stable version, and directly open the download page or update notes, reducing the chance of staying on an old version unknowingly for extended periods.
- **Experience Optimizations:**
  - In-Page Navigation: For multiple entry points that require jumping from the current flow to the settings, account, or hosted site pages, navigation history is now better preserved, making returning to the previous step more natural.
  - Exit Flow Prompts: Button copy will more clearly distinguish between "Leave Current Flow" and "Continue to Next Step," reducing accidental clicks that lead to leaving the current page.
  - Warning Prompts: Some scenarios described as "partially successful / requires subsequent processing" are now displayed with a unified warning prompt style, accompanied by directly executable follow-up actions.
  - Account Data Reading: Manually fetching account data that takes longer than approximately `20` seconds will now stop, preventing prolonged waiting and preserving any results that can still be saved, reducing instances of being stuck in a waiting state.
- **Bug Fixes:**
  - WebDAV Sync: Before automatic synchronization, the system will make its best effort to upload local changes for deleted accounts, reducing the chance of deleted accounts being reintroduced in other devices or subsequent synchronizations.
  - Account Management: Temporary windows will only be suggested to assist the process when the current environment is genuinely restricted, reducing false alarms.
  - Model List: Restored the original account name badge display, making it easier to identify which account a model originates from when viewing account-sourced models.
  - DoneHub: Compatible with some sites' daily usage query methods, reducing abnormal reads or unstable results.
- **Performance Optimizations:**
  - Data Statistics: Reduced extra requests in the fast path for reading daily usage, lowering the refresh waiting time for some sites.

**Location Hints:**
- Hosted Site Configuration Completion: In the add or edit account dialog within "Settings → Account Management".
- `OTP` Verification and Hosted Site Configuration: In "Settings → Self-Hosted Site Management", within `New API Integration Settings` and related verification dialogs.
- Hosted Site Administrator User ID Validation: In "Settings → Self-Hosted Site Management", within the relevant hosted site settings.
- Model List Empty State and Source Filtering: In "Settings → Model List".
- Key Management Empty State and Quick Jump: In "Settings → Key Management" and the model-to-key dialog.
- Version Update Reminder: In the extension popup or the version number at the top of the settings page, and in "Settings → About".
- WebDAV Automatic Sync: In "Settings → Import/Export", under `WebDAV Settings` and `WebDAV Automatic Sync`.

## 3.32.0
- **New Features:**
  - Automatic Check-in: Each row in the results table can now open its corresponding site directly. If the current site type does not support automatic check-in, the extension now shows a clearer message so you can decide whether to handle it manually or check the site's rules first.
  - New API Hosted Site Verification: If verification finds that `Base URL`, username, or password is missing, you can now fill them in directly inside the verification dialog and continue with `Save and Retry`, without leaving the dialog to go back to the settings page.
- **Experience Optimizations:**
  - Account List Sorting: The default sort priority now gives precedence to the field you actively choose in the list. For example, when sorting by `Balance`, `Spend`, or `Income`, that selection now takes effect before the old manual order. Existing preferences are migrated automatically, so no reconfiguration is required.
- **Bug Fixes:**
  - Account Management: When cookie import runs into missing permissions, the account dialog no longer closes early when redirecting you to `Permission Settings`; after handling permissions, you can continue the current input flow.
  - Automatic Recognition: If the current tab was already open before the extension was installed or updated, automatic recognition now clearly prompts you to refresh the page and provides a one-click refresh action, reducing failures that looked random.
  - Temporary Page / Window Flows: Fixed cases where context was released too early in flows that rely on temporary pages, reducing mid-process failures, closed-page issues, and errors like `No tab with id`.

**Location Hints:**
- Automatic Check-in result quick actions: In each row of the results table under "Settings → Automatic Check-in".
- New API quick config completion: In "Settings → Self-Hosted Site Management" and related `New API` verification dialogs.
- Cookie import permission hints / automatic recognition refresh hints: In the new or edit account dialogs under "Settings → Account Management".
- Sorting priority settings: In "Settings → Account Management → Sorting Priority Settings".

## 3.31.0
- **New Features:**
  - Safari Support: Added Safari installation documentation and release packages for easier installation and use on macOS via Xcode.
  - Account Management: Added an independent advanced filter bar to filter by `Site Type`, `Check-in Status`, `Refresh Status`, and `Account Status`. Each option will also display the count, making filtering more intuitive.
  - Model List: When the model list for a single account fails to load, you can now use an `API Key` from that account to continue loading, reducing the situation where models are completely invisible due to API exceptions.
  - CLIProxyAPI: Added `Connection Detection` in `CLIProxyAPI Settings`. It can automatically check after saving the address or managing keys, or you can manually re-detect.
- **Experience Optimizations:**
  - Hosted Site Channel Import: Clearer prompts will be shown before importing to indicate if the current channel might be a duplicate, reducing the need for post-import investigation.
  - Hosted Site Channel Import: When confirmation is needed, you can now complete verification in the dialog box before proceeding to check for duplicates, without directly blocking the operation.
  - Export to Channel: If models cannot be fetched, the channel dialog will still open normally, prompting you to fill them in manually, rather than interrupting the process due to automatic loading failure.
  - Account Cookie Import: Now distinguishes between reasons like "current site has no readable cookies," "missing cookie permission," and "read failure." When permissions are missing, a prompt will appear in the account dialog, with a direct link to the permission settings page.
  - Channel Management: The channel list now defaults to displaying the most recent records first, making newly created or recently added channels easier to find.
  - Automatic Check-in: Accounts with the `Skipped` status will be moved to the end, making it easier to see frequently used and pending accounts.
  - Operation Prompts: For some operations where the server does not return a prompt message, local success prompts will be added to avoid a lack of feedback after clicking.
  - Multi-language: Restored some missing translations and continued to improve interface copy and error messages in multiple places.
- **Bug Fixes:**
  - Mobile Browser Compatibility: When the browser does not allow creating temporary windows, the process will automatically continue in a tab, reducing instances of clicks having no effect.
  - Sub2API: When creating keys, it is now mandatory to explicitly select a group, preventing the creation of API keys with invalid groups.
  - Page Layout: Fixed the z-index conflict between the channel table operation column and the sidebar mask on the settings page.
  - Changelog Popup: Fixed issues where bottom buttons were easily pushed out or displayed chaotically on small screens.

**Location Hints:**
- Account Advanced Filtering: In the filtering area at the top of the list in "Settings → Account Management".
- Account Key Fallback Loading Models: In "Settings → Model List", after selecting a single account as the data source, if loading fails, you can continue the operation in the error prompt area.
- `CLIProxyAPI` Connection Detection: In "Settings → CLIProxyAPI Settings".
- Hosted Site Channel Import Prompts / Deduplication Verification / Model Preload Failure Prompts: In "Settings → Key Management" or related "Import to Channel" / "New Channel" dialogs.

## 3.30.0
- **New Features:**
  - Channel Management: Added `Channel Migration`, supporting previewing the migration before migrating the current filter results or selected channels to other hosted sites.
  - Hosted Sites:
    - You can now switch the current hosted site type directly in "Settings → Self-Hosted Site Management".
    - `Done Hub` / `Veloera` now support reading real channel keys.
  - CC Switch Export: Added `OpenCode` / `OpenClaw` types.
  - Multi-language: Added Japanese and Traditional Chinese (`zh-TW`) interface languages.
- **Experience Optimizations:**
  - First Use and Interface:
    - Welcome / Permission Guide popups now support direct language selection.
    - Added quick theme and language switching at the top of the settings page.
  - API Verification: Saved `API Credentials` and model verification will now retain the last probe result and timestamp.
  - Resource Usage: Some settings pages, extension popups, and views now use on-demand loading, reducing unnecessary initialization and resource consumption.
- **Bug Fixes:**
  - WebDAV: Compatible with scenarios where Nutstore returns `409 AncestorsNotFound`. These cases will be treated as "remote backup does not exist," reducing false failure reports during initial synchronization or with empty directories.

**Location Hints:**
- Hosted Site Type Switching: In "Settings → Self-Hosted Site Management".
- Channel Migration: In the `Channel Migration` at the top of the "Settings → Channel Management" page.
- CC Switch Export: In the export entry points of "Settings → Key Management" or "Settings → API Credentials".
- Quick Theme / Language Control: On the top right of the settings page; initial language selection will appear in the welcome/permission guide popup when the extension is first opened.
- Last API Verification Result: Can be viewed in relevant verification dialogs and supported `API Credentials` / model verification interfaces.

## 3.29.0
- **New Features:**
  - Automatic Check-in: Added `Batch Open Manual Check-in Pages`, allowing you to open the manual check-in pages for failed accounts all at once, displaying progress, completion, and partial failure prompts. Holding `Shift` while clicking will open them in new windows.
  - Feedback and Support: Added a `Feedback` menu in the extension popup and a `Community Communication Group` entry in the "About" page, which directly links to the community summary page for WeChat group QR codes, Telegram groups, and other communication channels.
- **Experience Optimizations:**
  - Browser Language: Improved compatibility with browser language environments like Traditional Chinese and adjusted the default language fallback logic for more stable language recognition on first launch.
  - Documentation Links: Optimized multi-language document jump rules. Unsupported language environments will now automatically fall back to English documentation, reducing instances of jumping to incorrect language pages.
  - Multi-language: Unified some translation retrieval methods and cleaned up some unused copy to improve the multi-language experience.
- **Bug Fixes:**
  - Sidebar: Fixed an occasional issue where the sidebar could not be opened after clicking the toolbar in Chrome/Edge (MV3).
  - Key Management: When viewing masked keys, a loading state is now displayed, supporting the parsing and display of the complete key. It will not re-request when expanded again.
  - Browser Background: Temporary pages are now cleaned up more promptly when the extension is suspended, reducing issues with temporary page residue.

**Location Hints:**
- Batch Manual Check-in: In the relevant operations for failed accounts on the "Settings → Automatic Check-in" page.
- Community Entry: In the `Feedback` menu in the top right of the extension popup, and in the `Feedback and Support` section of "Settings → About".
- Key Display: In the "Settings → Key Management" key list, click the show/hide button.

## 3.28.0
- **New Features:**
  - API Credentials: Added `Verify CLI Compatibility` operation. During verification, it supports automatic retrieval or manual input of model IDs and clearly indicates if a temporary `API Type` override is currently in use, preventing misinterpretation of one-time test results as saved configurations.
  - API Credentials / Model List: You can now jump from `API Credentials` to the corresponding `Model List` data source with one click. The `Model List` also supports directly using API credentials as a data source to view model directories and verification results without needing to create a site account first.
  - Key Management: `Key Management` now displays hosted site channel status, matching signals, and jumpable entry points. When saving keys to `API Credentials`, clearer names are generated, making future lookup and reuse easier.
  - New API Hosted Sites: Added login auxiliary information (username, password, optional TOTP) and session verification in hosted site configurations. When status verification or reading real channel keys is required, it can be completed directly within the extension.
  - Hosted Site Matching: Channel identification is now based on a comprehensive ranking of `URL`, keys, and models. For scenarios where the backend only returns masked tokens, channel status judgment, copying, and integration operations can still be completed.
  - First Use: The Welcome / Permission Guide popup now includes a language selector, allowing you to switch the interface language upon first opening and remember your subsequent preferences.
- **Experience Optimizations:**
  - Veloera: For scenarios where channel localization and status detection based on `Base URL` are not currently supported, relevant entries will be automatically hidden or disabled with explanations, reducing confusion from clicking and getting no results.
- **Bug Fixes:**
  - Language: Fixed an issue where the browser's detected language was not consistently followed on startup, and synchronized corrections for interface copy and date/time localization.
  - Permission Guide: Optimized the button layout of the permission explanation popup, making it neater and easier to click on small windows or when buttons wrap.

**Location Hints:**
- API Credentials: In "Settings → API Credentials", you can use operations like `Verify CLI Compatibility` and `Open in Model Management`.
- Model List Data Source: In the data source selection area at the top of "Settings → Model List", you can switch to `API Credentials`.
- Hosted Site Channel Status: View the hosted site status and matching prompts for each key in "Settings → Key Management".
- New API Hosted Site Login Auxiliary: In "Settings → Self-Hosted Site Management" under the `New API Integration Settings` area.
- Initial Language Selection: In the welcome/permission guide popup that appears when the extension is first opened.

## 3.27.0
- **New Features:**
  - Account Management: Added filtering by enabled status to the account list, allowing quick switching between `Enabled` / `Disabled` accounts for easier batch management of invalid accounts.
  - Feedback and Support: Added a `Feedback` quick entry in the extension popup title bar, and a `Feedback and Support` section in the "About" page, which directly opens GitHub for issue reporting, feature suggestions, and discussions.
- **Experience Optimizations:**
  - Account Display: When multiple accounts have the same site name, the username will now be automatically appended as `Site Name · Username`, making them easier to distinguish in lists, search results, selectors, and statistics views.
- **Bug Fixes:**
  - Sidebar: Further optimized sidebar detection support. When the browser or mobile environment does not support sidebars, invalid entries will be automatically hidden or fall back to the settings page, reducing instances of clicks having no effect.

**Location Hints:**
- Account Status Filtering: In the filtering area at the top of the list in "Settings → Account Management".
- Feedback Entry: In the `Feedback` button in the extension popup title bar, and in the `Feedback and Support` section of "Settings → About".

## 3.26.0
- **New Features:**
  - Account Management: Added `Locate Corresponding Channel` quick operation, allowing one-click navigation from a hosted site account to the corresponding "Channel Management" list with filters applied. It also supports enabling "Remind before adding duplicate accounts" to reduce accidental additions of duplicates.
  - Duplicate Account Cleanup: Added a `Duplicate Account Cleanup` tool that can scan and delete duplicates by URL source site + user ID, making batch cleanup of duplicate accounts easier.
  - Account Management: The operation menu for disabled accounts now includes a direct delete entry, streamlining the process of cleaning up invalid accounts.
  - API Credentials: The `API Credentials` page now supports direct access from the settings navigation and the extension popup. Exported configurations will also retain token remarks, facilitating migration between different tools.
  - WebDAV: Added synchronization data selection, allowing you to selectively sync shared data like `Accounts`, `Bookmarks`, `API Credentials`, etc., reducing unnecessary overwrites between multiple devices.
  - Sub2API: Added key management support for `Sub2API` accounts, allowing direct viewing, creation, editing, and deletion of keys.
  - CLIProxyAPI: Added Provider type selection during import and automatically standardizes common endpoint addresses, reducing the need for manual URL modifications.
- **Experience Optimizations:**
  - Redemption Assistant: After successful redemption, the account balance will be automatically refreshed, reducing the need for manual refreshes to confirm results.
- **Bug Fixes:**
  - Automatic Check-in: Fixed-time check-ins now have a more stable retry mechanism to reduce missed check-ins due to missed execution windows caused by extension updates or other factors.
  - Automatic Recognition: Fixed an issue where custom check-in configurations might be lost after account re-recognition, preventing accidental configuration loss.
  - Automatic Check-in: Fixed an issue where Turnstile assistance or manual check-in prompts incorrectly used `External Check-in URL` for some accounts. It now always opens the site's default check-in page, reducing instances of jumping to the wrong page or failing to complete check-in.
  - Hosted Sites: When importing or synchronizing data to hosted sites, the target site's default group will be prioritized, reducing anomalies caused by group mismatches.

::: warning Note
- WebDAV's `Synchronize Data Selection` and device-local settings like automatic account refresh will no longer overwrite each other across devices via WebDAV.
:::

**Location Hints:**
- Duplicate Account Reminder: In "Settings → Basic Settings → Account Management" under `Remind before adding duplicate accounts`.
- Duplicate Account Cleanup: In the toolbar of the "Settings → Account Management" page.
- Locate Channel: In the operation menu for a single account in "Settings → Account Management".
- API Credentials: In "Settings → API Credentials"; the extension popup can also switch to the `API Credentials` view.
- WebDAV Synchronize Data Selection: In "Settings → Import/Export" under `WebDAV Settings`.

## 3.25.0
- **New Features:**
  - Automatic Check-in: Supports Cloudflare Turnstile (anti-bot/human verification) scenarios. When a site requires Turnstile verification, it will attempt to complete the verification on a temporary page before proceeding with the check-in, and provide a manually openable check-in link and prompts when necessary.
  - CC Switch: When exporting to `Codex`, the default value for the base address will be automatically appended with `/v1` (if the interface address has not been manually modified), reducing issues with unusable interfaces after direct import.
  - Model Redirect: Added an optional switch `Clean up invalid redirect targets after sync`. This will automatically delete mappings in `model_mapping` that point to non-existent models after model synchronization refresh (a dangerous operation, off by default).
- **Experience Optimizations:**
  - Temporary Windows: More accurately identifies challenge/login pages, reducing misjudgments and unnecessary interruptions.
- **Bug Fixes:**
  - Cookie Authentication: Corrected copy to align with current actual behavior and capabilities, reducing misguidance.
  - Sidebar: Fixed an issue where the sidebar could not be scrolled to see bottom menu items on small windows.

**Location Hints:**
- Turnstile Verification: View new prompts in the execution results of "Settings → Automatic Check-in".
- CC Switch Export: In "Settings → Key Management", select a key and click `Export to CC Switch`, then select `Codex` as the target application.
- Model Redirect Cleanup: In "Settings → Basic Settings → Model Redirect", enable `Clean up invalid redirect targets after sync`.

## 3.24.0
- **New Features:**
  - Changelog: The plugin will no longer automatically open a new tab in the browser after an update. Instead, when you first open the plugin interface, a popup will display the update content within the plugin, with an option to open the full changelog.
  - LDOH: Added a `View in LDOH` (LDOH icon) quick entry to the account list, which directly jumps to LDOH and automatically filters to the corresponding site. When adding an account, an `Open LDOH Site List` entry is also provided to help find sites.
- **Experience Optimizations:**
  - Documentation Links: When opening documentation/changelogs from the plugin, it will automatically jump to the corresponding language version based on the current plugin language.

**Location Hints:**
- Changelog Switch: In "Settings → General → Changelog" under `Automatically display update content after update`.
- Changelog Popup: After updating the plugin, it will automatically pop up the first time you open the "Extension Popup / Settings Page / Sidebar" (once per version).
- LDOH Quick Entry: To the right of the site name in the account list in "Account Management" (LDOH icon, prompt `View in LDOH`); you can also click `Open LDOH Site List` in the add account dialog.

## 3.23.0
- **New Features:**
  - Automatic Check-in: Added `Quick Check-in` to the account operation menu, allowing immediate execution of a check-in for a single account and refreshing its status upon completion.
  - Key Management: Added an `All Accounts` view, aggregating keys by account group for easier cross-account searching and copying.
  - Model Redirect: Added a `Clear Model Redirect Mappings` batch operation, allowing you to select by channel and confirm a quick reset of `model_mapping` (irreversible).
- **Experience Optimizations:**
  - Self-Hosted Site Management: URLs in the channel list are now clickable and search experience has been optimized.
- **Bug Fixes:**
  - Channel Management: Fixed an issue with inaccurate prompt copy for `Priority` in the channel dialog.
  - Model Redirect: Automatic mapping generation now includes a "version guard" to prevent cross-version mismatches.
  - Sidebar: When the runtime environment does not support sidebars, it will automatically fall back to opening the popup/settings page, preventing clicks with no response.

## 3.22.0
- **New Features:**
  - Model List: Added a "Model to Key Mapping" tool (key icon) to check if available keys exist for the current model. If no available keys are found, you can create a default key with one click based on the model's available groups, or enter a custom creation process, with support for one-click key copying.
  - Share Snapshot: Supports one-click sharing of "Overview Snapshot / Account Snapshot". It prioritizes copying the image to the clipboard, and automatically downloads a PNG if that's not supported. Snapshots only contain shareable information (no sensitive fields like `API Key`) and allow one-click copying of the title text.
- **Experience Optimizations:**
  - Disabled Accounts: Automatic refreshes and scheduled tasks for "Balance History / Usage Analysis / Usage Sync" will now automatically skip disabled accounts, reducing invalid requests and errors.
- **Bug Fixes:**
  - Buttons: Fixed an issue where the spinner was not visible on buttons in a "loading" state that also displayed a left-side icon.

**Location Hints:**
- Model to Key Mapping: In "Settings → Model List", click the key icon ( `Model to Key Mapping` ) to the right of the model name.
- Share Overview Snapshot: In the button ( `Share Overview Snapshot` ) on the right side of the title bar of the overview page in the extension popup.
- Share Account Snapshot: In the operation menu for a single account in "Settings → Account Management" ( `Share Account Snapshot` ).

## 3.21.0
- **New Features:**
  - API Credentials: Added an "API Credentials" page suitable for scenarios where you only have a `Base URL` + `API Key` without an account. It supports unified management of tags/remarks, and allows direct availability verification and quick export (e.g., to Cherry Studio / CC Switch / Kilo Code / CLIProxyAPI / Claude Code Router), reducing copy-pasting.
  - Balance History: Added multi-account views (Overview / Account Distribution / Trends) and a unified "Account Summary" table for quick comparison and summary statistics.
  - Self-Hosted Site Management: Added `Done Hub` to hosted sites, supporting configuration of administrator credentials for use in "Channel Management", "Model Sync", and other functions.
- **Experience Optimizations:**
  - Right-Click Menu: "Redemption Assistant" and "AI API Detection" entries can now be enabled/disabled separately. Changes take effect immediately after switching.
  - Copy Key: When an account has no key, the popup provides an entry for "Quickly Create Default Key / Create Custom Key", reducing the need to navigate back and forth.

**Location Hints:**
- API Credentials: In "Settings → API Credentials".
- Balance History: In "Settings → Balance History".
- Done Hub Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Done Hub` and fill in "Done Hub Integration Settings".
- Right-Click Menu Entry Switch: In "Settings → Basic Settings → Check-in and Redemption / AI API Testing", under "Show in Browser Right-Click Menu" respectively.
- Copy Key Popup: Opened by clicking "Copy Key" on pages like "Account Management".

## 3.20.0
- **Experience Optimizations:**
  - Key Management: The group dropdown option when adding a new key now displays both the group ID and description, making it easier to distinguish and select among multiple groups/routes.
- **Bug Fixes:**
  - Account Management: The default for "Automatically create default key after adding account" is now disabled. If you wish to automatically generate a default key after adding an account, please enable it manually in the settings.

**Location Hints:**
- Group ID Display: In "Settings → Key Management", click "Add Key", and view it in the group dropdown option.
- Auto-Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".

## 3.19.0
- **New Features:**
  - Self-Hosted Site Management: Added `Octopus` hosted site support, allowing connection to the Octopus backend and importing account API keys as channels in "Channel Management", with support for fetching available model lists.
  - Key Management: Added "Automatically create default key after adding account" (enabled by default), and a one-click option "Ensure at least one key" to automatically complete default keys for accounts missing them.
  - AI API Testing: "Model List Probing" for interface verification now supports interface types like OpenAI/OpenAI-compatible, Anthropic, Google/Gemini, and provides suggested available model IDs, reducing manual guessing.
- **Experience Optimizations:**
  - Account Management: Enhanced site/account recognition logic to improve stability in multi-account scenarios for the same site.
  - Usage/Log Fetching: Added rate limiting protection for log-related interfaces to reduce errors or triggered site rate limits due to frequent refreshes.
  - Channel Management: Improved duplicate detection when creating channels and added confirmation prompts to prevent accidental creation of duplicate routes.
- **Bug Fixes:**
  - Disable Accounts: Disabled accounts are now automatically filtered out from dropdowns/lists in Key Management and related sections, preventing invalid operations.
  - Language: Fixed an issue where the extension's language setting might affect the webpage's own language value.

**Location Hints:**
- Octopus Configuration: In "Settings → Basic Settings → Self-Hosted Site Management", select `Octopus` and fill in `Base URL` / Username / Password.
- Channel Management Entry: In "Settings → Channel Management".
- Auto-Create Default Key Switch: In "Settings → Basic Settings → Account Management → API Keys".
- One-Click Complete Default Key: In "Settings → Key Management", at the top right, "Ensure at least one key".
- AI API Testing Entry: Right-click menu "Quickly test AI API functionality".

## 3.18.0
- **New Features:**
  - Balance History: Charts now support switching between "Currency Units" (`USD` / `CNY`) and display currency symbols on axes/tooltips. When `CNY` is selected, it will be converted based on the account's "Recharge Amount Ratio" for easier trend viewing and reconciliation by amount.
- **Experience Optimizations:**
  - Tag Filtering: When there are too many tag/account options, it now defaults to "Expand to display," making browsing and selection more intuitive.
  - Tabs: Added left and right scroll buttons to the "Settings" group tabs and "Model List" vendor tabs, making switching easier in narrow windows.
- **Bug Fixes:**
  - Account Management: Site type "Automatic Recognition" is now more accurate, fixing the frequent occurrence of unknown site types in recent versions.

**Location Hints:**
- Balance History Currency Unit: In "Settings → Balance History", in the filter area, "Currency Unit".
- Account Exchange Rate (Recharge Amount Ratio): In "Settings → Account Management" add/edit account form, "Recharge Amount Ratio".

## 3.17.0
- **New Features:**
  - Balance History: Added "Balance History" feature (off by default), which records daily balance and income/expenditure snapshots, viewable in charts for trends. Supports filtering by tag/account and time range, with convenient "Refresh Now / Clear Now" operations.
  - Balance History: Added settings to control enabling, retention days, and "End-of-Day Fetch". Note: If you disable "Show Today's Income/Expenses" and do not enable "End-of-Day Fetch," the "Daily Income/Expenses" chart will have no data.
- **Experience Optimizations:**
  - Channel Management: Optimized the responsive layout and usability of the "Channel Management" toolbar on small screens/narrow windows.
- **Bug Fixes:**
  - Import/Export: Fixed responsive display issues in the export area on some screen sizes.
  - Popups: Fixed layout anomalies where the scrollbar position in popups was incorrect.

**Location Hints:**
- Balance History Switch/Retention Days/End-of-Day Fetch: In "Settings → Basic Settings → Balance History".
- Balance History Chart Entry: In "Settings → Balance History".

## 3.16.0
- **New Features:**
  - Sub2API (JWT Sites): Added Sub2API site type, supporting balance/quota queries. Supports reading login state via "Automatic Recognition" from the console. Also supports the "Plugin Hosted Session (Multi-account, Recommended)" mode, which allows independent authentication renewal for each account, improving the experience for multiple accounts on the same site.
  - Display Settings: Added a "Show Today's Income/Expenses" switch (on by default), which hides and stops fetching statistics like "today's consumption/income," reducing log fetching requests during refreshes.
- **Note:**
  - Sub2API currently does not support site check-in, daily usage, or income-related functions; it only provides basic balance/quota queries. Related functions will be gradually improved based on site capabilities.
  - "Plugin Hosted Session (Multi-account)" saves `refresh_token` as account-private credentials and will be included in exports/WebDAV backups. Please keep your backup files and WebDAV credentials secure.

**Location Hints:**
- Sub2API Addition/Mode Explanation: In "Settings → Account Management", add/edit an account, select Sub2API as the site type; for more detailed steps, see [FAQ](./faq.md) (search for "Sub2API").
- Today's Income/Expenses Switch: In "Settings → Basic Settings → Display Settings".

## 3.15.1
- **Bug Fixes:**
  - Chrome/Edge (MV3): Improved background Service Worker stability, reducing instances where asynchronous timed tasks (WebDAV auto-sync / usage sync / model sync / auto check-in, etc.) are missed due to premature background termination. Restored relevant timed tasks automatically after browser restart.

## 3.15.0
- **New Features:**
  - Bookmark Management: Added "Bookmark Management" for saving quick links to site consoles/documentation/management pages without needing to create a full account. Supports adding/editing/deleting, pinning, tagging, search filtering, and drag-and-drop sorting. The popup now includes an "Account / Bookmark" switch. Bookmark data will be included in backup/restore and WebDAV auto-sync.
- **Bug Fixes:**
  - Account Refresh: Removed duplicate "today's income" fetch requests, reducing unnecessary network calls (some sites already return `today_income` in their refresh interface).
  - Auto Refresh: The minimum refresh interval is now 60 seconds, and the minimum refresh interval protection is now 30 seconds. Old configurations will be automatically corrected to a valid range after updating, and related prompts and documentation have been improved.

::: warning Important: Auto-refresh configuration will be forcibly adjusted
Due to feedback indicating that **overly short auto-refresh intervals can trigger site rate limits and place excessive load on sites**,

v3.15.0 **has forcibly modified auto-refresh configurations**:
- Auto-refresh and refresh on plugin open features have been turned off. If you still need to enable them, you must re-enable them manually.
- The minimum `Refresh Interval` is now 60 seconds, and the `Minimum Refresh Interval Protection` is now 30 seconds. If your pre-upgrade setting was below these thresholds, it will be automatically raised to the minimum value after upgrading. If your previous setting was within the new valid range, it will remain unaffected.
:::

**Location Hints:**
- Bookmark Management: In "Settings → Bookmark Management"; the top of the popup allows switching between "Account / Bookmark".
- Auto Refresh: In "Settings → Basic Settings → Auto Refresh".

## 3.14.0
- **New Features:**
  - Web AI API Functionality Test (Beta): Added a right-click menu option "Quickly test AI API functionality" which opens a test panel directly on the current webpage. Supports filling/pasting `Base URL` and `API Key`, and performs basic capability probes for interfaces like OpenAI-compatible / OpenAI / Anthropic / Google (OpenAI-compatible also supports one-click model list retrieval).
  - (Optional) Automatic Detection: Can be enabled in "Settings → AI API Test" and configured with a URL whitelist. When a usable `Base URL` and `API Key` are detected on a whitelisted page, a confirmation prompt will appear before opening the test panel (off by default, and keys are not saved).
  - Automatic Check-in: The execution results list now includes more troubleshooting prompts, such as "Temporary shield bypass tab manually closed," "Invalid Access Token," and other common exceptions with suggested handling and documentation links.
- **Bug Fixes:**
  - WebDAV: Auto-sync has been migrated from timers to the browser's Alarms API, reducing the probability of missed syncs caused by background hibernation/power-saving policies.

**Location Hints:**
- AI API Test Panel: Right-click menu on any webpage, select "Quickly test AI API functionality"; automatic detection settings are in "Settings → AI API Test".
- Automatic Check-in Prompts: View in the execution results list of "Settings → Automatic Check-in".

## 3.13.0
- **New Features:**
  - Account Management: Added "Check-in Status Expired" prompt. When the "Checked in Today / Not Checked in Today" status is not from today's detection, an orange warning icon will be displayed. Clicking it will refresh the account data with one click, preventing misguidance by old status.
  - Interface: Multi-select controls have been upgraded to more compact selectors (saving space, supporting search, and clearer display of selected items).
- **Bug Fixes:**
  - Veloera: Fixed account data refresh and check-in logic, improving usability.
  - Cookie Authentication: Removed the cookie caching mechanism, reducing anomalies caused by reading old values after cookie updates.

**Location Hints:**
- Check-in Status Expired Prompt: In the account list of "Settings → Account Management", at the check-in icon to the right of the site information.

## 3.12.0
- **New Features:**
  - Key Management: Added "Export to Kilo Code" - generates Kilo Code / Roo Code providerProfiles configurations, supporting copying `apiConfigs` snippets or downloading `settings.json` for import (import is incremental and will not clear your existing providers).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long text in site names, now automatically truncated.
  - Dropdown Selectors: Improved empty state prompts and fixed overflow issues with long option text.

**Location Hints:**
- Export to Kilo Code: In "Settings → Key Management", in the key list, click the Kilo Code icon in the top right of a key.

## 3.11.0
- **New Features:**
  - Self-Hosted Site Management: Added "Duplicate Channel" reminder. When a duplicate/similar channel is detected, a warning dialog will pop up, allowing you to choose to continue creation or cancel (no longer blocking creation with error toasts).
- **Bug Fixes:**
  - Account Management: Fixed layout overflow issues caused by excessively long text in site names, now automatically truncated.

## 3.10.0
- **New Features:**
  - Account Management: When clicking a site link in incognito mode, it will now open within the current incognito window (facilitating maintaining incognito login state).
  - Account Management: Disabled accounts also support clicking site links, making them usable as bookmarks.
  - Usage Analysis: When there is only a single account, the charts and lists will prioritize displaying the site name (instead of the username), making the information more intuitive.
  - Shield Bypass Assistant: The temporary shield bypass window now supports CAP (cap.js) Pow verification, improving pass rates.
- **Bug Fixes:**
  - Redemption Assistant: Prioritizes reading redemption codes from the clipboard, improving trigger accuracy.
  - Toast Layer: Fixed Toaster z-index issues, preventing prompts from being obscured by web pages.

**Location Hints:**
- Site Links: In "Settings → Account Management", click the site name in the account list.
- Shield Bypass Assistant: Refer to [Cloudflare Shield Bypass Assistant](./cloudflare-helper.md).

## 3.9.0
- **New Features:**
  - Account Management: Added "Manual Balance (USD)" field to accounts. When a site cannot automatically fetch balance/quota, you can manually enter it for display and statistics.
  - Account Management: Added "Exclude from Total Balance" switch for accounts, used to remove specific accounts from "Total Balance" statistics (does not affect refresh/check-in functions).
  - Settings: Added "Automatically open changelog after update" switch (can disable the behavior of automatically opening this page after an update).
  - Settings: Added log settings to control whether console logs are output and the minimum log level, facilitating troubleshooting.
  - Automatic Check-in: After execution, relevant data will be refreshed and the interface will be synchronized.

**Location Hints:**
- Add/Edit Account: Open add/edit account in "Settings → Account Management".
- Changelog Switch, Log Settings: Configure in "Settings → General".

## 3.8.0
- **New Features:**
  - Usage Analysis: Added a "Usage Analysis" page to help you visualize usage trends across multiple sites and accounts in charts, allowing you to quickly see "where you're using more / spending more / slowing down," facilitating cost control, reconciliation, and troubleshooting.
  - Dashboard Content: Supports viewing daily overviews (request count, Tokens, quota), model distribution/spending distribution, account comparisons, usage time hotspots, as well as latency trends/histograms, etc.
  - Usage History Sync: Added "Usage History Sync" capability to fetch and save "aggregated usage data" (raw logs are not saved). Supports setting retention days, automatic sync methods, and minimum sync intervals, and viewing sync results and error prompts for each account in "Sync Status".
- **How to Use:**
  - First, go to "Settings → Account Usage", enable "Usage History Sync", set as needed, and click "Sync Now".
  - Then, view charts in "Usage Analysis" in the left menu; click "Export" when you need to retain data or reconcile.

## 3.7.0
- **New Features:**
  - Sorting: The account list now supports sorting by "Income." Priority sorting now includes "Disabled Accounts at Bottom," preventing inactive/invalid accounts from interfering with your daily use.
  - Automatic Check-in: Added "Trigger Today's Check-in Early When Opening Interface" - when opening the popup/sidebar/settings page within the time window, it will automatically attempt to run today's check-in early, without waiting for the scheduled time.
- **Bug Fixes:**
  - Automatic Check-in: Each account will only be checked in once per day. Retries are only for failed accounts, reducing meaningless requests and repeated disturbances.
- **Location Hints:**
  - Sorting Priority: Adjust in "Settings → Account Management".
  - Automatic Check-in Early Trigger/Retry: Configure in "Automatic Check-in" in the left menu.

## 3.6.0
- **New Features:**
  - Account Management: Supports enabling/disabling accounts with one click. Disabled accounts will be skipped by all functions, allowing you to retain data after an account becomes invalid.
  - Tags: Added global tag management and synchronized related interface and interaction optimizations for easier category management of accounts.
  - Popup: Displays the current version number in the title bar and provides a direct entry to this changelog.
  - Quick Export: CC Switch export now supports selecting upstream models, making exported configurations closer to actual usage scenarios.

## 3.5.2
- **Bug Fixes:**
  - Amount Display: Optimized the display strategy for extremely small values to avoid unexpected results due to precision/rounding.

## 3.5.1
- **New Features:**
  - Account Management: Adjusted the position of the "Auto Check-in" switch (moved above the custom check-in URL) for more intuitive configuration.
  - Interface: Removed the gradient background from dialog title icons for a cleaner, more unified visual appearance.
- **Bug Fixes:**
  - Key List: Fixed an issue where closing the dialog while expanding key details would cause a white screen.

## 3.5.0
- **New Features:**
  - Automatic Recognition: Added a "Slow Detection" prompt and related documentation links to help users troubleshoot and resolve issues.
  - Batch Open External Check-in: Supports opening all in new windows, making batch closing easier and reducing interference.
- **Bug Fixes:**
  - Batch Open External Check-in: The process has been refactored to execute in the background service, ensuring correct opening of all sites in pop-up scenarios.

## 3.4.0
- **New Features:**
  - CLIProxy: Enhanced model mapping configuration to directly select upstream models, facilitating more precise model mapping.
- **Bug Fixes:**
  - API: Ensured that access keys always have the `sk-` prefix, preventing recognition/copying issues due to inconsistent formats.

## 3.3.0
- **New Features:**
  - Automatic Check-in: Added "Username" information to account recognition, making it easier to distinguish accounts in multi-account scenarios.
  - External Check-in: Supports batch triggering of external check-ins, reducing the number of individual operations.
  - Auto Refresh: The minimum refresh interval no longer has a maximum limit, allowing larger minimum intervals to be set for controlling refresh frequency.
- **Bug Fixes:**
  - Clipboard Reading: Tightened trigger conditions to reduce accidental triggers in non-copying scenarios.
  - Redemption Assistant: Validates all redemption codes before displaying popup prompts, reducing invalid redemption notifications.
  - Storage: Write operations now include write locks to improve data consistency during concurrent writes.
  - Interface: Adjusted localization copy for "Copy Model Name".

## 3.2.0
- **New Features:**
  - The "Model List" page now includes an "Interface Availability Test" (Beta) for quickly confirming if the current key is usable with a specified model (e.g., text generation, tool/function calling, structured output (returning JSON structure), web search (Grounding), etc.).
  - The "Model List" page now includes a "CLI Tool Compatibility Test" (Beta) that simulates the tool calling process for Claude Code / Codex CLI / Gemini CLI to evaluate interface compatibility within these tools.
  - The "About" page now includes "Rate and Download": Automatically detects the current store source (Chrome / Edge / Firefox) and provides one-click rating and download entry points for other stores.
- **Bug Fixes:**
  - When site refresh encounters an HTTP error, the health status will now display the status code and error reason, facilitating problem localization.
  - In sidebar mode, the "Open in Sidebar" button is no longer displayed to avoid duplicate openings.

## 3.1.1
- **Bug Fixes:**
  - Expanded site access permissions (`host_permissions: <all_urls>`) to reduce Cookie acquisition failures due to insufficient permissions.

## 3.1.0
- **New Features:**
  - Added administrator credential filling guidance in self-managed API settings.
  - Redemption Assistant now supports batch redemption and single code retries.

## 3.0.0
- **New Features:**
  - Supports multiple cookie-authenticated accounts for a single site, allowing them to coexist normally with all functions available. This is mainly for sites like AnyRouter that only support cookie authentication.
  - Supports setting proxy, models, and model alias lists when exporting CLIProxyAPI.
  - Separated site check-in and custom check-in logic, so they no longer affect each other.
- **Bug Fixes:**
  - Fixed an issue with incorrect web path redirection for manual check-ins on New-API sites.

## 2.39.0
- Automatically detects and modifies the check-in support status of account sites during account data refresh.
- Automatically opens the changelog page and anchors to the corresponding version number upon version update.

## 2.38.0
- Supports drag-and-drop sorting for pinned accounts.
- Supports keyboard navigation for the Redemption Assistant:
  - Directly select specific redemption accounts using the up/down arrow keys.
  - Press Enter to confirm redemption.
- Added prompts to temporary shield bypass tabs, explaining that the tab originates from this plugin and its purpose.
- Improved shield bypass window display: single window with multiple tabs, meaning short-term requests will reuse the same window to minimize interference.
- Supports check-in status detection and automatic check-in for New-API site accounts.

## 2.37.0
- Optimized user experience for New-API channel management.
- Added more lenient detection options for redemption code formats, correctly identifying redemption codes with custom formats and popping up the Redemption Assistant.
- Fixed some known issues.

## 2.36.0
- Supports quick navigation to specific channels for management.
- Fixed an issue that would reset channel model sync times.

## 2.35.1
- Fixed an issue that would reset automatic check-in execution times.
- UI optimizations.

## 2.35.0
- Added optional clipboard read permission to prompt for redemption when copying any potential redemption code.
- Added cdk.linux.do to the default URL whitelist for the Redemption Assistant.

## 2.34.0
- **New Features:**
  - You can now customize the behavior when clicking the plugin icon, choosing to open the popup or the sidebar.
- **Bug Fixes:**
  - Fixed an internal error when comparing account IDs.
  - Ensured all temporary contexts are closed correctly.

## 2.33.0
- **New Features:**
  - Introduced "Temporary Context Mode" for more effective bypassing of website protections.
  - API error messages are now internationalized.
  - Optimized website type detection, which can now be identified by the title of temporary windows.
  - Added optional permission status tracking.
- **Bug Fixes:**
  - Added validation information for refresh interval settings.
  - Fixed development dependency issues.

## 2.32.0
- **New Features:**
  - Model redirects are now smarter, supporting version numbers represented by hyphens and dots.
  - Added the ability to redeem directly through the right-click menu after selecting text.
  - Automatic check-in is enabled by default, and the check-in time window has been extended.

## 2.31.0
- **New Features:**
  - Enhanced Cookie isolation for temporary windows, improving security.
  - Check-in operations can now be quickly performed within the popup.
  - The Redemption Assistant now includes a URL whitelist feature, giving you better control over which websites can use it.

## 2.30.0
- **New Features:**
  - Added check-in support for Wong sites.
  - Added check-in support for AnyRouter sites.
  - Optimized detection capabilities for Cloudflare challenge pages.
  - WebDAV backups now support encryption, and recovery includes a decryption retry popup. Your WebDAV configuration will be preserved.

## 2.29.0
- **New Features:**
  - Integrated Claude Code Router.
- **Bug Fixes:**
  - Fixed an issue with website cookie interception during automatic detection.
  - Optimized the centering of blank status content in Firefox.
  - Migrated the Switch component to a custom implementation for improved compatibility and stability.

## 2.28.0
- **New Features:**
  - Introduced the "Hosted Site" service, laying the groundwork for future site integrations.
  - Added support for Veloera sites.
  - Updated the term "New API" in settings to "Hosted Site" for clarity.
- **Bug Fixes:**
  - Optimized translation text and removed redundant fallback strings.

## 2.27.0
- **New Features:**
  - Account health status now includes more detailed codes to help you understand specific issues.
  - Temporary window bypass feature now includes a health status indicator.
  - Optimized the description of bypassing website protections for better clarity.
  - Added a notification system for temporary window bypass failures.
- **Bug Fixes:**
  - Ensured consistency in token selection strategy.
  - Fixed display issues with Firefox pop-up prompts in Chinese settings.
- **Performance Optimizations:**
  - Improved the performance of the sorting function.

## 2.26.0
- **New Features:**
  - Added a model pricing cache service to speed up data loading.
  - Added an account overview bar at the top of the model list for quick viewing.
  - Model pricing information for multiple accounts can now be displayed simultaneously.
  - Introduced new command and dialog UI components.
  - Added a searchable selection component to improve selection efficiency.
- **Bug Fixes:**
  - Added a customizable loading animation (spinner) property to the button component.

## 2.25.0
- **New Features:**
  - Added a new user guide card when the account list is empty.
  - When the pin/manual sort feature is disabled, related UI elements will be automatically hidden.
  - You can now manually drag and drop to sort the account list.
- **Bug Fixes:**
  - Fixed an issue where the tag array could be empty when updating an account.

## 2.24.0
- **New Features:**
  - Updated application description and about page content.
  - Extension name now includes a subtitle.
  - Tag filters now have visibility control based on line count.
  - WebDAV connection tests now support more success status codes.
- **Bug Fixes:**
  - Removed extraneous periods from the end of JSON strings.

## 2.23.0
- **New Features:**
  - Enhanced account tagging functionality.
  - Temporary window bypass feature now supports more intelligent judgment based on error codes.

## 2.22.0
- **New Features:**
  - Account management now includes a tagging feature for classifying accounts.
  - The Redemption Assistant popup UI now supports lazy loading and fixes issues that could cause website style conflicts.
  - Added global channel filters and JSON editing mode.

## 2.21.0
- **New Features:**
  - Integrated CLIProxyAPI and related settings.
- **Bug Fixes:**
  - Removed duplicate "Checked in Today" checks from automatic check-in.
  - Simplified and fixed the temporary window capture logic.
  - Restored parsing of search parameters in URL query strings.

## 2.20.0
- **New Features:**
  - Added permission guidance upon first installation for easier understanding of required permissions.
  - Cookie interceptor headers can now be controlled via optional permissions, improving cross-browser compatibility.
- **Bug Fixes:**
  - Fixed an issue with operation buttons overflowing in the account dialog.
  - Redemption amount conversion coefficients now use constants for improved accuracy.
  - Limited the Cookie interceptor to use only in Firefox browsers.

## 2.19.0
- **New Features:**
  - Added loading status and prompts during the redemption process.
  - Removed clipboard reading functionality from the Redemption Assistant.
- **Bug Fixes:**
  - Added missing backend error message translations.
  - Prevented concurrent initialization and race conditions in services for improved stability.
  - Resolved intermittent "Unable to establish connection" errors.
  - Prevented race conditions during the destruction of temporary window pools.

## 2.18.0
- **New Features:**
  - Added protection settings for the temporary window bypass feature.
  - Added documentation for the Redemption Assistant feature.
  - Firefox browsers now support WebRequest-based Cookie injection.
  - The redemption feature now supports themes and optimized prompt messages.
  - Redemption prompts now include source information and links to settings.
- **Bug Fixes:**
  - Fixed path issues with Tailwind CSS files.

## 2.17.0
- **New Features:**
  - Added an automatic pop-up prompt for one-click redemption.
  - Unified the data format for import/export and WebDAV backups using a V2 versioning scheme for improved compatibility and stability.

## 2.16.0
- **New Features:**
  - Added a warning prompt when creating accounts on Firefox desktop.
  - API model synchronization now supports a channel filtering system.

## 2.15.0
- **New Features:**
  - The MultiSelect component now supports parsing comma-separated strings.
- **Bug Fixes:**
  - Ensured caching only occurs during complete channel data synchronization.
- **Performance Optimizations:**
  - Optimized upstream model caching logic.

## 2.14.0
- **New Features:**
  - Site metadata is now automatically detected during refresh.
  - When automatic check-in fails, retry and manual check-in options are now available.
  - Enhanced automatic check-in functionality, including retry strategies, skip reasons, and account snapshots.
  - Optimized the execution method for automatic check-in to use concurrency for improved efficiency.
- **Bug Fixes:**
  - Fixed the default behavior issue with the `autoCheckInEnabled` flag.

## 2.13.0
- **New Features:**
  - Added "Self-Hosted Site Management" functionality.
  - Added a "Warning" button style.
  - Introduced Radix UI components and Tanstack Table for improved interface aesthetics and functionality.
- **Bug Fixes:**
  - Fixed incorrect display and sorting of model counts in the channel table.

## 2.12.1
- **Bug Fixes:**
  - Fixed unnecessary reloading of channels when manually selecting tabs.
  - The "New API Model Sync" option is now hidden in the sidebar when the configuration is invalid.

## 2.12.0
- **New Features:**
  - "New API Model Sync" now includes an allowlist filtering feature for models.
  - The sidebar now supports collapsing/expanding with smooth animations.

## 2.11.0
- **New Features:**
  - Account management functionality has been enhanced with search and navigation optimizations.
  - Added CC Switch export functionality.
- **Bug Fixes:**
  - Fixed logical errors in automatic check-in status.

## 2.10.0
- **New Features:**
  - Browser messages now support exponential backoff retry mechanisms for improved communication stability.
  - Model synchronization now includes a manual execution tab and supports channel selection.
- **Bug Fixes:**
  - Ensured that missing fields in user preferences are populated with default values.

## 2.9.0
- **New Features:**
  - Added Cloudflare challenge detection and automatic temporary window bypass attempts when encountering protection.
  - Introduced a temporary context management system.

## 2.8.1
- **Bug Fixes:**
  - Model names now support date suffix patterns like "month-day" and "month_day".
  - Optimized the positioning and accessibility of dropdown menus in multi-select components.

## 2.8.0
- **New Features:**
  - Added fault tolerance mechanisms for partial account updates.
  - Account information can now be saved even if data retrieval fails during manual account addition.
  - The settings page now includes a "Settings Section" feature, allowing settings to be reset by section.

## 2.7.1
- **Bug Fixes:**
  - Fixed an issue where redirected models were not appearing in the model list during API sync.

## 2.7.0
- **New Features:**
  - The account dialog can now dynamically update site data for new accounts.
- **Bug Fixes:**
  - Hidden the password visibility button in Edge/IE browsers.

## 2.6.1
- **Important Update (Internal):**
  - User preferences like `newApiModelSync`, `autoCheckin`, and `modelRedirect` are now mandatory to ensure completeness of default configurations.
- **Bug Fixes:**
  - Enhanced the robustness of configuration migration checks.
  - Fixed the issue of missing "New API Preferences" in configuration checks.
  - Corrected the sorting logic for check-in requirements.
  - Prevented unnecessary WebDAV configuration resets during configuration migration.

## 2.6.0
- **New Features:**
  - The user interface for "New API Channel Import" has been optimized, supporting key switching and batch model selection.
  - Model mapping now uses a multi-stage standardization process for improved accuracy.
- **Bug Fixes:**
  - Model name standardization is now consistent with the Veloera backend and preserves hyphens.
  - Resolved browser storage quota issues and improved model matching.

## 2.5.0
- **New Features:**
  - Added support for the Neo-API site type.
- **Bug Fixes:**
  - Fixed Base64 encoding issues when generating CherryStudio URLs.
  - Removed redundant account fetching and token verification from the channel dialog for improved efficiency.

## 2.4.1
- **Bug Fixes:**
  - Ensured that the settings page always opens in a new tab.

## 2.4.0
- **New Features:**
  - The auto-import feature now integrates the "New API Channel" dialog.
  - Added basic support for RIX_API.
  - The multi-select component now supports a collapsible selected area and optimized input experience.
- **Bug Fixes:**
  - Optimized the retry mechanism and added user feedback.
  - Optimized the performance of the multi-select component with a large number of selections.

## 2.3.0
- **New Features:**
  - Added account pinning and unpinning functionality, with pinned accounts prioritized in sorting.
- **Bug Fixes:**
  - Reduced the size of the pin icon and fixed configuration migration version issues.
  - Optimized sorting configuration by increasing the priority of the current site condition.

## 2.2.1
- **Bug Fixes:**
  - Removed the `isDetected` check for the auto-configuration button.
  - Ensured that the account detection correctly refreshes when displayed data changes.
  - Fixed an issue where Access Tokens were no longer required for Cookie authentication types.

## 2.2.0
- **New Features:**
  - The Automatic Check-in feature now includes a results/history interface and optimized default settings and user experience.
  - Implemented daily site automatic check-in, supporting time window settings and status display.
- **Bug Fixes:**
  - Fixed case sensitivity issues in automatic check-in status detection.
  - Handled edge cases in check-in time window calculations.

## 2.1.0
- **New Features:**
  - The account list now includes username search and highlighting functionality.
- **Bug Fixes:**
  - Added configuration validation warnings when API settings are missing.
  - "New API" functionality now includes configuration validation assistance and internationalized error messages.

## 2.0.0
- **New Features:**
  - The "New API Model Sync" filter bar now includes execution statistics.
  - Each row in the results table now includes a sync operation button.
  - Implemented the initial service, backend logic, and settings interface for "New API Model Sync".
- **Bug Fixes:**
  - Row retry operations now only update the target and progress UI.
  - Updated channel list response handling and types.

## 1.38.0
- **New Features:**
  - Accounts with custom check-in or redemption URLs set can now be pinned.
  - Added custom redemption and opening tab matching as sorting rules.
- **Bug Fixes:**
  - Ensured deep copying of default sorting rules.
  - New sorting conditions are disabled by default after migration.

## 1.37.0
- **New Features:**
  - Account search functionality has been enhanced to support multi-field composite searches across UI interfaces.
  - Added the "Open Sidebar" functionality.
- **Bug Fixes:**
  - Added translation for the "Clear" operation.

## 1.36.0
- **New Features:**
  - Accounts can now be configured with redemption page paths and support redirection.
  - After check-in, you can choose whether to automatically open the redemption page.
  - Supports opening both check-in and redemption pages simultaneously.
- **Bug Fixes:**
  - Updated API route paths for multiple sites.

## 1.35.0
- **New Features:**
  - The check-in icon has been updated to a "Yen" icon for better clarity.
- **Bug Fixes:**
  - Custom check-in accounts now have their check-in status reset daily.
  - Fixed the default value issue for the `isCheckedInToday` flag.

## 1.34.0
- **New Features:**
  - WebDAV now supports automatic synchronization of account data with a merge strategy.
- **Bug Fixes:**
  - Replaced `chrome.runtime` with `browser.runtime` for improved cross-browser compatibility and optimized error handling.

## 1.33.0
- **New Features:**
  - Introduced a reusable `AppLayout` component for improved interface consistency.

## 1.32.1
- **Bug Fixes:**
  - Fixed an issue with incorrect width of the right content container on small screens.

## 1.32.0
- **New Features:**
  - Improved the layout and responsiveness of the account management interface.
  - Added configurable React DevTools auto-plugin and caching.
- **Bug Fixes:**
  - Fixed the `z-index` issue of the mobile sidebar overlay.
  - Buttons, cards, and icons now support responsive resizing.

## 1.31.0
- **New Features:**
  - Added a "Create Account" button to account management and optimized the layout.
  - Added "Usage Logs" functionality to account management.
  - Sorting priority settings now support drag-and-drop auto-saving, removing the manual save button.
- **Bug Fixes:**
  - Updated the size and accessibility labels for SiteInfo icon buttons.

## 1.30.0
- **New Features:**
  - Replaced the dialog component with a custom `Modal` component for improved consistency.
  - Introduced a comprehensive set of UI components for enhanced interface aesthetics and development efficiency.
- **Bug Fixes:**
  - Corrected check-in logic and sorting priorities.
  - Optimized the transparency and layering of the mobile sidebar overlay for a better user experience.

## 1.29.0
- **New Features:**
  - Popups now support detection and automatic closing.
  - Popups now feature responsive mobile layouts to avoid the need for zooming on mobile devices.

## 1.28.0
- **New Features:**
  - Implemented cross-platform intelligent automatic detection functionality.
  - Migrated `chrome.*` APIs to `browser.*` APIs for enhanced cross-browser compatibility and optimized error handling.
  - Fully ensured functional compatibility and user interface design on mobile devices.
- **Bug Fixes:**
  - Fixed `tabId` parsing issues after window creation.
  - Prevented rotation animations on button borders during refresh.

## 1.27.0
- **New Features:**
  - After successful automatic configuration to New API, the account dialog will automatically close.
  - Implemented dynamic loading of localization resources for improved internationalization support.
- **Bug Fixes:**
  - Added internationalization support for error messages.
  - Fixed syntax errors in currency switching templates between Chinese and English.

## 1.26.0
- **Bug Fixes:**
  - Account error messages are now internationalized.
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
  - Fixed logic errors in CNY currency conversion.

## 1.23.1
- **Bug Fixes:**
  - Amount extraction now supports exchange rate conversion.

## 1.23.0
- **New Features:**
  - Added Chinese and English localization support.
  - Added language switching functionality and support for Suspense loading.
- **Bug Fixes:**
  - Completed internationalization of remaining hardcoded text.
  - Fixed the issue where a success message was still displayed when refreshing without any accounts.

## 1.22.0
- **New Features:**
  - Accounts now include a "Today's Total Income" field and an income display interface.
  - Supports redemption code recharge types.
- **Bug Fixes:**
  - Fixed rendering logic for custom URL check-in interfaces.
  - Corrected check-in field names and return structures.

## 1.21.0
- **New Features:**
  - Added favicon and extension icons for popup, settings, and sidebar pages.
  - Added keyboard shortcuts for sidebar and popup operations.
  - Migrated the underlying framework from Plasmo to WXT, offering better performance and development experience.

## 1.20.0
- **New Features:**
  - Balance and health status indicators now include a refresh function.
  - Operation button UI has been unified and optimized, supporting intelligent key handling.

## 1.19.0
- **New Features:**
  - All components now support dark mode.
  - Implemented a theme system supporting dark, light, and system-following modes.
- **Bug Fixes:**
  - API configuration interfaces now require the `authType` field.

## 1.18.0
- **New Features:**
  - Accounts now include a custom check-in button (with a Yen icon).
  - Implemented a versioned configuration migration system to ensure compatibility during updates.
  - Sorting functionality now includes custom check-in URLs as sorting conditions.
- **Bug Fixes:**
  - Fixed an issue where custom check-in URLs were not correctly passed to the handler.

## 1.17.0
- **New Features:**
  - Accounts now support selecting authentication types.
  - Added an "No Authentication" type to API authentication options.
  - Migrated the tooltip component to the `react-tooltip` library, resolving overflow display issues.

## 1.16.0
- **New Features:**
  - "New API" functionality now supports automatic account configuration.
  - Site accounts now support check-in functionality.
  - Implemented a customizable sorting priority system.

## 1.15.0
- **Bug Fixes:**
  - Fixed an issue where unnecessary updates and notifications were triggered even when values had not changed.

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
  - Fixed potential rendering issues when loading preferences.

## 1.12.0
- **New Features:**
  - Account sorting now includes health status priority.
  - Health status now includes more detailed reason information.

## 1.11.0
- **New Features:**
  - Refresh functionality has been enhanced to support detailed status tracking.
  - Added a minimum refresh interval to prevent frequent requests.

## 1.10.0
- **New Features:**
  - Key copying functionality now includes Cherry Studio integration.

## 1.9.0
- **New Features:**
  - Added OneHub token management and data retrieval functionality.
  - Added user group data transformation and API integration.
  - Implemented model retrieval functionality for OneHub sites.

## 1.8.0
- **New Features:**
  - Account management now supports site type.
  - Added site type detection and optimized the automatic detection process.
  - Implemented model pricing functionality for OneHub sites.

## 1.7.1
- **Bug Fixes:**
  - Fixed a logic error in using site status detection for check-in support.

## 1.7.0
- **New Features:**
  - Added check-in support detection and switching functionality.
  - Accounts now support check-in status.

## 1.6.0
- **New Features:**
  - Account management now supports a remarks field.

## 1.5.0
- **Performance Optimizations:**
  - Optimized the rendering method for the model list to improve loading performance.

## 1.4.1
- **Bug Fixes:**
  - Fixed an issue where the status of detected accounts was reset when no existing accounts were found.

## 1.4.0
- **New Features:**
  - Added a "Copy Model Name" function to the control panel.
  - Added support for Baidu and Yi model providers.

## 1.3.1
- **Bug Fixes:**
  - Updated the release PR workflow configuration.

## 1.3.0
- **New Features:**
  - Added WebDAV backup and synchronization functionality.

## 1.2.0
- **New Features:**
  - Added an account management page with full CRUD functionality.
  - Replaced custom dialogs in popups with direct function calls for simplified operations.

## 1.1.1
- **Bug Fixes:**
  - Fixed logic for handling missing system names and checks.

## 1.1.0
- **New Features:**
  - Added manual account addition support and optimized the UI flow.

## 1.0.0
- **New Features:**
  - Implemented detection and highlighting of the current site.
  - Added Firefox browser detection and a warning prompt when adding accounts.
  - Introduced sidebar functionality, replacing popup-based automatic site configuration.

## 0.0.3
- **New Features:**
  - Optimized the account recognition process, now supporting automatic access key creation.
  - The account list now includes sortable headers, a copy key dialog, and hover action buttons.
  - Account management now includes a remarks field.
  - Website names are now clickable for navigation.
  - Model lists support group selection.
  - Popup pages now feature digital rolling animations and site status indicators.
  - Optimized the add/edit account dialog, including recharge ratio settings and automatic site name extraction.
  - Fully implemented the settings page system, supporting persistent user preferences and automatic refresh.
  - Enhanced the frontend interface and backend service for automatic refresh functionality.
  - Added the `sk-` prefix automatically when copying keys.
  - Introduced industry-standard tab scrolling interaction experience.
  - Optimized dynamic updates and deletion of account health status.
  - Added support for more AI model vendors (e.g., OneHub, DoneHub, Super-API, VoAPI, etc.).
  - The popup interface has been refactored to an API manager style, with the addition of displaying today's total consumption amount.
  - Optimized overall scrolling layout and Tooltip animation effects.
- **Bug Fixes:**
  - Fixed issues with incompatible model data formats, `localStorage` access, and API request credentials.
  - Corrected API authentication methods.
  - Optimized URL input processing and auto-refresh configuration.
  - Added pagination logic for handling log data.
  - Fixed multiple UI and compatibility issues.

## 0.0.1
**Initial Release**
