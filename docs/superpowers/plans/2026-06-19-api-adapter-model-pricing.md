# API Adapter Model Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move normal account model-pricing loads from the legacy `getApiService(...)` facade to `SiteAdapter.modelPricing`.

**Architecture:** Add a narrow `modelPricing` Adapter capability for the normal account-pricing contract. New API-family and AIHubMix adapters delegate to existing backend helpers, while Sub2API intentionally keeps only `modelCatalog` and product-owned runtime-key fallback logic.

**Tech Stack:** TypeScript, React Query, WXT extension services, existing `apiAdapters`, Vitest, `pnpm run validate:staged`.

**Spec:** `docs/superpowers/specs/2026-06-19-api-adapter-model-pricing-design.md`

---

## File Structure

- Create `src/services/apiAdapters/contracts/modelPricing.ts`
  - Defines `ModelPricingCapability` and `ModelPricingRequest`.
- Modify `src/services/apiAdapters/contracts/siteAdapter.ts`
  - Adds optional `modelPricing?: ModelPricingCapability`.
- Create `src/services/apiAdapters/newApi/modelPricing.ts`
  - Binds New API-family pricing to `getApiService(siteType).fetchModelPricing(...)`.
- Modify `src/services/apiAdapters/newApi/index.ts`
  - Registers `modelPricing` for every New API-family adapter instance.
- Create `src/services/apiAdapters/aihubmix/modelPricing.ts`
  - Delegates AIHubMix pricing to `fetchModelPricing(...)`.
- Modify `src/services/apiAdapters/aihubmix/index.ts`
  - Registers `modelPricing`.
- Do not modify `src/services/apiAdapters/sub2api/index.ts`
  - Sub2API intentionally does not expose normal account `modelPricing`.
- Create `tests/services/apiAdapters/modelPricing.test.ts`
  - Covers adapter delegation for New API-family and AIHubMix.
- Modify `tests/services/apiAdapters/registry.test.ts`
  - Asserts New API-family and AIHubMix expose `modelPricing`, and Sub2API does not.
- Modify `src/services/apiCredentialProfiles/modelCatalog.ts`
  - Routes AIHubMix selected-token fallback through `getSiteAdapter(...).modelPricing`.
- Modify `tests/services/apiCredentialProfiles/modelCatalog.test.ts`
  - Updates AIHubMix fallback tests from `getApiService` to Adapter-backed pricing.
- Modify `src/features/ModelList/hooks/useModelData.ts`
  - Routes single-account and all-accounts normal pricing through `getSiteAdapter(...).modelPricing`.
  - Preserves Sub2API runtime-key fallback paths.
- Modify `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`
  - Updates normal pricing mocks to Adapter-backed pricing.
  - Preserves Sub2API fallback and cache guard coverage.

---

### Task 1: Add Adapter Model Pricing Capability

**Files:**
- Create: `src/services/apiAdapters/contracts/modelPricing.ts`
- Create: `src/services/apiAdapters/newApi/modelPricing.ts`
- Create: `src/services/apiAdapters/aihubmix/modelPricing.ts`
- Modify: `src/services/apiAdapters/contracts/siteAdapter.ts`
- Modify: `src/services/apiAdapters/newApi/index.ts`
- Modify: `src/services/apiAdapters/aihubmix/index.ts`
- Create: `tests/services/apiAdapters/modelPricing.test.ts`
- Modify: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Write the failing adapter delegation test**

