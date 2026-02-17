## Context

The Balance History options page (`entrypoints/options/pages/BalanceHistory/index.tsx`) currently visualizes daily snapshots by building a **single aggregated series** via `buildAggregatedDailyBalanceMoneySeries` and rendering:

- a single-series balance trend line chart (`buildBalanceTrendOption`)
- a two-series income/outcome bar chart (`buildIncomeOutcomeBarOption`)

Aggregation today uses “complete-day” semantics: when multiple accounts are selected, a day becomes a `null` gap if any account is missing a snapshot (or cashflow fields). This makes multi-account views frequently look empty and pushes users toward selecting a single “best covered” account.

In contrast, the Usage Analysis page (`entrypoints/options/pages/UsageAnalytics/index.tsx`) already uses compact in-card toggles (pie vs histogram-style bar) and “overview + breakdown” card patterns that are easier to scan and compare. This change brings similar multi-dimension visualization and chart-form choice to Balance History, while keeping data collection/storage unchanged.

Constraints / considerations:
- Extension UI (WXT) runs on both MV3 (Chromium) and MV2 (Firefox).
- Charts are built with Apache ECharts via the `EChart` wrapper; needed chart modules (line/bar/pie + legend/tooltip/dataset/dataZoom) are already registered in `components/charts/echarts.ts`.
- User-facing copy must be localized via the `balanceHistory` namespace.

## Goals / Non-Goals

**Goals:**
- Show **per-account** balance history on the same chart for multi-account selections (not only a summed total).
- Add an “Overview” area that summarizes the selected range/accounts (key metrics + distribution charts).
- Support chart-form switching for relevant views:
  - distribution: pie ↔ histogram-style bar
  - time series: line ↔ bar (when meaningful)
- Add a unified **multi-account table** for the selected range (sortable) so users can compare accounts reliably even when charts get crowded.
- Expand the visualization dimensions to cover common balance-history questions (balance, income, outcome, net change), with clear chart-form affordances.

**Non-Goals:**
- Changing how snapshots are captured (refresh/end-of-day capture) or stored (`DailyBalanceHistoryStore` schema stays the same).
- Adding new third-party charting/table dependencies (reuse ECharts + TanStack table already in the repo).
- Building a full “analytics builder” UI; this is a focused upgrade of Balance History UX.

## Decisions

1) **Introduce per-account selectors and add a trend scope switcher (By account vs Total)**

- Add selector(s) in `services/dailyBalanceHistory/selectors.ts` to build per-account time series in money units:
  - `buildPerAccountDailyBalanceMoneySeries(...)` → `dayKeys` + per-account arrays for `balance`, `income`, `outcome`, and derived `net` (income - outcome) where available.
  - `buildAccountRangeSummaries(...)` → per-account summary rows for the table (start/end, range totals, coverage counts).
- Add a `trendScope` control in the Balance History page to switch between:
  - per-account series
  - a total (sum) series across selected accounts
- For the total scope, compute a best-effort daily total by summing accounts that have a value for that day (keep gaps only when no selected accounts have data for the day).
- Surface an “incomplete total” hint when coverage is partial (e.g., using min/max covered accounts across available days) so users understand totals may be underestimated.

Rationale: per-account series are the primary fix for the misleading multi-account aggregation. A total scope provides a single-series overview without going blank under partial coverage, while the coverage hint communicates that totals may be underestimated.

Alternatives considered:
- Keep only a strict “complete coverage” total. Rejected: multi-account selections frequently have incomplete coverage, making the total view look empty/misleading.
- Overlay total + per-account series on the same chart. Rejected: it increases visual clutter and makes legend interaction harder; a scope switcher keeps the trend card simpler.

2) **Standardize metric + chart-type state locally (do not persist initially)**

- Define page-local enums/types:
  - `metric`: `balance` | `income` | `outcome` | `net`
  - `trendChartType`: `line` | `bar`
  - `breakdownChartType`: `pie` | `bar`
- Store these as React state in the Balance History page (similar to Usage Analytics’ keyed chart-type state).

Rationale: this keeps behavior predictable and avoids creating new persisted preference surface area before requirements settle.

