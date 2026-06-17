# API Adapter Model Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-17-api-adapter-model-catalog-design.md`

**Goal:** Move Sub2API runtime model catalog discovery behind `getSiteAdapter(...)` while preserving existing Model List behavior.

**Architecture:** Add a narrow `modelCatalog` capability to `apiAdapters`. The Sub2API Adapter delegates to the existing `fetchSub2ApiRuntimeModels(...)` implementation, while `apiCredentialProfiles/modelCatalog.ts` remains the product-level owner of `PricingResponse` construction and estimated-pricing fallback.

**Tech Stack:** TypeScript, Vitest, existing `apiAdapters`, existing Sub2API API helpers, `pnpm run validate:staged`.

---

## File Structure

- Create `src/services/apiAdapters/contracts/modelCatalog.ts`
  - Defines the runtime API-key model catalog capability.
- Modify `src/services/apiAdapters/contracts/siteAdapter.ts`
  - Adds optional `modelCatalog`.
- Create `src/services/apiAdapters/sub2api/modelCatalog.ts`
  - Wraps existing `fetchSub2ApiRuntimeModels`.
- Modify `src/services/apiAdapters/sub2api/index.ts`
  - Exposes `modelCatalog` on `sub2ApiAdapter`.
- Validate `src/services/apiAdapters/registry.ts`
  - No source change is expected; registry tests should confirm the expanded Sub2API Adapter shape.
- Create `tests/services/apiAdapters/sub2api/modelCatalog.test.ts`
  - Verifies delegation to `fetchSub2ApiRuntimeModels`.
- Modify `tests/services/apiAdapters/registry.test.ts`
  - Verifies Sub2API has `modelCatalog`, while other sites do not.
- Modify `src/services/apiCredentialProfiles/modelCatalog.ts`
  - Replaces direct runtime model import/call with `getSiteAdapter(...).modelCatalog`.
- Modify `tests/services/apiCredentialProfiles/modelCatalog.test.ts`
  - Mocks `~/services/apiAdapters/registry` for the Sub2API runtime model path.

---

## Task 1: Add The Sub2API Model Catalog Adapter

**Files:**
- Create: `src/services/apiAdapters/contracts/modelCatalog.ts`
- Modify: `src/services/apiAdapters/contracts/siteAdapter.ts`
- Create: `src/services/apiAdapters/sub2api/modelCatalog.ts`
- Modify: `src/services/apiAdapters/sub2api/index.ts`
- Create: `tests/services/apiAdapters/sub2api/modelCatalog.test.ts`
- Modify: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Write the failing Sub2API model catalog Adapter test**

Create `tests/services/apiAdapters/sub2api/modelCatalog.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

import { sub2ApiModelCatalog } from "~/services/apiAdapters/sub2api/modelCatalog"
import { AuthTypeEnum } from "~/types"

const { fetchSub2ApiRuntimeModelsMock } = vi.hoisted(() => ({
  fetchSub2ApiRuntimeModelsMock: vi.fn(),
}))

vi.mock("~/services/apiService/sub2api", () => ({
  fetchSub2ApiRuntimeModels: fetchSub2ApiRuntimeModelsMock,
}))

describe("sub2ApiModelCatalog", () => {
  it("delegates runtime model discovery to the existing Sub2API helper", async () => {
    fetchSub2ApiRuntimeModelsMock.mockResolvedValueOnce([
      "example-model-a",
      "example-model-b",
    ])

    const request = {
      baseUrl: "https://sub2.example.com",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        apiKey: "runtime-key",
      },
    }

    await expect(sub2ApiModelCatalog.fetchModels(request)).resolves.toEqual([
      "example-model-a",
      "example-model-b",
    ])
    expect(fetchSub2ApiRuntimeModelsMock).toHaveBeenCalledWith(request)
  })
})
```

- [ ] **Step 2: Update the registry test expectations before implementation**

In `tests/services/apiAdapters/registry.test.ts`, update the Sub2API test to include `modelCatalog`:

```ts
expect(adapter.modelCatalog).toEqual({
  fetchModels: expect.any(Function),
})
```

In each New API-family and AIHubMix registry assertion, add:

```ts
expect(adapter.modelCatalog).toBeUndefined()
```

- [ ] **Step 3: Run the failing Adapter tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/sub2api/modelCatalog.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: FAIL because `sub2api/modelCatalog.ts` and the `modelCatalog` contract do not exist yet.

