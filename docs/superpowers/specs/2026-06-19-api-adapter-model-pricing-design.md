# API Adapter Model Pricing Design

Date: 2026-06-19

## Purpose

Move account model-pricing loading behind the `apiAdapters` Seam so a newly
added account site type can expose Model List support from its Adapter Module
instead of requiring product Modules to call the legacy `getApiService(...)`
facade directly.

Recent adapter slices moved account completion, key management, account
refresh, site announcements, Sub2API runtime model catalog loading, and
Sub2API stored-auth recovery behind narrower Interfaces. Those slices make a
new account site type detectable, refreshable, and usable enough to create or
resolve API keys. The next high-leverage account usability path is Model List:
users expect a saved account to load model pricing or clearly fall back to a
model-only catalog when pricing is not available.

## Current Context

The current `SiteAdapter` Interface exposes:

```ts
type SiteAdapter = {
  siteType: AccountSiteType
  family?: SiteBackendFamily
  siteNotice?: SiteNoticeCapability
  siteAnnouncements?: SiteAnnouncementsCapability
  modelCatalog?: ModelCatalogCapability
  accountCompletion?: AccountCompletionCapability
  keyManagement?: KeyManagementCapability
  accountRefresh?: AccountRefreshCapability
}
```

The remaining account Model List pricing paths still use
`getApiService(siteType)` directly:

- `src/features/ModelList/hooks/useModelData.ts`
  - single-account direct pricing load
  - all-accounts direct pricing load
  - capability check through `service.capabilities.modelPricing`
- `src/services/apiCredentialProfiles/modelCatalog.ts`
  - AIHubMix selected-token fallback currently calls
    `getApiService(account.siteType).fetchModelPricing(...)`

The existing Sub2API path is deliberately not the same as normal account
pricing:

- Direct Sub2API account pricing is disabled through
  `getApiService(SITE_TYPES.SUB2API).capabilities.modelPricing === false`.
- Selected-key fallback resolves an API key, calls
  `getSiteAdapter(SITE_TYPES.SUB2API).modelCatalog.fetchModels(...)`, and
  returns a runtime-key model catalog.
- When dashboard auth and group/rate data are available, the fallback applies
  best-effort Sub2API price estimates.
- When pricing data cannot be estimated, the fallback still returns model rows
  with unavailable-pricing metadata.

That split is product-significant: Sub2API can provide model visibility for a
selected runtime key even though it does not expose the normal compatible
`/api/pricing` account-pricing contract.

## Problem

Model pricing is now the highest-value remaining legacy facade path for new
account site types.

Current friction:

1. Product code still asks the legacy `apiService` facade whether model pricing
   is supported, then calls `fetchModelPricing(...)` directly.
2. A new non-compatible site type must still be wired into
   `src/services/apiService/index.ts` capability overrides before Model List
   can make a truthful support decision.
3. Model List tests mock the wide `apiService` facade instead of the narrower
   account-pricing Interface that the UI actually needs.
4. AIHubMix selected-token fallback is a direct special case in the profile
   catalog helper, even though AIHubMix can expose normal account model
   pricing as an Adapter capability.
5. Sub2API's runtime-key model catalog path is already adapter-backed, but the
   caller still reasons about normal pricing support through the legacy facade.

Deletion test: if direct `getApiService(...).fetchModelPricing(...)` and
`service.capabilities.modelPricing` calls were deleted from Model List product
Modules, the complexity should not move to new `siteType` branches in the same
Modules. Normal account-pricing support should live behind a
`modelPricing` capability. Sub2API's runtime-key fallback should remain a
separate product path because it is not the same Interface.

## Goals

- Add a narrow `modelPricing` Adapter capability.
- Route Model List single-account and all-accounts normal pricing loads through
  `getSiteAdapter(siteType).modelPricing`.
- Route AIHubMix selected-token fallback pricing through the Adapter instead of
  direct `getApiService(...)`.
- Preserve current caching, query keys, invalid response handling, toasts, and
  analytics diagnostics.
- Preserve Sub2API behavior:
  - normal account pricing remains unsupported
  - selected-token runtime model catalog remains available
  - all-key comparison keeps partial-success semantics
  - best-effort group/rate price estimation remains in the profile/model-list
    fallback path
