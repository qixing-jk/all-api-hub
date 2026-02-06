# Automatic Refresh and Real-time Data

> Keep account balances, usage, and model lists up-to-date without manually clicking "Refresh" every time. It provides a dual strategy of a background timer and instant refresh when the pop-up is opened.

## Feature Overview

- **Background Timer**: Driven by `autoRefreshService`, it periodically calls the account refresh interface in the browser background, supporting custom intervals from 60 seconds to several hours.
- **Refresh on Open**: An optional "Auto-refresh when plugin is opened" switch, suitable for scenarios where the background timer is off but data synchronization is still desired.
- **Minimum Interval Protection**: Independently set `minInterval` to prevent overly frequent duplicate requests for the same account in "non-forced refresh" scenarios.
- **Instant Refresh**: Execute "Refresh Now" at any time to immediately get the latest balance/quota for all sites.

## Prerequisites

1. At least one site account has been successfully added.
2. The browser must keep the extension running (mobile Kiwi/Firefox also works, but ensure the browser is not killed by the system).
3. If the site has Cloudflare protection, please refer to [Cloudflare Helper](./cloudflare-helper.md) to complete the verification first.

## Settings Entry

1. Open Plugin → **Settings**.
2. Select the **"Basic Settings → Automatic Refresh"** tab to enter the `RefreshSettings` panel.

## Key Configuration Items

| Option | Description |
|------|------|
| **Enable Auto-Refresh** | Controls the background timer switch; when off, only manual refresh is available. |
| **Refresh Interval (seconds)** | The timer's operating cycle, corresponding to `accountAutoRefresh.interval`. Inputting <60 seconds will trigger a warning. |
| **Auto-refresh when plugin is opened** | Triggers a refresh (non-forced) each time the pop-up is opened, affected by minimum interval protection. |
| **Minimum Refresh Interval (seconds)** | Minimum refresh interval protection for the same account in "non-forced refresh" scenarios; minimum 30 seconds. |
| **Restore Defaults** | Calls `resetAutoRefreshConfig()` to restore to the built-in default auto-refresh configuration. |

## How It Works

1. After the user saves the settings, `accountAutoRefresh` is written to local preferences via `UserPreferencesContext`.
2. The background page receives the `RuntimeActionIds.AutoRefreshUpdateSettings` (wire: `autoRefresh:updateSettings`) message and calls `autoRefreshService.setupAutoRefresh()`:
   - If the switch is off or the configuration is incomplete, the timer is stopped.
   - Otherwise, `setInterval` is created based on the interval, periodically executing `accountStorage.refreshAllAccounts(false)`.
3. Refresh results (success/failure) are broadcast to the frontend via the `AUTO_REFRESH_UPDATE` message; if the pop-up is not open, it is silently ignored.

## Recommended Strategies

- **High-Frequency Check**: For core accounts, an interval of 300-600 seconds is recommended to ensure timely balance alerts.
- **Low-Frequency + Refresh on Open**: If concerned about site rate limiting, the background timer can be turned off, keeping only "Refresh on Open".
- **Combine with Notifications**: Integrate with browser's own notifications or scripts, listening for `AUTO_REFRESH_UPDATE` for secondary development of reminders.

## Common Issues

| Issue | Solution |
|------|----------|
| Scheduled refresh not triggered | The browser might be put to sleep by the system; reopen the extension or manually click "Refresh Now"; try reducing the interval if necessary. |
| Frequent Cloudflare rate limiting | Appropriately increase the refresh interval and ensure that [Cloudflare Helper](./cloudflare-helper.md) can perform pop-up verification normally. |
| Refresh failed with 401/403 error | The login status has expired; revisit the corresponding site in the browser and refresh the plugin. |
| Multi-device conflicts | It is recommended to use [WebDAV Backup and Auto-Sync](./webdav-sync.md) to unify account data and avoid repeatedly refreshing the same site. |

## Related Documentation

- [Cloudflare Helper](./cloudflare-helper.md)
- [Auto Check-in](./auto-checkin.md)
- [WebDAV Backup and Auto-Sync](./webdav-sync.md)
- [Permission Management (Optional Permissions)](./permissions.md)