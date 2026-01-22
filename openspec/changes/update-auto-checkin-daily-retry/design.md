# Design: Daily auto check-in + account-level retries

## Goals
- Normal auto check-in executes at most once per day within the configured window.
- Retry runs are driven by a separate alarm and only retry accounts that actually failed.
- “Already checked today” is treated as not runnable (no provider calls).
- Status reporting is clear enough for the options UI to display the next daily run and any pending retry schedule.

## Non-goals
- Cross-device deduplication (e.g., preventing duplicates across multiple browsers syncing via WebDAV).
- Adding new provider implementations or changing provider request/response semantics.
- Changing custom check-in flows (this design focuses on provider-based site check-in).

## Current Issues (Observed)
- Normal scheduling in random mode can schedule repeated runs within the same day/window.
- Retry scheduling is global and triggers a full re-run instead of focusing on failed accounts.
- Runnable selection does not currently skip accounts already marked as checked-in today.

## Proposed Architecture

### Two alarms, two responsibilities
- **Daily alarm**: schedules the normal run (once/day).
- **Retry alarm**: schedules retry runs as-needed for a subset of accounts.

Key invariant: scheduling the retry alarm MUST NOT modify or replace the next daily alarm time.

### Account-scoped retry state
Maintain retry metadata per account, including:
- whether the account is currently pending retry,
- retry attempt count for the current day,
- last retry attempt timestamp (optional, for debugging and scheduling).

This lets retry executions target only failed accounts and enforce per-account limits.

## Scheduling Rules

### Daily scheduling
- When enabled, schedule the next daily run:
  - If “today’s daily run” has not executed yet, schedule within today’s window (deterministic or random).
  - If it has executed, schedule within the next day’s window.
- On background restarts, preserve an existing daily alarm if present (avoid re-randomizing).

### Retry scheduling
- A retry is scheduled only when there are retry-eligible accounts and retries are enabled.
- Each retry execution:
  - re-evaluates account eligibility (enabled, detection on, auto-checkin enabled, provider ready, not checked today),
  - attempts only the remaining failed accounts,
  - updates per-account attempt counts and clears successful accounts from the retry set,
  - schedules the next retry run only if at least one account remains eligible and under the per-day limit.

## Execution Rules (Eligibility)
For both daily and retry executions, an account is runnable only if:
- account is not disabled,
- `checkIn.enableDetection` is enabled,
- account-level “auto check-in enabled” toggle is enabled,
- a provider exists and `provider.canCheckIn(account)` returns true,
- `checkIn.siteStatus.isCheckedInToday` is NOT used for eligibility because it is untrusted; if the site has already checked-in today, the provider MUST return `already_checked` and the scheduler will treat it as non-failure (and exclude it from retries).

## Status Reporting
Extend stored status to support:
- next scheduled daily run time,
- next scheduled retry run time (if any),
- whether retry is pending and which accounts remain pending retry,
- last run timestamps and per-account last results (existing behavior).

The UI can then render:
- “Next daily: …”
- “Retry pending / next retry: …”

## Open Decisions
- **Day boundary**: Current tracking uses UTC date strings while scheduling uses local times. Decide whether “today” should be local or UTC to align once-per-day behavior with user expectation.
- **Limits**: Interpret `maxAttemptsPerDay` as per-account (recommended by request) vs global cap (current behavior).
