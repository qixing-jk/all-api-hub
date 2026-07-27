# AIHubMix Model List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AIHubMix accounts work in the existing Model List page by showing user-scoped models when possible and falling back to the `/api/v1/models` catalog with clear capability limits.

**Architecture:** Keep AIHubMix source semantics inside `src/services/apiService/aihubmix/` and expose them through the existing `fetchModelPricing(request)` account-backed path. Add a small optional model-list source marker to `PricingResponse`, then let Model List downgrade unsupported AIHubMix capabilities and show a catalog-fallback notice without creating an AIHubMix-only page.

**Tech Stack:** TypeScript, React, TanStack Query, Vitest, MSW, Testing Library, WXT extension code.

---

## File Structure

- Modify `src/services/apiService/common/type.ts`
  - Add optional model-list source metadata to `PricingResponse`.
  - Keep it optional so existing providers remain compatible.
- Modify `src/services/apiService/aihubmix/index.ts`
  - Add `/api/v1/models` catalog loading and mapping.
  - Add user-scope resolution order: `/api/user/available_models`, then `/call/usr/avail_mdls`.
  - Implement `fetchModelPricing(request)` for AIHubMix.
  - Keep `fetchAccountAvailableModels` aligned with user scope and remove `/api/models` from the new model-list path.
- Modify `tests/services/apiService/aihubmix/index.test.ts`
  - Add TDD coverage for AIHubMix catalog mapping, user scope, fallback, empty scope, missing catalog rows, empty groups, and no `/api/models` call.
- Modify `src/features/ModelList/modelManagementSources.ts`
  - Add a capability helper for catalog-only account sources.
- Modify `src/features/ModelList/hooks/useModelListData.ts`
  - Detect AIHubMix catalog fallback metadata and downgrade source capabilities.
  - Expose catalog fallback notice state separately from account-key fallback.
- Create `src/features/ModelList/aihubmixModelList.ts`
  - Keep AIHubMix fallback predicates out of `useModelListData.ts`.
  - Own predicates for AIHubMix fallback source status.
- Modify `src/features/ModelList/ModelList.tsx`
  - Render AIHubMix catalog fallback notice when the hook reports it.
- Modify `src/locales/zh-CN/modelList.json`
  - Add Chinese source copy for the AIHubMix catalog fallback notice.
- Modify generated locale files only through the repo i18n workflow if extraction updates them.
- Modify `tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx`
  - Cover capability downgrade for AIHubMix catalog fallback.
- Modify `tests/entrypoints/options/pages/ModelList/ModelListPageFlows.test.tsx`
  - Cover the visible fallback notice.
- Modify `tests/entrypoints/options/pages/ModelList/ControlPanel.capabilities.test.tsx`
  - Cover hidden pricing/group controls for catalog-only AIHubMix capability state.

## Task 1: Add PricingResponse Source Metadata

**Files:**
- Modify: `src/services/apiService/common/type.ts`
- Test: `pnpm compile`

- [ ] **Step 1: Add the optional source metadata type**

In `src/services/apiService/common/type.ts`, add these exports near the pricing types:

```ts
export const MODEL_LIST_SOURCE_KINDS = {
  USER_SCOPED: "user-scoped",
  CATALOG_FALLBACK: "catalog-fallback",
} as const

export type ModelListSourceKind =
  (typeof MODEL_LIST_SOURCE_KINDS)[keyof typeof MODEL_LIST_SOURCE_KINDS]

export interface ModelListSourceInfo {
  kind: ModelListSourceKind
  provider?: string
}
```

Then extend `PricingResponse`:

```ts
export interface PricingResponse {
  data: ModelPricing[]
  group_ratio: Record<string, number>
  success: boolean
  usable_group: Record<string, string>
  model_list_source?: ModelListSourceInfo
}
```

- [ ] **Step 2: Run a type check for the changed type surface**

Run:

```bash
pnpm compile
```

Expected: pass.

- [ ] **Step 3: Commit the shared type change**

