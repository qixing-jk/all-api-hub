## 1. Data model and migrations
- [x] 1.1 Add a persisted `disabled` flag to `SiteAccount` and `DisplaySiteData` (default `false`)
- [x] 1.2 Ensure config migration/back-compat: missing `disabled` is treated as enabled

## 2. Activity gating (services)
- [x] 2.1 Gate `accountStorage.refreshAccount` / `refreshAllAccounts` to skip or reject disabled accounts
- [x] 2.2 Exclude disabled accounts from aggregate stats calculations
- [x] 2.3 Gate auto-checkin scheduler selection to skip disabled accounts (with an explicit skip reason)
- [x] 2.4 Gate redemption assist + redeem service so disabled accounts are not considered/usable

## 3. UI behavior
- [x] 3.1 Render disabled accounts greyed out in the Account Management list (and its search)
- [x] 3.2 Exclude disabled accounts from non-management UIs that list/select accounts (e.g., auto-checkin snapshots, redemption assist selectors)
- [x] 3.3 Add “Disable/Enable” to the account action menu; show only enable/disable based on state
- [x] 3.4 Disable/hide all other account actions when disabled (including edit/delete/refresh/copy/check-in/redeem/pin)
- [x] 3.5 Add i18n strings for new labels/toasts and keep UI copy translatable

## 4. Tests and validation
- [x] 4.1 Add/extend unit tests for storage/service gating and stats exclusion
- [x] 4.2 Add component tests for greyed-out UI + action menu restrictions
- [ ] 4.3 Run `pnpm test:ci` and confirm new logic is covered (blocked here: `spawn EPERM` prevents `wxt prepare`, `eslint`, and `vitest` from starting in this environment)
