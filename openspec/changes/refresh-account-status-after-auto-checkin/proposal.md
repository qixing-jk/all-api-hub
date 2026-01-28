## Why

After background auto check-in completes, account lists in UI surfaces (e.g., the side panel) can remain stale, making it hard to tell which accounts have checked in and which have not. Automatically syncing and broadcasting the latest check-in status improves clarity, reduces manual refreshes, and increases confidence in automation.

## What Changes

- After an automatic check-in run completes, refresh and persist the latest check-in status for the accounts involved in that run.
- Notify any open UI surfaces (side panel, popup, options) so account lists and status indicators update immediately without a manual reload.
- Add a user preference (feature toggle) to enable/disable post-checkin refresh + UI notification.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `auto-checkin`: After a successful automatic check-in outcome, ensure affected accounts are refreshed and UI surfaces are notified so the latest check-in status is visible immediately (configurable via a user preference).

## Impact

- Auto check-in execution pipeline (background/service worker) and result persistence.
- Account refresh logic and storage updates for check-in status fields.
- Runtime messaging (action IDs + broadcasting) and UI listeners to invalidate/refetch account data (especially side panel account lists).
- Options/settings UI and i18n resources for the new toggle.
- Tests (unit/integration) for post-checkin refresh and UI notification paths.
