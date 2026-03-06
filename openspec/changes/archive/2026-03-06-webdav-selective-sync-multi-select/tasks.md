## 1. Data Model & Migration

- [x] 1.1 Extend `WebDAVSettings` with `syncData` (accounts/bookmarks/apiCredentialProfiles/preferences) and default all checked
- [x] 1.2 Add preferences migration step to initialize missing `webdav.syncData` to “all checked”
- [x] 1.3 Update preferences save APIs (`userPreferences.updateWebdavSettings` / related) to persist `syncData`

## 2. UI: WebDAV Sync Data Multi-Select

- [x] 2.1 Add multi-select checkbox UI for sync domains (Account/Bookmark/API credential/Preference) with all checked default
- [x] 2.2 Disable/guard sync actions when no domain is selected and show user-facing error copy
- [x] 2.3 Add i18n keys for the new UI strings (at least `src/locales/zh_CN/importExport.json`)

## 3. Manual WebDAV Upload / Download+Import

- [x] 3.1 Implement a helper that resolves effective selection (missing → all checked) and produces a filtered backup payload
- [x] 3.2 Update WebDAV “Upload backup” to update only selected domains while preserving unselected remote domains when a remote backup already exists
- [x] 3.3 Update WebDAV “Download+Import” to apply only selected domains and preserve unselected local domains
- [x] 3.4 Ensure Accounts vs Bookmarks independence (accounts-only preserves bookmarks; bookmarks-only preserves accounts)
- [x] 3.5 Add a selection-aware upload merge helper for whole-file WebDAV `PUT` semantics

## 4. Background Auto-Sync

- [x] 4.1 Read `webdav.syncData` in `WebdavAutoSyncService` and apply selection across strategies (merge/upload_only/download_only)
- [x] 4.2 Add presence-aware safeguards so missing remote sections do not wipe selected local data
- [x] 4.3 Ensure auto-sync upload updates only selected domains while preserving unselected remote domains

## 5. Tests & Validation

- [x] 5.1 Add unit tests for default selection (missing config → all checked)
- [x] 5.2 Add tests for export/import filtering (especially accounts vs bookmarks independence)
- [x] 5.3 Add tests for auto-sync behavior when remote payload omits a selected section (no wipe)
- [x] 5.4 Run `pnpm -s test` (or related/affected tests) and fix any regressions introduced by this change
- [x] 5.5 Add tests for settings-only / accounts-only uploads preserving unselected remote domains
- [x] 5.6 Add tests for preserved bookmark ordering metadata during accounts-only uploads
