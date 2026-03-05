## Why

Admins frequently need to answer “which channel does this account belong to?”, but today it requires manually copying the account base URL (and sometimes keys / model set) and then switching to the channel management page to search/filter. This is slow and error-prone, especially when there are many similar channels.

## What Changes

- Add a new entry in the account card “more actions / context menu” to locate possible matching channels.
- The entry is shown when managed-site admin credentials are configured.
- When triggered, navigate to the Channel Management page and automatically apply filters derived from the current account (highest priority: base URL/origin; optional: model set; key-based exact match when available).
- When key-based matching is not available (e.g. New API 2FA constraints) but a likely match exists (base URL + models), show a clear message that exact key matching is unavailable / requires verification.

## Capabilities

### New Capabilities

- `account-menu-jump-filtered-channel-management`

### Modified Capabilities

- (none)

## Impact

- UI: account card actions/menu; channel management page routing and initial filter state.
- Logic: derive comparable filters from an `Account` (base URL/origin, model set, optional key fingerprint/identifier).
- i18n: new user-facing strings for the menu entry and limitation notices.
- Tests: update/add unit/UI tests for filter derivation and navigation behavior.
