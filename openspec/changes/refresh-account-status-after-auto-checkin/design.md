## Context

Auto check-in runs in the background scheduler (`services/autoCheckin/scheduler.ts`) and persists:

- Per-run/per-account outcomes in `autoCheckinStorage` (for the Auto Check-in status UI).
- Per-account check-in state in `accountStorage` (e.g., `checkIn.siteStatus.isCheckedInToday`, `lastCheckInDate`).

Account lists shown in UI surfaces (popup/side panel/options) are driven by the shared `AccountDataProvider` (`features/AccountManagement/hooks/AccountDataContext.tsx`). It loads account data on mount (and when `refreshKey` changes), and it reloads on a small set of runtime notifications (e.g., `AUTO_REFRESH_UPDATE`, `TAG_STORE_UPDATE`). There is currently no notification sent when a background auto check-in run completes, so open UIs can remain stale until a manual refresh or reopening the UI.

The desired behavior is: when auto check-in completes, affected account check-in status should be reflected immediately in any open account list UI, with a user-configurable toggle.

## Goals / Non-Goals

**Goals:**
- After an auto check-in run completes, update open UI surfaces so account lists reflect the latest check-in status without a manual refresh.
- Keep the minimum sync operation granularity account-scoped (refresh only the affected accounts rather than forcing an all-accounts refresh).
- Keep the mechanism best-effort and safe in MV3 service-worker environments (no hard failures when no UI is open).
- Provide a user preference (toggle) to enable/disable post-run UI synchronization.
- Minimize additional network calls by refreshing only affected accounts, and avoid triggering any additional check-in actions solely for UI synchronization.

**Non-Goals:**
- Redesign the auto check-in scheduler semantics or provider behaviors.
- Stream per-account live progress updates to the UI during a run (run-level notification is sufficient).
- Introduce new backend APIs; synchronization is based on the extension’s persisted state.

## Decisions

1. **Broadcast completion via canonical runtime action ID**

   - Add a new canonical runtime action ID under the existing `autoCheckin:` namespace (in `constants/runtimeActions.ts`), e.g. `autoCheckin:runCompleted`.
   - When a run completes, the background will send a best-effort runtime message:
     - `action`: `RuntimeActionIds.AutoCheckinRunCompleted`
     - `runKind`: `daily | manual | retry`
     - `summary`: `AutoCheckinRunSummary` (for optional UI status refresh)
     - `updatedAccountIds`: account IDs whose persisted check-in site status was updated by this run (account-scoped sync target)
     - `timestamp`: milliseconds since epoch

   **Rationale:** the codebase already centralizes stable action IDs (`constants/runtimeActions.ts`) and already uses action-based messages for auto check-in UI-open pretrigger (`AutoCheckinPretriggerStarted`). Using a canonical action ID avoids introducing another ad-hoc `type` string channel and keeps on-the-wire contracts explicit.

   **Alternatives considered:**
   - Reuse the `type: "AUTO_REFRESH_UPDATE"` style notification pattern (like `services/autoRefreshService.ts`). Rejected to avoid duplicating multiple parallel notification conventions for new work.
   - Subscribe UIs to `browser.storage.onChanged` for account storage keys. Rejected for now due to broad blast radius (would reload on any account storage write, not just auto check-in) and higher risk of unintended UI churn.

2. **Trigger notification after persistence is complete**

   - Emit the completion message only after:
     - per-account results have been computed and saved to `autoCheckinStorage`, and
     - account check-in status updates have been applied to `accountStorage`.

   **Rationale:** ensures UIs that reload immediately will observe consistent and up-to-date persisted state.

3. **UI updates are account-scoped with safe fallback**

   - Extend `AccountDataProvider`’s existing `onRuntimeMessage` listener (`features/AccountManagement/hooks/AccountDataContext.tsx`) to handle `RuntimeActionIds.AutoCheckinRunCompleted`.
   - For each `updatedAccountId`, reload that specific account from storage and patch `accounts`/`displayData` in-place so the UI updates without reloading unrelated accounts.
   - If any targeted reload fails (e.g., missing account), fall back to `loadAccountData()` as a consistency-safe recovery path.

   **Rationale:** `AccountDataProvider` is already the single source of truth for account list state across UI surfaces. Account-scoped patching minimizes work for large account lists while still providing a correctness fallback via full reload from persisted storage.

