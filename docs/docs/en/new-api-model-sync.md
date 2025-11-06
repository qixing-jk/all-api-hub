# New API Model List Synchronization

An automated feature for New API administrators that synchronizes the model lists of all channels, ensuring they remain consistent with upstream providers without manual updates.

![Model List Sync UI](../static/image/en/new-api-channel-sync.png)

## Feature Overview

**Key Features**:
- 🔄 **Auto-Sync**: Automatically synchronizes model lists for all channels at a configured interval.
- 🎯 **Flexible Control**: Supports full sync, selective sync, or retrying only failed items.
- ⚡ **Smart Rate Limiting**: Built-in token bucket algorithm to avoid hitting API rate limits.
- 🔁 **Auto-Retry**: Automatically retries failed tasks to improve sync success rates.
- 📊 **Real-time Progress**: Displays real-time progress and detailed statistics during synchronization.
- 📜 **History Records**: Provides complete execution history and result filtering.

**Target Audience**: New API site administrators.

## Prerequisites

Before using this feature, you must complete the following configuration on the **Basic Settings** page:

| Setting | Description | How to Obtain |
|---|---|---|
| **New API Base URL** | Your New API site address | e.g., `https://your-site.com` |
| **Admin Token** | Your administrator token | New API Backend → Settings → Token Management |
| **User ID** | Your administrator user ID | New API Backend → User Management |

::: warning Note
The model sync feature cannot be used until the above information is configured. Once configured, you can access the sync page by clicking **"View Execution & Results"** in **Settings → New API Integration Settings**.
:::

## How to Use

**Accessing the Feature Page**:
1. Go to **Settings → Basic Settings**.
2. Find the **New API Integration Settings** section.
3. Click the **"View Execution & Results"** button.

**Manual Sync Options**:

| Action | Description | Use Case |
|---|---|---|
| **Run All** | Synchronizes the model lists for all channels. | For initial setup or a full update. |
| **Run Selected** | Synchronizes only the checked channels. | For updating specific channels. |
| **Retry Failed Only** | Re-runs only the channels that failed in the last attempt. | For a quick fix after resolving network issues. |
| **Refresh Results** | Reloads the execution history. | To view the latest sync status. |

**Viewing and Filtering Results**:
- **Status Filter**: Toggle between **"All"** / **"Success"** / **"Failed"** to filter results.
- **Search**: Search by channel name, ID, or error message.
- **Details**: The table shows the old model list, new model list, HTTP status code, and error message for each channel.
- **Individual Retry**: Click **"Sync this channel"** in the actions column to re-sync a single channel.

**Statistics Card Explained**:
- **Total Channels**: The number of channels involved in the sync.
- **Success Count**: The number of successfully synced channels.
- **Failure Count**: The number of channels that failed to sync.
- **Duration**: The total time taken for the sync task.
- **Next Scheduled Time**: The next execution time when auto-sync is enabled.

## Configuration Options

The following options can be configured in **Settings → Basic Settings → New API Integration Settings**:

| Setting | Default | Recommended Range | Description |
|---|---|---|---|
| **Enable Auto-Sync** | Off | - | Automatically performs synchronization at the set interval. |
| **Execution Interval** | 6 hours | 1-24 hours | The time interval for automatic synchronization. |
| **Concurrency** | 2 | 1-3 | The number of channels to process simultaneously. Avoid setting too high to prevent rate limiting. |
| **Max Retries** | 3 | 2-5 | The number of automatic retries on failure. |
| **Requests Per Minute** | 20 | 10-30 | API rate limit. Adjust based on server performance. |
| **Burst Limit** | 5 | 3-10 | Token bucket capacity, allowing for short bursts of requests. |

**Best Practice Recommendations**:
1.  **Concurrency**: A value of 1-3 is recommended to avoid excessive server load.
2.  **Execution Interval**: Choose based on how often models are updated; 6-12 hours is generally sufficient.
3.  **Rate Limiting**: If you encounter frequent 429 errors, lower the "Requests Per Minute."
4.  **Retry Strategy**: The default of 3 retries is usually enough to handle temporary network issues.

::: tip Performance Optimization
- For a large number of channels (>50), consider reducing concurrency to 1-2.
- If your server performance is strong, you can increase "Requests Per Minute" to 30.
- Once auto-sync is enabled, there is no need for frequent manual triggers.
:::

## Common Issues

**What to do if synchronization fails?**

Take action based on the error message:

| Error Type | Possible Cause | Solution |
|---|---|---|
| **Configuration Missing** | New API settings are incomplete. | Verify that the Base URL, Admin Token, and User ID are correctly filled in. |
| **401 Unauthorized** | The Admin Token is invalid. | Regenerate the Admin Token and update the configuration. |
| **429 Rate Limited** | Requests are too frequent. | Lower the "Requests Per Minute" or "Concurrency" settings. |
| **500 Server Error** | The New API service is down. | Check the status of your New API service and retry later. |
| **Network Timeout** | Unstable network connection. | Check your network and use the "Retry Failed Only" option. |

**How to interpret the sync results?**

- **Old Model List**: The channel's model configuration before the sync.
- **New Model List**: The latest model list fetched from the upstream provider.
- **HTTP Status Code**: The response status of the API request (200 means success).
- **Attempts**: The total number of execution attempts, including retries.

**Performance Considerations**:

- The initial sync or a sync with many channels may take longer, which is normal.
- It is recommended to run large-scale syncs during periods of low server load.
- Auto-sync runs silently in the background and does not affect other extension features.

**Important Notes**:

::: warning Important
- The sync operation will directly modify the model list configuration of your New API channels.
- Please ensure you have backed up important configurations before running a sync.
- It is recommended to test the sync feature in a staging environment first.
- Frequent synchronization can impact server performance; set a reasonable execution interval.
:::