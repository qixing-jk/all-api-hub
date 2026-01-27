## 1. Data Model & Migration

- [x] 1.1 Add `excludeFromTotalBalance` to `SiteAccount` and `DisplaySiteData` types
- [x] 1.2 Add account config migration step to normalize default (`false`) for stored accounts
- [x] 1.3 Project `excludeFromTotalBalance` into `DisplaySiteData` in `accountStorage.convertToDisplayData`

## 2. Total Balance Aggregation

- [x] 2.1 Update `calculateTotalBalance` to exclude accounts with `excludeFromTotalBalance = true`
- [x] 2.2 Ensure any wrapper/consumer uses the shared aggregation logic (no duplicate totals)

## 3. Account UI Toggle

- [x] 3.1 Add “Exclude from Total Balance” toggle to the account add/edit dialog UI
- [x] 3.2 Wire dialog state + persistence (save/update) to store the flag
- [x] 3.3 Add i18n strings (EN + zh_CN)

## 4. Tests

- [x] 4.1 Extend `tests/utils/formatters.test.ts` to cover excluded-account totals
- [x] 4.2 Update/add migration tests for the new config version default
- [x] 4.3 Add a dialog logic/UI test to ensure the flag is persisted on save/update

## 5. Verify

- [x] 5.1 Run targeted Vitest suite for the touched areas
