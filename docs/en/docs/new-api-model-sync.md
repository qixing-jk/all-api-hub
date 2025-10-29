# New API Model List Synchronization

An automation feature for New API administrators that automatically synchronizes model lists for all channels, ensuring consistency with upstream providers without the need for manual, individual updates.

![模型列表同步界面](./static/image/new-api-channel-sync.png)

## Feature Overview

**Key Features**:
- 🔄 **Automatic Synchronization**: Automatically synchronizes model lists for all channels at set intervals.
- 🎯 **Flexible Control**: Supports full synchronization, selective synchronization, or retrying only failed items.
- ⚡ **Smart Rate Limiting**: Built-in token bucket algorithm to avoid triggering API rate limits.
- 🔁 **Automatic Retry**: Failed tasks are automatically retried to improve synchronization success rates.
- 📊 **Real-time Progress**: Displays real-time progress and detailed statistics during synchronization.
- 📜 **History Records**: Complete execution history and result filtering capabilities.

**Target Audience**: New API site administrators

## Prerequisites

Before using this feature, the following configurations must be completed on the **Basic Settings** page:

| Configuration Item | Description | How to Obtain |
|--------------------|-------------|---------------|
| **New API Base URL** | Your New API site address | E.g.: `https://your-site.com` |
| **Admin Token** | Admin Token | New API Backend → Settings → Token Management |
| **User ID** | Administrator User ID | New API Backend → User Management |

::: warning Note
The model synchronization feature will be unavailable if the above information is not configured. After configuration, you can click **"View Execution and Results"** in **Settings → New API Integration Settings** to access the synchronization page.
:::

## Usage

**Accessing the Feature Page**:
1. Go to **Settings → Basic Settings**
2. Find the **New API Integration Settings** section
3. Click the **"View Execution and Results"** button

**Manual Synchronization Options**:

| Operation | Description | Applicable Scenarios |
|-----------|-------------|----------------------|
| **Execute All** | Synchronize model lists for all channels | First use or comprehensive update needed |
| **Execute Selected** | Only synchronize checked channels | Update specific channels |
| **Retry Failed Only** | Re-execute channels that failed last time | Quick recovery after network issues |
| **Refresh Results** | Reload execution history | View the latest synchronization status |

**Viewing and Filtering Results**:
- **Status Filter**: Click **"All"** / **"Success"** / **"Failed"** to switch display
- **Search Function**: Supports searching by channel name, ID, or error message
- **Detailed Information**: Table displays each channel's old model list, new model list, HTTP status code, error message, etc.
- **Individual Retry**: Click **"Sync This Channel"** in the operation column to resynchronize a single channel

**Statistics Card Description**:
- **Total Channels**: Number of channels involved in this synchronization
- **Successful Count**: Number of successfully synchronized channels
- **Failed Count**: Number of failed synchronizations
- **Time Taken**: Total duration of this synchronization
- **Next Scheduled Time**: Displays the next execution time when automatic synchronization is enabled

## Configuration Options

The following options can be configured in **Settings → Basic Settings → New API Integration Settings**:

| Configuration Item | Default Value | Recommended Range | Description |
|--------------------|---------------|-------------------|-------------|
| **Enable Auto Sync** | Off | - | Automatically execute synchronization at set intervals |
| **Execution Interval** | 6 hours | 1-24 hours | Time interval for automatic synchronization |
| **Concurrency Limit** | 2 | 1-3 | Number of channels processed simultaneously, to avoid triggering rate limits |
| **Max Retries** | 3 | 2-5 | Number of automatic retries upon failure |
| **Requests Per Minute** | 20 | 10-30 | API rate limit, adjust based on server performance |
| **Burst Request Limit** | 5 | 3-10 | Token bucket capacity, allows short bursts of requests |

**Best Practice Recommendations**:
1. **Concurrency Limit**: Recommended to set between 1-3 to avoid excessive server load.
2. **Execution Interval**: Choose based on model update frequency, typically 6-12 hours is sufficient.
3. **Rate Limiting**: If frequent 429 errors occur, reduce "Requests Per Minute".
4. **Retry Strategy**: Keep the default 3 retries, which is usually enough for temporary network issues.

::: tip Performance Optimization
- If the number of channels is large (>50), it is recommended to reduce the concurrency limit to 1-2.
- If server performance is good, "Requests Per Minute" can be appropriately increased to 30.
- Once automatic synchronization is enabled, frequent manual triggers are not necessary.
:::

## FAQ

**What if synchronization fails?**

Take corresponding measures based on the error message:

| Error Type | Possible Cause | Solution |
|------------|----------------|----------|
| **Configuration Missing** | New API configuration not completed | Check if Base URL, Token, and User ID are correctly filled |
| **401 Unauthorized** | Admin Token invalid | Re-obtain Admin Token and update configuration |
| **429 Rate Limit** | Requests too frequent | Reduce "Requests Per Minute" or "Concurrency Limit" |
| **500 Server Error** | New API service abnormal | Check New API service status, retry later |
| **Network Timeout** | Unstable network connection | Check network connection, use "Retry Failed Only" |

**How to interpret sync results?**

- **Old Model List**: Channel model configuration before synchronization
- **New Model List**: Latest model list obtained from upstream
- **HTTP Status Code**: Response status of the API request (200 indicates success)
- **Attempts**: Total execution attempts, including retries

**Performance Considerations**:

- The first synchronization or when there are many channels may take a long time, which is normal.
- It is recommended to perform large-scale synchronization during periods of low server load.
- Automatic synchronization will run silently in the background and will not affect the use of other functions.

**Important Notes**:

::: warning Important Reminder
- Synchronization operations will directly modify the model list configuration of New API channels.
- Please ensure important configurations are backed up before performing synchronization.
- It is recommended to verify the synchronization effect in a test environment first.
- Frequent synchronization may affect server performance; set the execution interval reasonably.
:::