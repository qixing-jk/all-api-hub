# API Adapter Account Data Design

Date: 2026-06-19

## Purpose

Move manual account add/edit live account-data loading behind the
`apiAdapters` Seam so a newly added account site type can define its initial
quota, usage, income, and check-in data loading in its Adapter Module.

Recent adapter slices moved site announcements, runtime model catalog loading,
account completion, key management, account refresh, Sub2API stored auth
recovery, and model pricing behind `getSiteAdapter(siteType)`. Those slices
make a saved account mostly usable after it exists. The remaining gap in the
new-site-type onboarding path is manual save/update validation: before an
account is saved or updated, `accountOperations` still calls the legacy
`getApiService(...).fetchAccountData(...)` facade directly.

## Current Context

The current `SiteAdapter` Interface exposes:

```ts
type SiteAdapter = {
  siteType: AccountSiteType
  family?: SiteBackendFamily
  siteNotice?: SiteNoticeCapability
  siteAnnouncements?: SiteAnnouncementsCapability
  modelCatalog?: ModelCatalogCapability
  modelPricing?: ModelPricingCapability
  accountCompletion?: AccountCompletionCapability
  keyManagement?: KeyManagementCapability
  accountRefresh?: AccountRefreshCapability
}
```

Saved-account refresh already uses:

```ts
getSiteAdapter(account.site_type).accountRefresh
```

Manual add/edit live account-data loading still uses the legacy facade:

- `src/services/accounts/accountOperations.ts`
  - `validateAndSaveAccount(...)` calls
    `getApiService(normalizedSiteType).fetchAccountData(...)`.
  - `validateAndUpdateAccount(...)` calls
    `getApiService(normalizedSiteType).fetchAccountData(...)`.

Those calls build the first `AccountData` snapshot used to persist:

- quota
- today prompt/completion tokens
- today quota consumption
- today request count
- today income
- check-in state
- healthy or warning status after save/update

The backend implementations already vary:

- New API-family compatible sites aggregate quota, usage logs, income logs, and
  optional check-in state through the existing compatible implementation plus
  site-specific overrides.
- Sub2API loads current-user quota, disables check-in, and returns zeroed
  today stats.
- AIHubMix loads quota and used quota from its account endpoint, disables
  check-in, and returns zeroed token/request/income stats until stable endpoints
  exist.

## Problem

Account data is now the highest-value remaining legacy facade path in the
manual account add/edit flow.

Current friction:

1. A new non-compatible account site type still needs legacy `apiService`
   wiring before manual save/update can perform live data loading.
2. `accountOperations` must know that the backend operation is
   `fetchAccountData(...)` on the wide facade instead of asking the account
   site's Adapter for the account-data capability.
3. Tests for manual add/edit account data mock `getApiService(...)`, even
   though the product behavior only needs a narrow account-data Interface.
4. Saved-account refresh and manual add/edit live data loading now use different
   Seams despite loading the same `AccountData` shape.

Deletion test: if direct `getApiService(...).fetchAccountData(...)` calls are
deleted from `accountOperations`, the complexity should not reappear as raw
`siteType` branches in the same Module. It should sit behind an `accountData`
capability that each Adapter can implement or omit.

## Goals

- Add a narrow `accountData` Adapter capability.
- Route manual add-account live data loading through
  `getSiteAdapter(siteType).accountData`.
- Route manual edit-account live data loading through
  `getSiteAdapter(siteType).accountData`.
- Preserve all existing `validateAndSaveAccount(...)` and
  `validateAndUpdateAccount(...)` behavior:
  - validation rules
  - request base URL selection
  - storage URL normalization
  - manual balance override
  - deferred data refresh option
  - fallback-to-config-only save/update when live data loading fails
  - health status mapping
  - tag, note, exclusion, cookie, and Sub2API auth persistence
  - auto-provision-on-add behavior
- Provide Adapter implementations for:
  - New API-family compatible account sites
  - Sub2API
  - AIHubMix
- Keep `accountRefresh` as the saved-account refresh capability.
- Keep the legacy `getApiService(...)` facade available for non-migrated
  capabilities.
- Add focused Adapter tests and account operation regression tests.

## Non-Goals

