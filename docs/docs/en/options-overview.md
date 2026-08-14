# Overview (Main Dashboard of the Settings Page)

> When you open the All API Hub settings page, the first page you see is the **Overview**. It consolidates your account, credentials, usage, automated tasks, and configuration status on a single screen, allowing you to quickly assess "how things are going and what needs attention."
>
> **Page subtitle**: View the current status of your accounts, keys, usage, and automated tasks.

## 30-Second Quick Tour

If this is your first time opening the Overview, follow this order for the smoothest experience:

1. **Top 4 numeric cards** (Accounts / Credential Library / Today's Usage / Pending) — Get a quick snapshot of the overall situation.
2. **"Action Required" section** — If there are red or yellow alerts, click **"Open"** to resolve them.
3. **"Unified API Settings"** — If you want to consolidate multiple site keys into a single API endpoint for desktop software, check this out.
4. **Other sections (Automation, Recent Usage, Configuration Overview)** — Expand and explore as needed.

## Who Should Use This Page

- **Just installed the plugin**: Want to check "if my account is set up correctly and if any basic configurations are missing."
- **Daily use**: Need a quick glance at "account health, today's usage, and whether I missed any check-ins."
- **Troubleshooting**: If an account is offline or disconnected, jump directly from the alerts here to investigate.

## How to Access

- Open the plugin popup from the browser's top-right corner and click **`Settings`** in the top-right to enter the settings page.
- By default, you land on the **Overview** page. If you navigate elsewhere, click the first item in the left menu, **`Overview`**, to return at any time.

---

## Page Sections Overview

The page is structured from top to bottom with the following sections:

| Section | Main Content |
|:---|:---|
| **Top Status Summary** | 4 core numeric cards for a quick global overview |
| **Unified API Settings** | Guides you to consolidate keys from multiple accounts into a self-hosted gateway for unified client calls |
| **Action Required** | Prioritizes issues requiring your attention (e.g., expired accounts, missing configurations) |
| **Automation Execution** | Collapsible monitoring panels for 4 automated tasks (auto check-in, announcement fetching, etc.) |
| **Recent Usage** | Summarizes today's and the past 7 days' request counts, tokens, estimated costs, and proportions |
| **Configuration Overview** | Status of 6 core features with one-click smart navigation to settings |

---

## 1. Top Status Summary

Four key numeric cards provide an instant snapshot of the current overall status:

| Card | Meaning | Click Effect |
|:---|:---|:---|
| **Accounts** | Number of currently enabled accounts | Click to jump to **Account Management** |
| **Credential Library** | Number of entries saved in the API Credential Library | Click to jump to **API Credential Library** |
| **Today's Usage** | Total API requests made today across all accounts | Click to jump to **Usage Analytics** |
| **Pending** | Number of exceptions or to-do items requiring attention | **Display-only (not clickable)**; details are shown in the "Action Required" section below |

### Status Dot Color Meanings:
- 🟢 **Green**: Normal / Data available.
- 🟡 **Yellow**: Requires attention (e.g., zero accounts, or "Pending" count > 0).
- 🔵 **Blue**: Neutral prompt / No data yet (e.g., zero credentials, or no requests today).

> 📌 **Today's Usage Data Coverage**:
>
> Hovering over the Today's Usage card displays a tooltip: *"Complete X · Partial Y · Eligible Z"* (if any accounts are not refreshed, it will be marked as *"Includes pending refresh"*).
>
> This indicates whether today's data is fully accounted for. For details, see [Usage Analytics](./usage-analytics.md).

---

## 2. Unified API Settings (Self-Hosted AI Gateway Guide)

> 💡 **What is this for?**
> If you’ve purchased keys from multiple AI platforms, you’d normally have to manually enter each key into every chat client (e.g., Cherry Studio, ChatBox). This section guides you step-by-step to import your scattered keys into your **self-hosted AI gateway** (e.g., New API / One API). Then, you only need **one API endpoint and key**—configure it once in your chat client, and all models become accessible!

### 4-Step Progress Guide:

1. **Prepare Data Sources**: Add accounts with readable keys, or manually save API keys in the Credential Library.
2. **Save Gateway Settings**: Enter the admin connection details for your self-hosted AI gateway.
3. **Create Gateway Channels**: One-click import of existing account keys or API credentials as gateway channels.
4. **Connect Client**: Obtain the gateway’s API endpoint and invocation key to configure in your client software.

### Status and Buttons:
- The top-right corner of the card displays a **data source badge** (e.g., `No Source`, `Account Source`, `Credential Source`, `Account + Credential`, `Account Temporarily Unimportable`).
- Steps are marked with progress indicators: ✅ Completed / 🔵 Current Step / ⚪ Later.
- The button at the bottom dynamically changes based on your progress (e.g., "Add Account," "Configure Self-Hosted AI Gateway," "Add First Gateway Channel").

> 💡 **No need for a self-hosted gateway?**
> If you don’t need a self-hosted gateway, you can ignore this section. Simply copy or export individual keys from the **API Credential Library** for use in your software.
>
> ⚠️ **Boundary Clarification**:
> All API Hub only helps you **locally manage and import configurations**. It does **not** proxy your model requests. When chatting, your client communicates **directly** with your self-hosted gateway.

---

## 3. Action Required

This section **only displays items requiring your attention**, sorted by severity:

- 🔴 **Error**: An account is disconnected (e.g., login expired, banned). Displays `[Account Name] Status Abnormal` with the reason. Click **"Open"** on the right to jump directly to troubleshooting.
- 🟡 **Warning**: Minor account anomalies. Click **"Open"** to jump to troubleshooting.
- ℹ️ **Info**:
  - If no accounts are added after plugin installation: Displays `No Accounts Yet`. Click **"Open"** to add an account.
  - If no API credentials are saved: Displays `No API Credentials Yet`. Click **"Open"** to enter credentials.

> 🟢 **Empty State**:
> When there are no pending items, this section displays a green checkmark with **`No action items at the moment.`**

---

## 4. Automation Execution

On the right are **collapsible monitoring panels** for 4 automated tasks (default: collapsed; click to expand for details; use the right-side icon for one-click access):

### ① Auto Check-In
- **Expanded Content**: Overview of the current check-in round (e.g., `5/10` means 5 out of 10 check-in-capable accounts succeeded), success/failure/skipped mini-blocks, last run time, next scheduled time.
- **Action Buttons**: **"View Check-Ins"** (opens the check-in page) and **"Retry Failed"** (only shown if there are failures).

### ② Website Announcement Fetching
- **Expanded Content**: Fetch interval (minutes), total announcements, unread count, last check time.
- **Action Buttons**: **"View Announcements"** and **"Configure Fetching"** (jumps to settings to modify frequency).

### ③ Managed Site Model Sync
- *Only visible if you’ve set up a self-hosted gateway supporting model sync.*
- **Expanded Content**: Sync interval (hours), concurrency, limited model count.
- **Action Buttons**: **"Open Sync"**.

### ④ WebDAV Backup Sync
- **Expanded Content**: Sync interval (minutes), sync strategy (merge, upload-only, or download-only), data range count.
- **Action Buttons**: **"Open Backup Sync"**.

---

## 5. Recent Usage

Displays a snapshot of today’s and the past 7 days’ usage:

- **Left: Core Cost**: Large font displays **Today’s Consumption** (estimated cost, e.g., `$0.15`), with an **"Open"** button to jump to **Usage Analytics** for detailed charts.
- **Middle: 4 Metric Blocks**:
  - **Today’s Requests**: Number of API calls made today.
  - **Today’s Tokens**: Total tokens consumed today.
  - **Last 7 Days’ Requests**: Cumulative requests over the past 7 days.
  - **Last 7 Days’ Tokens**: Cumulative tokens over the past 7 days.
- **Right: Recent Trends**:
  - Subtitle: **"Today’s Proportion of Last 7 Days"**.
  - Below: **2 percentage progress bars**:
    1. **Request Proportion**: Today’s requests as a % of the last 7 days’ total.
    2. **Token Proportion**: Today’s tokens as a % of the last 7 days’ total.

> ℹ️ **No Usage Records Yet**:
> The entire section displays an empty state card with the message: *"After initiating a request or completing usage history sync, this will auto-summarize..."*. Click **"Open"** to go to Usage Analytics.

---

## 6. Configuration Overview

Displays 6 configuration status cards categorized by type:

| Category | Description | Sub-Item Buttons |
|:---|:---|:---|
| **Account Basics** | Account, balance, and health status—the foundation for other features | Account Management |
| **Credential Assets** | Whether API credentials and account keys are ready | API Credentials, API Keys |
| **Automation** | Whether auto check-in and announcement fetching are enabled | Auto Check-In, Website Announcements |
| **Data History** | Whether usage and balance history data is available | Usage Analytics, Balance History |
| **Backup Sync** | Local data backup and cross-device sync configuration | WebDAV Manual Backup, WebDAV Auto Sync |
| **Self-Hosted AI Gateway** | Gateway channel management and model sync (only visible if a self-hosted site is configured) | Channel Management, Model Sync |

### 🌟 Smart Navigation:
Each card’s sub-item buttons include a **status badge** (Configured / Not Enabled / Pending Setup / Not Applicable). Clicking them intelligently:
- **If the item is not configured**: Automatically jumps to the corresponding **"Basic Settings"** section and **highlights the switch in a yellow box**, showing you exactly where to enable it!
- **If the item is already configured**: Directly opens the relevant business page (e.g., the Auto Check-In page).

---

## Page Loading and Status Notes

- **Loading**: A spinner appears in the center with the text *"Loading Overview..."*.
- **Partial Load Failure**: A yellow alert at the top: *"Some information failed to load. Displaying available data."* Click **"Retry"** on the right to refresh.
- **Data Refresh**: The Overview page automatically refreshes data upon entry. Some usage and historical data is locally cached.

---

## FAQ

| Question | Answer |
|:---|:---|
| **Why do some numbers show "—"?** | Data is still being fetched, or the current site does not support this metric. Wait a few seconds and refresh. |
| **Can I disable the "Action Required" section?** | No. This section aggregates critical reminders affecting plugin usage. Items disappear automatically once resolved. |
| **Is Unified API Setup mandatory?** | No. If you only need to track balances or export individual keys, a self-hosted gateway is unnecessary. |
| **Why don’t I see the "Self-Hosted AI Gateway" card?** | This is normal. The card only appears if you’ve selected a self-hosted site type (e.g., New API) in the settings. |

---

## Related Documents

- [Account Management](./account-management.md)
- [API Credential Library](./api-credential-profiles.md)
- [Auto Check-In and Check-In Monitoring](./auto-checkin.md)
- [Site Announcements](./site-announcements.md)
- [Self-Hosted Site Management](./self-hosted-site-management.md)
- [Managed Site Model Sync](./managed-site-model-sync.md)
- [Usage Analytics](./usage-analytics.md)
- [Balance History](./balance-history.md)
- [Data Import/Export](./data-management.md)
- [Permissions (Optional)](./permissions.md)
