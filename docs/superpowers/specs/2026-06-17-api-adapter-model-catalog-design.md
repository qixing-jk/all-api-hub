# API Adapter Model Catalog Design

Date: 2026-06-17

## Purpose

Move the Sub2API runtime model-list call behind the new `apiAdapters` Seam
without changing Model List pricing, all-key comparison, or UI behavior.

The previous site-announcements slice established `getSiteAdapter(siteType)` as
the first real Adapter registry. This slice should use that same Seam for the
next concrete backend capability: runtime model catalog discovery.

## Current Context

The repository now has a narrow Adapter Module:

```text
src/services/apiAdapters/
  contracts/
  newApi/
  sub2api/
  registry.ts
```

It currently exposes `siteNotice` for New API-family sites and
`siteAnnouncements` for Sub2API.

Sub2API model-list support already exists, but the backend dependency is still
owned by `src/services/apiCredentialProfiles/modelCatalog.ts`:

- `loadAccountTokenFallbackPricingResponse(...)` detects Sub2API accounts.
- It resolves a saved runtime key.
- It directly imports and calls `fetchSub2ApiRuntimeModels(...)` from
  `src/services/apiService/sub2api`.
- It then builds a Model List `PricingResponse` with
  `MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY`.
- If dashboard JWT data is available, the same Module separately loads group
  metadata, account tokens, and a model price table to estimate prices.

The product behavior is already correct enough for this slice: runtime model
visibility comes from `/v1/models` with API-key auth, while estimated pricing is
optional and explicitly marked as estimated or unavailable.

## Problem

`apiCredentialProfiles/modelCatalog.ts` is a product-level Model List source
Module, but it currently knows a Sub2API backend helper directly. That weakens
the Adapter Seam established by the site-announcements slice:

1. Backend protocol calls remain scattered outside `apiAdapters`.
2. Sub2API runtime catalog support is not visible on `getSiteAdapter(...)`.
3. Later Model List slices cannot ask a site Adapter whether key-scoped runtime
   model discovery is supported.
4. The direct import makes `modelCatalog.ts` carry both product-level fallback
   orchestration and backend-specific capability routing.

Deletion test: if the direct Sub2API import were deleted from
`modelCatalog.ts`, the complexity should not reappear as another direct
provider import. It should live behind a `modelCatalog` capability on the
Sub2API Adapter.

## Goals

- Add a narrow `modelCatalog` Adapter capability.
- In the first implementation, expose only Sub2API runtime API-key model
  discovery through that capability.
- Keep Sub2API `/v1/models` behavior in
  `src/services/apiService/sub2api/index.ts`; the Adapter should delegate to
  the existing implementation.
- Update `src/services/apiCredentialProfiles/modelCatalog.ts` to call
  `getSiteAdapter(SITE_TYPES.SUB2API).modelCatalog`.
- Preserve all existing `PricingResponse` output shapes and Model List UI
  behavior.
- Keep estimated pricing inputs and logic out of this slice.
- Add focused tests for the new capability and the product Module routing.

## Non-Goals

- Do not migrate estimated pricing, group-rate resolution, account-token
  lookup, model price table loading, or channel pricing in this slice.
- Do not change `capabilities.modelPricing` on `getApiService(...)`.
- Do not reclassify Sub2API as supporting full account-level model pricing.
- Do not move AIHubMix model pricing into `apiAdapters`.
- Do not change all-key comparison, source identity, cache identity, filtering,
  sorting, or source labels.
- Do not change Sub2API `/v1/models` endpoint behavior, auth type, validation,
  sanitization, or error messages.
- Do not add locale keys, telemetry, settings search entries, or Playwright
  E2E coverage.

## Design

### 1. Add `ModelCatalogCapability`

Create:

```text
src/services/apiAdapters/contracts/modelCatalog.ts
```

Contract:

```ts
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export type ModelCatalogRequest = ApiServiceRequest & {
  auth: ApiServiceRequest["auth"] & {
    apiKey: string
  }
}

export type ModelCatalogCapability = {
  fetchModels(request: ModelCatalogRequest): Promise<string[]>
}
```

The request requires `apiKey` because this first capability is runtime
API-key-scoped. It should not imply dashboard JWT support or account-level
pricing support.

### 2. Extend `SiteAdapter`

Add:

```ts
modelCatalog?: ModelCatalogCapability
```

Capability presence remains the support signal. A missing `modelCatalog`
means the site Adapter does not expose runtime model catalog discovery in this
slice.

### 3. Add Sub2API Adapter Implementation

Create:

```text
src/services/apiAdapters/sub2api/modelCatalog.ts
```

Implementation:

```ts
import { fetchSub2ApiRuntimeModels } from "~/services/apiService/sub2api"

import type { ModelCatalogCapability } from "../contracts/modelCatalog"

export const sub2ApiModelCatalog: ModelCatalogCapability = {
  fetchModels: fetchSub2ApiRuntimeModels,
}
```

Then expose it from `src/services/apiAdapters/sub2api/index.ts`:

```ts
modelCatalog: sub2ApiModelCatalog
```

Do not add a New API-family `modelCatalog` implementation yet. OpenAI-compatible
profile fallback model discovery currently goes through
`src/services/aiApi/openaiCompatible`, not account-site backend Adapters. That
can be revisited only if a future caller needs it.

### 4. Update Product-Level Model Catalog Routing

In `src/services/apiCredentialProfiles/modelCatalog.ts`, replace the direct
Sub2API import and call:

```ts
fetchSub2ApiRuntimeModels(...)
```

with:

```ts
const adapter = getSiteAdapter(SITE_TYPES.SUB2API)
if (!adapter.modelCatalog) {
  throw new Error("modelCatalog is not implemented for sub2api")
}

const runtimeModelIds = await adapter.modelCatalog.fetchModels(...)
```

Keep the request payload unchanged:

```ts
{
  baseUrl: params.account.baseUrl,
  accountId: params.account.id,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    apiKey: resolvedToken.key,
  },
}
```

The product Module still owns:

- resolving saved token secrets
- building `PricingResponse`
- marking prices unavailable
- invoking estimated-pricing fallback
- sanitizing errors before returning

### 5. Keep Estimated Pricing Direct For Now

The current estimated pricing path still directly imports:

- `fetchAccountTokens`
- `fetchSub2ApiAvailableGroups`
- `fetchSub2ApiGroupRates`

Leave those unchanged. They are dashboard-JWT pricing-estimation inputs, not the
runtime model catalog capability being migrated here.

This is intentional scope control. A later slice can introduce a separate
capability for Sub2API price-estimation inputs if that improves Locality.

## Error Handling

Adapter capabilities should delegate backend errors unchanged. The product
Module should keep the existing sanitization behavior in
`loadAccountTokenFallbackPricingResponse(...)`:

- include `params.account.baseUrl`, `params.token.key`, and the resolved token
  key in the redaction list
- throw `ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED` when the sanitized message is empty
- preserve the original error as `cause`

If `modelCatalog` is missing for Sub2API, treat that as an implementation error
inside the existing catch path. The final surfaced message should be sanitized
by the existing wrapper.

## Telemetry Decision

Telemetry decision: none.

This is an internal architecture migration. It does not add a new user action,
setting, background flow, or observable product state. Existing Model List load
behavior and any existing analytics remain unchanged.

## Testing Strategy

Add focused Adapter tests:

- Sub2API `modelCatalog.fetchModels` delegates to
  `fetchSub2ApiRuntimeModels`.
- The request object is passed through unchanged, including `auth.apiKey`.
- The registry returns a Sub2API Adapter with `modelCatalog`.
- The registry does not expose `modelCatalog` for New API-family or AIHubMix
  sites in this slice.

Update focused product tests:

- `loadAccountTokenFallbackPricingResponse(...)` uses
  `getSiteAdapter(SITE_TYPES.SUB2API).modelCatalog.fetchModels` for Sub2API
  runtime models.
- The existing runtime model-list-only response shape remains unchanged.
- A missing Sub2API `modelCatalog` capability is sanitized through the existing
  fallback error path.
- Existing estimated-pricing tests keep passing without moving group/rate calls.

No Playwright E2E is required. The risk is routing and service delegation, which
is covered by Vitest.

## Validation Plan

Focused validation:

```powershell
pnpm vitest run tests/services/apiAdapters/sub2api/modelCatalog.test.ts tests/services/apiAdapters/registry.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts
```

Related validation:

```powershell
pnpm vitest related --run src/services/apiAdapters/sub2api/modelCatalog.ts src/services/apiAdapters/registry.ts src/services/apiCredentialProfiles/modelCatalog.ts
```

Commit gate:

```powershell
pnpm compile
pnpm run validate:staged
```

Pre-push / PR gate:

```powershell
pnpm run validate:push
```

This slice adds a shared Adapter contract and registry-visible capability, so
`compile` and the repo's push-equivalent validation are required before pushing
or opening a PR.

## Rollout

1. Add the `modelCatalog` contract and Sub2API Adapter delegation test.
2. Extend the Sub2API Adapter and registry tests.
3. Update `apiCredentialProfiles/modelCatalog.ts` to consume
   `getSiteAdapter(...).modelCatalog`.
4. Keep estimated pricing imports and behavior unchanged.
5. Run focused tests, related tests, `pnpm compile`, and `validate:staged`.
6. Commit the narrow architecture slice.
7. Run `validate:push` before pushing or opening a PR.

## Follow-Up, Not In Scope For This Spec

Later slices may migrate:

- Sub2API price-estimation inputs: available groups, group rates, and account
  token lookup.
- AIHubMix model pricing into a truthful Adapter capability.
- New API-family account-level pricing, only if callers benefit from the new
  Seam.
- Redemption, as a separate capability after Model List routing is cleaner.

Each later slice should prove the Seam with a concrete caller benefit. Do not
grow `apiAdapters` into a second flat `apiService` Interface.
