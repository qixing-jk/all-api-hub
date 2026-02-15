## 1. Specs (avoid drift)

- [x] 1.1 Update `account-key-auto-provisioning` requirement so `autoProvisionKeyOnAccountAdd` defaults to **disabled** (`openspec/changes/*/specs/account-key-auto-provisioning/spec.md`).

## 2. Implementation (default-off)

- [x] 2.1 Change `DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAdd` default to `false` (`services/userPreferences.ts`).
- [x] 2.2 Ensure the account-add flow falls back to `DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAdd` (do not hard-code `true` on preference read failure) (`services/accountOperations.ts`).
- [x] 2.3 Ensure `UserPreferencesContext` fallback default matches the new default (`contexts/UserPreferencesContext.tsx`).

## 3. Tests

- [x] 3.1 Update unit tests to reflect the new default (`tests/services/userPreferences.test.ts`).
- [x] 3.2 Update missing-preference wiring tests to treat missing `autoProvisionKeyOnAccountAdd` as disabled (`tests/services/userPreferences.autoProvisionKeyOnAccountAdd.test.ts`).
- [x] 3.3 Update account-add behavior tests for preference-read failure fallback (`tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts`).

## 4. Tooling reliability

- [x] 4.1 Exclude `WorkTrees/**` from Vitest discovery so local worktrees do not break CI/test runs (`vitest.config.ts`).

## 5. Sync main specs

- [x] 5.1 Archive the change to apply the delta spec into `openspec/specs/account-key-auto-provisioning/spec.md`.