- [ ] **Step 4: Add the model catalog contract**

Create `src/services/apiAdapters/contracts/modelCatalog.ts`:

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

- [ ] **Step 5: Extend the SiteAdapter contract**

In `src/services/apiAdapters/contracts/siteAdapter.ts`, add this import:

```ts
import type { ModelCatalogCapability } from "./modelCatalog"
```

Then add this property to `SiteAdapter`:

```ts
  modelCatalog?: ModelCatalogCapability
```

The final shape should include `modelCatalog` alongside `siteNotice` and `siteAnnouncements`.

- [ ] **Step 6: Add the Sub2API model catalog Adapter**

Create `src/services/apiAdapters/sub2api/modelCatalog.ts`:

```ts
import { fetchSub2ApiRuntimeModels } from "~/services/apiService/sub2api"

import type { ModelCatalogCapability } from "../contracts/modelCatalog"

export const sub2ApiModelCatalog: ModelCatalogCapability = {
  fetchModels: fetchSub2ApiRuntimeModels,
}
```

- [ ] **Step 7: Expose the capability from the Sub2API Adapter**

In `src/services/apiAdapters/sub2api/index.ts`, add:

```ts
import { sub2ApiModelCatalog } from "./modelCatalog"
```

Then update `sub2ApiAdapter`:

```ts
export const sub2ApiAdapter: SiteAdapter = {
  siteType: SITE_TYPES.SUB2API,
  family: "sub2api",
  siteAnnouncements: sub2ApiSiteAnnouncements,
  modelCatalog: sub2ApiModelCatalog,
}
```

- [ ] **Step 8: Run the Adapter tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/sub2api/modelCatalog.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Run:

```powershell
git status --porcelain
git add src/services/apiAdapters/contracts/modelCatalog.ts src/services/apiAdapters/contracts/siteAdapter.ts src/services/apiAdapters/sub2api/modelCatalog.ts src/services/apiAdapters/sub2api/index.ts tests/services/apiAdapters/sub2api/modelCatalog.test.ts tests/services/apiAdapters/registry.test.ts
pnpm run validate:staged
git commit -m "refactor(api-adapters): add sub2api model catalog capability"
```

Expected: `validate:staged` exits 0, then one focused commit is created containing only the Adapter capability and tests.

---

## Task 2: Route Sub2API Runtime Model Discovery Through The Adapter

**Files:**
- Modify: `src/services/apiCredentialProfiles/modelCatalog.ts`
- Modify: `tests/services/apiCredentialProfiles/modelCatalog.test.ts`

- [ ] **Step 1: Update the model catalog test mock setup**

In `tests/services/apiCredentialProfiles/modelCatalog.test.ts`, add
`getSiteAdapterMock` to the existing hoisted mock block. Do not add a second
top-level `vi.hoisted(...)` block, because `fetchSub2ApiRuntimeModelsMock`
already exists in the current hoisted block.

Update the existing destructuring list from:

```ts
const {
  fetchAnthropicModelIdsMock,
  fetchGoogleModelIdsMock,
  fetchOpenAICompatibleModelIdsMock,
  fetchAccountTokensMock,
  fetchSub2ApiAvailableGroupsMock,
  fetchSub2ApiGroupRatesMock,
  fetchSub2ApiRuntimeModelsMock,
  getApiServiceMock,
  loadModelPriceTableMock,
  resolveDisplayAccountTokenForSecretMock,
} = vi.hoisted(() => ({
```

to:

```ts
const {
  fetchAnthropicModelIdsMock,
  fetchGoogleModelIdsMock,
  fetchOpenAICompatibleModelIdsMock,
  fetchAccountTokensMock,
  fetchSub2ApiAvailableGroupsMock,
  fetchSub2ApiGroupRatesMock,
  fetchSub2ApiRuntimeModelsMock,
  getApiServiceMock,
  getSiteAdapterMock,
  loadModelPriceTableMock,
  resolveDisplayAccountTokenForSecretMock,
} = vi.hoisted(() => ({
```

Then add `getSiteAdapterMock` to the object returned by the same hoisted block:

```ts
  getSiteAdapterMock: vi.fn(),
```

Keep the existing direct Sub2API module mock for estimated-pricing helpers, but
remove only the runtime-model export from that module mock. Change:

```ts
vi.mock("~/services/apiService/sub2api", () => ({
  fetchAccountTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
  fetchSub2ApiAvailableGroups: (...args: unknown[]) =>
    fetchSub2ApiAvailableGroupsMock(...args),
  fetchSub2ApiGroupRates: (...args: unknown[]) =>
    fetchSub2ApiGroupRatesMock(...args),
  fetchSub2ApiRuntimeModels: (...args: unknown[]) =>
    fetchSub2ApiRuntimeModelsMock(...args),
}))
```

to:

```ts
vi.mock("~/services/apiService/sub2api", () => ({
  fetchAccountTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
  fetchSub2ApiAvailableGroups: (...args: unknown[]) =>
    fetchSub2ApiAvailableGroupsMock(...args),
  fetchSub2ApiGroupRates: (...args: unknown[]) =>
    fetchSub2ApiGroupRatesMock(...args),
}))
```

Add the Adapter registry mock:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: getSiteAdapterMock,
}))
```

Keep the existing `fetchSub2ApiRuntimeModelsMock` spy, but route it through the
Adapter helper below instead of through the old direct module mock.

- [ ] **Step 2: Add Sub2API Adapter test helpers**

In `tests/services/apiCredentialProfiles/modelCatalog.test.ts`, add these helpers near the existing test fixtures:

```ts
const createSub2ApiModelCatalogAdapter = (
  fetchModels = fetchSub2ApiRuntimeModelsMock,
) => ({
  siteType: SITE_TYPES.SUB2API,
  family: "sub2api" as const,
  modelCatalog: {
    fetchModels,
  },
})

const mockSub2ApiModelCatalogAdapter = (
  fetchModels = fetchSub2ApiRuntimeModelsMock,
) => {
  getSiteAdapterMock.mockReturnValue(createSub2ApiModelCatalogAdapter(fetchModels))
}
```

In the test `beforeEach`, reset the new mock and default the Adapter:

```ts
getSiteAdapterMock.mockReset()
fetchSub2ApiRuntimeModelsMock.mockReset()
mockSub2ApiModelCatalogAdapter()
```

At the end of the non-Sub2API tests for OpenAI-compatible fallback and AIHubMix
fallback, add:

```ts
expect(getSiteAdapterMock).not.toHaveBeenCalled()
```

This proves the new Adapter Seam is used only for the Sub2API runtime catalog
path in this slice.

- [ ] **Step 3: Update existing runtime-model test assertions**

In the existing test named like `"loads Sub2API selected-key runtime models as model-list-only rows"`, keep the existing setup:

```ts
fetchSub2ApiRuntimeModelsMock.mockResolvedValueOnce([
  "example-model-a",
  "example-model-b",
])
```

Update the assertion to verify the Adapter path:

```ts
expect(getSiteAdapterMock).toHaveBeenCalledWith(SITE_TYPES.SUB2API)
expect(fetchSub2ApiRuntimeModelsMock).toHaveBeenCalledWith({
  baseUrl: account.baseUrl,
  accountId: account.id,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    apiKey: "resolved-runtime-key",
  },
})
```

Use the exact resolved key already expected by the existing test fixture. Do not assert a raw secret if the test currently uses a different placeholder key.

- [ ] **Step 4: Add a missing-capability test**

Add this test in the `loadAccountTokenFallbackPricingResponse` describe block:

```ts
it("sanitizes a missing Sub2API model catalog capability failure", async () => {
  getSiteAdapterMock.mockReturnValueOnce({
    siteType: SITE_TYPES.SUB2API,
    family: "sub2api",
  })

  await expect(
    loadAccountTokenFallbackPricingResponse({
      account: sub2ApiAccount,
      token: sub2ApiToken,
    }),
  ).rejects.toThrow("modelCatalog is not implemented for sub2api")

  expect(fetchSub2ApiRuntimeModelsMock).not.toHaveBeenCalled()
})
```

If the existing test fixtures use different names than `sub2ApiAccount` and `sub2ApiToken`, use the local Sub2API account and token fixtures already present in the file. Keep all hosts and keys as `example.*` or existing placeholder values.

- [ ] **Step 5: Run the focused product tests to verify failure before implementation**

Run:

```powershell
pnpm vitest run tests/services/apiCredentialProfiles/modelCatalog.test.ts
```

Expected: FAIL because `modelCatalog.ts` still directly imports `fetchSub2ApiRuntimeModels` and does not call `getSiteAdapter`.

- [ ] **Step 6: Replace the direct Sub2API runtime model import**

In `src/services/apiCredentialProfiles/modelCatalog.ts`, add:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
```

