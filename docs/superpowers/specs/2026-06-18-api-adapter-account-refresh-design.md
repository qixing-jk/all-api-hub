# API Adapter Account Refresh Design

Date: 2026-06-18

## Purpose

Move account refresh behavior behind the `apiAdapters` Seam so a newly added
account site type can define its quota, usage, income, check-in, health, and
credential re-sync behavior in one Adapter Module.

The recent adapter slices moved site announcements, runtime model catalog
loading, account auto-detect completion, and key management behind
`getSiteAdapter(siteType)`. Those slices make it easier to detect an account,
create or resolve keys, and load key-scoped models. The remaining core account
path is refresh: after an account is saved, All API Hub must be able to refresh
balance and health data for the account to be useful in the account list,
background jobs, balance history, and diagnostics.

## Current Context

The shipped `SiteAdapter` Interface currently exposes:

```ts
type SiteAdapter = {
  siteType: AccountSiteType
  family?: SiteBackendFamily
  siteNotice?: SiteNoticeCapability
  siteAnnouncements?: SiteAnnouncementsCapability
  modelCatalog?: ModelCatalogCapability
  accountCompletion?: AccountCompletionCapability
  keyManagement?: KeyManagementCapability
}
```

`src/services/apiService/index.ts` remains the legacy compatibility facade. It
selects the `common` implementation plus optional site overrides and exposes
capability booleans such as `modelPricing` and `redeemCode`.

The main account refresh workflow is still in
`src/services/accounts/accountStorage.ts`:

1. Load the stored account and skip disabled or interval-limited accounts.
2. Normalize the base URL and build the account request auth object.
3. Call `getApiService(account.site_type).fetchSupportCheckIn(...)`.
4. Call `getApiService(account.site_type).refreshAccountData(...)`.
5. Merge the returned account snapshot into persisted account data.
6. Preserve local product rules:
   - manual balance override
   - custom check-in state reset
   - account re-enable on successful manual refresh
   - `authUpdate` persistence for refreshed credentials
   - daily balance-history snapshot capture

The backend implementations already differ:

- New API-family sites aggregate quota, today usage, today income, and optional
  check-in state from compatible One API/New API endpoints.
- AnyRouter, WONG, Veloera, DoneHub, and OneHub keep site-specific refresh or
  data parsing overrides under `src/services/apiService/*`.
- Sub2API disables check-in, loads current-user quota, and may refresh or
  re-sync dashboard JWT credentials through `authUpdate`.
- AIHubMix disables check-in, loads account quota from its own account endpoint,
  and returns zeroed daily stats until stable daily-stat endpoints exist.

## Problem

Account refresh is now the highest-value remaining legacy facade call for new
account site types.

Current friction:

1. A new non-compatible account site must still be wired into
   `src/services/apiService/index.ts` before account refresh can work.
2. `accountStorage.refreshAccount(...)` calls the legacy facade directly for
   both check-in support probing and data refresh, so product code still knows
   that refresh consists of those facade calls.
3. The old facade makes `refreshAccountData(...)` look uniform even though the
   real backend contract varies by site: some sites support check-in probing,
   some always disable it, and some refresh credentials as part of health
   recovery.
4. Tests for account refresh must mock the wide `apiService` facade instead of
   exercising a narrow Interface.

Deletion test: if the direct `getApiService(...).fetchSupportCheckIn(...)` and
`getApiService(...).refreshAccountData(...)` calls were deleted from
`accountStorage`, the complexity should not move to new `siteType` branches in
the same file. It should move behind an `accountRefresh` capability that each
Adapter can implement or omit.

## Goals

- Add a narrow `accountRefresh` Adapter capability.
- Route `accountStorage.refreshAccount(...)` through
  `getSiteAdapter(account.site_type).accountRefresh`.
- Preserve the public `accountStorage.refreshAccount(...)` behavior and return
  shape.
- Preserve current `RefreshAccountResult` and `AccountData` semantics:
  - quota
  - today prompt/completion tokens
  - today quota consumption
  - today request count
  - today income
  - check-in state
  - health status
  - optional `authUpdate`
- Keep product-owned persistence and local merge rules in `accountStorage`.
- Provide Adapter implementations for:
  - New API-family compatible account sites
  - Sub2API
  - AIHubMix
- Preserve Sub2API credential refresh and JWT re-sync behavior.
- Preserve AIHubMix zeroed daily-stat semantics and disabled check-in behavior.
- Add focused Adapter tests plus account-refresh regression tests.

## Non-Goals

- Do not rewrite account storage, account migration, account ordering, pinning,
  deletion, or disabled-account behavior.
- Do not move manual balance override or balance-history snapshot capture behind
  the Adapter.
