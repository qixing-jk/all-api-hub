## ADDED Requirements

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
