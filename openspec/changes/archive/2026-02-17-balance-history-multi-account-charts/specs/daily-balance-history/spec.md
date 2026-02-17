## MODIFIED Requirements

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

