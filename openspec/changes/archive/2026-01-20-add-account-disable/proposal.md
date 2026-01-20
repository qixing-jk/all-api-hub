# Proposal: Add account disable/enable for `SiteAccount`

## Why
Users want to temporarily “turn off” an account without deleting it. A disabled account should be clearly visible (greyed out), excluded from aggregate stats, and prevented from participating in any account-related activities until it is re-enabled.

## What Changes
- Add a persisted `disabled` flag to `SiteAccount` (default: `false`).
- Add an action-menu toggle to disable/enable an account.
- When an account is disabled:
  - It remains visible only in the Account Management account list (greyed out) so it can be re-enabled.
  - It does not appear in other UI scenarios that list/select accounts.
  - It is excluded from all aggregate stats.
  - All account actions are blocked except “Enable”.
  - Background/automated services skip the account.

## Scope Notes
- “Account” refers to the extension’s stored `SiteAccount` entries (not the upstream panel’s user account).
- This change intentionally blocks *all* account actions when disabled (refresh, check-in, redeem, copy key, navigation, edit, delete, pin/unpin, etc.), matching the requirement “only can enable and disable”.

## Impact
- UX: Users can quickly pause noisy/unused accounts while keeping them for later use.
- Safety: Centralized gating prevents background services from making network calls for disabled accounts.
- Compatibility: Existing stored accounts that don’t have `disabled` are treated as enabled.

## Risks / Mitigations
- **Hidden behavior differences** (e.g., “Refresh all” now skips disabled accounts): Mitigate via clear UI indication and consistent skip counts/toasts.
- **Partial activity runs** if an account is disabled mid-cycle: Mitigate by gating per-account at execution time (service boundary checks).

## Validation
- Unit tests for storage + service gating (refresh, stats, redeem, auto-checkin selection).
- Component tests for action menu behavior and “greyed out” rendering.
- Run `openspec validate add-account-disable --strict` before implementation and `pnpm test:ci` during apply.
