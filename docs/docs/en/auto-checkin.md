# Automatic Check-in and Check-in Monitoring

> Run daily check-ins for supported relay accounts, collect credits, and save the latest execution result so you do not have to remember every site manually.

## Features at a Glance

- **Check-in status detection**: Adding or refreshing an account automatically detects whether its site has a check-in entry point. There is no manual "check-in detection" switch.
- **Custom check-in entry point**: If the page is not at the standard path, enter an External Check-in Site URL under the account's Check-in Settings.
- **Automatic scheduling**: Uses browser background scheduling for a regular **once-per-day** automatic check-in and optional same-day retries for **accounts that failed the daily run**.
- **Execution result**: Saves the latest result with success, failure, skip reasons, last run time, and next schedule. This is not a multi-day history log.

## Requirements

1. The account has been added in **Account Management** and completed at least one successful refresh or detection.
2. Its exact site type is listed under Supported Sites below.
3. Under **Account Management → Edit Account → Check-in Settings**, the **Enable Daily Auto Check-in** switch is visible. Only accounts with a built-in provider show it.
4. The browser must support background scheduling. Exact timing is not guaranteed when the browser is closed, the device sleeps, or background policies change.

## Setup

### 1. Account-level Settings

- Open an account → **Edit Account** → Check-in Settings.
- Accounts with a built-in provider show:
  - **Enable Daily Auto Check-in**: Enabled by default. When disabled, the account does not participate even if the global schedule is enabled.
  - **External Check-in Site URL** (optional): Enter it when the page is not at the standard path. Every account can configure an external entry point.
  - **Custom Recharge/Redemption Page URL** (optional) and "Open the recharge page when using external check-in".
- The account form has no "check-in detection" switch. Status is read automatically during account refresh or detection.

### 2. Global Time Window

Under **Settings → Check-in & Redemption → Automatic Check-in**:

| Option | Default | Description |
|------|--------|------|
| **Enable Automatic Check-in** | On | Controls the global daily schedule, automatic retries, and bulk "Run Now" on the Automatic Check-in page. When off, no related schedule is created and bulk check-in does not run. Per-account "Quick Check-in" can still run. |
| **Trigger Today's Check-in Early When Opening the Interface** | Off | When the popup, side panel, or settings page opens within the window and today's schedule has not run, starts the daily run early. |
| **Refresh Data and Interface after Automatic Check-in** | On | Refreshes account data and the interface after successful check-in. This is not a system or third-party notification switch. |
| **Window Start / End** | 09:00 / 23:00 | Allowed local-time range for the daily schedule. It can cross midnight. |
| **Schedule Mode** | Random | Selects a random time within the window, or choose Fixed Time. |
| **Fixed Time** | 09:00 | Used only in Fixed Time mode. |
| **Retry Strategy** | Off | Retries only accounts that failed the daily scheduled run on the same day. Manual "Run Now" does not create an automatic retry queue. |
| **Retry Interval (minutes)** | 30 | Used only when retries are enabled. |
| **Maximum Daily Attempts** | 3 | **Includes the initial daily run**; it does not mean three additional retries. |
| **View Check-in History / Open Records** | Button | Opens the Automatic Check-in results page. It stores latest status, not a multi-day archive. |
| **Restore Defaults** | Button | Restores: enabled, 09:00–23:00, random, retries off. |

Saved settings take effect immediately and reschedule the task without restarting the extension.

### 3. View Execution Status

- Open **Automatic Check-in** in the settings sidebar to see the latest result, the next daily schedule, and the next retry schedule when present.
- Results show eligible, executed, successful, failed, and skipped states. The bottom also shows account detection state, provider, skip reason, and latest result.
- When the global switch is on, **Run Now** manually runs every eligible account once. When it is off, this bulk run does not execute. To process one account, click **Quick Check-in** in its "…" menu; that action is not controlled by the global switch.
- The calendar icon at the top of the popup or side panel, labeled Quick Check-in, opens Automatic Check-in in Settings and immediately runs it when the global switch is on. The side panel reuses the popup entry point and has no separate page.
- Failed rows can offer Retry, Manual Check-in, External Check-in, or Open Site. Manual Check-in requires you to finish the action on the site.

## How It Works

1. **Save configuration**: Saving local preferences immediately tells the background process to reschedule.
2. **Initialize scheduling**: Extension startup registers browser alarm listeners:
   - **Daily alarm**: Regular automatic check-in, at most once per day.
   - **Retry alarm**: Created only when the regular daily run has failed accounts; retries only those accounts.
