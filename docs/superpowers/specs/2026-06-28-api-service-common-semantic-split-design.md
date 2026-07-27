# API Service Common Semantic Split Design

Date: 2026-06-28

## Purpose

Split the current `apiService/common` semantics without breaking behavior.

The `apiService/common` service surface grew out of One API / New
API-compatible account-site calls. Repo domain guidance treats One API as the
older upstream root family, with New API and OneHub as major downstream lines;
current runtime code should not be read as independent proof of that lineage.
Separately, this product's account-site integration has converged on a broad
`NewApiFamily` adapter bucket, so New API-style response shapes naturally
became many of the product's first internal shapes. Later compatible buckets
and Account Site Types such as Sub2API and AIHubMix were adapted into those
shapes so existing product flows could keep working. Some current
`common/type.ts` exports were added later for product or backend-specific work,
so this is not a claim that every current type predates those adapters.

Product Canonical Model is a current design interpretation of how these shapes
are used by the product. It was not the original historical name or intent.

This spec defines how to separate:

- raw New API-family upstream payloads;
- Product Canonical Models that happen to retain New API-style field names;
- adapter-local upstream DTO snapshots that may cover only the verified fields
  needed by this product;
- shared transport and helper modules;
- the legacy `getApiService(...)` compatibility facade.

It is a docs-only design artifact and does not implement the refactor.

## Current Context

The current checkout has already moved many account-site behaviors behind
`SiteAdapter` capability objects:

- `src/services/apiAdapters/contracts/siteAdapter.ts` declares the account-site
  capability Interface.
- `src/services/apiAdapters/registry.ts` resolves Adapter Family metadata from
  account-site definitions.
- `src/services/apiAdapters/newApi/**` now routes through
  `src/services/apiService/newApiFamily/**` instead of calling the legacy
  `getApiService(...)` facade, but many `newApiFamily` modules still wrap or
  import common-compatible defaults and types. This split is incremental, not
  complete.
- `src/services/apiService/index.ts` is documented as a legacy compatibility
  facade for managed-site and unmigrated flat API callers.

The remaining naming and ownership problem is concentrated in:

```text
src/services/apiService/common/
  index.ts
  type.ts
  utils.ts
  pagination.ts
  tokenKeyResolver.ts
  errors.ts
  constant.ts
  compatHeaders.ts
```

`common/index.ts` still exports a broad flat set of functions. Some are New
API-family implementation details, some are legacy facade defaults, and some
are genuine shared helpers.

`common/type.ts` is more subtle. Its header says it is for One API/New API
interaction, but it also contains shapes now used across backend families:

- `AccountData`
- `RefreshAccountResult`
- `UserGroupsResponse`
- `UserGroupInfo`
- `PricingResponse`
- `ModelPricing`
- `ModelListSourceInfo`
- request/context re-exports from `apiTransport/type`

Current adapter contracts also still import canonical-looking types and request
helpers from `apiService/common/type.ts` in account bootstrap, account
completion, account data, account refresh, key management, model pricing,
redemption, site announcement, site notice, and token provisioning contracts.
That is useful compatibility evidence, but it is also the import path this
refactor should retire. `modelCatalog` is already a better example: it imports
`ApiServiceRequest` from `apiTransport/type`.

Sub2API makes the semantic drift visible. `src/services/apiService/sub2api`
has raw Sub2API DTOs and parsers, then maps those payloads into `AccountData`,
`UserGroupInfo`, `ApiToken`, and runtime model ID arrays. Separately, Model
List account-source code maps runtime IDs plus optional dashboard group/rate
data into `PricingResponse`. Those outputs are product-level shapes, even if
they still look like New API-era response objects.

## Problem

The name `common` currently hides three different concepts behind one
module/directory:

1. New API / One API-family implementation defaults.
2. Product Canonical Models that historically inherited New API field shape.
3. Truly shared transport helpers and utility types.

That creates a shallow Interface. A caller importing from `common/type` cannot
tell whether it is consuming:

- an upstream payload contract from New API;
- a normalized product contract that every Adapter should return;
- a legacy compatibility type used only by `getApiService(...)`;
- a transport helper that is safe for all Account Site Types.

The deletion test shows the problem: deleting `common/type.ts` would not reveal
one cohesive missing module. Its contents would need to be redistributed across
adapter contracts, product model modules, New API-family DTOs, and transport
helpers. The current Module is not deep; it is a historical bucket.

