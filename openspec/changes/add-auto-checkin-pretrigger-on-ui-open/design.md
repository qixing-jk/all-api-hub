# Design: UI-open pre-trigger for daily auto check-in

## Goals
- Provide a user-controlled, default-on way to trigger today’s **scheduled daily** auto check-in early when any extension UI surface opens.
- Keep the change tightly scoped: do not change retry behavior, provider semantics, or scheduling rules beyond “run earlier than the planned daily alarm time”.
- Provide user feedback:
  - toast when early trigger fires
  - dialog on completion with summary + navigation to details

## Non-goals
- Push/system notifications when no UI is open.
- Changing the time window semantics for normal daily runs (proposed: only pre-trigger when current time is within window).
- Introducing new provider implementations.

## Proposed Flow

### UI (popup/sidepanel/options)
1. On UI mount (shared hook), read preferences from `UserPreferencesContext`.
2. If `autoCheckin.pretriggerDailyOnUiOpen` is enabled:
   - send a runtime message to background (e.g., `autoCheckin:pretriggerDailyOnUiOpen`).
3. If the response indicates a run was started:
   - show a toast (“Auto check-in started”).
4. When the response returns the run summary:
   - open a dialog showing counts (eligible/executed/succeeded/failed/skipped) and a “View details” button.
   - “View details” navigates to the Auto Check-in page (existing navigation helper).

### Background (scheduler)
1. Handle the new runtime message action in `handleAutoCheckinMessage`.
2. The scheduler checks:
   - global auto-checkin enabled
   - daily alarm exists and targets **today**
   - current time is within the configured time window
   - today’s daily run has not executed yet
3. If eligible, it triggers the existing daily alarm execution path (same run type as `handleDailyAlarm`) and returns a summary payload to the UI.
4. Add a minimal in-flight guard so that if the alarm fires while a UI-open-triggered daily run is running, the second trigger is ignored/no-ops.

## Result Payload
Return a small payload to UI sufficient to render:
- whether an early trigger occurred
- a run summary object (counts + needsRetry flag)
- optionally, an overall run result enum (success/partial/failed)

