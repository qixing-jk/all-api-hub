## 1. Runtime action + message contract

- [x] 1.1 Add `RuntimeActionIds.AutoCheckinRunCompleted` (`autoCheckin:runCompleted`) to `constants/runtimeActions.ts` and ensure it follows existing naming/namespace conventions.
- [x] 1.2 Define a typed runtime message payload for `autoCheckin:runCompleted` (fields: `runKind`, `updatedAccountIds`, `timestamp`; optional: `summary`) and reuse existing runtime message typing patterns.

## 2. Preference toggle (default enabled)

- [x] 2.1 Add `autoCheckin.notifyUiOnCompletion: boolean` to `AutoCheckinPreferences` in `types/autoCheckin.ts` and thread the new field through any preference helpers/selectors used by auto check-in.
- [x] 2.2 Set the default to `true` in `DEFAULT_PREFERENCES.autoCheckin` (`services/userPreferences.ts`) and add/adjust any migration logic so missing values are treated as enabled.
- [x] 2.3 Add UI control for the new toggle in the Auto Check-in settings UI and wire it to preferences persistence (no page reload required).
- [x] 2.4 Add i18n keys for the toggle label/description and update all supported locale namespaces touched by the settings UI.

## 3. Background: emit completion notification after persistence

- [x] 3.1 Locate where auto check-in executions complete in the background scheduler (`services/autoCheckin/scheduler.ts`) and identify the point after both `autoCheckinStorage` and `accountStorage` have been updated.
- [x] 3.2 Compute `updatedAccountIds` for an execution (accounts whose persisted site check-in status was updated, e.g. provider outcomes `success` or `already_checked`) and add a focused unit test for this mapping if it’s non-trivial.
- [x] 3.3 When `autoCheckin.notifyUiOnCompletion = true`, send a best-effort `browser.runtime.sendMessage(...)` with `action = RuntimeActionIds.AutoCheckinRunCompleted` and the required payload; swallow “no receiver” errors so the run still completes successfully.
- [x] 3.4 Ensure daily/manual/retry executions all emit the completion message consistently (with the correct `runKind`).
- [x] 3.5 After successful check-ins, trigger a best-effort account-scoped account-data refresh (`accountStorage.refreshAccount(..., force=true)`) before broadcasting `autoCheckin:runCompleted` so balances/quotas reflect the check-in effect without running check-in again.

## 4. UI: account list refresh is account-scoped

- [x] 4.1 Extend `AccountDataProvider` (`features/AccountManagement/hooks/AccountDataContext.tsx`) runtime-message listener to handle `RuntimeActionIds.AutoCheckinRunCompleted`.
- [x] 4.2 For each `updatedAccountId`, reload that account from storage and patch the provider state in-place so open account lists update immediately; do not reload unrelated accounts.
- [x] 4.3 Implement a safe fallback to `loadAccountData()` when any targeted reload fails (missing account, storage read error, etc.) and add a test case for the fallback behavior.

## 5. UI: auto check-in status views refresh on completion

- [x] 5.1 Identify the Auto Check-in status view(s) (options page and any other surface) and add a listener for `RuntimeActionIds.AutoCheckinRunCompleted` that reloads the displayed status/summary from storage/background.
- [x] 5.2 Verify the status refresh does not trigger extra provider network calls beyond what the status view already does (the refresh should be storage-driven).

## 6. Tests + verification

- [x] 6.1 Add a scheduler/service test: emits `autoCheckin:runCompleted` when `notifyUiOnCompletion = true` and does not emit when disabled (mock `browser.runtime.sendMessage`).
- [x] 6.2 Add a provider test: `AccountDataProvider` applies account-scoped updates on `autoCheckin:runCompleted` (updated accounts change, unrelated accounts do not).
- [x] 6.3 Add a status view test: status reloads on `autoCheckin:runCompleted` when the view is mounted.
- [x] 6.4 Run `pnpm test` for the new/impacted test suites and ensure lint/format pass for touched files (`pnpm lint`, `pnpm format` if part of the project workflow).
- [x] 6.5 Add/adjust scheduler tests to assert successful check-ins trigger an account refresh before `autoCheckin:runCompleted` is broadcast (and refresh errors are non-fatal).