- Provide Adapter implementations for:
  - New API-family compatible account sites
  - AIHubMix
- Keep the legacy `getApiService(...)` facade available for non-migrated
  capabilities.
- Add focused Adapter tests and Model List regression tests.

## Non-Goals

- Do not add a new site type in this slice.
- Do not enable direct Sub2API `modelPricing`.
- Do not move Sub2API runtime model catalog, group-rate lookup, or price-table
  estimation into `modelPricing`.
- Do not migrate full Key Management CRUD, user groups, account validation,
  account data fetch, redemption, managed-site channel operations, or managed
  site model sync.
- Do not remove `ApiServiceCapabilities.modelPricing` globally in this slice.
- Do not change user-facing copy, locale keys, telemetry schema, settings
  search entries, or Playwright E2E tests.
- Do not change Model List cache key semantics or persisted cache storage.

## Approaches Considered

### Approach A: Keep Capability Booleans On `apiService`

This is the current state. It is functional, but it keeps product Modules
coupled to the wide legacy facade. New site type support still requires
checking both Adapter wiring and legacy capability overrides.

This should not be the next step.

### Approach B: Add A Generic `modelData` Product Module Only

Model List could wrap pricing loads in a product helper without adding an
Adapter capability.

This would reduce duplication inside the hook, but it would not give new site
types a truthful Adapter-owned support signal. The backend-specific support
decision would still live outside the Adapter registry.

### Approach C: Adapter Capability For Normal Pricing, Keep Fallbacks Product-Owned

Add `SiteAdapter.modelPricing` for the normal account-pricing contract, migrate
the direct callers, and keep Sub2API runtime-key fallback as product-owned
fallback logic that uses `modelCatalog` and existing Sub2API pricing helpers.

This is the recommended path. It is narrow enough to preserve existing Model
List behavior while moving the real backend variation point behind the Adapter
Seam.

## Design

### 1. Add `ModelPricingCapability`

Create:

```text
src/services/apiAdapters/contracts/modelPricing.ts
```

Proposed Interface:

```ts
import type {
  ApiServiceRequest,
  PricingResponse,
} from "~/services/apiService/common/type"

export type ModelPricingRequest = ApiServiceRequest

export type ModelPricingCapability = {
  fetchPricing(request: ModelPricingRequest): Promise<PricingResponse>
}
```

Capability presence is the support signal. A missing `modelPricing` capability
means the account site does not support the normal account-pricing contract.

The Interface intentionally reuses `ApiServiceRequest` and `PricingResponse`.
This slice changes the Seam, not the pricing response model.

### 2. Extend `SiteAdapter`

Add:

```ts
modelPricing?: ModelPricingCapability
```

to `src/services/apiAdapters/contracts/siteAdapter.ts`.

Expected support after this slice:

- New API-family Adapters expose `modelPricing`.
- AIHubMix exposes `modelPricing`.
- Sub2API does not expose `modelPricing`.
- Unsupported Adapters omit `modelPricing`.

This keeps Sub2API honest: it has `modelCatalog` for runtime-key model
visibility, not normal account pricing.

### 3. Add New API-Family Model Pricing Adapter

Create:

```text
src/services/apiAdapters/newApi/modelPricing.ts
```

The Adapter should delegate through the site-scoped legacy facade:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { getApiService } from "~/services/apiService"

export const createNewApiModelPricing = (
  siteType: AccountSiteType,
): ModelPricingCapability => ({
  fetchPricing(request) {
    return getApiService(siteType).fetchModelPricing(request)
  },
})
```

`createNewApiAdapter(siteType)` should attach:

```ts
modelPricing: createNewApiModelPricing(siteType)
```

Delegating through `getApiService(siteType)` preserves OneHub, DoneHub,
Veloera, AnyRouter, WONG, V-API, VoAPI, Super-API, Rix-API, Neo-API, and
unknown-compatible behavior while the lower-level backend Modules remain in
place.

### 4. Add AIHubMix Model Pricing Adapter

Create:

```text
src/services/apiAdapters/aihubmix/modelPricing.ts
```

The Adapter should delegate to the existing AIHubMix implementation:

```ts
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { fetchModelPricing } from "~/services/apiService/aihubmix"

