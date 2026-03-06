## 1. Sub2API adapter foundations

- [x] 1.1 Add Sub2API key-management route constants, DTO types, and envelope parsers for keys and group endpoints
- [x] 1.2 Implement Sub2API token normalization and shared-form request translation for quota, expiration, IP allow list, status, and group metadata
- [x] 1.3 Extract a reusable Sub2API authenticated-request helper that performs JWT refresh or dashboard re-sync retry and persists updated auth when credentials rotate

## 2. Sub2API key-management service overrides

- [x] 2.1 Implement `fetchAccountTokens`, `fetchTokenById`, `fetchUserGroups`, and `fetchAccountAvailableModels` in `src/services/apiService/sub2api`
- [x] 2.2 Implement `createApiToken`, `updateApiToken`, and `deleteApiToken` in `src/services/apiService/sub2api` with current-group resolution and actionable errors
- [x] 2.3 Ensure Sub2API key-management requests use secret-safe logging and return login-required feedback instead of unsupported-site behavior

## 3. Shared key workflow integration

- [x] 3.1 Update shared key entrypoints, dialogs, and exports to rely on the new `sub2api` overrides without adding per-screen forks
- [x] 3.2 Keep Sub2API token forms limited to supported settings by hiding model-limit controls and sourcing selectable groups from current upstream group data
- [x] 3.3 Remove or replace remaining Sub2API unsupported-site messaging in affected key-management and export user flows

## 4. Tests and verification

- [x] 4.1 Add focused tests for Sub2API key parsing, quota and expiration conversion, and group lookup or request translation behavior
- [x] 4.2 Add focused tests for Sub2API key auth recovery, including refresh-token retry, dashboard-session re-sync retry, and unrecoverable auth failure handling
- [x] 4.3 Run targeted validation for the touched Sub2API service and key-management modules, then update any required i18n strings or fixtures
