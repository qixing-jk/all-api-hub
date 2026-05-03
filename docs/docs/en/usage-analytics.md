# Usage Analysis

> Turn locally aggregated usage history into charts to help you answer practical questions: which accounts consume the most, which models are the most expensive, when are requests concentrated, and have things recently become slower.

## First, Understand Its Dependencies

`Usage Analysis` does not fetch raw logs in real-time. Instead, it displays data based on **locally saved usage history aggregation data**.

Therefore, before using it for the first time, you need to go to:

**`Settings → Basic Settings → Account Usage`**

Enable usage history synchronization and perform an initial data synchronization.

## Feature Overview

- **Multi-dimensional Filtering**: Filter by site, account, Token, date range.
- **Overview Metrics**: View request count, input/output Tokens, total Tokens, and costs.
- **Model Analysis**: View model distribution, model cost distribution, and model heatmap.
- **Time Period Analysis**: View usage time hotspots to determine when requests are concentrated by day of the week/hour.
- **Latency Analysis**: View latency distribution, latency trends, slow model rankings, and slow Token rankings.
- **Export**: Export the current filtered results for reconciliation or further processing.

## Step 1: Enable Usage History Synchronization

Navigate to **`Settings → Basic Settings → Account Usage`**. You will see two sections:

- **Usage History Synchronization Settings**
- **Synchronization Status**

### What Can Be Configured

| Item | Description |
|------|-------------|
| Usage History Synchronization | Master switch |
| Retention Days | How long local aggregated data is kept |
| Automatic Synchronization Method | Manual only / After account refresh / Cron-like |
| Minimum Synchronization Interval | Controls the frequency of automatic synchronization |

### How to Choose the Automatic Synchronization Method

- **Manual Only**: Most request-efficient, suitable for occasional analysis.
- **After Account Refresh**: Suitable for daily use, accumulating data incidentally when refreshing accounts.
- **Cron-like (Requires Alarms API)**: Suitable for those who want background scheduled synchronization.

If the browser does not support the `Alarms API`, the plugin will automatically degrade and will not force the use of unavailable scheduling methods.

### Sync Status Management

In **`Settings → Basic Settings → Account Usage → Sync Status`**, you can manage usage synchronization much like "download tasks":

- **Status Overview**: Quickly see which accounts synced successfully and which failed due to permission or network issues.
- **Differentiated Sync**: Supports syncing only for a specific time period or triggering a forced sync for specific accounts.
- **One-click Cleanup**: If local data is excessive or an anomaly occurs, you can clear the local usage cache for specific accounts with one click.
- **Error Troubleshooting**: If synchronization fails, click the status icon to view specific API error details (e.g., `401 Unauthorized` indicates an invalid Admin Token).

## Step 2: Access the Usage Analysis Page

After synchronizing data, open **`Settings → Usage Analysis`**.

If the page prompts "No usage history data yet," it usually means:

- Synchronization has not been enabled.
- The initial synchronization has not been performed.
- There is no data within the currently selected range.

## How to View the Page

### Filter Area

Supports combined filtering by the following dimensions:

- Site
- Account
- API Token
- Start Date / End Date

If a layer is not selected, it defaults to counting all data within the scope of the parent layer.

### Overview Cards

Presents a core summary of the current filtered results:

- Input Tokens
- Output Tokens
- Total Tokens
- Request Count
- Cost

Suitable for quickly determining "how much was used in this period."

### Daily Overview

Displays the trend of multiple metrics changing daily, typically including:

- Request Count
- Input Tokens
- Output Tokens
- Total Tokens
- Quota Consumption

Charts support zooming and legend toggling, suitable for narrowing the observation window.

### Model-Related Charts

#### Model Distribution

Ranks Top models by total Tokens, suitable for seeing "which models are used most frequently."

#### Model Cost Distribution

Ranks Top models by cost converted to USD, suitable for seeing "which models the money is primarily spent on."

#### Model × Date Heatmap

Displays model usage intensity over time, suitable for observing:

- Whether a model was used in a short burst or sustained over time.
- Which days saw a sudden increase in usage.

Clicking on a model will focus other charts on that model as much as possible.

### Time Period and Latency Analysis

#### Usage Time Hotspots

Aggregates Token popularity by **Day of Week × Hour**, suitable for observing:

- Whether requests are mainly concentrated on weekdays or weekends.
- Whether peak hours are during the day, evening, or early morning.

#### Latency Distribution

Displays the distribution of latency for individual requests (`use_time`), suitable for determining if overall response times have slowed down.

#### Latency Trends

Displays daily:

- Average Latency
- Maximum Latency
- Number of Slow Requests

Suitable for troubleshooting "Why does it feel sluggish recently?" or "Did it significantly degrade on certain days?"

#### Slow Model Ranking / Slow Token Ranking

Helps you quickly identify:

- Which models are more prone to slow requests.
- Which Tokens correspond to the slowest request paths.

This is particularly useful in environments with multiple upstream providers, multiple groups, and multiple accounts.

### What is the Export Function For?

Clicking **`Export`** will export the aggregated results within the current filter range, suitable for:

- Reconciling bills
- Archiving
- Sharing with team members for further analysis

If there is no data within the current filter range, an export prompt will appear instead of generating an empty file.

## Usage Recommendations

- **Narrow the Scope Before Analyzing**: First select a site or account, then look at models and latency. This makes it easier to find issues.
- **Analyze High Cost and High Latency Separately**: The most expensive is not necessarily the slowest, and the slowest is not necessarily the most expensive.
- **Combine with Account Usage Settings**: If a certain account shows no data for a long time, check its synchronization status in "Account Usage" first.
- **For Balance Changes, Refer to Balance History**: These two focus on different aspects; do not confuse them.

## Important Limitations

- The page displays **locally aggregated history**, not backend raw log details.
- Only synchronized and supported accounts will appear in valid statistics.
- Disabled accounts will be automatically skipped by relevant refresh and synchronization tasks.
- If the browser does not support `Alarms API`, scheduled synchronization capabilities will be limited, but manual synchronization and "synchronization after refresh" will still be available.

## Related Documents

- [Balance History](./balance-history.md)
- [Automatic Refresh and Real-time Data](./auto-refresh.md)
- [Data Import and Export](./data-management.md)