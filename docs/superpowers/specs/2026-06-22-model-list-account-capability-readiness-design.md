# Model List Account Capability Readiness Design

Date: 2026-06-22

## Purpose

Make Model List readiness explicit for the next brand-new account site type.

Recent slices already moved backend model facts behind smaller seams:

- `SiteAdapter.modelPricing` owns the normal account-level pricing contract.
- `SiteAdapter.modelCatalog` owns Sub2API runtime-key model discovery.
- `accountSiteProfile.modelList` owns source-account product policy such as
  direct-pricing support, runtime-key fallback, status scope, and display
  capability source.

The current Model List path works for existing sites, but a future account site
type still has to understand several scattered decisions before it can answer a
simple product question: can this account source load models, and if so through
which route?

This spec adds a deeper Model List account-source Module that turns existing
adapter capabilities and product profile policy into one readiness decision.
It does not add a new site type.

## Current Context

Current relevant modules:

- `src/features/ModelList/hooks/useModelData.ts`
  - loads single-account direct pricing through
    `getSiteAdapter(account.siteType).modelPricing`;
  - loads all-accounts direct pricing through the same adapter capability;
  - falls back to token-scoped runtime catalogs when
    `shouldUseAccountSiteRuntimeKeyCatalogFallback(account)` is true;
  - owns fallback token loading, fallback catalog loading, status metadata,
    toasts, cache invalidation, and analytics diagnostics.
- `src/services/apiCredentialProfiles/modelCatalog.ts`
  - should own profile-backed model-id loading for saved API credential
    profiles;
  - currently also owns Model List account-token fallback behavior:
    account-token secret resolution, direct-pricing bypass for
    profile-sourced capability sites, runtime-key catalog loading through
    `adapter.modelCatalog.fetchModels(...)`, and Sub2API dashboard estimate
    assembly;
  - this is an ownership leak: those account-token paths serve
    `useModelData.ts`, not the API credential profile library.
- `src/services/apiCredentialProfiles/sub2apiPriceEstimation.ts`
  - currently builds Sub2API runtime-key Model List pricing estimates and
    source metadata;
  - this is part of the same ownership leak because it serves the Model List
    account-token fallback route, not saved API credential profiles.
- `src/services/apiCredentialProfiles/modelPriceTable.ts`
  - currently loads LiteLLM official model price reference data for Sub2API
    runtime-key estimates;
  - this is shared model-pricing infrastructure and should not live under API
    credential profile ownership.
- `src/services/accounts/accountSiteProfile/modelList.ts`
  - exposes `getAccountSiteModelListProfile(...)`;
  - exposes `supportsAccountSiteDirectModelPricing(...)`;
  - exposes `shouldUseAccountSiteRuntimeKeyCatalogFallback(...)`.
- `src/features/ModelList/aihubmixModelList.ts`
  - derives AIHubMix display capability downgrades from response source
    metadata plus the product profile's display-capability source.
- `src/features/ModelList/components/StatusIndicator.tsx`
  - renders account-key fallback controls;
  - switches token-scoped status copy through `statusScope`;
  - still uses Sub2API-named translation keys for key-scoped fallback states.

The important split is already correct:

- backend facts live in adapter capabilities;
- source-account product policy lives in account-site product profiles;
- Model List UI still owns rendering, filtering, sorting, and analytics.

## Problem

Model List does not have one account-source readiness Interface.

Current friction:

1. `useModelData.ts` repeats the same readiness reasoning in single-account
   and all-accounts paths: resolve adapter pricing, guard unsupported normal
   pricing, decide whether token-scoped fallback is allowed, then map errors
   into UI state.
2. The runtime-key fallback is profile-driven, but many helper names and UI
   translation keys still describe Sub2API specifically. A second account site
   type with the same source-account shape would inherit misleading copy and
   function names.
3. The misplaced ownership is a small cluster, not only one function:
   `apiCredentialProfiles/modelCatalog.ts` owns both profile-backed catalog
   loading and Model List account-token fallback orchestration, while
   `apiCredentialProfiles/sub2apiPriceEstimation.ts` and
   `apiCredentialProfiles/modelPriceTable.ts` support that fallback route.
   The latter behavior is not an API credential profile concern; it resolves
   display-account token secrets, calls account adapters, handles
   account-source fallback errors, and assembles Sub2API runtime responses for
   `useModelData.ts`.
