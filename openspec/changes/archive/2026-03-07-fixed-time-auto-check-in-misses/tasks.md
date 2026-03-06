## 1. Scheduler catch-up logic

- [x] 1.1 Update deterministic daily planning in `src/services/checkin/autoCheckin/scheduler.ts` so it distinguishes later-today fixed time, startup-only in-window catch-up, and tomorrow rollover when today already ran or catch-up is ineligible.
- [x] 1.2 Thread explicit planning input through startup/legacy restore and settings updates, and recreate same-day alarms during catch-up while keeping `nextDailyScheduledAt`, `dailyAlarmTargetDay`, and legacy `nextScheduledAt` in sync.
- [x] 1.3 Keep ordinary rescheduling independent of `pretriggerDailyOnUiOpen` and align legacy single-alarm recovery with startup restore semantics.

## 2. Deterministic regression tests

- [x] 2.1 Extend `tests/services/autoCheckin/scheduler.test.ts` to cover startup restore outside-window rollover and cross-midnight in-window catch-up.
- [x] 2.2 Add/adjust tests for the guardrails around the fix: ran-today still schedules tomorrow, settings-driven rescheduling after a passed deterministic time schedules tomorrow, and same-day catch-up recreates preserved alarms when needed.

## 3. Validation

- [x] 3.1 Run `openspec validate fixed-time-auto-check-in-misses --strict`.
- [x] 3.2 Run the targeted auto check-in scheduler tests and confirm the narrowed restore-only deterministic scenarios pass.
