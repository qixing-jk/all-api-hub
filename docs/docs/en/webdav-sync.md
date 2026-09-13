# Cloud Backup and Automatic Sync

The service, sync data scope, strategy, and automatic sync switch save automatically. The interval saves when you leave its field. Connection details and encryption passwords save when you leave the field, including empty values. Configuration completeness is checked when syncing.

> Choose WebDAV or GitHub Secret Gist to back up shared data regularly, synchronize devices, and recover from data loss.

## Highlights

- **Backup and restore**: Choose a provider on the **Import/Export** page, then upload or download a JSON backup.
- **Automatic sync**: Run background sync on a schedule (every hour by default), merging or replacing data according to your strategy.
- **Three strategies**: Merge, upload only, or download only, depending on each device's role.
- **Conflict merging**: Keep newer accounts, bookmarks, and preferences by update time. Account and bookmark deletions carry deletion markers so older backups do not restore them during the next merge.
- **WebDAV write verification**: Upload to a temporary file in the same directory, read it back, and move it to the final backup path. If Nutstore returns 409 when `MOVE` targets an existing file, the extension deletes the destination and retries the move.
- **GitHub Secret Gist**: Connect an existing Secret Gist with a GitHub token, or create a new unlisted Gist. Gist uploads always use encrypted backups.

## Prerequisites

1. Choose WebDAV (such as Nextcloud, Nutstore, Alist WebDAV, or a NAS) or GitHub Secret Gist.
2. For WebDAV, obtain a URL, username, and password with read/write access. For Gist, prepare a GitHub token and a backup encryption password.
3. Allow the browser to run in the background for automatic sync. Scheduled tasks cannot run normally while the browser is closed or the device is asleep.

## Setup

1. Open the extension → **Import/Export** → **Cloud Sync** settings.
2. Choose WebDAV or GitHub Secret Gist as the sync provider.
3. For WebDAV, enter:
   - **Server URL**: A directory or a specific JSON file. A directory URL uses `all-api-hub-backup/all-api-hub-1-0.json` beneath it.
   - **Username/password**: Credentials for Basic Auth.
4. Click **Test Connection**, then use **Upload Backup** or **Download Backup** as needed.

### GitHub Secret Gist

