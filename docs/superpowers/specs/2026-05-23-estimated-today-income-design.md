# Estimated Today Income Design

Date: 2026-05-23

## Goal

Add an optional estimated today-income view that can account for balance
increases not represented in a site's income logs, such as welfare-site rewards,
farm rewards, wheel rewards, or other backend-side balance writes.

The feature should let users compare two income values:

- Trusted today income: the current log/API-reported `today_income`.
- Estimated today income: a runtime-derived value based on balance movement and
  today's consumption.

The estimate is additive display context. It must not overwrite the trusted
stored account field.

## Background

Issue #366 reports that today's income can miss rewards from external check-in
and welfare mechanisms even when the total balance updates correctly. The
reported successful case is redemption-assist balance growth, while manual
check-in, automatic check-in, and welfare rewards do not consistently appear in
today income.

Issue #369 proposes calculating income from balance movement:

```text
today income = current balance - yesterday final balance + today consumption
```

That formula is useful directionally, but it depends on a reliable previous-day
baseline. Browser-extension alarms can be missed when the browser is closed,
the device is off, or the extension service worker is not woken. Because of
that, this feature must be explicit, opt-in, and visibly separate from the
trusted log/API income value.

## Current Context

Account refresh currently fetches and stores:

- `account_info.quota`
- `account_info.today_income`
- `account_info.today_quota_consumption`
- token and request counters

When balance history is enabled, `accountStorage.refreshAccount()` also calls
`maybeCaptureDailyBalanceSnapshot()` to store a daily snapshot:

```ts
{
  quota,
  today_income,
  today_quota_consumption,
  capturedAt,
  source,
}
```

`today_income` comes from site logs or API endpoints. It is a trusted reported
value, but it cannot represent rewards that only mutate backend balance fields
without producing a compatible income log.

Balance history selectors already derive chart and table series from stored
snapshots. Popup balance UI reads account display data converted from account
storage. The new estimate should use one shared helper so Popup and Balance
History do not compute different income values.

## Selected Approach

Keep storage authoritative for raw observed data, and derive estimated today
income at runtime.

Persist only:

- Existing account data.
- Existing balance-history snapshots.
- A new user preference that controls estimated-income display.

Do not persist:

- `estimated_today_income` inside account storage.
- `estimated_today_income` inside balance-history snapshots.
- Rewritten or compensated `account_info.today_income`.

Runtime selectors/helpers should expose both values:

```ts
interface TodayIncomeEstimateResult {
  reportedTodayIncome: number | null
  estimatedTodayIncome: number | null
  status:
    | "available"
    | "disabled"
    | "missing_current_snapshot"
    | "missing_baseline"
    | "missing_cashflow"
    | "manual_balance"
    | "invalid_estimate"
}
```

## Income Semantics

Trusted today income:

```text
reportedTodayIncome = current.today_income
```

Estimated today income:

```text
estimatedTodayIncome =
  current.quota - baseline.quota + current.today_quota_consumption
```

Where:

- `current` is the current-day balance-history snapshot for the account.
- `baseline` is the previous day's last stored snapshot for the account.
- `today_quota_consumption` is the current-day trusted consumption value.

The estimate should be available only when all of these are true:

- The preference is enabled.
- A current-day snapshot exists.
- A previous-day baseline snapshot exists.
- Current-day `today_quota_consumption` is a finite number.
- The account does not use `manualBalanceUsd`.
- The calculated estimate is finite and non-negative.

If the estimate is unavailable, UI should still show the trusted income value.
It should not silently substitute zero or a negative estimate.

## Preference

Add a preference under balance-history settings, default disabled:

```ts
balanceHistory: {
  estimatedTodayIncome: {
    enabled: false
  }
}
```

The setting belongs with Balance History because the estimate depends on
balance-history snapshots and baseline coverage.

The switch label should be conservative, for example "Show estimated today
income". The description should explain that the estimate is based on balance
history and may include rewards that do not appear in site logs. It should also
state that the value is unavailable when the required baseline is missing.