Remove `fetchSub2ApiRuntimeModels` from this import:

```ts
import {
  fetchAccountTokens,
  fetchSub2ApiAvailableGroups,
  fetchSub2ApiGroupRates,
  fetchSub2ApiRuntimeModels,
} from "~/services/apiService/sub2api"
```

The resulting import should be:

```ts
import {
  fetchAccountTokens,
  fetchSub2ApiAvailableGroups,
  fetchSub2ApiGroupRates,
} from "~/services/apiService/sub2api"
```

- [ ] **Step 7: Add a local missing-capability helper**

In `src/services/apiCredentialProfiles/modelCatalog.ts`, near `ACCOUNT_TOKEN_FALLBACK_LOAD_FAILED`, add:

```ts
const createMissingModelCatalogCapabilityError = () =>
  new Error("modelCatalog is not implemented for sub2api")
```

- [ ] **Step 8: Route Sub2API runtime model discovery through the Adapter**

Replace this block:

```ts
const runtimeModelIds = await fetchSub2ApiRuntimeModels({
  baseUrl: params.account.baseUrl,
  accountId: params.account.id,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    apiKey: resolvedToken.key,
  },
} as ApiServiceRequest & {
  auth: ApiServiceRequest["auth"] & { apiKey: string }
})
```

with:

```ts
const adapter = getSiteAdapter(SITE_TYPES.SUB2API)
if (!adapter.modelCatalog) {
  throw createMissingModelCatalogCapabilityError()
}

const runtimeModelIds = await adapter.modelCatalog.fetchModels({
  baseUrl: params.account.baseUrl,
  accountId: params.account.id,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    apiKey: resolvedToken.key,
  },
})
```

This should remove the need for the type assertion because the Adapter contract requires `auth.apiKey`.

- [ ] **Step 9: Run the product tests**

Run:

```powershell
pnpm vitest run tests/services/apiCredentialProfiles/modelCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 10: Confirm the direct runtime helper import is gone from the product Module**

Run:

```powershell
rg -n "fetchSub2ApiRuntimeModels" src/services/apiCredentialProfiles src/services/apiAdapters tests/services/apiCredentialProfiles tests/services/apiAdapters
```

Expected matches:

```text
src/services/apiAdapters/sub2api/modelCatalog.ts
tests/services/apiAdapters/sub2api/modelCatalog.test.ts
tests/services/apiCredentialProfiles/modelCatalog.test.ts
```

There should be no match in `src/services/apiCredentialProfiles/modelCatalog.ts`.

- [ ] **Step 11: Commit Task 2**

Run:

```powershell
git status --porcelain
git add src/services/apiCredentialProfiles/modelCatalog.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts
pnpm run validate:staged
git commit -m "refactor(model-list): use adapter model catalog"
```

Expected: `validate:staged` exits 0, then one focused commit is created containing only product routing and tests.

---

## Task 3: Final Validation And Scope Audit

**Files:**
- Validate: `src/services/apiAdapters/**`
- Validate: `src/services/apiCredentialProfiles/modelCatalog.ts`
- Validate: `tests/services/apiAdapters/**`
- Validate: `tests/services/apiCredentialProfiles/modelCatalog.test.ts`

- [ ] **Step 1: Run focused validation**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/sub2api/modelCatalog.test.ts tests/services/apiAdapters/registry.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run related validation**

Run:

```powershell
pnpm vitest related --run src/services/apiAdapters/sub2api/modelCatalog.ts src/services/apiAdapters/registry.ts src/services/apiCredentialProfiles/modelCatalog.ts
```

Expected: PASS. If `vitest related` cannot resolve the new adapter file before staging, classify that as tooling and keep the focused suite as the primary evidence.

- [ ] **Step 3: Run TypeScript validation**

Run:

```powershell
pnpm compile
```

Expected: PASS. This slice adds a shared Adapter contract and extends
`SiteAdapter`, so compile is required even if focused Vitest passes.

- [ ] **Step 4: Run the commit gate**

If Tasks 1 and 2 were committed individually, skip staging and only inspect status. If the implementation was done as one batch, stage only task-scoped files:

```powershell
git add src/services/apiAdapters/contracts/modelCatalog.ts src/services/apiAdapters/contracts/siteAdapter.ts src/services/apiAdapters/sub2api/modelCatalog.ts src/services/apiAdapters/sub2api/index.ts tests/services/apiAdapters/sub2api/modelCatalog.test.ts tests/services/apiAdapters/registry.test.ts
git add src/services/apiCredentialProfiles/modelCatalog.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 5: Run the pre-push / PR gate before publishing**

Before pushing, opening a PR, or updating a PR branch, run:

```powershell
pnpm run validate:push
```

Expected: PASS. This is required for the implementation because it changes
shared TypeScript service contracts and dependency graph wiring.

- [ ] **Step 6: Inspect the final diff or recent commits**

If changes are staged, run:

```powershell
git diff --cached --stat
git diff --cached --name-status
```

Expected staged files:

```text
A src/services/apiAdapters/contracts/modelCatalog.ts
M src/services/apiAdapters/contracts/siteAdapter.ts
A src/services/apiAdapters/sub2api/modelCatalog.ts
M src/services/apiAdapters/sub2api/index.ts
M tests/services/apiAdapters/registry.test.ts
A tests/services/apiAdapters/sub2api/modelCatalog.test.ts
M src/services/apiCredentialProfiles/modelCatalog.ts
M tests/services/apiCredentialProfiles/modelCatalog.test.ts
```

If Tasks 1 and 2 were committed individually, run:

```powershell
git log --oneline -5
git show --stat --oneline HEAD~2..HEAD
```

Expected recent commits include:

```text
refactor(api-adapters): add sub2api model catalog capability
refactor(model-list): use adapter model catalog
```

- [ ] **Step 7: Confirm no out-of-scope migration leaked in**

Run:

```powershell
git diff --name-only HEAD~2..HEAD
```

Expected: no files under these areas unless the implementation was intentionally batched differently and the diff is still task-scoped:

```text
src/services/redemption/
src/services/accounts/
src/services/managedSites/
src/entrypoints/
src/locales/
e2e/
```

Also confirm:

- no estimated-pricing group/rate fetch was moved to `apiAdapters`
- no AIHubMix model pricing behavior changed
- no `getApiService(...).capabilities.modelPricing` value changed
- no user-facing copy or locale key was added
- no Playwright E2E test was added

- [ ] **Step 8: Final commit if needed**

If Tasks 1 and 2 were not committed individually, commit the final staged task-scoped diff:

```powershell
git commit -m "refactor(api-adapters): migrate sub2api model catalog"
```

If Tasks 1 and 2 were committed individually, skip this step and report the commit hashes.

- [ ] **Step 9: Record final status**

Run:

```powershell
git status --porcelain
```

Expected: only unrelated pre-existing files remain untracked or modified.

---

## Out Of Scope

- Do not migrate Sub2API estimated pricing inputs in this slice.
- Do not move `fetchAccountTokens`, `fetchSub2ApiAvailableGroups`, or `fetchSub2ApiGroupRates`.
- Do not change AIHubMix model pricing.
- Do not change all-key comparison, source identity, source labels, filtering, sorting, or cache identity.
- Do not change `getApiService` capability booleans.
- Do not add `modelPricing`, `redemption`, `account`, or `keyManagement` Adapter capability fields.
- Do not add locale files, telemetry, settings search entries, or Playwright E2E tests.

## Self-Review Notes

- Spec coverage: Task 1 adds the new `modelCatalog` Adapter capability and tests. Task 2 migrates the product-level Sub2API runtime model-list caller while preserving response construction and estimated-pricing behavior. Task 3 validates the focused route with focused Vitest, `compile`, `validate:staged`, `validate:push`, and scope audit.
- Placeholder scan: All steps include exact paths, code snippets, commands, and expected outcomes. The fixture-name caveat is explicitly constrained to use existing local placeholders if the current test file names differ, and the mock rewrite is explicit about updating the existing hoisted block instead of redeclaring `fetchSub2ApiRuntimeModelsMock`.
- Type consistency: The plan consistently uses `ModelCatalogCapability.fetchModels(request)`, `ModelCatalogRequest` with `auth.apiKey`, and `SiteAdapter.modelCatalog`.
