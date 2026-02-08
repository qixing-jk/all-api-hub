## 1. Data model & preferences

- [x] 1.1 Define `daily-balance-history` store types (snapshot record, store schema version) under `types/`
- [x] 1.2 Register storage keys/constants for the new store (`services/**/constants.ts` or `services/storageKeys.ts`)
- [x] 1.3 Add user preferences for balance history (global enable default disabled, end-of-day capture default disabled, retention days default) with migration

## 2. Storage service (CRUD + pruning)

- [x] 2.1 Implement a dedicated storage service for daily snapshots (load/sanitize/save/update)
- [x] 2.2 Implement retention pruning and run it on writes and on preference changes
- [x] 2.3 Add selectors/helpers to query snapshots by account ids + day range (dense day keys, missing treated as gaps)

## 3. Snapshot capture on refresh

- [x] 3.1 Gate snapshot upsert by the global enable switch (no writes when disabled)
- [x] 3.2 Hook snapshot upsert into successful account refresh (single-account) using returned `quota/today_income/today_quota_consumption`
- [x] 3.3 Ensure refresh-driven capture respects `showTodayCashflow` (do not force log fetches solely for history)
- [x] 3.4 Ensure capture does not run on failed refreshes and does not store inferred values

## 4. Best-effort end-of-day scheduler

- [x] 4.1 Implement an alarms-based daily scheduler that is enabled only when the end-of-day capture switch is enabled
- [x] 4.2 Force `includeTodayCashflow=true` for the scheduled capture run (user opt-in via end-of-day capture switch)
- [x] 4.3 Initialize the scheduler from background service init and ensure it is idempotent
- [x] 4.4 Add fallback behavior when Alarms API is unavailable (refresh-driven capture only)

## 5. Options UI: Balance History page

- [x] 5.1 Add a new Options menu id and register a new page component
- [x] 5.2 Add settings (global enable + end-of-day capture enable + retention) in Basic Settings (dedicated Balance History tab) and provide a shortcut from the Balance History page
- [x] 5.3 Implement data loading (accounts + balance-history store) and filters (accounts + tags)
- [x] 5.4 Implement time range selection bounded by retention window (quick ranges + custom start/end)
- [x] 5.5 Render charts (ECharts): balance trend + daily income/outcome bars; show gaps when data missing
- [x] 5.6 Add page actions: refresh now (updates today) and retention prune
- [x] 5.7 Add an in-page recommendation/warning when `showTodayCashflow` is disabled AND end-of-day capture is disabled (income/outcome history will be empty)

## 6. Localization & docs

- [x] 6.1 Add i18n keys for the Balance History page (title, labels, empty states, retention UI)
- [x] 6.2 Add/adjust docs to describe what is recorded, prerequisites for income/outcome history (`showTodayCashflow` or end-of-day capture), limitations (best-effort), and retention behavior

## 7. Tests

- [x] 7.1 Unit tests for store sanitize/prune logic and day-range selection helpers
- [x] 7.2 Unit/integration tests for refresh-driven capture (snapshot upsert on success, no-op on failure)
- [x] 7.3 Component tests for the Balance History Options page (render, filters, range selection, empty states)
