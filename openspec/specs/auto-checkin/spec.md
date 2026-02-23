# auto-checkin Specification

## Purpose
TBD - created by archiving change update-auto-checkin-daily-retry. Update Purpose after archive.
## Requirements
### Requirement: Normal auto check-in runs once per day
When auto check-in is enabled, the extension MUST schedule and execute at most one **normal** auto check-in run per day within the user-configured time window.

#### Scenario: Random schedule does not reschedule the same day
- **GIVEN** auto check-in is enabled with schedule mode `random`
- **WHEN** the normal auto check-in run completes successfully within today’s window
- **THEN** the next normal auto check-in schedule MUST target the next day’s window (not later today)

#### Scenario: Deterministic schedule runs once per day
- **GIVEN** auto check-in is enabled with schedule mode `deterministic` at `09:00`
- **WHEN** the normal auto check-in run completes at `09:05` today
- **THEN** the next normal auto check-in schedule MUST be `09:00` tomorrow

### Requirement: The scheduler does not trust `isCheckedInToday`
The scheduler MUST NOT use `checkIn.siteStatus.isCheckedInToday` to decide whether to execute an account. Instead, it MUST rely on provider outcomes (including `already_checked`) to determine whether an account is considered checked-in for the day.

#### Scenario: Untrusted local flag does not block execution
- **GIVEN** an enabled account with `checkIn.siteStatus.isCheckedInToday = true`
- **AND** the provider can check in for the account
- **WHEN** a normal auto check-in run executes
- **THEN** the provider MUST still be called for that account

#### Scenario: Provider indicates already checked
- **GIVEN** an enabled account is already checked-in today according to the site
- **WHEN** the provider executes a check-in request
- **THEN** the result status MUST be recorded as `already_checked`
- **AND** the account MUST NOT be included in the automatic retry set

### Requirement: Retry scheduling uses a separate alarm
Automatic retries MUST be scheduled and triggered via a dedicated retry alarm distinct from the normal daily alarm. Scheduling retries MUST NOT override or replace the next normal daily schedule.

#### Scenario: Retry alarm does not affect daily alarm
- **GIVEN** a normal daily run is scheduled for tomorrow
- **AND** at least one account fails in today’s normal run and retries are enabled
- **WHEN** the retry alarm is scheduled
- **THEN** the next normal daily alarm schedule MUST remain unchanged

### Requirement: Retry runs only after today’s normal run
Automatic retries MUST only be scheduled/executed for accounts that failed in the normal run on the same local calendar day (local `YYYY-MM-DD`). Retry state MUST NOT carry over to other days.

#### Scenario: Retry alarm does not run before normal run
- **GIVEN** no normal auto check-in run has executed today
- **WHEN** the retry alarm triggers
- **THEN** the scheduler MUST NOT execute any check-in provider calls
- **AND** the retry alarm MUST be cleared (or left unscheduled) until a normal run produces failures today

### Requirement: Alarm handlers do not execute stale alarms
When a daily or retry alarm triggers, the scheduler MUST verify the alarm’s target day matches today’s local calendar day (local `YYYY-MM-DD`). If it does not match, the scheduler MUST NOT execute check-ins and MUST reschedule for the next eligible run.

#### Scenario: Late daily alarm is ignored
- **GIVEN** the daily alarm was scheduled for yesterday but did not run (e.g., browser/device was asleep)
- **WHEN** it triggers today
- **THEN** the scheduler MUST NOT execute a normal run for yesterday
- **AND** it MUST schedule the next normal run for the next eligible day/window

#### Scenario: Late retry alarm is ignored and cleared
- **GIVEN** a retry alarm exists for yesterday’s failures
- **WHEN** it triggers today
- **THEN** the scheduler MUST NOT execute retries for yesterday
- **AND** the retry state for yesterday MUST be cleared

### Requirement: Automatic retries are account-scoped
When retries are enabled, retry executions MUST only target accounts that failed in the latest eligible run, and MUST NOT rerun accounts that have already succeeded or were skipped.

