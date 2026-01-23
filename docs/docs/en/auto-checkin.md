# Automatic Check-in and Check-in Monitoring

> Allows aggregated accounts that support check-in to check in on time daily, accumulate quota, and synchronize check-in logs, preventing manual oversight.

## Feature Overview

- **Site Detection**: Automatically determines if the site has a check-in entry when identifying the account. "Check-in Detection" can be enabled/disabled in the account details.
- **Custom Check-in Entry**: For customized sites, you can configure `customCheckInUrl` and `customRedeemUrl`, and also decide whether to open the recharge page simultaneously.
- **Automatic Check-in Scheduler**: `autoCheckinScheduler` uses `chrome.alarms` to perform the standard automatic check-in **once daily**, and uses a separate alarm to retry **accounts that failed that day** (this will not affect the next daily schedule).
- **Execution Log**: Each run generates a log, including success/failure reasons, last run time, next daily schedule, and (if applicable) next retry schedule. This can be viewed on the "Automatic Check-in" page.

## Prerequisites

1. Enable "Check-in Detection" in **Account Management → Edit Account** and ensure manual check-in is successful.
2. Check the "Automatic Check-in" switch for accounts that require automatic check-in (enabled by default, can be disabled for individual accounts).
3. Enable global automatic check-in in **Settings → Automatic Check-in** and set the time window.
4. The browser must support `chrome.alarms` (Chrome, Edge, and Kiwi browsers work normally; some Firefox mobile versions may not be supported).

## Setup Steps

### 1. Account-Level Switch

- Open any account details → "More Settings".
- After enabling "Check-in Detection," you can configure:
  - Custom Check-in URL (if the site's default entry is unavailable).
  - Custom Redeem URL and "Open recharge page during check-in."
  - "Automatic Check-in" switch (if disabled, the account will not participate in automatic check-in even if globally enabled).

### 2. Global Time Window

In the **Settings → Automatic Check-in** panel:

| Option | Description |
|------|------|
| **Enable Automatic Check-in** | Controls the global `globalEnabled`. No alarms will be created when disabled. |
| **Trigger Today's Check-in Early When Opening the Interface** | Enabled by default. When opening the popup / sidebar / settings page, if today's daily schedule has not yet run and the current time is within the window, a "Daily Run" will be triggered early. Upon completion, a result summary dialog will pop up, offering "View Details" to jump to the "Automatic Check-in" page. |
| **Time Window Start / End** | 24-hour format, allowing overnight periods (e.g., 22:00 → 06:00). The scheduler will randomly select a time within this range to run. |
| **View Execution Log** | Quick jump to the "Automatic Check-in" page to view status and logs. |
| **Restore Defaults** | Calls `resetAutoCheckinConfig()`, restoring the configuration to 09:00–18:00 and disabled status. |

### 3. Viewing Execution Status

- Open the **Extension Sidebar → Automatic Check-in** page to view:
  - Recent execution result (Success / Partial Success / Failure).
  - Next daily scheduled time `nextDailyScheduledAt`.
  - (If applicable) Next retry scheduled time `nextRetryScheduledAt`.
  - Account-level logs (time taken, failure reason, etc.).
- You can click "Run Now" to manually trigger an `autoCheckin:runNow` event for debugging.

## How It Works

1. **Configuration Writing**: `UserPreferencesContext` saves the `autoCheckin` configuration to local preferences and notifies the background via `sendRuntimeMessage`.
2. **Scheduler Initialization**: `autoCheckinScheduler.initialize()` creates alarm listeners when the extension starts:
   - **Daily Alarm**: Standard automatic check-in (maximum once per day).
   - **Retry Alarm**: Triggered only if there were failed accounts during the standard run that day (only retries failed accounts).
3. **Execution Flow**:
   - Reads accounts and builds a snapshot (accounts with detection enabled will appear in the "Account Detection Status").
   - Filters eligible accounts (detection enabled, automatic check-in allowed, provider exists and is available).
   - **Does not use** `checkIn.siteStatus.isCheckedInToday` to determine execution (this field is unreliable); the provider's return of `already_checked` is used as the true source for "already checked in."
   - Concurrently calls the corresponding provider (currently built-in Veloera, extensible) and records success/failure information.
   - Success or `already_checked` results are written via `accountStorage.markAccountAsSiteCheckedIn()`; failures are logged and enter the day's retry queue (if retries are enabled).
   - Finally, data is written to `autoCheckinStorage` for the frontend page to display the status and retry information for each account.
4. **Rescheduling**:
   - After the standard daily run completes, the daily alarm is rescheduled for the **next day** (ensuring a maximum of one run per day).
   - If failed accounts exist that day and retries are enabled, a retry alarm is scheduled, and the number of attempts for that day is recorded per account (stops retrying after reaching `maxAttemptsPerDay`).

## Best Practices

- **Time Window Recommendation**: Set the window for the early morning or during the site's off-peak hours (e.g., 02:00-05:00) to increase the success rate.
- **Cross-Device Synchronization**: Use [WebDAV Backup and Automatic Synchronization](./webdav-sync.md) to ensure multiple devices share the same account and check-in settings, preventing duplicate check-ins.
- **Anomaly Notification**: Notifications are not currently built-in; you can monitor the background page's `autoCheckinStorage` or check the "Automatic Check-in" page to find failure records.

## FAQ

| Issue | Troubleshooting Method |
|------|----------|
| Page shows "Not Scheduled / Disabled / No Pending Retries" | "Disabled": Global automatic check-in switch is off.<br/>"Retry Not Enabled": Retry policy is not enabled.<br/>"No Pending Retries": Retry is enabled but there are currently no failed accounts.<br/>"Not Scheduled": Enabled but the browser does not support `chrome.alarms` or the alarm has not been created/cleared; try saving the settings again or switching to Chrome/Edge. |
| A certain account fails daily | Check if the site supports the automatic check-in provider; if necessary, disable automatic check-in for that account and perform it manually. |
| Custom URL is invalid | Confirm that the URL can be accessed directly in the browser and results in a successful check-in; some sites require extra form data, and currently, only GET/simple POST check-in processes are supported. |
| Multiple accounts check in repeatedly | This may be due to multiple devices running simultaneously. It is recommended to enable WebDAV synchronization to keep configurations consistent, or only keep automatic check-in enabled on one device. |

## Related Documentation

- [Automatic Refresh and Real-time Data](./auto-refresh.md)
- [WebDAV Backup and Automatic Synchronization](./webdav-sync.md)
- [Cloudflare Bypass Helper](./cloudflare-helper.md)