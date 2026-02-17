## Why

The Balance History view becomes misleading when multiple accounts are selected because it currently emphasizes a single aggregated “total” rather than showing how each account contributes over time. Users need clearer multi-account visibility and richer chart options (similar to Usage Analysis) to quickly understand trends, distribution, and comparisons.

## What Changes

- Update Balance History visualizations so multi-account selection can render **per-account series on the same chart** (not only a summed total), with clear legend/selection behavior.
- Add a Trend view switcher to choose between **By account** and **Total (sum)**, and clearly communicate when totals may be incomplete due to partial coverage.
- Add a visualization mode switcher to support multiple chart forms for the same dataset:
  - trend/line chart (time series)
  - histogram/bar chart (comparison across accounts or dates)
  - pie chart (share/breakdown for a selected date or range summary)
- Provide an “Overview” view that summarizes the selected range/accounts (key metrics + appropriate charts), aligned with the interaction patterns of the existing Usage Analysis section.
- Present multiple accounts in **one unified table** for the selected range (sortable), instead of fragmenting the data per account or showing only aggregates.
- Expand selectable visualization dimensions/metrics beyond a single balance total (e.g., balance, income, outcome, net change), and offer clearer chart-form choices for each metric.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `daily-balance-history`: Refine Balance History requirements to support multi-account visualization (per-account series + optional aggregates), chart form switching (line/pie/bar) with an overview mode, and a unified multi-account table with expanded metric/dimension options.

## Impact

- Options Balance History UI: new/updated chart components, chart mode switcher, overview layout, and unified table interactions.
- Snapshot selection + aggregation logic for multi-account/time-range queries (including consistent handling of missing days and partial data).
- ECharts option generation for multi-series line charts, bar charts, and pie charts; shared UX patterns with the existing Usage Analysis module.
- i18n resources for new controls/labels (chart types, metrics, overview, table columns).
- Tests for multi-account rendering correctness (series composition, switching modes, table summaries) and edge cases (many accounts, sparse data, empty ranges).
