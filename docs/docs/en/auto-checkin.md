# Automatic Check-in and Check-in Monitoring

> Run daily check-ins for supported relay accounts, collect credits, and save the latest execution result so you do not have to remember every site manually.

## Features at a Glance

- **Check-in status detection**: Adding or refreshing an account automatically detects whether its site has a check-in entry point. There is no manual "check-in detection" switch.
- **Custom check-in entry point**: If the page is not at the standard path, enter an External Check-in Site URL under the account's Check-in Settings.
- **Automatic scheduling**: Uses browser background scheduling for a regular **once-per-day** automatic check-in and optional same-day retries for **accounts that failed the daily run**.
- **Execution result**: Saves the latest result with success, failure, skip reasons, last run time, and next schedule. This is not a multi-day history log.

## Requirements

1. The account has been added in **Account Management** and completed at least one successful refresh or detection.
2. Make sure the account has valid login credentials. With Automatic Selection, accounts without a selected method can run discovery during the daily task; check-in starts only after a usable method is confirmed. See Supported Sites and Authentication Requirements below.
3. Under **Account Management → Edit Account → Check-in Settings**, the **Enable Daily Auto Check-in** switch is visible. Only accounts with a built-in provider show it.
4. The browser must support background scheduling. Exact timing is not guaranteed when the browser is closed, the device sleeps, or background policies change.

## Setup

### 1. Account-level Settings

- Open an account → **Edit Account** → Check-in Settings.
- Accounts with a built-in provider show:
  - **Check-in Method**: Automatic Selection re-detects as needed when no method is selected or the current method is confirmed unavailable. It selects or switches only when a suitable method can be uniquely determined. A manual choice stays fixed.
  - **Enable Daily Auto Check-in**: Enabled by default. When disabled, the account does not participate even if the global schedule is enabled.
  - **External Check-in Site URL** (optional): Enter it when the page is not at the standard path. Every account can configure an external entry point.
  - **Custom Recharge/Redemption Page URL** (optional) and "Open the recharge page when using external check-in".
- The account form has no "check-in detection" switch. Status is read automatically during account refresh or detection.
- Automatic re-detection requires both the global and account-level automatic check-in switches. It runs with the daily task, including a daily task triggered early by opening the interface, with at least 24 hours between automatic discovery attempts for an account. Network errors, timeouts, and expired logins do not mean the method is unsupported.
- **Re-detect Check-in Methods** is available manually during the cooldown. It only finds methods and does not submit a check-in; discovery results in the account editor take effect when saved.

### 2. Global Time Window

Under **Settings → Check-in & Redemption → Automatic Check-in**:

| Option | Description |
|------|------|
| **Enable Automatic Check-in** | Controls daily schedules and automatic retries. Manual bulk Run Now and per-account Quick Check-in remain available when it is off. |
| **Trigger Today's Check-in Early When Opening the Interface** | Enabled by default. Opening the popup, side panel, or settings triggers today’s run early if it has not run yet and the current time is within the check-in window. |
| **Refresh Data and Interface after Automatic Check-in** | Refreshes account data and the interface after successful check-in. This is not a system or third-party notification switch. |
| **Window Start / End** | Allowed local-time range for the daily schedule. It can cross midnight. |
| **Schedule Mode** | Selects a random time within the window, or choose Fixed Time. |
| **Fixed Time** | Used only in Fixed Time mode. |
| **Retry Strategy** | Enabled by default. Only eligible failures from the daily schedule are retried that day; manual Run Now does not create an automatic retry queue. |
| **Retry Interval (minutes)** | Used only when retries are enabled. |
| **Maximum Daily Attempts** | **Includes the initial daily run**, rather than counting only additional retries. |
| **View Check-in History / Open Records** | Opens the Automatic Check-in results page. It stores latest status, not a multi-day archive. |
| **Restore Defaults** | Restores the automatic check-in settings to the defaults provided by the extension. |

Settings take effect after saving, without restarting the extension. Upgrades preserve your saved settings.

### 3. View Execution Status

