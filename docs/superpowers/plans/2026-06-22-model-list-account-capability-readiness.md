# Model List Account Capability Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Model List account-source readiness service that centralizes direct-pricing versus token-scoped runtime-catalog routing while preserving current New API-family, AIHubMix, and Sub2API behavior.

**Architecture:** Keep backend facts in `SiteAdapter.modelPricing` and `SiteAdapter.modelCatalog`, keep source-account product policy in `accountSiteProfile.modelList`, and add `src/services/modelList/accountSources/` as the product-service seam that combines those facts into a small readiness result. Move account-token fallback orchestration and Sub2API estimate assembly out of `apiCredentialProfiles`, and keep React hooks responsible for cache keys, UI state, toasts, analytics, and rendering.

**Tech Stack:** TypeScript, React Query, WXT extension services, Vitest, Testing Library, i18next locale JSON, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-22-model-list-account-capability-readiness-design.md`

---

## File Structure

Create:

- `src/services/modelList/pricingResponse.ts`
  - Neutral helpers for normalizing model IDs and building minimal Model-List-compatible `PricingResponse` objects.
- `src/services/modelList/accountSources/readiness.ts`
  - The account-source route constants, typed unsupported reasons, and pure readiness resolver.
- `src/services/modelList/accountSources/tokenScopedFallback.ts`
  - Account-token fallback orchestration for Model List, including selected-token secret resolution and runtime-key catalog loading.
- `src/services/modelList/accountSources/index.ts`
  - Public exports for the account-source service modules.
- `src/services/modelPricing/modelPriceTable.ts`
  - Neutral LiteLLM price-table loading and normalization.
- `tests/services/modelList/pricingResponse.test.ts`
  - Direct tests for model ID normalization and minimal response assembly.
- `tests/services/modelList/accountSources/readiness.test.ts`
  - Direct tests for the readiness interface.
- `tests/services/modelList/accountSources/tokenScopedFallback.test.ts`
  - Moved account-token fallback behavior tests.
- `tests/services/modelList/accountSources/sub2apiEstimates.test.ts`
  - Moved Sub2API runtime-key estimate tests.
- `tests/services/modelPricing/modelPriceTable.test.ts`
  - Moved LiteLLM price-table tests.

Move:

- `src/services/apiCredentialProfiles/sub2apiPriceEstimation.ts` -> `src/services/modelList/accountSources/sub2apiEstimates.ts`
- `src/services/apiCredentialProfiles/modelPriceTable.ts` -> `src/services/modelPricing/modelPriceTable.ts`
- `tests/services/apiCredentialProfiles/sub2apiPriceEstimation.test.ts` -> `tests/services/modelList/accountSources/sub2apiEstimates.test.ts`
- `tests/services/apiCredentialProfiles/modelPriceTable.test.ts` -> `tests/services/modelPricing/modelPriceTable.test.ts`

Modify:

- `src/services/apiCredentialProfiles/modelCatalog.ts`
  - Keep only saved API credential profile model-ID lookup and profile-named pricing-response wrappers.
- `tests/services/apiCredentialProfiles/modelCatalog.test.ts`
  - Keep only saved API credential profile catalog behavior and wrapper compatibility coverage.
- `src/features/ModelList/hooks/useModelData.ts`
  - Route single-account and all-accounts account-source loading through readiness and generic token-scoped helper names.
- `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`
  - Preserve hook behavior coverage while asserting readiness-owned routing.
- `src/features/ModelList/components/StatusIndicator.tsx`
  - Use generic token-scoped fallback translation keys.
- `tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx`
  - Assert token-scoped copy is driven by `statusScope`, not Sub2API-named keys.
- `src/locales/zh-CN/modelList.json`
- `src/locales/zh-TW/modelList.json`
- `src/locales/en/modelList.json`
- `src/locales/ja/modelList.json`
- `src/locales/vi/modelList.json`
  - Replace `sub2apiKeyScoped*` keys with generic `tokenScopedCatalog*` keys.

Do not modify:

- `src/constants/siteType.ts`
- `src/services/apiAdapters/**` capability implementations, except imports if the compiler requires type path updates
- managed-site model sync
- telemetry event schemas or privacy allow-lists
- settings search definitions
- Playwright E2E tests
- new site-type registration

---

## Implementation Notes

This is a behavior-preserving refactor. Keep these invariants:

- Direct pricing support is resolved before `modelPricingCache.get(...)` in single-account and all-accounts paths.
- Sub2API account-level direct pricing stays unsupported.
- Token-scoped runtime catalog fallback remains product-owned and uses `SiteAdapter.modelCatalog.fetchModels(...)`.
- AIHubMix selected-token fallback can still bypass masked key reveal through account-scoped `modelPricing` when profile policy says display capabilities are profile-sourced.
- Sub2API estimate source metadata remains `MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY`.
- `apiCredentialProfiles/modelCatalog.ts` must not keep account-token fallback exports after Task 5.

Telemetry decision: reuse existing. This slice keeps current hook-level load completion events and payload shape.

Settings search decision: none. No settings UI, anchors, deep links, or settings search definitions change.

E2E decision: no new Playwright E2E by default. The risk is deterministic service routing, hook state, and component copy; Vitest and Testing Library cover those paths directly.

---

### Task 1: Add Neutral Model List Pricing Response Helpers

**Files:**

- Create: `src/services/modelList/pricingResponse.ts`
- Create: `tests/services/modelList/pricingResponse.test.ts`
- Modify: `src/services/apiCredentialProfiles/modelCatalog.ts`
- Modify: `tests/services/apiCredentialProfiles/modelCatalog.test.ts`

- [ ] **Step 1: Write failing neutral helper tests**

Create `tests/services/modelList/pricingResponse.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  buildModelListCatalogPricingResponse,
  normalizeModelListModelIds,
} from "~/services/modelList/pricingResponse"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/apiService/common/type"

describe("modelList pricingResponse", () => {
  it("normalizes, filters, and de-duplicates raw model ids", () => {
    expect(
      normalizeModelListModelIds([
        " gpt-4o ",
        "",
        "gpt-4o",
        "claude-3-haiku",
        123,
        null,
      ]),
    ).toEqual(["gpt-4o", "claude-3-haiku"])
  })

  it("builds a profile catalog response by default", () => {
    const response = buildModelListCatalogPricingResponse({
      modelIds: [" gpt-4o ", "gpt-4o", "claude-3-haiku"],
    })

    expect(response).toMatchObject({
      success: true,
      group_ratio: {},
      usable_group: {},
      model_list_source: {
        kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
        supportsPricing: false,
      },
    })
    expect(response.data).toEqual([
      expect.objectContaining({
        model_name: "gpt-4o",
        price_metadata: {
          source: MODEL_PRICE_SOURCE_KINDS.NONE,
          precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
          unavailable_reason: MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
        },
      }),
      expect.objectContaining({ model_name: "claude-3-haiku" }),
    ])
  })

  it("allows runtime catalog source metadata and unavailable reason overrides", () => {
    const response = buildModelListCatalogPricingResponse({
      modelIds: ["runtime-model"],
      unavailableReason:
        MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
      source: {
        kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
        provider: SITE_TYPES.SUB2API,
        supportsRuntimeModelList: true,
        supportsPricing: false,
      },
    })

    expect(response.model_list_source).toEqual({
      kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
      provider: SITE_TYPES.SUB2API,
      supportsRuntimeModelList: true,
      supportsPricing: false,
    })
    expect(response.data[0]).toMatchObject({
      model_name: "runtime-model",
      price_metadata: {
        source: MODEL_PRICE_SOURCE_KINDS.NONE,
        precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
        unavailable_reason:
          MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
      },
    })
  })
})
```

- [ ] **Step 2: Run the failing neutral helper test**

Run:

```powershell
pnpm vitest run tests/services/modelList/pricingResponse.test.ts
```

Expected: FAIL with an import error for `~/services/modelList/pricingResponse`.

- [ ] **Step 3: Create the neutral helper module**

Create `src/services/modelList/pricingResponse.ts`:

```ts
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type ModelPricing,
  type PricingResponse,
} from "~/services/apiService/common/type"

type BuildModelListCatalogPricingResponseParams = {
  modelIds: unknown[]
  unavailableReason?: (typeof MODEL_UNAVAILABLE_PRICE_REASONS)[keyof typeof MODEL_UNAVAILABLE_PRICE_REASONS]
  source?: PricingResponse["model_list_source"]
}

/**
 * Normalize and de-duplicate model ids returned by upstream model-list endpoints.
 */
export function normalizeModelListModelIds(modelIds: unknown[]): string[] {
  return Array.from(
    new Set(
      modelIds
        .filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
        .map((id) => id.trim()),
    ),
  )
}

