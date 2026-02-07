## 1. Site type + routing

- [x] 1.1 Add `sub2api` to `constants/siteType.ts` and include it in `SITE_TITLE_RULES` and `SITE_API_ROUTER`
- [x] 1.2 Add `sub2api` override wiring to `services/apiService/index.ts` (`siteOverrideMap`)

## 2. Sub2API API service implementation

- [x] 2.1 Create `services/apiService/sub2api/` module with typed DTOs for `/api/v1/auth/me` envelope
- [x] 2.2 Implement `fetchCurrentUser` (JWT-auth) and convert `balance` (USD) → `quota` using `UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR`
- [x] 2.3 Implement `fetchAccountData` / `refreshAccountData` returning quota + zeroed “today” stats and check-in disabled
- [x] 2.4 Ensure errors and logs never include JWTs (redaction / avoid logging raw values)

## 3. Auto-detect: read Sub2API dashboard localStorage

- [x] 3.1 Extend content-script storage handler to support reading `auth_token` + `auth_user` (and optional `refresh_token` + `token_expires_at`) and returning a normalized Sub2API user payload (id/username/balance), refreshing/rotating tokens in-page when expiry is near
- [x] 3.2 Update `services/autoDetectService.ts` (and/or related detection helpers) to identify Sub2API when those keys are present and produce `siteType = "sub2api"`
- [x] 3.3 Update `services/accountOperations.ts` auto-detect flow to populate `username`, `userId`, and `accessToken` from Sub2API localStorage when `siteType = "sub2api"`
- [x] 3.4 Resolve `siteType = await getSiteType(url)` before calling `getApiService(...)` to avoid `getApiService(undefined)`
- [x] 3.5 Allow Sub2API `username` to be empty string in validation (auto-detect + form)
- [x] 3.6 Default auto-detect exchange rate to `UI_CONSTANTS.EXCHANGE_RATE.DEFAULT` and implement Sub2API username fallback to email local-part when empty

## 4. Refresh: token re-sync retry on 401 (dashboard access-token auth)

- [x] 4.1 Add refresh-time helper to re-read Sub2API auth state from an existing matching-origin tab, falling back to temp-window context when needed (uses `ContentGetUserFromLocalStorage` so refresh-token-assisted refresh can run when available)
- [x] 4.2 Update Sub2API refresh flow to retry `/api/v1/auth/me` once after re-syncing the token on HTTP 401
- [x] 4.3 Persist the refreshed token (and any updated user identity fields) back into the stored account on success
- [x] 4.4 On repeated 401 or missing localStorage token, set account health to Warning/Error with an actionable “please login again” message

## 5. UX + docs

- [x] 5.1 Update account dialog UX for `sub2api` to clarify “must be logged in” and (optionally) constrain auth method selection to access-token mode
- [x] 5.2 Add docs page or FAQ entry describing Sub2API setup steps and known limitations (JWT-only, no check-in, stats may be partial)
- [x] 5.3 Add/update i18n strings (`locales/zh_CN`, `locales/en`) for Sub2API guidance and error messages

## 6. Tests

- [x] 6.1 Unit tests for Sub2API response parsing and USD→quota conversion
- [x] 6.2 Unit tests for 401 → token re-sync → single retry flow (success and failure branches)
- [x] 6.3 Add/adjust mocks for localStorage retrieval via content-script message handlers (including refresh-token-assisted refresh paths)
- [x] 6.4 Run `pnpm test` for targeted suites; ensure changed behavior is covered
