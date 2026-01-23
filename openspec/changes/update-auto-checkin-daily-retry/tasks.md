## 1. Spec + status model
- [x] 1.1 Extend `AutoCheckinStatus` to represent daily vs retry scheduling (separate next-scheduled fields + pending retry accounts)
- [x] 1.2 Track retry attempts per account per day (data structure + defaults/back-compat)
- [x] 1.3 Define and implement a single “scheduler day” boundary used consistently for daily runs, retry scoping, and stale-alarm checks

## 2. Alarm scheduling (daily)
- [x] 2.1 Introduce distinct alarm names for normal daily runs vs retry runs
- [x] 2.2 Update scheduler initialization to restore both alarms idempotently on background restarts
- [x] 2.3 Fix random scheduling to select a single daily trigger time (not repeated within the same day)
- [x] 2.4 Ensure completing a daily run always schedules the next daily run for the next day’s window
- [x] 2.5 Add a stale-alarm guard: if a daily alarm fires for a non-today target day, do not execute and reschedule

## 3. Eligibility and “already checked” guard
- [x] 3.1 Do not use `checkIn.siteStatus.isCheckedInToday` for eligibility; rely on provider outcomes and exclude `already_checked` accounts from retries
- [x] 3.2 Ensure skipped/disabled accounts never invoke providers (and remain excluded from snapshots where required)

## 4. Retry system (account level)
- [x] 4.1 Build and persist a retry queue from failed accounts only
- [x] 4.2 Implement retry alarm handler to retry only queued accounts, re-evaluating eligibility at execution time
- [x] 4.3 Enforce per-account `maxAttemptsPerDay` and stop scheduling retries when done/exhausted
- [x] 4.4 Guarantee retry scheduling never overrides the next daily alarm schedule
- [x] 4.5 Scope retries to today’s normal run only; clear retry state and cancel retry alarm on day change or when no normal run happened today

## 5. UI + i18n
- [x] 5.1 Update Auto Check-in status UI to show next daily schedule and next retry schedule (when applicable)
- [x] 5.2 Add/update i18n strings for new retry/daily scheduling labels

## 6. Documentation
- [x] 6.1 Update `docs/docs/auto-checkin.md` to match “daily run + separate retry alarm” behavior
- [x] 6.2 Update translated docs (`docs/docs/en`, `docs/docs/ja`) if they describe scheduling semantics

## 7. Tests + validation
- [x] 7.1 Add unit tests for: daily scheduling, “already checked” skip, and account-level retry queue/limits
- [x] 7.2 Run `openspec validate update-auto-checkin-daily-retry --strict`
- [x] 7.3 Run `pnpm test:ci` and confirm critical paths are covered (report coverage gap + follow-up plan if below target)