3. **Execute**:
   - Read accounts and create a snapshot, then require each account to be enabled, refreshed/detected, enabled at account level, supported by a built-in provider, and backed by usable credentials.
   - Call the site's built-in provider and record success, failure, pending confirmation, or a skip reason.
   - Both "success" and "already checked in today" count as success. A newly successful check-in also refreshes account data.
   - Only safely retryable failures enter the same-day queue when retries are enabled. Authentication failures, permission failures, and sites without check-in status readback are not retried automatically.
   - Before an automatic retry submits another check-in, it confirms today's status. If status is temporarily unavailable, that attempt does not submit anything but remains eligible for another bounded retry up to Maximum Daily Attempts.
4. **Reschedule**: After the regular daily run, schedule the **next day's** daily alarm. When same-day failures exist and retries are enabled, schedule a retry alarm.

## Supported Sites and Authentication

The built-in providers currently cover these six exact site types:

| Site type | Built-in automatic check-in | Authentication |
|----------|------------------|----------|
| `new-api` | Yes | Access Token (Cookie accounts can use the Cookie session) and account ID |
| `ModelFlare` | Yes | Cookie session and account ID |
| `Veloera` | Yes | Access Token or Cookie, plus account ID |
| `anyrouter` | Yes | Cookie session or browser sign-in context, plus account ID |
| `wong-gongyi` | Yes | Access Token or Cookie, plus account ID |
| `voapi-v2` | Yes | Saved dashboard JWT (Access Token) |

::: warning Deployment differences
Even when the site type matches, a deployment can be customized: the expected endpoint may be missing and return 404/405, authentication may differ, or human verification may be required. Do not assume that every site "compatible with New API" has built-in automatic check-in.
:::

The following types currently have no built-in provider, but can still use an external URL or Manual Check-in: `one-api`, `one-hub`, `done-hub`, `v-api`, legacy `VoAPI`, `Super-API`, `Rix-Api`, `neo-Api`, `sub2api`, `AIHubMix`, `sharedchat`, `openrouter`, and others.

## Best Practices

- **Time window**: Prefer off-peak hours, such as early morning, for a higher success rate.
- **Keep the browser running**: A closed browser or sleeping device does not check in and cannot wake the device. A missed alarm may run late after wake-up, and the previous day is not backfilled. See the [Chrome Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms).
- **External and manual check-in**: External Check-in only opens the configured page and records that it was opened today; it does not submit or verify the page. Manual Check-in opens the site's native page and requires you to complete the action there.
- **Multiple devices**: WebDAV synchronizes accounts and preferences, but current-day execution state, latest result, and browser alarms are not shared. Multiple devices with the schedule enabled can check in more than once.
- **Notifications**: Daily schedules and automatic retries send task notifications after completion, configured under **Settings → General → Notifications**. Manual Run Now and per-account Quick Check-in do not send scheduled-task notifications.

## FAQ

| Result | Meaning | Automatic retry |
|------|------|:---:|
| Success / Already checked in today | The run confirmed a completed check-in, or the site confirmed today's check-in was already done | No |
| Failed | API, authentication, verification, network, or site response failed | Only for the daily schedule when retries are enabled and the failure is safe to retry |
| Pending confirmation | The request may have been submitted, but the site result could not be confirmed reliably. The extension performs one read-only status check and does not directly resend the check-in | No |
| Skipped | Account disabled, not detected, account-level setting off, no provider, or insufficient credentials | No |

| Problem | Troubleshooting |
|------|----------|
| "Not Scheduled / Disabled / No Pending Retries" | "Disabled": the global switch is off.<br/>"Retries Disabled": Retry Strategy is off.<br/>"No Pending Retries": retries are on, but no account currently failed.<br/>"Not Scheduled": enabled, but background scheduling is unsupported or the alarm has not been created/was cleared; save the settings again. |
| An account fails every day or shows Skipped | Check its provider and skip reason under Account Detection Status. Confirm the account is enabled, refreshed/detected, enabled at account level, supported by a built-in provider, and has usable credentials. |
| Access Token is invalid | Usually the Access Token expired or was revoked. Sign in to the site, then open Account Management → Edit Account and run Auto Detect / refresh the Access Token. If the site disables Tokens or no Token can be obtained, use Cookie authentication or disable automatic check-in for that account and use manual check-in. |
| New API returns 404/405 | The deployment does not provide the expected endpoint. This is not necessarily an extension failure; use Manual or External Check-in. |
| Sign-in or human verification is required | Open the site as prompted, complete verification, and retry. Do not assume the extension has already checked in. |
| Multiple accounts check in repeatedly | Multiple devices can run while execution state is not shared. Enable the schedule on only one device. |
| External Check-in does not work | It only opens the page and does not submit or confirm success. Ensure the URL opens directly in the browser and finish check-in manually. |

## Related Documentation

- [Auto-detection Troubleshooting](./auto-detect.md)
- [Auto Refresh and Real-time Data](./auto-refresh.md)
- [WebDAV Backup and Automatic Sync](./webdav-sync.md)
- [Cloudflare Helper](./cloudflare-helper.md)
- [Task Notifications](./task-notifications.md)