/**
 * Convert a raw model id into the minimal pricing-model shape used by Model List.
 */
export function createModelListCatalogModel(
  modelId: string,
  unavailableReason: (typeof MODEL_UNAVAILABLE_PRICE_REASONS)[keyof typeof MODEL_UNAVAILABLE_PRICE_REASONS] = MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
): ModelPricing {
  return {
    model_name: modelId,
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    price_metadata: {
      source: MODEL_PRICE_SOURCE_KINDS.NONE,
      precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
      unavailable_reason: unavailableReason,
    },
    completion_ratio: 1,
    enable_groups: [],
    supported_endpoint_types: [],
  }
}

/**
 * Build a minimal Model-List-compatible response for catalog-only sources.
 */
export function buildModelListCatalogPricingResponse({
  modelIds,
  unavailableReason = MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
  source = {
    kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
    supportsPricing: false,
  },
}: BuildModelListCatalogPricingResponseParams): PricingResponse {
  return {
    data: normalizeModelListModelIds(modelIds).map((modelId) =>
      createModelListCatalogModel(modelId, unavailableReason),
    ),
    group_ratio: {},
    model_list_source: source,
    success: true,
    usable_group: {},
  }
}
```

- [ ] **Step 4: Route profile catalog wrappers through the neutral helper**

Modify `src/services/apiCredentialProfiles/modelCatalog.ts`.

Add this import:

```ts
import {
  buildModelListCatalogPricingResponse,
  normalizeModelListModelIds,
} from "~/services/modelList/pricingResponse"
```

Replace the existing `normalizeApiCredentialModelIds(...)`, `createProfileCatalogModel(...)`, and `buildApiCredentialProfilePricingResponse(...)` implementations with:

```ts
export const normalizeApiCredentialModelIds = normalizeModelListModelIds

/**
 * Build a minimal model-pricing response shim for profile-backed catalogs.
 */
export function buildApiCredentialProfilePricingResponse(
  modelIds: string[],
): PricingResponse {
  return buildModelListCatalogPricingResponse({ modelIds })
}
```

Remove now-unused imports from `modelCatalog.ts`:

```ts
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  type ModelPricing,
```

Keep `MODEL_LIST_SOURCE_KINDS` and `MODEL_UNAVAILABLE_PRICE_REASONS` for the existing Sub2API fallback until Task 5 moves that code.

- [ ] **Step 5: Keep the existing profile wrapper test in place**

In `tests/services/apiCredentialProfiles/modelCatalog.test.ts`, keep the test named:

```ts
  it("normalizes, filters, and de-duplicates raw model ids when building profile catalogs", () => {
```

The expected assertion remains:

```ts
    expect(
      normalizeApiCredentialModelIds([
        " gpt-4o ",
        "",
        "gpt-4o",
        "claude-3-haiku",
        123,
      ] as any),
    ).toEqual(["gpt-4o", "claude-3-haiku"])

    expect(
      buildApiCredentialProfilePricingResponse([
        " gpt-4o ",
        "gpt-4o",
        "claude-3-haiku",
      ]).data,
    ).toEqual([
      expect.objectContaining({ model_name: "gpt-4o" }),
      expect.objectContaining({ model_name: "claude-3-haiku" }),
    ])
```

- [ ] **Step 6: Run helper and profile catalog tests**

Run:

```powershell
pnpm vitest run tests/services/modelList/pricingResponse.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit neutral pricing response helpers**

Run:

```powershell
git add src/services/modelList/pricingResponse.ts tests/services/modelList/pricingResponse.test.ts src/services/apiCredentialProfiles/modelCatalog.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts
git commit -m "refactor(model-list): share catalog pricing response helpers"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 2: Move The Neutral Price Table Module

**Files:**

- Move: `src/services/apiCredentialProfiles/modelPriceTable.ts` -> `src/services/modelPricing/modelPriceTable.ts`
- Move: `tests/services/apiCredentialProfiles/modelPriceTable.test.ts` -> `tests/services/modelPricing/modelPriceTable.test.ts`
- Modify: `src/services/apiCredentialProfiles/modelCatalog.ts`
- Modify: `src/services/apiCredentialProfiles/sub2apiPriceEstimation.ts`
- Modify: `tests/services/modelPricing/modelPriceTable.test.ts`

- [ ] **Step 1: Move the source and test files**

Run:

```powershell
New-Item -ItemType Directory -Force src\services\modelPricing, tests\services\modelPricing
git mv src\services\apiCredentialProfiles\modelPriceTable.ts src\services\modelPricing\modelPriceTable.ts
git mv tests\services\apiCredentialProfiles\modelPriceTable.test.ts tests\services\modelPricing\modelPriceTable.test.ts
```

Expected: the two files are staged as renames and the new directories exist.

- [ ] **Step 2: Update imports to the neutral path**

In `src/services/apiCredentialProfiles/modelCatalog.ts`, replace:

```ts
import { loadModelPriceTable } from "~/services/apiCredentialProfiles/modelPriceTable"
```

with:

```ts
import { loadModelPriceTable } from "~/services/modelPricing/modelPriceTable"
```

In `src/services/apiCredentialProfiles/sub2apiPriceEstimation.ts`, replace:

```ts
import type { ModelPriceTable } from "~/services/apiCredentialProfiles/modelPriceTable"
```

with:

```ts
import type { ModelPriceTable } from "~/services/modelPricing/modelPriceTable"
```

In `tests/services/modelPricing/modelPriceTable.test.ts`, replace:

```ts
} from "~/services/apiCredentialProfiles/modelPriceTable"
```

with:

```ts
} from "~/services/modelPricing/modelPriceTable"
```

- [ ] **Step 3: Run the moved price-table test**

Run:

```powershell
pnpm vitest run tests/services/modelPricing/modelPriceTable.test.ts
```

Expected: PASS.

- [ ] **Step 4: Confirm the old price-table path is gone**

Run:

```powershell
rg -n "apiCredentialProfiles/modelPriceTable|services/apiCredentialProfiles/modelPriceTable|modelPriceTable" src/services/apiCredentialProfiles tests/services/apiCredentialProfiles
```

Expected: no matches for the old module path. The only remaining `modelPriceTable` matches in this command should be absent because the file and tests moved.

- [ ] **Step 5: Commit the price-table move**

Run:

```powershell
git add src/services/modelPricing/modelPriceTable.ts tests/services/modelPricing/modelPriceTable.test.ts src/services/apiCredentialProfiles/modelCatalog.ts src/services/apiCredentialProfiles/sub2apiPriceEstimation.ts
git commit -m "refactor(model-pricing): move price table loading out of profiles"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 3: Move Sub2API Runtime-Key Estimate Assembly

**Files:**

- Move: `src/services/apiCredentialProfiles/sub2apiPriceEstimation.ts` -> `src/services/modelList/accountSources/sub2apiEstimates.ts`
- Move: `tests/services/apiCredentialProfiles/sub2apiPriceEstimation.test.ts` -> `tests/services/modelList/accountSources/sub2apiEstimates.test.ts`
- Modify: `src/services/apiCredentialProfiles/modelCatalog.ts`
- Modify: `tests/services/modelList/accountSources/sub2apiEstimates.test.ts`

- [ ] **Step 1: Move the Sub2API estimate source and test files**

Run:

```powershell
New-Item -ItemType Directory -Force src\services\modelList\accountSources, tests\services\modelList\accountSources
git mv src\services\apiCredentialProfiles\sub2apiPriceEstimation.ts src\services\modelList\accountSources\sub2apiEstimates.ts
git mv tests\services\apiCredentialProfiles\sub2apiPriceEstimation.test.ts tests\services\modelList\accountSources\sub2apiEstimates.test.ts
```

Expected: the two files are staged as renames and the account-source directories exist.

- [ ] **Step 2: Update imports to the new estimate module path**

In `src/services/apiCredentialProfiles/modelCatalog.ts`, replace:

```ts
import {
  applySub2ApiPriceEstimates,
  resolveSub2ApiKeyGroupForPriceEstimation,
} from "~/services/apiCredentialProfiles/sub2apiPriceEstimation"
```

with:

```ts
import {
  applySub2ApiPriceEstimates,
  buildSub2ApiRuntimePricingResponse,
  loadSub2ApiEstimatedPricingResponse,
  resolveSub2ApiKeyGroupForPriceEstimation,
} from "~/services/modelList/accountSources/sub2apiEstimates"
```

This import is temporary for `modelCatalog.ts`; Task 5 removes account-token fallback from that file.

In `tests/services/modelList/accountSources/sub2apiEstimates.test.ts`, replace:

```ts
} from "~/services/apiCredentialProfiles/sub2apiPriceEstimation"
```

with:

