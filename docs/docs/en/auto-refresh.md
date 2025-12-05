# Automatic Refresh and Real-time Data

> Keep account balances, usage, and model lists up-to-date without manual 'refresh' clicks. Provides a dual strategy of background timers and instant refresh upon popup opening.

## Feature Overview

-   **Background Timer**: Driven by `autoRefreshService`, it periodically calls the account refresh API in the browser background, supporting customizable intervals from 10 seconds to several hours.
-   **Refresh on Open**: An optional "Auto-refresh when opening the plugin" switch, suitable for scenarios where the background timer is off but data synchronization is still desired.
-   **Minimum Interval Protection**: Independently set `minInterval` to prevent overly frequent manual refreshes from triggering site risk control.
-   **Instant Refresh**: Execute "Refresh Now" at any time to immediately get the latest balance/quota for all sites.

## Prerequisites

1.  At least one site account has been successfully added.
2.  The browser must keep the extension running (Kiwi/Firefox on mobile also works, but ensure the browser is not killed by the system).
3.  If the site has Cloudflare protection, please refer to [Cloudflare Helper](./cloudflare-helper.md) to complete the verification first.

## Settings Entry

1.  Open Plugin → **Settings**.
2.  Select the **"Basic Settings → Auto Refresh"** tab to enter the `RefreshSettings` panel.

## Main Configuration Items

| Option | Description |
| :----- | :---------- |
| **Enable Auto Refresh** | Controls the background timer switch; only manual refresh remains when disabled. |
| **Refresh Interval (seconds)** | Timer cycle, corresponds to `accountAutoRefresh.interval`. Inputting <10 seconds will trigger a warning. |
| **Auto Refresh on Plugin Open** | Automatically executes `refreshNow()` once every time the browser icon is clicked to open the popup. |
| **Minimum Refresh Interval (seconds)** | Limits users from frequently clicking the "Refresh" button; default is 60 seconds. |
| **Restore Defaults** | Calls `resetAutoRefreshConfig()`, restoring to 360s/60s/enabled state. |

## How It Works

1.  After the user saves settings, `accountAutoRefresh` is written to local preferences via `UserPreferencesContext`.
2.  The background page receives the `updateAutoRefreshSettings` message and calls `autoRefreshService.setupAutoRefresh()`:
    -   If the switch is off or the configuration is incomplete, the timer is stopped.
    -   Otherwise, `setInterval` is created based on the interval, periodically executing `accountStorage.refreshAllAccounts(false)`.
3.  Refresh results (success/failure) are broadcast to the frontend via the `AUTO_REFRESH_UPDATE` message; if the popup is not open, it is silently ignored.

## Recommended Strategies

-   **High-Frequency Check**: For core accounts, it is recommended to set 300-600 seconds to ensure timely balance alerts.
-   **Low-Frequency + Refresh on Open**: If concerned about site rate limiting, the background timer can be turned off, keeping only "Refresh on Open".
-   **Combine with Notifications**: Combine with browser's own notifications or scripts, listen for `AUTO_REFRESH_UPDATE` for secondary development of reminders.

## Common Issues

| Issue | Solution |
| :---- | :------- |
| Scheduled refresh not triggered | The browser might be put to sleep by the system. Reopen the extension or manually click "Refresh Now"; try reducing the interval if necessary. |
| Frequent Cloudflare rate limiting | Appropriately increase the refresh interval and ensure that [Cloudflare Helper](./cloudflare-helper.md) can properly pop up for verification. |
| Refresh failed with 401/403 error | Login status has expired. Revisit the corresponding site in the browser and refresh the plugin. |
| Multi-device conflict | It is recommended to use [WebDAV Backup and Auto Sync](./webdav-sync.md) to unify account data and avoid repeatedly refreshing the same site. |

## Related Documentation

-   [Cloudflare Helper](./cloudflare-helper.md)
-   [Auto Check-in](./auto-checkin.md)
-   [WebDAV Backup and Auto Sync](./webdav-sync.md)
-   [Permission Management (Optional Permissions)](./permissions.md)