# Model Vendor Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Model List's aging static provider classification with adapter-normalized vendor evidence, shared models.dev identity matching, conservative curated fallback rules, and a conditional Unclassified filter for unresolved rows.

**Architecture:** Introduce a site-neutral `ModelDescriptor` and typed vendor-evidence contract at the model-domain boundary. Pricing and catalog adapters normalize backend facts into that contract; a shared metadata identity index resolves exact and unambiguous aliases; a pure vendor resolver produces namespaced vendor identities; Model List aggregates those identities once and uses the same result for tabs, counts, filtering, and row presentation. Unresolved rows retain an `unknown` row state and are selected only through the UI-owned `filter:unclassified` sentinel. Verification protocol, readiness routing, and model-sync version protections remain independent compatibility boundaries.

**Tech Stack:** TypeScript, React, Vitest, React Testing Library, WXT extension services, models.dev metadata, existing API-adapter capability registry, `@lobehub/icons`, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-14-model-vendor-classification-design.md`

---

## File Structure

Create:

- `src/services/models/modelDescriptor.ts`
  - Owns `ModelDescriptor`, vendor-evidence kinds, validation, trimming, and order-independent duplicate normalization.
- `tests/services/models/modelDescriptor.test.ts`
  - Covers invalid IDs, deduplication, identical evidence, and conflicting evidence.
- `src/services/models/modelMetadata/modelIdentityIndex.ts`
  - Owns exact, provider-qualified, normalized-alias, ambiguous, and redirect-strict metadata lookup.
- `tests/services/modelMetadata/modelIdentityIndex.test.ts`
  - Covers shared lookup semantics and ambiguous/date-sensitive cases.
- `src/services/models/modelVendor.ts`
  - Owns known publisher aliases, boundary-safe family rules, pure candidate resolution, namespaced keys, and dataset aggregation.
- `tests/services/models/modelVendor.test.ts`
  - Covers resolution precedence, ambiguity, boundary negatives, custom identities, and deterministic aggregation.
- `tests/services/apiAdapters/sharedchat/modelCatalog.test.ts`
  - Covers SharedChat's string-ID to descriptor adapter boundary.
- `src/services/apiAdapters/newApi/modelPricingDto.ts`
  - Owns New API `/api/pricing` native vendor fields and the canonical response normalizer.
- `tests/services/apiAdapters/newApi/modelPricing.test.ts`
  - Covers native registry validation, joins, ambiguity, and override isolation.
- `src/features/ModelList/modelVendorPresentation.ts`
  - Maps pure vendor identities to library-owned Color/Mono assets, initials,
    generic, or unknown mark semantics; contains no classification logic.
- `tests/features/ModelList/modelVendorPresentation.test.ts`
  - Covers brand, initials, generic, and unknown presentation selection.
- `src/features/ModelList/components/ModelVendorMark.tsx`
  - Renders compact marks and neutral badge surfaces without owning brand
    colors or backgrounds.
- `tests/features/ModelList/components/ModelVendorMark.test.tsx`
  - Covers library marks, initials, CPU/help fallbacks, and badge variants.
- `src/components/icons/InitialsIcon.tsx`
  - Provides a reusable neutral one- or two-letter icon fallback.

Modify:

- `src/services/modelList/pricingModel.ts`
- `src/services/modelList/pricingResponse.ts`
- `src/services/apiAdapters/contracts/modelCatalog.ts`
- `src/services/apiAdapters/sub2api/modelCatalog.ts`
- `src/services/apiAdapters/sharedchat/modelCatalog.ts`
- `src/services/apiCredentialProfiles/modelCatalog.ts`
- `src/services/modelList/accountSources/runtimeKeyFallback.ts`
- `src/services/modelList/accountSources/sub2apiEstimates.ts`
- `src/services/models/modelPricingCache.ts`
- `src/services/apiAdapters/newApi/modelPricing.ts`
- `src/services/apiAdapters/aihubmix/modelPricing.ts`
- `src/services/apiService/oneHub/transform.ts`
- `src/services/apiService/aihubmix/index.ts`
- `src/services/models/modelMetadata/types.ts`
- `src/services/models/modelMetadata/index.ts`
- `src/services/models/modelMetadata/ModelMetadataService.ts`
- `src/features/ModelList/modelCapabilityFilters.ts`
- `src/services/models/modelRedirect/ModelRedirectService.ts`
- `src/services/models/utils/modelProviders.ts`
- `src/features/ModelList/hooks/useFilteredModels.ts`
- `src/features/ModelList/ModelList.tsx`
- `src/features/ModelList/components/ProviderTabs.tsx`
- `src/features/ModelList/components/ModelDisplay.tsx`
- `src/features/ModelList/components/ModelItem/index.tsx`
- `src/features/ModelList/components/ModelItem/ModelItemHeader.tsx`
- `package.json` and `pnpm-lock.yaml` for the `@lobehub/icons` upgrade from
  2.38 to 5.13.
- focused tests named in each task below.

Do not modify:

- site-type capability/profile definitions merely to advertise vendor support;
- verification protocol selection or profile `apiType` semantics;
- persisted account schemas;
- Model List analytics payloads;
- locale files unless implementation introduces new user-facing copy;
- model-sync scheduling policy beyond regression coverage for redirect mapping.

Before every task, run `git status --porcelain`, re-read each file before
patching it, and protect unrelated staged, unstaged, and untracked work. The
`git add` commands below are task-scoped allowlists, not permission to stage
other changes in the same files; if a listed file already contains unrelated
edits, stop and split the patch or report the overlap.

Before Task 1, record `git rev-parse HEAD` as the implementation base SHA in
the controller's task state. Task 10 also derives the same SHA from the parent
of Task 1's exact commit message, so final diff review remains reproducible
after Tasks 1–9 have already been committed.

## Shared Target Contracts

Use these names consistently throughout the implementation:

```ts
export const MODEL_VENDOR_EVIDENCE_KINDS = {
  Publisher: "publisher",
  DeploymentCategory: "deployment_category",
  RoutingProvider: "routing_provider",
} as const

export type ModelVendorEvidenceKind =
  (typeof MODEL_VENDOR_EVIDENCE_KINDS)[keyof typeof MODEL_VENDOR_EVIDENCE_KINDS]

export interface ModelVendorEvidence {
  kind: ModelVendorEvidenceKind
  name: string
  externalId?: string
}

export interface ModelDescriptor {
  id: string
  vendorEvidence?: ModelVendorEvidence
}
```

The vendor result uses disjoint identity spaces:

```ts
export const MODEL_VENDOR_FILTER_VALUES = {
  All: "filter:all",
  Unclassified: "filter:unclassified",
} as const

export type ModelVendorProvenance =
  | { source: "metadata"; identityMatch: "exact" | "normalized-alias" }
  | {
      source:
        | "publisher-evidence"
        | "deployment-alias"
        | "curated-rule"
        | "routing-alias"
      identityMatch?: never
    }

export type ModelVendorCandidate =
  | ({
      state: "candidate"
      kind: "known"
      key: `known:${string}`
      knownId: string
      labelCandidate: string
    } & ModelVendorProvenance)
  | ({
      state: "candidate"
      kind: "custom"
      key: `custom:${string}`
      labelCandidate: string
    } & ModelVendorProvenance)
  | { state: "unknown" }

