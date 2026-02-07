## 1. Spec + storage model

- [x] 1.1 Add `sub2apiAuth` to `types/index.ts` (`SiteAccount`) with optional `{ refreshToken, tokenExpiresAt }`
- [x] 1.2 Bump account `configVersion` and add migration to sanitize/normalize `sub2apiAuth` (drop invalid/empty values)
- [x] 1.3 Update `tests/services/configMigration/account/accountDataMigration.test.ts` to cover the new version

## 2. Auto-detect: capture refresh-token credentials (import flow)

- [x] 2.1 Extend `entrypoints/content/messageHandlers/handlers/storage.ts` Sub2API path to return optional `refreshToken` + `tokenExpiresAt` (and keep existing in-page refresh behavior)
- [x] 2.2 Extend `services/autoDetectService.ts` result types to carry Sub2API refresh-token metadata from the content-script response
- [x] 2.3 Extend `services/accountOperations.ts` `autoDetectAccount()` to surface `sub2apiAuth` in its success payload when detected

## 3. Account dialog UX (Sub2API advanced auth)

- [x] 3.1 Add Sub2API “extension-managed session (refresh token)” toggle + warnings in `features/AccountManagement/components/AccountDialog/AccountForm.tsx`
- [x] 3.2 Wire `useAccountDialog.ts` state so auto-detect can populate refresh-token fields (without auto-enabling the toggle)
- [x] 3.3 Ensure users can clear the refresh token and revert to legacy “dashboard-session mode”
- [x] 3.4 Add i18n strings for warnings, incognito/private capture workflow, and token field labels (zh_CN + en)

## 4. Persisting accounts with Sub2API refresh tokens

- [x] 4.1 Extend `validateAndSaveAccount` / `validateAndUpdateAccount` in `services/accountOperations.ts` to persist (or clear) `sub2apiAuth` on `site_type = "sub2api"`
- [x] 4.2 Ensure import/export + WebDAV backup restore preserve `sub2apiAuth` (no stripping/sanitization regressions)

## 5. Sub2API auth logic: refresh-token mode

- [x] 5.1 Implement refresh-token-based access-token refresh helper (POST `/api/v1/auth/refresh`, handle rotation + expiry)
- [x] 5.2 Update `services/apiService/sub2api/index.ts` refresh flow:
  - Prefer refresh-token mode when `sub2apiAuth.refreshToken` is configured
  - Proactively refresh when `tokenExpiresAt` is within buffer
  - On HTTP 401: refresh via refresh token once, retry `/api/v1/auth/me` once
  - Only fall back to dashboard-localStorage re-sync when refresh token is NOT configured
- [x] 5.3 Ensure refresh-token rotation updates are returned as `authUpdate` so account storage can persist them atomically

## 6. Account refresh persistence + race avoidance

- [x] 6.1 Update `services/accountStorage.ts` refresh flow to pass `sub2apiAuth` into the Sub2API api-service request
- [x] 6.2 Persist rotated `sub2apiAuth` (refresh token + expiresAt) from `authUpdate` onto the account record
- [x] 6.3 Serialize refresh-token rotation per account using `withExtensionStorageWriteLock` to avoid concurrent refresh races

## 7. Docs

- [x] 7.1 Update `docs/docs/faq.md` Sub2API section to document:
  - legacy dashboard-session mode limitations
  - multi-account/extension-managed refresh-token mode + security warnings
  - recommended incognito/private import workflow

## 8. Tests

- [x] 8.1 Update `tests/entrypoints/content/messageHandlers/handlers/storage.test.ts` to validate refresh token metadata is returned when present
- [x] 8.2 Extend `tests/services/apiService/sub2api/index.test.ts` to cover refresh-token mode (401 retry, rotation persisted, no localStorage fallback)
- [x] 8.3 Add tests for account refresh persistence of `sub2apiAuth` updates (accountStorage integration/unit as appropriate)
