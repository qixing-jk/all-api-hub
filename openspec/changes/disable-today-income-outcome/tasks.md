## 1. Preferences & Migration

- [x] 1.1 Add `showTodayCashflow` to `UserPreferences` with default `true` in `services/userPreferences.ts`
- [x] 1.2 Expose `showTodayCashflow` and an update helper in `contexts/UserPreferencesContext.tsx`
- [x] 1.3 Update preferences migration/versioning so missing `showTodayCashflow` is treated as `true`
- [x] 1.4 Add/adjust tests for preferences defaults + migration (`tests/services/userPreferences.test.ts`, `tests/services/configMigration/preferences/preferencesMigration.test.ts`)

## 2. Options UI Toggle

- [x] 2.1 Add a toggle control in Options → Basic Settings (likely in `entrypoints/options/pages/BasicSettings/components/DisplaySettings.tsx` or a new setting card item) to enable/disable today cashflow
- [x] 2.2 Add i18n keys for the toggle label/description in `locales/zh_CN/settings.json` and `locales/en/settings.json` (and any other supported locale files if required)
- [x] 2.3 On disabling today cashflow, ensure any invalid default selection is corrected (e.g., fallback from “today cashflow” to “total balance”)

## 3. Refresh Pipeline: Skip Today Cashflow Fetches

- [x] 3.1 Thread an `includeTodayCashflow` (or equivalent) flag through account refresh request types (e.g., extend `ApiServiceAccountRequest` / related request objects in `services/apiService/**/type.ts`)
- [x] 3.2 Update `services/accountStorage.ts` refresh orchestration to read `showTodayCashflow` and pass `includeTodayCashflow` into `getApiService(siteType).refreshAccountData(...)`
- [x] 3.3 Gate `fetchTodayUsage()` and `fetchTodayIncome()` in `services/apiService/common/index.ts` so they are skipped when `includeTodayCashflow === false` (return zeroed today fields without issuing log requests)
- [x] 3.4 Apply the same gating behavior for site-type overrides that implement `refreshAccountData` (`services/apiService/wong/index.ts`, `services/apiService/anyrouter/index.ts`, `services/apiService/veloera/index.ts`)
- [x] 3.5 Ensure persisted account info writes zeros for today fields when disabled (avoid stale values resurfacing)

## 4. UI: Hide Today Statistics When Disabled

- [x] 4.1 Popup: hide today consumption/income blocks in `entrypoints/popup/components/BalanceSection/AccountBalanceSummary.tsx` when `showTodayCashflow === false`
- [x] 4.2 Popup: hide token stats widget in `entrypoints/popup/components/BalanceSection/TokenStats.tsx` (and/or its parent `entrypoints/popup/components/BalanceSection/index.tsx`) when `showTodayCashflow === false`
- [x] 4.3 Account list row: hide today consumption/income lines in `features/AccountManagement/components/AccountList/BalanceDisplay.tsx` when disabled
- [x] 4.4 Account list header + sort controls: hide or disable today consumption/income sort options in `features/AccountManagement/components/AccountList/index.tsx` when disabled
- [x] 4.5 Adjust any aggregates/filtered summaries that reference today consumption/income to avoid showing hidden/stale metrics when disabled

## 5. Sorting & Fallback Behavior

- [x] 5.1 Prevent selecting today-statistic sort fields while today cashflow is disabled (UI + state)
- [x] 5.2 When toggling OFF and current sort field is today-statistic-based, automatically fall back to a non-today-statistic field (e.g., balance)

## 6. Tests

- [x] 6.1 Add service-level tests to verify `refreshAccountData` does not call today log fetch helpers when `includeTodayCashflow === false`
- [x] 6.2 Add component tests for popup/account list to ensure today stats are hidden when `showTodayCashflow === false`
- [x] 6.3 Add regression tests to ensure check-in detection/auto-checkin still runs when today cashflow is disabled

## 7. Quality Gates

- [x] 7.1 Run `pnpm lint`, `pnpm format:check`, and `pnpm compile`
- [x] 7.2 Run `pnpm test` (and `pnpm test:ci` if feasible) and address failures caused by this change