export type ResolvedModelVendor =
  | ({
      state: "resolved"
      kind: "known"
      key: `known:${string}`
      knownId: string
      label: string
    } & ModelVendorProvenance)
  | ({
      state: "resolved"
      kind: "custom"
      key: `custom:${string}`
      label: string
    } & ModelVendorProvenance)
  | { state: "unknown" }
```

The per-row resolver returns `ModelVendorCandidate`; it never claims its raw
label is dataset-canonical. Aggregation returns the vendor catalog plus a
`ResolvedModelVendor` for every row. The discriminated known/custom variants
make `knownId` mandatory only for `known:*` keys and impossible on `custom:*`
keys.

`filter:all` and `filter:unclassified` are UI filter sentinels, not vendor
keys. The latter selects rows whose attached result is `{ state: "unknown" }`
and appears only while the post-base-filter unresolved count is greater than
zero. All retains both classified and unresolved rows.

The resolver receives the complete `ModelIdentityLookupResult`, not only its
metadata record. Both exact and unambiguous normalized-alias results may
provide metadata vendor evidence at the metadata precedence level, but
ambiguity never does; preserve `match` as `identityMatch` for tests and
diagnostics. Publisher evidence still wins over either metadata match.

`externalId` is opaque response-local evidence only. It is never used in a vendor key, filter value, or cross-account merge.

## Task 1: Introduce The Neutral Descriptor And Evidence Types

**Files:**

- Create: `src/services/models/modelDescriptor.ts`
- Create: `tests/services/models/modelDescriptor.test.ts`
- Modify: `src/services/modelList/pricingModel.ts`

- [ ] **Step 1: Write failing descriptor-normalization tests**

Cover trimmed IDs, blank/non-string IDs being discarded, exact-ID deduplication, identical evidence retention, and conflicting evidence removal independent of input order.

```ts
expect(
  normalizeModelDescriptors([
    { id: " model-a ", vendorEvidence: publisher("Example Lab") },
    { id: "model-a", vendorEvidence: publisher("Other Lab") },
  ]),
).toEqual([{ id: "model-a" }])

expect(normalizeModelDescriptors(input)).toEqual(
  normalizeModelDescriptors([...input].reverse()),
)
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```bash
pnpm exec vitest run tests/services/models/modelDescriptor.test.ts
```

Expected: FAIL because `modelDescriptor.ts` and `vendorEvidence` do not exist.

- [ ] **Step 3: Implement the minimal neutral contract and normalizer**

In `modelDescriptor.ts`, validate evidence only when `kind` is one of the three constants and `name.trim()` is non-empty. Normalize `externalId` to a trimmed string when present. For duplicates, retain evidence only if every valid occurrence agrees structurally; never let array order pick a winner.

- [ ] **Step 4: Add evidence to the canonical row type without changing callers**

Add `vendorEvidence?: ModelVendorEvidence` to `ModelPricing`. Do not change
`buildModelListCatalogPricingResponse` yet; its signature and every caller
move atomically in Task 2.

- [ ] **Step 5: Run focused tests and confirm GREEN**

```bash
pnpm exec vitest run tests/services/models/modelDescriptor.test.ts
pnpm compile
```

Expected: the focused suite and compile pass; no existing catalog caller has
changed yet.

- [ ] **Step 6: Commit the contract slice**

```bash
git add src/services/models/modelDescriptor.ts src/services/modelList/pricingModel.ts tests/services/models/modelDescriptor.test.ts
pnpm run validate:staged
git commit -m "refactor(model-list): add model descriptor contract"
```

## Task 2: Migrate Catalog Capabilities And Preserve Evidence Through Fallbacks

**Files:**

- Modify: `src/services/apiAdapters/contracts/modelCatalog.ts`
- Modify: `src/services/apiAdapters/sub2api/modelCatalog.ts`
- Modify: `src/services/apiAdapters/sharedchat/modelCatalog.ts`
- Modify: `src/services/apiCredentialProfiles/modelCatalog.ts`
- Modify: `src/services/modelList/accountSources/runtimeKeyFallback.ts`
- Modify: `src/services/modelList/accountSources/sub2apiEstimates.ts`
- Modify: `src/services/modelList/pricingResponse.ts`
- Modify: `tests/services/apiAdapters/sub2api/modelCatalog.test.ts`
- Create: `tests/services/apiAdapters/sharedchat/modelCatalog.test.ts`
- Modify: `tests/services/apiCredentialProfiles/modelCatalog.test.ts`
- Modify: `tests/services/modelList/accountSources/runtimeKeyFallback.test.ts`
- Modify: `tests/services/modelList/accountSources/sub2apiEstimates.test.ts`
- Modify: `tests/services/modelList/accountSources/tokenScopedFallback.routes.test.ts`
- Modify: `tests/services/modelList/pricingResponse.test.ts`

- [ ] **Step 1: Change tests to expect descriptors rather than strings**

Assert Sub2API and SharedChat return `[{ id: "model-a" }]`, profiles assemble descriptor-backed rows, and runtime fallback forwards evidence without looking at `siteType`. Update both string-array catalog fixtures in `tokenScopedFallback.routes.test.ts` to descriptors.

- [ ] **Step 2: Add all three Sub2API evidence-regression cases**

Use a descriptor containing Publisher evidence and prove it survives:

1. successful official-rate estimation;
2. missing dashboard authentication;
3. estimate-fetch failure.

Assert price fields may differ while `vendorEvidence` remains identical.

- [ ] **Step 3: Run the catalog/fallback tests and confirm RED**

```bash
pnpm exec vitest run tests/services/apiAdapters/sub2api/modelCatalog.test.ts tests/services/apiAdapters/sharedchat/modelCatalog.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/services/modelList/pricingResponse.test.ts tests/services/modelList/accountSources/runtimeKeyFallback.test.ts tests/services/modelList/accountSources/sub2apiEstimates.test.ts tests/services/modelList/accountSources/tokenScopedFallback.routes.test.ts
```

Expected: FAIL on the old `Promise<string[]>` contract and lost evidence during row rebuilding.

- [ ] **Step 4: Migrate the capability contract and simple adapters**

```ts
export type ModelCatalogCapability = {
  fetchModels(request: ModelCatalogRequest): Promise<ModelDescriptor[]>
}

export const sub2apiModelCatalog: ModelCatalogCapability = {
  fetchModels: async (request) =>
    normalizeModelDescriptors(
      (await fetchSub2ApiRuntimeModels(request)).map((id) => ({ id })),
    ),
}
```

Apply the same `{ id }` conversion to SharedChat and credential-profile model IDs.

- [ ] **Step 5: Preserve descriptors across runtime and estimate assembly**

Use `descriptor.id` only for external price-table lookup. Merge calculated price fields onto rows created from the original descriptors; on missing auth or failure, build the response directly from those descriptors.

Change the catalog builder input atomically with these callers and copy
evidence into the canonical row:

```ts
export function buildModelListCatalogPricingResponse({
  models,
}: {
  models: readonly ModelDescriptor[]
}): PricingResponse {
  return buildCatalogRows(normalizeModelDescriptors(models))
}
```

- [ ] **Step 6: Run focused tests and the readiness route matrix**