```ts
} from "~/services/modelList/accountSources/sub2apiEstimates"
```

- [ ] **Step 3: Add runtime response and dashboard estimate exports**

Modify `src/services/modelList/accountSources/sub2apiEstimates.ts`.

Add imports:

```ts
import { buildModelListCatalogPricingResponse } from "~/services/modelList/pricingResponse"
import { loadModelPriceTable } from "~/services/modelPricing/modelPriceTable"
import {
  fetchAccountTokens,
  fetchSub2ApiAvailableGroups,
  fetchSub2ApiGroupRates,
} from "~/services/apiService/sub2api"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"
```

Keep the existing imports for `SITE_TYPES`, `MODEL_LIST_SOURCE_KINDS`, and the pricing metadata types.

Add this type near the other parameter types:

```ts
type Sub2ApiEstimateAccount = Pick<
  DisplaySiteData,
  | "siteType"
  | "baseUrl"
  | "id"
  | "authType"
  | "userId"
  | "token"
  | "cookieAuthSessionCookie"
>

type LoadSub2ApiEstimatedPricingResponseParams = {
  account: Sub2ApiEstimateAccount
  selectedToken: ApiToken
  resolvedKey: string
  runtimeModelIds: string[]
  fallbackResponse: PricingResponse
}
```

Add these exports at the end of the file:

```ts
/**
 * Build a Sub2API runtime-key model catalog where model visibility is known
 * but no JWT/group pricing estimate has been applied yet.
 */
export function buildSub2ApiRuntimePricingResponse(
  modelIds: string[],
  unavailableReason: (typeof MODEL_UNAVAILABLE_PRICE_REASONS)[keyof typeof MODEL_UNAVAILABLE_PRICE_REASONS] = MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
): PricingResponse {
  return buildModelListCatalogPricingResponse({
    modelIds,
    unavailableReason,
    source: {
      kind: MODEL_LIST_SOURCE_KINDS.SUB2API_RUNTIME_KEY,
      provider: SITE_TYPES.SUB2API,
      supportsRuntimeModelList: true,
      supportsPricing: false,
    },
  })
}

const hasSub2ApiDashboardAuth = (account: Sub2ApiEstimateAccount): boolean => {
  return (
    account.authType === AuthTypeEnum.AccessToken &&
    typeof account.token === "string" &&
    account.token.trim().length > 0
  )
}

const createSub2ApiDashboardRequest = (
  account: Sub2ApiEstimateAccount,
): ApiServiceRequest => ({
  baseUrl: account.baseUrl,
  accountId: account.id,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: account.userId,
    accessToken: account.token,
    cookie: account.cookieAuthSessionCookie,
  },
})

export const loadSub2ApiEstimatedPricingResponse = async (
  params: LoadSub2ApiEstimatedPricingResponseParams,
): Promise<PricingResponse> => {
  if (!hasSub2ApiDashboardAuth(params.account)) {
    return params.fallbackResponse
  }

  try {
    const dashboardRequest = createSub2ApiDashboardRequest(params.account)
    const [groups, groupRates, accountTokens, priceTable] = await Promise.all([
      fetchSub2ApiAvailableGroups(dashboardRequest),
      fetchSub2ApiGroupRates(dashboardRequest),
      fetchAccountTokens(dashboardRequest),
      loadModelPriceTable(),
    ])
    const group = resolveSub2ApiKeyGroupForPriceEstimation({
      selectedToken: params.selectedToken,
      resolvedKey: params.resolvedKey,
      accountTokens,
      groups,
    })

    return applySub2ApiPriceEstimates({
      modelIds: params.runtimeModelIds,
      group,
      groupRates,
      priceTable,
    })
  } catch {
    return buildSub2ApiRuntimePricingResponse(
      params.runtimeModelIds,
      MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
    )
  }
}
```

- [ ] **Step 4: Remove duplicated Sub2API estimate helpers from `modelCatalog.ts`**

In `src/services/apiCredentialProfiles/modelCatalog.ts`, delete these local helpers because the new module now owns them:

```text
buildSub2ApiRuntimePricingResponse
hasSub2ApiDashboardAuth
createSub2ApiDashboardRequest
loadSub2ApiEstimatedPricingResponse
```

Also remove these imports from `modelCatalog.ts` because `sub2apiEstimates.ts` now owns them:

```ts
import { loadModelPriceTable } from "~/services/modelPricing/modelPriceTable"
import {
  applySub2ApiPriceEstimates,
  resolveSub2ApiKeyGroupForPriceEstimation,
} from "~/services/modelList/accountSources/sub2apiEstimates"
import {
  fetchAccountTokens,
  fetchSub2ApiAvailableGroups,
  fetchSub2ApiGroupRates,
} from "~/services/apiService/sub2api"
```

Keep the new `buildSub2ApiRuntimePricingResponse` and `loadSub2ApiEstimatedPricingResponse` imports until Task 5 moves the token fallback loader.

- [ ] **Step 5: Extend moved estimate tests for runtime response ownership**

In `tests/services/modelList/accountSources/sub2apiEstimates.test.ts`, update the import:

```ts
import {
  applySub2ApiPriceEstimates,
  buildSub2ApiRuntimePricingResponse,
  resolveSub2ApiKeyGroupForPriceEstimation,
} from "~/services/modelList/accountSources/sub2apiEstimates"
```

Add this test after the `resolveSub2ApiKeyGroupForPriceEstimation` block:

```ts
describe("buildSub2ApiRuntimePricingResponse", () => {
  it("builds Sub2API runtime-key source metadata without pricing", () => {
    const result = buildSub2ApiRuntimePricingResponse(["runtime-model"])

    expect(result.model_list_source).toEqual({
      kind: "sub2api_runtime_key",
      provider: SITE_TYPES.SUB2API,
      supportsRuntimeModelList: true,
      supportsPricing: false,
    })
    expect(result.data).toEqual([
      expect.objectContaining({
        model_name: "runtime-model",
        price_metadata: expect.objectContaining({
          unavailable_reason:
            MODEL_UNAVAILABLE_PRICE_REASONS.MODEL_LIST_ONLY,
        }),
      }),
    ])
  })
})
```

If the test file does not already import `SITE_TYPES`, add:

```ts
import { SITE_TYPES } from "~/constants/siteType"
```

- [ ] **Step 6: Run moved estimate and profile catalog tests**

Run:

```powershell
pnpm vitest run tests/services/modelList/accountSources/sub2apiEstimates.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 7: Confirm Sub2API estimate ownership moved**

Run:

```powershell
rg -n "sub2apiPriceEstimation|applySub2ApiPriceEstimates|loadSub2ApiEstimatedPricingResponse|resolveSub2ApiKeyGroupForPriceEstimation" src/services/apiCredentialProfiles tests/services/apiCredentialProfiles
```

Expected: no matches after Task 5. At this task boundary, temporary matches in `src/services/apiCredentialProfiles/modelCatalog.ts` are allowed only for `buildSub2ApiRuntimePricingResponse` and `loadSub2ApiEstimatedPricingResponse` imports that Task 5 removes.

- [ ] **Step 8: Commit the Sub2API estimate move**

Run:

```powershell
git add src/services/modelList/accountSources/sub2apiEstimates.ts tests/services/modelList/accountSources/sub2apiEstimates.test.ts src/services/apiCredentialProfiles/modelCatalog.ts
git commit -m "refactor(model-list): move sub2api pricing estimates"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 4: Add Account-Source Readiness Resolver

**Files:**

- Create: `src/services/modelList/accountSources/readiness.ts`
- Create: `src/services/modelList/accountSources/index.ts`
- Create: `tests/services/modelList/accountSources/readiness.test.ts`

- [ ] **Step 1: Write failing readiness tests**

