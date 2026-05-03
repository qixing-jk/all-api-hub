# Bookmark Management

> Used to save quick links to site consoles, documentation, management pages, redemption pages, etc. Suitable for scenarios where "you don't need to create a full account for now, but want to keep frequently used entry points within the plugin."

## Suitable Scenarios

- You only want to save an entry point to a site console and don't want to enter your account information yet.
- A certain site is inconvenient to automatically recognize, but you still want to keep the entry points for its management page, documentation page, or activity page.
- You frequently switch between multiple backends, documentation, and redemption pages and want to organize them uniformly.
- You want to include these links along with your accounts in backups and synchronization, rather than scattering them across your browser's bookmarks.

## Feature Overview

- **Add / Edit / Delete Bookmarks**: Save name, link, tag, and notes.
- **Quick Open and Copy Links**: Suitable for quickly jumping to external backends or sharing with others.
- **Pin to Top**: Important entry points can be fixed at the top.
- **Search and Tag Filtering**: Supports quick searching by name, link, notes, and tags.
- **Drag-and-Drop Sorting**: Order can be adjusted directly when not in search mode.
- **Popup Quick Switching**: Switch between `Accounts / Bookmarks` at the top of the extension popup.

## How to Access

1. Open the plugin settings page.
2. Navigate to **`Bookmarks`** in the left-hand menu.
3. Click **`Add Bookmark`**.

If you just need a temporary jump, you can also save the entry point as a bookmark first, and then decide whether to later register it as a full account.

## What Can Be Saved

Bookmarks can be any URL, commonly including:

- Site console homepage
- Personal profile page
- Recharge page / Redemption page
- Management backend
- Official documentation
- Temporary activity pages

## How to Use

### 1. Add a Bookmark

Fill in the following fields:

| Field | Description |
|------|------|
| Name | For example, "Site Console", "Redemption Entry", "Official Docs" |
| Link | Full URL, e.g., `https://example.com/console` |
| Tag | Optional; shares global tags with accounts and API credentials |
| Notes | Optional; record the purpose or any important notes for this entry point |

### 2. Search and Filter

The bookmark page supports:

- Searching by keyword
- Filtering by tag
- Combining search + tags to narrow down the scope

Searching not only matches bookmark names but also links, notes, and tag names, which is useful when "you only remember the domain name or purpose, but not the bookmark name."

### 3. Pinning and Sorting

- Click **`Pin to Top`** to fix frequently used entry points at the beginning.
- When not in search mode and tag filtering is not enabled, you can directly drag and drop to sort.
- Once you enter search or tag filtering mode, drag-and-drop will be temporarily disabled to prevent mistakenly treating the filtered view as a full sort.

### 4. Using in the Popup

The extension popup at the top supports switching between **`Accounts`** and **`Bookmarks`**:

- `Accounts`: Suitable for refreshing balances, viewing models, checking in, and other account-level operations.
- `Bookmarks`: Suitable for quickly opening links to consoles, documentation, management pages, etc.

This is particularly useful for users who "need management entry points for some sites but don't always need to refresh account data."

## Usage Recommendations

- **Use tags for categorization**: For example, `Documentation`, `Console`, `Recharge`, `Activity`, `Production`.
- **Write site descriptions in the notes**: For example, "Requires login to the main site first", "Visible to administrators only", "End-of-month activity redemption entry".
- **Pin frequently used entry points**: Such as recharge pages, redemption pages, and the main console.
- **Save as a bookmark first, then complete the account**: This is the most convenient approach for sites that are temporarily incompatible or need verification.

## Differences from Browser Bookmarks

Compared to ordinary browser bookmarks, `Bookmark Management` is more oriented towards the plugin workflow:

- Shares the same tag system as accounts and API credentials.
- Can appear directly in the extension popup.
- Will be included in the plugin's data import/export.
- Can be used with WebDAV for multi-device synchronization.

## Frequently Asked Questions

| Question | Description |
|------|------|
| What is the difference between a bookmark and an account? | An account includes authentication information and data refresh capabilities; a bookmark is just a quick link and does not refresh balances, models, or check-in status. |
| Are bookmarks included in backups? | Yes. Bookmarks are shared data and can be migrated along with import/export and WebDAV synchronization. |
| Why can't I drag and drop to sort during search? | Search / tag filtering only displays a subset of results. Directly dragging could mistakenly alter the global order, so drag-and-drop is disabled in this mode. |
| Can I save site entry points without an account? | Yes, this is one of the most suitable uses for bookmark management. |

## Related Documents

- [Data Import and Export](./data-management.md)
- [WebDAV Backup and Automatic Synchronization](./webdav-sync.md)
- [Automatic Check-in and Check-in Monitoring](./auto-checkin.md)