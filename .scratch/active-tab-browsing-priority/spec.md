# Viewing Tab Outranks Other Related Pages

- Status: Implemented
- Date: 2026-09-22
- Surface: account-list browsing-context priority (`src/services/preferences/utils/sortingPriority.ts`, `src/features/AccountManagement/hooks/AccountDataContext.tsx`)

## Problem

An account whose related page is open in the tab the user is viewing shared one priority tier with accounts whose related page only sits in a background tab. Within that tier ordering fell through to the selected sort field, saved manual order, and account name, so a background tab could outrank the page the user was actually looking at.

## Decision

Split the open-tab tier in two, producing five display tiers:

1. The account matching the current site's signed-in user (`current-site`).
2. Accounts matched by a related page open in the currently viewed tab (`active-tab`).
3. Accounts matched only by related pages in other tabs (`open-tabs`).
4. Unboosted accounts.
5. Disabled accounts, always last.

Pinned accounts still lead within each of the first four tiers, then the selected sort field, saved manual order, and account name.

Both related-page tiers keep the single "相关页面已打开 / Related page open" badge and hint, so no translation keys or locale files change.

### Boundaries

- The viewed tab is the active tab of the current window (`getActiveTabs`, which already swallows query failures).
- The viewed tab must survive the same internal-page filter as every other tab, so extension task pages (check-in windows, temp windows) cannot claim the tier even when another ordinary tab shows the same URL.
- A URL match reaches site granularity only: several accounts sharing the viewed site's origin all take the `active-tab` tier and are separated by pin, field sort, and manual order. Only the signed-in-user check narrows to one account, which is why it stays the highest tier.
- The open-tab scan now reads the active tab after the all-tabs query, so the initial-load gate waits for both queries. Site identity detection (content-script read) still does not gate the list.

## Validation

- `tests/utils/sortingPriority.test.ts`: tier ordering, resolver mapping, current-site and field-sort precedence over the viewed-tab tier, disabled accounts last.
- `tests/features/AccountManagement/hooks/AccountDataContext.test.tsx`: boosts and list order follow the viewed tab and follow tab switches; the identity read stays off the initial-load path.
- `tests/features/AccountManagement/components/SiteInfo.test.tsx`: the viewed-tab tier reuses the related-page badge and hint.
- `pnpm compile`, plus the `tests/features/AccountManagement`, `tests/services/preferences`, and `tests/utils` suites.