#### Scenario: Retry only failed accounts
- **GIVEN** account A succeeds and account B fails in the normal run
- **WHEN** a retry execution runs
- **THEN** the provider MUST be called only for account B
- **AND** the provider MUST NOT be called for account A

### Requirement: Retry attempts are limited per account per day
The scheduler MUST track retry attempts per account per day, and MUST NOT retry an account more than `retryStrategy.maxAttemptsPerDay` times on the same day.

#### Scenario: Stop retrying after max attempts
- **GIVEN** retries are enabled with `maxAttemptsPerDay = 3`
- **AND** an account has failed 3 retry attempts today
- **WHEN** the retry scheduler evaluates retry candidates
- **THEN** the account MUST NOT be scheduled for further retries today

### Requirement: Status reporting distinguishes normal vs retry scheduling
Auto check-in status MUST expose enough information to render:
- the next scheduled **normal** run time, and
- whether a retry is pending and (when scheduled) the next retry time.

#### Scenario: UI can show next daily and next retry times
- **GIVEN** a normal daily run is scheduled and a retry is also scheduled
- **WHEN** the options UI loads auto check-in status
- **THEN** it MUST be able to display both the next normal run time and the next retry time

### Requirement: Pre-trigger today’s daily auto check-in on UI open
The extension MUST support a user preference `autoCheckin.pretriggerDailyOnUiOpen` (default **disabled**) that controls whether opening an extension UI surface attempts to trigger today’s scheduled **daily** auto check-in run early.

#### Scenario: Pre-trigger runs within today’s window
- **GIVEN** auto check-in is enabled and `pretriggerDailyOnUiOpen = true`
- **AND** the normal daily alarm is scheduled for today but has not fired yet
- **AND** the current time is within the configured time window
- **WHEN** the user opens any extension UI surface (popup, side panel, or options)
- **THEN** the scheduler MUST execute the daily run immediately using the same semantics as the scheduled daily alarm
- **AND** the UI MUST show a toast indicating the daily run was triggered early

#### Scenario: No pre-trigger when not eligible
- **GIVEN** `pretriggerDailyOnUiOpen = true`
- **WHEN** the UI opens outside the configured time window, or today’s daily run has already executed, or no daily alarm targets today
- **THEN** the scheduler MUST NOT trigger an early daily run

### Requirement: UI shows a completion dialog for the pre-triggered run
When a UI-open pre-triggered daily run completes and a result is returned to the UI, the UI MUST display a dialog summarizing the run and MUST provide a “View details” button that navigates to the Auto Check-in details page.

#### Scenario: Dialog shows summary + details navigation
- **GIVEN** a daily auto check-in run was triggered early by opening a UI surface
- **WHEN** the run completes
- **THEN** the UI MUST display a dialog with a summary of success/failed/skipped counts
- **AND** the dialog MUST include an action to navigate to the Auto Check-in details view

### Requirement: Manual auto check-in supports account-scoped targets
The system MUST allow a manual auto check-in execution to be scoped to an explicit set of account IDs.

When handling the manual trigger (`autoCheckin:runNow`):
- If the request includes a non-empty `accountIds` array, the background MUST only attempt provider check-ins for eligible accounts whose IDs are included in `accountIds`.
- The background MUST NOT attempt provider check-ins for accounts that are not in the target list.
- Eligibility rules MUST remain unchanged (global enabled, account not disabled, detection enabled, per-account auto-checkin enabled, provider available/ready).
- Backward compatibility MUST be preserved: when `accountIds` is omitted, the system MUST behave like the existing “run now” action (execute the full eligible set).

#### Scenario: Scoped run executes only the targeted account
- **GIVEN** two eligible accounts A and B exist
- **WHEN** the user triggers `autoCheckin:runNow` with `accountIds = [A]`
- **THEN** the provider MUST be invoked for account A
- **AND** the provider MUST NOT be invoked for account B