4. The next site type cannot inspect one place to know whether Model List will
   use direct account pricing, token-scoped runtime catalog loading, profile
   display downgrades, or unsupported behavior.
5. Tests prove existing Sub2API and AIHubMix behavior, but they do not define a
   compact readiness contract that future account site types can satisfy.

Deletion test: if raw Model List account-route decisions were deleted from
`useModelData.ts`, the complexity should not reappear as a third concrete
site-type branch. It should reappear behind a Model List account-source Module
that combines adapter facts and product profile policy behind a small
Interface.

## Goals

- Add a Model List account-source readiness Module.
- Keep backend model fetching in `SiteAdapter.modelPricing` and
  `SiteAdapter.modelCatalog`.
- Keep source-account product policy in `accountSiteProfile.modelList`.
- Move account-token Model List fallback orchestration out of
  `src/services/apiCredentialProfiles/modelCatalog.ts` and into the Model List
  account-source service Module.
- Move Sub2API runtime-key estimate assembly out of
  `src/services/apiCredentialProfiles/sub2apiPriceEstimation.ts` and into the
  Model List account-source service Module.
- Move generic official model price-table loading out of
  `src/services/apiCredentialProfiles/modelPriceTable.ts` and into a neutral
  model-pricing service Module.
- Leave `src/services/apiCredentialProfiles/modelCatalog.ts` focused on saved
  API credential profile model catalogs. If pricing-response normalization is
  shared, put the generic helper in a neutral Model List service and have the
  profile module delegate to it.
- Route single-account and all-accounts Model List loading decisions through
  the readiness Module.
- Make token-scoped runtime catalog fallback generic at the Model List level
  while preserving Sub2API-specific dashboard estimate implementation.
- Replace Sub2API-specific fallback UI keys with generic token-scoped fallback
  keys, while preserving rendered meaning for current Sub2API users.
- Preserve existing behavior for New API-family compatible sites, AIHubMix, and
  Sub2API.
- Add focused tests that define the readiness Interface.

## Non-Goals

- Do not add a new account site type.
- Do not change model pricing, model catalog, filtering, sorting, or source
  identity output for current sites.
- Do not move pricing response assembly into `SiteAdapter`.
- Do not move Sub2API dashboard estimate loading into a generic adapter
  capability in this slice.
- Do not create a broad generic price-estimation adapter capability only to
  move the existing Sub2API estimate implementation.
- Do not enable direct Sub2API account pricing.
- Do not change managed-site model sync.
- Do not change API credential profile-backed model catalog behavior.
- Do not leave permanent account-token fallback exports in
  `apiCredentialProfiles/modelCatalog.ts`. A temporary compatibility re-export
  is acceptable only while updating imports in the same implementation slice.
- Do not add telemetry fields, settings search entries, or Playwright E2E
  tests by default.
- Do not consolidate account-site registration metadata in this slice.

## Approaches Considered

### Approach A: Keep The Current Hook-Level Decisions

This is stable for current sites, but it leaves the next account site type
dependent on reading `useModelData.ts`,
`apiCredentialProfiles/modelCatalog.ts`, product profiles, and response-source
helpers to understand the Model List path.

This should not be the next step.

### Approach B: Move Full Model List Behavior Into `SiteAdapter`

The adapter could expose one `modelList` capability that returns a complete
`PricingResponse` for every site family.

This blurs the seam. UI fallback state, cache policy, selected-token controls,
partial-success aggregation, and dashboard estimate policy are product
workflow concerns. Backend adapters should describe backend facts, not own the
full Model List experience.

This should not be the next step.

### Approach C: Add A Model List Account-Source Readiness Module

Create a product Module that reads the current account, product profile, and
adapter capabilities, then returns a small readiness result. The hook consumes
that result to choose the existing direct-pricing or fallback loaders.

This is the recommended path. It creates Locality for account-source Model
List decisions without moving backend behavior or UI workflow into the wrong
seam.