```bash
pnpm exec vitest run tests/services/apiAdapters/sub2api/modelCatalog.test.ts tests/services/apiAdapters/sharedchat/modelCatalog.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/services/modelList/pricingResponse.test.ts tests/services/modelList/accountSources/runtimeKeyFallback.test.ts tests/services/modelList/accountSources/sub2apiEstimates.test.ts tests/services/modelList/accountSources/readiness.test.ts tests/services/modelList/accountSources/readiness.routes.test.ts tests/services/modelList/accountSources/readiness.definitions.test.ts tests/services/modelList/accountSources/tokenScopedFallback.routes.test.ts
pnpm compile
```

Expected: all pass; readiness continues selecting existing pricing/catalog routes.

- [ ] **Step 7: Commit the catalog migration**

```bash
git add src/services/apiAdapters/contracts/modelCatalog.ts src/services/apiAdapters/sub2api/modelCatalog.ts src/services/apiAdapters/sharedchat/modelCatalog.ts src/services/apiCredentialProfiles/modelCatalog.ts src/services/modelList/pricingResponse.ts src/services/modelList/accountSources/runtimeKeyFallback.ts src/services/modelList/accountSources/sub2apiEstimates.ts tests/services/apiAdapters/sub2api/modelCatalog.test.ts tests/services/apiAdapters/sharedchat/modelCatalog.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/services/modelList/pricingResponse.test.ts tests/services/modelList/accountSources/runtimeKeyFallback.test.ts tests/services/modelList/accountSources/sub2apiEstimates.test.ts tests/services/modelList/accountSources/tokenScopedFallback.routes.test.ts
pnpm run validate:staged
git commit -m "refactor(model-list): migrate catalogs to descriptors"
```

## Task 3: Version The Pricing Cache For Vendor Evidence

**Files:**

- Modify: `src/services/models/modelPricingCache.ts`
- Modify: `tests/services/modelPricingCache.test.ts`

- [ ] **Step 1: Write failing cache-version tests**

Prove that v2 round-trips row evidence, evidence-free v2 rows remain valid, manually seeded `modelPricing_cache_v1` data is ignored, and all-account cache entries keep each account row's independent evidence.

- [ ] **Step 2: Run the cache suite and confirm RED**

```bash
pnpm exec vitest run tests/services/modelPricingCache.test.ts
```

Expected: FAIL because the key is still `modelPricing_cache_v1`.

- [ ] **Step 3: Bump only the cache schema key**

Set the persisted key to `modelPricing_cache_v2`. Preserve the existing ten-minute TTL, account-key construction, serialization, and invalidation behavior. Do not migrate or read v1 entries.

- [ ] **Step 4: Run the cache suite and confirm GREEN**

```bash
pnpm exec vitest run tests/services/modelPricingCache.test.ts
```

- [ ] **Step 5: Commit the cache slice**

```bash
git add src/services/models/modelPricingCache.ts tests/services/modelPricingCache.test.ts
pnpm run validate:staged
git commit -m "refactor(model-list): version vendor evidence cache"
```

## Task 4: Normalize Backend-Native Vendor Evidence At Adapter Boundaries

**Files:**

- Create: `src/services/apiAdapters/newApi/modelPricingDto.ts`
- Modify: `src/services/apiAdapters/newApi/modelPricing.ts`
- Modify: `src/services/apiAdapters/aihubmix/modelPricing.ts`
- Modify: `src/services/apiService/newApiFamily/default/modelPricing.ts`
- Modify: `src/services/apiService/oneHub/transform.ts`
- Modify: `src/services/apiService/aihubmix/index.ts`
- Create: `tests/services/apiAdapters/newApi/modelPricing.test.ts`
- Modify: `tests/services/apiAdapters/modelPricing.test.ts`
- Modify: `tests/services/apiService/newApiFamily/modelPricing.test.ts`
- Modify: `tests/utils/one-hub-transform.test.ts`
- Modify: `tests/services/apiService/aihubmix/index.test.ts`

- [ ] **Step 1: Add failing New API adapter tests**

At the pinned upstream commit, `vendors` is an array of
`{ id: number, name: string, description?: string, icon?: string }` and each
pricing row carries an integer `vendor_id`. Cover a valid response-level
registry joined through row `vendor_id`, plus missing registry, non-array or
malformed entries, duplicate IDs, unknown IDs, and legacy payloads. A valid
join must yield:

```ts
vendorEvidence: {
  kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
  name: "Example Publisher",
  externalId: "1",
}
```

Malformed or unmatched fields must not fail otherwise valid pricing. Keep the
parameterized adapter test proving both OneHub and DoneHub overrides bypass
the New API registry normalizer.

- [ ] **Step 2: Add failing OneHub/DoneHub and AIHubMix tests**

Assert OneHub transforms non-empty `owned_by` only into RoutingProvider evidence. For AIHubMix assert:

- non-empty `developer_name`, then `developer`, creates Publisher evidence;
- the associated `developer_id` may be its `externalId`;
- `owner_by` alone creates RoutingProvider evidence;
- standalone numeric or string `developer_id` creates no evidence;
- `developer_id` never attaches to the RoutingProvider fallback.

- [ ] **Step 3: Run adapter tests and confirm RED**

```bash
pnpm exec vitest run tests/services/apiAdapters/newApi/modelPricing.test.ts tests/services/apiAdapters/modelPricing.test.ts tests/services/apiService/newApiFamily/modelPricing.test.ts tests/utils/one-hub-transform.test.ts tests/services/apiService/aihubmix/index.test.ts
```

- [ ] **Step 4: Normalize New API default pricing without contaminating overrides**

Change `default/modelPricing.ts` from `fetchApi<PricingResponse>` to
`fetchApi<unknown>`; the legacy transport module must not import an adapter DTO
or claim the wire response is already canonical. Keep the native DTO type and
normalizer in `apiAdapters/newApi/modelPricingDto.ts`. The normalizer first
requires an object with the existing canonical response fields and a `data`
array, then treats `data[].vendor_id` and top-level `vendors` as optional native
extensions. It accepts only an array registry, finite integer IDs, and
non-empty string names, converts a matched ID to `externalId` with
`String(id)`, strips `vendor_id`/`vendors` from the returned product contract,
and treats duplicate IDs as ambiguous rather than choosing by order. Add one
test that a fundamentally invalid base response is rejected at this adapter
boundary.

Structure `createNewApiModelPricing` as two explicit paths: default New API
fetches the native DTO then normalizes it; OneHub/DoneHub call their existing
canonical override directly. Do not merge native and canonical functions into
one falsely shared implementation type.

Add a concise source comment beside the join citing pinned New API
`model/pricing.go` for row/vendor types and `controller/pricing.go` for the
top-level `vendors` response field.

- [ ] **Step 5: Normalize OneHub and AIHubMix semantic evidence**

Convert OneHub `owned_by` at its existing transform boundary. In AIHubMix, construct evidence from the original catalog item before the legacy fields collapse into `owner_by`. Keep `owner_by` for compatibility if existing consumers still read it, but do not use it as the new publisher fact.

Add concise source comments recording the upstream field semantics relied upon.

- [ ] **Step 6: Run focused adapter tests and generic pricing-contract tests**

```bash
pnpm exec vitest run tests/services/apiAdapters/newApi/modelPricing.test.ts tests/services/apiAdapters/modelPricing.test.ts tests/services/apiService/newApiFamily/modelPricing.test.ts tests/utils/one-hub-transform.test.ts tests/services/apiService/aihubmix/index.test.ts tests/services/modelList/pricingResponse.test.ts
pnpm compile
```

