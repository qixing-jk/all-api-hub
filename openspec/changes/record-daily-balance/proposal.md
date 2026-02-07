## Why

All API Hub currently focuses on “current state” (total quota/balance and today income/outcome). Users who want to understand trends (e.g., how balance changes over time, how much they recharge, or how much they consume) have no built-in historical view.

Separately, issue #369 shows that some balance changes may bypass the existing “today income” computation. Even if we do not solve that in this change, having a daily history baseline is a necessary foundation for future accuracy improvements and troubleshooting.

## What Changes

- Persist a lightweight **daily snapshot** per account in local storage, capturing:
  - current remaining quota/balance (`quota`)
  - today income (`today_income`, from recharge/system logs)
  - today outcome/consumption (`today_quota_consumption`, from consume logs)
  - capture timestamp + source (refresh vs scheduled capture)
- Add a global **Balance History** preference to control this capability (disabled by default).
- Add an optional **best-effort end-of-day capture** preference (disabled by default).
- Add an Options **Balance History** page to visualize the recorded daily data with charts and filters.
- Add a user-configurable **retention** setting with a reasonable default, and prune old snapshots accordingly.
- Ensure data collection respects `showTodayCashflow` and guide the user: if `showTodayCashflow` is disabled and end-of-day capture is disabled, income/outcome history will not be populated.

## Capabilities

### New Capabilities

- `daily-balance-history`: Record per-account daily balance/income/outcome snapshots (using upstream “real” refresh data) and visualize them in a dedicated Options page with retention controls.

### Modified Capabilities

## Impact

- New background scheduler + storage service for daily snapshots (`services/**`, `entrypoints/background/**`).
- New Options navigation entry + page UI (`entrypoints/options/**`, `constants/optionsMenuIds.ts`).
- New i18n keys for UI labels and settings (`locales/**`).
- New tests covering snapshot aggregation/pruning and the Options page rendering (`tests/**`).
