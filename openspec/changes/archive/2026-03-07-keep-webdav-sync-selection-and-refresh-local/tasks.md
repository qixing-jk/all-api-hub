## 1. Preference metadata and local-only helpers

- [x] 1.1 Add `sharedPreferencesLastUpdated` to `UserPreferences` defaults and migration/back-compat handling in `src/services/preferences/userPreferences.ts` and related migration helpers
- [x] 1.2 Add a shared helper that classifies WebDAV-local preference fields (`accountAutoRefresh` and WebDAV-local settings including `webdav.syncData`) and can build a WebDAV-safe shared preference snapshot plus reapply local-only fields
- [x] 1.3 Update `savePreferences()` so local-only edits only bump `lastUpdated`, while shared or mixed edits also bump `sharedPreferencesLastUpdated`

## 2. WebDAV preference flow changes

- [x] 2.1 Update WebDAV upload/export paths to serialize the WebDAV-safe shared preference snapshot instead of raw exported preferences
- [x] 2.2 Update WebDAV download/import paths to restore the current device's local-only preference fields before saving imported preferences locally
- [x] 2.3 Update WebDAV auto-sync merge/download logic to compare `sharedPreferencesLastUpdated` for preference arbitration and preserve local `webdav.syncData` plus local refresh settings across merge results

## 3. Backup compatibility and regression handling

- [x] 3.1 Keep manual file import/export behavior unchanged for full preference restore, while preserving the new shared-preference metadata when present
- [x] 3.2 Ensure legacy stored preferences and older remote WebDAV backups initialize or tolerate missing `sharedPreferencesLastUpdated` without changing current local values
- [x] 3.3 Add/update any code comments or internal docs needed to make the WebDAV-only local-preference boundary explicit for future maintenance

## 4. Tests and validation

- [x] 4.1 Add or update unit tests for preference migration/defaulting and `savePreferences()` shared-vs-local timestamp behavior
- [x] 4.2 Add or update WebDAV sync tests for upload sanitization, restore preservation of local `webdav.syncData` and `accountAutoRefresh`, and merge arbitration based on shared preference recency
- [x] 4.3 Add or update import/export tests confirming manual file import can still restore refresh preferences while WebDAV-originated flows preserve device-local values
- [x] 4.4 Run the smallest relevant verification set for the changed preference/WebDAV modules, then run a broader scoped safety check (`pnpm compile` and the affected Vitest coverage)