Expected: all pass; raw `vendors` and `vendor_id` never appear in `PricingResponse`.

- [ ] **Step 7: Commit adapter normalization**

```bash
git add src/services/apiAdapters/newApi/modelPricingDto.ts src/services/apiAdapters/newApi/modelPricing.ts src/services/apiAdapters/aihubmix/modelPricing.ts src/services/apiService/newApiFamily/default/modelPricing.ts src/services/apiService/oneHub/transform.ts src/services/apiService/aihubmix/index.ts tests/services/apiAdapters/newApi/modelPricing.test.ts tests/services/apiAdapters/modelPricing.test.ts tests/services/apiService/newApiFamily/modelPricing.test.ts tests/utils/one-hub-transform.test.ts tests/services/apiService/aihubmix/index.test.ts
pnpm run validate:staged
git commit -m "feat(model-list): normalize adapter vendor evidence"
```

## Task 5: Extract The Shared Metadata Identity Index

**Files:**

- Create: `src/services/models/modelMetadata/modelIdentityIndex.ts`
- Create: `tests/services/modelMetadata/modelIdentityIndex.test.ts`
- Modify: `src/services/models/modelMetadata/types.ts`
- Modify: `src/services/models/modelMetadata/ModelMetadataService.ts`
- Modify: `tests/services/modelMetadata/ModelMetadataService.test.ts`
- Modify: `src/features/ModelList/modelCapabilityFilters.ts`
- Modify: `tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`

- [ ] **Step 1: Define lookup outcomes in tests**

Use a discriminated result, not nullable first-match behavior:

```ts
type ModelIdentityLookupResult =
  | { state: "resolved"; match: "exact" | "normalized-alias"; metadata: ModelMetadata }
  | { state: "ambiguous" }
  | { state: "unmatched" }
```

Test exact full IDs, models.dev provider-qualified IDs, bare IDs, names, separator/date normalization, duplicate bare IDs/names, and ambiguous token aliases.

- [ ] **Step 2: Add explicit family and namespace negative tests**

Add `family?: string` to normalized metadata, then prove `o`, `Hy`, `north`, `auto`, `command`, and `v0` never become standalone match rules. Prove `openrouter/model-a` and `azure/model-a` do not make the first path segment a publisher unless the complete ID exactly exists in metadata.

Keep the legacy vendor-rule API temporarily in this task because
`modelNormalization.ts` still consumes it. Task 7 removes that API atomically
with the curated resolver replacement, so this intermediate commit compiles.

- [ ] **Step 3: Add redirect-strict lookup tests**

Expose an API that receives the raw ID. If date removal changes the input, allow exact raw-ID resolution only. Undated inputs may use the conservative normalized alias path.

- [ ] **Step 4: Run identity and current metadata tests and confirm RED**

```bash
pnpm exec vitest run tests/services/modelMetadata/modelIdentityIndex.test.ts tests/services/modelMetadata/ModelMetadataService.test.ts tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts
```

- [ ] **Step 5: Implement the pure index and delegate from the service**

The index owns map construction, normalization, and ambiguity. `ModelMetadataService` continues to own download, in-flight initialization, fallback data, freshness, logging, and defensive copies.

Use named consumer functions instead of a boolean strictness flag:

```ts
resolveModelIdentity(index, displayedId)
resolveRedirectModelIdentity(index, rawModelId)
```

- [ ] **Step 6: Remove the feature-local duplicate index**

Keep capability policy in `modelCapabilityFilters.ts`, but import the shared index and accept only `resolved` results. Move its ambiguity assertions into `modelIdentityIndex.test.ts`; retain hook-level behavior coverage.

- [ ] **Step 7: Run focused tests and confirm GREEN**

Run the command from Step 4, then run `pnpm compile`. Expected: all pass,
including existing cross-version safeguards.

- [ ] **Step 8: Commit the shared identity index**

```bash
git add src/services/models/modelMetadata/modelIdentityIndex.ts src/services/models/modelMetadata/types.ts src/services/models/modelMetadata/ModelMetadataService.ts src/features/ModelList/modelCapabilityFilters.ts tests/services/modelMetadata/modelIdentityIndex.test.ts tests/services/modelMetadata/ModelMetadataService.test.ts tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts
pnpm run validate:staged
git commit -m "refactor(models): share metadata identity matching"
```

## Task 6: Preserve Redirect And Sync Version Protections

**Files:**

- Modify: `src/services/models/modelRedirect/ModelRedirectService.ts`
- Modify: `tests/services/modelRedirect/ModelRedirectService.test.ts`
- Modify: `tests/services/modelRedirect/modelNormalization.test.ts`
- Modify: `tests/services/modelSync/scheduler.modelRedirectPrune.test.ts`

- [ ] **Step 1: Add the direct explicit-date regression**

Call `generateModelMappingForChannel(...)` with two model IDs that differ only by explicit date and assert no redirect is generated:

```ts
expect(
  ModelRedirectService.generateModelMappingForChannel(
    ["model-a-2025-01-01"],
    ["model-a-2025-02-02"],
  ),
).toEqual({})
```

- [ ] **Step 2: Add the scheduler-path regression**

Exercise the existing sync route with the same mismatch. In
`scheduler.modelRedirectPrune.test.ts`, capture the real static method before
the suite replaces it, then use `vi.fn(realGenerateModelMappingForChannel)` so
the scheduler calls production matching logic. Keep the apply/network boundary
mocked and assert it receives `{}` as the generated mapping; do not assert that
the scheduler skips its normal apply/prune orchestration entirely.

- [ ] **Step 3: Run redirect/sync suites before changing production code**

```bash
pnpm exec vitest run tests/services/modelRedirect/ModelRedirectService.test.ts tests/services/modelRedirect/modelNormalization.test.ts tests/services/modelSync/scheduler.modelRedirectPrune.test.ts
```

Expected: the new assertions either expose raw-ID loss (RED) or document an already preserved behavior (GREEN). Do not force a production edit if the regression is already covered by the shared index integration.

- [ ] **Step 4: Make dated raw IDs ineligible for alias mapping**

Ensure `generateModelMappingForChannel` evaluates every raw ID before
`renameModel`, `extractActualModel`, or date removal:

- a dated actual model is kept in the exact-match set but excluded from the
  normalized and version-key candidate maps;
- a dated standard model that has no exact raw match is skipped immediately;
- `resolveRedirectModelIdentity` returning unmatched for a dated raw ID is a
  terminal non-match, never permission to fall through to legacy alias logic;
- undated IDs may continue through conservative identity/alias matching.

Retain the existing version-token equality guard as a separate final check.
Add a small raw-date predicate based on `removeDateSuffix(raw) !== raw` and
test both compact and dashed date formats before any destructive
normalization.

- [ ] **Step 5: Run the focused suites and confirm GREEN**

Run the command from Step 3.

- [ ] **Step 6: Commit the compatibility slice**

```bash
git add src/services/models/modelRedirect/ModelRedirectService.ts tests/services/modelRedirect/ModelRedirectService.test.ts tests/services/modelRedirect/modelNormalization.test.ts tests/services/modelSync/scheduler.modelRedirectPrune.test.ts
pnpm run validate:staged
git commit -m "fix(model-sync): preserve dated model identity"
```

If `ModelRedirectService.ts` and `modelNormalization.test.ts` are unchanged, omit them from `git add`; keep the commit test-only.