- Open **Automatic Check-in** in the settings sidebar to see the latest result, the next daily schedule, and the next retry schedule when present.
- Results show eligible, executed, successful, failed, and skipped states. The bottom also shows account detection state, provider, skip reason, and latest result.
- Click **Run Now** to run eligible accounts once, regardless of the global automatic check-in switch. Accounts must still be enabled and meet check-in requirements. To process one account, use **Quick Check-in** in its menu.
- The Quick Check-in calendar icon at the top of the popup or side panel opens the check-in page and starts a manual batch.
- Failed rows can offer Retry, Manual Check-in, External Check-in, or Open Site. Manual Check-in requires you to finish the action on the site.
- For "Pending Confirmation" results, the **Verify Status** action is available. It only reads today's status and updates the account configuration; it does not resubmit the check-in. If login or authentication repair is required, open the site to complete sign-in first, then verify again.
- To report a problem, choose check-in feedback or a support request in the account menu or result row. Review the report before copying it or opening it on GitHub to submit.

### 4. Handle Detection and Execution States

The account's check-in configuration retains your manual method choice and custom URL. Network errors or an expired login do not trigger a method switch. Take the corresponding action based on the state:

| State | Meaning | Next Step |
|------|------|--------|
| Confirmed | The selected check-in method is confirmed usable | Keep automatic check-in enabled; usually no action is required |
| Needs Selection | Multiple candidate methods detected | Select a method once, or keep the current selection |
| Unknown | This detection did not complete | Click Re-detect |
| Not Supported | No available built-in method was confirmed | Use an external check-in URL, check in manually, or request support |
| Disabled | The site explicitly disabled this method | Keep the method, disable automatic check-in, or switch to manual |
| Status Unreadable | The method still exists, but today's status cannot be read temporarily | Keep the selection and auto check-in switch, retry later or confirm manually |
| Pending Confirmation | The request result cannot be reliably confirmed | Click Verify Status; if authentication is required, open the site to log in, and do not blindly retry |

## How It Works

1. **Save configuration**: Saving local preferences immediately tells the background process to reschedule.
2. **Initialize scheduling**: Extension startup registers browser alarm listeners:
   - **Daily alarm**: Regular automatic check-in, at most once per day.
   - **Retry alarm**: Created only when the regular daily run has failed accounts; retries only those accounts.
3. **Execute**:
   - The daily task first checks automatic selection for enabled accounts. When re-detection is needed and the cooldown has elapsed, it detects and saves the result before checking the selected method, credentials, and today's status. It does not arbitrarily pick a method when none applies, several remain possible, or detection is incomplete.
   - Keep using an existing method while it remains supported. If the read-only check before execution confirms that it is unsupported, discovery may select a unique replacement when the cooldown allows. If a check-in request has already been sent and its result is uncertain, verify the result instead of submitting through another method.
   - Call the site's built-in provider and record success, failure, pending confirmation, or a skip reason.
   - Both "success" and "already checked in today" count as success. A newly successful check-in also refreshes account data.
   - Only safely retryable failures enter the same-day queue when retries are enabled. Authentication failures, permission failures, and sites without check-in status readback are not retried automatically.
   - Before an automatic retry submits another check-in, it confirms today's status. If status is temporarily unavailable, that attempt does not submit anything but remains eligible for another bounded retry up to Maximum Daily Attempts.
4. **Reschedule**: After the regular daily run, schedule the **next day's** daily alarm. When same-day failures exist and retries are enabled, schedule a retry alarm.

## Supported Sites and Authentication

The following sites have supported check-in methods. Availability still depends on account detection:

| Site type | Built-in automatic check-in | Authentication |
|----------|------------------|----------|
| `new-api` | Yes | Access Token (Cookie accounts can use the Cookie session) and account ID |
| `ModelFlare` | Yes | Cookie session and account ID |
| `Veloera` | Yes | Access Token or Cookie, plus account ID |
| `anyrouter` | Yes | Cookie session or browser sign-in context, plus account ID |
| `wong-gongyi` | Yes | Access Token or Cookie, plus account ID |
| `voapi-v2` | Yes | Saved dashboard JWT (Access Token) |
| `sub2api` | Yes | Valid login credentials for the detected Sub2API Pro or Denxio check-in method |
| AgentRouter (`agentrouter.org`) | Yes | After login check-in is detected, select the matching GitHub or LinuxDo method in account check-in settings. Complete browser login or authorization as prompted and check the execution result. |