## Design

### 1. Add A Model List Account-Source Module

Create a non-React service Module for account-source readiness:

```text
src/services/modelList/
  pricingResponse.ts
src/services/modelPricing/
  modelPriceTable.ts
src/services/modelList/accountSources/
  readiness.ts
  tokenScopedFallback.ts
  sub2apiEstimates.ts
  index.ts
```

Use a service path rather than a feature path because Model List account-source
loading is shared product logic, but it still must not depend on React, locale
files, browser APIs, storage, or render components.

Final ownership should be:

- `src/services/apiCredentialProfiles/modelCatalog.ts`
  - `fetchApiCredentialModelIds(...)`;
  - profile-backed API type dispatch for OpenAI-compatible, OpenAI, Anthropic,
    and Google credential profiles;
  - profile-named wrappers needed by API credential profile callers, such as
    `buildApiCredentialProfilePricingResponse(...)` if callers still need that
    name after the generic response builder moves.
- `src/services/modelList/pricingResponse.ts`
  - neutral helpers that normalize model ids and build minimal
    Model-List-compatible `PricingResponse` objects.
- `src/services/modelList/accountSources/tokenScopedFallback.ts`
  - `ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED`;
  - `loadAccountTokenFallbackPricingResponse(...)`;
  - display-account token secret resolution;
  - account-scoped direct-pricing fallback for profile-sourced capability
    sites;
  - runtime-key catalog fallback through readiness-provided
    `modelCatalog.fetchModels(...)`;
  - generic OpenAI-compatible token fallback when no source-account runtime
    catalog route is active.
- `src/services/modelList/accountSources/sub2apiEstimates.ts`
  - Sub2API runtime-key `PricingResponse` source metadata;
  - Sub2API dashboard auth request construction;
  - group/rate/token estimate orchestration;
  - calls neutral `loadModelPriceTable()` from
    `src/services/modelPricing/modelPriceTable.ts`.
- `src/services/modelPricing/modelPriceTable.ts`
  - `LITELLM_MODEL_PRICE_TABLE_URL`;
  - `MODEL_PRICE_TABLE_FETCH_TIMEOUT_MS`;
  - `loadModelPriceTable()`;
  - LiteLLM price table normalization into this app's USD-per-1M-token display
    units.

After this split, `apiCredentialProfiles/modelCatalog.ts` should not import
`getSiteAdapter`, `resolveDisplayAccountTokenForSecret`,
`accountSiteProfile.modelList`, `ApiToken`, `DisplaySiteData`, or Sub2API
dashboard helpers.

After this split, `src/services/apiCredentialProfiles/` should not contain
Sub2API runtime-key estimate assembly or LiteLLM price-table loading. Those
modules exist for Model List source rendering and pricing estimate display,
not API credential profile persistence or profile catalog lookup.

### 2. Define Readiness Constants And Types

Use exported constants instead of bare control-flow strings.

Proposed Interface:

```ts
export const MODEL_LIST_ACCOUNT_SOURCE_ROUTES = {
  DirectPricing: "direct_pricing",
  TokenScopedRuntimeCatalog: "token_scoped_runtime_catalog",
  Unsupported: "unsupported",
} as const

export type ModelListAccountSourceRoute =
  (typeof MODEL_LIST_ACCOUNT_SOURCE_ROUTES)[keyof typeof MODEL_LIST_ACCOUNT_SOURCE_ROUTES]

export const MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS = {
  MissingModelPricingCapability: "missing_model_pricing_capability",
  MissingModelCatalogCapability: "missing_model_catalog_capability",
  NoSupportedRoute: "no_supported_route",
} as const

export type ModelListAccountSourceUnsupportedReason =
  (typeof MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS)[keyof typeof MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS]

export type ModelListAccountSourceReadiness =
  | {
      route: typeof MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing
      modelPricing: ModelPricingCapability
      statusScope: AccountSiteModelListStatusScope
      displayCapabilitiesSource: AccountSiteModelListDisplayCapabilitySource
    }
  | {
      route: typeof MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog
      modelCatalog: ModelCatalogCapability
      dashboardEstimateLoader: AccountSiteModelListDashboardEstimateLoader
      statusScope: AccountSiteModelListStatusScope
      displayCapabilitiesSource: AccountSiteModelListDisplayCapabilitySource
    }
  | {
      route: typeof MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported
      reason: ModelListAccountSourceUnsupportedReason
      statusScope: AccountSiteModelListStatusScope
      displayCapabilitiesSource: AccountSiteModelListDisplayCapabilitySource
    }
```

