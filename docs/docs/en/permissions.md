# Permission Management (Optional Permissions)

Use Permission Management to view, grant, and revoke optional extension permissions. Enable the permissions needed for account refresh, assistive tools, system notifications, or bookmark imports. Without a permission, its related feature may be limited while other features remain available.

## Accessing Settings

Open **Settings → Permissions** in the extension to see the permissions available in your browser and their current status. Supported permissions vary by browser; use the list shown on the page as your guide.

## When to Grant Permissions

| Permission | Purpose and use |
| --- | --- |
| Cookie access | Read the cookies needed for the relevant site when checking sign-in status or refreshing an account. |
| Network request rules, access, or modification | Supply the current account's request information during temporary-page verification and account refresh. Chrome, Edge, and Firefox use different permission names. |
| Clipboard Read | Recognize redemption codes or API details in content you copy for Redemption Assist or AI API Test. |
| System notifications | Send browser notifications for background task results and other configured events. Select the events in notification settings as well. |
| Browser bookmarks | Read saved URLs when importing sites from bookmarks. |

Leave a permission disabled if you do not use its feature. For verification or refresh problems, check the permissions requested by the feature; ordinary refresh does not require enabling every permission. See [Cloudflare Shield Bypass Helper](./cloudflare-helper.md) for website verification settings.

## Granting, Revoking, and Refreshing Status

1. Find the permission you need and click **Allow (recommended)**.
2. If the browser shows a confirmation dialog, confirm it and check that the page shows **Granted**. Some permissions do not show a dialog; use the status on the page to confirm the result.
3. Click **Revoke** when you no longer need the permission. You may need to grant it again when using the related feature.

Wait for status loading to finish while the page shows **Checking…**. If you change permissions in browser settings, click **Refresh status** to read them again.

## Data Storage and Privacy

Account and site settings are stored locally in your browser by default. The extension uses built-in local storage permissions, including `unlimitedStorage`, to save settings and history. These do not need to be enabled separately on the permissions page. The unlimited storage permission itself produces no permission warning.

Usage and balance histories are retained for the number of days you choose in their settings, then cleaned up automatically. Other histories and caches have their own cleanup rules. Available storage still depends on free space on your device. For backups, see [WebDAV Backup and Automatic Synchronization](./webdav-sync.md).

Granting an optional permission does not enable its related feature by itself. The extension accesses data according to the features and settings you use. Balance refresh, site API requests, backup and sync, and anonymous product analytics make their corresponding network requests.

## Troubleshooting

- **No dialog appears after clicking Allow:** Check whether the status already shows Granted. If it does not, look for browser permission prompts and retry when you need the feature.
- **A permission is unavailable or missing:** Check whether your browser supports it, then try refreshing the status.
- **Verification or refresh still fails after granting permissions:** Also check website verification settings, site sign-in status, and your network connection. See [Cloudflare Shield Bypass Helper](./cloudflare-helper.md).

## Related Documentation

- [Cloudflare Shield Bypass Helper](./cloudflare-helper.md)
- [Automatic Refresh and Real-time Data](./auto-refresh.md)
- [WebDAV Backup and Automatic Synchronization](./webdav-sync.md)