The same issue exists at runtime. Sub2API does not naturally return New API
payloads, but several functions intentionally adapt Sub2API payloads into
historical New API-shaped results so product modules can stay stable. That is
valid when the output is a Product Canonical Model. It is misleading when the
type remains owned by `apiService/common`.

## Goals

- Make `common` stop pretending to mean universal backend behavior.
- Preserve current product behavior and public TypeScript shapes during the
  first migration slices.
- Classify each exported type by semantic owner:
  - upstream New API-family payload;
  - Product Canonical Model;
  - legacy facade compatibility shape;
  - shared transport/helper type.
- Move or alias Product Canonical Models toward product-owned modules when
  feature/product code reads or builds their fields. Adapter capability
  contracts should import those models for return types instead of becoming the
  owner by default.
- Move raw New API-family payloads toward `apiService/newApiFamily/**`.
- Treat raw upstream DTO types as verified adapter-local snapshots, not full or
  timeless upstream schemas.
- Keep shared transport helpers in a neutral shared location.
- Keep `getApiService(...)` as a legacy compatibility facade until unmigrated
  callers are gone.
- Add tests/import checks that prevent new account-site capability work from
  depending on `apiService/common/index.ts` or the legacy facade.
- Document the rule that type ownership is determined by semantic role, not by
  snake_case field style or historical New API shape.

## Non-Goals

- Do not change runtime behavior in the initial semantic split.
- Do not rename persisted storage fields.
- Do not rename product fields such as `quota`, `group_ratio`, `usable_group`,
  or `today_quota_consumption` in this refactor.
- Do not delete `getApiService(...)`.
- Do not migrate managed-site provider flows merely because they still call the
  legacy facade.
- Do not move every function out of `common/index.ts` in one slice.
- Do not force Sub2API or AIHubMix to expose New API-compatible raw payloads.
- Do not introduce a universal replacement for `siteOverrideMap` under a new
  name.
- Do not add telemetry, settings search changes, locale changes, UI changes, or
  Playwright coverage by default.

## Ownership Principles

### 1. Field Shape Does Not Decide Ownership

Snake_case fields and New API-style response envelopes are not enough to prove
that a type belongs to New API-family implementation.

Ownership is decided by what the shape means to callers:

- If the shape mirrors a concrete upstream endpoint payload, it belongs to the
  backend-family implementation that calls that endpoint.
- If the shape is consumed by product flows after adaptation, it is a Product
  Canonical Model.
- If the shape exists only for the legacy flat facade, it belongs to the
  compatibility layer.
- If the shape is request transport, pagination, or low-level helper plumbing,
  it belongs to a shared transport/helper module.

### 2. Product Canonical Models May Keep Historical Field Names

Repo domain guidance treats One API as the older upstream root family, with New
API and OneHub as major downstream lines. Separately, the product has converged
on a broad `NewApiFamily` adapter bucket for compatible account site types, so
many New API / One API-compatible field names became product contracts by
usage.

Do not rename fields just to make the model look less New API-like. The first
step is to move ownership and naming at the Module level. Field-level cleanup
can happen later only when it has clear product value and migration coverage.

### 3. Adapters Own Upstream-To-Product Mapping

Each Site Adapter Capability implementation should convert raw upstream
payloads into the Product Canonical Model required by that capability.

Example:

```text
Sub2API raw /api/v1/* payload
  -> Sub2API parser/mapper
    -> Product Canonical Model
      -> SiteAdapter capability Interface
```

The mapper is where backend differences belong. Product modules should not need
to know whether the canonical result came from New API, Sub2API, AIHubMix, or a
future Account Site Type.

Raw upstream DTO types used by these mappers should be scoped to the adapter
and endpoint evidence that currently exists. Some historical DTO types may have
been deleted, may be stale versus the upstream backend, or may intentionally
include only the subset of fields this product needs. Do not expand or move
them as if they were complete upstream schemas unless the fields are verified.

### 4. Product Modules Own Product Models They Read Or Build

When feature or product Modules read a shape's fields, build that shape, or use
its metadata for product decisions, that Module owns the Product Canonical
Model. Adapter capability contracts can import the model for Interface return
types, but the contract file does not automatically become the model owner.

### 5. `common` Should Shrink Toward Compatibility

The long-term target is not a larger `common` with better comments. It should
shrink into either:

- a legacy compatibility barrel used by `getApiService(...)`; or
- small neutral shared modules for transport, fetch, pagination, and cache
  helpers.

New capability work should import from explicit capability contracts,
`newApiFamily`, provider-specific implementation modules, or shared transport
helpers.

## Target Ownership Map

### Product Canonical Models

These are candidates to move first behind product-owned names, with
compatibility aliases kept during migration. Capability contract files may
import and expose these names as part of their Interface, but they should not
become the model owner merely because an Adapter returns the shape.

| Current type | Current file | Proposed owner | Reason |
| --- | --- | --- | --- |
| `AccountData` | `apiService/common/type.ts` | Candidate: `services/accounts/accountDataModel.ts`, imported by `apiAdapters/contracts/accountData.ts` | Returned by account-data capabilities for New API-family, Sub2API, and AIHubMix. It is a product account summary, not a raw New API response. Final owner should follow the account product Module that reads/builds these fields. |
| `RefreshAccountResult` | `apiService/common/type.ts` | Candidate: account refresh product model, imported by `apiAdapters/contracts/accountRefresh.ts` | Returned by account-refresh capabilities and includes product health/auth-update semantics. Final owner needs a consumer audit before moving. |
| `UserGroupInfo` / group map | `apiService/common/type.ts` | Candidate: key-management product model, imported by `apiAdapters/contracts/keyManagement.ts` | Used by token creation, group coverage, and repair flows after backend group formats are normalized. Final owner should follow the key-management product Module that reads/builds these fields. |
| `CreateTokenRequest` / `CreateTokenResult` | `apiService/common/type.ts` | Candidate: key-management product model, imported by `apiAdapters/contracts/keyManagement.ts` | Product token-form shape used across adapters, with backend-specific translation in implementations. Final owner needs a consumer audit before moving. |
| `PricingResponse` / `ModelPricing` | `apiService/common/type.ts` | `services/modelList/pricingModel.ts` | Product Model List pricing/catalog view. Sub2API estimates and AIHubMix profile pricing already build this shape. `apiAdapters/contracts/modelPricing.ts` should import this model for its Interface return type. |
| `ModelListSourceInfo` and source/precision constants | `apiService/common/type.ts` | `services/modelList/pricingModel.ts` | Product provenance metadata used to explain direct, fallback, estimated, or unavailable pricing. |

Compatibility rule: keep type aliases from the old path until imports have been
migrated and `knip` confirms the old exports are no longer needed.

### New API-Family Upstream Payload Audit Candidates

These may move toward `apiService/newApiFamily/types.ts` or capability-local
New API-family files after a consumer audit:

- `SiteStatusInfo`
- `SiteNoticeResponse`
- `CheckInStatus`
- `CheckInStatusResponse`
- `NewApiCheckinResponse`
- `Payment`
- `PaymentResponse`
- `LogType`
- `LogItem`
- `LogResponseData`
- `LogStatResponseData`
- `TodayLogQueryConfig`
- endpoint-specific channel response details used only by New API-family
  managed-site compatibility paths

These types may still feed Product Canonical Models, but callers outside
New API-family implementation should not treat them as universal Account Site
Type contracts.

This list is intentionally an audit queue, not a definitive raw DTO list.
Historical DTO types may have been removed from active code, drifted from
current upstream behavior, or captured only fields the product once needed.
Before moving one, check current consumers and either verify the upstream
endpoint fields or narrow the type name to the product-supported subset.

Known ambiguities:

- `SiteStatusInfo` is used by account bootstrap/completion contracts and by
  Sub2API synthetic status, so it is not automatically a raw New API DTO.
- `PaymentResponse` currently carries RIX_API fallback semantics in
  `common/index.ts`.
- `LogType` / `LogItem` are consumed by usage-history product logic, so they
  need a consumer audit before being treated as raw New API DTOs.
- `ModelsResponse`, `UserGroupsResponse`, and `SiteNoticeResponse` may be
  legacy or unused candidates; do not move them without reference searches.

### Shared Transport And Helper Types

These already mostly belong to `apiTransport` or neutral helper modules:

- `ApiServiceRequest`
- `ApiTransportRequest`
- `ApiResponse`
- `FetchApiOptions`
- auth config/context kinds
- `PaginatedData<T>` and pagination extraction helpers
- `fetchApi`, `fetchApiData`
- API errors
- request constants and limiters
- token-key cache helpers when they are not New API-specific

