# API Service Capabilities Design

Date: 2026-06-10

## Purpose

Make unsupported account-site operations explicit at the `apiService` seam so
callers can avoid known-missing adapter behavior before invoking a function.

This design follows the Sub2API adapter seam separation work. That earlier
phase made incompatible adapters fail fast when they do not implement a helper.
This phase adds a small capability declaration layer for cases where a caller
can make a better local decision than surfacing a strict missing-method error.

## Current Context

`src/services/apiService/index.ts` resolves account-site helpers through a site
override map. Compatible One-API/New-API-family sites may safely inherit common
helpers. Strict override sites such as Sub2API and AIHubMix should not silently
fall back to incompatible common helpers.

The strict missing-method throw is useful as a final development guard, but it
is too late for user-facing flows where the application already knows a feature
is unsupported for a site type:

- Model List account pricing calls `fetchModelPricing`.
- Redemption calls `redeemCode`.

For Sub2API, both model pricing and redemption are unsupported in the current
adapter slice. For AIHubMix, redemption is unsupported while model pricing has
dedicated account semantics.

Without explicit capabilities, callers either need to call a missing helper and
handle the thrown implementation error, or duplicate site-type checks in
feature code. Both options make compatibility rules harder to discover and
harder to evolve.

## Problem

The repository currently has two related but different concepts:

- function availability: whether an adapter exports a helper implementation
- product capability: whether a user-facing operation should be attempted for a
  site type

Strict override sites protect function availability by throwing when a helper is
missing. They do not give callers a declarative product-capability answer
before the call starts.

This causes three risks:

1. User-facing flows can surface internal implementation errors instead of a
   local unsupported state.
2. Feature code can grow scattered site-type conditionals for the same
   compatibility rule.
3. Cached or preloaded data can hide unsupported status unless the capability
   decision happens before fetch and cache-return paths.

## Goals

- Add a small capability object to `getApiService(site)` results.
- Keep capability declarations beside the site adapter registration so adapter
  support rules are discoverable at the seam.
- Preserve strict missing-method throws as the final guard for accidental calls.
- Let Model List skip unsupported model-pricing loads before cache lookup and
  before `fetchModelPricing`.
- Let Redemption skip unsupported `redeemCode` calls and return the existing
  localized failure copy.
- Keep the first capability slice narrow and directly tied to known risky
  callers.

## Non-Goals

- Do not redesign the full adapter type hierarchy.
- Do not make TypeScript conditionally remove methods based on capability
  values.
- Do not remove Sub2API announcement placeholders or refactor announcement
  providers in this slice.
- Do not change AIHubMix one-time-key behavior.
- Do not change Sub2API refresh-token, browser-session recovery, or
  announcement sync behavior.
- Do not add new user-facing copy unless the existing failure copy cannot cover
  the narrow unsupported path.

## Capability Contract

The first slice should expose this shape:

```ts
export type ApiServiceCapabilities = {
  keyManagement: boolean
  modelPricing: boolean
  redeemCode: boolean
  siteAnnouncements: boolean
}
```

Default capabilities are all `true`. This preserves behavior for common
compatible sites and existing partial override sites unless a site explicitly
declares otherwise.

Initial overrides:

- Sub2API:
  - `modelPricing: false`
  - `redeemCode: false`
- AIHubMix:
  - `redeemCode: false`

`siteAnnouncements` is included because announcement support is another known
adapter compatibility axis, but this slice should only declare the field. It
should not move or remove announcement functions.

## API Service Seam Design

`src/services/apiService/index.ts` remains the owner of the adapter seam.

The capability declaration should live near `strictOverrideSites` and
`siteOverrideMap` because those structures already define site compatibility
policy.

`getApiService(site)` should return:

- default wrapper object with `capabilities` for unknown, undefined, or
  common-compatible routing
- site-scoped wrapper object with `capabilities` for recognized override sites

The wrapper should still build callable functions through the existing
`createWrappedFunction` and `createSiteScopedFunction` paths. Capability
metadata must not bypass, weaken, or remove the strict missing-method throw.

The strict throw remains the final guard:

- callers should use capabilities when they can intentionally skip unsupported
  product behavior
- accidental direct calls to missing strict-site helpers should still fail fast

## Model List Behavior

Account-backed model pricing should check
`getApiService(account.siteType).capabilities.modelPricing` before attempting a
pricing load.

The check must run before:

- `modelPricingCache.get(...)`
- `fetchModelPricing(...)`

This ordering is important because unsupported sites should not show stale
cached pricing as a successful load. The unsupported state should flow through
the existing query error handling rather than becoming a special UI branch in
this slice.

The request payload for supported sites must remain unchanged:

- `baseUrl`
- `accountId`
- `auth.authType`
- `auth.userId`
- `auth.accessToken`
- `auth.cookie`

The same rule applies to both single-account and all-accounts model-data query
paths.

## Redemption Behavior

Redemption should check
`getApiService(account.site_type).capabilities.redeemCode` before invoking the
adapter's `redeemCode` helper.

For unsupported sites, return:

```ts
{
  success: false,
  message: t("redemptionAssist:messages.redeemFailed"),
}
```

This keeps the slice narrow and avoids new locale churn. Supported redemption
requests must preserve the existing request payload and response handling,
including display-account lookup and credited amount formatting.

## Testing Strategy

Focused tests should cover:

- default capabilities for common-compatible service results
- Sub2API capability overrides
- AIHubMix capability overrides
- strict missing-method throw behavior still active for Sub2API and AIHubMix
- Sub2API model pricing does not call `fetchModelPricing` when unsupported
- unsupported Sub2API model pricing does not return stale cached pricing
- Sub2API and AIHubMix redemption do not call `redeemCode` when unsupported

E2E is not required for this slice. The main risk is service seam behavior and
hook/service branching, which is covered by focused Vitest and Testing Library
tests.

## Validation Plan

Focused validation:

```powershell
pnpm vitest run tests/services/apiService/index.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/services/redeemService.test.ts
```

Related validation:

```powershell
pnpm vitest related --run src/services/apiService/index.ts src/features/ModelList/hooks/useModelData.ts src/services/redemption/redeemService.ts
```

Commit gate:

```powershell
pnpm run validate:staged
```

Diff inspection should confirm:

- `capabilities` exists on default and site-scoped services.
- Sub2API and AIHubMix strict missing-method behavior remains intact.
- Model List capability checks run before cache lookup and fetch.
- Redemption capability checks run before adapter invocation.
- No announcement-provider cleanup leaked into this slice.

## Follow-Up, Not In Scope For This Spec

Later phases may expand the capability object or replace it with a more typed
adapter contract if the codebase needs stronger compile-time enforcement.

Likely future capability axes include:

- announcement provider support
- browser-session identity resolution
- auth restoration or session recovery
- managed-site channel operations

Those follow-ups should be driven by concrete callers and compatibility gaps.
This slice only adds the runtime declaration needed to protect the current
Model List pricing and Redemption flows.
