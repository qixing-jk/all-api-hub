# Account Management

> This guide covers organization, maintenance, and bulk operations after accounts have been added. To add a new account or find manual entry instructions, see [Add Accounts](./add-account.md).

## Add an Account

Try auto-detection first. If it fails, you can manually enter the information required by New API, Sub2API, OpenRouter, and other site types.

- [View the complete account addition guide](./add-account.md)
- [Go directly to manual addition](./add-account.md#manual-addition)

## 1. Duplicate Account Cleanup

If you accidentally add multiple duplicate accounts, use the built-in cleanup tool:

1. Open **Account Management** and click **"Scan for Duplicate Accounts"** at the top.
2. Review the results in **Duplicate Account Cleanup**. **Suspected duplicates** with different addresses require individual review and are excluded from bulk cleanup.
3. The extension groups accounts by **URL origin + User ID**. It can also group accounts that use the same Management Key.
4. Choose one of the **three retention strategies**, or manually select which account to keep.
5. Confirm the cleanup before deletion.

---

## 2. Account Organization and Sorting

As your account list grows, use the following features to keep it organized.

### 2.1 Tags

- Add tags such as `Work`, `Personal`, `Relay`, or `Official` to accounts.
- Filter accounts by tag at the top of the panel.
- Tags are shared with Bookmarks and API Credential Profiles and support global renaming.

### 2.2 Pinning

- Open the **"…"** menu on an account and select **"Pin Account"**.
- For a pinned account, select **"Unpin Account"** from the same menu.
- Pinned accounts display a pin indicator in their row.
- Pins come first within each browsing-context tier. Current-site accounts and accounts with related pages open can appear before unrelated pins; disabled accounts always stay last.

### 2.3 Sorting Priority

- In **Settings → Account Management → Sorting Priority Settings**, independently control current-site and related-open-page priority. Changes save automatically.
- Use **Sort by** to select account name, balance, today's consumption or income, check-in requirement, health status, custom check-in or redeem links, or creation time, then toggle the direction.
- **Reset to default order** clears the field sort while retaining browsing-context switches and saved manual positions.
- Click **Reorder** in the full settings page to drag accounts. Changes save automatically, and accounts move only within their pinned, normal, or disabled group.
- Search and manual ordering do not apply browsing-context boosts. See [Sorting Priority Settings](./sorting-priority.md).

### 2.4 Balance and Today's Income Totals

- When adding or editing an account, enable **"Exclude from Total Balance"** to omit it from total balance calculations in the popup, account list, and shared overview snapshots. This does not affect account refresh, check-in, or list visibility.
- Enable **"Exclude from Today's Income"** when an account's income should not count toward today's total. This affects only today's income total in the popup, account list, and shared overview snapshots; it does not hide the account or stop refresh and check-in.

### 2.5 Per-account "…" Menu

The account **"…"** menu groups key, model, refresh, check-in, related-page, sharing, and account-management actions. Available items depend on account status and site capabilities. You can also report check-in problems or request support here.

For a disabled account, the menu contains only **Enable Account** and **Delete**.

::: tip "Quick Check-in" and "Check-in Settings"
- **Quick Check-in** immediately invokes the account's built-in check-in provider. It can run even when the global daily schedule is disabled, but the account must still be enabled and detected, its account-level "Enable Daily Auto Check-in" setting must be on, its site type must have a built-in provider, and its credentials must be usable.
- **Check-in Settings** is the section in the account edit form. Accounts with a built-in provider display "Enable Daily Auto Check-in", while every account can optionally specify an external check-in site URL. The account form has no legacy "check-in detection" switch; check-in status is read automatically during account refresh or detection.
- See [Automatic Check-in](./auto-checkin.md) for the complete behavior.
:::

---

## 3. Health Status and Error Codes

The extension monitors account connectivity. A warning or error on an account card usually means:

- **401 Unauthorized**: The login has expired or the Access Token is no longer valid.
- **429 Too Many Requests**: The site rate limit was reached. The extension queues an automatic retry.
- **403 Forbidden**: Cloudflare protection was probably triggered. See the [Cloudflare Helper](./cloudflare-helper.md).

Click the health status icon on the account card to view detailed error information. See the [FAQ](./faq.md) for more troubleshooting guidance.

---

## 4. Bulk Operations

Select accounts in Account Management to use the actions below. Search and tag changes retain existing selections, so review all selected accounts and deselect unwanted items before deleting or disabling them.

- **Select Current Results**: Select all accounts matching the current search and tag filters.
- **Deselect Current Results**: Deselect only accounts in the current filtered results.
- **Clear All Selections**: Clear all selected accounts.
- **Disable Selected**: Disable every selected account.
- **Copy Invitation Links**: Copy invitation links for selected accounts.
- **Delete Selected**: Delete all selected accounts after confirmation.
- **Exit Bulk Mode**: Leave bulk-operation mode.

- Actions are unavailable when no account is selected and become available after selection.
- "Import from Bookmarks" is a separate entry point and is not part of the selection-based bulk toolbar. See [Add Accounts](./add-account.md) for that flow.

---

## Related Documents

- [Add Accounts](./add-account.md)
- [Getting Started](./get-started.md)
- [Auto Refresh and Real-time Data](./auto-refresh.md)
- [Automatic Check-in](./auto-checkin.md)
- [Share Snapshots](./share-snapshot.md)
