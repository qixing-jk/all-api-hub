## Why

WebDAV preference sync currently carries some per-device operational settings inside the shared `preferences` payload. As a result, changing WebDAV sync data selection or account data refresh behavior on one device can unexpectedly change another device's sync scope or refresh cadence, which is surprising and can cause unintended sync or refresh behavior.

## What Changes

- Treat `webdav.syncData` as a device-local setting even when `Preferences` participates in WebDAV backup/sync.
- Treat account data refresh settings as device-local settings, including auto-refresh enablement, refresh interval, minimum refresh interval, and refresh-on-open behavior.
- Ensure WebDAV preference sync continues to transfer shared preferences while preserving each device's local-only settings instead of overwriting them from remote data.
- Add migration/default-handling and validation coverage so existing users keep their current local values after upgrade and WebDAV sync flows remain predictable.

## Capabilities

### New Capabilities

- `device-local-preferences`: Certain operational preferences remain local to the current device during WebDAV preference sync/restore, starting with account data refresh settings.

### Modified Capabilities

- `webdav-selective-sync-data`: WebDAV sync data selection remains locally persisted per device and MUST NOT be synchronized through shared WebDAV preference payloads.

## Impact

- Preferences persistence/import logic in `src/services/preferences/userPreferences.ts` and related migration/default handling.
- WebDAV preference export/import/merge flows in `src/services/webdav/webdavSelectiveSync.ts` and `src/services/webdav/webdavAutoSyncService.ts`.
- Settings surfaces that read or save WebDAV sync selection and refresh preferences, especially the WebDAV and Refresh tabs.
- Tests covering WebDAV upload/download/merge behavior and preservation of local-only preference fields.