export const aihubmixModelPricing: ModelPricingCapability = {
  fetchPricing: (request) => fetchModelPricing(request),
}
```

The Adapter must preserve AIHubMix behavior:

- API origin normalization stays in the AIHubMix implementation.
- Token-authenticated requests continue sending raw
  `Authorization: <access_token>` without a `Bearer` prefix.
- User-scoped available-model fallback behavior remains in the AIHubMix
  service implementation.
- Pricing response source metadata remains unchanged.

### 5. Keep Sub2API Without Normal Model Pricing

Do not attach `modelPricing` to `sub2ApiAdapter`.

Sub2API support should continue through the existing paths:

- `sub2ApiAdapter.modelCatalog.fetchModels(...)` for runtime-key model ids.
- `loadSub2ApiEstimatedPricingResponse(...)` for dashboard-auth best-effort
  price estimates.
- `MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY` and unavailable-price metadata
  when exact pricing cannot be estimated.

This means Model List should switch from:

```ts
const service = getApiService(account.siteType)
if (!service.capabilities.modelPricing) {
  if (account.siteType === SITE_TYPES.SUB2API) {
    return fetchSub2ApiAllAccountsFallbackPricingContexts(account)
  }
  throw createUnsupportedModelPricingError()
}
```

to:

```ts
const modelPricing = getSiteAdapter(account.siteType).modelPricing
if (!modelPricing) {
  if (account.siteType === SITE_TYPES.SUB2API) {
    return fetchSub2ApiAllAccountsFallbackPricingContexts(account)
  }
  throw createUnsupportedModelPricingError()
}
```

Sub2API remains the only product-special fallback in this slice because it is
not a normal account-pricing backend.

### 6. Add A Small Product Helper For Normal Pricing Loads

To keep Model List from duplicating request construction, add a small helper in
the Model List hook file or a local service helper:

```ts
const createDisplayAccountModelPricingRequest = (
  account: DisplaySiteData,
): ModelPricingRequest => ({
  baseUrl: account.baseUrl,
  accountId: account.id,
  auth: {
    authType: account.authType,
    userId: account.userId,
    accessToken: account.token,
    cookie: account.cookieAuthSessionCookie,
  },
})
```

Then normal pricing loaders should:

1. Resolve `getSiteAdapter(account.siteType).modelPricing`.
2. Throw `createUnsupportedModelPricingError()` when the capability is missing.
3. Use the existing cache lookup.
4. Call `modelPricing.fetchPricing(createDisplayAccountModelPricingRequest(account))`.
5. Validate `Array.isArray(data.data)`.
6. Store the existing cache payload unchanged.

This helper is product-level request construction. It should not be part of the
Adapter Interface.

### 7. Route AIHubMix Selected-Token Fallback Through The Adapter

Modify `loadAccountTokenFallbackPricingResponse(...)` so the AIHubMix branch
uses:

```ts
const modelPricing = getSiteAdapter(params.account.siteType).modelPricing
```

Then call `modelPricing.fetchPricing(...)` with the same account request shape.

If the capability is missing, throw the existing sanitized fallback-load error
path rather than adding user-facing copy in this slice.

This removes the remaining direct pricing call from the profile catalog helper
without changing AIHubMix selected-token behavior.

### 8. Preserve Cache, Error, And Analytics Semantics

Model List should keep:

- `createModelPricingQueryKey(...)`
- `createAllAccountsModelPricingQueryKey(...)`
- `createModelPricingCacheKey(...)`
- `MODEL_PRICING_CACHE_TTL_MS`
- `modelPricingCache.get(...)`, `.set(...)`, and `.invalidate(...)`
- `createInvalidFormatError()`
- `MODEL_PRICING_UNSUPPORTED_ERROR`
- existing direct-load and aggregate analytics diagnostics
- existing Sub2API fallback telemetry fields:
  `fallbackAvailable`, `fallbackUsed`, `successCount`, and `failureCount`

Only the backend capability lookup and normal pricing invocation should move.

## Error Handling

Adapter methods should delegate backend errors unchanged.

Product Modules should keep their current error mapping:

- Invalid pricing payloads still throw `MODEL_LIST_DATA_ERROR_CODES.INVALID_FORMAT`.
- Unsupported normal account pricing still throws
  `MODEL_PRICING_UNSUPPORTED_ERROR`.
- Sub2API single-account direct-load unsupported errors still allow selected-key
  fallback controls when tokens are manageable.
- Sub2API all-accounts mode still reports partial failure when some key
  catalogs fail and at least one succeeds.
- AIHubMix fallback errors remain sanitized by
  `toSanitizedErrorSummary(...)`.

Do not add user-facing copy for missing `modelPricing` in this slice.

## Telemetry Decision

Telemetry decision: reuse existing.

This is an internal architecture migration. It does not add a new user action,
setting, source type, or analytics field. Existing Model List load-completion
events should continue to emit with the same result categories and diagnostics.

## Settings Search Decision

Settings search decision: none.

No settings UI, route, anchor, or search definition changes.

## E2E Decision

E2E decision: no new Playwright E2E in this slice.

The risk is service-layer routing and response-shape preservation. Focused
Vitest coverage at Adapter, helper, and Model List hook levels directly covers
that risk. Browser runtime behavior is unchanged.

## Testing Strategy

Add Adapter tests:

- `tests/services/apiAdapters/modelPricing.test.ts`
  - New API-family `modelPricing` delegates to `getApiService(siteType)`.
  - AIHubMix `modelPricing` delegates to AIHubMix `fetchModelPricing(...)`.
  - Delegated results are returned without reshaping.

Update registry tests:

- New API-family Adapters expose `modelPricing`.
- AIHubMix exposes `modelPricing`.
- Sub2API does not expose `modelPricing`.

Update profile catalog tests:

- AIHubMix selected-token fallback uses
  `getSiteAdapter(...).modelPricing.fetchPricing(...)`.
- The request shape matches the current direct `fetchModelPricing(...)` request.
- Missing AIHubMix `modelPricing` capability is mapped through the existing
  sanitized fallback error path.
- Sub2API selected-token runtime catalog behavior remains unchanged.

Update Model List hook tests:

- Single-account normal pricing uses `getSiteAdapter(...).modelPricing`.
- Single-account missing capability still produces unsupported behavior.
- Sub2API single-account direct pricing does not call normal `fetchPricing(...)`
  and keeps fallback controls.
- All-accounts normal pricing uses Adapter `modelPricing`.
- All-accounts Sub2API still uses `fetchSub2ApiAllAccountsFallbackPricingContexts(...)`.
- Cache hit, cache invalidation, invalid payload, partial failure, and analytics
  assertions remain intact.

Focused validation:

```powershell
pnpm vitest run tests/services/apiAdapters/modelPricing.test.ts tests/services/apiAdapters/registry.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
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