The first migration should prefer existing neutral owners such as
`apiTransport/type` and re-export aliases rather than broad import rewrites.
Do not create `apiService/shared` merely as a new bucket; create it only when a
concrete helper has non-legacy callers and no existing neutral owner.

### Legacy Facade Compatibility

`src/services/apiService/index.ts` and a thin compatibility barrel may continue
to expose old names for callers that have not moved to `SiteAdapter`
capabilities or managed-site provider-specific modules.

The compatibility layer should be described as legacy in comments and tests.
It should not receive new account-site capability facts.

## Concrete Evidence In Current Code

### Sub2API Account Data

`src/services/apiService/sub2api/index.ts` parses Sub2API user payloads from
`/api/v1/auth/me`, then returns `AccountData`.

The result contains product fields such as quota, zeroed today usage/income,
and disabled check-in config. That is not a Sub2API raw response and it is not
a New API raw response. It is the product account summary model.

### Sub2API User Groups

Sub2API fetches available groups and group rates, then builds a
`Record<string, UserGroupInfo>`.

That shape exists so token creation, group coverage, and repair logic can make
product decisions without understanding Sub2API's upstream group/rate payloads.
It should be owned by key-management product/capability semantics.

### Sub2API Runtime Models And Pricing

`fetchSub2ApiRuntimeModels(...)` calls runtime `/v1/models` with API-key auth
and returns model IDs visible to the key. `ModelCatalogCapability` already owns
this runtime catalog result as `string[]`; `sub2ApiModelCatalog` delegates to
`fetchSub2ApiRuntimeModels(...)`.

Model List code then builds a `PricingResponse` through
`services/modelList/accountSources/sub2apiEstimates` and
`services/modelList/pricingResponse`.

The final `PricingResponse` is not a Sub2API response and not necessarily a
New API `/api/pricing` response. It is a Product Canonical Model for Model List.

### New API-Family Defaults

`src/services/apiService/newApiFamily/**` already exists and should continue to
receive default implementation logic that previously lived behind
`common/index.ts`. It is currently a transitional seam: new adapter
capabilities can route through it without calling `getApiService(...)`, but the
implementation still imports common-compatible defaults and types in places.

The important distinction is that raw New API-family endpoint payloads should
move there, while Product Canonical Models should move to the product Modules
that read or build their fields.

## Proposed Module Shape

The target direction is:

```text
src/services/apiService/
  index.ts                    # legacy compatibility facade
  legacy/
    commonFacade.ts            # optional later compatibility barrel
  newApiFamily/
    accountBootstrap.ts
    accountData.ts
    accountRefresh.ts
    keyManagement.ts
    modelPricing.ts
    redemption.ts
    siteNotice.ts
    tokenProvisioning.ts
    types.ts                  # verified endpoint DTO snapshots only;
                              # prefer capability-local files when narrower
  shared/                     # last resort only; prefer apiTransport or
                              # existing neutral owners first
    errors.ts
    fetch.ts
    pagination.ts
    tokenKeyResolver.ts
    limiter.ts

src/services/apiAdapters/
  contracts/
    accountData.ts            # Adapter Interface; imports product model
    accountRefresh.ts
    keyManagement.ts
    modelPricing.ts           # Adapter Interface; imports Model List pricing model
    siteAdapter.ts

src/services/modelList/
  pricingModel.ts             # Product Canonical Model for model pricing/catalog
  pricingResponse.ts           # builders for the product pricing model
```

This file layout is directional. The implementation plan should choose smaller
steps and keep aliases where import churn would be noisy.

## Migration Strategy

### Slice 1: Type Ownership Audit And Alias Layer

Create a short ownership map in code comments or tests for the main exported
types from `common/type.ts`.

Audit current consumers first, then add new owner modules for Product Canonical
Models. Re-export aliases from `common/type.ts`:

```ts
export type { AccountData } from "~/services/accounts/accountDataModel"
```

or:

```ts
export type { PricingResponse } from "~/services/modelList/pricingModel"
```

The exact owner depends on which product Module reads or builds the fields.
Adapter capability contract files can then import the model for their
Interface. The first slice should not change runtime behavior.

The first actual move should be the Model List pricing model, because its
product owner is already clear. Leave ambiguous raw DTO candidates in place
until their consumers and upstream evidence have been checked.

Done when:

- new imports can target the semantic owner;
- old imports still compile;
- tests prove no runtime behavior changed.

