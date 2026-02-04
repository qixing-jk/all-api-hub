# Automatic Check-in and Check-in Monitoring

> Allows aggregated accounts that support check-in to check in daily on time, accumulate quota, and synchronize check-in logs, preventing manual oversight.

## Feature Overview

-   **Site Detection**: Automatically determines if a site has a check-in entry during account recognition. "Check-in Detection" can be enabled/disabled in account details.
-   **Custom Check-in Entry**: For modified sites, `customCheckInUrl` and `customRedeemUrl` can be configured, and it can also be decided whether to link to open the top-up page.
-   **Automatic Check-in Scheduling**: `autoCheckinScheduler` performs **daily** regular automatic check-ins based on `chrome.alarms`, and retries **failed accounts for the current day** using a separate alarm (this will not affect the next daily schedule).
-   **Execution Records**: Each run generates logs, including success/failure reasons, last run time, next daily schedule, and (if any) next retry schedule, which can be viewed on the "Automatic Check-in" page.

## Prerequisites

1.  In **Account Management → Edit Account**, enable "Check-in Detection" and ensure manual check-in is successful.
2.  For accounts requiring automatic check-in, check the "Automatic Check-in" switch (enabled by default, can be disabled for individual accounts).
3.  In **Settings → Automatic Check-in**, enable global automatic check-in and set the time window.
4.  The browser must support `chrome.alarms` (Chrome, Edge, Kiwi browsers work normally; some Firefox mobile versions may not support it).

## Setup Steps

### 1. Account-level Switch

-   Open any account details → "More Settings".
-   After enabling "Check-in Detection", you can configure:
    -   Custom check-in URL (if the site's default entry is unavailable).
    -   Custom top-up URL and "Open top-up page when checking in".
    -   "Automatic Check-in" switch (if disabled, this account will not participate in automatic check-in even if globally enabled).

### 2. Global Time Window

In the **Settings → Automatic Check-in** panel:

| Option | Description |
|------|------|
| **Enable Automatic Check-in** | Controls global `globalEnabled`. No alarms will be created if disabled. |
| **Trigger today's check-in early when opening the interface** | Enabled by default. When opening the popup / sidebar / settings page, if today's daily schedule has not yet been executed and the current time is within the window, a "Daily Run" will be triggered early. After the run is complete, a result summary dialog will pop up, providing "View Details" to jump to the "Automatic Check-in" page. |
| **Time Window Start / End** | 24-hour format, allows crossing midnight (e.g., 22:00 → 06:00). The scheduler will randomly select a time within this range to run. |
| **View Execution Records** | Quickly jump to the "Automatic Check-in" page to view status and logs. |
| **Restore Defaults** | Calls `resetAutoCheckinConfig()`, restoring to 09:00~18:00 and disabled state. |

### 3. View Execution Status

-   Open the **Extension Sidebar → Automatic Check-in** page to view:
    -   Latest execution results (Success / Partial Success / Failure).
    -   Next daily scheduled time `nextDailyScheduledAt`.
    -   (If any) Next retry scheduled time `nextRetryScheduledAt`.
    -   Account-level logs (time spent, failure reasons, etc.).
-   Click "Run Now" to manually trigger an `autoCheckin:runNow` for debugging.

## How It Works

1.  **Configuration Writing**: `UserPreferencesContext` saves the `autoCheckin` configuration to local preferences and notifies the background via `sendRuntimeMessage`.
2.  **Scheduler Initialization**: `autoCheckinScheduler.initialize()` creates alarm listeners when the extension starts:
    -   **Daily Alarm**: Regular automatic check-in (at most once per day).
    -   **Retry Alarm**: Triggered only when there are failed accounts in the current day's regular run (only retries failed accounts).
3.  **Execution Flow**:
    -   Reads accounts and builds a snapshot (accounts with detection enabled will be shown in "Account Detection Status").
    -   Filters accounts that meet the conditions (detection enabled, automatic check-in allowed, provider exists and is available).
    -   **Does not use** `checkIn.siteStatus.isCheckedInToday` to determine execution (this field is unreliable); `already_checked` returned by the provider serves as the true source for "already checked in".
    -   Concurrently calls the corresponding provider (currently built-in Veloera, extensible), and records success/failure information.
    -   Success or `already_checked` will be written to `accountStorage.markAccountAsSiteCheckedIn()`; failure will be logged and enter the current day's retry queue (if retries are enabled).
    -   Finally, it writes to `autoCheckinStorage` for the frontend page to display each account's status and retry information.
4.  **Rescheduling**:
    -   After the regular daily run is complete, the daily alarm will be rescheduled for the **next day** (ensuring at most once per day).
    -   If there are failed accounts for the current day and retries are enabled, a retry alarm will be scheduled, and the number of attempts for the day will be recorded per account (retries stop after reaching `maxAttemptsPerDay`).

## Best Practices

-   **Time Window Suggestion**: Set it during early morning or off-peak hours for the site (e.g., 02:00-05:00) to improve success rate.
-   **Cross-device Synchronization**: Combine with [WebDAV Backup and Automatic Synchronization](./webdav-sync.md) to ensure multiple devices share the same account and check-in settings, avoiding duplicate check-ins.
-   **Anomaly Notification**: Notifications are not yet built-in. You can manually monitor the background page `autoCheckinStorage` or check the "Automatic Check-in" page to find failure records.

## Frequently Asked Questions

| Issue | Troubleshooting Method |
|------|----------|
| Page displays "Not Scheduled / Disabled / No Retries Pending" | "Disabled": Global automatic check-in switch is off.<br/>"Retries Not Enabled": Retry strategy is not enabled.<br/>"No Retries Pending": Retries are enabled but there are no failed accounts currently.<br/>"Not Scheduled": Enabled but the browser does not support `chrome.alarms` or the alarm has not been created/cleared; try re-saving settings or switching to Chrome/Edge. |
| An account fails daily | Check if the site supports the automatic check-in provider; if necessary, disable automatic check-in for this account and switch to manual. |
| Execution result shows "Unauthorized operation, access token invalid" | Usually indicates that the account's Access Token has expired/been revoked.<br/>Solution: First log in to the site in the browser, then in "Account Management → Edit Account", re-"Auto-detect/Refresh Access Token".<br/>If the site disables Tokens or Tokens cannot be obtained, you can switch to Cookie authentication, or disable automatic check-in for this account and switch to manual. |
| Custom URL invalid | Confirm that it can be directly accessed in the browser and successfully checked in; some sites require additional form data, currently only GET/simple POST check-in processes are supported. |
| Multiple accounts checking in repeatedly | May be due to multiple devices running simultaneously. It is recommended to enable WebDAV synchronization to keep configurations consistent, or only enable automatic check-in on one device. |

## Related Documentation

-   [Auto-detection Troubleshooting Guide](./auto-detect.md)
-   [Auto-refresh and Real-time Data](./auto-refresh.md)
-   [WebDAV Backup and Automatic Synchronization](./webdav-sync.md)
-   [Cloudflare Bypass Helper](./cloudflare-helper.md)