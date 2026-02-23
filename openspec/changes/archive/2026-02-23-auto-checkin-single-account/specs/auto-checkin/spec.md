# auto-checkin Delta Specification

## ADDED Requirements

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