The readiness result should include only facts needed to choose and describe
the load route. It should not include query keys, cache keys, UI strings,
toasts, analytics payloads, token lists, selected-token state, or pricing rows.

### 3. Resolve Readiness From Existing Seams

Add a pure resolver:

```ts
export function resolveModelListAccountSourceReadiness(account: {
  siteType: AccountSiteType
}): ModelListAccountSourceReadiness
```

The resolver should:

1. read `getAccountSiteModelListProfile(account.siteType)`;
2. read `getSiteAdapter(account.siteType)`;
3. return `DirectPricing` when the profile allows direct pricing and
   `adapter.modelPricing` exists;
4. return `TokenScopedRuntimeCatalog` when the profile allows runtime-key
   fallback and `adapter.modelCatalog` exists;
5. return `Unsupported` with a typed reason otherwise.

Preserve the current guard-before-cache invariant: direct pricing support must
be resolved before reading or returning cached pricing.

### 4. Keep Request Construction Product-Owned

Keep request construction near Model List account loading:

```ts
createDisplayAccountModelPricingRequest(account)
```

The readiness Module should return the model-pricing capability, not build the
full request. The hook still owns display account fields, cache scope, and
analytics context.

### 5. Route Single-Account Loading Through Readiness

Update `useSingleAccountModelData(...)`.

Current direct path:

1. get adapter model pricing;
2. throw unsupported when missing;
3. read cache;
4. call `fetchPricing`;
5. validate response.

Target direct path:

1. resolve readiness;
2. if readiness route is `DirectPricing`, use `readiness.modelPricing`;
3. if readiness route is `TokenScopedRuntimeCatalog`, throw the existing
   unsupported error so the existing fallback-control flow can activate;
4. if readiness route is `Unsupported`, throw the existing unsupported error.

The rest of the hook should keep current behavior:

- token fallback state remains in the hook;
- one-token auto-load remains in the hook;
- cache keys remain unchanged;
- invalid format handling remains unchanged;
- direct-load analytics remain unchanged.

### 6. Route All-Accounts Loading Through Readiness

Update `useAllAccountsModelData(...)`.

Target behavior:

- `DirectPricing` uses `readiness.modelPricing.fetchPricing(...)`;
- `TokenScopedRuntimeCatalog` calls the existing all-accounts token fallback
  loader;
- `Unsupported` throws the existing unsupported error.

Keep current partial-success behavior:

- if some token catalogs load and some fail, return successful contexts plus
  partial failure metadata;
- if all token catalogs fail, preserve the current error selection rules;
- aggregate analytics still reports failure when any account has an error or
  partial failure.

### 7. Generalize Token-Scoped Runtime Catalog Helpers

Rename internal helpers in `useModelData.ts` to avoid encoding Sub2API in the
product-level path:

- `SUB2API_ALL_ACCOUNTS_TOKEN_CONCURRENCY` ->
  `TOKEN_SCOPED_CATALOG_CONCURRENCY`;
- `loadSub2ApiTokenPricingContext(...)` ->
  `loadTokenScopedCatalogPricingContext(...)`;
- `fetchSub2ApiAllAccountsFallbackPricingContexts(...)` ->
  `fetchTokenScopedCatalogPricingContexts(...)`.

The helper implementation may still delegate to
`loadAccountTokenFallbackPricingResponse(...)` from
`src/services/modelList/accountSources`. The rename is scoped to the product
route, not the backend-specific estimator.

Do not rename response source constants such as
`MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY` in this slice. They describe the
actual current response provider.

### 8. Move Account-Token Fallback Out Of API Credential Profiles

Move the public account-token fallback entrypoint to
`src/services/modelList/accountSources/tokenScopedFallback.ts`:

```ts
export const ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED =
  "ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED"

export async function loadAccountTokenFallbackPricingResponse(
  params: LoadAccountTokenFallbackPricingParams,
): Promise<PricingResponse>
```

Update `useModelData.ts` and fallback tests to import from the new module.
Remove the account-token fallback implementation from
`apiCredentialProfiles/modelCatalog.ts`; do not keep this file as the long-term
compatibility import path for Model List.

The moved fallback loader should:

- resolve account-source readiness before choosing runtime-key catalog
  fallback;
- use `readiness.modelCatalog.fetchModels(...)` for token-scoped runtime
  catalog loading;
- call Sub2API dashboard estimate assembly only when the readiness route
  declares the Sub2API estimate policy;
- keep selected-token secret sanitization and the
  `ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED` fallback message stable;
- preserve the existing response shape for current Sub2API, AIHubMix, and
  OpenAI-compatible fallback users.

This keeps API credential profile code about saved credential profiles, while
Model List owns account-source fallback behavior.

### 9. Move Sub2API Estimate And Price Table Ownership

Move Sub2API runtime-key estimate helpers to
`src/services/modelList/accountSources/sub2apiEstimates.ts`.

The moved Module should own:

- resolving the selected Sub2API key's stable group for optional price
  estimation;
- applying official price estimates to runtime-key model ids;
- producing `MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY` source metadata;
- fallback unavailable-price reasons when the key group or official price is
  unknown.

Move LiteLLM price-table loading to
`src/services/modelPricing/modelPriceTable.ts`.

The moved price-table Module should stay backend-agnostic:

- it loads and normalizes the official model price reference data;
- it does not import Sub2API helpers, account-site product profiles, or Model
  List account-source readiness;
- Sub2API estimate code consumes it as reference data.

Keep test intent unchanged:

- Sub2API estimate tests move from
  `tests/services/apiCredentialProfiles/sub2apiPriceEstimation.test.ts` to
  `tests/services/modelList/accountSources/sub2apiEstimates.test.ts`;
- price-table tests move from
  `tests/services/apiCredentialProfiles/modelPriceTable.test.ts` to
  `tests/services/modelPricing/modelPriceTable.test.ts`;
- callers should not continue importing these modules through
  `services/apiCredentialProfiles`.

### 10. Generalize Token-Scoped Fallback UI Copy

Replace Sub2API-named fallback translation keys with generic token-scoped keys:

- `status.sub2apiKeyScopedTitle` ->
  `status.tokenScopedCatalogTitle`;
- `status.sub2apiKeyScopedDescription` ->
  `status.tokenScopedCatalogDescription`;
- `status.sub2apiKeyScopedFallbackTitle` ->
  `status.tokenScopedCatalogFallbackTitle`;
- `status.sub2apiKeyScopedFallbackDescription` ->
  `status.tokenScopedCatalogFallbackDescription`.

Chinese source copy should describe the product route, not Sub2API:

- account-level model list is unavailable for this source account;
- the extension can load the actual available models through an API key under
  the account;
- if only one eligible key exists, it can be used automatically.

Update sibling locales in the same change. Run i18n extraction CI after locale
changes.

### 11. Keep AIHubMix Display Downgrades Scoped

Do not force AIHubMix response-source downgrade logic into the new readiness
Module unless implementation shows a direct caller benefit.

Current behavior can stay:

- response metadata describes whether the loaded source supports pricing;
- `deriveModelListSourceCapabilities(...)` applies generic response-source
  capability fields;
- `applyAihubmixModelListCapabilities(...)` remains a source-display helper
  because AIHubMix may need profile-driven display downgrade when response
  metadata is not enough.

If this helper is touched, keep the behavior unchanged and add coverage for
the profile-sourced display-capability path.

## Error Handling

Preserve current user-facing behavior:

- invalid pricing payloads still map to `INVALID_FORMAT`;
- unsupported direct pricing still uses the existing unsupported error;
- single-account token-scoped fallback suppresses the red load error while
  fallback controls are available;