Alternatives considered:
- Persist chart preferences in `UserPreferences`. Rejected: increases scope/migration burden; we can revisit once UX stabilizes.

3) **Add an Overview section driven by range summaries + a selectable breakdown reference**

- Add an Overview block above the charts containing:
  - KPI cards (e.g., total end-balance, total range net, total income/outcome when available, and coverage indicators)
  - an “Account breakdown” chart card that visualizes a **single metric across accounts** using pie ↔ histogram toggle
- Default breakdown reference:
  - for `balance`: a reference date within the selected range (default to end date)
  - for flow metrics (`income/outcome/net`): range totals
- Provide a small control to select the balance breakdown reference date (bounded to the selected range).
- Disable the pie chart when the breakdown metric yields negative values (e.g., net change) and surface a hint explaining why.

Rationale: pie/histogram are most meaningful as “distribution across accounts”, not as a time-series replacement. Overview also ensures users get value even when many series would clutter the trend chart.

Alternatives considered:
- Use pie/bar for time series directly. Rejected: pie has no time axis, and bar time series becomes unreadable with many accounts.

4) **ECharts option builders: extend BalanceHistory’s echartsOptions to support multi-series + distribution**

- Extend `entrypoints/options/pages/BalanceHistory/echartsOptions.ts` with:
  - `buildMultiSeriesTrendOption(...)` to render many account series (line or bar), with legend scroll, tooltip formatting, and gaps (`null`) per account.
  - `buildAccountBreakdownPieOption(...)` and `buildAccountBreakdownBarOption(...)` for per-account distributions with consistent labels and sorting.

Rationale: keeping option-building in a dedicated module maintains the existing separation (data shaping in selectors; chart config in echartsOptions; UI in the page).

Alternatives considered:
- Inline ECharts option objects in the page. Rejected: harder to test and harder to reuse across cards.

5) **Unified multi-account table uses existing TanStack table primitives**

- Implement a table component under `entrypoints/options/pages/BalanceHistory/components/` (or inline initially, then extract) using the established pattern from `entrypoints/options/pages/BasicSettings/components/UsageHistorySyncStateTable.tsx`:
  - `@tanstack/react-table` for sorting
  - `components/ui/table` for styling
- Table rows: one row per account, scoped to the current selection and date range.
- Columns: account identity + balance start/end/net + income/outcome totals (when available) + coverage (days with snapshot / days with cashflow).

Rationale: charts are best for trends; tables are best for exact comparisons, and the repo already has a consistent, accessible table implementation.

## Risks / Trade-offs

- **[Chart clutter with many accounts]** → Multi-series trends can become unreadable. Mitigation: legend scroll + a per-account/total scope switcher; table as the reliable comparison surface.
- **[Coverage ambiguity for flow metrics]** → Income/outcome may be missing depending on user settings (`showTodayCashflow` / end-of-day capture). Mitigation: keep the existing warning, surface coverage counts in KPI/table, and treat missing values as `null` gaps (no inference).
- **[Performance for long ranges]** → Many accounts × many days increases option size. Mitigation: keep option generation memoized, avoid per-render heavy transforms, and prefer derived selectors for summaries.
- **[UX scope creep]** → “More dimensions and chart forms” can balloon. Mitigation: start with a minimal, well-labeled set (balance/income/outcome/net; line/bar for trend; pie/bar for breakdown) and iterate based on feedback.

## Migration Plan

- No storage schema changes; existing snapshots are reused.
- Roll out as a UI/selector change in Options → Balance History:
  - Per-account trend series become available for multi-account selection.
  - Overview + breakdown charts and unified table are added.
- Update `locales/*/balanceHistory.json` for new controls/labels.
- Add/extend tests for new selector logic (`tests/services/dailyBalanceHistory/selectors.test.ts`) and (optionally) component tests for toggles/table behavior.

## Open Questions

- Should the trend/breakdown metric + chart type state be persisted in `UserPreferences` once the UX stabilizes?
- When many accounts are selected, should the default trend scope switch to Total, or stay on By account?
- Should we add a “top N accounts” helper for the trend view to reduce clutter without requiring manual legend toggling?
