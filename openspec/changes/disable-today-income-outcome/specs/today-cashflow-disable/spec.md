# today-cashflow-disable Specification

## Purpose
Allow users to disable “today” cashflow/usage statistics (today consumption/outcome + today income, and related today token/request counts) across the extension UI, and ensure the extension skips the related network fetch logic while keeping balance/quota refresh and check-in features working.

## Requirements

### Requirement: Persisted today cashflow toggle
The system MUST provide a persisted user preference flag `showTodayCashflow` that controls whether “today” cashflow/usage statistics are displayed and fetched.

#### Scenario: Missing preference defaults to enabled
- **GIVEN** a user has stored preferences created before `showTodayCashflow` existed (no `showTodayCashflow` field)
- **WHEN** the extension loads user preferences
- **THEN** the extension MUST treat `showTodayCashflow` as enabled (`true`)

#### Scenario: Preference is durable
- **GIVEN** a user sets `showTodayCashflow = false`
- **WHEN** the extension is restarted or preferences are reloaded
- **THEN** the extension MUST keep `showTodayCashflow = false`

### Requirement: Disabled toggle hides today statistics in UI
When `showTodayCashflow = false`, the extension MUST NOT display “today” cashflow/usage statistics anywhere in the UI.

“Today statistics” include at minimum:
- today consumption/outcome (quota consumption)
- today income
- today prompt tokens / completion tokens
- today request count (if shown)

#### Scenario: Popup hides today statistics
- **GIVEN** `showTodayCashflow = false`
- **WHEN** the popup dashboard renders account summary widgets
- **THEN** the popup MUST NOT render today consumption/outcome, today income, or today token statistics

#### Scenario: Account list hides today statistics
- **GIVEN** `showTodayCashflow = false`
- **WHEN** the account management list renders account rows and headers
- **THEN** the list MUST NOT render today consumption/outcome or today income columns/values

### Requirement: Disabling today cashflow skips related network requests
When `showTodayCashflow = false`, any account refresh flow MUST skip network requests whose sole purpose is to compute today cashflow/usage statistics.

This includes (but is not limited to) paginated log queries used to derive:
- today consumption/outcome and related token/request counts (consume logs)
- today income (topup/system logs)

The system MUST still perform any refresh requests required for:
- total balance/quota display, AND
- check-in capability detection and check-in status detection (when enabled).

#### Scenario: Manual refresh skips today log fetches
- **GIVEN** `showTodayCashflow = false`
- **WHEN** the user manually refreshes an enabled account (or refreshes all accounts)
- **THEN** the refresh MUST NOT issue consume/topup/system log requests for today statistics
- **AND** the refresh MUST still update quota/balance and check-in state as applicable

#### Scenario: Auto refresh skips today log fetches
- **GIVEN** `showTodayCashflow = false`
- **WHEN** a scheduled/background auto-refresh runs
- **THEN** the refresh MUST NOT issue consume/topup/system log requests for today statistics

### Requirement: Sorting and defaults remain coherent when disabled
When `showTodayCashflow = false`, the extension MUST prevent the UI from using hidden today statistics as the basis for ordering or default selection.

#### Scenario: Sort field falls back from today statistics
- **GIVEN** `showTodayCashflow = false`
- **AND** the current account list sort field is a today-statistic field (e.g., today consumption/outcome or today income)
- **WHEN** the account list renders or the user toggles `showTodayCashflow` off
- **THEN** the extension MUST fall back to a non-today-statistic sort field (e.g., total balance)

#### Scenario: Default dashboard selection falls back from today cashflow
- **GIVEN** `showTodayCashflow = false`
- **AND** the user’s configured default dashboard tab is “today cashflow”
- **WHEN** the extension determines which dashboard tab/content to show by default
- **THEN** it MUST fall back to “total balance” as the default

### Requirement: Re-enabling restores capability on next refresh
When `showTodayCashflow` is turned back on, the extension MUST be able to fetch and display today statistics again.

#### Scenario: Re-enable then refresh fetches today statistics again
- **GIVEN** `showTodayCashflow = true`
- **WHEN** the user triggers an account refresh after re-enabling
- **THEN** the refresh MUST be allowed to fetch today statistics again and the UI MAY display them

