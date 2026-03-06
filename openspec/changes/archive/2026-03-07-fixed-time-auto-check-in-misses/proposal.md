## Why

Fixed-time auto check-in can currently skip the current day during startup or alarm recovery when the configured deterministic time has already passed and no daily run has happened yet. That causes the scheduler to jump straight to tomorrow even when the browser restored while the current local time is still inside today's eligible window.

At the same time, broad same-day catch-up on settings edits is surprising. This change therefore narrows the behavior: startup-style recovery may catch up today when still inside the configured window, while settings-driven rescheduling remains future-only after the fixed time has passed.

## What Changes

- Update deterministic daily scheduling so startup/legacy restore may schedule one same-day catch-up only when today's daily run has not executed yet, the fixed time already passed, and the current local time is still inside the configured window.
- Define the expected split between startup-style recovery and settings-driven rescheduling after the fixed time has passed: recovery may catch up today, while settings changes continue with future scheduling only.
- Clarify that deterministic catch-up recreates the daily alarm instead of reusing an existing same-day alarm, while keeping stored next-run metadata in sync.
- Clarify how restore-only catch-up interacts with the existing `pretriggerDailyOnUiOpen` behavior so startup correctness does not depend on UI activity.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `auto-checkin`: Change deterministic daily scheduling requirements so startup-style recovery may preserve one eligible daily execution for the current local day when still inside the configured window, while settings-driven recalculation after the fixed time continues to schedule the next eligible future run.

## Impact

- Affects the auto check-in scheduler and related status/next-run planning in `src/services/checkin/autoCheckin/scheduler.ts`.
- Likely requires updates to scheduler tests covering startup restore catch-up, outside-window rollover, same-day alarm recreation, cross-midnight windows, and settings-update future scheduling.
- No external API, permission, or dependency changes are expected.
