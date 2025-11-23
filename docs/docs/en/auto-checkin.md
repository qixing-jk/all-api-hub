# Automatic Check-in and Check-in Monitoring

> Allows aggregated accounts that support check-in to perform check-ins on time daily, accumulate quota, and synchronize check-in logs, preventing manual omissions.

## Feature Overview

- **Site Detection**: Automatically determines if a site has a check-in entrance during account recognition. "Check-in Detection" can be enabled/disabled in account details.
- **Custom Check-in Entry**: For modified sites, `customCheckInUrl` and `customRedeemUrl` can be configured, along with the option to link to the recharge page.
- **Automatic Check-in Scheduling**: `autoCheckinScheduler` uses `chrome.alarms` to trigger check-ins randomly within a specified time window, preventing all accounts from accessing simultaneously.
- **Execution Records**: Each run generates logs including success/failure reasons, last run time, and next scheduled time, viewable on the "Automatic Check-in" page.

## Prerequisites

1. Enable "Check-in Detection" in **Account Management → Edit Account**, and ensure manual check-ins are successful.
2. For accounts requiring automatic check-in, enable the "Automatic Check-in" toggle (enabled by default, can be disabled per account).
3. Enable global automatic check-in in **Settings → Automatic Check-in** and set the time window.
4. The browser must support `chrome.alarms` (Chrome, Edge, Kiwi browsers are normal; some Firefox mobile versions may not).

## Setup Steps

### 1. Account-Level Toggle

- Open any account details → "More Settings".
- After enabling "Check-in Detection", you can configure:
  - Custom Check-in URL (if the site's default entry is unavailable).
  - Custom Recharge URL and "Open Recharge Page During Check-in".
  - "Automatic Check-in" toggle (if disabled, this account will not participate in automatic check-in even if globally enabled).

### 2. Global Time Window

In the **Settings → Automatic Check-in** panel:

| Option | Description |
|------|------|
| **Enable Automatic Check-in** | Controls `globalEnabled`. No alarms will be created if disabled. |
| **Window Start / End** | 24-hour format, allows overnight (e.g., 22:00 → 06:00). The scheduler will select a random time within this range to run. |
| **View Execution Records** | Quickly jump to the "Automatic Check-in" page to view status and logs. |
| **Restore Defaults** | Calls `resetAutoCheckinConfig()` to restore to 09:00-18:00 and disabled state. |

### 3. View Execution Status

- Open the **Plugin Sidebar → Automatic Check-in** page to view:
  - Latest execution results (Success / Partial Success / Failure).
  - Next scheduled time `nextScheduledAt`.
  - Account-wise logs (duration, failure reasons, etc.).
- You can click "Run Now" to manually trigger `autoCheckin:runNow` for debugging.

## How it Works

1. **Configuration Write**: `UserPreferencesContext` saves `autoCheckin` configurations to local preferences and notifies the background process via `sendRuntimeMessage`.
2. **Scheduler Initialization**: `autoCheckinScheduler.initialize()` creates alarm listeners upon extension startup. If the browser supports `chrome.alarms`, it randomly sets the next execution time.
3. **Execution Flow**:
   - Reads all accounts and resets the previous day's `isCheckedInToday` status.
   - Filters accounts that meet the conditions (detection enabled, auto-check-in allowed, not yet checked-in, provider exists).
   - Calls the corresponding provider one by one (Veloera built-in, expandable) and inserts random delays between requests to avoid rate limiting.
   - Upon success, calls `accountStorage.markAccountAsCheckedIn()`; for failures, logs the error.
   - Finally, writes to `autoCheckinStorage` for the frontend to display each account's status.
4. **Rescheduling**: After execution, `scheduleNextRun()` is called again to ensure it triggers only once per day (or at the configured frequency).

## Best Practices

- **Time Window Recommendation**: Set during the early morning or low traffic hours for the site (e.g., 02:00-05:00) to increase success rates.
- **Cross-Device Synchronization**: Combine with [WebDAV Backup and Automatic Synchronization](./webdav-sync.md) to ensure multiple devices share the same account and check-in settings, preventing duplicate check-ins.
- **Exception Notifications**: Notifications are not built-in. You can monitor the background page `autoCheckinStorage` or check the "Automatic Check-in" page to find failure records.

## Frequently Asked Questions

| Problem | Troubleshooting Steps |
|------|----------|
| Page shows "Not Scheduled" | Browser does not support `chrome.alarms` or global automatic check-in is not enabled; try re-saving settings or switching to Chrome/Edge. |
| An account fails daily | Check if the site supports the automatic check-in provider. If necessary, disable automatic check-in for this account and switch to manual. |
| Custom URL invalid | Confirm that it can be accessed directly in the browser and check-in is successful. Some sites require additional form data; currently, only GET/simple POST check-in flows are supported. |
| Multiple accounts checked in repeatedly | May be due to simultaneous operation on multiple devices. It is recommended to enable WebDAV synchronization to maintain consistent configurations, or keep automatic check-in enabled on only one device. |

## Related Documents

- [Automatic Refresh and Real-time Data](./auto-refresh.md)
- [WebDAV Backup and Automatic Synchronization](./webdav-sync.md)
- [Cloudflare Anti-Bot Helper](./cloudflare-helper.md)