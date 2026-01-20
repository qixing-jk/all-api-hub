# Design: Account disable/enable (`SiteAccount`)

## Goals
- Allow users to disable/enable a stored `SiteAccount` from the account action menu.
- Disabled accounts remain visible but are visually de-emphasized (greyed out).
- Disabled accounts are excluded from aggregate stats.
- Disabled accounts do not participate in any activities:
  - Background (auto refresh, auto check-in, redemption assist)
  - Manual account actions (refresh, copy key, open pages, check-in, redeem, edit, delete, pin/unpin, etc.)
- The only allowed account action while disabled is enabling the account.

## Data Model
- Add `disabled?: boolean` to `SiteAccount`.
  - Backward compatible: treat `undefined` as `false`.
  - Store the flag alongside the rest of the account record so it is included in backups/WebDAV sync.
- Propagate to `DisplaySiteData` so UI can render disabled state without re-querying storage.

## Enforcement Strategy (Single Source of Truth)
To ensure “disabled means no activity” across both UI and background code paths:
- Enforce gating at service boundaries (not just UI):
  - If a service method performs an account-scoped action, it must check `account.disabled` and reject/skip.
  - Background loops must filter out disabled accounts early and also guard per-account execution.
- UI should also hide/disable actions for clarity and to prevent user confusion.

This layered approach prevents accidental participation via:
- background schedulers and alarms
- deep links / future UI entry points
- programmatic calls from other features

## UI Behavior
- Account Management account list rows render a disabled state:
  - Reduced opacity (greyed out), and a clear “Disabled” indicator.
- Account action menu:
  - Enabled account: show “Disable account”.
  - Disabled account: show “Enable account”.
  - When disabled, all other menu items and shortcut buttons are hidden or disabled.

## Visibility Scoping
Disabled accounts should be discoverable only where users can re-enable them. To avoid accidental exposure in future features, implement a two-tier retrieval approach:
- **Management views** (Account Management list): include disabled accounts.
- **All other scenarios** (stats, background jobs, auto-checkin pages, redemption assist, account pickers): exclude disabled accounts by default.

This reduces the chance that a new feature accidentally “sees” disabled accounts, while still keeping an obvious recovery path (enable in the account list).

## Stats
- Any aggregate computation over accounts (balance, today consumption, etc.) must use only enabled accounts.

## Non-goals
- Disabling does not modify or revoke upstream credentials; it only gates extension behavior.
- Disabling does not remove the account from storage or from sync/backups.
