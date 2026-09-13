# Sorting Priority Settings

The account list combines browsing context, pinned status, and your chosen sort field. You can control browsing-context priority independently or sort by fields such as balance and check-in requirement.

## Accessing settings

Open **Settings → Account Management → Sorting Priority Settings**, or use the settings shortcut beside the list's sort controls. On narrow screens, the shortcut is in the list's More menu.

## Browsing-context priority

Two independent switches save changes automatically:

- **Prioritize the current site account**: show the account matching the current site's signed-in user first.
- **Prioritize accounts matching other open tabs**: prioritize accounts whose site or configured check-in or redeem page is open, and show a “Related page open” badge. Similar tab titles alone do not trigger priority. Configured page paths, query parameters, and hash routes also participate in matching, so other pages on a shared site are not mistaken for related pages.

During normal browsing, the order is:

1. The account matching the current site's signed-in user.
2. Other accounts with related pages open.
3. Accounts that match neither rule.
4. Disabled accounts, which always stay last.

Within each of the first three tiers, pinned accounts come first, followed by the selected field sort. Ties use saved manual order, then account name. Turning off a switch removes its boost; with both switches off, accounts are grouped as pinned, normal, and disabled.

For example, an unpinned account with a related page open can appear before an unrelated pinned account. Row badges and their tooltips explain these priorities.

## Sorting by a field

Choose a field from **Sort by**, then use the adjacent direction button to switch between ascending and descending order:

- Balance, today's consumption, and today's income. Consumption and income options are hidden when today's cashflow display is off.
- Check-in requirement and health status.
- Custom check-in and redeem links, sorted by whether a link is configured.
- Creation time.

Selecting check-in requirement or a custom link field initially puts accounts needing check-in or having the link first. Creation time initially puts newer accounts first. Field sorting applies within the same priority tier and pin group; it does not move disabled accounts ahead of enabled accounts.

**Reset to default order** clears the active field sort and restores the order determined by browsing context, pins, and saved manual positions. It does not disable browsing-context switches or delete the manual order.

## Manual ordering and search

In the full settings page's account list, click **Reorder**, drag accounts, then click **Done reordering**. Changes save after each drag. Pinned, normal, and disabled accounts can only move within their own groups. Change an account's pinned or disabled status to move it between groups. Manual ordering is unavailable in the popup; open the full settings page instead.

Search and manual ordering do not apply browsing-context boosts. Search results remain grouped as pinned, normal, and disabled, retaining search-match order within each group. Field sorting and dragging are unavailable during search. Normal sorting resumes when you leave search or manual ordering.

## Do upgrades require reconfiguration?

Existing choices for the current-site and open-tab switches, the selected sort field, and its direction are preserved. Settings no longer offer draggable rules or switches for every criterion: the list handles pins, disabled accounts, and manual order, while check-in requirement, health status, and custom links are selected from the sort menu.

## Related documentation

- [Account Management](./account-management.md)
- [Automatic Check-in](./auto-checkin.md)
- [Automatic Refresh](./auto-refresh.md)
