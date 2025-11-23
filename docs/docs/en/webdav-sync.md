# WebDAV Backup and Automatic Synchronization

> Periodically back up accounts and preferences via a WebDAV server to enable multi-device sharing, version rollback, and disaster recovery.

## Feature Highlights

- **One-Click Backup/Restore**: After filling in WebDAV credentials on the "Import/Export" page, you can upload or download JSON backups at any time.
- **Automatic Synchronization**: `webdavAutoSyncService` supports scheduled background synchronization (default 1 hour), automatically merging or overwriting data based on the strategy.
- **Multi-Strategy Support**: Choose "Merge / Upload Only / Download Only" to meet differentiated needs for primary and secondary devices.
- **Conflict Merging**: In merge mode, accounts and preferences are de-duplicated by update time, maximizing the retention of newer data.

## Prerequisites

1. Prepare an accessible WebDAV server: e.g., Nextcloud, Nutstore, Alist WebDAV, NAS, etc.
2. Obtain `URL / Username / Password`, ensuring read/write permissions.
3. If automatic synchronization is required, it is recommended to keep the browser running in the background (desktop Chrome/Edge or mobile Kiwi).

## Configuration Entry

1. Open Extension → **Import/Export** → "WebDAV Settings".
2. Fill in:
   - **Server Address**: Can point to a directory or a specific JSON file; if a directory is entered, `all-api-hub-backup/all-api-hub-1-0.json` will be automatically created under it.
   - **Username/Password**: Used for Basic Auth.
3. Click **"Test Connection"** to verify the configuration, then you can perform "Upload Backup" or "Download Backup".

## Automatic Synchronization

Enable "Automatic Synchronization" on the same page for scheduled background synchronization:

| Option | Description |
|------|------|
| **Enable Automatic Sync** | Corresponds to the `webdav.autoSync` switch; when off, only manual backups are retained. |
| **Sync Interval** | In seconds, default 3600 seconds (1 hour). |
| **Sync Strategy** | `merge` (merge), `upload_only` (local overwrites remote), `download_only` (remote overwrites local). |
| **Sync Now** | Triggers `webdavAutoSync:syncNow` for debugging; if synchronization is in progress, it will prompt to try again later. |

### Scheduling Process

1. After the user saves settings, `webdavAutoSyncService.setupAutoSync()` will recreate the `setInterval` timer.
2. When synchronization is performed:
   - First call `testWebdavConnection` to confirm credentials are valid.
   - Download remote backup (if it doesn't exist, it's considered the first backup).
   - Export local accounts and preferences, determining the final data based on the strategy:
     - **Merge**: Retain the latest items based on `updated_at` / `lastUpdated` timestamps.
     - **Upload Only/Download Only**: Directly select local or remote data.
   - Write the merged result back to local (via `accountStorage.importData` + `userPreferences.importPreferences`).
   - Generate new JSON and upload it to `all-api-hub-backup/all-api-hub-1-0.json`.
3. Synchronization status (success/failure, last execution time) will be broadcast via the `WEBDAV_AUTO_SYNC_UPDATE` message, which can be monitored on the frontend or viewed in console logs.

## Security Recommendations

- It is recommended to create a separate sub-account or access token for the backup directory on the WebDAV server.
- Do not save WebDAV passwords on public devices, and change them regularly if necessary.
- If synchronization fails with a 401/403 error, please confirm that the server supports Basic Auth and allows `MKCOL/PUT/GET` methods.

## Common Issues

| Issue | Solution |
|------|----------|
| Test connection failed | Check if the URL includes the protocol (`https://`) and if remote writing is allowed. |
| Automatic synchronization unresponsive | Possibly due to the browser being put to sleep by the system or automatic synchronization not being enabled; reopen the extension and save settings. |
| Duplicate accounts after merging | Manually delete duplicates and re-upload; for strict control, use the "Upload Only" strategy. |
| JSON file too large | It is recommended to regularly clean up expired accounts or export in batches to avoid exceeding WebDAV limits. |

## Related Documents

- [Auto-Refresh and Real-time Data](./auto-refresh.md)
- [Auto-Check-in](./auto-checkin.md)
- [Cloudflare Bypass Helper](./cloudflare-helper.md)