## Why

Users may manage multiple site accounts, but not all of them should contribute to the “Total Balance” aggregate (for example: test accounts, archived accounts, or accounts they want to track separately). Today, the only way to exclude an account is to disable it, which is too heavy because it also blocks refresh/check-in and other behaviors.

## What Changes

- Add a per-account setting to exclude the account from Total Balance aggregation (without disabling the account).
- Persist the setting in account storage so it survives refresh, backup/export, and WebDAV sync flows.
- Update the Total Balance aggregation to skip excluded accounts (and continue skipping disabled accounts).
- Add tests to cover the new behavior and backward-compatible defaults.

## Capabilities

### New Capabilities

- `total-balance-exclusion`: Allow users to opt specific accounts out of Total Balance aggregation while keeping the account enabled.

### Modified Capabilities

<!-- None. This change introduces a new capability; it does not change the requirements of existing capabilities under openspec/specs/. -->

## Impact

- `types/index.ts`: add persisted + display fields for the exclusion flag.
- `services/configMigration/account/*`: default/migrate the field for older stored accounts.
- `services/accountStorage.ts`: project the flag into `DisplaySiteData`.
- `utils/formatters.ts`: exclude flagged accounts from `calculateTotalBalance` (and any helper wrappers).
- `features/AccountManagement/components/AccountDialog/*`: add a UI toggle and persist it on save/update.
- `locales/en/accountDialog.json`, `locales/zh_CN/accountDialog.json`: new i18n strings for the toggle.
- `tests/*`: unit tests for aggregation + migration, and a light UI/logic test for persistence wiring if appropriate.

