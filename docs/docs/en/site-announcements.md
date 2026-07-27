# Site Announcements

> Automatically fetch announcements from the sites linked to your saved accounts, keep new announcements in one place, and optionally send reminders through task notifications.

## When to use it

Many relay sites use site announcements to publish maintenance windows, model changes, pricing updates, recharge campaigns, or usage restrictions. If you manage multiple accounts, checking each site manually is easy to miss.

The site announcements feature periodically checks the sites linked to your enabled accounts and collects new announcements on the **`Site Announcements`** page. From there, you can filter by site, read announcement details, mark items as read, or run a manual check.

## How it relates to notifications

Site announcements handle **fetching, saving, and displaying announcements**. Task notifications only deliver a reminder through browser system notifications or third-party channels after a new announcement is found.

These two switches are separate:

- **`Enable site announcement polling`**: controls whether All API Hub checks site announcements in the background.
- **`Site announcement notifications`**: controls whether new announcements are sent through task notification channels.

If you only want a central announcement inbox without pop-up reminders, enable polling and disable notifications. If you disable polling, notification channels will not fetch site announcements on their own.

## Where to find it

### View announcements

1. Open the All API Hub settings page.
2. Select **`Site Announcements`** in the sidebar.
3. Review fetched announcement records, or click **`Check now`** to refresh manually.

### Enable or disable background polling

1. Open **`Basic Settings → General`**.
2. Find **`Site announcements`**.
3. Use **`Enable site announcement polling`** to control scheduled background checks.

Disabling background polling does not delete existing local announcement records. The **`Site Announcements`** page can still run a manual check.

### Configure reminders for new announcements

Site announcement reminders use the channels configured in [Task Notifications](./task-notifications.md).

1. Open **`Basic Settings → General → Notifications`**.
2. Enable **`Task notifications`** and configure at least one notification channel.
3. Enable **`Site announcement notifications`** in the notification events.

If you only disable **`Site announcement notifications`**, new announcements are still saved locally, but they will not be sent through browser notifications or third-party channels.

## Polling rules

| Item | Description |
|------|-------------|
| Checked accounts | Saved accounts that are enabled. |
| Default interval | Checks every 360 minutes by default. |
| Interval range | Configured values are limited to 15 minutes through 24 hours. |
| Deduplication | New announcements from the same site are deduplicated by content or upstream announcement ID. |
| Local retention | Up to 10 announcement records are kept per site. |
| Manual check | **`Check now`** on the **`Site Announcements`** page is not blocked by the background polling switch. |

For accounts that share the same site-wide announcement endpoint, All API Hub checks the site once to avoid duplicate polling. Sub2API announcements are account-scoped unread announcements, so they are checked per account.

## Supported sources

Site announcements currently support two main sources:

| Source | How it is fetched | Notes |
|--------|-------------------|-------|
| One API / New API compatible sites and common variants | Reads the site's `/api/notice` endpoint | Applies to many One API, New API, Veloera, OneHub, DoneHub, and similar compatible deployments. Actual availability depends on whether the target site keeps this endpoint and returns usable announcement content. |
| Sub2API | Reads the account's unread announcement endpoint | After unread announcements are fetched, All API Hub will try to sync the upstream read state after successful notification or local reading. |

If a site has no usable announcement endpoint, or the endpoint returns empty content, All API Hub treats it as no displayable announcement for now. You can check the latest per-site status on the **`Site Announcements`** page.

## Page actions

The **`Site Announcements`** page supports:

- **Summary metrics**: view total announcements, unread announcements, and affected sites.
- **Filters**: filter by site, site type, and read state.
- **Expand details**: open an announcement to read the full content.
- **Mark as read**: mark one announcement, or the current filtered set, as read.
- **Check now**: manually trigger announcement polling and refresh local records.
- **View source**: open the corresponding site announcement page or homepage to confirm details on the original site.

## FAQ

### Why are there no announcement records?

Possible causes include:

- The account's site currently has no announcements.
- The site does not expose a compatible announcement endpoint.
- The account is disabled, so it is skipped by background checks.
- The browser background task has not run yet. Open **`Site Announcements`** and click **`Check now`**.

### Why does it show “unsupported announcement endpoint”?

This means the latest check did not find a usable announcement endpoint, or the target site's API behavior does not match the format currently supported by All API Hub. This is common on privately modified deployments, sites that disabled the announcement endpoint, or sites that changed the response shape.

### Why can I still see new announcements after disabling notifications?

**`Site announcement notifications`** only controls whether new announcements are sent through browser system notifications or third-party channels. As long as **`Enable site announcement polling`** remains enabled, new announcements are still saved locally.

### Why can I run a manual check after disabling background polling?

The background polling switch only controls scheduled tasks. Manual checks are user-initiated refreshes for temporary updates or troubleshooting, so they are not blocked by that switch.

### Does Sub2API read state sync back to the site?

All API Hub tries to sync it. After successfully notifying you about new announcements, it attempts to mark the corresponding Sub2API announcements as read. When you expand an unread Sub2API announcement locally, it also tries to sync the upstream read state. If the site API fails, the local read state still follows your local action.

## Related docs

- [Task Notifications](./task-notifications.md): configure browser system notifications, Telegram, Feishu, DingTalk, WeCom, ntfy, or generic webhooks.
- [Account Management](./account-management.md): add, disable, or organize accounts that should participate in announcement polling.
- [Supported Sites and System Types](./supported-sites.md): learn about common site types and compatibility.
