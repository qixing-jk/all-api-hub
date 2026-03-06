## Context

The auto check-in scheduler already centralizes daily alarm planning in `src/services/checkin/autoCheckin/scheduler.ts`, and that path is reused by service initialization, settings updates, and post-run rescheduling. The original bug came from deterministic scheduling always rolling a passed fixed time into tomorrow, even when today's daily run had not executed yet and startup recovery happened while the current local time was still inside the configured window.

`pretriggerDailyOnUiOpen` can sometimes rescue a missed run, but it is optional and only works when a UI surface opens during the eligible window. That makes correctness depend on UI activity instead of the background scheduler. Existing status fields such as `lastDailyRunDay`, `nextDailyScheduledAt`, and `dailyAlarmTargetDay` already track whether today's run happened and what day the next alarm targets, so this change can stay within the existing scheduler/state model.

The desired semantics were later narrowed: same-day catch-up should not happen outside the configured window, settings updates should not trigger surprise catch-up runs, and catch-up should not reuse a preserved same-day alarm that no longer matches the desired catch-up time.

## Goals / Non-Goals

**Goals:**
- Guarantee that deterministic startup-style recovery preserves one normal daily execution for the current local day only when today's run has not happened yet, the fixed time has already passed, and the current local time is still inside the configured window.
- Keep the existing once-per-day guardrails, stale-alarm protection, and retry scheduling behavior intact.
- Make the behavior explicit across startup recovery, legacy single-alarm recovery, settings changes, and ordinary rescheduling without depending on UI-open pretrigger behavior.
- Ensure settings changes and ordinary rescheduling remain future-only after the deterministic fixed time has already passed.
- Ensure deterministic catch-up recreates the daily alarm instead of reusing an existing same-day alarm.
- Add focused scheduler tests that lock in the narrowed restore-only behavior.

**Non-Goals:**
- Redesign random scheduling or retry scheduling semantics.
- Add new user preferences, runtime actions, or external dependencies.
- Replace `pretriggerDailyOnUiOpen`; it remains an optional acceleration path rather than the primary correctness mechanism.
- Add new persisted diagnostic fields for missed runs in this change.

## Decisions

### 1. Same-day deterministic catch-up is limited to startup-style recovery while still inside the window

When schedule mode is `deterministic` and `lastDailyRunDay` is not today, the scheduler first evaluates today's deterministic slot. If that slot is still in the future, it remains the next daily alarm. If that slot has already passed, the scheduler only creates a near-immediate daily alarm for today when the recalculation reason is startup-style recovery and the current local time is still inside the configured window. Otherwise it schedules tomorrow's deterministic slot.

This keeps the fix in the one place that already drives startup, settings updates, and post-run rescheduling, while making the caller-specific behavior explicit. It matches the product decision that restore flows may recover today's missed run, but settings edits should not unexpectedly trigger immediate same-day execution.

**Alternatives considered:**
- Keep the current tomorrow rollover for startup recovery too: rejected because it is the bug this change is meant to fix.
- Depend on `pretriggerDailyOnUiOpen` to rescue missed runs: rejected because it requires an open UI and is disabled for some users.
- Allow catch-up during settings save too: rejected because it surprises users who only intended to edit configuration.

### 2. Settings updates and ordinary rescheduling remain future-only after the fixed time

The scheduler should distinguish caller intent instead of sharing one implicit rule for every recalculation path. Startup restore and legacy single-alarm recovery may permit same-day catch-up, but settings updates and ordinary rescheduling should continue with future scheduling only once the fixed deterministic time has already passed.

This avoids changing user expectations during configuration edits and keeps post-run scheduling simple: once today's deterministic slot has been missed outside a restore context, the next eligible slot is tomorrow.

**Alternatives considered:**
- Use one implicit planner behavior for every caller: rejected because startup recovery and user-initiated settings changes have different product expectations.

