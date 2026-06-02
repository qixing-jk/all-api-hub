# Changelog

This page records major updates for general users (feature changes / experience optimizations / bug fixes). For complete historical versions and more detailed technical changes, please visit [GitHub Releases](https://github.com/qixing-jk/all-api-hub/releases).

::: tip For New Users
- **How to confirm your current version**: Open the extension popup; the version number will be displayed in the title bar. You can also check it on the settings page.
- **How to stop this page from opening automatically**: You can control whether to "Automatically open the changelog after updates" in "Settings → General → Changelog".
- **Troubleshooting**: You can enable console logs in "Settings → General → Logs" and report reproduction steps to [Issues](https://github.com/qixing-jk/all-api-hub/issues).
:::

## 3.43.0
- **Experience Optimizations:**
  - AIHubMix: After adding an account, it will first check if a token already exists. If a token exists, the default key creation prompt will no longer appear. If no token exists, it will still prompt to create one and display the one-time complete key. See [Account Management](./account-management.md).
  - Auto Detect: When identifying AIHubMix page addresses from the extension popup, the extension popup will no longer be closed due to temporary window minimization, making the detection process more stable. See [Auto Detect Troubleshooting Guide](./auto-detect.md).
- **Bug Fixes:**
  - AIHubMix: Compatible sites will no longer return original numeric IDs. Instead, text identifiers usable by the account will be used to save accounts. Processes such as adding, syncing, importing/exporting, duplicate detection, and pinning will no longer fail due to the lack of numeric IDs. See [Account Management](./account-management.md).
  - Account Management: Fixed an issue where adding `Cookie Authentication` accounts from incognito windows or Firefox container tabs might import cookies into the wrong browser environment.
  - Account Management: Fixed an issue where "Use Current Page" related filling might retain old titles / old addresses when quickly switching tabs, when no usable tabs are available, or when using non-web addresses.
  - AIHubMix: Fixed inconsistent duplicate account reminders and current site recognition issues between `aihubmix.com`, `www.aihubmix.com`, and `console.aihubmix.com`.
  - In-Page Extension Interface: Fixed an issue where the extension interface within the webpage still displayed Chinese after switching the extension language.
  - Cookie Authentication: When adding multiple accounts using Cookie Authentication on the same site, refresh, detection, and other operations will more accurately use the Cookie corresponding to the current account.
  - Model List: After creating a model compatible key, it will wait for the new key to appear in the site's response, reducing situations where it still prompts for a compatible key or cannot be copied/managed immediately after creation. See [Model List](./model-list.md).

**Location Hints:**
- AIHubMix Account Saving, Cookie Import, and Current Page Filling: View when adding an account under "Settings → Account Management".
- AIHubMix Default Key Prompt: View when adding an `AIHubMix` account and enabling "Automatically create default token after adding".
- Auto Detect Temporary Window: View when triggering auto-detection after entering a site from the extension popup.
- Model Compatible Key: View when creating or copying a key for a model under "Settings → Model List".

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