## Task 7: Implement The Pure Vendor Resolver And Deterministic Aggregation

**Files:**

- Create: `src/services/models/modelVendor.ts`
- Create: `tests/services/models/modelVendor.test.ts`
- Modify: `src/services/models/modelMetadata/types.ts`
- Modify: `src/services/models/modelMetadata/index.ts`
- Modify: `src/services/models/modelMetadata/ModelMetadataService.ts`
- Modify: `src/services/models/modelRedirect/modelNormalization.ts`
- Modify: `src/services/models/utils/modelProviders.ts`
- Modify: `tests/services/modelMetadata/ModelMetadataService.test.ts`
- Modify: `tests/services/modelRedirect/modelNormalization.test.ts`
- Modify: `tests/utils/modelProviders.test.ts`
- Modify: `tests/features/ModelList/batchVerification.test.ts`
- Modify: `tests/components/VerifyApiDialog.test.tsx`
- Modify: `tests/entrypoints/options/pages/ApiCredentialProfiles/VerifyApiCredentialProfileDialog.test.tsx`
- Modify: `tests/features/ModelList/components/BatchVerifyModelsDialog.test.tsx`

- [ ] **Step 1: Write precedence and ambiguity tests**

Table-drive the required order: Publisher evidence; resolved metadata identity;
known DeploymentCategory alias; curated rule; recognized RoutingProvider
alias; Unknown. Cover exact and unambiguous normalized-alias metadata as
distinct `identityMatch` values at the same precedence, and prove ambiguous
identity never supplies vendor evidence. Assert arbitrary deployment labels
and gateway routing labels do not create publisher candidates.

- [ ] **Step 2: Write curated rule and negative-boundary tests**

Cover OpenAI, Anthropic, Google, Meta/Llama, Alibaba/Qwen, xAI/Grok, DeepSeek, Mistral, Moonshot/Kimi, Zhipu/GLM, MiniMax, Cohere, Tencent/Hunyuan, Baidu/ERNIE, Baichuan, Yi, Doubao, NVIDIA/Nemotron, Xiaomi/MiMo, StepFun, and Perplexity/Sonar.

Use stable internal known IDs and publisher labels: `openai`/OpenAI,
`anthropic`/Anthropic, `google`/Google, `meta`/Meta,
`alibaba`/Alibaba, `xai`/xAI, `deepseek`/DeepSeek,
`mistral`/Mistral, `moonshot`/Moonshot AI, `zhipu`/Zhipu AI,
`minimax`/MiniMax, `cohere`/Cohere, `tencent`/Tencent,
`baidu`/Baidu, `baichuan`/Baichuan, `01-ai`/01.AI,
`bytedance`/ByteDance, `nvidia`/NVIDIA, `xiaomi`/Xiaomi,
`stepfun`/StepFun, and `perplexity`/Perplexity. Map provider/deployment
aliases such as DeepMind to Google, Qwen/Tongyi to Alibaba, Llama to Meta,
Grok to xAI, and Doubao to ByteDance before constructing custom keys.

Include negatives proving names merely containing `yi`, `o2`, or `sonnet` fragments do not match. Remove Azure and Ollama from publisher taxonomy.

- [ ] **Step 3: Write custom-key and aggregation matrix tests**

Assert NFKC + trim + whitespace collapse + case folding, without punctuation collapse. Cover:

- custom labels `all` and `unknown` remaining `custom:*` keys;
- same response-local external ID with different labels staying distinct;
- case/whitespace variants merging;
- punctuation-distinct labels staying distinct;
- known aliases merging into a curated key such as `known:openai`;
- canonical custom label selected by locale-independent code-point order;
- tie across vendors becoming Unknown, never first-match-wins.

Build custom keys exactly from the locale-independent normalized string:

```ts
const normalizeCustomVendorName = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase()

const buildCustomVendorKey = (normalizedName: string) =>
  `custom:${encodeURIComponent(normalizedName)}` as const
```

Choose the canonical label with direct code-point comparison (`a < b`) rather
than `localeCompare`, so browser locale cannot change aggregation.

- [ ] **Step 4: Run resolver tests and confirm RED**

```bash
pnpm exec vitest run tests/services/models/modelVendor.test.ts tests/services/modelMetadata/ModelMetadataService.test.ts tests/services/modelRedirect/modelNormalization.test.ts tests/utils/modelProviders.test.ts tests/features/ModelList/batchVerification.test.ts tests/components/VerifyApiDialog.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/VerifyApiCredentialProfileDialog.test.tsx tests/features/ModelList/components/BatchVerifyModelsDialog.test.tsx
```

- [ ] **Step 5: Implement the domain-pure resolver**

Keep React, icons, colors, account data, site types, and transport DTOs out of
`modelVendor.ts`. Accept canonical `ModelDescriptor`/pricing evidence plus the
complete `ModelIdentityLookupResult`; do not reduce it to an optional metadata
record before policy runs. Treat metadata `family` only as a property of a
resolved identity result; do not build regexes from family vocabulary.

- [ ] **Step 6: Preserve the legacy protocol helper as a compatibility wrapper**

Keep `identifyProvider(modelId)` or an equivalently narrow compatibility helper for existing Claude/Gemini verification defaults. It may delegate to curated family recognition, but it must not infer protocol from `ResolvedModelVendor`.

Now that the curated resolver exists, atomically remove the legacy
`VendorRule` type/export, generated regex state, `buildVendorRules`,
`findVendorByPattern`, and `getVendorRules` from `ModelMetadataService`.
Replace `modelNormalization.ts`'s `includeVendor` fallback with the curated
known-vendor rule result; it must not regenerate regexes from downloaded model
IDs or metadata families. Replace the old vendor-rule defensive-copy test with
resolver/index coverage.

Do not remove `ProviderType`, legacy filter/list exports, or
`getProviderConfig` from `modelProviders.ts` in this task: current Model List
consumers still require them. Their staged retirement happens in Tasks 8 and
9, while `identifyProvider` remains the protocol compatibility export.

Add explicit protocol regressions:

- account single-model AUTO still initializes Claude and Gemini as before;
- batch AUTO keeps its existing Claude/Gemini defaults;
- `VerifyApiCredentialProfileDialog` uses the saved profile `apiType` even when
  the model name/vendor suggests another protocol;
- `BatchVerifyModelsDialog` keeps profile protocol selection independent of
  `resolvedVendor`.

- [ ] **Step 7: Run resolver and protocol gates and confirm GREEN**

Run the command from Step 4, then run `pnpm compile`. Explicitly confirm
profile `apiType`, single-model AUTO, and batch AUTO assertions remain
unchanged.

- [ ] **Step 8: Commit resolver policy**

```bash
git add src/services/models/modelVendor.ts src/services/models/modelMetadata/types.ts src/services/models/modelMetadata/index.ts src/services/models/modelMetadata/ModelMetadataService.ts src/services/models/modelRedirect/modelNormalization.ts src/services/models/utils/modelProviders.ts tests/services/models/modelVendor.test.ts tests/services/modelMetadata/ModelMetadataService.test.ts tests/services/modelRedirect/modelNormalization.test.ts tests/utils/modelProviders.test.ts tests/features/ModelList/batchVerification.test.ts tests/components/VerifyApiDialog.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/VerifyApiCredentialProfileDialog.test.tsx tests/features/ModelList/components/BatchVerifyModelsDialog.test.tsx
pnpm run validate:staged
git commit -m "feat(model-list): resolve model publishers"
```