### Slice 2: Move Model List Pricing Models

Move `PricingResponse`, `ModelPricing`, source/precision constants, and
`isModelPriceUnavailable(...)` to `services/modelList/pricingModel.ts`.

Why this is a good early slice:

- Model List already has `services/modelList/pricingResponse.ts`.
- Sub2API estimates already prove this shape is a product model, not a raw New
  API response.
- The blast radius is mostly import paths and focused Model List tests.

Done when:

- Model List code imports pricing models from `services/modelList`;
- `common/type.ts` only re-exports compatibility aliases;
- `apiAdapters/contracts/modelPricing.ts` imports the Model List pricing model
  for its Adapter Interface instead of owning the Product Canonical Model;
- `apiService/newApiFamily/modelPricing.ts` maps New API-family endpoint output
  into the product pricing model.

### Slice 3: Move Account Data And Refresh Models

Move `AccountData`, `TodayUsageData`, `TodayIncomeData`,
`RefreshAccountResult`, and `HealthCheckResult` toward account product model
modules, then import those models from account-data and account-refresh
contracts.

This slice should keep field names stable and preserve Sub2API's current
zeroed today-stat behavior.

Done when:

- account product model modules own the output shapes read or built by product
  code;
- account-data and account-refresh contracts import those output types for
  their Adapter Interfaces;
- Sub2API and New API-family implementations import those canonical types from
  the semantic owner;
- old `common/type.ts` imports remain as aliases only.

### Slice 4: Move Key Management Canonical Types

Move `UserGroupInfo`, group response aliases, `CreateTokenRequest`, and
`CreateTokenResult` toward a key-management product model owner, then import
those models from the key-management capability contract.

This slice should be careful because token creation policy and group coverage
already use these shapes across New API-family, Sub2API, and AIHubMix.

Done when:

- key-management product model modules own the product token/group shapes;
- key-management capability contracts expose those imported shapes through
  their Adapter Interface;
- provider implementations map raw backend group/token data into those shapes;
- tests cover Sub2API group/rate mapping and New API-family group fetch.

### Slice 5: Move Raw New API-Family DTOs

Move endpoint-specific New API-family payload types into
`apiService/newApiFamily/types.ts` or capability-local files.

Do this after Product Canonical Models have owners, so the move does not blur
raw upstream payloads with product shapes.

Done when:

- moved DTO types are explicitly limited to verified endpoint fields or named
  as product-supported subsets;
- New API-family implementation imports raw DTOs from `newApiFamily`;
- product modules do not import raw DTOs;
- old common exports are aliases or removed after `knip` proves they are dead.

### Slice 6: Shrink `common/index.ts`

After types and capability implementations have moved, reduce
`common/index.ts` to compatibility exports or move it under a clearer legacy
name.

Done when:

- new account-site capability work has no reason to import `common/index.ts`;
- `getApiService(...)` remains compatible for old callers;
- stale exports are removed only after focused searches and `knip`.

## Testing Strategy

Use tests at the semantic owner, not only import-path tests.

Focused tests by slice:

- Model List pricing model:
  - builders preserve existing `PricingResponse` shape;
  - Sub2API runtime-key model catalog still marks source/precision correctly;
  - unavailable prices still use the same metadata.
- Account data/refresh:
  - New API-family and Sub2API account data return the same product fields as
    before;
  - Sub2API today usage/income remains zeroed until explicitly mapped;
  - refresh auth updates preserve Sub2API token-refresh semantics.
- Key management:
  - Sub2API group/rate mapping returns the same product group map;
  - New API-family group fetch still supports existing callers;
  - token create/update request translation is unchanged.
- Compatibility:
  - `getApiService(...)` legacy calls still compile and behave for unmigrated
    callers;
  - old `common/type.ts` imports continue to compile while aliases exist.

Useful commands:

```powershell
pnpm vitest run tests/services/modelList/accountSources/readiness.test.ts
pnpm vitest run tests/services/apiAdapters/keyManagement.test.ts
pnpm vitest run tests/services/apiService/index.test.ts
pnpm vitest run tests/services/apiService/sub2api/index.test.ts
```

Use exact test filenames after checking current coverage.

Commit gate:

```powershell
pnpm run validate:staged
```

Push gate before publishing:

```powershell
pnpm run validate:push
```

`validate:push` is appropriate for implementation slices because the work
changes exported types, shared import graph wiring, and `knip` reachability.

