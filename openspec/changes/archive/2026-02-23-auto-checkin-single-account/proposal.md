## Why

Auto check-in currently operates as a scheduled “run” that typically targets all eligible accounts. When users only need to check in one specific account (e.g., newly added, just enabled, or troubleshooting), triggering an all-accounts run is slow, noisy, and can create unnecessary requests that increase the risk of rate limits.

## What Changes

- Add a “Quick check-in” action that triggers an on-demand auto check-in run scoped to a single account from account list UIs.
- Extend the background auto check-in execution API to accept an optional target account list (including a single account) for manual runs.
- Ensure manual single-account runs do not affect the next scheduled daily run, and do not broaden retry scope beyond the targeted account(s).
- Update UI feedback to show progress and a per-account result message for the single-account run, and refresh account list data after completion (best-effort).

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `auto-checkin`: Support manual runs that target a specific account (or small set of accounts) and provide a UI entry point for triggering and observing the scoped run.

## Impact

- Background: auto-checkin scheduler/executor, status persistence, and completion notifications.
- UI: account list surfaces (popup/side panel/options) to surface a per-account quick check-in action and result feedback.
- Services: account refresh after successful check-in remains account-scoped and is reused for the targeted account.
- Tests: extend existing auto-checkin unit/integration tests to cover manual single-account targeting and UI synchronization behavior.
