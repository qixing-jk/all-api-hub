## ADDED Requirements

### Requirement: Pre-trigger today’s daily auto check-in on UI open
The extension MUST support a user preference `autoCheckin.pretriggerDailyOnUiOpen` (default **disabled**) that controls whether opening an extension UI surface attempts to trigger today’s scheduled **daily** auto check-in run early.

#### Scenario: Pre-trigger runs within today’s window
- **GIVEN** auto check-in is enabled and `pretriggerDailyOnUiOpen = true`
- **AND** the normal daily alarm is scheduled for today but has not fired yet
- **AND** the current time is within the configured time window
- **WHEN** the user opens any extension UI surface (popup, side panel, or options)
- **THEN** the scheduler MUST execute the daily run immediately using the same semantics as the scheduled daily alarm
- **AND** the UI MUST show a toast indicating the daily run was triggered early

#### Scenario: No pre-trigger when not eligible
- **GIVEN** `pretriggerDailyOnUiOpen = true`
- **WHEN** the UI opens outside the configured time window, or today’s daily run has already executed, or no daily alarm targets today
- **THEN** the scheduler MUST NOT trigger an early daily run

### Requirement: UI shows a completion dialog for the pre-triggered run
When a UI-open pre-triggered daily run completes and a result is returned to the UI, the UI MUST display a dialog summarizing the run and MUST provide a “View details” button that navigates to the Auto Check-in details page.

#### Scenario: Dialog shows summary + details navigation
- **GIVEN** a daily auto check-in run was triggered early by opening a UI surface
- **WHEN** the run completes
- **THEN** the UI MUST display a dialog with a summary of success/failed/skipped counts
- **AND** the dialog MUST include an action to navigate to the Auto Check-in details view

