## Context

WebDAV selective sync and WebDAV auto-sync both reuse the shared `preferences` object from `userPreferences.exportPreferences()`. Today that object mixes truly shared preferences with per-device operational settings:

- `accountAutoRefresh` (`enabled`, `interval`, `minInterval`, `refreshOnOpen`)
- `webdav.syncData` (and, in current WebDAV restore flows, the broader `webdav` subtree is already preserved locally)

The current WebDAV path has three related behaviors that make these local-only settings leak across devices:

1. **Upload serializes the full preferences object** into the remote WebDAV payload.
2. **Download/import and auto-sync merge treat preferences as a single unit**, so `accountAutoRefresh` can be overwritten by remote data.
3. **Preference conflict resolution relies on `preferences.lastUpdated`**, but `savePreferences()` bumps that timestamp for every preference write, including local-only edits. A device-local change can therefore make an older remote shared-preference snapshot look "newer" and incorrectly win merge arbitration.

The project already preserves the current device's WebDAV config during WebDAV restore (`preserveWebdav: true`), which means the current problem is not just field overwrite. It is also that local-only changes still affect the shared WebDAV preference payload and its recency logic.

Key constraints:

- Keep manual Import/Export backup semantics unchanged unless explicitly required; this change is about WebDAV sync/restore behavior, not general backup portability.
- Preserve backward compatibility with existing stored preferences and remote WebDAV backups.
- Keep the implementation localized to preference persistence and WebDAV sync services rather than refactoring unrelated settings architecture.

## Goals / Non-Goals

**Goals:**

- Keep `webdav.syncData` device-local for WebDAV upload/download/auto-sync flows.
- Keep account data refresh settings (`accountAutoRefresh`) device-local for WebDAV upload/download/auto-sync flows.
- Prevent local-only preference edits from changing WebDAV preference merge arbitration.
- Preserve current behavior for manual JSON backup/import, including the ability to restore full preferences when the user explicitly imports a backup.
- Add migration/default behavior so older installs and older remote backups continue to work.

**Non-Goals:**

- Moving all device-local settings into a brand-new storage key in this change.
- Redesigning general preference synchronization beyond WebDAV flows.
- Changing unrelated preference merge rules or WebDAV account/bookmark/channel-config behavior.
- Retroactively cleaning every historic WebDAV backup file; new uploads should converge remote state naturally.

## Decisions

### 1) Introduce a dedicated "shared-preferences" timestamp for WebDAV flows

**Decision:** Add a persisted top-level metadata field to user preferences, e.g. `sharedPreferencesLastUpdated`, that tracks the last modification time of syncable/shared preferences only.

Behavior:

- `lastUpdated` continues to represent any local preference write.
- `sharedPreferencesLastUpdated` advances only when a preference update touches fields that are allowed to participate in WebDAV preference sync.
- Legacy preferences that do not have the field initialize it from the existing `lastUpdated` value during migration/default resolution.
- WebDAV merge logic compares `sharedPreferencesLastUpdated` instead of `lastUpdated` when deciding whether local or remote shared preferences are newer.

**Rationale:** preserving local-only fields during import is not sufficient. Without a dedicated shared timestamp, changing `webdav.syncData` or refresh settings on one device can still make stale remote shared preferences appear newer and overwrite another device's shared settings.

**Alternatives considered:**

- Preserve local-only fields only at import time → rejected because merge arbitration would still be based on `lastUpdated` and remain wrong.
- Compute recency by diffing the full shared-preference object on every merge without storing a timestamp → rejected because it complicates arbitration, does not preserve intent across manual backup/import, and makes behavior harder to reason about.

### 2) Define a canonical local-only preference projection for WebDAV flows

**Decision:** Centralize local-only preference handling in a small helper module used by preference persistence and WebDAV services.

Initial local-only scope:

- `accountAutoRefresh`
- the full `webdav` subtree for WebDAV-originated sync/restore purposes, which includes `webdav.syncData`

The helper should provide three responsibilities:

- `buildWebdavSharedPreferences(preferences)`: return a WebDAV-safe preference object with local-only fields removed/overwritten so the remote payload contains only shared settings plus sync metadata.
- `restoreLocalOnlyPreferences(imported, localCurrent)`: overlay the current device's local-only fields onto a remotely sourced preference object before saving locally.
- `patchTouchesSharedPreferences(patch)`: determine whether a partial preference update should advance `sharedPreferencesLastUpdated`.

**Rationale:** the repo already treats WebDAV configuration as device-local on restore; making the projection explicit keeps upload/import/merge behavior consistent and makes the local-only boundary testable.

**Alternatives considered:**

- Hard-code field stripping separately inside each WebDAV service → rejected because upload, import, and merge would drift.
- Introduce a new storage key immediately for local-only settings → rejected because it broadens migration and review scope beyond what is needed for this fix.

