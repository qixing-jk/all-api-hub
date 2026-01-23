# Automatic Check-in and Check-in Monitoring

> Let aggregated accounts that support check-in perform daily check-ins on time, accumulate quota, and synchronize check-in logs, avoiding manual oversight.

## Feature Overview

- **Site Detection**: Automatically determines if a site has a check-in entry when an account is recognized. "Check-in Detection" can be enabled/disabled in account details.
- **Custom Check-in Entry**: For modified sites, `customCheckInUrl` and `customRedeemUrl` can be configured, also deciding whether to simultaneously open the top-up page.
- **Automatic Check-in Scheduler**: `autoCheckinScheduler` performs **once daily** regular automatic check-ins based on `chrome.alarms`, and retries **failed accounts on the current day** using a separate alarm (this will not affect the next daily schedule).
- **Execution Records**: Each run generates logs, including success/failure reasons, last run time, next daily schedule, and (if any) next retry schedule, viewable on the "Automatic Check-in" page.

## Prerequisites

1. Enable "Check-in Detection" in **Account Management → Edit Account**, and ensure manual check-in is successful.
2. For accounts requiring automatic check-in, check the "Automatic Check-in" switch (enabled by default, can be disabled for individual accounts).
3. Enable global automatic check-in in **Settings → Automatic Check-in**, and set the time window.
4. The browser must support `chrome.alarms` (Chrome, Edge, Kiwi browsers work normally; some Firefox mobile versions may not be supported).

## Setup Steps

### 1. Account-level Switches

- Open any account details → "More Settings".
- After enabling "Check-in Detection", you can configure:
  - Custom Check-in URL (if the site's default entry is unavailable).
  - Custom Top-up URL and "Open Top-up Page during Check-in".
  - "Automatic Check-in" switch (if disabled, this account will not participate in automatic check-in even if globally enabled).

### 2. Global Time Window

In the **Settings → Automatic Check-in** panel:

| Option | Description |
|------|------|
| **Enable Automatic Check-in** | Controls global `globalEnabled`. No alarms will be created if disabled. |
| **Time Window Start / End** | 24-hour format, allows overnight (e.g., 22:00 → 06:00). The scheduler will randomly select a time within this range to run. |
| **View Execution Records** | Quick jump to the "Automatic Check-in" page to view status and logs. |
| **Restore Defaults** | Calls `resetAutoCheckinConfig()`, restoring to 09:00～18:00, disabled state. |

### 3. View Execution Status

- Open the **Plugin Sidebar → Automatic Check-in** page to view:
  - Latest execution results (Success / Partial Success / Failure).
  - Next daily scheduled time `nextDailyScheduledAt`.
  - (If any) Next retry scheduled time `nextRetryScheduledAt`.
  - Account-level logs (time taken, failure reasons, etc.).
- You can click "Run Now" to manually trigger an `autoCheckin:runNow` for debugging.

## How It Works

1. **Configuration Writing**: `UserPreferencesContext` saves the `autoCheckin` configuration to local preferences and notifies the background via `sendRuntimeMessage`.
2. **Scheduler Initialization**: `autoCheckinScheduler.initialize()` creates alarm listeners when the extension starts:
   - **Daily Alarm**: Regular automatic check-in (at most once per day).
   - **Retry Alarm**: Triggered only when there are failed accounts in the current day's regular run (only retries failed accounts).
3. **Execution Flow**:
   - Reads accounts and builds a snapshot (accounts with detection enabled will be shown in "Account Detection Status").
   - Filters accounts that meet the conditions (detection enabled, automatic check-in allowed, provider exists and is available).
   - **Does not use** `checkIn.siteStatus.isCheckedInToday` to determine execution (this field is unreliable); `already_checked` returned by the provider is the true source for "already checked-in" status.
   - Concurrently calls the corresponding provider (currently built-in Veloera, extensible), and records success/failure information.
   - Success or `already_checked` will be written to `accountStorage.markAccountAsSiteCheckedIn()`; failures will be logged and enter the current day's retry queue (if retries are enabled).
   - Finally, writes to `autoCheckinStorage` for the frontend page to display each account's status and retry information.
4. **Rescheduling**:
   - After the regular daily run is completed, the daily alarm will be rescheduled for **the next day** (ensuring at most once per day).
   - If there are failed accounts on the current day and retries are enabled, a retry alarm will be scheduled, and the number of attempts for the day will be recorded per account (retries stop after reaching `maxAttemptsPerDay`).

## Best Practices

- **Time Window Recommendation**: Set it during early morning hours or off-peak site times (e.g., 02:00-05:00) to increase success rate.
- **Cross-device Synchronization**: Combine with [WebDAV Backup and Automatic Sync](./webdav-sync.md) to ensure multiple devices share the same account and check-in settings, avoiding duplicate check-ins.
- **Anomaly Notifications**: Notifications are not currently built-in. You can manually monitor the background page's `autoCheckinStorage` or check the "Automatic Check-in" page to find failure records.

## Frequently Asked Questions

| Issue | Troubleshooting Method |
|------|----------|
| Page displays "Unscheduled / Disabled / No Retries Pending" | "Disabled": Global automatic check-in switch is off.<br/>"Retries Not Enabled": Retry strategy is not enabled.<br/>"No Retries Pending": Retries are enabled but there are no failed accounts currently.<br/>"Unscheduled": Enabled but the browser does not support `chrome.alarms` or the alarm has not been created/cleared; try re-saving settings or switching to Chrome/Edge. |
| A certain account fails daily | Check if the site supports the automatic check-in provider; if necessary, disable automatic check-in for this account and switch to manual check-in. |
| Custom URL invalid | Confirm that it can be directly accessed and successfully checked in from the browser; some sites require additional form data, but currently only GET/simple POST check-in processes are supported. |
| Multiple accounts check in repeatedly | May result from multiple devices running simultaneously. It is recommended to enable WebDAV sync to keep configurations consistent, or only enable automatic check-in on one device. |

## Related Documentation

- [Automatic Refresh and Real-time Data](./auto-refresh.md)
- [WebDAV Backup and Automatic Sync](./webdav-sync.md)
- [Cloudflare Bypass Assistant](./cloudflare-helper.md)