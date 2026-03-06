## Context

All API Hub currently uses a single WebDAV JSON backup file (V2, `BACKUP_VERSION = "2.0"`) for:

- Manual upload/download in `src/features/ImportExport/components/WebDAVSettings.tsx`
- Background auto-sync in `src/services/webdav/webdavAutoSyncService.ts`

The payload is effectively a “full backup” containing:

- Accounts storage config (includes **accounts + bookmarks + pinned/ordered ids**)
- User preferences
- API credential profiles (contains secrets)
- (Plus supporting data like tag store + channel configs)

There is no user control over which data domains are synced. The change requires a **multi-select** for users to choose which domains participate in WebDAV sync, covering:

- Account
- Bookmark
- API credential
- Preference

All options must default to **checked** (preserve current “sync everything” behavior unless the user opts out).

## Goals / Non-Goals

**Goals:**

- Add a persisted WebDAV “sync data selection” (multi-select) with defaults **all checked**.
- Apply the selection consistently to:
  - Manual WebDAV upload/download+import
  - Background WebDAV auto-sync (merge / upload-only / download-only)
- Allow **Account** and **Bookmark** to be selected independently, even though both live in `AccountStorageConfig`.
- Prevent accidental data loss when a remote backup does not contain a selected section (treat “missing” differently from “empty”).

**Non-Goals:**

- Redesign the backup version/schema (stay compatible with V2 import/normalize behavior).
- Introduce multiple WebDAV files per section.
- Add user-facing toggles for other backup sections (e.g. `channelConfigs`, `tagStore`) in this iteration.
- Change encryption semantics (selection only affects what is included in the plaintext JSON before optional envelope encryption).

## Decisions

1. **Represent selection as a stable boolean map in `WebDAVSettings`.**
   - Add `webdav.syncData` (name TBD) with boolean keys:
     - `accounts`
     - `bookmarks`
     - `apiCredentialProfiles`
     - `preferences`
   - Default is all `true`.
   - **Why**: simpler migrations + forward compatible (new keys can be added without breaking older stored arrays).
   - **Alternative**: string-array of selected keys. Rejected due to weaker defaulting and higher typo risk.

2. **Persist selection alongside WebDAV config (inside `prefs.webdav`).**
   - Stored under `webdav` so it is treated as part of the WebDAV sync configuration and naturally preserved by existing `preserveWebdav` import policy.
   - **Trade-off**: selection becomes “per device” for WebDAV-based restores/sync (because WebDAV restores preserve local `webdav` settings). This matches “don’t accidentally change my sync behavior/device config”.
   - **Alternative**: store outside `webdav` so it syncs across devices. Rejected for now to avoid surprising propagation when users import/sync preferences.

3. **Keep a single backup file, but merge selected local domains into the current remote backup before upload.**
   - Because WebDAV upload is a whole-file `PUT`, the final uploaded backup should preserve unselected remote domains whenever a remote backup already exists.
   - The upload composition rules are:
     - If `accounts` and/or `bookmarks` are selected → replace only the selected subfields in the `accounts` object and preserve the unselected subfields from remote.
     - If `preferences` is selected → replace `preferences`; otherwise preserve remote `preferences` when present.
     - If `apiCredentialProfiles` is selected → replace `apiCredentialProfiles`; otherwise preserve remote `apiCredentialProfiles` when present.
     - If no remote backup exists yet → unselected domains may be omitted from the initial payload.
   - Supporting data:
     - Include/update `tagStore` whenever any taggable domain is selected (`accounts`/`bookmarks`/`apiCredentialProfiles`) so tags can resolve; otherwise preserve remote `tagStore` when present.
     - Keep `channelConfigs` behavior unchanged (always included) for compatibility in this tweak; reconsider later if needed.
   - **Alternative**: multiple files per section. Rejected due to server variance, migration complexity, and higher failure surface.

