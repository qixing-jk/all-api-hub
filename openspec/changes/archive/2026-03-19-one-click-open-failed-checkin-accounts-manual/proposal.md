## Why

When an auto check-in run fails for multiple accounts, the user currently has to click the per-row "Manual sign-in" action one account at a time and keep switching between the results page and newly opened tabs. That is slow and error-prone for the exact cases where manual recovery is already needed, especially when several accounts can fail together.

## What Changes

- Add a page-level action on the Auto Check-in results view that opens manual sign-in pages for all failed accounts from the latest run in one user action.
- Keep the existing per-row "Manual sign-in" action unchanged, but make the bulk action reuse the same account-resolution and page-opening rules so single-account and bulk recovery stay consistent.
- Show loading and completion feedback for the bulk-open action, including a clear error state when no failed accounts are available to open.
- Extend related tests and localization strings for the new Auto Check-in page action and bulk-open feedback.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `auto-checkin`: Allow users to bulk-open manual sign-in pages for failed accounts from the Auto Check-in results page while preserving the existing single-account recovery action.

## Impact

- UI: `src/features/AutoCheckin/**` action bar / results page controls and user feedback.
- Background/runtime: auto-checkin-related runtime handling or shared tab-opening helpers for bulk manual recovery.
- Navigation/helpers: reuse the existing manual sign-in destination logic for both single-account and bulk-open flows.
- Tests and i18n: update Auto Check-in tests plus `src/locales/*/autoCheckin.json`.