#### Scenario: Omitted target behaves like existing manual run
- **GIVEN** two eligible accounts A and B exist
- **WHEN** the user triggers `autoCheckin:runNow` without `accountIds`
- **THEN** the provider MUST be invoked for account A and account B

### Requirement: Account list UIs provide a per-account quick check-in action
Any UI surface that renders per-account actions (e.g., popup/side panel account list) MUST provide a “Quick check-in” action for an eligible account that triggers a manual auto check-in scoped to that single account.

When the user triggers “Quick check-in”, the UI MUST:
- Display a toast-based loading state while the manual run is executing.
- After completion, display a user-facing result message best-effort, derived from the latest auto check-in status for that account when available.
- Refresh account list data best-effort so the updated check-in status/balance is visible without requiring a manual page reload.

#### Scenario: User triggers quick check-in from account actions
- **GIVEN** account A is eligible for auto check-in
- **WHEN** the user triggers the “Quick check-in” action for account A
- **THEN** the UI MUST send `autoCheckin:runNow` with `accountIds` containing A

#### Scenario: Disabled account cannot trigger quick check-in
- **GIVEN** account A is disabled
- **WHEN** the user attempts to trigger “Quick check-in” for account A
- **THEN** the UI MUST prevent the action from starting a background check-in run

### Requirement: Post-checkin UI sync is configurable
The extension MUST support a user preference `autoCheckin.notifyUiOnCompletion` (default **enabled**) that controls whether auto check-in broadcasts completion notifications to UI surfaces.

#### Scenario: Default is enabled
- **GIVEN** a user has no stored `autoCheckin.notifyUiOnCompletion` preference
- **WHEN** the extension loads user preferences
- **THEN** `autoCheckin.notifyUiOnCompletion` MUST be treated as `true`

#### Scenario: Disabled toggle suppresses notifications
- **GIVEN** `autoCheckin.notifyUiOnCompletion = false`
- **WHEN** an auto check-in execution completes (daily, manual, or retry)
- **THEN** the extension MUST NOT broadcast the auto check-in completion notification to UI surfaces

### Requirement: Auto check-in broadcasts completion notifications with account-scoped targets
When `autoCheckin.notifyUiOnCompletion = true`, after an auto check-in execution completes the background MUST broadcast a runtime message whose `action` is `autoCheckin:runCompleted` (via the canonical action ID `RuntimeActionIds.AutoCheckinRunCompleted`).

The message payload MUST include:
- `runKind`: `daily` | `manual` | `retry`
- `updatedAccountIds`: the list of account IDs whose persisted site check-in status was updated by the execution (i.e., accounts whose provider outcome was `success` or `already_checked`)
- `timestamp`: milliseconds since epoch

#### Scenario: Completion notification payload is account-scoped
- **GIVEN** `autoCheckin.notifyUiOnCompletion = true`
- **AND** a daily auto check-in execution completes for account A with provider outcome `success`
- **AND** a daily auto check-in execution completes for account B with provider outcome `already_checked`
- **AND** a daily auto check-in execution completes for account C with provider outcome `failed`
- **WHEN** the background broadcasts the completion notification
- **THEN** the message `action` MUST be `autoCheckin:runCompleted` (via the canonical action ID `RuntimeActionIds.AutoCheckinRunCompleted`)
- **AND** `runKind` MUST be `daily`
- **AND** `updatedAccountIds` MUST include account A and account B
- **AND** `updatedAccountIds` MUST NOT include account C
- **AND** `timestamp` MUST be present and represent milliseconds since epoch

### Requirement: Successful check-ins trigger a post-run account refresh (no extra check-in)
After an auto check-in execution completes, the background MUST attempt a best-effort **account data refresh** for each account whose provider outcome was `success` so balances/quotas reflect the effect of the check-in.