- Do not change check-in scheduler behavior, custom check-in URLs, or site
  announcement refresh.
- Do not migrate Model List pricing, runtime model catalog, redemption,
  managed-site channel operations, managed-site model sync, or export dialogs in
  this slice.
- Do not add a new site type in this slice.
- Do not remove `getApiService(...)` globally.
- Do not change user-facing copy, locale keys, telemetry events, settings
  search entries, or Playwright E2E tests.

## Design

### 1. Add `AccountRefreshCapability`

Create:

```text
src/services/apiAdapters/contracts/accountRefresh.ts
```

The contract should reuse existing account refresh types rather than inventing
another snapshot model.

Proposed types:

```ts
import type {
  ApiServiceAccountRequest,
  ApiServiceRequest,
  RefreshAccountResult,
} from "~/services/apiService/common/type"

export type AccountRefreshSupportRequest = {
  baseUrl: string
  auth: ApiServiceRequest["auth"]
}

export type AccountRefreshRequest = ApiServiceAccountRequest

export type AccountRefreshCapability = {
  fetchCheckInSupport?(
    request: AccountRefreshSupportRequest,
  ): Promise<boolean>
  refreshAccount(request: AccountRefreshRequest): Promise<RefreshAccountResult>
}
```

Capability presence is the support signal. `fetchCheckInSupport` is optional
because some backends either do not support check-in or already return the
final disabled state as part of `refreshAccount(...)`.

The Interface is intentionally close to the existing `apiService` request and
result shapes. This keeps the first migration small while moving the external
Seam from the flat facade to `SiteAdapter`.

### 2. Extend `SiteAdapter`

Add:

```ts
accountRefresh?: AccountRefreshCapability
```

to `src/services/apiAdapters/contracts/siteAdapter.ts`.

Missing `accountRefresh` for a saved account site is an unsupported account
runtime path. The account refresh workflow should fail with a normalized
unhealthy result rather than throwing through the background refresh loop.

### 3. Add New API-Family Account Refresh Adapter

Create:

```text
src/services/apiAdapters/newApi/accountRefresh.ts
```

The New API-family Adapter should delegate to the current site-scoped legacy
implementation:

```ts
import { getApiService } from "~/services/apiService"

import type { AccountRefreshCapability } from "../contracts/accountRefresh"

export const createNewApiAccountRefresh = (
  siteType: AccountSiteType,
): AccountRefreshCapability => ({
  fetchCheckInSupport(request) {
    return getApiService(siteType).fetchSupportCheckIn(request)
  },
  refreshAccount(request) {
    return getApiService(siteType).refreshAccountData(request)
  },
})
```

`createNewApiAdapter(siteType)` should attach:

```ts
accountRefresh: createNewApiAccountRefresh(siteType)
```

This preserves existing One API/New API-compatible override behavior for
OneHub, DoneHub, Veloera, AnyRouter, WONG, V-API, VoAPI, Super-API, Rix-API,
Neo-API, and unknown-compatible sites because the Adapter is created with the
current `siteType`.

### 4. Add Sub2API Account Refresh Adapter

Create:

```text
src/services/apiAdapters/sub2api/accountRefresh.ts
```

The Sub2API Adapter should delegate refresh to the current Sub2API
implementation:

```ts
import { fetchSupportCheckIn, refreshAccountData } from "~/services/apiService/sub2api"

import type { AccountRefreshCapability } from "../contracts/accountRefresh"

export const sub2ApiAccountRefresh: AccountRefreshCapability = {
  fetchCheckInSupport,
  refreshAccount: refreshAccountData,
}
```

Although Sub2API currently disables check-in, keeping
`fetchCheckInSupport(...)` delegated preserves the existing call behavior while
the product workflow is migrated. The important contract is that
`refreshAccount(...)` continues to return disabled check-in state and preserves
Sub2API `authUpdate` behavior for proactive refresh, refresh-token recovery,
and browser-context JWT re-sync.

### 5. Add AIHubMix Account Refresh Adapter

Create:

```text
src/services/apiAdapters/aihubmix/accountRefresh.ts
```

The AIHubMix Adapter should delegate to the current AIHubMix implementation:

```ts
import { fetchSupportCheckIn, refreshAccountData } from "~/services/apiService/aihubmix"

import type { AccountRefreshCapability } from "../contracts/accountRefresh"

export const aihubmixAccountRefresh: AccountRefreshCapability = {
  fetchCheckInSupport,
  refreshAccount: refreshAccountData,
}
```

The Adapter must preserve the existing AIHubMix contract:

- API origin normalization stays in the AIHubMix implementation.
- Token-authenticated requests continue sending raw `Authorization:
  <access_token>` without a `Bearer` prefix.
- Check-in remains disabled.
- Daily usage and income remain zeroed until a stable backend contract exists.

### 6. Route `accountStorage.refreshAccount(...)` Through The Adapter

Modify `src/services/accounts/accountStorage.ts` so it resolves the Adapter once
after the effective account and request auth are known:

```ts
const accountRefresh = getSiteAdapter(account.site_type).accountRefresh
```

If the capability is missing, return a failed refresh result with a health
status that marks the account unhealthy and records an unsupported-capability
reason suitable for existing account health UI.

Then replace:

```ts
getApiService(account.site_type).fetchSupportCheckIn(...)
getApiService(account.site_type).refreshAccountData(...)
```

with:

```ts
accountRefresh.fetchCheckInSupport?.(...)
accountRefresh.refreshAccount(...)
```

`accountStorage` should keep ownership of:

- skip logic
- normalized base URL selection
- preference lookup
- manual balance override
- local custom check-in date reset
- persistence of `authUpdate`
- Sub2API `sub2apiAuth` storage shape
- balance-history capture
- final account update write

This keeps backend protocol facts behind the Adapter while preserving product
semantics in the account storage Module.

### 7. Preserve Check-In Merge Semantics

When `fetchCheckInSupport` is absent, `accountStorage.refreshAccount(...)`
should keep the existing `account.checkIn` configuration and rely on
`refreshAccount(...)` to return the backend's refreshed check-in state.

When `fetchCheckInSupport` returns a boolean, `accountStorage` should keep the
current behavior of updating `checkIn.enableDetection` before calling
`refreshAccount(...)`.

When `fetchCheckInSupport` rejects, `accountStorage` should keep the existing
warn-and-continue behavior.

### 8. Do Not Migrate Validation Or Account Add/Edit Data Fetch Yet

`src/services/accounts/accountOperations.ts` still has direct account data
validation calls. Those should stay out of this slice unless implementation
reveals that the same helper must be shared to avoid duplicating request
construction.

The migration target for this design is the saved-account refresh path, not the
account add/edit validation path.

## Testing

Add focused tests for the new Adapter capability:

- `tests/services/apiAdapters/newApi/accountRefresh.test.ts`
  - verifies the Adapter calls the site-scoped `fetchSupportCheckIn`
  - verifies the Adapter calls the site-scoped `refreshAccountData`
  - verifies the factory preserves the supplied `siteType`
- `tests/services/apiAdapters/sub2api/accountRefresh.test.ts`
  - verifies delegation to Sub2API refresh
  - verifies the result preserves `authUpdate` fields
- `tests/services/apiAdapters/aihubmix/accountRefresh.test.ts`
  - verifies delegation to AIHubMix refresh
  - verifies check-in disabled and zeroed daily stats are not reshaped by the
    Adapter

Update account refresh regression tests:

- `tests/services/accountStorage.test.ts`
  - refresh uses `getSiteAdapter(...).accountRefresh`
  - missing capability produces a failed refresh result instead of throwing out
    of the refresh workflow
  - check-in support rejection still warns and continues
  - manual balance override still wins over refreshed quota
  - Sub2API `authUpdate.sub2apiAuth` still persists

Run:

```bash
pnpm vitest --run tests/services/apiAdapters/newApi/accountRefresh.test.ts tests/services/apiAdapters/sub2api/accountRefresh.test.ts tests/services/apiAdapters/aihubmix/accountRefresh.test.ts tests/services/accountStorage.test.ts
pnpm compile
pnpm run validate:staged
```

If the final diff touches shared exported types or adapter registry wiring,
also run:

```bash
pnpm run validate:push
```

## Rollout Notes

This slice is intentionally larger than the previous single-capability adapter
slices because refresh is one account user journey: support probing, data
refresh, health mapping, and optional credential update are used together by
the saved-account runtime path.

The slice is still bounded:

- It does not touch Model List pricing.
- It does not touch redemption.
- It does not touch managed-site operations.
- It does not remove the legacy `apiService` facade.

After this lands, the next high-leverage slices are:

1. `modelPricing` capability for Model List direct pricing calls.
2. An import guard or lint rule that prevents new product code from importing
   the legacy `apiService` facade outside approved migration adapters.

## Open Questions

No product behavior question blocks this design. The only implementation choice
to settle during planning is the exact missing-capability health code:

- Prefer reusing an existing unsupported-capability health code if one already
  exists in `TempWindowHealthStatusCode`.
- If no existing code fits, use a generic unhealthy status with a local message
  in the account storage Module rather than adding user-facing copy in this
  slice.
