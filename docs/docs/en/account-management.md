# Account Management

> This document describes how to efficiently add, organize, and maintain your AI site accounts in All API Hub.

## 1. Adding Accounts

All API Hub supports multiple ways to add accounts to accommodate different site types and security settings.

### 1.1 Auto-Recognize (Recommended)
This is the simplest way. You just need to log in to the target site in your browser first, then perform the following in the extension:
1. Click **"Add Account"**.
2. Enter the site address (Base URL).
3. Click **"Auto-Recognize"**.
4. The extension will automatically read login information and fill in the username, user ID, Access Token, and top-up ratio.

### 1.2 Manual Addition
If auto-recognition fails, you can click **"Manual Input"** to fill in the relevant information. You usually need to obtain the `Access Token` and `User ID` from the site's "Personal Center" or "Settings" page.

### 1.3 Cookie Mode
For some sites with strict interface protection or special customizations, if the Access Token mode does not work, you can try switching to **"Cookie Mode"**. In this mode, the extension will use your current login session (Cookie) to request data.

---

## 2. Optimizing the Addition Experience

In **"Settings -> Basic Settings -> Account Management"**, you can enable the following features to improve the efficiency of adding accounts:

- ⚡ **Auto-fill Current Page URL**: When enabled, clicking "Add Account" will automatically fill in the URL of the current browser tab, saving you from manual copying.
- 🔑 **Auto-provision Default Token after Adding**: When enabled, after successfully adding an account, the extension will automatically attempt to create a default API key (Token) for you in the site backend for immediate export and use.
  - **AIHubMix**: AIHubMix API keys are only displayed in full once upon creation. After adding a new AIHubMix account (excluding the "Configure to Hosted Site" process), the extension will first check if the account already has a token. If it does, it will skip the creation prompt. If not, it will pop up a confirmation dialog asking if you want to create the default key immediately and display the one-time full key; if you cancel, you will need to manually create and save the full key in "Key Management" later.
- ⚠️ **Warn on Adding Duplicate Accounts**: When attempting to add an already existing site (same URL), the extension will pop up a confirmation prompt to prevent accidental duplicate additions. You can choose to continue this addition, cancel the operation, or directly disable future duplicate reminders and continue with this addition.

---

## 3. Duplicate Account Cleanup

If you accidentally add many duplicate accounts, you can use the built-in cleanup tool:

1. Go to **"Settings -> Account Management"**.
2. Click **"Cleanup Duplicate Accounts"** in the toolbar.
3. The extension will scan all accounts based on `Site URL + User ID`.
4. You can preview duplicates and select **"One-click Cleanup"**; the system will automatically keep the one with the latest update time (or the most complete data).

---

## 4. Account Organization and Sorting

As the number of accounts increases, you can keep the list tidy in the following ways:

### 4.1 Tags
- Add tags to accounts (e.g., `Work`, `Personal`, `Relay`, `Official`).
- Quickly filter via tags at the top of the panel.
- The tag system is shared with bookmarks and the API Credential Library, supporting global renaming.

### 4.2 Pinning
- Hover over an account card and click the **"Pin"** icon.
- Pinned accounts will always be displayed at the top of the list.

### 4.3 Sorting Priority
- In **"Settings -> Sorting Priority"**, you can customize global sorting logic. For details, see [Sorting Priority Settings](./sorting-priority.md).
- Supports multi-level sorting by dimensions such as balance, creation time, health status, and check-in status.
- You can also manually adjust the order by dragging in the account list (requires switching to manual sorting mode).

### 4.4 Balance and Today's Earnings Statistics
- When adding or editing an account, you can enable **"Exclude from Total Balance"** to prevent this account from participating in the total balance summary in pop-ups, account lists, and shared overview snapshots; this will not affect account refresh, check-in, or list display.
- If an account's earnings should not be included in the daily summary, you can enable **"Exclude from Today's Earnings"**. This switch only affects the daily earnings total in pop-ups, account lists, and shared overview snapshots; it will not hide the account, nor will it stop refreshing or check-in.

---

## 5. Health Status and Error Codes

The extension monitors account connectivity in real-time. If an account card shows "Warning" or "Abnormal," it is usually because:

- **401 Unauthorized**: Login is invalid or the Access Token has expired.
- **429 Too Many Requests**: Triggered site rate limits; the extension will automatically queue and retry.
- **403 Forbidden**: Usually indicates Cloudflare protection has been triggered; please refer to [Cloudflare Bypass Assistant](./cloudflare-helper.md).

You can click the health status icon on the card to view detailed error messages. For more common error handling, please refer to the [FAQ](./faq.md).

---

## 6. Bulk Actions

On the account management page, you can check multiple accounts to perform the following bulk actions:
- **Batch Refresh**: Immediately update the balance and usage of selected accounts.
- **Batch Check-in**: Manually trigger the check-in process for selected accounts.
- **Batch Export**: Export the configurations of multiple accounts as a JSON file for backup.
- **Batch Delete**: Safely delete selected accounts.

---

## Related Documents

- [Getting Started](./get-started.md)
- [Automatic Refresh and Real-time Data](./auto-refresh.md)
- [Automatic Check-in and Check-in Monitoring](./auto-checkin.md)
- [Share Snapshot](./share-snapshot.md)