### 3. Catch-up continues to use the normal daily alarm path and recreates the alarm

The catch-up run is still represented as the standard daily alarm, with `dailyAlarmTargetDay` set to today's local day. `handleAlarm` and the existing daily run path remain responsible for stale-alarm checks, status updates, summary generation, and retry queue construction.

Because catch-up is supposed to happen "as soon as practical", the scheduler recreates the daily alarm instead of trusting an already-preserved same-day alarm that may point much later in the day. Status persistence still flows through `nextDailyScheduledAt`, `dailyAlarmTargetDay`, and the legacy-compatible `nextScheduledAt`.

**Alternatives considered:**
- Introduce a new catch-up alarm type: rejected because it would duplicate daily-run semantics and increase review complexity.
- Call the daily run directly without scheduling an alarm: rejected because it bypasses the existing alarm/status lifecycle and is harder to recover after browser restarts.
- Reuse any same-day preserved alarm during catch-up: rejected because it can silently delay a needed catch-up run.

### 4. Daily planning logic takes explicit caller policy

The original deterministic helper only answered "what time is the deterministic slot for this day?" The daily planner now also needs to know whether the caller is allowed to catch up today. Making that policy explicit keeps the edge case readable and reduces the chance that one reschedule entrypoint silently drifts from the intended semantics.

The persisted state shape does not need to change. Existing fields remain the source of truth for the next planned daily run.

**Alternatives considered:**
- Hide the caller-specific rule inside a more implicit helper: rejected because it would keep the edge case hard to reason about and easy to regress.

### 5. Validation focuses on scheduler tests, not UI changes

The main coverage should live in `tests/services/autoCheckin/scheduler.test.ts`. The critical cases are:
- startup restore after the configured fixed time, while still inside the window, schedules a same-day near-immediate daily alarm and records today's target day
- startup restore after the configured fixed time, but outside the window, schedules tomorrow's deterministic time
- deterministic mode after the configured fixed time, when `lastDailyRunDay` is already today, still schedules tomorrow's fixed time
- settings-driven rescheduling after the fixed time schedules tomorrow instead of catching up today
- deterministic catch-up recreates an existing same-day alarm when the preserved alarm is later than the desired catch-up time
- cross-midnight windows still allow startup restore catch-up when the current time is inside the configured window
- `pretriggerDailyOnUiOpen` remains optional; the scheduler fix stands on its own

This keeps the test surface aligned with the root cause and avoids unnecessary UI churn.

## Risks / Trade-offs

- Users may still miss today's run if startup recovery happens after the window closes. Mitigation: make that limitation explicit in the spec and keep future scheduling deterministic instead of surprising users with outside-window execution.
- Scheduling an alarm for "right now" can race with preference writes or alarm reconciliation. Mitigation: use a small future buffer for the catch-up alarm and continue persisting the actual scheduled time returned by the alarms API.
- Cross-midnight windows are harder to reason about than same-day windows. Mitigation: keep local-day calculations on the existing scheduler helpers and add targeted tests around deterministic missed-run planning.
- Startup recovery with `preserveExisting` could hide stale expectations if an old alarm survives. Mitigation: re-evaluate preserved alarms against the recomputed deterministic plan and recreate them when catch-up is required.
- Split caller semantics can drift if some reschedule entrypoints forget to pass policy. Mitigation: thread an explicit planning option through startup/legacy restore and settings-update callers.

## Migration Plan

No data migration is required because the change reuses the existing auto check-in status shape.

After release, startup restore and legacy alarm recovery will use the new in-window deterministic catch-up rule automatically, while settings updates and ordinary rescheduling will continue to plan future runs after a passed deterministic time. Rolling back only requires reverting the scheduler/spec/test changes; stored timestamps and target-day fields remain compatible.

## Open Questions

None. The implementation can reuse the project's existing short-delay scheduling convention when choosing the near-immediate catch-up alarm time.