## UI Behavior

When the preference is disabled:

- Popup keeps today's income behavior unchanged.
- Balance History keeps existing income metrics unchanged.
- No estimated-income fields are shown.

When the preference is enabled:

- Popup can show two visible fields:
  - trusted today income
  - estimated today income
- Balance History can expose two income metrics:
  - trusted income
  - estimated income
- If an estimate is unavailable for an account/day, the estimated field should
  display an unavailable state instead of a numeric value.

The UI should not present the estimate as more authoritative than the trusted
value. Labels should make the distinction clear without adding a third
always-visible "compensation" field. Compensation remains an internal derived
delta:

```text
compensation = estimatedTodayIncome - reportedTodayIncome
```

That delta can be used for tooltips, tests, or diagnostics, but it is not a
primary visible metric.

## Data Flow

```text
account refresh
  -> store trusted account fields
  -> capture raw daily balance snapshot
  -> shared estimated-income helper derives runtime values
  -> Popup and Balance History consume the same derived output
```

The helper should live in the daily-balance-history service area because it
depends on snapshot semantics, day keys, and baseline selection.

Popup should not reimplement snapshot math. If Popup needs the estimate, it
should call the shared helper or receive a display-ready result from a shared
selector.

## Baseline Selection

For a current day `D`, use the account's stored snapshot from `D - 1` as the
baseline. The store currently keeps one snapshot per account/day, and newer
captures overwrite earlier captures, so that entry represents the last captured
snapshot for that day.

Do not scan arbitrarily far back for a baseline. Using older days would turn a
daily estimate into a multi-day balance delta and make the label misleading.

## Error And Edge Cases

Missing baseline:

- Return `missing_baseline`.
- Do not calculate an estimate.

Missing cashflow:

- When `today_quota_consumption` is `null`, return `missing_cashflow`.
- This usually means today cashflow fetching was disabled or unavailable.

Manual balance:

- If `manualBalanceUsd` is set, return `manual_balance`.
- Manual balances are user-supplied overrides and cannot be used as site
  balance movement evidence.

Negative or non-finite estimate:

- Return `invalid_estimate`.
- Do not show a negative income estimate.

Disabled preference:

- Return `disabled` and only display trusted income.

Partial account coverage:

- Balance History aggregate estimated-income series should use `null` for days
  where any selected account lacks a valid estimate, matching the existing
  snapshot/cashflow coverage behavior.
- Per-account series may show gaps independently.

## Testing

Add focused Vitest coverage for the shared helper/selector:

- available estimate from current and previous-day snapshots
- disabled preference
- missing current snapshot
- missing baseline
- missing cashflow
- manual balance
- negative estimate
- non-finite estimate

Update Balance History selector tests to prove trusted and estimated income are
separate metrics and do not contaminate each other.

Update Popup component tests to prove:

- disabled preference preserves current today-income behavior
- enabled preference shows trusted and estimated fields
- unavailable estimates do not render misleading numeric values

Update Balance History settings tests for the new switch and default-disabled
preference.

No new Playwright E2E is required for the first implementation because the main
risk is deterministic selector and component behavior. Reconsider E2E only if
implementation crosses a browser-runtime boundary beyond existing preference
storage and rendering paths.

## Non-Goals

- Do not change backend API adapters to fetch new income fields.
- Do not overwrite `account_info.today_income`.
- Do not persist estimated values in snapshots.
- Do not infer income from days older than the previous local day.
- Do not add a default-visible compensation field.
- Do not enable estimated-income display by default.

## Open Implementation Notes

- Preference migration should preserve existing `balanceHistory` settings and
  default `estimatedTodayIncome.enabled` to `false`.
- Labels should use locale keys and keep the estimate wording explicit.
- The helper should return status codes, not localized messages, so UI layers
  can decide how much explanation to show.
- Balance History and Popup should share the same runtime derivation path.