```bash
git add src/services/apiService/common/type.ts
git commit -m "feat(model-list): add model source metadata"
```

## Task 2: Test AIHubMix Model Source Semantics

**Files:**
- Modify: `tests/services/apiService/aihubmix/index.test.ts`
- Later modify: `src/services/apiService/aihubmix/index.ts`

- [ ] **Step 1: Import `fetchModelPricing` and source kind constants in the AIHubMix adapter test**

Add `fetchModelPricing` to the existing AIHubMix import:

```ts
import {
  createApiToken,
  deleteApiToken,
  extractDefaultExchangeRate,
  fetchAccountAvailableModels,
  fetchAccountData,
  fetchAccountQuota,
  fetchAccountTokens,
  fetchAllModels,
  fetchCheckInStatus,
  fetchModelPricing,
  fetchSiteStatus,
  fetchSupportCheckIn,
  fetchTodayIncome,
  fetchTodayUsage,
  fetchTokenById,
  fetchUserGroups,
  fetchUserInfo,
  getOrCreateAccessToken,
  refreshAccountData,
  resolveApiTokenKey,
  searchApiTokens,
  updateApiToken,
  validateAccountConnection,
} from "~/services/apiService/aihubmix"
import { MODEL_LIST_SOURCE_KINDS } from "~/services/apiService/common/type"
```

- [ ] **Step 2: Add the user-scoped catalog mapping test**

Append this test near the existing model-list tests:

```ts
it("maps AIHubMix /api/v1/models catalog through the user-scoped model list", async () => {
  let legacyModelsCalled = false
  server.use(
    http.get("https://aihubmix.com/api/v1/models", () =>
      HttpResponse.json({
        success: true,
        message: "",
        data: [
          {
            model_id: "gpt-4o-mini",
            desc: "Fast OpenAI model",
            developer_id: 1,
            developer_name: "OpenAI",
            endpoints: ["chat"],
            pricing: {
              input: 0.15,
              output: 0.6,
            },
          },
          {
            model_id: "claude-3-5-sonnet",
            desc: "Anthropic model",
            developer_id: 2,
            developer_name: "Anthropic",
            endpoints: ["chat"],
          },
        ],
      }),
    ),
    http.get("https://aihubmix.com/api/user/available_models", () =>
      HttpResponse.json({
        success: true,
        message: "",
        data: [{ model: "gpt-4o-mini", developer_id: 1, order: 10 }],
      }),
    ),
    http.get("https://aihubmix.com/api/models", () => {
      legacyModelsCalled = true
      return HttpResponse.json({ success: true, message: "", data: {} })
    }),
  )

  await expect(fetchModelPricing(baseRequest)).resolves.toMatchObject({
    success: true,
    group_ratio: {},
    usable_group: {},
    model_list_source: {
      kind: MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
      provider: "AIHubMix",
    },
    data: [
      {
        model_name: "gpt-4o-mini",
        model_description: "Fast OpenAI model",
        owner_by: "OpenAI",
        enable_groups: [],
        supported_endpoint_types: ["chat"],
      },
    ],
  })
  expect(legacyModelsCalled).toBe(false)
})
```

- [ ] **Step 3: Add the `/call/usr/avail_mdls` fallback test**

```ts
it("falls back from /api/user/available_models to /call/usr/avail_mdls for user-scoped AIHubMix models", async () => {
  let webAvailableModelsCalled = false
  server.use(
    http.get("https://aihubmix.com/api/v1/models", () =>
      HttpResponse.json({
        success: true,
        message: "",
        data: [
          { model_id: "gpt-web-scope", desc: "Web scope model" },
          { model_id: "gpt-catalog-only", desc: "Catalog only model" },
        ],
      }),
    ),
    http.get("https://aihubmix.com/api/user/available_models", () =>
      HttpResponse.json(
        { success: false, message: "removed", data: [] },
        { status: 404 },
      ),
    ),
    http.get("https://aihubmix.com/call/usr/avail_mdls", () => {
      webAvailableModelsCalled = true
      return HttpResponse.json({
        success: true,
        message: "",
        data: [{ model: "gpt-web-scope", developer_id: 1, order: 1 }],
      })
    }),
  )

  const pricing = await fetchModelPricing(baseRequest)

  expect(webAvailableModelsCalled).toBe(true)
  expect(pricing.model_list_source?.kind).toBe(
    MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
  )
  expect(pricing.data.map((model) => model.model_name)).toEqual([
    "gpt-web-scope",
  ])
})
```