Run `validate:push` before opening or updating a PR because the slice changes
shared Adapter contracts and Model List account-loading wiring.

## Rollout

1. Add the `modelPricing` contract and Adapter delegation tests.
2. Extend `SiteAdapter`, New API-family, AIHubMix, and registry expectations.
3. Migrate AIHubMix fallback in `modelCatalog.ts` to the Adapter capability.
4. Migrate Model List single-account normal pricing loads to the Adapter
   capability.
5. Migrate Model List all-accounts normal pricing loads to the Adapter
   capability.
6. Re-run focused tests after each migration group.
7. Run `pnpm compile` and `pnpm run validate:staged`.
8. Inspect the diff for scope drift.
9. Run `pnpm run validate:push` before pushing or opening a PR.

## Follow-Up, Not In Scope For This Spec

Later slices may migrate:

- `fetchAccountAvailableModels(...)`
- `fetchUserGroups(...)` and group coverage helpers
- full Key Management page CRUD
- account validation and account data fetch for add/edit flows
- redemption
- managed-site channel and model-sync operations
- an import guard that prevents new product Modules from importing the legacy
  `apiService` facade outside approved adapter/compatibility layers

Do not turn `SiteAdapter` into a second flat `apiService` facade. Add each
capability only when it hides backend-specific behavior behind a smaller
Interface and gives real caller Leverage.