- Do not add a new site type in this slice.
- Do not merge `accountData` and `accountRefresh` into one capability.
- Do not move account persistence, manual balance override, save/update
  fallback behavior, or auto-provisioning behind the Adapter.
- Do not migrate `fetchUserInfo(...)`, `getOrCreateAccessToken(...)`,
  `fetchSiteStatus(...)`, `fetchSupportCheckIn(...)`, or
  `extractDefaultExchangeRate(...)` in account completion.
- Do not migrate `fetchUserGroups(...)`, `deleteApiToken(...)`, redemption,
  managed-site channel operations, managed-site model sync, or site detection.
- Do not add an import guard in this slice.
- Do not change user-facing copy, locale keys, telemetry events, settings
  search entries, or Playwright E2E tests.

## Approaches Considered

### Approach A: Reuse `accountRefresh` For Add/Edit Data Loading

`accountRefresh.refreshAccount(...)` already returns a health-wrapped result
containing `AccountData`, so manual add/edit could call that capability.

This is not the right Interface. Manual save/update already owns fallback,
storage, and health behavior. It needs raw `AccountData` or an exception so it
can preserve current "save config anyway" semantics. `accountRefresh` also
allows auth updates and refresh-loop health mapping that are specific to saved
accounts.

### Approach B: Keep `fetchAccountData(...)` On The Legacy Facade

This keeps the current behavior and avoids a small Adapter contract.

It leaves the manual account flow coupled to `getApiService(...)`, which is
exactly the remaining friction for adding new non-compatible account site
types.

### Approach C: Add `accountData` Capability For Live Account Snapshots

Add `SiteAdapter.accountData.fetchData(...)` for the raw live account snapshot
used by manual add/edit flows. Keep persistence and fallback semantics in
`accountOperations`.

This is the recommended path. It creates a truthful Interface for one account
site capability without widening `accountRefresh` or turning `SiteAdapter` into
a second flat `apiService` facade.

## Design

### 1. Add `AccountDataCapability`

Create:

```text
src/services/apiAdapters/contracts/accountData.ts
```

Proposed Interface:

```ts
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/apiService/common/type"

export type AccountDataRequest = ApiServiceAccountRequest

export type AccountDataCapability = {
  fetchData(request: AccountDataRequest): Promise<AccountData>
}
```

The Interface intentionally reuses `ApiServiceAccountRequest` and
`AccountData`. This slice changes the Seam, not the account snapshot model.

Capability presence is the support signal. A missing `accountData` capability
means the site type cannot perform live account-data loading in manual add/edit
flows.

### 2. Extend `SiteAdapter`

Add:

```ts
accountData?: AccountDataCapability
```

to `src/services/apiAdapters/contracts/siteAdapter.ts`.

Expected support after this slice:

- New API-family Adapters expose `accountData`.
- Sub2API exposes `accountData`.
- AIHubMix exposes `accountData`.
- Unsupported Adapters omit `accountData`.

### 3. Add New API-Family Account Data Adapter

Create:

```text
src/services/apiAdapters/newApi/accountData.ts
```

The Adapter should delegate through the site-scoped legacy facade:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { getApiService } from "~/services/apiService"

export const createNewApiAccountData = (
  siteType: AccountSiteType,
): AccountDataCapability => ({
  fetchData(request) {
    return getApiService(siteType).fetchAccountData(request)
  },
})
```

`createNewApiAdapter(siteType)` should attach:

```ts
accountData: createNewApiAccountData(siteType)
```

Delegating through `getApiService(siteType)` preserves existing One API/New
API-compatible override behavior for AnyRouter, Veloera, OneHub, DoneHub,
V-API, VoAPI, Super-API, Rix-API, Neo-API, WONG, and unknown-compatible sites
while lower-level backend Modules remain in place.

### 4. Add Sub2API Account Data Adapter

Create:

```text
src/services/apiAdapters/sub2api/accountData.ts
```

The Adapter should delegate to the existing Sub2API implementation:

```ts
import { fetchAccountData } from "~/services/apiService/sub2api"

import type { AccountDataCapability } from "../contracts/accountData"