Create `tests/services/apiAdapters/modelPricing.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { aihubmixModelPricing } from "~/services/apiAdapters/aihubmix/modelPricing"
import { createNewApiModelPricing } from "~/services/apiAdapters/newApi/modelPricing"
import { AuthTypeEnum } from "~/types"

const {
  mockAihubmixFetchModelPricing,
  mockFetchModelPricing,
  mockGetApiService,
} = vi.hoisted(() => ({
  mockAihubmixFetchModelPricing: vi.fn(),
  mockFetchModelPricing: vi.fn(),
  mockGetApiService: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  fetchModelPricing: mockAihubmixFetchModelPricing,
}))

const request = {
  baseUrl: "https://api.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "7",
    accessToken: "account-token",
  },
}

const pricingResponse = {
  success: true,
  data: [
    {
      model_name: "example-model",
      quota_type: 0,
      model_ratio: 1,
      model_price: 0,
      completion_ratio: 1,
      enable_groups: [],
      supported_endpoint_types: [],
    },
  ],
  group_ratio: {},
  usable_group: {},
}

describe("apiAdapter modelPricing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiService.mockReturnValue({
      fetchModelPricing: mockFetchModelPricing,
    })
  })

  it("delegates New API-family model pricing through the site-specific apiService", async () => {
    mockFetchModelPricing.mockResolvedValueOnce(pricingResponse)

    const modelPricing = createNewApiModelPricing(SITE_TYPES.ONE_HUB)

    expect(mockGetApiService).not.toHaveBeenCalled()

    await expect(modelPricing.fetchPricing(request)).resolves.toBe(
      pricingResponse,
    )

    expect(mockGetApiService).toHaveBeenCalledWith(SITE_TYPES.ONE_HUB)
    expect(mockFetchModelPricing).toHaveBeenCalledWith(request)
  })

  it("delegates AIHubMix model pricing to the AIHubMix helper", async () => {
    mockAihubmixFetchModelPricing.mockResolvedValueOnce(pricingResponse)

    await expect(aihubmixModelPricing.fetchPricing(request)).resolves.toBe(
      pricingResponse,
    )

    expect(mockAihubmixFetchModelPricing).toHaveBeenCalledWith(request)
    expect(mockGetApiService).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Update registry expectations to require the new capability**

Modify `tests/services/apiAdapters/registry.test.ts`.

In the Sub2API test, after the `accountRefresh` expectation, add:

```ts
    expect(adapter.modelPricing).toBeUndefined()
```

In the New API-family loop, after the `accountRefresh` expectation, add:

```ts
      expect(adapter.modelPricing).toEqual({
        fetchPricing: expect.any(Function),
      })
```

In the AIHubMix test, after the `accountRefresh` expectation, add:

```ts
    expect(adapter.modelPricing).toEqual({
      fetchPricing: expect.any(Function),
    })
```

- [ ] **Step 3: Run adapter tests and verify the expected failure**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/modelPricing.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: FAIL because `modelPricing` contract and adapter modules do not exist yet.

- [ ] **Step 4: Add the model pricing contract**

Create `src/services/apiAdapters/contracts/modelPricing.ts`:

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

- [ ] **Step 5: Extend `SiteAdapter`**

Modify `src/services/apiAdapters/contracts/siteAdapter.ts`.

Add the import:

```ts
import type { ModelPricingCapability } from "./modelPricing"
```

Add the optional property to `SiteAdapter`:

```ts
  modelPricing?: ModelPricingCapability
```

The final type should include:

```ts
export type SiteAdapter = {
  siteType: AccountSiteType
  family?: SiteBackendFamily
  siteNotice?: SiteNoticeCapability
  siteAnnouncements?: SiteAnnouncementsCapability
  modelCatalog?: ModelCatalogCapability
  accountCompletion?: AccountCompletionCapability
  keyManagement?: KeyManagementCapability
  accountRefresh?: AccountRefreshCapability
  modelPricing?: ModelPricingCapability
}
```

- [ ] **Step 6: Add New API-family model pricing**

Create `src/services/apiAdapters/newApi/modelPricing.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { getApiService } from "~/services/apiService"

/**
 * Create account model-pricing operations bound to the New API-family site type.
 */