4. **Apply selection via a WebDAV-specific filter layer, not by changing generic import/export semantics.**
   - Introduce a small, explicit “selective sync” helper that:
     - Computes effective selection (missing → all checked)
     - Builds a selected-domain upload view and, when needed, merges it with the current remote backup before upload
     - Applies **import**/merge only to selected domains while preserving unselected local data
   - **Why**: avoids changing `importFromBackupObject()` behavior for all file imports, and lets us handle the accounts/bookmarks split cleanly.

5. **Presence-aware handling to avoid wiping on missing sections.**
   - When reading remote data, determine presence flags from the raw JSON shape:
     - `hasAccountsSection` (`"accounts" in remote`)
     - `hasBookmarksField` (`"accounts" in remote && "bookmarks" in remote.accounts`)
     - `hasPreferencesSection`, `hasApiCredentialProfilesSection`, etc.
   - In `download_only` / `upload_only` strategies, choose per-domain winner:
     - If selected and remote section is **missing** → keep local for that domain.
     - If selected and remote section is present (even if empty) → apply strategy.
   - **Why**: remote “missing” should mean “not provided by selection/older writer”, not “delete everything”.

## Risks / Trade-offs

- **[Cross-version WebDAV file compatibility]** Older extension versions (without selective sync) may treat an omitted section as empty and could overwrite local state during auto-sync.
  - **Mitigation**: document “mixed versions across devices” risk; consider bumping WebDAV default filename version when selection != all-checked so older clients keep using the old file.
- **[Accounts vs Bookmarks coupling]** `AccountStorageConfig` couples accounts, bookmarks, and pinned/ordered ids.
  - **Mitigation**: filter pinned/ordered ids to included entry ids; when only one of accounts/bookmarks is selected, preserve the unselected local portion and its ordering.
- **[Secrets handling]** API credential profiles contain secrets; partial uploads may still leave historical secrets on the server if previously uploaded.
  - **Mitigation**: preserving unselected remote domains means deselecting `apiCredentialProfiles` will not purge historical secrets from the existing remote file; document this behavior and, if secure deletion is required, require an explicit overwrite/delete flow rather than relying on deselection.
- **[User confusion]** “Preference” includes many settings; WebDAV credentials are part of preferences but are preserved during WebDAV restore flows.
  - **Mitigation**: UI copy should clarify what is synced and that WebDAV connection settings are not restored from WebDAV backups (existing `preserveWebdav` behavior).

## Migration Plan

1. **Data model**
   - Extend `src/types/webdav.ts` (`WebDAVSettings`) to include `syncData` (boolean map).
   - Update `DEFAULT_WEBDAV_SETTINGS` to default all keys to `true`.
2. **Preferences migration**
   - Add a preferences schema migration step (bump `CURRENT_PREFERENCES_VERSION`) that initializes `webdav.syncData` when missing.
   - Ensure older stored preferences load with all-checked effective selection.
3. **UI**
   - Add a “Sync data” multi-select (checkbox list) to WebDAV settings UI (and/or auto-sync UI) backed by `prefs.webdav.syncData`.
   - Default checkboxes to checked for existing users.
4. **Manual WebDAV upload/download**
   - On upload: build a selection-aware upload payload, merge it with the existing remote backup when present, then call `uploadBackup`.
   - On download/import: apply only selected domains (preserving unselected local domains).
5. **Auto-sync**
   - Update `WebdavAutoSyncService.syncWithWebdav()` to merge/apply/upload only selected domains, with presence-aware safeguards for missing remote sections.
6. **Rollback**
   - If the feature is reverted, the new `webdav.syncData` field is ignored; however, partial backups written to WebDAV may still exist. Avoid strategies that interpret missing sections as “delete”.

## Open Questions

- Should `channelConfigs` become selectable too, or is it intentionally always synced?
- Should “Account” implicitly include bookmarks (and remove the separate Bookmark checkbox), or do we truly need independent toggles as requested?
- Should we prevent the user from unchecking all options (no-op sync), or allow it with a warning?
- Do we need to version the WebDAV filename when selection != all-checked to reduce cross-version risk?