export const sub2ApiAccountData: AccountDataCapability = {
  fetchData: fetchAccountData,
}
```

The Adapter must preserve Sub2API behavior:

- load quota from the current-user endpoint
- disable check-in
- return zeroed today stats
- keep any auth recovery behavior already owned by the Sub2API implementation

### 5. Add AIHubMix Account Data Adapter

Create:

```text
src/services/apiAdapters/aihubmix/accountData.ts
```

The Adapter should delegate to the existing AIHubMix implementation:

```ts
import { fetchAccountData } from "~/services/apiService/aihubmix"

import type { AccountDataCapability } from "../contracts/accountData"

export const aihubmixAccountData: AccountDataCapability = {
  fetchData: fetchAccountData,
}
```

The Adapter must preserve AIHubMix behavior:

- API origin normalization stays in the AIHubMix implementation.
- Token-authenticated requests continue sending raw
  `Authorization: <access_token>` without a `Bearer` prefix.
- Check-in remains disabled.
- Daily request/token/income stats remain zeroed until stable backend endpoints
  exist.

### 6. Route Manual Save Through The Adapter

Modify `validateAndSaveAccount(...)` in:

```text
src/services/accounts/accountOperations.ts
```

After `normalizedSiteType`, request base URL, auth, check-in config, and
`includeTodayCashflow` are known, resolve:

```ts
const accountData = getSiteAdapter(normalizedSiteType).accountData
```

Then replace the direct call:

```ts
getApiService(normalizedSiteType).fetchAccountData(...)
```

with:

```ts
requireAccountDataCapability(normalizedSiteType, accountData).fetchData(...)
```

The request shape must remain unchanged:

```ts
{
  baseUrl: requestBaseUrl,
  checkIn: checkInConfig,
  accountId: undefined,
  includeTodayCashflow,
  auth: {
    authType,
    userId: accountIdentity,
    accessToken: accessToken.trim(),
    cookie:
      authType === AuthTypeEnum.Cookie
        ? sessionCookieHeader.trim()
        : undefined,
  },
}
```

If the capability is missing, throw a local unsupported-capability error inside
the existing `try` block. The existing catch path should then save a
configuration-only account with warning status, matching current behavior for
failed live data loading.

### 7. Route Manual Update Through The Adapter

Modify `validateAndUpdateAccount(...)` in the same file.

Replace:

```ts
getApiService(normalizedSiteType).fetchAccountData(...)
```

with:

```ts
requireAccountDataCapability(normalizedSiteType, accountData).fetchData(...)
```

The request shape must remain unchanged:

```ts
{
  baseUrl: requestBaseUrl,
  checkIn: checkInConfig,
  accountId,
  includeTodayCashflow,
  auth: {
    authType,
    userId: accountIdentity,
    accessToken: accessToken.trim(),
    cookie:
      authType === AuthTypeEnum.Cookie
        ? sessionCookieHeader.trim()
        : undefined,
  },
}
```

If the capability is missing or live loading fails, preserve the current
fallback-to-config-only update behavior and warning feedback.

### 8. Keep Product Persistence In `accountOperations`

`accountOperations` should keep ownership of:

- form validation
- manual quota conversion
- URL normalization for storage
- request base URL selection
- saved account data shape
- fallback-to-config-only save/update
- health status assignment after save/update
- auto-provision key scheduling after save
- user timestamp mode for updates

The Adapter only owns the backend live account snapshot. That keeps backend
protocol facts behind the Adapter while preserving product semantics in the
account Module.

### 9. Keep Saved-Account Refresh Separate

Do not route `accountStorage.refreshAccount(...)` through `accountData`.

The saved refresh path should continue using `accountRefresh.refreshAccount(...)`
because it needs a health-wrapped result and may persist auth updates for saved
accounts.

Manual add/edit live data loading should use `accountData.fetchData(...)`
because the product Module already owns success/failure mapping.

## Error Handling

Adapter methods should delegate backend errors unchanged.

Product behavior should stay as it is today:

- Successful live data loading saves/updates the account with healthy status.
- Live data loading failure still saves/updates configuration-only data when
  persistence succeeds.
- The fallback warning reason should continue using `getErrorMessage(error)`.
- Timeout behavior in `validateAndSaveAccount(...)` remains wrapped around the
  Adapter call.
- Missing `accountData` capability is treated like a live data loading failure
  in manual add/edit flows, not as a hard save/update blocker.

Do not add user-facing copy for missing `accountData` in this slice.

## Telemetry Decision

Telemetry decision: none.

This is an internal architecture migration. It does not add a new user action,
setting, result category, or visible state. Existing account save/update
behavior and feedback levels should remain unchanged.

## Settings Search Decision

Settings search decision: none.

No settings UI, route, anchor, or search definition changes.

## E2E Decision

E2E decision: no new Playwright E2E in this slice.

The risk is service-layer routing and request/response preservation. Focused
Vitest coverage at Adapter and account operation levels directly covers that
risk. Browser runtime behavior is unchanged.

## Testing Strategy

Add Adapter tests:

- `tests/services/apiAdapters/accountData.test.ts`
  - New API-family `accountData` delegates to
    `getApiService(siteType).fetchAccountData(...)`.
  - Delegated `AccountData` is returned without reshaping.
- `tests/services/apiAdapters/sub2api/accountData.test.ts`
  - Sub2API `accountData` delegates to Sub2API `fetchAccountData(...)`.
  - Check-in disabled and zeroed today stats are not reshaped by the Adapter.
- `tests/services/apiAdapters/aihubmix/accountData.test.ts`
  - AIHubMix `accountData` delegates to AIHubMix `fetchAccountData(...)`.
  - Check-in disabled and zeroed daily fields remain implementation-owned.

Update registry tests:

- New API-family Adapters expose `accountData`.
- Sub2API exposes `accountData`.
- AIHubMix exposes `accountData`.
- Unsupported Adapters omit `accountData`.

Update account operation tests:

- `validateAndSaveAccount(...)` calls
  `getSiteAdapter(...).accountData.fetchData(...)` with the unchanged request
  shape.
- `validateAndSaveAccount(...)` preserves timeout wrapping.
- `validateAndSaveAccount(...)` saves configuration-only data when
  `accountData.fetchData(...)` rejects.
- `validateAndUpdateAccount(...)` calls
  `getSiteAdapter(...).accountData.fetchData(...)` with the unchanged request
  shape.
- `validateAndUpdateAccount(...)` updates configuration-only data when
  `accountData.fetchData(...)` rejects.
- Deferred data refresh paths still do not call `accountData`.
- Manual balance override still wins over refreshed quota.
- AIHubMix storage URL normalization remains unchanged.

Focused validation:

```powershell
pnpm vitest run tests/services/apiAdapters/accountData.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accountOperations.validateAndSaveAccount.test.ts tests/services/accountOperations.test.ts
```

Type validation:

```powershell
pnpm compile
```

Commit gate:

```powershell
pnpm run validate:staged
```

Push gate before publishing:

```powershell
pnpm run validate:push
```

Run `validate:push` before opening or updating a PR because this slice changes
shared Adapter contracts and account save/update wiring.

## Rollout

1. Add the `accountData` contract and Adapter delegation tests.
2. Extend `SiteAdapter`, New API-family, Sub2API, AIHubMix, and registry
   expectations.
3. Migrate `validateAndSaveAccount(...)` live data loading to
   `getSiteAdapter(...).accountData`.
4. Migrate `validateAndUpdateAccount(...)` live data loading to
   `getSiteAdapter(...).accountData`.
5. Re-run focused tests after each migration group.
6. Run `pnpm compile` and `pnpm run validate:staged`.
7. Inspect the diff for scope drift.
8. Run `pnpm run validate:push` before pushing or opening a PR.

## Follow-Up, Not In Scope For This Spec

Later slices may migrate:

- `fetchUserGroups(...)` and group coverage helpers
- `deleteApiToken(...)` in key-management deletion flows
- redemption through a `redemption` capability
- a narrow import guard preventing new product Modules from importing the
  legacy `apiService` facade
- account-completion internals that still call `fetchSiteStatus(...)`,
  `fetchSupportCheckIn(...)`, and `getOrCreateAccessToken(...)`
- managed-site channel operations and model sync
- site detection and route/status probing

Do not turn `SiteAdapter` into a second flat `apiService` facade. Add each
capability only when it hides backend-specific behavior behind a smaller
Interface and gives real caller Leverage.