export function createNewApiModelPricing(
  siteType: AccountSiteType,
): ModelPricingCapability {
  return {
    fetchPricing: (request) =>
      getApiService(siteType).fetchModelPricing(request),
  }
}
```

Modify `src/services/apiAdapters/newApi/index.ts`.

Add:

```ts
import { createNewApiModelPricing } from "./modelPricing"
```

Add the property inside `createNewApiAdapter(...)`:

```ts
  modelPricing: createNewApiModelPricing(siteType),
```

The returned object should include:

```ts
export const createNewApiAdapter = (
  siteType: AccountSiteType = SITE_TYPES.NEW_API,
): SiteAdapter => ({
  siteType,
  family: "newApiFamily",
  siteNotice: newApiSiteNotice,
  accountCompletion: newApiAccountCompletion,
  keyManagement: createNewApiKeyManagement(siteType),
  accountRefresh: createNewApiAccountRefresh(siteType),
  modelPricing: createNewApiModelPricing(siteType),
})
```

- [ ] **Step 7: Add AIHubMix model pricing**

Create `src/services/apiAdapters/aihubmix/modelPricing.ts`:

```ts
import type { ModelPricingCapability } from "~/services/apiAdapters/contracts/modelPricing"
import { fetchModelPricing } from "~/services/apiService/aihubmix"

export const aihubmixModelPricing: ModelPricingCapability = {
  fetchPricing: (request) => fetchModelPricing(request),
}
```

Modify `src/services/apiAdapters/aihubmix/index.ts`.

Add:

```ts
import { aihubmixModelPricing } from "./modelPricing"
```

Add the property inside `aihubmixAdapter`:

```ts
  modelPricing: aihubmixModelPricing,
```

The object should include:

```ts
export const aihubmixAdapter: SiteAdapter = {
  siteType: SITE_TYPES.AIHUBMIX,
  accountCompletion: aihubmixAccountCompletion,
  keyManagement: aihubmixKeyManagement,
  accountRefresh: aihubmixAccountRefresh,
  modelPricing: aihubmixModelPricing,
}
```

Do not add `modelPricing` to `src/services/apiAdapters/sub2api/index.ts`.

- [ ] **Step 8: Run adapter tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/modelPricing.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit adapter capability**

Run:

```powershell
git add src/services/apiAdapters/contracts/modelPricing.ts src/services/apiAdapters/contracts/siteAdapter.ts src/services/apiAdapters/newApi/modelPricing.ts src/services/apiAdapters/newApi/index.ts src/services/apiAdapters/aihubmix/modelPricing.ts src/services/apiAdapters/aihubmix/index.ts tests/services/apiAdapters/modelPricing.test.ts tests/services/apiAdapters/registry.test.ts
git commit -m "refactor(api-adapters): add model pricing capability"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 2: Route AIHubMix Fallback Pricing Through The Adapter

**Files:**
- Modify: `src/services/apiCredentialProfiles/modelCatalog.ts`
- Modify: `tests/services/apiCredentialProfiles/modelCatalog.test.ts`

- [ ] **Step 1: Update the AIHubMix fallback test to use `getSiteAdapter(...)`**

In `tests/services/apiCredentialProfiles/modelCatalog.test.ts`, update the hoisted block.

Remove `getApiServiceMock` from the destructuring:

```ts
const {
  fetchAnthropicModelIdsMock,
  fetchGoogleModelIdsMock,
  fetchOpenAICompatibleModelIdsMock,
  fetchAccountTokensMock,
  fetchSub2ApiAvailableGroupsMock,
  fetchSub2ApiGroupRatesMock,
  fetchSub2ApiRuntimeModelsMock,
  getSiteAdapterMock,
  loadModelPriceTableMock,
  resolveDisplayAccountTokenForSecretMock,
} = vi.hoisted(() => ({
```

Remove `getApiServiceMock: vi.fn(),` from the returned object.

Delete this module mock:

```ts
vi.mock("~/services/apiService", () => ({
  getApiService: (...args: unknown[]) => getApiServiceMock(...args),
}))
```