## Task 8: Resolve Vendors Once In The Model List Hook

**Files:**

- Modify: `src/features/ModelList/hooks/useFilteredModels.ts`
- Modify: `src/features/ModelList/hooks/useModelListState.ts`
- Modify: `src/features/ModelList/ModelList.tsx`
- Modify: `src/features/ModelList/components/ProviderTabs.tsx`
- Modify: `src/services/models/utils/modelProviders.ts`
- Modify: `tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts`
- Modify: `tests/entrypoints/options/pages/ModelList/ModelListPageFlows.test.tsx`
- Modify: `tests/entrypoints/options/pages/ModelList/ProviderTabs.test.tsx`
- Modify: `tests/entrypoints/options/pages/ModelList/ModelListModelKeyFlow.test.tsx`
- Modify: `tests/entrypoints/options/pages/ModelList/ModelList.emptyStateActions.test.tsx`
- Modify: `tests/utils/modelProviders.test.ts`
- Modify: `src/locales/{en,es-419,ja,vi,zh-CN,zh-TW}/modelList.json`

- [ ] **Step 1: Add failing hook tests for dynamic vendor data**

Cover direct-pricing and catalog-only rows, Publisher evidence winning when metadata arrives later, custom vendors, unresolved rows, vendor counts after account, group, search, capability, and billing filters, and the post-base-filter unresolved count.

- [ ] **Step 2: Add effective-selection and ordering tests**

Select a dynamic vendor, remove it through another filter, and assert in the same render result:

- effective selected value is `filter:all`;
- visible rows use All semantics;
- stored selection is repairable by the caller;
- the hook does not emit product analytics;
- tabs sort by count descending and then vendor key by code-point order.

Also select `filter:unclassified` and assert it returns only unresolved rows,
remains separate from the vendor catalog, and clamps to All when base filters
reduce the unresolved count to zero.

- [ ] **Step 3: Run the hook suite and confirm RED**

```bash
pnpm exec vitest run tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/entrypoints/options/pages/ModelList/ModelListPageFlows.test.tsx tests/entrypoints/options/pages/ModelList/ProviderTabs.test.tsx tests/entrypoints/options/pages/ModelList/ModelListModelKeyFlow.test.tsx tests/entrypoints/options/pages/ModelList/ModelList.emptyStateActions.test.tsx tests/utils/modelProviders.test.ts
```

- [ ] **Step 4: Attach one resolved vendor to every raw/calculated row**

Extend `CalculatedModelItem` with `resolvedVendor`. Resolve after metadata lookup and before filters. Aggregate candidates across the current dataset, remap same-key rows to the canonical dataset label, and derive dynamic vendor tabs/counts plus `unclassifiedVendorCount` from the attached post-base-filter results. Unknown rows never enter the vendor catalog.

- [ ] **Step 5: Return effective state separately from stored state**

The hook must return the clamped `effectiveSelectedVendor`. A known/custom key
is available only while present in the catalog; `filter:unclassified` is
available only while `unclassifiedVendorCount > 0`. `ModelList.tsx`
synchronizes stale stored state to `filter:all` in an effect, without calling
the user-action analytics path. User clicks in `ProviderTabs` retain the
existing privacy-safe filter telemetry.

In `ModelListPageFlows.test.tsx`, render the orchestration with a selected
vendor, then make that vendor disappear through metadata/filter data. Prove
the same render uses All-row semantics, the effect invokes the stored-state
setter with `filter:all`, and the product-analytics action mock is not called.

- [ ] **Step 6: Remove static `getAllProviders()` dependence from Model List**

Use only the dataset vendor catalog for vendor identities. Add a distinct
UI-only Unclassified tab with `filter:unclassified` only when the unresolved
count is greater than zero; keep All and Unclassified as separate sentinels
with separate tab panels. Do not add `siteType` checks or a vendor
capability/profile flag.

Migrate `ProviderTabs` in this same task to namespaced vendor keys and the
dynamic catalog prop contract so Task 8 compiles independently. Until Task 9
adds final presentation, render the existing local generic CPU icon for every
dynamic vendor tab and a distinct help/question mark for Unclassified; do not
call `getProviderConfig` with a vendor label. Add localized Unclassified label
and explanatory tooltip copy in every supported app locale.

After the hook, state, Model List, and tab props no longer consume them, remove
`MODEL_PROVIDER_FILTER_VALUES`, `ModelProviderFilterValue`, exported
`ProviderType`, `getAllProviders`, and `filterModelsByProvider`, together with
their obsolete tests and Model List test mocks. Keep `getProviderConfig` and
its internal config types for row presentation until Task 9.

- [ ] **Step 7: Run hook tests and confirm GREEN**

```bash
pnpm exec vitest run tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/entrypoints/options/pages/ModelList/ModelListPageFlows.test.tsx tests/entrypoints/options/pages/ModelList/ProviderTabs.test.tsx tests/entrypoints/options/pages/ModelList/ModelListModelKeyFlow.test.tsx tests/entrypoints/options/pages/ModelList/ModelList.emptyStateActions.test.tsx tests/utils/modelProviders.test.ts
pnpm compile
```

- [ ] **Step 8: Commit Model List orchestration**

```bash
git add src/features/ModelList/hooks/useFilteredModels.ts src/features/ModelList/hooks/useModelListState.ts src/features/ModelList/ModelList.tsx src/features/ModelList/components/ProviderTabs.tsx src/services/models/utils/modelProviders.ts src/locales/en/modelList.json src/locales/es-419/modelList.json src/locales/ja/modelList.json src/locales/vi/modelList.json src/locales/zh-CN/modelList.json src/locales/zh-TW/modelList.json tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/entrypoints/options/pages/ModelList/ModelListPageFlows.test.tsx tests/entrypoints/options/pages/ModelList/ProviderTabs.test.tsx tests/entrypoints/options/pages/ModelList/ModelListModelKeyFlow.test.tsx tests/entrypoints/options/pages/ModelList/ModelList.emptyStateActions.test.tsx tests/utils/modelProviders.test.ts
pnpm run validate:staged
git commit -m "feat(model-list): derive dynamic vendor filters"
```

## Task 9: Add Feature-Local Presentation And Complete The Prop Chain

**Files:**

