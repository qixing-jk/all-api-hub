# daily-balance-history Specification

## Purpose
TBD - created by archiving change record-daily-balance. Update Purpose after archive.
## Requirements
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

The page MUST support multi-account selection and MUST be able to visualize per-account data without requiring complete day coverage across all selected accounts.

The page MUST provide a way to select a visualization metric for the selected accounts and date range, including at minimum:
- balance
- income
- outcome
- net change

The page MUST provide chart form choices appropriate to the visualization, including at minimum:
- trend chart: line or bar
- account breakdown chart: pie or histogram-style bar

The page MUST provide a way to switch the trend series scope between:
- per-account series
- a total (sum) series across selected accounts

When showing the total series, the system MUST compute totals on a best-effort basis by summing available account values per day (missing values MUST NOT blank the entire day).

The page MUST inform the user when the total series may be incomplete due to partial coverage.

The page MUST provide a single unified table that lists multiple accounts together for the selected date range.

#### Scenario: Multi-account balance trend renders per-account series (not only an aggregate)
- **GIVEN** the user selects multiple accounts
- **WHEN** the user views the balance trend for a date range where at least one selected account has snapshots
- **THEN** the system MUST render a trend chart that includes a distinct series per selected account
- **AND** missing snapshots for an account/day MUST be rendered as gaps for that account's series without preventing other account series from rendering

#### Scenario: Multi-account view is not blank due to incomplete coverage
- **GIVEN** the user selects multiple accounts
- **AND** at least one selected account has at least one snapshot in the selected date range
- **WHEN** the user views the balance trend for that date range
- **THEN** the system MUST render at least one non-empty per-account series on the chart

#### Scenario: User switches the trend chart type (line vs bar)
- **GIVEN** the Balance History trend chart is visible
- **WHEN** the user switches the trend chart type between line and bar
- **THEN** the system MUST update the chart to the selected form without changing the selected accounts, date range, or metric

#### Scenario: User switches the visualization metric
- **GIVEN** the Balance History trend chart is visible
- **WHEN** the user switches the visualization metric (balance, income, outcome, net change)
- **THEN** the system MUST update the trend chart to visualize the selected metric for the selected accounts and date range

#### Scenario: User switches the trend scope (per-account vs total)
- **GIVEN** the Balance History trend chart is visible
- **WHEN** the user switches the trend scope between per-account and total
- **THEN** the system MUST update the chart to the selected scope without changing the selected accounts, date range, or metric

#### Scenario: Total trend series uses best-effort aggregation and warns on incomplete coverage
- **GIVEN** the user selects multiple accounts
- **AND** the user switches the trend scope to total
- **WHEN** at least one day in the selected range has values for fewer than all selected accounts
- **THEN** the system MUST render a total trend series that sums available account values per day
- **AND** the system MUST inform the user that totals may be underestimated on partially covered days

#### Scenario: User switches the account breakdown chart type (pie vs histogram)
- **GIVEN** the Balance History page displays an account breakdown visualization for the current selection
- **WHEN** the user switches the breakdown chart type between pie and histogram-style bar
- **THEN** the system MUST render the same breakdown metric across accounts using the selected chart form

#### Scenario: User selects the balance breakdown reference date
- **GIVEN** the Balance History page displays an account breakdown visualization
- **AND** the breakdown metric is balance
- **WHEN** the user changes the breakdown reference date within the selected range
- **THEN** the system MUST render the balance breakdown using the selected reference date values across accounts

#### Scenario: Pie breakdown is unavailable for negative values
- **GIVEN** the selected breakdown metric can yield negative values
- **WHEN** any breakdown value across accounts is negative
- **THEN** the system MUST disable the pie chart option and provide a histogram-style bar alternative
- **AND** the system MUST inform the user why the pie chart is unavailable

#### Scenario: User views a unified multi-account table for the selected range
- **GIVEN** the user selects one or more accounts and a date range
- **WHEN** the user views the Balance History page
- **THEN** the system MUST display a single table that includes one row per selected account summarizing the selected date range

#### Scenario: User refreshes to update today's snapshot
- **WHEN** the user triggers a refresh action from the Balance History page
- **THEN** the system MUST attempt to refresh accounts and update today's snapshot on success