In `beforeEach`, remove:

```ts
    getApiServiceMock.mockReset()
```

Then replace the AIHubMix test body setup with this adapter-backed setup:

```ts
    const fetchPricingMock = vi.fn().mockResolvedValueOnce(aihubmixPricing)
    getSiteAdapterMock.mockReturnValueOnce({
      siteType: SITE_TYPES.AIHUBMIX,
      modelPricing: {
        fetchPricing: fetchPricingMock,
      },
    })
    resolveDisplayAccountTokenForSecretMock.mockRejectedValueOnce(
      new Error("AIHubMix cannot reveal masked keys"),
    )
```

Replace the assertions in that test with:

```ts
    expect(result).toBe(aihubmixPricing)
    expect(getSiteAdapterMock).toHaveBeenCalledWith(SITE_TYPES.AIHUBMIX)
    expect(fetchPricingMock).toHaveBeenCalledWith({
      baseUrl: "https://aihubmix.com",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        accessToken: "account-token",
        cookie: undefined,
      },
    })
    expect(resolveDisplayAccountTokenForSecretMock).not.toHaveBeenCalled()
    expect(fetchOpenAICompatibleModelIdsMock).not.toHaveBeenCalled()
```

- [ ] **Step 2: Add a missing AIHubMix model-pricing capability regression test**

Add this test after the AIHubMix fallback test:

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

- [ ] **Step 3: Run the profile catalog test and verify the expected failure**

Run:

```powershell
pnpm vitest run tests/services/apiCredentialProfiles/modelCatalog.test.ts
```

Expected: FAIL because `modelCatalog.ts` still imports `getApiService(...)` for the AIHubMix fallback branch.

- [ ] **Step 4: Replace the AIHubMix direct service call**

Modify `src/services/apiCredentialProfiles/modelCatalog.ts`.

Remove this import:

```ts
import { getApiService } from "~/services/apiService"
```

Add this helper near `createMissingModelCatalogCapabilityError`:

```ts
const createMissingModelPricingCapabilityError = (siteType: string) =>
  new Error(`modelPricing is not implemented for ${siteType}`)
```

Add this helper near `createSub2ApiDashboardRequest(...)`:

```ts
const createAccountModelPricingRequest = (
  account: LoadAccountTokenFallbackPricingParams["account"],
): ApiServiceRequest => ({
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

Move the AIHubMix branch inside the existing `try` block in
`loadAccountTokenFallbackPricingResponse(...)`.

The start of the function should become:

```ts
export async function loadAccountTokenFallbackPricingResponse(
  params: LoadAccountTokenFallbackPricingParams,
): Promise<PricingResponse> {
  const declaredModelIds = parseDelimitedList(params.token.models)
  let resolvedTokenKey = ""

  try {
    if (params.account.siteType === SITE_TYPES.AIHUBMIX) {
      const adapter = getSiteAdapter(params.account.siteType)
      if (!adapter.modelPricing) {
        throw createMissingModelPricingCapabilityError(params.account.siteType)
      }

      return await adapter.modelPricing.fetchPricing(
        createAccountModelPricingRequest(params.account),
      )
    }

    const resolvedToken = await resolveDisplayAccountTokenForSecret(
      params.account,
      params.token,
    )
    resolvedTokenKey = resolvedToken.key
```

Keep the existing Sub2API and OpenAI-compatible fallback branches after this block.

- [ ] **Step 5: Run the profile catalog test**

Run:

```powershell
pnpm vitest run tests/services/apiCredentialProfiles/modelCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 6: Confirm direct pricing service usage is gone from `modelCatalog.ts`**

Run:

```powershell
rg -n "getApiService|fetchModelPricing" src/services/apiCredentialProfiles/modelCatalog.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts
```

Expected: no matches.

- [ ] **Step 7: Commit profile catalog migration**

Run:

```powershell
git add src/services/apiCredentialProfiles/modelCatalog.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts
git commit -m "refactor(api-profiles): use model pricing adapters for aihubmix"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 3: Route Model List Direct Pricing Through The Adapter

**Files:**
- Modify: `src/features/ModelList/hooks/useModelData.ts`
- Modify: `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`

- [ ] **Step 1: Update Model List test imports and module mocks**

In `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`, replace:

```ts
import {
  getApiService,
  type ApiServiceCapabilities,
} from "~/services/apiService"
```

with:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
```

Replace:

```ts
vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(),
}))
```

with:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: vi.fn(),
}))
```

Replace the helper `createMockApiService(...)` with:

```ts
const createMockSiteAdapter = (
  fetchPricing: ReturnType<typeof vi.fn>,
  overrides: {
    siteType?: DisplaySiteData["siteType"]
    modelPricing?: false
  } = {},
) =>
  ({
    siteType: overrides.siteType ?? SITE_TYPES.NEW_API,
    ...(overrides.modelPricing === false
      ? {}
      : {
          modelPricing: {
            fetchPricing,
          },
        }),
  }) as any