- [ ] **Step 4: Add the full catalog fallback test**

```ts
it("uses the full AIHubMix catalog with fallback metadata when user-scoped endpoints fail", async () => {
  server.use(
    http.get("https://aihubmix.com/api/v1/models", () =>
      HttpResponse.json({
        success: true,
        message: "",
        data: [
          { model_id: "gpt-catalog-a", desc: "Catalog model A" },
          { model_id: "gpt-catalog-b", desc: "Catalog model B" },
        ],
      }),
    ),
    http.get("https://aihubmix.com/api/user/available_models", () =>
      HttpResponse.json(
        { success: false, message: "removed", data: [] },
        { status: 404 },
      ),
    ),
    http.get("https://aihubmix.com/call/usr/avail_mdls", () =>
      HttpResponse.json(
        { success: false, message: "not authenticated", data: [] },
        { status: 401 },
      ),
    ),
  )

  await expect(fetchModelPricing(baseRequest)).resolves.toMatchObject({
    success: true,
    group_ratio: {},
    usable_group: {},
    model_list_source: {
      kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
      provider: "AIHubMix",
    },
    data: [
      { model_name: "gpt-catalog-a", enable_groups: [] },
      { model_name: "gpt-catalog-b", enable_groups: [] },
    ],
  })
})
```

- [ ] **Step 5: Add empty user-scope and missing catalog row tests**

```ts
it("treats a successful empty AIHubMix user scope as an empty model list", async () => {
  server.use(
    http.get("https://aihubmix.com/api/v1/models", () =>
      HttpResponse.json({
        success: true,
        message: "",
        data: [{ model_id: "gpt-catalog-only", desc: "Catalog model" }],
      }),
    ),
    http.get("https://aihubmix.com/api/user/available_models", () =>
      HttpResponse.json({ success: true, message: "", data: [] }),
    ),
  )

  const pricing = await fetchModelPricing(baseRequest)

  expect(pricing.model_list_source?.kind).toBe(
    MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
  )
  expect(pricing.data).toEqual([])
})

it("keeps AIHubMix user-scoped model ids that are missing from the catalog as minimal rows", async () => {
  server.use(
    http.get("https://aihubmix.com/api/v1/models", () =>
      HttpResponse.json({
        success: true,
        message: "",
        data: [{ model_id: "gpt-known", desc: "Known model" }],
      }),
    ),
    http.get("https://aihubmix.com/api/user/available_models", () =>
      HttpResponse.json({
        success: true,
        message: "",
        data: [{ model: "gpt-missing-from-catalog" }],
      }),
    ),
  )

  await expect(fetchModelPricing(baseRequest)).resolves.toMatchObject({
    data: [
      {
        model_name: "gpt-missing-from-catalog",
        model_description: "",
        model_ratio: 0,
        completion_ratio: 0,
        enable_groups: [],
        supported_endpoint_types: [],
      },
    ],
  })
})
```

- [ ] **Step 6: Run the new tests and confirm they fail before implementation**

Run:

```bash
pnpm vitest --run tests/services/apiService/aihubmix/index.test.ts
```

Expected: fail because `fetchModelPricing` is not exported from the AIHubMix adapter and `/api/v1/models` is not implemented.

## Task 3: Implement AIHubMix Model Pricing Adapter

**Files:**
- Modify: `src/services/apiService/aihubmix/index.ts`
- Test: `tests/services/apiService/aihubmix/index.test.ts`

- [ ] **Step 1: Update imports and endpoint constants**

In `src/services/apiService/aihubmix/index.ts`, add `ModelPricing`, `PricingResponse`, and source constants to the type import:

```ts
  MODEL_LIST_SOURCE_KINDS,
  type ModelPricing,
  type PricingResponse,
```

Add constants near the existing endpoint constants:

```ts
const AIHUBMIX_MODEL_CATALOG_ENDPOINT = "/api/v1/models"
const AIHUBMIX_USER_AVAILABLE_MODELS_ENDPOINT = "/api/user/available_models"
const AIHUBMIX_WEB_AVAILABLE_MODELS_ENDPOINT = "/call/usr/avail_mdls"
```

- [ ] **Step 2: Replace the old catalog types with `/api/v1/models` types**

Replace the current `AIHubMixCatalogModel` / `AIHubMixCatalogModels` types with:

```ts
type AIHubMixUserAvailableModel = {
  model: string
  developer_id?: number
  order?: number
}

type AIHubMixModelCatalogItem = {
  model_id?: string
  id?: string
  name?: string
  desc?: string
  description?: string
  developer_id?: number | string
  developer_name?: string
  developer?: string
  owner_by?: string
  type?: string
  endpoints?: string[] | string
  pricing?: {
    input?: number | string
    output?: number | string
  }
}
```

- [ ] **Step 3: Add focused normalization helpers**

Add these helpers after `normalizeModelIds`:

```ts
const normalizeStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

const getAIHubMixCatalogModelId = (
  model: AIHubMixModelCatalogItem,
): string => {
  const candidate = model.model_id ?? model.id ?? model.name ?? ""
  return typeof candidate === "string" ? candidate.trim() : ""
}

const buildAIHubMixModelPricing = (
  modelId: string,
  catalogItem?: AIHubMixModelCatalogItem,
): ModelPricing => {
  const inputPrice = toFiniteNumber(catalogItem?.pricing?.input)
  const outputPrice = toFiniteNumber(catalogItem?.pricing?.output)
  const hasTokenPricing = inputPrice > 0 || outputPrice > 0

  return {
    model_name: modelId,
    model_description:
      typeof catalogItem?.desc === "string"
        ? catalogItem.desc
        : typeof catalogItem?.description === "string"
          ? catalogItem.description
          : "",
    quota_type: 0,
    model_ratio: hasTokenPricing ? inputPrice : 0,
    model_price: 0,
    owner_by:
      typeof catalogItem?.developer_name === "string"
        ? catalogItem.developer_name
        : typeof catalogItem?.developer === "string"
          ? catalogItem.developer
          : typeof catalogItem?.owner_by === "string"
            ? catalogItem.owner_by
            : catalogItem?.developer_id != null
              ? String(catalogItem.developer_id)
              : undefined,
    completion_ratio: hasTokenPricing && inputPrice > 0 ? outputPrice / inputPrice : 0,
    enable_groups: [],
    supported_endpoint_types: normalizeStringList(catalogItem?.endpoints),
  }
}
```

If the lint step rejects the long `completion_ratio` line, split it before committing.

- [ ] **Step 4: Add catalog and user-scope fetch helpers**

Add these helpers before the public model functions:

```ts
const fetchAIHubMixModelCatalog = async (
  request: ApiServiceRequest,
): Promise<AIHubMixModelCatalogItem[]> => {
  const payload = await fetchAIHubMixData<unknown>(
    request,
    AIHUBMIX_MODEL_CATALOG_ENDPOINT,
  )

  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is AIHubMixModelCatalogItem =>
        !!item && typeof item === "object",
    )
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    if (Array.isArray(record.data)) {
      return record.data.filter(
        (item): item is AIHubMixModelCatalogItem =>
          !!item && typeof item === "object",
      )
    }
  }

  throw new ApiError(
    t("messages:errors.api.invalidResponseFormat"),
    undefined,
    AIHUBMIX_MODEL_CATALOG_ENDPOINT,
  )
}

const fetchAIHubMixUserScopedModelIds = async (
  request: ApiServiceRequest,
): Promise<string[] | null> => {
  try {
    const payload = await fetchAIHubMixData<AIHubMixUserAvailableModel[]>(
      request,
      AIHUBMIX_USER_AVAILABLE_MODELS_ENDPOINT,
    )
    return normalizeModelIds(payload)
  } catch (error) {
    logger.warn(
      "Failed to fetch AIHubMix API user available models; trying web available models",
      error,
    )
  }

  try {
    const payload = await fetchAIHubMixData<AIHubMixUserAvailableModel[]>(
      request,
      AIHUBMIX_WEB_AVAILABLE_MODELS_ENDPOINT,
    )
    return normalizeModelIds(payload)
  } catch (error) {
    logger.warn(
      "Failed to fetch AIHubMix web available models; using catalog fallback",
      error,
    )
    return null
  }
}
```

