## MODIFIED Requirements

### Requirement: Normal auto check-in runs once per day
When auto check-in is enabled, the extension MUST schedule and execute at most one **normal** auto check-in run per local calendar day.

For schedule mode `random`, when today's normal auto check-in run has not executed yet, the next normal auto check-in schedule MUST remain inside the current day's remaining configured time window.

For schedule mode `deterministic`, when today's normal auto check-in run has not executed yet, the scheduler MUST first evaluate today's deterministic slot. If the configured deterministic time has not passed yet, the scheduler MUST schedule that exact time today.

If the configured deterministic time has already passed, the scheduler MUST follow the recalculation context:
- during startup-style recovery, including legacy single-alarm recovery, the scheduler MUST schedule one same-day catch-up run as soon as practical only when the current local time is still inside the configured window
- during settings updates or ordinary rescheduling, the scheduler MUST schedule the next eligible future deterministic slot instead of catching up today
- if the configured deterministic time has already passed and the current local time is outside the configured window, the scheduler MUST schedule the next eligible future deterministic slot instead of catching up today

When deterministic catch-up is required, the scheduler MUST recreate the daily alarm instead of reusing an existing same-day alarm that does not match the desired catch-up schedule.

After the normal auto check-in run has executed for the current local day, the next normal auto check-in schedule MUST target the next eligible day.

#### Scenario: Random schedule does not reschedule the same day
- **GIVEN** auto check-in is enabled with schedule mode `random`
- **WHEN** the normal auto check-in run completes successfully within today's window
- **THEN** the next normal auto check-in schedule MUST target the next day's window (not later today)

#### Scenario: Deterministic schedule runs once per day
- **GIVEN** auto check-in is enabled with schedule mode `deterministic` at `09:00`
- **WHEN** the normal auto check-in run completes at `09:05` today
- **THEN** the next normal auto check-in schedule MUST be `09:00` tomorrow

#### Scenario: Startup restore catches up the same day after the fixed time passes while still inside the window
- **GIVEN** auto check-in is enabled with schedule mode `deterministic` at `08:30`
- **AND** today's normal auto check-in run has not executed
- **AND** the configured window is `08:00-12:00`
- **AND** the current local time is `10:00` during startup recovery
- **WHEN** the scheduler recalculates the next normal auto check-in schedule
- **THEN** the next normal auto check-in schedule MUST target today, not tomorrow
- **AND** the scheduler MUST plan the run as soon as practical

#### Scenario: Startup restore outside the window schedules tomorrow
- **GIVEN** auto check-in is enabled with schedule mode `deterministic` at `08:30`
- **AND** today's normal auto check-in run has not executed
- **AND** the configured window is `08:00-09:00`
- **AND** the current local time is `10:00` during startup recovery
- **WHEN** the scheduler recalculates the next normal auto check-in schedule
- **THEN** the next normal auto check-in schedule MUST target tomorrow's deterministic slot
- **AND** the scheduler MUST NOT schedule a same-day catch-up run outside the configured window

#### Scenario: Missed deterministic startup recovery does not depend on UI-open pre-trigger
- **GIVEN** auto check-in is enabled with schedule mode `deterministic`
- **AND** today's normal auto check-in run has not executed
- **AND** the configured deterministic time has already passed today
- **AND** the current local time is still inside the configured window
- **AND** `pretriggerDailyOnUiOpen = false`
- **WHEN** startup recovery recalculates the next normal auto check-in schedule
- **THEN** the next normal auto check-in schedule MUST still target today
- **AND** the scheduler MUST NOT require a UI-open pre-trigger to preserve today's daily run

#### Scenario: Reconfiguration after the deterministic time schedules a future run
- **GIVEN** today's normal auto check-in run has not executed
- **AND** the current local time is after the configured deterministic time
- **WHEN** the user enables deterministic scheduling, re-enables global auto check-in, or changes `deterministicTime`
- **THEN** the next normal auto check-in schedule MUST target the next eligible future deterministic slot
- **AND** the scheduler MUST NOT trigger a same-day catch-up run solely because the fixed time already passed

#### Scenario: Deterministic catch-up recreates a preserved same-day alarm
- **GIVEN** startup recovery determines that a deterministic same-day catch-up is required
- **AND** an existing daily alarm already targets today but is scheduled later than the desired catch-up time
- **WHEN** the scheduler recalculates the next normal auto check-in schedule
- **THEN** the scheduler MUST recreate the daily alarm for the catch-up time
- **AND** the stored daily target-day metadata MUST remain synchronized with the recreated alarm

#### Scenario: Cross-midnight startup recovery may still catch up when the current time is inside the window
- **GIVEN** auto check-in is enabled with schedule mode `deterministic` at `00:30`
- **AND** today's normal auto check-in run has not executed
- **AND** the configured window is `23:00-02:00`
- **AND** the current local time is `01:00` during startup recovery
- **WHEN** the scheduler recalculates the next normal auto check-in schedule
- **THEN** the next normal auto check-in schedule MUST target today
- **AND** the scheduler MUST plan the run as soon as practical
