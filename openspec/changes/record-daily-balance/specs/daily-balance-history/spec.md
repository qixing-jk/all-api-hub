# daily-balance-history Specification

## Purpose

Provide a long-range, privacy-safe visualization of account balance and daily cashflow by persisting lightweight per-day snapshots derived from upstream refresh data.

## ADDED Requirements

### Requirement: Balance history is opt-in

The system MUST provide a persisted global preference to enable/disable the Balance History capability.

The default value MUST be disabled.

When disabled, the system MUST NOT record daily snapshots and MUST NOT schedule end-of-day capture.

#### Scenario: Feature is disabled by default

- **WHEN** the extension loads preferences and the Balance History preference has no stored value
- **THEN** the system MUST treat Balance History as disabled

#### Scenario: Disabled feature does not write snapshots

- **WHEN** an account refresh completes successfully while Balance History is disabled
- **THEN** the system MUST NOT create or update any daily snapshots

### Requirement: Persist daily snapshots from upstream refresh data

When Balance History is enabled, the system MUST persist a per-account daily snapshot keyed by the local calendar day (`YYYY-MM-DD`).

Each snapshot MUST include, at minimum:

- remaining quota/balance (`quota`)
- today income (`today_income`) as computed by upstream refresh (recharge/system logs)
- today outcome (`today_quota_consumption`) as computed by upstream refresh (consume logs)
- `capturedAt` timestamp
- a capture `source` (e.g., manual refresh vs scheduled capture)

The system MUST NOT infer `today_income` or `today_quota_consumption` from balance deltas in this capability.

#### Scenario: Successful account refresh updates today's snapshot

- **WHEN** Balance History is enabled and an account refresh completes successfully and returns quota and today cashflow values
- **THEN** the system MUST upsert the snapshot for that account and local day with the returned values and `source=refresh`

#### Scenario: Refresh failure does not create a snapshot

- **WHEN** an account refresh fails
- **THEN** the system MUST NOT create or update the daily snapshot for that account

### Requirement: Best-effort end-of-day capture is opt-in

The system MUST provide a separate persisted preference to control best-effort end-of-day capture for Balance History.

The default value MUST be disabled.

#### Scenario: End-of-day capture is disabled by default

- **WHEN** the extension loads preferences and the end-of-day capture preference has no stored value
- **THEN** the system MUST treat end-of-day capture as disabled

#### Scenario: Disabled end-of-day capture does not schedule alarms

- **WHEN** end-of-day capture is disabled
- **THEN** the system MUST NOT schedule a Balance History end-of-day alarm

### Requirement: Best-effort end-of-day capture stores snapshots using real today stats

When Balance History is enabled and end-of-day capture is enabled, the system MUST attempt to capture a near end-of-day snapshot for each account on a best-effort basis.

#### Scenario: Alarms-supported browsers schedule a daily capture

- **WHEN** Balance History is enabled, end-of-day capture is enabled, and the background context initializes on a browser that supports the Alarms API
- **THEN** the system MUST schedule a daily alarm intended to run near the end of the local day

#### Scenario: Daily capture stores snapshots using real today stats

- **WHEN** the daily capture alarm fires
- **THEN** the system MUST perform an account refresh that includes fetching today cashflow values and persist snapshots with `source=alarm`

#### Scenario: Alarms-unsupported browsers rely on refresh-driven capture

- **WHEN** the browser does not support the Alarms API
- **THEN** the system MUST NOT require a daily alarm and MUST continue capturing snapshots on successful refreshes (when Balance History is enabled)

### Requirement: Cashflow fetch behavior respects user settings

The system MUST respect the existing `showTodayCashflow` preference for refresh-driven snapshot capture.

The system MUST NOT force fetching today cashflow values during normal refresh-driven capture solely for Balance History.

When end-of-day capture is enabled, the scheduled capture MUST include fetching today cashflow values regardless of `showTodayCashflow`.

#### Scenario: Refresh-driven capture respects showTodayCashflow

- **WHEN** Balance History is enabled and a refresh-driven snapshot capture occurs
- **THEN** the refresh request MUST respect the current `showTodayCashflow` preference for whether to fetch today cashflow values

#### Scenario: Scheduled end-of-day capture fetches today cashflow values

- **WHEN** Balance History end-of-day capture is enabled and the scheduled capture refresh runs
- **THEN** the refresh request MUST include fetching today cashflow values even if `showTodayCashflow` is disabled

### Requirement: User is informed when income/outcome history will be empty

When Balance History is enabled, and `showTodayCashflow` is disabled, and end-of-day capture is disabled, the system MUST inform the user that income/outcome history will not be populated.

The message MUST recommend enabling either `showTodayCashflow` or end-of-day capture.

#### Scenario: Warning is shown when both data sources are disabled

- **WHEN** the user opens the Balance History page with `showTodayCashflow=false` and end-of-day capture disabled
- **THEN** the page MUST display a warning explaining income/outcome history will be empty and recommend enabling one of the two options

#### Scenario: Warning is hidden when at least one data source is enabled

- **WHEN** the user opens the Balance History page and either `showTodayCashflow=true` or end-of-day capture is enabled
- **THEN** the page MUST NOT display the warning about missing income/outcome history

### Requirement: Snapshot retention and pruning

The system MUST enforce a user-configurable retention window for daily snapshots.

#### Scenario: Prune snapshots when retention decreases

- **WHEN** the user decreases the retention window
- **THEN** the system MUST prune snapshots older than the new cutoff

#### Scenario: Prune snapshots during normal operation

- **WHEN** a snapshot is persisted
- **THEN** the system MUST prune snapshots older than the configured retention window

### Requirement: Balance History options page

The system MUST provide a dedicated Options page to visualize the stored daily snapshots.

#### Scenario: User views balance trend for a time range

- **WHEN** the user opens the Balance History page and selects a date range
- **THEN** the system MUST render a chart showing daily balance over that range for the selected accounts

#### Scenario: User views daily income and outcome for a time range

- **WHEN** the user selects a date range on the Balance History page
- **THEN** the system MUST render charts showing daily income and daily outcome over that range for the selected accounts

#### Scenario: User refreshes to update today's snapshot

- **WHEN** the user triggers a refresh action from the Balance History page
- **THEN** the system MUST attempt to refresh accounts and update today's snapshot on success