- Create: `src/features/ModelList/modelVendorPresentation.ts`
- Create: `tests/features/ModelList/modelVendorPresentation.test.ts`
- Create: `src/features/ModelList/components/ModelVendorMark.tsx`
- Create: `tests/features/ModelList/components/ModelVendorMark.test.tsx`
- Create: `src/components/icons/InitialsIcon.tsx`
- Modify: `src/services/models/utils/modelProviders.ts`
- Modify: `src/features/ModelList/components/ProviderTabs.tsx`
- Modify: `src/features/ModelList/components/ModelDisplay.tsx`
- Modify: `src/features/ModelList/components/ModelItem/index.tsx`
- Modify: `src/features/ModelList/components/ModelItem/ModelItemHeader.tsx`
- Modify: `tests/entrypoints/options/pages/ModelList/ProviderTabs.test.tsx`
- Modify: `tests/features/ModelList/components/ModelDisplay.test.tsx`
- Modify: `tests/features/ModelList/components/ModelItem.test.tsx`
- Modify: `tests/features/ModelList/components/ModelItemHeader.test.tsx`
- Modify: `tests/utils/modelProviders.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add failing presentation tests**

Assert known publishers select library-owned Color/Mono marks, known vendors
without a library asset select explicit initials, custom vendors select the
generic CPU mark, and unresolved rows select the help/question mark. Never
load an upstream icon URL.

- [ ] **Step 2: Add failing tab and row integration tests**

Verify dynamic labels/counts, stable order, a selected custom vendor, the
conditional Unclassified tab, distinct All/Unclassified icons, and consistent
known-vendor presentation in the tab and row header. Cover compact and neutral
badge variants without coupling tests to Tailwind implementation details.

- [ ] **Step 3: Add an explicit `resolvedVendor` prop-chain test**

Pass a calculated row through `ModelDisplay -> ModelItem -> ModelItemHeader` and assert the header uses that resolved vendor rather than re-running name regexes.

- [ ] **Step 4: Run component tests and confirm RED**

```bash
pnpm exec vitest run tests/features/ModelList/modelVendorPresentation.test.ts tests/features/ModelList/components/ModelVendorMark.test.tsx tests/entrypoints/options/pages/ModelList/ProviderTabs.test.tsx tests/features/ModelList/components/ModelDisplay.test.tsx tests/features/ModelList/components/ModelItem.test.tsx tests/features/ModelList/components/ModelItemHeader.test.tsx
```

- [ ] **Step 5: Implement the presentation registry and prop chain**

Upgrade `@lobehub/icons` from 2.38 to 5.13. Import each required
`Color`/`Mono` component directly from
`@lobehub/icons/es/<Brand>/components/...` so production tree-shaking does not
retain compound Avatar/theme modules. The presentation registry stores only
semantic `brand | initials | generic | unknown` data.

Implement `ModelVendorMark` as the single renderer for compact tab marks and
row badges. The icon library owns brand geometry and color. Project code owns
only one neutral, theme-aware badge surface, the reusable `InitialsIcon`, the
generic CPU fallback, and the unresolved help/question fallback. Do not store
brand Tailwind colors/backgrounds or render remote icon URLs.

Pass `resolvedVendor` unchanged through all components. `ModelItemHeader` must stop calling `getProviderConfig(model.model_name)` for vendor presentation.

After both tabs and rows use `modelVendorPresentation.ts`, remove
`PROVIDER_CONFIGS`, `getProviderConfig`, presentation icons/styles, and their
tests from `modelProviders.ts`. Leave only the narrow `identifyProvider`
compatibility helper and the minimal return type needed to distinguish Claude,
Gemini, and the existing OpenAI-compatible fallback in verification flows.
Update its tests around protocol-default behavior rather than the retired
vendor/filter/presentation taxonomy.

- [ ] **Step 6: Keep automatic repair outside click telemetry**

`ProviderTabs` should emit the existing analytics action only from `onValueChange`. It receives an already-effective value and does not invent its own stale-state fallback policy.

- [ ] **Step 7: Run component and hook suites and confirm GREEN**

```bash
pnpm exec vitest run tests/features/ModelList/modelVendorPresentation.test.ts tests/features/ModelList/components/ModelVendorMark.test.tsx tests/entrypoints/options/pages/ModelList/ProviderTabs.test.tsx tests/features/ModelList/components/ModelDisplay.test.tsx tests/features/ModelList/components/ModelItem.test.tsx tests/features/ModelList/components/ModelItemHeader.test.tsx tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/utils/modelProviders.test.ts
pnpm compile
```

- [ ] **Step 8: Commit presentation integration**

```bash
git add package.json pnpm-lock.yaml src/components/icons/InitialsIcon.tsx src/features/ModelList/modelVendorPresentation.ts src/features/ModelList/components/ModelVendorMark.tsx src/services/models/utils/modelProviders.ts src/features/ModelList/components/ProviderTabs.tsx src/features/ModelList/components/ModelDisplay.tsx src/features/ModelList/components/ModelItem/index.tsx src/features/ModelList/components/ModelItem/ModelItemHeader.tsx tests/features/ModelList/modelVendorPresentation.test.ts tests/features/ModelList/components/ModelVendorMark.test.tsx tests/entrypoints/options/pages/ModelList/ProviderTabs.test.tsx tests/features/ModelList/components/ModelDisplay.test.tsx tests/features/ModelList/components/ModelItem.test.tsx tests/features/ModelList/components/ModelItemHeader.test.tsx tests/utils/modelProviders.test.ts
pnpm run validate:staged
git commit -m "feat(model-list): render resolved vendors"
```

## Task 10: Run Cross-Site, Protocol, And Maintainability Gates

**Files:**

- Modify only if a gate exposes a task-caused regression.

- [ ] **Step 1: Run all focused domain and adapter suites together**

```bash
pnpm exec vitest run tests/services/models/modelDescriptor.test.ts tests/services/modelMetadata/modelIdentityIndex.test.ts tests/services/modelMetadata/ModelMetadataService.test.ts tests/services/models/modelVendor.test.ts tests/utils/modelProviders.test.ts tests/services/apiAdapters/newApi/modelPricing.test.ts tests/services/apiAdapters/modelPricing.test.ts tests/services/apiAdapters/sub2api/modelCatalog.test.ts tests/services/apiAdapters/sharedchat/modelCatalog.test.ts tests/services/apiService/newApiFamily/modelPricing.test.ts tests/utils/one-hub-transform.test.ts tests/services/apiService/aihubmix/index.test.ts tests/services/modelList/pricingResponse.test.ts tests/services/modelPricingCache.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run readiness, fallback, profile, protocol, redirect, and sync regressions**

```bash
pnpm exec vitest run tests/services/modelList/accountSources/readiness.definitions.test.ts tests/services/modelList/accountSources/readiness.routes.test.ts tests/services/modelList/accountSources/readiness.test.ts tests/services/modelList/accountSources/runtimeKeyFallback.test.ts tests/services/modelList/accountSources/sub2apiEstimates.test.ts tests/services/modelList/accountSources/tokenScopedFallback.routes.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/components/VerifyApiDialog.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/VerifyApiCredentialProfileDialog.test.tsx tests/features/ModelList/batchVerification.test.ts tests/features/ModelList/components/BatchVerifyModelsDialog.test.tsx tests/services/modelRedirect/ModelRedirectService.test.ts tests/services/modelRedirect/modelNormalization.test.ts tests/services/modelSync/scheduler.modelRedirectPrune.test.ts
```

Expected: route ownership, profile `apiType`, Claude/Gemini AUTO defaults, dated redirect protection, and scheduler behavior remain unchanged.

- [ ] **Step 3: Run Model List hook and component suites**

```bash
pnpm exec vitest run tests/entrypoints/options/pages/ModelList/useFilteredModels.test.ts tests/entrypoints/options/pages/ModelList/ModelListPageFlows.test.tsx tests/entrypoints/options/pages/ModelList/ModelListModelKeyFlow.test.tsx tests/entrypoints/options/pages/ModelList/ModelList.emptyStateActions.test.tsx tests/entrypoints/options/pages/ModelList/ProviderTabs.test.tsx tests/features/ModelList/modelVendorPresentation.test.ts tests/features/ModelList/components/ModelVendorMark.test.tsx tests/features/ModelList/components/ModelDisplay.test.tsx tests/features/ModelList/components/ModelItem.test.tsx tests/features/ModelList/components/ModelItemHeader.test.tsx
```