```

- [ ] **Step 2: Update normal-pricing mock setup in Model List tests**

In `tests/entrypoints/options/pages/ModelList/useModelData.test.tsx`, replace normal supported-site setup like:

```ts
vi.mocked(getApiService).mockReturnValue(createMockApiService(fetchModelPricing))
```

with:

```ts
vi.mocked(getSiteAdapter).mockReturnValue(createMockSiteAdapter(fetchPricing))
```

When a test currently creates `const fetchModelPricing = vi.fn(...)`, rename that local variable to `fetchPricing` in the same test and update assertions from:

```ts
expect(fetchModelPricing).toHaveBeenCalledWith(...)
```

to:

```ts
expect(fetchPricing).toHaveBeenCalledWith(...)
```

Update unsupported-site setup from:

```ts
vi.mocked(getApiService).mockReturnValue(
  createMockApiService(fetchModelPricing, {
    capabilities: { modelPricing: false },
  }),
)
```

to:

```ts
vi.mocked(getSiteAdapter).mockReturnValue(
  createMockSiteAdapter(fetchPricing, {
    siteType: SITE_TYPES.SUB2API,
    modelPricing: false,
  }),
)
```

For non-Sub2API unsupported tests, use:

```ts
vi.mocked(getSiteAdapter).mockReturnValue(
  createMockSiteAdapter(fetchPricing, {
    siteType: SITE_TYPES.UNKNOWN,
    modelPricing: false,
  }),
)
```

- [ ] **Step 3: Update the unsupported cached-pricing regression test**

In the test named `"does not return cached pricing for unsupported Sub2API accounts"`, replace its unsupported-site setup with:

```ts
    const fetchPricing = vi
      .fn()
      .mockRejectedValue(new Error("fetch should not be called"))
    vi.mocked(getSiteAdapter).mockReturnValue(
      createMockSiteAdapter(fetchPricing, {
        siteType: SITE_TYPES.SUB2API,
        modelPricing: false,
      }),
    )
```

Keep the assertion:

```ts
    expect(fetchPricing).not.toHaveBeenCalled()
```

This preserves the existing rule that the unsupported-site guard must run before `modelPricingCache.get(...)`.

- [ ] **Step 4: Run the Model List hook test and verify the expected failure**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
```

Expected: FAIL because `useModelData.ts` still imports `getApiService(...)` and does not call `getSiteAdapter(...).modelPricing`.

- [ ] **Step 5: Update Model List hook imports and request helper**

Modify `src/features/ModelList/hooks/useModelData.ts`.

Remove:

```ts
import { getApiService } from "~/services/apiService"
```

