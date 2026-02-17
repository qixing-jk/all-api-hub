## 1. Data selectors (daily balance history)

- [x] 1.1 Add `buildPerAccountDailyBalanceMoneySeries` selector (balance/income/outcome/net) with per-account gap semantics
- [x] 1.2 Add `buildAccountRangeSummaries` selector for per-account range totals, start/end values, and coverage counts (snapshots/cashflow)
- [x] 1.3 Add unit tests for per-account selectors (multi-account partial coverage MUST still yield non-empty series)

## 2. ECharts options (Balance History)

- [x] 2.1 Extend `entrypoints/options/pages/BalanceHistory/echartsOptions.ts` with `buildMultiSeriesTrendOption` (line/bar, legend scroll, tooltip formatting)
- [x] 2.2 Add `buildAccountBreakdownPieOption` for per-account distribution
- [x] 2.3 Add `buildAccountBreakdownBarOption` (histogram-style bar) for per-account distribution
- [x] 2.4 Verify `components/charts/echarts.ts` has required modules for new options (add only if missing)

## 3. Balance History page: trend chart + non-blank multi-account view

- [x] 3.1 Add page-local state for selected metric (balance/income/outcome/net) and trend chart type (line/bar)
- [x] 3.2 Replace current aggregated-series wiring with per-account series wiring so multi-account charts are not blank when coverage is incomplete
- [x] 3.3 Update empty/coverage logic to distinguish “any data exists” vs “complete across all accounts” (avoid misleading blank charts)
- [x] 3.4 Keep refresh/prune/settings actions working and ensure data reload updates charts/table
- [x] 3.5 Add a trend scope switcher (By account vs Total) with best-effort totals and an incomplete-coverage hint

## 4. Overview + breakdown charts

- [x] 4.1 Add an Overview section with KPI cards derived from range summaries (end balance, range net, income/outcome when available, coverage indicators)
- [x] 4.2 Add breakdown metric selection and a balance reference date (within range), and compute per-account breakdown values
- [x] 4.3 Render account breakdown with pie ↔ histogram toggle (reuse Usage Analytics toggle pattern)
- [x] 4.4 Disable pie breakdown when values are negative and show a hint

## 5. Unified multi-account table

- [x] 5.1 Implement `BalanceHistoryAccountSummaryTable` using TanStack table + `components/ui/table`
- [x] 5.2 Add sortable columns (account, start/end balance, range net, income/outcome totals, snapshot/cashflow coverage)
- [x] 5.3 Add loading + empty states and ensure the table updates with account/tag/range changes

## 6. Localization + QA

- [x] 6.1 Add `balanceHistory` i18n keys for new controls (metrics, chart types, overview labels, table columns) in `locales/zh_CN` and `locales/en`
- [x] 6.2 Add/adjust tests for the Balance History multi-account view (selectors + minimal UI behavior where practical)
- [x] 6.3 Run `pnpm -s compile` and `pnpm -s test` to validate changes (fix only issues introduced by this change)