Create `tests/services/modelList/accountSources/readiness.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS,
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
  ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES,
} from "~/services/accounts/accountSiteProfile"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import {
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources/readiness"

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: vi.fn(),
}))

const modelPricing = {
  fetchPricing: vi.fn(),
}

const modelCatalog = {
  fetchModels: vi.fn(),
}

describe("resolveModelListAccountSourceReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns direct pricing when profile policy and adapter capability both support it", () => {
    vi.mocked(getSiteAdapter).mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      modelPricing,
    })

    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toEqual({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
      modelPricing,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
  })

  it("returns missing model-pricing capability for compatible accounts without modelPricing", () => {
    vi.mocked(getSiteAdapter).mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
    })

    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toEqual({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
      reason:
        MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.MissingModelPricingCapability,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
  })

  it("returns token-scoped runtime catalog when profile policy and adapter capability both support it", () => {
    vi.mocked(getSiteAdapter).mockReturnValue({
      siteType: SITE_TYPES.SUB2API,
      modelCatalog,
    })

    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.SUB2API,
      }),
    ).toEqual({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog,
      modelCatalog,
      dashboardEstimateLoader:
        ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.Sub2Api,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
  })

  it("returns missing model-catalog capability for token-scoped profiles without modelCatalog", () => {
    vi.mocked(getSiteAdapter).mockReturnValue({
      siteType: SITE_TYPES.SUB2API,
    })

    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.SUB2API,
      }),
    ).toEqual({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
      reason:
        MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.MissingModelCatalogCapability,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Response,
    })
  })

  it("returns unsupported without throwing for an unmapped account site without adapter support", () => {
    vi.mocked(getSiteAdapter).mockReturnValue({
      siteType: SITE_TYPES.UNKNOWN,
    })

    expect(() =>
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.UNKNOWN,
      }),
    ).not.toThrow()
    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.UNKNOWN,
      }),
    ).toMatchObject({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
      reason:
        MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.MissingModelPricingCapability,
    })
  })

  it("carries profile display capability source for AIHubMix", () => {
    vi.mocked(getSiteAdapter).mockReturnValue({
      siteType: SITE_TYPES.AIHUBMIX,
      modelPricing,
    })

    expect(
      resolveModelListAccountSourceReadiness({
        siteType: SITE_TYPES.AIHUBMIX,
      }),
    ).toMatchObject({
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
      statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Account,
      displayCapabilitiesSource:
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile,
    })
  })
})
```

- [ ] **Step 2: Run the failing readiness test**

Run:

```powershell
pnpm vitest run tests/services/modelList/accountSources/readiness.test.ts
```

Expected: FAIL with an import error for `~/services/modelList/accountSources/readiness`.

- [ ] **Step 3: Create the readiness module**

Create `src/services/modelList/accountSources/readiness.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import {
  ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING,
  ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS,
  getAccountSiteModelListProfile,
  type AccountSiteModelListDashboardEstimateLoader,
  type AccountSiteModelListDisplayCapabilitySource,
  type AccountSiteModelListStatusScope,
} from "~/services/accounts/accountSiteProfile"
import type { ModelCatalogCapability } from "~/services/apiAdapters/contracts/modelCatalog"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { getSiteAdapter } from "~/services/apiAdapters/registry"

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

type ModelListAccountSourceBaseReadiness = {
  statusScope: AccountSiteModelListStatusScope
  displayCapabilitiesSource: AccountSiteModelListDisplayCapabilitySource
}

export type ModelListAccountSourceReadiness =
  | (ModelListAccountSourceBaseReadiness & {
      route: typeof MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing
      modelPricing: ModelPricingCapability
    })
  | (ModelListAccountSourceBaseReadiness & {
      route: typeof MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog
      modelCatalog: ModelCatalogCapability
      dashboardEstimateLoader: AccountSiteModelListDashboardEstimateLoader
    })
  | (ModelListAccountSourceBaseReadiness & {
      route: typeof MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported
      reason: ModelListAccountSourceUnsupportedReason
    })

export function resolveModelListAccountSourceReadiness(account: {
  siteType: AccountSiteType
}): ModelListAccountSourceReadiness {
  const profile = getAccountSiteModelListProfile(account.siteType)
  const adapter = getSiteAdapter(account.siteType)
  const base = {
    statusScope: profile.statusScope,
    displayCapabilitiesSource: profile.displayCapabilitiesSource,
  }

  if (
    profile.directPricing === ACCOUNT_SITE_MODEL_LIST_DIRECT_PRICING.Supported
  ) {
    if (adapter.modelPricing) {
      return {
        ...base,
        route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing,
        modelPricing: adapter.modelPricing,
      }
    }

    if (
      profile.tokenScopedCatalogFallback !==
      ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey
    ) {
      return {
        ...base,
        route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
        reason:
          MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.MissingModelPricingCapability,
      }
    }
  }

  if (
    profile.tokenScopedCatalogFallback ===
    ACCOUNT_SITE_MODEL_LIST_TOKEN_SCOPED_CATALOG_FALLBACKS.RuntimeKey
  ) {
    if (adapter.modelCatalog) {
      return {
        ...base,
        route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog,
        modelCatalog: adapter.modelCatalog,
        dashboardEstimateLoader: profile.dashboardEstimateLoader,
      }
    }

    return {
      ...base,
      route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
      reason:
        MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.MissingModelCatalogCapability,
    }
  }

  return {
    ...base,
    route: MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
    reason: MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.NoSupportedRoute,
  }
}
```

- [ ] **Step 4: Create the account-source barrel**

Create `src/services/modelList/accountSources/index.ts`:

```ts
export * from "./readiness"
export * from "./sub2apiEstimates"
```

Task 5 adds `tokenScopedFallback` to this barrel after the file exists.

- [ ] **Step 5: Run readiness tests**

Run:

```powershell
pnpm vitest run tests/services/modelList/accountSources/readiness.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit readiness module**

Run:

```powershell
git add src/services/modelList/accountSources/readiness.ts src/services/modelList/accountSources/index.ts tests/services/modelList/accountSources/readiness.test.ts
git commit -m "refactor(model-list): add account source readiness"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 5: Move Account-Token Fallback Out Of API Credential Profiles

**Files:**

- Create: `src/services/modelList/accountSources/tokenScopedFallback.ts`
- Modify: `src/services/modelList/accountSources/index.ts`
- Modify: `src/services/apiCredentialProfiles/modelCatalog.ts`
- Move fallback tests from `tests/services/apiCredentialProfiles/modelCatalog.test.ts` into `tests/services/modelList/accountSources/tokenScopedFallback.test.ts`
- Modify: `tests/services/apiCredentialProfiles/modelCatalog.test.ts`

- [ ] **Step 1: Create the token fallback test file by moving existing behavior cases**

Create `tests/services/modelList/accountSources/tokenScopedFallback.test.ts` with the existing account-token fallback tests from `tests/services/apiCredentialProfiles/modelCatalog.test.ts`.

Use these imports at the top of the new file:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED,
  loadAccountTokenFallbackPricingResponse,
} from "~/services/modelList/accountSources/tokenScopedFallback"
import { API_ERROR_CODES, ApiError } from "~/services/apiService/common/errors"
import {
  MODEL_LIST_SOURCE_KINDS,
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
  type PricingResponse,
} from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"
```

Keep the same `vi.hoisted(...)` mocks for:

```ts
fetchOpenAICompatibleModelIdsMock
fetchAccountTokensMock
fetchSub2ApiAvailableGroupsMock
fetchSub2ApiGroupRatesMock
fetchSub2ApiRuntimeModelsMock
getSiteAdapterMock
loadModelPriceTableMock
resolveDisplayAccountTokenForSecretMock
```

Update the price-table mock path:

```ts
vi.mock("~/services/modelPricing/modelPriceTable", () => ({
  loadModelPriceTable: (...args: unknown[]) => loadModelPriceTableMock(...args),
}))
```

Update the model catalog profile lookup mock path:

```ts
vi.mock("~/services/apiCredentialProfiles/modelCatalog", () => ({
  fetchApiCredentialModelIds: (...args: unknown[]) =>
    fetchOpenAICompatibleModelIdsMock(...args),
}))
```

Copy the existing `ACCOUNT`, `TOKEN`, `createSub2ApiModelCatalogAdapter(...)`, and `mockSub2ApiModelCatalogAdapter(...)` fixtures from `tests/services/apiCredentialProfiles/modelCatalog.test.ts` into the new file unchanged.

- [ ] **Step 2: Update moved fallback tests for readiness-owned routing**

In `tests/services/modelList/accountSources/tokenScopedFallback.test.ts`, move these complete tests from `tests/services/apiCredentialProfiles/modelCatalog.test.ts` into the new file without changing their assertion bodies:

```text
merges token-declared and upstream model ids into a normalized catalog
uses the selected token key for compatible account-token fallback even when the adapter exposes model pricing
falls back to token-declared models when the upstream key lookup fails
loads AIHubMix account-key fallback models without revealing masked keys
does not use the Sub2API runtime-key fallback for compatible accounts without direct pricing adapters
loads Sub2API selected-key runtime models as model-list-only rows
adds estimated Sub2API prices when dashboard group and price-table data are available
keeps Sub2API runtime rows without pricing when dashboard auth is unavailable
sanitizes a missing Sub2API model catalog capability failure
redacts the resolved key and base URL when fallback loading fails
preserves structured fallback load failure metadata for analytics
surfaces Sub2API runtime key business errors for fallback catalog loading
```

Replace the old AIHubMix missing-pricing-adapter fallback test with this implementation-unsupported expectation:

```ts
  it("sanitizes a missing AIHubMix model pricing capability failure", async () => {
    getSiteAdapterMock.mockReturnValueOnce({
      siteType: SITE_TYPES.AIHUBMIX,
    })

    await expect(
      loadAccountTokenFallbackPricingResponse({
        account: {
          ...ACCOUNT,
          siteType: SITE_TYPES.AIHUBMIX,
          baseUrl: "https://aihubmix.com",
        },
        token: {
          ...TOKEN,
          key: "sk-****masked",
          models: "",
        },
      }),
    ).rejects.toThrow("modelPricing is not implemented for AIHubMix")

    expect(resolveDisplayAccountTokenForSecretMock).not.toHaveBeenCalled()
    expect(fetchOpenAICompatibleModelIdsMock).not.toHaveBeenCalled()
  })
