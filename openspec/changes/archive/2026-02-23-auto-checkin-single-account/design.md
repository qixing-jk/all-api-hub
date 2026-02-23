## Context

The extension already supports:

- Scheduled daily auto check-in runs via `autoCheckinScheduler` (alarms-based).
- Manual “Run now” execution from the Auto Check-in options page (`autoCheckin:runNow`).
- Best-effort UI synchronization after executions via `autoCheckin:runCompleted`, where account list UIs reload `updatedAccountIds`.

However, there is no fast path for users who only want to check in a single account without running the full eligible set.

## Goals / Non-Goals

**Goals:**

- Allow a user to trigger an on-demand auto check-in run scoped to a single account (or small explicit list), without changing the existing `autoCheckin:runNow` behavior for callers that do not pass a target.
- Surface a per-account “Quick check-in” entry point in account list UIs.
- Reuse existing background execution flow (providers, persistence, post-checkin account refresh, `runCompleted` broadcast) to keep the change incremental and low-risk.

**Non-Goals:**

- Introduce a new “check-in history” system beyond the existing “last run status” stored in `autoCheckinStorage`.
- Add new provider implementations or expand site compatibility as part of this change.
- Change retry semantics for daily runs; scoped manual runs continue to follow the current “no new retry queue” behavior.

## Decisions

1) Extend `autoCheckin:runNow` to support optional targeting

- Keep the existing runtime action ID (`RuntimeActionIds.AutoCheckinRunNow`) stable.
- Extend its request payload to include an optional `accountIds: string[]`.
- In the background handler (`handleAutoCheckinMessage`), pass the target list through to `autoCheckinScheduler.runCheckins(...)`.
- Backward compatibility: callers that send `{ action: autoCheckin:runNow }` continue to run the full eligible set.

2) Add a scoped execution parameter to the scheduler

- Extend `AutoCheckinScheduler.runCheckins` to accept an optional target account list (e.g. `targetAccountIds`).
- Filter the runnable execution set to the intersection of (eligible accounts) ∩ (target list), while preserving existing eligibility checks (global enabled, account disabled, detection enabled, per-account auto-checkin enabled, provider availability/readiness).
- Keep post-run behavior unchanged:
  - Best-effort refresh for successfully checked-in accounts (account-scoped).
  - Best-effort `autoCheckin:runCompleted` broadcast with `updatedAccountIds` for UI surfaces.
  - `scheduleNextRun({ preserveExisting: true })` after manual runs so daily scheduling remains intact.

3) UI entry point lives in per-account actions

- Add a “Quick check-in” action to account card actions (dropdown menu) to keep the flow discoverable and consistent with other per-account actions.
- When clicked, the UI sends `{ action: autoCheckin:runNow, accountIds: [<accountId>] }` and shows a toast-based loading message.
- After the run completes, the UI fetches the latest `autoCheckin:getStatus` best-effort, derives the per-account message, and shows a toast success/error based on that result (falling back to a generic completion message when status is unavailable).
- As a best-effort UI sync, the account list triggers a data reload after completion. The existing `autoCheckin:runCompleted` listener in `AccountDataContext` still reloads `updatedAccountIds` when the broadcast is available/enabled.

## Risks / Trade-offs

- [Scoped manual run overwrites “last run” status] → Mitigation: treat this as expected behavior for “last run”; optionally display a lightweight UI hint in the Auto Check-in page when the last run was targeted (deferred unless confusion is observed).
- [Concurrent executions (daily/retry/manual) race] → Mitigation: keep the scheduler’s existing execution guard behavior; scoped runs should fail fast with a user-visible error when a run is already in progress.
- [Eligibility surprises (global disabled / per-account disabled)] → Mitigation: reuse current eligibility rules; disable the UI action when the account is disabled and show an explanatory tooltip/toast message on failure.

## Migration Plan

- No data migration is required. The change is backward compatible: existing callers of `autoCheckin:runNow` remain valid.

## Open Questions

- Should a scoped “Quick check-in” be allowed when `autoCheckin.globalEnabled = false`, or must it follow current “global disabled → skip” behavior? (Default for incremental change: follow existing behavior.)
