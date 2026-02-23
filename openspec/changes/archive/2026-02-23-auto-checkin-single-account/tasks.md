## 1. Runtime Message Contract

- [x] 1.1 Extend `RuntimeActionIds.AutoCheckinRunNow` request payload to accept optional `accountIds: string[]` (backward compatible)
- [x] 1.2 Update `handleAutoCheckinMessage` to pass `accountIds` through to the scheduler and return a user-facing error on invalid payload

## 2. Scheduler Targeting Support

- [x] 2.1 Extend `AutoCheckinScheduler.runCheckins` API to accept an optional target account list (e.g., `targetAccountIds`)
- [x] 2.2 Filter runnable execution set to targeted accounts while preserving existing eligibility rules
- [x] 2.3 Ensure manual targeted runs keep current semantics: no new retry queue, preserve daily scheduling via `scheduleNextRun({ preserveExisting: true })`

## 3. UI: Quick Check-in Action

- [x] 3.1 Add a “Quick check-in” entry to per-account action UI (account card menu) for eligible accounts
- [x] 3.2 Send `autoCheckin:runNow` with `accountIds: [accountId]` from the UI action and provide toast-based loading/success/failure feedback
- [x] 3.3 Disable or guard the UI action when the account is disabled and ensure no background run is started

## 4. Tests

- [x] 4.1 Add/extend unit tests for `handleAutoCheckinMessage` to cover `accountIds` targeting and backward compatibility when omitted
- [x] 4.2 Add/extend unit tests for `AutoCheckinScheduler.runCheckins` to verify only targeted accounts are executed
- [x] 4.3 Add a UI test (or hook/component test) verifying the “Quick check-in” action triggers the correct runtime message payload