```

This matches the spec rule that a missing capability for a profile-supported route is implementation unsupported.

- [ ] **Step 3: Trim `modelCatalog.test.ts` to profile-owned behavior**

In `tests/services/apiCredentialProfiles/modelCatalog.test.ts`, keep only these imports from `modelCatalog`:

```ts
import {
  buildApiCredentialProfilePricingResponse,
  fetchApiCredentialModelIds,
  normalizeApiCredentialModelIds,
} from "~/services/apiCredentialProfiles/modelCatalog"
```

Keep only these complete profile-owned tests from the current file, with their assertion bodies unchanged:

```text
routes profile model-id lookups to the provider-specific fetcher
throws for unsupported profile api types
normalizes, filters, and de-duplicates raw model ids when building profile catalogs
```

Remove fallback-specific mocks from `modelCatalog.test.ts`:

```ts
fetchAccountTokensMock
fetchSub2ApiAvailableGroupsMock
fetchSub2ApiGroupRatesMock
fetchSub2ApiRuntimeModelsMock
getSiteAdapterMock
loadModelPriceTableMock
resolveDisplayAccountTokenForSecretMock
```

Remove these fallback-specific module mocks from `modelCatalog.test.ts`:

```text
~/services/apiService/sub2api
~/services/apiAdapters/registry
~/services/modelPricing/modelPriceTable
~/services/accounts/utils/apiServiceRequest
```

- [ ] **Step 4: Run tests and verify expected failure**

Run:

```powershell
pnpm vitest run tests/services/modelList/accountSources/tokenScopedFallback.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts
```

Expected: FAIL because `tokenScopedFallback.ts` does not exist and `modelCatalog.ts` still owns fallback exports.

- [ ] **Step 5: Create the account-token fallback module**

Create `src/services/modelList/accountSources/tokenScopedFallback.ts`:

```ts
import {
  ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS,
  ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES,
} from "~/services/accounts/accountSiteProfile"
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import type { ModelPricingRequest } from "~/services/apiAdapters/contracts/modelPricing"
import {
  buildApiCredentialProfilePricingResponse,
  fetchApiCredentialModelIds,
} from "~/services/apiCredentialProfiles/modelCatalog"
import {
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources/readiness"
import {
  buildSub2ApiRuntimePricingResponse,
  loadSub2ApiEstimatedPricingResponse,
} from "~/services/modelList/accountSources/sub2apiEstimates"
import {
  type PricingResponse,
} from "~/services/apiService/common/type"
import type { ModelCatalogRequest } from "~/services/apiAdapters/contracts/modelCatalog"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"
import { parseDelimitedList } from "~/utils/core/string"

type LoadAccountTokenFallbackPricingParams = {
  account: Pick<
    DisplaySiteData,
    | "siteType"
    | "baseUrl"
    | "id"
    | "authType"
    | "userId"
    | "token"
    | "cookieAuthSessionCookie"
  >
  token: ApiToken
}

export const ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED =
  "ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED"

const createMissingModelCatalogCapabilityError = (siteType: string) =>
  new Error(`modelCatalog is not implemented for ${siteType}`)

const createMissingModelPricingCapabilityError = (siteType: string) =>
  new Error(`modelPricing is not implemented for ${siteType}`)

const createAccountModelPricingRequest = (
  account: LoadAccountTokenFallbackPricingParams["account"],
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

const createRuntimeCatalogRequest = (
  account: LoadAccountTokenFallbackPricingParams["account"],
  apiKey: string,
): ModelCatalogRequest => ({
  baseUrl: account.baseUrl,
  accountId: account.id,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    apiKey,
  },
})

/**
 * Loads a minimal model catalog for an account token by combining selected-token
 * visibility with the source account's Model List readiness route.
 */
export async function loadAccountTokenFallbackPricingResponse(
  params: LoadAccountTokenFallbackPricingParams,
): Promise<PricingResponse> {
  const declaredModelIds = parseDelimitedList(params.token.models)
  const readiness = resolveModelListAccountSourceReadiness(params.account)
  let resolvedTokenKey = ""

  try {
    if (
      readiness.route === MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing &&
      readiness.displayCapabilitiesSource ===
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile
    ) {
      return await readiness.modelPricing.fetchPricing(
        createAccountModelPricingRequest(params.account),
      )
    }

    if (
      readiness.route === MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported &&
      readiness.reason ===
        MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.MissingModelPricingCapability &&
      readiness.displayCapabilitiesSource ===
        ACCOUNT_SITE_MODEL_LIST_DISPLAY_CAPABILITY_SOURCES.Profile
    ) {
      throw createMissingModelPricingCapabilityError(params.account.siteType)
    }

    const resolvedToken = await resolveDisplayAccountTokenForSecret(
      params.account,
      params.token,
    )
    resolvedTokenKey = resolvedToken.key

    if (
      readiness.route ===
      MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog
    ) {
      const runtimeModelIds = await readiness.modelCatalog.fetchModels(
        createRuntimeCatalogRequest(params.account, resolvedToken.key),
      )
      const modelOnlyResponse =
        buildSub2ApiRuntimePricingResponse(runtimeModelIds)

      if (
        readiness.dashboardEstimateLoader ===
        ACCOUNT_SITE_MODEL_LIST_DASHBOARD_ESTIMATE_LOADERS.Sub2Api
      ) {
        return await loadSub2ApiEstimatedPricingResponse({
          account: params.account,
          selectedToken: params.token,
          resolvedKey: resolvedToken.key,
          runtimeModelIds,
          fallbackResponse: modelOnlyResponse,
        })
      }

      return modelOnlyResponse
    }

    if (
      readiness.route === MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported &&
      readiness.reason ===
        MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS.MissingModelCatalogCapability
    ) {
      throw createMissingModelCatalogCapabilityError(params.account.siteType)
    }

    let upstreamModelIds: string[] = []
    try {
      upstreamModelIds = await fetchApiCredentialModelIds({
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: params.account.baseUrl,
        apiKey: resolvedToken.key,
      })
    } catch (error) {
      if (declaredModelIds.length === 0) {
        throw error
      }
    }

    return buildApiCredentialProfilePricingResponse([
      ...declaredModelIds,
      ...upstreamModelIds,
    ])
  } catch (error) {
    const sanitizedMessage = toSanitizedErrorSummary(error, [
      params.account.baseUrl,
      params.token.key,
      resolvedTokenKey,
    ])

    throw new Error(sanitizedMessage || ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED, {
      cause: error,
    })
  }
}
```

- [ ] **Step 6: Export the fallback module**

Modify `src/services/modelList/accountSources/index.ts`:

```ts
export * from "./readiness"
export * from "./sub2apiEstimates"
export * from "./tokenScopedFallback"
```

- [ ] **Step 7: Replace `modelCatalog.ts` with profile-owned code**

Replace `src/services/apiCredentialProfiles/modelCatalog.ts` with:

```ts
import { fetchAnthropicModelIds } from "~/services/aiApi/anthropic"
import { fetchGoogleModelIds } from "~/services/aiApi/google"
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import {
  buildModelListCatalogPricingResponse,
  normalizeModelListModelIds,
} from "~/services/modelList/pricingResponse"
import type { PricingResponse } from "~/services/apiService/common/type"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"

type FetchApiCredentialModelCatalogParams = {
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
}

/**
 * Fetch raw model ids using a stored API credential profile.
 */
export async function fetchApiCredentialModelIds(
  params: FetchApiCredentialModelCatalogParams,
): Promise<string[]> {
  if (
    params.apiType === API_TYPES.OPENAI_COMPATIBLE ||
    params.apiType === API_TYPES.OPENAI
  ) {
    return fetchOpenAICompatibleModelIds({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
    })
  }

  if (params.apiType === API_TYPES.ANTHROPIC) {
    return fetchAnthropicModelIds({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
    })
  }

  if (params.apiType === API_TYPES.GOOGLE) {
    return fetchGoogleModelIds({
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
    })
  }

  throw new Error("Unsupported apiType")
}

export const normalizeApiCredentialModelIds = normalizeModelListModelIds

/**
 * Build a minimal model-pricing response shim for profile-backed catalogs.
 */
export function buildApiCredentialProfilePricingResponse(
  modelIds: string[],
): PricingResponse {
  return buildModelListCatalogPricingResponse({ modelIds })
}
```

- [ ] **Step 8: Update `useModelData.ts` imports to the new fallback path**

In `src/features/ModelList/hooks/useModelData.ts`, replace:

```ts
import {
  ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED,
  loadAccountTokenFallbackPricingResponse,
} from "~/services/apiCredentialProfiles/modelCatalog"
```

with:

```ts
import {
  ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED,
  loadAccountTokenFallbackPricingResponse,
} from "~/services/modelList/accountSources/tokenScopedFallback"
```

- [ ] **Step 9: Run fallback and profile catalog tests**

Run:

```powershell
pnpm vitest run tests/services/modelList/accountSources/tokenScopedFallback.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Confirm profile module no longer owns account-token fallback**

Run:

```powershell
rg -n "loadAccountTokenFallbackPricingResponse|ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED|resolveDisplayAccountTokenForSecret|getSiteAdapter|fetchSub2ApiAvailableGroups|fetchSub2ApiGroupRates|fetchAccountTokens|DisplaySiteData|ApiToken" src/services/apiCredentialProfiles/modelCatalog.ts
```

Expected: no matches.

- [ ] **Step 11: Commit the fallback ownership move**

Run:

```powershell
git add src/services/modelList/accountSources/tokenScopedFallback.ts src/services/modelList/accountSources/index.ts src/services/apiCredentialProfiles/modelCatalog.ts tests/services/modelList/accountSources/tokenScopedFallback.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts src/features/ModelList/hooks/useModelData.ts
git commit -m "refactor(model-list): move account token fallback"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 6: Route Model List Hook Loading Through Readiness

**Files:**

- Modify: `src/features/ModelList/hooks/useModelData.ts`
- Modify: `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`

- [ ] **Step 1: Update hook imports**

In `src/features/ModelList/hooks/useModelData.ts`, add:

```ts
import {
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources/readiness"
```

Keep these existing product-profile imports because fallback availability and status metadata still use them:

```ts
import {
  getAccountSiteModelListProfile,
  shouldUseAccountSiteRuntimeKeyCatalogFallback,
  supportsAccountSiteDirectModelPricing,
  type AccountSiteModelListStatusScope,
} from "~/services/accounts/accountSiteProfile"
```

- [ ] **Step 2: Rename product-level token-scoped helper names**

In `src/features/ModelList/hooks/useModelData.ts`, replace:

```ts
const SUB2API_ALL_ACCOUNTS_TOKEN_CONCURRENCY = 4
```

with:

```ts
const TOKEN_SCOPED_CATALOG_CONCURRENCY = 4
```

Replace:

```ts
async function loadSub2ApiTokenPricingContext(params: {
```

with:

```ts
async function loadTokenScopedCatalogPricingContext(params: {
```

Replace:

```ts
async function fetchSub2ApiAllAccountsFallbackPricingContexts(
```

with:

```ts
async function fetchTokenScopedCatalogPricingContexts(
```

Replace the concurrency call:

```ts
    SUB2API_ALL_ACCOUNTS_TOKEN_CONCURRENCY,
    (token) => loadSub2ApiTokenPricingContext({ account, token }),
```

with:

```ts
    TOKEN_SCOPED_CATALOG_CONCURRENCY,
    (token) => loadTokenScopedCatalogPricingContext({ account, token }),
```

Replace every call to `fetchSub2ApiAllAccountsFallbackPricingContexts(account)` with:

```ts
fetchTokenScopedCatalogPricingContexts(account)
```

- [ ] **Step 3: Route single-account direct loading through readiness**

In the single-account `queryFn`, replace:

```ts
      const modelPricing = getSiteAdapter(currentAccount.siteType).modelPricing
      if (!modelPricing) {
        throw createUnsupportedModelPricingError()
      }
```

with:

```ts
      const readiness =
        resolveModelListAccountSourceReadiness(currentAccount)
      if (readiness.route !== MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing) {
        throw createUnsupportedModelPricingError()
      }
```

Replace:

```ts
      const data = await modelPricing.fetchPricing(
        createDisplayAccountModelPricingRequest(currentAccount),
      )
```

with:

```ts
      const data = await readiness.modelPricing.fetchPricing(
        createDisplayAccountModelPricingRequest(currentAccount),
      )
```

The final order must be:

```ts
      const readiness =
        resolveModelListAccountSourceReadiness(currentAccount)
      if (readiness.route !== MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing) {
        throw createUnsupportedModelPricingError()
      }

      const cacheKey = createModelPricingCacheKey(currentAccount)
      const cached = await modelPricingCache.get(cacheKey)
```

This preserves guard-before-cache behavior.

- [ ] **Step 4: Route all-accounts loading through readiness**

In the all-accounts `queryFn`, replace:

```ts
        const modelPricing = getSiteAdapter(account.siteType).modelPricing
        if (!modelPricing) {
          if (shouldUseAccountSiteRuntimeKeyCatalogFallback(account)) {
            return fetchTokenScopedCatalogPricingContexts(account)
          }

          throw createUnsupportedModelPricingError()
        }
```

with:

```ts
        const readiness = resolveModelListAccountSourceReadiness(account)
        if (
          readiness.route ===
          MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog
        ) {
          return fetchTokenScopedCatalogPricingContexts(account)
        }

        if (readiness.route !== MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing) {
          throw createUnsupportedModelPricingError()
        }
```

Replace:

```ts
        const data = await modelPricing.fetchPricing(
          createDisplayAccountModelPricingRequest(account),
        )
```

with:

```ts
        const data = await readiness.modelPricing.fetchPricing(
          createDisplayAccountModelPricingRequest(account),
        )
```

The final all-accounts order must be:

```ts
        const readiness = resolveModelListAccountSourceReadiness(account)
        if (
          readiness.route ===
          MODEL_LIST_ACCOUNT_SOURCE_ROUTES.TokenScopedRuntimeCatalog
        ) {
          return fetchTokenScopedCatalogPricingContexts(account)
        }

        if (readiness.route !== MODEL_LIST_ACCOUNT_SOURCE_ROUTES.DirectPricing) {
          throw createUnsupportedModelPricingError()
        }

        const cacheKey = createModelPricingCacheKey(account)
        const cached = await modelPricingCache.get(cacheKey)
```

- [ ] **Step 5: Remove direct adapter lookup from the hook**

In `src/features/ModelList/hooks/useModelData.ts`, remove:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
```

The hook should use readiness for account-source route selection. Adapter lookup stays inside `readiness.ts`.

- [ ] **Step 6: Update hook tests to assert readiness behavior through adapter mocks**

In `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`, keep the existing `getSiteAdapter` mock. The readiness resolver uses that mock internally, so the tests can keep the current adapter-based setup.

Add or update this guard-before-cache test:

```ts
  it("does not return cached pricing before account-source readiness allows direct pricing", async () => {
    const cachedPricing = createPricingResponse(["cached-model"])
    await modelPricingCache.set(createModelPricingCacheKey(SUB2API_ACCOUNT), cachedPricing)

    const fetchPricing = vi.fn()
    vi.mocked(getSiteAdapter).mockReturnValue({
      siteType: SITE_TYPES.SUB2API,
    } as any)

    const { result } = renderHook(() =>
      useModelData({
        selectedSource: {
          kind: MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT,
          accountId: SUB2API_ACCOUNT.id,
        },
        displayData: [SUB2API_ACCOUNT],
        apiCredentialProfiles: [],
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.loadErrorMessage).toBeTruthy()
    })

    expect(fetchPricing).not.toHaveBeenCalled()
    expect(result.current.pricingData).toBeNull()
  })
```

If the file uses different fixture names, use the existing Sub2API display account fixture and the existing `createPricingResponse(...)`, `renderHook(...)`, `waitFor(...)`, and wrapper helpers from that test file. Do not add duplicate fixture factories for the same account shape.

Add or update this all-accounts fallback test:

```ts
  it("uses token-scoped runtime catalog readiness in all-accounts mode", async () => {
    vi.mocked(getSiteAdapter).mockReturnValue({
      siteType: SITE_TYPES.SUB2API,
      modelCatalog: {
        fetchModels: vi.fn().mockResolvedValue(["runtime-model"]),
      },
    } as any)
    fetchDisplayAccountTokensMock.mockResolvedValueOnce([
      {
        ...TOKEN,
        id: 10,
        status: 1,
        name: "Runtime Key",
      },
    ])
    resolveDisplayAccountTokenForSecretMock.mockResolvedValueOnce({
      ...TOKEN,
      id: 10,
      key: "sk-runtime",
    })

    const { result } = renderHook(() =>
      useModelData({
        selectedSource: { kind: MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS },
        displayData: [SUB2API_ACCOUNT],
        apiCredentialProfiles: [],
      }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.pricingData?.data[0]?.model_name).toBe(
        "runtime-model",
      )
    })
  })
```

Adapt fixture names only to match existing local names in the test file.

- [ ] **Step 7: Run hook tests**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Confirm hook no longer owns account-source routing details**

Run:

```powershell
rg -n "getSiteAdapter|fetchSub2ApiAllAccountsFallbackPricingContexts|loadSub2ApiTokenPricingContext|SUB2API_ALL_ACCOUNTS_TOKEN_CONCURRENCY" src/features/ModelList/hooks/useModelData.ts
```

Expected: no matches.

Run:

```powershell
rg -n "resolveModelListAccountSourceReadiness|TOKEN_SCOPED_CATALOG_CONCURRENCY|loadTokenScopedCatalogPricingContext|fetchTokenScopedCatalogPricingContexts" src/features/ModelList/hooks/useModelData.ts
```

Expected: matches for the new readiness resolver and generic helper names.

- [ ] **Step 9: Commit hook routing**

Run:

```powershell
git add src/features/ModelList/hooks/useModelData.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
git commit -m "refactor(model-list): route account loading through readiness"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 7: Generalize Token-Scoped Fallback UI Copy

**Files:**

- Modify: `src/features/ModelList/components/StatusIndicator.tsx`
- Modify: `tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx`
- Modify: `src/locales/zh-CN/modelList.json`
- Modify: `src/locales/zh-TW/modelList.json`
- Modify: `src/locales/en/modelList.json`
- Modify: `src/locales/ja/modelList.json`
- Modify: `src/locales/vi/modelList.json`

- [ ] **Step 1: Update `StatusIndicator` translation keys**

In `src/features/ModelList/components/StatusIndicator.tsx`, replace:

```ts
              ? t("status.sub2apiKeyScopedFallbackTitle")
              : t("status.fallback.title")}
```

with:

```ts
              ? t("status.tokenScopedCatalogFallbackTitle")
              : t("status.fallback.title")}
```

Replace:

```ts
              ? t("status.sub2apiKeyScopedFallbackDescription")
              : t("status.fallback.description")}
```

with:

```ts
              ? t("status.tokenScopedCatalogFallbackDescription")
              : t("status.fallback.description")}
```

Replace:

```ts
        title={t("status.sub2apiKeyScopedTitle")}
        description={t("status.sub2apiKeyScopedDescription")}
```

with:

```ts
        title={t("status.tokenScopedCatalogTitle")}
        description={t("status.tokenScopedCatalogDescription")}
```

- [ ] **Step 2: Update component tests**

In `tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx`, replace every expected key:

```ts
"modelList:status.sub2apiKeyScopedTitle"
"modelList:status.sub2apiKeyScopedDescription"
"modelList:status.sub2apiKeyScopedFallbackTitle"
"modelList:status.sub2apiKeyScopedFallbackDescription"
```

with:

```ts
"modelList:status.tokenScopedCatalogTitle"
"modelList:status.tokenScopedCatalogDescription"
"modelList:status.tokenScopedCatalogFallbackTitle"
"modelList:status.tokenScopedCatalogFallbackDescription"
```

Keep existing fixtures that set:

```ts
statusScope: ACCOUNT_SITE_MODEL_LIST_STATUS_SCOPES.Token
```

Add this assertion to the account-scoped fallback test so generic fallback copy remains separate:

```ts
expect(
  screen.queryByText("modelList:status.tokenScopedCatalogTitle"),
).not.toBeInTheDocument()
```

- [ ] **Step 3: Update Chinese source locale**

In `src/locales/zh-CN/modelList.json`, replace the four old keys:

```json
"sub2apiKeyScopedDescription": "Sub2API 不提供账号级模型列表。插件会通过该账号下的 API 密钥获取实际可用模型。",
"sub2apiKeyScopedFallbackDescription": "请选择一个 API 密钥；如果只有一个可用密钥，插件会自动使用它加载模型。",
"sub2apiKeyScopedFallbackTitle": "通过密钥获取模型",
"sub2apiKeyScopedTitle": "正在通过 API 密钥获取模型列表"
```

with:

```json
"tokenScopedCatalogDescription": "该来源账号不提供账号级模型列表。插件会通过账号下的 API 密钥获取实际可用模型。",
"tokenScopedCatalogFallbackDescription": "请选择一个 API 密钥；如果只有一个可用密钥，插件会自动使用它加载模型。",
"tokenScopedCatalogFallbackTitle": "通过密钥获取模型",
"tokenScopedCatalogTitle": "正在通过 API 密钥获取模型列表"
```

- [ ] **Step 4: Update sibling locales**

In `src/locales/en/modelList.json`, replace the four old keys with:

```json
"tokenScopedCatalogDescription": "This source account does not provide an account-level model list. The extension fetches the models available to this account through its API keys.",
"tokenScopedCatalogFallbackDescription": "Select an API key. If only one available key exists, the extension will use it automatically.",
"tokenScopedCatalogFallbackTitle": "Fetch models through a key",
"tokenScopedCatalogTitle": "Fetching the model list through an API key"
```

In `src/locales/zh-TW/modelList.json`, replace the four old keys with:

```json
"tokenScopedCatalogDescription": "此來源帳號不提供帳號級模型列表。擴充功能會透過該帳號下的 API 密鑰取得實際可用模型。",
"tokenScopedCatalogFallbackDescription": "請選擇一個 API 密鑰；如果只有一個可用密鑰，擴充功能會自動使用它載入模型。",
"tokenScopedCatalogFallbackTitle": "透過密鑰取得模型",
"tokenScopedCatalogTitle": "正在透過 API 密鑰取得模型列表"
```

In `src/locales/ja/modelList.json`, replace the four old keys with:

```json
"tokenScopedCatalogDescription": "このソースアカウントはアカウント単位のモデル一覧を提供していません。拡張機能は、このアカウントの API キーを使って実際に利用できるモデルを取得します。",
"tokenScopedCatalogFallbackDescription": "API キーを選択してください。利用可能なキーが 1 つだけの場合は、拡張機能が自動的にそのキーでモデルを読み込みます。",
"tokenScopedCatalogFallbackTitle": "キーでモデルを取得",
"tokenScopedCatalogTitle": "API キーでモデル一覧を取得しています"
```

In `src/locales/vi/modelList.json`, replace the four old keys with:

```json
"tokenScopedCatalogDescription": "Tài khoản nguồn này không cung cấp danh sách mô hình ở cấp tài khoản. Tiện ích sẽ dùng API key của tài khoản này để lấy các mô hình thực sự có thể sử dụng.",
"tokenScopedCatalogFallbackDescription": "Chọn một API key. Nếu chỉ có một key khả dụng, tiện ích sẽ tự động dùng key đó để tải mô hình.",
"tokenScopedCatalogFallbackTitle": "Lấy mô hình qua key",
"tokenScopedCatalogTitle": "Đang lấy danh sách mô hình qua API key"
```

- [ ] **Step 5: Run component and locale validation**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx
pnpm run i18n:extract:ci
```

Expected: both commands PASS. If `i18n:extract:ci` changes locale files, inspect the diff and keep only expected key renames.

- [ ] **Step 6: Confirm old locale keys are gone**

Run:

```powershell
rg -n "sub2apiKeyScoped" src/features/ModelList src/locales tests/entrypoints/options/pages/ModelList
```

Expected: no matches.

- [ ] **Step 7: Commit generic token-scoped copy**

Run:

```powershell
git add src/features/ModelList/components/StatusIndicator.tsx tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx src/locales/zh-CN/modelList.json src/locales/zh-TW/modelList.json src/locales/en/modelList.json src/locales/ja/modelList.json src/locales/vi/modelList.json
git commit -m "refactor(model-list): generalize token scoped fallback copy"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 8: Migration Completeness Checks And Final Validation

**Files:**

- Review task-scoped files from Tasks 1-7.
- Modify only task-scoped files if a migration check finds stale ownership or a broken import.

- [ ] **Step 1: Run focused service and hook tests**

Run:

```powershell
pnpm vitest run tests/services/modelList/pricingResponse.test.ts tests/services/modelList/accountSources/readiness.test.ts tests/services/modelList/accountSources/tokenScopedFallback.test.ts tests/services/modelList/accountSources/sub2apiEstimates.test.ts tests/services/modelPricing/modelPriceTable.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run locale validation**

Run:

```powershell
pnpm run i18n:extract:ci
```

Expected: PASS with no unexpected locale updates.

- [ ] **Step 3: Run ownership checks**

Run:

```powershell
rg "Sub2Api|Sub2API|sub2api" src/features/ModelList src/services/apiCredentialProfiles src/locales/*/modelList.json
rg "shouldUseAccountSiteRuntimeKeyCatalogFallback|supportsAccountSiteDirectModelPricing|getAccountSiteModelListProfile" src/features/ModelList src/services/apiCredentialProfiles
rg "modelCatalog|modelPricing|statusScope|displayCapabilitiesSource|dashboardEstimateLoader" src/features/ModelList src/services/apiCredentialProfiles src/services/accounts/accountSiteProfile src/services/modelList/accountSources
rg "loadAccountTokenFallbackPricingResponse|ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED|resolveDisplayAccountTokenForSecret|getSiteAdapter|fetchSub2ApiAvailableGroups|fetchSub2ApiGroupRates|fetchAccountTokens|DisplaySiteData|ApiToken" src/services/apiCredentialProfiles/modelCatalog.ts
rg "sub2apiPriceEstimation|modelPriceTable|loadModelPriceTable|LITELLM_MODEL_PRICE_TABLE_URL" src/services/apiCredentialProfiles src/features src/entrypoints tests
```

Expected:

- Sub2API references remain only in backend-specific response metadata, Sub2API estimate implementation, tests that assert Sub2API behavior, profile constants, and source-provider constants.
- `src/services/apiCredentialProfiles/modelCatalog.ts` has no account-token fallback exports, no adapter lookup, no display-account token resolution, and no Sub2API dashboard estimate imports.
- `src/services/apiCredentialProfiles/` has no `sub2apiPriceEstimation.ts`, no `modelPriceTable.ts`, and no imports of the moved price-table or Sub2API estimate modules.
- `src/features/ModelList/hooks/useModelData.ts` uses `resolveModelListAccountSourceReadiness(...)` for route selection and generic token-scoped helper names.

- [ ] **Step 4: Run related tests for changed source files**

Run:

```powershell
pnpm vitest related --run src/services/modelList/pricingResponse.ts src/services/modelPricing/modelPriceTable.ts src/services/modelList/accountSources/readiness.ts src/services/modelList/accountSources/sub2apiEstimates.ts src/services/modelList/accountSources/tokenScopedFallback.ts src/services/apiCredentialProfiles/modelCatalog.ts src/features/ModelList/hooks/useModelData.ts src/features/ModelList/components/StatusIndicator.tsx
```

Expected: PASS. If this expands into a broad unrelated suite and times out, classify the timeout separately and rely on the focused tests plus `pnpm compile`.

- [ ] **Step 5: Run TypeScript compile**

Run:

```powershell
pnpm compile
```

Expected: PASS.

- [ ] **Step 6: Stage only task-scoped files and run the commit gate**

Run:

```powershell
git status --porcelain=v1
git add src/services/modelList/pricingResponse.ts src/services/modelList/accountSources/readiness.ts src/services/modelList/accountSources/tokenScopedFallback.ts src/services/modelList/accountSources/sub2apiEstimates.ts src/services/modelList/accountSources/index.ts src/services/modelPricing/modelPriceTable.ts src/services/apiCredentialProfiles/modelCatalog.ts src/features/ModelList/hooks/useModelData.ts src/features/ModelList/components/StatusIndicator.tsx src/locales/zh-CN/modelList.json src/locales/zh-TW/modelList.json src/locales/en/modelList.json src/locales/ja/modelList.json src/locales/vi/modelList.json tests/services/modelList/pricingResponse.test.ts tests/services/modelList/accountSources/readiness.test.ts tests/services/modelList/accountSources/tokenScopedFallback.test.ts tests/services/modelList/accountSources/sub2apiEstimates.test.ts tests/services/modelPricing/modelPriceTable.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx
pnpm run validate:staged
```

Expected: PASS. Existing unrelated untracked files must remain untracked and must not be staged.

- [ ] **Step 7: Run the push gate before publishing**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS. This gate is required before pushing or opening a PR because this slice touches shared service ownership, exported readiness contracts, locale keys, and Model List hook routing.

- [ ] **Step 8: Inspect final diff scope**

If tasks were committed individually, run:

```powershell
git show --stat --oneline HEAD~7..HEAD
git diff --name-status HEAD~7..HEAD
```

Expected changed files are limited to:

```text
src/services/modelList/pricingResponse.ts
src/services/modelList/accountSources/readiness.ts
src/services/modelList/accountSources/tokenScopedFallback.ts
src/services/modelList/accountSources/sub2apiEstimates.ts
src/services/modelList/accountSources/index.ts
src/services/modelPricing/modelPriceTable.ts
src/services/apiCredentialProfiles/modelCatalog.ts
src/features/ModelList/hooks/useModelData.ts
src/features/ModelList/components/StatusIndicator.tsx
src/locales/zh-CN/modelList.json
src/locales/zh-TW/modelList.json
src/locales/en/modelList.json
src/locales/ja/modelList.json
src/locales/vi/modelList.json
tests/services/modelList/pricingResponse.test.ts
tests/services/modelList/accountSources/readiness.test.ts
tests/services/modelList/accountSources/tokenScopedFallback.test.ts
tests/services/modelList/accountSources/sub2apiEstimates.test.ts
tests/services/modelPricing/modelPriceTable.test.ts
tests/services/apiCredentialProfiles/modelCatalog.test.ts
tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx
```

There should be no changes to telemetry schema, settings search, Playwright E2E tests, managed-site model sync, adapter capability contracts, new site-type registration, or account-site onboarding metadata.

- [ ] **Step 9: Final handoff notes**

Report:

```text
Focused tests:
- pnpm vitest run tests/services/modelList/pricingResponse.test.ts tests/services/modelList/accountSources/readiness.test.ts tests/services/modelList/accountSources/tokenScopedFallback.test.ts tests/services/modelList/accountSources/sub2apiEstimates.test.ts tests/services/modelPricing/modelPriceTable.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx tests/entrypoints/options/pages/ModelList/StatusIndicator.test.tsx

Locale validation:
- pnpm run i18n:extract:ci

Validation:
- pnpm vitest related --run src/services/modelList/pricingResponse.ts src/services/modelPricing/modelPriceTable.ts src/services/modelList/accountSources/readiness.ts src/services/modelList/accountSources/sub2apiEstimates.ts src/services/modelList/accountSources/tokenScopedFallback.ts src/services/apiCredentialProfiles/modelCatalog.ts src/features/ModelList/hooks/useModelData.ts src/features/ModelList/components/StatusIndicator.tsx
- pnpm compile
- pnpm run validate:staged
- pnpm run validate:push

Telemetry decision:
- Reuse existing. Model List load-completion events keep their hook-level owners and payload shape.

Settings search decision:
- None. No settings UI, anchors, deep links, or search definitions changed.

E2E decision:
- No Playwright E2E added. The changed behavior is deterministic service routing, hook state, and component copy covered by Vitest and Testing Library.
```

---

## Out Of Scope

- Do not add a new account site type.
- Do not add `modelPricing` to Sub2API.
- Do not move full Model List UI state, cache policy, toasts, token selection, or analytics into `SiteAdapter`.
- Do not add a generic adapter capability for Sub2API dashboard estimates in this slice.
- Do not change model filtering, sorting, source identity, or pricing row rendering.
- Do not change managed-site model sync.
- Do not manually edit docs translations under `docs/docs/en/**` or `docs/docs/ja/**`.
- Do not add telemetry fields, settings search entries, or Playwright E2E tests by default.

## Self-Review

- Spec coverage: Tasks 1, 2, 3, and 5 move misplaced ownership out of `apiCredentialProfiles`; Task 4 defines the readiness interface; Task 6 routes single-account and all-accounts Model List loading through readiness; Task 7 generalizes token-scoped fallback copy; Task 8 verifies migration completeness.
- Scope control: The plan keeps backend fetching in adapter capabilities, product policy in account-site profiles, and UI workflow state in the hook and component layer.
- Type consistency: The plan consistently uses `MODEL_LIST_ACCOUNT_SOURCE_ROUTES`, `MODEL_LIST_ACCOUNT_SOURCE_UNSUPPORTED_REASONS`, `ModelPricingCapability.fetchPricing(...)`, `ModelCatalogCapability.fetchModels(...)`, and `PricingResponse`.
- Behavior preservation: The plan keeps guard-before-cache behavior, AIHubMix profile-sourced direct-pricing fallback, Sub2API runtime-key catalog loading, partial-success all-accounts fallback, sanitized selected-token failures, existing analytics ownership, and no new E2E or telemetry surface.
