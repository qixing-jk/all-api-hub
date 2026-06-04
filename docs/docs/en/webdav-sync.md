# WebDAV Backup and Automatic Synchronization

> Periodically back up accounts and preferences via a WebDAV server to enable multi-device sharing, version rollback, and disaster recovery.

## Feature Highlights

- **One-Click Backup/Restore**: After filling in WebDAV credentials on the "Import/Export" page, you can upload or download JSON backups at any time.
- **Automatic Synchronization**: Background scheduled synchronization (default 1 hour), automatically merging or overwriting data based on the strategy.
- **Multi-Strategy Support**: Choose "Merge / Upload Only / Download Only" to meet differentiated needs for primary and secondary devices.
- **Conflict Merging**: In merge mode, retain the newer accounts, bookmarks, and preferences by update time; when deleting accounts or bookmarks, a deletion marker is recorded to prevent old backups from reintroducing them after the next sync.
- **Secure Writing**: When uploading backups, a temporary file in the same directory is written first. After verification, it is moved to the official backup file, reducing the risk of remote backup corruption due to upload interruptions. If Nutstore returns 409 for `MOVE` when the target file already exists, the extension will delete the official backup first and then retry the move.

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
     - **Merge**: Retain the latest items based on `updated_at` / `lastUpdated` timestamps; deletion markers for accounts and bookmarks will participate in the merge during synchronization, preventing deleted items from being restored by old remote copies.
     - **Upload Only/Download Only**: Directly select local or remote data.
   - Write the merged result back to local (via `accountStorage.importData` + `userPreferences.importPreferences`).
   - Generate new JSON, upload it to a temporary file in the same directory, verify the content after reading it back, and then move it to the configured backup file; the default path `all-api-hub-backup/all-api-hub-1-0.json` is used only when the WebDAV target is a directory URL. Old temporary files older than 24 hours will be cleaned up as much as possible during subsequent uploads.
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
| Duplicate accounts or bookmarks after merging | Manually delete duplicates and re-upload; for strict control, use the "Upload Only" strategy. Deleted accounts and bookmarks participate in subsequent merges via deletion markers and are typically not restored by old backups. |
| Remote backup corrupted prompt before upload | Indicates that the existing WebDAV backup is not a valid JSON. After confirming the data on this device is complete, you can rebuild the remote backup with all shared data from the current device as prompted; if the data on this device is incomplete, please upload or import a complete backup from a device with complete data first. |
| Nutstore returns 409 during overwrite upload | Nutstore may return 409 for `MOVE` with `Overwrite: T` when the official backup file already exists. The extension will automatically delete the target file and retry the move, usually requiring no manual intervention. |
| JSON file too large | It is recommended to regularly clean up expired accounts or export in batches to avoid exceeding WebDAV limits. |

## Related Documents

- [Auto-Refresh and Real-time Data](./auto-refresh.md)
- [Auto-Check-in](./auto-checkin.md)
- [Cloudflare Bypass Helper](./cloudflare-helper.md)