## Import Guardrails

Add guardrails after the first owner modules exist:

- No new runtime barrel imports from `~/services/apiService/common` or
  `~/services/apiService/common/index` in new account-site capability work.
  Keep existing legacy/provider exceptions during migration.
- New account-site capability code should not import `getApiService(...)`.
- After each model moves, forbid named imports of that migrated model from
  `apiService/common/type`.
- Product modules should import Product Canonical Models from their semantic
  owner, not from `apiService/common/type`.
- Raw New API-family DTO imports should stay inside `apiService/newApiFamily`
  or legacy compatibility tests, after those DTOs have been audited.
- Staged submodule exceptions such as `common/type`, `common/errors`, and
  `common/utils` can remain until the relevant slice moves them.

These guardrails can start as tests or targeted static checks. The repo already
has a narrow ESLint restriction for `apiAdapters/newApi/**` legacy imports; add
new restrictions in staged slices instead of a broad rule that breaks legacy
migration paths all at once.

## Error Handling

This refactor should not change user-facing error behavior.

Compatibility aliases should keep old imports compiling until the owning
modules are stable. Runtime mapper errors should stay in their existing
backend-family implementations.

When splitting types reveals an ambiguous owner, prefer leaving a compatibility
alias and adding a comment over moving the type to the wrong semantic owner.

## Telemetry Decision

Telemetry decision: none.

This is an internal semantic split. It should not add product analytics events,
fields, or settings snapshots.

## Settings Search Decision

Settings search decision: none.

No settings UI, anchors, deep links, or search definitions change.

## E2E Decision

E2E decision: no new Playwright E2E by default.

The risk is TypeScript ownership, mapper behavior, and compatibility imports.
Vitest and compile/knip gates are the right coverage layer. Add E2E only if a
later implementation slice changes browser-extension runtime behavior or a
complete user workflow.

## Validation Plan

For this docs-only spec:

```powershell
pnpm run validate:staged
```

For implementation slices:

```powershell
pnpm vitest run <focused test files>
pnpm compile
pnpm run validate:staged
pnpm run validate:push
```

Before each implementation handoff, run focused searches:

```powershell
rg "from \"~/services/apiService/common/type\"" src tests
rg "from \"~/services/apiService/common\"" src/services/apiAdapters src/services/modelList src/services/accounts
rg "getApiService\\(" src/services/apiAdapters src/services/modelList src/services/accounts src/features
rg "PricingResponse|AccountData|UserGroupInfo|CreateTokenRequest" src/services/apiService/common src/services/apiService/sub2api src/services/modelList src/services/apiAdapters
```

Expected end state after all slices:

- `common/type.ts` is gone or contains compatibility aliases only.
- Product Canonical Models have semantic owners.
- raw New API-family DTO snapshots are in New API-family implementation
  modules, limited to verified fields or clearly named product-supported
  subsets.
- shared helpers are in neutral shared modules or existing `apiTransport`
  owners.
- `common/index.ts` no longer attracts new account-site capability work.
- `getApiService(...)` remains only as a legacy compatibility facade for
  unmigrated callers.

## Rollout

1. Add Product Canonical Model terminology to `CONTEXT.md`.
2. Write this design spec.
3. Create an implementation plan for Slice 1 only.
4. Implement type-owner modules with compatibility aliases and no runtime
   behavior change.
5. Validate focused tests, compile, staged validation, and push validation.
6. Continue with Model List pricing models as the first behavior-adjacent type
   ownership migration.
7. Move account data/refresh and key-management canonical types in separate
   commits.
8. Move raw New API-family DTOs after product canonical types have owners.
9. Shrink `common/index.ts` only after imports prove the compatibility surface
   is small enough to review.

## Follow-Up, Not In Scope For This Spec

- Rename product canonical fields away from New API-era names.
- Redesign Model List pricing semantics beyond owner cleanup.
- Remove the legacy `getApiService(...)` facade.
- Move managed-site provider integrations to a new managed-site adapter seam.
- Add a real new Account Site Type tracer.
- Add repo-wide ESLint restrictions if lightweight guardrail tests are enough.

The intended seam split is: backend-family implementations own verified raw
upstream payload snapshots and upstream-to-product mapping, Site Adapter
Capability contracts own the Interface, Product Canonical Models own the
feature-facing shape, shared transport modules own request/fetch mechanics, and
the legacy facade exists only for compatibility.