- selected-token fallback load failures remain sanitized;
- all-accounts token-scoped fallback keeps partial-success behavior;
- missing capability in a route that profile claims is supported is treated as
  implementation unsupported, not a new user-facing backend error.

The new readiness Module should return typed unsupported reasons instead of
throwing for ordinary unsupported routes. Callers may map unsupported readiness
to the existing hook error where that preserves behavior.

## Telemetry Decision

Telemetry decision: reuse existing.

This is an internal readiness refactor. It should not add a new user action or
analytics field. Existing Model List load-completion events should continue to
emit from the same hook-level call sites.

## Settings Search Decision

Settings search decision: none.

No settings UI, anchors, deep links, or search definitions change.

## E2E Decision

E2E decision: no new Playwright E2E by default.

The main risk is deterministic account-source routing and fallback state. Unit
and hook tests can cover that directly. Add E2E only if implementation changes
cross-entrypoint navigation, browser permission behavior, or real extension
runtime loading.

## Testing Strategy

Add readiness tests:

- compatible account site with `modelPricing` returns `DirectPricing`;
- compatible account site without `modelPricing` returns unsupported with
  `MissingModelPricingCapability`;
- Sub2API profile plus `modelCatalog` returns `TokenScopedRuntimeCatalog`;
- token-scoped fallback profile without `modelCatalog` returns unsupported
  with `MissingModelCatalogCapability`;
- unsupported account site returns unsupported without throwing;
- readiness carries status scope and display capability source from the
  product profile.

Update Model List hook tests:

- single-account direct pricing uses readiness `modelPricing`;
- direct pricing support is checked before cache lookup;
- single-account token-scoped fallback still shows fallback controls instead
  of a red load error;
- one eligible key still auto-loads fallback catalog;
- all-accounts direct pricing still returns account contexts;
- all-accounts token-scoped fallback still supports partial success;
- unsupported non-fallback account still reports load failure;
- analytics result, cache-hit, fallback-used, success-count, and failure-count
  diagnostics remain unchanged.

Update account-token fallback tests:

- move account-token fallback tests out of
  `tests/services/apiCredentialProfiles/modelCatalog.test.ts` into
  `tests/services/modelList/accountSources/tokenScopedFallback.test.ts`;
- keep `tests/services/apiCredentialProfiles/modelCatalog.test.ts` focused on
  saved API credential profile catalog behavior;
- runtime-key catalog loading uses readiness `modelCatalog`;
- Sub2API dashboard estimate loader still runs only for the Sub2API estimate
  policy;
- missing `modelCatalog` capability remains sanitized through the existing
  fallback error path;
- AIHubMix selected-token direct-pricing fallback remains unchanged.

Update Sub2API estimate and price-table tests:

- move Sub2API estimate tests to
  `tests/services/modelList/accountSources/sub2apiEstimates.test.ts`;
- move official price-table tests to
  `tests/services/modelPricing/modelPriceTable.test.ts`;
- preserve coverage for stable group resolution by id/name, masked-key
  handling, unavailable-price reasons, effective group rate rendering, and
  LiteLLM price normalization.

Update UI/copy tests where existing coverage is present:

- `StatusIndicator` renders generic token-scoped fallback copy based on
  `statusScope`;
- old `sub2apiKeyScoped*` locale keys are removed from every supported app
  locale;
- no rendered component needs a raw Sub2API check for token-scoped fallback
  copy.

Focused validation:

```powershell
pnpm vitest run tests/services/modelList/accountSources/readiness.test.ts tests/services/modelList/accountSources/tokenScopedFallback.test.ts tests/services/modelList/accountSources/sub2apiEstimates.test.ts tests/services/modelPricing/modelPriceTable.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx
```

Locale validation:

```powershell
pnpm run i18n:extract:ci
```

Commit gate:

```powershell
pnpm run validate:staged
```

Push gate before publishing:

```powershell
pnpm run validate:push
```

Run `validate:push` before opening or updating a PR because this slice touches
shared Model List source routing, locale keys, and exported profile/readiness
contracts.

## Migration Completeness Checks

Run:

```powershell
rg "Sub2Api|Sub2API|sub2api" src/features/ModelList src/services/apiCredentialProfiles src/locales/*/modelList.json
rg "shouldUseAccountSiteRuntimeKeyCatalogFallback|supportsAccountSiteDirectModelPricing|getAccountSiteModelListProfile" src/features/ModelList src/services/apiCredentialProfiles
rg "modelCatalog|modelPricing|statusScope|displayCapabilitiesSource|dashboardEstimateLoader" src/features/ModelList src/services/apiCredentialProfiles src/services/accounts/accountSiteProfile
rg "loadAccountTokenFallbackPricingResponse|ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED|resolveDisplayAccountTokenForSecret|getSiteAdapter|fetchSub2ApiAvailableGroups|fetchSub2ApiGroupRates|fetchAccountTokens|DisplaySiteData|ApiToken" src/services/apiCredentialProfiles/modelCatalog.ts
rg "sub2apiPriceEstimation|modelPriceTable|loadModelPriceTable|LITELLM_MODEL_PRICE_TABLE_URL" src/services/apiCredentialProfiles src/features src/entrypoints tests
```

The final two `rg` commands are ownership checks. No matches inside
`src/services/apiCredentialProfiles` is the expected result, except for
profile-owned `modelCatalog` tests and any temporary compatibility re-export
removed before completion.

Expected after implementation:

- Sub2API references may remain in backend-specific response metadata,
  dashboard estimate implementation, tests that assert Sub2API behavior, and
  source-provider constants.
- Product-level token-scoped fallback route names and user-facing copy should
  not be Sub2API-specific.
- `apiCredentialProfiles/modelCatalog.ts` should not contain account-token
  fallback exports, account-source readiness/profile imports, display-account
  token resolution, adapter lookup, or Sub2API dashboard estimate imports.
- `src/services/apiCredentialProfiles/` should not contain
  `sub2apiPriceEstimation.ts`, `modelPriceTable.ts`, or imports of the moved
  Sub2API estimate / price-table modules.
- `useModelData.ts` should not independently decide direct pricing versus
  token-scoped runtime catalog by combining profile helpers and adapter checks
  in multiple places.
- The readiness Module should be the test surface for adding a future
  account-site Model List route.

## Rollout

1. Move account-token fallback loader ownership from
   `apiCredentialProfiles/modelCatalog.ts` to
   `modelList/accountSources/tokenScopedFallback.ts`, keeping behavior and
   tests green.
2. Move Sub2API runtime-key estimate assembly to
   `modelList/accountSources/sub2apiEstimates.ts`, keeping behavior and tests
   green.
3. Move LiteLLM price-table loading to
   `modelPricing/modelPriceTable.ts`, keeping behavior and tests green.
4. Add neutral Model List pricing-response helpers if the moved fallback and
   profile catalog both need the same minimal response builder.
5. Add readiness constants, types, resolver, and focused tests.
6. Migrate single-account Model List routing through readiness.
7. Migrate all-accounts Model List routing through readiness.
8. Generalize token-scoped fallback helper names.
9. Route the moved account-token fallback runtime catalog loading through
   readiness while preserving Sub2API estimate behavior.
10. Generalize token-scoped fallback locale keys and update sibling locales.
11. Run focused tests after each migration group.
12. Run i18n extraction CI after locale changes.
13. Run `pnpm run validate:staged`.
14. Run `pnpm run validate:push` before publishing.
15. Inspect the final diff for adapter/product/UI seam drift.

## Follow-Up, Not In Scope For This Spec

- Add a concrete new account site type and use the readiness tests as the
  Model List acceptance check.
- Consolidate account-site registration metadata across `SITE_TYPES`,
  onboarding metadata, adapter-family routing, product profiles, and Model
  List readiness expectations.
- Move Sub2API dashboard estimate inputs behind a separate adapter capability
  only if another account site needs a comparable backend estimate flow.
- Revisit AIHubMix display downgrade only if response-source metadata can
  fully replace profile-sourced display capability policy.
- Add static enforcement that Model List render components cannot import raw
  site-type constants for product policy decisions.

The intended seam split is: adapters describe backend model capabilities,
account-site product profiles describe source-account policy, the readiness
Module selects the Model List route, and React components render the resulting
state.