- [ ] **Step 4: Run affected-file validation**

```bash
pnpm exec vitest related --run src/services/models/modelDescriptor.ts src/services/modelList/pricingModel.ts src/services/modelList/pricingResponse.ts src/services/apiAdapters/contracts/modelCatalog.ts src/services/apiAdapters/sub2api/modelCatalog.ts src/services/apiAdapters/sharedchat/modelCatalog.ts src/services/apiCredentialProfiles/modelCatalog.ts src/services/modelList/accountSources/runtimeKeyFallback.ts src/services/modelList/accountSources/sub2apiEstimates.ts src/services/models/modelPricingCache.ts src/services/apiAdapters/newApi/modelPricingDto.ts src/services/apiAdapters/newApi/modelPricing.ts src/services/apiAdapters/aihubmix/modelPricing.ts src/services/apiService/newApiFamily/default/modelPricing.ts src/services/apiService/oneHub/transform.ts src/services/apiService/aihubmix/index.ts src/services/models/modelMetadata/modelIdentityIndex.ts src/services/models/modelMetadata/types.ts src/services/models/modelMetadata/index.ts src/services/models/modelMetadata/ModelMetadataService.ts src/features/ModelList/modelCapabilityFilters.ts src/services/models/modelRedirect/ModelRedirectService.ts src/services/models/modelRedirect/modelNormalization.ts src/services/models/modelVendor.ts src/services/models/utils/modelProviders.ts src/features/ModelList/hooks/useFilteredModels.ts src/features/ModelList/hooks/useModelListState.ts src/features/ModelList/ModelList.tsx src/features/ModelList/modelVendorPresentation.ts src/features/ModelList/components/ModelVendorMark.tsx src/components/icons/InitialsIcon.tsx src/features/ModelList/components/ProviderTabs.tsx src/features/ModelList/components/ModelDisplay.tsx src/features/ModelList/components/ModelItem/index.tsx src/features/ModelList/components/ModelItem/ModelItemHeader.tsx
```

Expected: all related tests pass.

- [ ] **Step 5: Make the explicit E2E and telemetry decisions**

Record in the final handoff:

- E2E: none added because identity, adapter normalization, filter state, and rendering are deterministic service/component behavior; add Playwright only if implementation reveals a browser-only fault.
- Telemetry: reuse the existing provider-filter event for vendor and
  Unclassified selections; automatic stale-selection repair emits no
  user-action event; no new payload fields.

- [ ] **Step 6: Inspect maintainability boundaries**

Confirm by search and diff review:

```bash
rg -n "vendor_id|vendors" src/features src/services/modelList
rg -n "siteType" src/services/models/modelVendor.ts src/features/ModelList/modelVendorPresentation.ts
rg -n "@lobehub/icons|Tailwind|bgColor|color" src/services/models/modelVendor.ts
rg -n "@lobehub/icons/es/.+/components/(Color|Mono)" src/features/ModelList/modelVendorPresentation.ts
rg -n "https?://.*icon|iconUrl" src/features/ModelList src/services/models
rg -n "family.*RegExp|new RegExp.*family" src/services/models src/features/ModelList
git status --porcelain
```

Expected: native New API fields do not leak into generic product/UI modules;
the resolver has no site/UI dependencies; models.dev families are not
auto-generated regexes; brand marks use direct local ESM imports rather than
remote URLs or project-maintained brand colors; status contains no unexpected
implementation files.

Then derive and inspect the complete committed implementation range in
PowerShell:

```powershell
$firstCommit = git log --format=%H -1 --grep='^refactor(model-list): add model descriptor contract$'
if (-not $firstCommit) { throw "Task 1 implementation commit not found" }
$baseSha = git rev-parse "$firstCommit^"
git diff --check "$baseSha..HEAD"
git diff --stat "$baseSha..HEAD"
git diff --name-status "$baseSha..HEAD"
git diff "$baseSha..HEAD"
```

Expected: `$baseSha` equals the SHA recorded before Task 1; the name-status
list contains only the files authorized by this plan; the complete diff has no
unintended files, debug code, stale comments, formatting noise, or whitespace
errors. Do not replace this range review with a bare `git diff` after the work
has already been committed.

- [ ] **Step 7: Run shared TypeScript/export gates**

```bash
pnpm compile
pnpm knip
```

Expected: both exit 0. Fix task-caused type/export issues; do not expand ignore lists to hide them.

- [ ] **Step 8: Validate localized Unclassified copy**

```bash
pnpm run i18n:extract:ci
```

Expected: exit 0 with the intended Unclassified label/description synchronized
across all supported locales and no unexpected updates.

- [ ] **Step 9: Stage only task-scoped files and run the commit gate**

```bash
git status --porcelain
```

If a preceding gate created task-caused fixes, stage them with the exact
task-specific `git add` command above, then run `pnpm run validate:staged`.
If there are no final fixes, skip Steps 9 and 10 rather than treating a
no-staged-files result as validation. Preserve all unrelated staged,
unstaged, and untracked user files.

- [ ] **Step 10: Commit any final task-caused fixes**

```bash
git commit -m "test(model-list): cover vendor classification integration"
```

Skip this commit when there are no post-gate changes; do not create an empty commit.

- [ ] **Step 11: Verify production icon bundling**

```bash
pnpm build
```

Expected: direct Color/Mono imports resolve, brand presentation remains
tree-shakeable, and the Model List chunk does not retain the compound
Avatar/theme runtime merely to render vendor marks.

- [ ] **Step 12: Run the remote-handoff gate when pushing or opening a PR**

```bash
pnpm run validate:push
```

Expected: compile, knip, and configured push checks pass before any remote handoff.

## Completion Checklist

- [ ] Every pricing/catalog source can carry the same optional row-level evidence contract.
- [ ] New API native registries remain private to its adapter normalization.
- [ ] AIHubMix Publisher evidence and OneHub/DoneHub RoutingProvider evidence remain semantically distinct.
- [ ] Catalog-only sources preserve `{ id }` behavior and evidence through fallback/estimate rebuilding.
- [ ] Metadata lookup has one ambiguity-aware service implementation.
- [ ] Explicitly dated model IDs never redirect across dates.
- [ ] Vendor resolution is pure, ordered, deterministic, and boundary-safe for non-standard names.
- [ ] Dynamic tabs, counts, filtering, and row icons consume one attached resolved result.
- [ ] Unresolved rows remain an `unknown` row state and are selected only by the UI-only `filter:unclassified` sentinel.
- [ ] The Unclassified tab appears only when its post-base-filter count is greater than zero and clamps to All when unavailable.
- [ ] All and Unclassified have distinct filter semantics and icons.
- [ ] Known brand marks use library-owned Color/Mono assets via direct ESM imports; project code owns only the neutral badge surface and local fallbacks.
- [ ] Known vendors without a library asset use initials, custom vendors use the generic CPU mark, and unresolved rows use the help/question mark.
- [ ] No remote icon URL is fetched or rendered.
- [ ] Verification protocol still comes from its existing protocol sources, never vendor identity.
- [ ] Cache v2 preserves evidence and ignores v1.
- [ ] No new shallow capability/profile flag, UI `siteType` branch, remote icon, or family-generated regex was added.
- [ ] Focused tests, related tests, compile, knip, production build, locale extraction, and staged validation pass.
