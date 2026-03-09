## 1. Normalization foundation

- [x] 1.1 Add a shared account-defaults helper for canonical `AccountStorageConfig` and `SiteAccount` shapes
- [x] 1.2 Define normalized nested defaults and merge helpers for account reads and partial updates

## 2. Storage integration

- [x] 2.1 Refactor `accountStorage` config read/write/import/export/restore paths to normalize through the shared helper
- [x] 2.2 Refactor `accountStorage.addAccount` and `accountStorage.updateAccount` to build persisted accounts from normalized defaults with `deepOverride`
- [x] 2.3 Preserve explicit cleanup semantics for fields that must be removed after merge, such as stale nested `health.code` values

## 3. Account flow cleanup

- [x] 3.1 Trim account add/edit payload fallback literals in `accountOperations` so storage-layer normalization stays the single source of truth for canonical defaults
- [x] 3.2 Remove duplicated account fallback logic in adjacent account-service consumers and check-in providers where normalized reads already guarantee stable shapes
- [x] 3.3 Keep versioned migrations focused on semantic transforms while leaving additive field defaults to runtime normalization

## 4. Tests and validation

- [x] 4.1 Add focused tests for storage-config normalization and `SiteAccount` default application
- [x] 4.2 Add focused tests for partial account updates, nested deep-merge behavior, array replacement, and explicit cleanup cases
- [x] 4.3 Run the smallest affected Vitest coverage for account normalization and merge helpers, then record any environment blockers