- [ ] **Step 5: Implement the pricing response builder and public functions**

Add:

```ts
const buildAIHubMixPricingResponse = (params: {
  catalog: AIHubMixModelCatalogItem[]
  userScopedModelIds: string[] | null
}): PricingResponse => {
  const catalogByModelId = new Map<string, AIHubMixModelCatalogItem>()

  for (const item of params.catalog) {
    const modelId = getAIHubMixCatalogModelId(item)
    if (modelId && !catalogByModelId.has(modelId)) {
      catalogByModelId.set(modelId, item)
    }
  }

  const modelIds =
    params.userScopedModelIds === null
      ? Array.from(catalogByModelId.keys())
      : params.userScopedModelIds

  return {
    success: true,
    group_ratio: {},
    usable_group: {},
    model_list_source: {
      kind:
        params.userScopedModelIds === null
          ? MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK
          : MODEL_LIST_SOURCE_KINDS.USER_SCOPED,
      provider: "AIHubMix",
    },
    data: modelIds.map((modelId) =>
      buildAIHubMixModelPricing(modelId, catalogByModelId.get(modelId)),
    ),
  }
}

export async function fetchModelPricing(
  request: ApiServiceRequest,
): Promise<PricingResponse> {
  const catalog = await fetchAIHubMixModelCatalog(request)
  const userScopedModelIds = await fetchAIHubMixUserScopedModelIds(request)

  return buildAIHubMixPricingResponse({
    catalog,
    userScopedModelIds,
  })
}
```

Then update:

```ts
export async function fetchAccountAvailableModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  const userScopedModelIds = await fetchAIHubMixUserScopedModelIds(request)
  if (userScopedModelIds !== null) {
    return userScopedModelIds
  }

  return fetchAllModels(request)
}

export async function fetchAllModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  const catalog = await fetchAIHubMixModelCatalog(request)
  return catalog.map(getAIHubMixCatalogModelId).filter(Boolean)
}
```

- [ ] **Step 6: Run AIHubMix adapter tests**

Run:

```bash
pnpm vitest --run tests/services/apiService/aihubmix/index.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit the adapter behavior**

```bash
git add src/services/apiService/aihubmix/index.ts tests/services/apiService/aihubmix/index.test.ts
git commit -m "feat(aihubmix): load model list from scoped catalog"
```

## Task 4: Add Model List Capability Downgrade for AIHubMix Catalog Fallback

**Files:**
- Create: `src/features/ModelList/aihubmixModelList.ts`
- Modify: `src/features/ModelList/modelManagementSources.ts`
- Modify: `src/features/ModelList/hooks/useModelListData.ts`
- Test: `tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx`

- [ ] **Step 1: Add a failing hook test for AIHubMix catalog fallback**

In `tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx`, add imports:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import { MODEL_LIST_SOURCE_KINDS } from "~/services/apiService/common/type"
```

Add this test near existing capability tests:

```ts
it("downgrades AIHubMix catalog fallback results to catalog-only capabilities", () => {
  mockUseModelData.mockReturnValue(
    buildModelData({
      pricingData: {
        success: true,
        data: [],
        group_ratio: {},
        usable_group: {},
        model_list_source: {
          kind: MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK,
          provider: "AIHubMix",
        },
      },
    }),
  )

  const account = createDisplayAccount({
    id: "aihubmix-account",
    siteType: SITE_TYPES.AIHUBMIX,
  })
  mockUseAccountData.mockReturnValue({
    enabledDisplayData: [account],
  })

  const { result } = renderHook(() => useModelListData(), {
    wrapper: createWrapper(),
  })

  act(() => {
    result.current.setSelectedSourceValue(`account:${account.id}`)
  })

  expect(result.current.isAihubmixCatalogFallbackActive).toBe(true)
  expect(result.current.sourceCapabilities.supportsPricing).toBe(false)
  expect(result.current.sourceCapabilities.supportsGroupFiltering).toBe(false)
  expect(result.current.sourceCapabilities.supportsAccountSummary).toBe(false)
  expect(result.current.sourceCapabilities.supportsTokenCompatibility).toBe(false)
})
```

- [ ] **Step 2: Run the hook test and confirm it fails**

Run:

```bash
pnpm vitest --run tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx
```

Expected: fail because `isAihubmixCatalogFallbackActive` and the capability downgrade do not exist yet.

- [ ] **Step 3: Add a helper for AIHubMix model-list status**

Create `src/features/ModelList/aihubmixModelList.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import { MODEL_LIST_SOURCE_KINDS } from "~/services/apiService/common/type"
import type { PricingResponse } from "~/services/apiService/common/type"
import type { DisplaySiteData } from "~/types"

export function isAihubmixCatalogFallbackPricing(
  account: DisplaySiteData | undefined,
  pricing: PricingResponse | null | undefined,
) {
  return (
    account?.siteType === SITE_TYPES.AIHUBMIX &&
    pricing?.model_list_source?.provider === "AIHubMix" &&
    pricing.model_list_source.kind === MODEL_LIST_SOURCE_KINDS.CATALOG_FALLBACK
  )
}
```

- [ ] **Step 4: Add a catalog-only account capability helper**

In `src/features/ModelList/modelManagementSources.ts`, add:

```ts
export function toCatalogOnlyAccountCapabilities(
  capabilities: ModelManagementSourceCapabilities,
): ModelManagementSourceCapabilities {
  return {
    ...toCatalogOnlyCapabilities(capabilities),
    supportsTokenCompatibility: false,
  }
}
```

- [ ] **Step 5: Use the helper in `useModelListData`**

In `src/features/ModelList/hooks/useModelListData.ts`, import:

```ts
import { isAihubmixCatalogFallbackPricing } from "../aihubmixModelList"
import {
  EMPTY_MODEL_MANAGEMENT_CAPABILITIES,
  isProfileSourceValue,
  MODEL_MANAGEMENT_SOURCE_KINDS,
  NO_MODEL_MANAGEMENT_SOURCE_VALUE,
  resolveModelManagementSource,
  toAccountSourceValue,
  toCatalogOnlyAccountCapabilities,
  toCatalogOnlyCapabilities,
  toProfileSourceValue,
  type ModelManagementSource,
} from "../modelManagementSources"
```

Add:

```ts
const isAihubmixCatalogFallbackActive = isAihubmixCatalogFallbackPricing(
  currentAccount,
  modelData.pricingData,
)
```

Update the capability derivation:

```ts
const sourceCapabilities = useMemo(() => {
  const baseCapabilities =
    selectedSource?.capabilities ?? EMPTY_MODEL_MANAGEMENT_CAPABILITIES

  if (isAihubmixCatalogFallbackActive) {
    return toCatalogOnlyAccountCapabilities(baseCapabilities)
  }

  return isFallbackCatalogActive
    ? toCatalogOnlyCapabilities(baseCapabilities)
    : baseCapabilities
}, [
  isAihubmixCatalogFallbackActive,
  isFallbackCatalogActive,
  selectedSource?.capabilities,
])
```

Return the new flag:

```ts
isAihubmixCatalogFallbackActive,
```

- [ ] **Step 6: Run the hook test**

Run:

```bash
pnpm vitest --run tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit the hook capability change**

```bash
git add src/features/ModelList/aihubmixModelList.ts src/features/ModelList/modelManagementSources.ts src/features/ModelList/hooks/useModelListData.ts tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx
git commit -m "feat(model-list): mark AIHubMix catalog fallback"
```

## Task 5: Show AIHubMix Catalog Fallback Notice and Hide Inapplicable Controls

**Files:**
- Modify: `src/features/ModelList/ModelList.tsx`
- Modify: `src/locales/zh-CN/modelList.json`
- Test: `tests/entrypoints/options/pages/ModelList/ModelListPageFlows.test.tsx`
- Test: `tests/entrypoints/options/pages/ModelList/ControlPanel.capabilities.test.tsx`

- [ ] **Step 1: Add a failing page-flow test for the AIHubMix fallback notice**

In `tests/entrypoints/options/pages/ModelList/ModelListPageFlows.test.tsx`, add a state with `isAihubmixCatalogFallbackActive: true` and assert the notice:

```ts
it("shows the AIHubMix catalog fallback notice separately from account-key fallback", async () => {
  mockUseModelListData.mockReturnValue(
    buildState({
      isFallbackCatalogActive: false,
      isAihubmixCatalogFallbackActive: true,
      pricingData: {
        success: true,
        data: [{ model_name: "gpt-aihubmix" }],
        group_ratio: {},
        usable_group: {},
      },
      baseFilteredModels: [
        {
          model: { model_name: "gpt-aihubmix" },
          source: createAccountSource(ACCOUNT),
        },
      ],
    }),
  )

  render(<ModelList />, {
    withUserPreferencesProvider: false,
    withThemeProvider: false,
  })

  expect(
    await screen.findByText("modelList:aihubmixCatalogFallbackNotice.title"),
  ).toBeInTheDocument()
  expect(
    screen.queryByText("modelList:fallbackSourceNotice.title"),
  ).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Add a ControlPanel capability test**

In `tests/entrypoints/options/pages/ModelList/ControlPanel.capabilities.test.tsx`, add:

```ts
it("hides pricing and group controls for catalog-only account capabilities", async () => {
  render(
    <ControlPanel
      selectedSource={{ kind: "account", account: { name: "AIHubMix" } } as any}
      sourceCapabilities={{
        supportsPricing: false,
        supportsGroupFiltering: false,
        supportsAccountSummary: false,
        supportsTokenCompatibility: false,
        supportsCredentialVerification: true,
        supportsBatchCredentialVerification: true,
        supportsCliVerification: true,
      }}
      searchTerm=""
      setSearchTerm={vi.fn()}
      sortMode={MODEL_LIST_SORT_MODES.DEFAULT}
      setSortMode={vi.fn()}
      selectedBillingMode={MODEL_LIST_BILLING_MODES.ALL}
      setSelectedBillingMode={vi.fn()}
      selectedGroups={[]}
      setSelectedGroups={vi.fn()}
      availableGroups={["default"]}
      pricingData={{ group_ratio: { default: 1 } }}
      showRealPrice={false}
      setShowRealPrice={vi.fn()}
      showRatioColumn={false}
      setShowRatioColumn={vi.fn()}
      showEndpointTypes={true}
      setShowEndpointTypes={vi.fn()}
      totalModels={1}
      filteredModels={[{ model: { model_name: "gpt-aihubmix" } }]}
    />,
  )

  expect(await screen.findByText("modelList:searchModels")).toBeInTheDocument()
  expect(screen.queryByText("modelList:userGroup")).not.toBeInTheDocument()
  expect(screen.queryByText("modelList:sortBy")).not.toBeInTheDocument()
  expect(screen.queryByText("modelList:billingMode")).not.toBeInTheDocument()
  expect(screen.queryByText("modelList:realAmount")).not.toBeInTheDocument()
  expect(screen.queryByText("modelList:showRatio")).not.toBeInTheDocument()
})
```

- [ ] **Step 3: Run the page/control tests and confirm page test fails**

Run:

```bash
pnpm vitest --run tests/entrypoints/options/pages/ModelList/ModelListPageFlows.test.tsx tests/entrypoints/options/pages/ModelList/ControlPanel.capabilities.test.tsx
```

Expected: page-flow test fails because the AIHubMix notice is not rendered yet. The ControlPanel capability test passes because those controls are already driven by capability flags.

- [ ] **Step 4: Add source copy to Chinese locale**

In `src/locales/zh-CN/modelList.json`, add near `fallbackSourceNotice`:

```json
"aihubmixCatalogFallbackNotice": {
  "description": "当前显示 AIHubMix 完整模型目录；账号实际可用范围暂未确认。请以站点账号权限和实际调用结果为准。",
  "title": "AIHubMix 完整目录视图"
},
```

- [ ] **Step 5: Render the AIHubMix fallback notice**

In `src/features/ModelList/ModelList.tsx`, destructure from `useModelListData`:

```ts
isAihubmixCatalogFallbackActive,
```

Then render this before or next to the existing account-key fallback notice:

```tsx
{isAihubmixCatalogFallbackActive && (
  <Alert
    variant="info"
    className="mb-6"
    title={t("aihubmixCatalogFallbackNotice.title")}
    description={t("aihubmixCatalogFallbackNotice.description")}
  />
)}
```

Keep the existing `isFallbackCatalogActive` notice unchanged.

- [ ] **Step 6: Run i18n extraction check**

Run:

```bash
pnpm run i18n:extract:ci
```

Expected: pass with no unexpected locale drift. If it updates locale files, inspect the diff and include generated locale files in this task commit.

- [ ] **Step 7: Run the page/control tests**

Run:

```bash
pnpm vitest --run tests/entrypoints/options/pages/ModelList/ModelListPageFlows.test.tsx tests/entrypoints/options/pages/ModelList/ControlPanel.capabilities.test.tsx
```

Expected: pass.

- [ ] **Step 8: Commit the UI notice and capability tests**

```bash
git add src/features/ModelList/ModelList.tsx src/locales/zh-CN/modelList.json tests/entrypoints/options/pages/ModelList/ModelListPageFlows.test.tsx tests/entrypoints/options/pages/ModelList/ControlPanel.capabilities.test.tsx
git commit -m "feat(model-list): show AIHubMix catalog fallback notice"
```

If `pnpm run i18n:extract:ci` generated `src/locales/en/modelList.json`, `src/locales/ja/modelList.json`, `src/locales/zh-TW/modelList.json`, or `src/locales/vi/modelList.json`, add those generated files to the same commit after inspecting the diff.

## Task 6: Final Integration Validation

**Files:**
- Verify final staged and committed diff across all task files.

- [ ] **Step 1: Run focused affected tests**

Run:

```bash
pnpm vitest --run tests/services/apiService/aihubmix/index.test.ts tests/entrypoints/options/pages/ModelList/useModelListData.test.tsx tests/entrypoints/options/pages/ModelList/ModelListPageFlows.test.tsx tests/entrypoints/options/pages/ModelList/ControlPanel.capabilities.test.tsx
```

Expected: pass.

- [ ] **Step 2: Run type-check**

Run:

```bash
pnpm compile
```

Expected: pass.

- [ ] **Step 3: Run staged validation on task-scoped files**

If there are uncommitted task files, stage only those files and run:

```bash
pnpm run validate:staged
```

Expected: pass. If there are no staged files because each task has already been committed, run:

```bash
pnpm run i18n:extract:ci
```

Expected: pass with no unexpected locale updates.

- [ ] **Step 4: Inspect final status and log**

Run:

```bash
git status --porcelain
git log --oneline -5
```

Expected: only unrelated pre-existing untracked files such as `notify.py` and `store-description/` remain, and the recent commits correspond to this plan.

- [ ] **Step 5: Final implementation handoff**

Report:

- commits created.
- validation commands run and results.
- whether any generated locale files changed.
- that E2E was not added because the implemented risk stayed in adapter semantics and Model List state tests.
- any unrelated local files left untouched.
