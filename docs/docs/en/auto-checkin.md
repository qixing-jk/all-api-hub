# Automatic Check-in and Check-in Monitoring

> Run daily check-ins for supported relay accounts, collect credits, and save the latest execution result so you do not have to remember every site manually.

## Features at a Glance

- **Check-in status detection**: Adding or refreshing an account automatically detects whether its site has a check-in entry point. There is no manual "check-in detection" switch.
- **Custom check-in entry point**: If the page is not at the standard path, enter an External Check-in Site URL under the account's Check-in Settings.
- **Automatic scheduling**: Uses browser background scheduling for a regular **once-per-day** automatic check-in and optional same-day retries for eligible failed or unconfirmed results.
- **Execution result**: Saves the latest result with success, failure, skip reasons, last run time, and next schedule. This is not a multi-day history log.

## Requirements

1. The account has been added in **Account Management** and completed at least one successful refresh or detection.
2. Make sure the account has valid login credentials. With Automatic Selection, accounts without a selected method can run discovery during the daily task; check-in starts only after a usable method is confirmed. See Supported Sites and Authentication below.
3. Under **Account Management → Edit Account → Check-in Settings**, the **Enable Daily Auto Check-in** switch is visible. Only accounts with a built-in provider show it.
4. The browser must support background scheduling. Exact timing is not guaranteed when the browser is closed, the device sleeps, or background policies change.

## Setup

### 1. Account-level Settings

- Open an account → **Edit Account** → Check-in Settings.
- Accounts with a built-in provider show:
  - **Check-in Method**: Automatic Selection re-detects as needed when no method is selected or the current method is confirmed unavailable. It selects or switches only when a suitable method can be uniquely determined. A manual choice stays fixed. If it still belongs to the current site but has no detection record, execution confirms only that method and keeps that choice whether the result matches, is unsupported, or is uncertain.
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
| **Retry Strategy** | Enabled by default. Failed or pending results from daily or manual runs are retried the same day when they meet the [retry conditions](#execution-and-retry-rules). |
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
- "Pending confirmation" offers **Verify Status** only when the method can read today's status. Methods without that read offer **Try Again** instead of a verification action that cannot succeed. Automatic retries follow the [execution and retry rules](#execution-and-retry-rules) below. For methods that cannot safely repeat a claim, confirm the result on the site first.
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
| Pending Confirmation | The request result cannot be reliably confirmed | Verify status first; if unavailable, check the result on the site before deciding whether to retry |

## Execution and Retry Rules

- **Daily schedule**: One regular check-in is scheduled each day within the configured local time window, followed by the next day's schedule. Closing the browser or putting the device to sleep may delay execution; the extension cannot make up a previous day's check-in.
- **Before execution**: The extension checks the method, credentials and today's status. It does not choose arbitrarily when no method applies, several candidates remain or discovery is incomplete. A method confirmed unavailable can be replaced with a unique alternative under the discovery rules. If a submitted request is pending confirmation, the result is checked before any further action; the extension does not switch methods and submit again.
- **Completion**: Both Success and Already Checked In Today count as complete. A newly successful check-in also refreshes account data.
- **Retry conditions**: When enabled, eligible failed and pending results are retried later the same day. Sign-in requirements, insufficient permissions, disabled or unsupported methods, an invalid execution environment, or missing account or credential prerequisites block automatic retries. Methods that cannot safely repeat a claim also skip automatic retries; confirm their result on the site first.
- **Before retrying**: Methods that can read status check today's result first and skip submission if already complete. Methods without status readback retry directly. A single execution never immediately submits twice.

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
| `sub2api` | Yes | Valid login credentials required by the detected check-in method |
| AgentRouter | Yes | After login check-in is detected, select the matching GitHub or LinuxDo method in account check-in settings. Complete browser login or authorization as prompted and check the execution result. |

### Check-in differences between Sub2API sites

Sub2API operators may add their own check-in features. Keep the account type as `sub2api`; availability depends on the detected method. Use the setup steps above to re-detect, save and enable automatic check-in.

| Situation | What it means for you |
|-----------|-----------------------|
| Rewards are separate from the account balance (such as ToolCode) | Points and expiring bonus credit are not shown as a balance reward amount. View their details on the site. |
| Daily and extra rewards coexist (such as Hiyo Free) | The extension handles daily check-in only and does not collect consumption-based extra rewards. Uncertain claims are not retried automatically; confirm the result on the site first. |
| The site requires human verification | Complete check-in on the original site. |

### AgentRouter login check-in limits

AgentRouter grants the check-in benefit during a fresh OAuth login, and the browser signs in with the GitHub or Linux DO identity **already signed in to your browser** rather than with per-account credentials. As a result:

- **The login method must be selected explicitly.** When you add an account, the extension preselects the GitHub / Linux DO identity that account is bound to on the site. If the account is bound to both, or the deployment does not expose the binding, the method stays unselected. Check-in then fails with a request to choose a method; the extension never guesses a default for you.
- **One login method belongs to one AgentRouter account with automatic check-in enabled.** Two accounts both using GitHub (or both using Linux DO) drive the same browser identity: the second one only gets an identity-mismatch error and disturbs the shared login session.
- **What a conflict looks like**: in the account settings, a login method already owned by another account is greyed out with the reason; during a background run the non-owning account is skipped and the result explains why. Ownership follows real evidence: the account the browser last signed in as holds the method, an untried account comes next, and the lowest account ID is only the final tiebreak. If two accounts ever disputed one method, ownership therefore converges on the one that can actually sign in.
- **How to release a method**: switch that account to the other method (for example, another account on Linux DO and this one on GitHub), set this account's login method to "Not selected" to clear it, or disable/delete the account that holds it. A greyed-out option is only a hint; it never blocks you from changing or clearing this account's own selection.

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
| Failed | API, authentication, verification, network, or site response failed | Later the same day when retries are enabled and the [retry conditions](#execution-and-retry-rules) are met |
| Pending confirmation | The request may have been submitted, but the site result could not be confirmed reliably | Verify status when available; automatic retries are subject to the [retry conditions](#execution-and-retry-rules) |
| Skipped | Account disabled, not detected, account-level setting off, no provider, or insufficient credentials | No |

| Problem | Troubleshooting |
|------|----------|
| "Not Scheduled / Disabled / No Pending Retries" | "Disabled": the global switch is off.<br/>"Retries Disabled": Retry Strategy is off.<br/>"No Pending Retries": retries are on, but nothing is currently waiting to retry.<br/>"Not Scheduled": enabled, but background scheduling is unsupported or the alarm has not been created/was cleared; save the settings again. |
| An account fails every day or shows Skipped | Check its provider and skip reason under Account Detection Status. Confirm the account is enabled, refreshed/detected, enabled at account level, supported by a built-in provider, and has usable credentials. |
| Access Token is invalid | Usually the Access Token expired or was revoked. Sign in to the site, then open Account Management → Edit Account and run Auto Detect / refresh the Access Token. If the site disables Tokens or no Token can be obtained, use Cookie authentication or disable automatic check-in for that account and use manual check-in. |
| Execution result says the site type does not match | After a failed check-in the extension inferred, from the site's own signals, a type other than the one the account carries, and the hint names the type to switch to (for example: this site matches Veloera, while the account is set to new-api). Fix: in Account Management → Edit Account, set the Site Type to the named type, then run once more. The hint stops applying once the account's Site Type changes, or once a later reading finds the site agreeing with the stored type. |
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