Add:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import type { ModelPricingRequest } from "~/services/apiAdapters/contracts/modelPricing"
```

Add this helper near `createModelPricingCacheKey(...)`:

```ts
function createDisplayAccountModelPricingRequest(
  account: DisplaySiteData,
): ModelPricingRequest {
  return {
    baseUrl: account.baseUrl,
    accountId: account.id,
    auth: {
      authType: account.authType,
      userId: account.userId,
      accessToken: account.token,
      cookie: account.cookieAuthSessionCookie,
    },
  }
}
```

- [ ] **Step 6: Migrate single-account direct pricing**

In the `useSingleAccountModelData(...)` query function, replace:

```ts
      const service = getApiService(currentAccount.siteType)
      if (!service.capabilities.modelPricing) {
        throw createUnsupportedModelPricingError()
      }
```

with:

```ts
      const modelPricing =
        getSiteAdapter(currentAccount.siteType).modelPricing
      if (!modelPricing) {
        throw createUnsupportedModelPricingError()
      }
```

Then replace:

```ts
      const data = await service.fetchModelPricing({
        baseUrl: currentAccount.baseUrl,
        accountId: currentAccount.id,
        auth: {
          authType: currentAccount.authType,
          userId: currentAccount.userId,
          accessToken: currentAccount.token,
          cookie: currentAccount.cookieAuthSessionCookie,
        },
      })
```

with:

```ts
      const data = await modelPricing.fetchPricing(
        createDisplayAccountModelPricingRequest(currentAccount),
      )
```

Keep the capability guard before `modelPricingCache.get(...)`.

- [ ] **Step 7: Migrate all-accounts direct pricing**

In the `useAllAccountsModelData(...)` query function, replace:

```ts
        const service = getApiService(account.siteType)
        if (!service.capabilities.modelPricing) {
          if (account.siteType === SITE_TYPES.SUB2API) {
            return fetchSub2ApiAllAccountsFallbackPricingContexts(account)
          }

          throw createUnsupportedModelPricingError()
        }
```

with:

```ts
        const modelPricing = getSiteAdapter(account.siteType).modelPricing
        if (!modelPricing) {
          if (account.siteType === SITE_TYPES.SUB2API) {
            return fetchSub2ApiAllAccountsFallbackPricingContexts(account)
          }

          throw createUnsupportedModelPricingError()
        }
