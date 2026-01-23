# Proposal: Pre-trigger daily auto check-in on UI open

## Why
Auto check-in is currently driven by a scheduled daily alarm. When users open the extension UI (popup/side panel/options), they may want today’s planned daily check-in to run immediately instead of waiting for the scheduled time.

This change adds an **early trigger** for the already-scheduled daily alarm. It is intentionally **unrelated to retry logic** and does not change eligibility, provider behavior, or retry scheduling rules.

## What Changes
- Add a new preference toggle under the sign-in/auto-checkin settings: `autoCheckin.pretriggerDailyOnUiOpen` (default **enabled**).
- When an extension UI surface is opened:
  - If the daily run is scheduled for **today**, the current time is **within the configured time window**, and today’s daily run has **not** executed yet, the UI triggers the daily run immediately via the existing scheduler path.
  - Show a toast when the early trigger fires.
  - When the run completes and the result is returned to the UI, show a dialog summarizing the result and provide a “View details” button that navigates to the Auto Check-in details page.

## Scope Notes
- No changes to retry behavior (alarm names, retry queue, max attempts, etc.).
- No changes to manual “Run now” behavior beyond reusing the same result rendering primitives if helpful.
- No new provider logic; the scheduler continues to own execution.
- The early trigger is an **opt-in preference** (enabled by default) and can be disabled in settings.

## Impact
- UX: Users get a clear indication that auto check-in has started (toast) and a post-run summary (dialog) with a direct link to details.
- Reliability: Users can force today’s planned run to happen while they are actively using the extension, reducing missed runs due to sleeping devices/background suspension.

## Risks / Mitigations
- **Duplicate triggers** (multiple UI surfaces opened, or alarm fires during the early-trigger run): add a minimal background-side guard so only one daily run can be in-flight for a given day.
- **Popup closure** (user closes popup before completion): dialog may not be visible; status remains persisted and accessible from the Auto Check-in page.

## Decisions
- Early triggering runs **only within** the configured time window.
- “View details” navigates to the **Options → Auto Check-in** page (existing navigation helper).

## Validation
- Add unit tests for the new background message/action that conditionally triggers the daily run.
- Add UI tests verifying:
  - toast is shown when an early trigger occurs, and
  - completion dialog renders with a “View details” button.
- Run `openspec validate add-auto-checkin-pretrigger-on-ui-open --strict` before implementation.