::: warning Deployment differences
Even when the site type matches, a deployment can be customized: the expected endpoint may be missing and return 404/405, authentication may differ, or human verification may be required. Do not assume that every site "compatible with New API" has built-in automatic check-in.
:::

If no available method is detected for another site, use an external check-in URL, check in manually, or request check-in support.

## Best Practices

- **Time window**: Prefer off-peak hours, such as early morning, for a higher success rate.
- **Keep the browser running**: A closed browser or sleeping device does not check in and cannot wake the device. A missed alarm may run late after wake-up, and the previous day is not backfilled. See the [Chrome Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms).
- **External and manual check-in**: External Check-in only opens the configured page and records that it was opened today; it does not submit or verify the page. Manual Check-in opens the site's native page and requires you to complete the action there.
- **Multiple devices**: WebDAV and GitHub Gist sync accounts and preferences, but do not share today’s check-in state, latest results, or browser schedules. Enable automatic check-in on only one device to avoid duplicate runs.
- **Notifications**: Daily schedules and automatic retries send task notifications after completion, configured under **Settings → General → Notifications**. Manual Run Now and per-account Quick Check-in do not send scheduled-task notifications.

## FAQ

| Result | Meaning | Automatic retry |
|------|------|:---:|
| Success / Already checked in today | The run confirmed a completed check-in, or the site confirmed today's check-in was already done | No |
| Failed | API, authentication, verification, network, or site response failed | Only for the daily schedule when retries are enabled and the failure is safe to retry |
| Pending confirmation | The request may have been submitted, but the site result could not be confirmed reliably. The extension performs one read-only status check and does not directly resend the check-in | No, use Verify Status or open the site to fix authentication |
| Skipped | Account disabled, not detected, account-level setting off, no provider, or insufficient credentials | No |

| Problem | Troubleshooting |
|------|----------|
| "Not Scheduled / Disabled / No Pending Retries" | "Disabled": the global switch is off.<br/>"Retries Disabled": Retry Strategy is off.<br/>"No Pending Retries": retries are on, but no account currently failed.<br/>"Not Scheduled": enabled, but background scheduling is unsupported or the alarm has not been created/was cleared; save the settings again. |
| An account fails every day or shows Skipped | Check its provider and skip reason under Account Detection Status. Confirm the account is enabled, refreshed/detected, enabled at account level, supported by a built-in provider, and has usable credentials. |
| Access Token is invalid | Usually the Access Token expired or was revoked. Sign in to the site, then open Account Management → Edit Account and run Auto Detect / refresh the Access Token. If the site disables Tokens or no Token can be obtained, use Cookie authentication or disable automatic check-in for that account and use manual check-in. |
| New API returns 404/405 | The deployment does not provide the expected endpoint. This is not necessarily an extension failure. Automatic Selection re-detects as needed during subsequent daily tasks; if no suitable method is found, use Manual or External Check-in, or request check-in support. |
| Sign-in or human verification is required | Open the site as prompted, complete verification, and retry. Do not assume the extension has already checked in. |
| Multiple accounts check in repeatedly | Multiple devices can run while execution state is not shared. Enable the schedule on only one device. |
| External Check-in does not work | It only opens the page and does not submit or confirm success. Ensure the URL opens directly in the browser and finish check-in manually. |

## Related Documentation

- [Auto-detection Troubleshooting](./auto-detect.md)
- [Auto Refresh and Real-time Data](./auto-refresh.md)
- [WebDAV Backup and Automatic Sync](./webdav-sync.md)
- [Cloudflare Helper](./cloudflare-helper.md)
- [Task Notifications](./task-notifications.md)