```

Then replace:

```ts
        const data = await service.fetchModelPricing({
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

with:

```ts
        const data = await modelPricing.fetchPricing(
          createDisplayAccountModelPricingRequest(account),
        )
```

Keep the capability guard before `modelPricingCache.get(...)`.

- [ ] **Step 8: Run the Model List hook test**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Confirm Model List no longer imports the legacy facade**

Run:

```powershell
rg -n "getApiService|capabilities\\.modelPricing|fetchModelPricing" src/features/ModelList/hooks/useModelData.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
```

Expected: no matches.

- [ ] **Step 10: Commit Model List migration**

Run:

```powershell
git add src/features/ModelList/hooks/useModelData.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
git commit -m "refactor(model-list): load pricing through site adapters"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 4: Final Validation And Scope Audit

**Files:**
- Review all task-scoped files from Tasks 1-3.

- [ ] **Step 1: Run focused adapter and pricing tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/modelPricing.test.ts tests/services/apiAdapters/registry.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run related tests for changed source files**

Run:

```powershell
pnpm vitest related --run src/services/apiAdapters/contracts/modelPricing.ts src/services/apiAdapters/newApi/modelPricing.ts src/services/apiAdapters/aihubmix/modelPricing.ts src/services/apiCredentialProfiles/modelCatalog.ts src/features/ModelList/hooks/useModelData.ts
```

Expected: PASS. If `vitest related` expands into unrelated long-running UI suites, classify the failure or timeout separately and rely on the focused tests plus `pnpm compile` for this slice.

- [ ] **Step 3: Run TypeScript compile**

Run:

```powershell
pnpm compile
```

Expected: PASS.

- [ ] **Step 4: Run the commit gate**

Run:

```powershell
git status --porcelain=v1
pnpm run validate:staged
```

Expected: PASS for task-scoped staged files. Existing unrelated untracked files may remain untracked and must not be staged.

- [ ] **Step 5: Run the push gate before publishing**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS. This gate is required before pushing or opening a PR because the slice changes shared Adapter contracts and Model List account-loading wiring.

- [ ] **Step 6: Inspect final diff scope**

If tasks were committed individually, run:

```powershell
git show --stat --oneline HEAD~3..HEAD
git diff --name-status HEAD~3..HEAD
```

Expected changed files are limited to:

```text
src/services/apiAdapters/contracts/modelPricing.ts
src/services/apiAdapters/contracts/siteAdapter.ts
src/services/apiAdapters/newApi/modelPricing.ts
src/services/apiAdapters/newApi/index.ts
src/services/apiAdapters/aihubmix/modelPricing.ts
src/services/apiAdapters/aihubmix/index.ts
src/services/apiCredentialProfiles/modelCatalog.ts
src/features/ModelList/hooks/useModelData.ts
tests/services/apiAdapters/modelPricing.test.ts
tests/services/apiAdapters/registry.test.ts
tests/services/apiCredentialProfiles/modelCatalog.test.ts
tests/entrypoints/options/pages/ModelList/useModelData.test.tsx
```

There should be no changes to locale files, telemetry schema, settings search files, Playwright tests, redemption, managed-site providers, account validation, user-group helpers, full Key Management CRUD, or new site types.

- [ ] **Step 7: Check remaining direct model-pricing facade usage**

Run:

```powershell
rg -n "fetchModelPricing|capabilities\\.modelPricing" src tests
```

Expected: remaining matches are limited to backend implementations, adapter delegation tests, legacy `apiService` capability tests, and non-migrated historical docs. Product callers in `src/features/ModelList/**` and `src/services/apiCredentialProfiles/modelCatalog.ts` should not match.

- [ ] **Step 8: Record execution notes**

Before handing off, report:

```text
Focused tests:
- pnpm vitest run tests/services/apiAdapters/modelPricing.test.ts tests/services/apiAdapters/registry.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/entrypoints/options/pages/ModelList/useModelData.test.tsx

Validation:
- pnpm compile
- pnpm run validate:staged
- pnpm run validate:push

E2E decision:
- No Playwright E2E added. This slice changes service-layer routing and hook-level loading behavior covered by Vitest; browser runtime behavior is unchanged.

Telemetry decision:
- Reuse existing. Model List load-completion events keep their current owners and payload shape.
```

---

## Out Of Scope

- Do not add a new site type.
- Do not attach `modelPricing` to `sub2ApiAdapter`.
- Do not move Sub2API runtime-key model catalog, group-rate lookup, or price-table estimation into the `modelPricing` capability.
- Do not migrate `fetchAccountAvailableModels(...)`, `fetchUserGroups(...)`, account validation, account data fetch, redemption, managed-site operations, full Key Management CRUD, locale files, telemetry schema, settings search, or Playwright E2E tests.
- Do not remove `ApiServiceCapabilities.modelPricing` globally in this slice.

## Self-Review

- Spec coverage: Task 1 adds the `modelPricing` Interface and adapter wiring. Task 2 routes AIHubMix selected-token fallback through the Adapter. Task 3 migrates Model List single-account and all-accounts normal pricing loads while preserving Sub2API fallback. Task 4 covers validation, scope audit, telemetry, and E2E decisions.
- Scope control: The plan keeps Sub2API normal model pricing unsupported and does not touch user groups, redemption, managed-site operations, account validation, locale files, or telemetry schema.
- Type consistency: The plan consistently uses `ModelPricingCapability.fetchPricing(request)`, `ModelPricingRequest`, and `SiteAdapter.modelPricing`.
- Cache guard: The plan preserves the requirement that unsupported-site checks happen before `modelPricingCache.get(...)`, preventing stale cached pricing from leaking into unsupported sites.
