## 1. Data Model & Migration

- [ ] 1.1 Add `excludeFromTotalBalance` to `SiteAccount` and `DisplaySiteData` types
- [ ] 1.2 Add account config migration step to normalize default (`false`) for stored accounts
- [ ] 1.3 Project `excludeFromTotalBalance` into `DisplaySiteData` in `accountStorage.convertToDisplayData`

## 2. Total Balance Aggregation

- [ ] 2.1 Update `calculateTotalBalance` to exclude accounts with `excludeFromTotalBalance = true`
- [ ] 2.2 Ensure any wrapper/consumer uses the shared aggregation logic (no duplicate totals)

## 3. Account UI Toggle

- [ ] 3.1 Add “Exclude from Total Balance” toggle to the account add/edit dialog UI
- [ ] 3.2 Wire dialog state + persistence (save/update) to store the flag
- [ ] 3.3 Add i18n strings (EN + zh_CN)

## 4. Tests

- [ ] 4.1 Extend `tests/utils/formatters.test.ts` to cover excluded-account totals
- [ ] 4.2 Update/add migration tests for the new config version default
- [ ] 4.3 Add a dialog logic/UI test to ensure the flag is persisted on save/update

## 5. Verify

- [ ] 5.1 Run targeted Vitest suite for the touched areas

