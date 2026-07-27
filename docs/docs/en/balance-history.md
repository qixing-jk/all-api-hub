# Balance History

> Records daily account balance and income/expense snapshots, allowing for long-term trend observation with charts. Ideal for reconciliation, understanding top-up and consumption patterns, or troubleshooting "why the balance fluctuates."

## Feature Overview

- **Daily Snapshot Recording**: Each account records at most one snapshot per day.
- **Records Balance and Transactions**: Can save balance, today's income, today's expenses, recording time, and source.
- **Multi-Account Summary**: Supports viewing summaries by tag, account, and time range.
- **Chart Analysis**: Provides overview, trends, account distribution, and account summary tables.
- **Manual Maintenance**: Supports immediate refresh and immediate cleanup of expired data.

## What Data is Recorded

Each account retains at most one aggregated snapshot per day. Common fields include:

- Balance / Quota: `quota`
- Today's Income: `today_income`
- Today's Expenses: `today_quota_consumption`
- Recording Time: `capturedAt`
- Source: `source`

The `source` currently has two main categories:

- **Refresh Driven**: Updates the daily snapshot after a successful account refresh.
- **End-of-Day Fetch**: A background catch-up fetch near the end of the day.

## How to Enable

1. Navigate to **`Settings → Basic Settings → Balance History`**.
2. Enable **`Enable Balance History`**.
3. Optionally set **`Retention Days`**.
4. To maximize the completeness of daily income/expenses, enable **`End-of-Day Fetch`**.

Once enabled, refreshing any account will start writing the first snapshot.

## Two Recording Methods

### 1. Refresh Driven

When an account refresh is successful, the daily snapshot is updated.

Features:

- No need for extra waiting for scheduled tasks.
- Better suited for accumulating data naturally when opening the plugin daily.
- Adheres to "Show Today's Income/Expenses" related toggles; does not force log retrieval solely for balance history.

### 2. End-of-Day Fetch

When enabled, the plugin attempts to fetch daily data around `23:55` each day.

Features:

- Suitable for those who want to maximize completeness of income/expense history.
- Relies on browser support for the `Alarms API`.
- Is best-effort and does not guarantee success every day.

## Important Considerations Before Use

If you wish to record **Income/Expense History**, it is recommended to meet at least one of the following conditions:

- Enable "Show Today's Income/Expenses" to fetch daily transactions during refreshes.
- Enable "End-of-Day Fetch" for the plugin to catch up before the end of each day.

If neither of these is enabled, the balance history will typically only show stable balance snapshots, and income/expense charts may be empty.

## How to View the Page

After navigating to **`Settings → Balance History`**, commonly used areas include:

### Filter Area

Supports filtering by the following dimensions:

- Tags
- Accounts
- Time Range
- Quick Intervals (Last 7 Days, 30 Days, 90 Days, 180 Days, 1 Year)
- Currency Unit (Follows global currency settings)

### Overview

Displays core summary metrics for the current filtered interval, such as:

- Ending Balance
- Net Change in Interval
- Income in Interval
- Expenses in Interval
- Number of Accounts Covered

### Trend Chart

Allows switching to view:

- Balance
- Income
- Expenses
- Net Change

Also allows switching the view scope:

- **By Account**: View the curve for each account separately.
- **Summary**: Sums up selected accounts daily.

Charts support:

- Line chart / Bar chart switching
- Multi-account comparison
- Incomplete coverage indication

### Account Distribution

Used to view the distribution of a specific day's or metric's data across different accounts.

Supports:

- Pie chart / Histogram switching
- Selecting a reference date
- Switching between Balance / Income / Expenses / Net Change

If the current metric has negative values, the pie chart will be inapplicable, which is a normal limitation.

### Account Summary Table

The table summarizes each account's data within the current interval:

- Starting Balance
- Ending Balance
- Income in Interval
- Expenses in Interval
- Net Change in Interval
- Snapshot Coverage Rate
- Transaction Coverage Rate

This is very useful for manual reconciliation or quickly identifying anomalous accounts.

## Common Operations

### Refresh Now

Clicking **`Refresh Now`** actively fetches the latest snapshot for the currently selected accounts. This is useful for:

- Backfilling the first batch of data after enabling balance history.
- Immediately updating today's data.
- Comparing changes before and after a top-up/consumption event.

### Clean Up Now

Clicking **`Clean Up Now`** deletes records older than the retention period based on the set retention days. This is useful for manually trimming data after reducing the retention period.

## Important Limitations

- **Best-Effort**: Browser sleep, network anomalies, or site restrictions may result in missing snapshots for certain dates.
- **No Historical Backfill**: Does not retroactively scan entire historical logs to fill in past dates, avoiding excessive requests.
- **Local Storage Only**: In the current version, balance history data is stored locally and is not migrated with regular data import/export or WebDAV.
- **Disabled Accounts Skipped**: Related refresh and scheduled tasks automatically skip disabled accounts.

## Usage Recommendations

- To observe long-term trends, increase the retention days.
- To ensure more complete income/expense data, enable End-of-Day Fetch.
- For reconciliation, filter by specific tags or accounts first, then view the summary table for higher efficiency.
- If you are more concerned with request volume, model distribution, and latency rather than balance changes, please refer to [Usage Analytics](./usage-analytics.md).

## Related Documentation

- [Usage Analytics](./usage-analytics.md)
- [Auto Refresh and Real-time Data](./auto-refresh.md)
- [Frequently Asked Questions](./faq.md)