1. Create a GitHub personal access token. Prefer a fine-grained token with **Gists: Read and write**; a classic token needs the `gist` scope. See the [GitHub Gist API permissions](https://docs.github.com/en/rest/gists/gists). The token stays in the current browser and is excluded from backups.
2. Select **GitHub Secret Gist** and enter the token. For an existing Gist, enter its ID or `https://gist.github.com/...` link; leave this blank when creating one.
3. Set an encryption password and click **Upload to Secret Gist**. If the ID is empty, the extension automatically creates an unlisted Gist with `public: false`, stores encrypted content in `all-api-hub-backup.json`, and fills in the ID. Later uploads update the same Gist.
4. For an existing Gist, click **Test Connection** to check that it is a readable Secret Gist with a nonempty backup file. Import and sync also decrypt and validate the backup; a successful connection test alone does not guarantee that its content can be imported.

A Secret Gist is unlisted, not access-controlled. Protect the token, encryption password, and Gist link, and keep tokens out of screenshots or backup files. Manual JSON exports exclude the Gist token, ID/link, and encryption password. Configure Gist again on a new device. Existing WebDAV manual export behavior is unchanged.

## Automatic Sync

Enable **Automatic Sync** on the same page to schedule the selected provider:

| Option | Description |
|--------|-------------|
| **Enable automatic sync** | WebDAV and Gist share these settings; only the selected provider runs. Manual backups and Sync Now remain available when scheduling is disabled. |
| **Sync interval** | In seconds; defaults to 3600 (one hour). Minimum: 60 seconds for WebDAV, 300 seconds (five minutes) for Gist. |
| **Sync strategy** | Merge, upload only (replace remote data with local data), or download only (replace local data with remote data). Sync Now also uses the saved strategy. |
| **Sync Now** | Run one sync immediately. If another sync is running, wait and retry. Pending setting changes finish saving before the sync starts. |

### How Sync Runs

1. Saving settings updates the background schedule for the selected provider.
2. During a sync:
   - Test the provider connection and credentials.
   - Download the remote backup. A missing WebDAV backup can be initialized according to the strategy. Automatic Gist sync stops if its backup file is missing or empty; initialize it with a manual upload first.
   - Export local accounts and preferences, then apply the strategy:
     - **Merge**: Keep the latest entries by `updated_at` / `lastUpdated`. Merge account and bookmark deletion markers to prevent older copies from restoring deleted items. Account conflicts use whole-account last-write-wins (LWW), not field-by-field merging: a newer account replaces the older account together with its check-in configuration.
     - **Upload/download only**: Use the local or remote data, respectively.
   - Merge and download-only strategies write their results locally; merge and upload-only strategies upload the backup.
   - WebDAV verifies a temporary file before replacing the final file. Gist rereads and compares the remote revision before writing, then reads back the uploaded content for verification.
3. Check the settings page for success/failure status and the last execution time.

### Version Compatibility and Multi-device Upgrades

The current backup format is V4, and older V6 accounts have their check-in configuration upgraded to V7. V1–V3 backups remain importable. The previous V3 reader attempts to reject V4 backups to avoid overwriting data with an older structure; earlier clients that permissively parse unknown versions are not guaranteed safe.

Pause automatic sync, upgrade every device sharing the backup to a version supporting V7 accounts, then re-enable sync. V6 and V7 clients must not write to the same backup concurrently: whole-account LWW can let an older client replace V7 check-in configuration with a V6 account. Before downgrading, stop sync on other devices and keep a separate backup.

If the Gist revision changes before the write check, the extension reports a conflict and stops that upload; retry sync later. This is a best-effort check, not an atomic conditional write. Another device can still write after the check, so stagger sync times where possible.

## Automatic Check-in Across Devices

Accounts and preferences can sync through WebDAV or Gist, but **today's execution state, recent results, and browser alarms do not sync across devices**. Multiple devices with daily schedules can still check in twice. Enable scheduled check-in on only one device if you want to avoid this.

## Security Tips

- Use a dedicated WebDAV account or access token for the backup directory. Grant GitHub tokens only the required Gists permissions.
- Avoid saving WebDAV passwords on public devices; rotate them when necessary.
- For WebDAV 401/403 errors, check credentials and support for Basic Auth and `MKCOL/PUT/GET/MOVE/DELETE`.

## FAQ

| Problem | What to do |
|---------|------------|
| WebDAV connection test fails | Check that the URL includes a protocol (`https://`) and that remote writes are allowed. |
| Automatic sync does not run | Check that automatic sync is enabled, the service configuration is complete, and the browser is not suspended. Review errors in the sync status. |
| Duplicate accounts or bookmarks after merging | Delete duplicates and upload again; use upload-only mode if you need strict control. Deletion markers normally prevent older backups from restoring deleted accounts or bookmarks. |
| Remote backup reported corrupt before upload | The existing WebDAV backup is not valid JSON. If this device has complete data, follow the prompt to rebuild it from all shared data on this device. Otherwise, upload from a complete device or import a complete backup first. |
| Gist backup file missing or empty | Automatic sync and import stop; missing content is not treated as an empty backup that clears local data. If this device has complete data, manually upload and confirm replacement to initialize the existing Secret Gist. |
| Gist content corrupt or incompatible | Import or sync stops. Check `all-api-hub-backup.json` and the encryption password, repair the backup, and retry. Do not replace the remote backup with incomplete local data. |
| Gist returns 401/403/404 or a rate limit | For 401, check token expiry; for 403, check Gists permissions; for 404, check the Gist ID or whether it was deleted. For rate limits, wait until the indicated retry time. |
| Nutstore returns 409 on overwrite | Nutstore may reject `MOVE` with `Overwrite: T` when the destination exists. The extension deletes the destination and retries automatically. |
| JSON file too large | Remove obsolete accounts to stay within the provider's limits. Separate manual exports can be used for archiving, but automatic sync still uploads a complete backup of the selected data. |

## Related Documentation

- [Automatic Refresh and Real-time Data](./auto-refresh.md)
- [Automatic Check-in](./auto-checkin.md)
- [Cloudflare Helper](./cloudflare-helper.md)