This refresh MUST:
- Use the extension’s standard account refresh mechanism (e.g. `accountStorage.refreshAccount(..., force=true)` / `apiService.refreshAccountData`).
- Be account-scoped (refresh only the accounts that were successfully checked in).
- NOT invoke the provider `checkIn` action again solely to refresh data.
- Be non-fatal: refresh failures MUST NOT cause the auto check-in execution to be treated as failed.

When `autoCheckin.notifyUiOnCompletion = true`, the background MUST perform this account refresh **before** broadcasting `autoCheckin:runCompleted` so open UIs can observe updated balances immediately after handling the notification.

#### Scenario: Successful check-in refreshes balance before notifying UIs
- **GIVEN** `autoCheckin.notifyUiOnCompletion = true`
- **AND** account A completes check-in with provider outcome `success`
- **WHEN** the auto check-in execution completes
- **THEN** the background MUST refresh account A’s account data (without running check-in again)
- **AND** the background MUST then broadcast `autoCheckin:runCompleted` with `updatedAccountIds` including A

#### Scenario: Refresh failure is non-fatal
- **GIVEN** `autoCheckin.notifyUiOnCompletion = true`
- **AND** account A completes check-in with provider outcome `success`
- **AND** the background refresh for account A fails
- **WHEN** the auto check-in execution completes
- **THEN** the background MUST still broadcast `autoCheckin:runCompleted`
- **AND** the auto check-in execution MUST still be treated as complete (status persisted as usual)

#### Scenario: Daily run broadcasts completion notification
- **GIVEN** `autoCheckin.notifyUiOnCompletion = true`
- **AND** a daily auto check-in execution updates at least one account's site check-in status
- **WHEN** the daily execution completes
- **THEN** the extension MUST broadcast `autoCheckin:runCompleted` with `runKind = daily`
- **AND** `updatedAccountIds` MUST include every account whose site check-in status was updated by the execution

#### Scenario: Retry run broadcasts completion notification
- **GIVEN** `autoCheckin.notifyUiOnCompletion = true`
- **AND** a retry execution updates at least one account's site check-in status
- **WHEN** the retry execution completes
- **THEN** the extension MUST broadcast `autoCheckin:runCompleted` with `runKind = retry`

#### Scenario: No-UI listener is non-fatal
- **GIVEN** `autoCheckin.notifyUiOnCompletion = true`
- **WHEN** the extension attempts to broadcast `autoCheckin:runCompleted` but no UI listener exists
- **THEN** the auto check-in execution MUST still be treated as complete
- **AND** the extension MUST persist the execution outcome/status as if broadcasting succeeded

### Requirement: Account list UIs apply account-scoped updates on completion notification
When a UI surface that renders the account list receives the `autoCheckin:runCompleted` notification, it MUST update its displayed check-in status for accounts listed in `updatedAccountIds` without requiring a manual page reload.

The synchronization MUST be account-scoped: it MUST reload/update only the accounts listed in `updatedAccountIds` (and MUST NOT force an all-accounts refresh solely due to this notification).

#### Scenario: Side panel reflects updated check-in status
- **GIVEN** the side panel account list is open and displays account A as not checked in today
- **WHEN** the background completes an auto check-in execution that updates account A
- **AND** broadcasts `autoCheckin:runCompleted` with `updatedAccountIds` including A
- **THEN** the side panel MUST update to show account A as checked in today

#### Scenario: Unrelated accounts are not modified
- **GIVEN** account B is not included in `updatedAccountIds`
- **WHEN** the UI surface applies the completion notification update
- **THEN** the UI surface MUST NOT modify account B's check-in status as part of this synchronization

### Requirement: Auto Check-in status views refresh after executions complete
When an Auto Check-in status view is open, it MUST refresh its displayed status after receiving `autoCheckin:runCompleted` so that the latest summary/result is visible without manual user refresh.

#### Scenario: Options Auto Check-in page refreshes status on completion
- **GIVEN** the options Auto Check-in page is open
- **WHEN** the background broadcasts `autoCheckin:runCompleted`
- **THEN** the page MUST reload Auto Check-in status and display the latest summary/result