### 3) Sanitize preferences before any WebDAV upload writes remote state

**Decision:** Before building WebDAV upload payloads, convert the exported preferences snapshot to its WebDAV-shared form.

Affected call sites include:

- manual WebDAV upload from `WebDAVSettings.tsx`
- auto-sync upload payload construction in `webdavAutoSyncService.ts`
- any shared helper path that builds selective WebDAV payloads from a full backup object

This means newly uploaded WebDAV backups will stop carrying `accountAutoRefresh` and WebDAV-local settings, while leaving manual JSON export behavior unchanged.

**Rationale:** if we only preserve local-only fields on import, the remote payload still stores misleading device-local values and older clients/newer merges continue to see noisy preference blobs. Sanitizing upload fixes the data at the source.

**Alternatives considered:**

- Keep local-only fields in the remote payload but ignore them on restore → rejected because the remote file remains confusing and legacy timestamps still need special handling anyway.

### 4) Reapply local-only fields on all WebDAV restore/merge paths before saving preferences locally

**Decision:** Any WebDAV flow that derives `preferencesToSave` from remote data must restore the current device's local-only fields before calling `userPreferences.importPreferences(...)`.

Affected paths:

- selective WebDAV download/import (`buildWebdavImportPayloadBySelection` / `importFromBackupObject(..., { preserveWebdav: true })`)
- WebDAV auto-sync `download_only`
- WebDAV auto-sync `merge`

The saved preference object should therefore be:

- shared fields from the winning/imported remote/local preference source
- local-only fields from the current device snapshot
- `sharedPreferencesLastUpdated` taken from the shared source that won arbitration
- `lastUpdated` refreshed locally when the save occurs

**Rationale:** this keeps WebDAV sync selection and refresh behavior stable on each device while still allowing shared preferences to move through WebDAV.

**Alternatives considered:**

- Extend `importPreferences()` with many narrow boolean preservation flags per field group → rejected because the field boundary should live in one canonical local-only projection, not in scattered call-site option combinations.

### 5) Keep manual JSON backup/import semantics unchanged

**Decision:** Do not change `features/ImportExport` or `importExportService` semantics for ordinary file export/import beyond preserving the new `sharedPreferencesLastUpdated` metadata when present.

Implications:

- Manual JSON export still contains the full preference object.
- Manual JSON import may still restore refresh settings and WebDAV settings, consistent with explicit user intent when restoring a backup file.
- Only WebDAV-originated upload/download/auto-sync flows apply the local-only projection.

**Rationale:** the user request is about cross-device sync side effects, not about removing fields from explicit backups.

## Risks / Trade-offs

- **[A local-only path list becomes incomplete]** → Mitigation: centralize the projection helper and add focused tests; future device-local settings can extend the same helper without rewriting WebDAV logic.
- **[Legacy remote backups still contain old local-only fields]** → Mitigation: ignore/reapply those fields locally on import and let future uploads rewrite the remote payload into the sanitized shape.
- **[Timestamp migration changes merge outcomes once]** → Mitigation: initialize `sharedPreferencesLastUpdated` from legacy `lastUpdated` so existing users retain a reasonable ordering baseline.
- **[Manual backup/import and WebDAV restore now differ intentionally]** → Mitigation: document this difference in code comments/tests and keep the behavior boundary explicit: WebDAV sync is per-device-aware; manual restore is user-directed.
- **[Partial update classification is wrong]** → Mitigation: keep `patchTouchesSharedPreferences()` path-based and test mixed patches (shared-only, local-only, and combined updates).

## Migration Plan

1. Extend `UserPreferences` defaults/migration logic with `sharedPreferencesLastUpdated`, defaulting legacy values from `lastUpdated`.
2. Add the local-only projection helpers near preference persistence/WebDAV sync code.
3. Update `savePreferences()` so local-only patches advance only `lastUpdated`, while shared or mixed patches also advance `sharedPreferencesLastUpdated`.
4. Update WebDAV upload code paths to serialize `buildWebdavSharedPreferences(...)` instead of the raw exported preferences object.
5. Update WebDAV import/merge paths to overlay local-only fields from the current device before saving imported preferences.
6. Update WebDAV merge arbitration to compare `sharedPreferencesLastUpdated` rather than `lastUpdated`.
7. Add tests for migration, upload sanitization, restore preservation, and timestamp arbitration.

Rollback is safe: if the change is reverted, the extension falls back to current all-in-one preference sync behavior. The added metadata field is harmless if left in stored preferences or remote backups.

## Open Questions

- Should additional per-device operational settings join the local-only projection in a follow-up change? For this change, the scope stays limited to `accountAutoRefresh` and WebDAV-local settings.