4. **Auto Check-in status views refresh on completion**

   - The Auto Check-in status UI (options page and any other surface that displays status) listens for `RuntimeActionIds.AutoCheckinRunCompleted` and reloads status from background/storage so the latest summary/result is visible immediately.

5. **Preference toggle in `autoCheckin` settings**

   - Add a boolean preference to `AutoCheckinPreferences` (`types/autoCheckin.ts`) and `DEFAULT_PREFERENCES.autoCheckin` (`services/userPreferences.ts`) such as:
     - `notifyUiOnCompletion: boolean`
   - Gate the background notification on this preference.

   **Default:** enable by default. The behavior is low-cost (one message per run) and aligns with user expectation that automation should be visible immediately.

6. **Post-checkin refresh updates balances without re-checking-in**

   - After an execution completes and persisted state has been updated, the background scheduler triggers a best-effort **account data refresh** for accounts whose provider outcome was `success`.
   - This refresh MUST use the existing account refresh mechanism (`accountStorage.refreshAccount(..., force=true)` / `apiService.refreshAccountData`) and MUST NOT call the provider `checkIn` again as part of UI synchronization.
   - Emit `autoCheckin:runCompleted` only after the post-checkin refresh completes (or is skipped) so open UIs see the latest balance/quota changes introduced by a successful check-in.

   **Rationale:** successful check-ins can change user balances/quotas. Refreshing the affected accounts immediately makes balances accurate without requiring a manual refresh and without accidentally granting extra balance by re-running check-in.

## Risks / Trade-offs

- **[Runtime message not delivered]** → Use best-effort `browser.runtime.sendMessage(...)` with error swallowing (same approach as `services/autoRefreshService.ts` and the existing pretrigger-start notification in auto check-in).
- **[UI churn for large account lists]** → Apply account-scoped patches for `updatedAccountIds` and fall back to full reload only when needed.
- **[Mixed notification conventions]** → Prefer action-based canonical IDs for new work; do not attempt to refactor existing `AUTO_REFRESH_UPDATE` notifications within this change.
- **[Race with in-flight UI operations]** → The reload is additive (reads from storage) and should not mutate user edits; if needed later, we can debounce reloads or skip when a dialog/edit flow is active.
- **[Extra network calls after successful check-in]** → Refresh only accounts whose outcome is `success`, run refresh best-effort, and swallow refresh errors so check-in completion semantics are unchanged.

## Migration Plan

1. Add the new `autoCheckin.notifyUiOnCompletion` preference with a default value in `DEFAULT_PREFERENCES`.
2. Extend the auto check-in settings UI to expose the toggle (with i18n keys).
3. Add `RuntimeActionIds.AutoCheckinRunCompleted` and emit it from the background auto check-in scheduler after run completion (only when the toggle is enabled).
4. After successful check-ins, trigger an account-scoped account-data refresh for affected accounts so balances/quota are up to date (best-effort; non-fatal on failure).
5. Update `AccountDataProvider` to listen for the action and apply account-scoped updates (fallback to full reload when needed).
6. Update the Auto Check-in status UI to listen for the action and reload status on completion.
7. Add tests:
   - Scheduler/service test: emits the completion message when enabled (and does not when disabled).
   - Scheduler/service test: successful check-ins trigger an account refresh before broadcasting completion.
   - UI/provider test: `AccountDataProvider` applies account-scoped updates on the completion message.
   - Auto check-in status UI test: status reloads on the completion message (where applicable).

Rollback is safe: disabling the toggle (or reverting the sender/listener) returns behavior to current manual-refresh semantics.

## Open Questions

- Should retry executions (`autoCheckinRetry`) emit the same completion event? **Resolved: yes.**
- Should the Auto Check-in status page also auto-refresh its status view on completion? **Resolved: yes.**
