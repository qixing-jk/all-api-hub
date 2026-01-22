# Proposal: Update auto check-in to run once per day with account-level retries

## Why
Auto check-in currently triggers multiple times per day in normal (non-retry) scheduling, and the retry mechanism reruns *all* runnable accounts instead of only retrying failed ones. This leads to duplicate check-in attempts, unnecessary network traffic, and noisy/incorrect history.

## What Changes
- Ensure the **normal auto check-in** job runs **at most once per day** (per configured time window and schedule mode).
- Add a **separate retry alarm** that:
  - retries **only accounts that failed** in the normal run,
  - tracks retry attempts **per account per day**, and
  - does **not** reschedule/replace the normal daily alarm.
- Do **not** rely on `checkIn.siteStatus.isCheckedInToday` for eligibility (untrusted); treat provider outcomes (including `already_checked`) as the source of truth and exclude those accounts from retries.
- Extend stored status so the UI can distinguish the next normal schedule vs. the next retry schedule (optional but recommended for transparency).

## Scope Notes
- This change targets **site check-in** (provider-based `checkIn.siteStatus`), not custom check-in flows.
- “Once per day” applies to the **normal scheduled** run; retries are separate and only for failed accounts.
- Manual actions (Run Now / Retry Account) remain available for debugging and one-off recovery.

## Impact
- Reliability: Fewer duplicate check-in attempts; retries focus on actual failures.
- Performance: Reduced redundant requests, especially with many accounts.
- UX: Status/history becomes easier to interpret (one normal run/day + targeted retries).

## Risks / Mitigations
- **State migration complexity** (new retry queue fields): keep new fields optional and treat missing values as “no retries pending”.
- **Multi-device duplicate check-ins** (WebDAV sync across devices): not fully solvable in-extension; mitigate by ensuring per-device scheduling is once/day and by skipping already-checked accounts.
- **Behavior change for random mode**: random scheduling becomes “pick one time per day”, matching docs and user expectations.

## Open Questions
- Should “today” for once-per-day semantics be based on **local time** or **UTC**? (Current code uses UTC date strings while scheduling uses local times.)
- Should `maxAttemptsPerDay` be enforced strictly **per account** (recommended) or as a global cap?

## Validation
- Unit tests for scheduler selection, alarm scheduling, and retry queue behavior (success, partial, failure, max-attempt cutoff).
- Update docs (`docs/docs/auto-checkin.md` and translations if applicable) to reflect the daily+retry alarm model.
- Run `openspec validate update-auto-checkin-daily-retry --strict` before implementation.
