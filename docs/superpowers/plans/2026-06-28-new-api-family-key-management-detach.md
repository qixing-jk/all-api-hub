# New API Family Key Management Detach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detach `apiAdapters/newApi/keyManagement.ts` from the legacy `getApiService(...)` facade by routing New API-family key-management operations through explicit `newApiFamily` implementation helpers.

**Architecture:** Add a capability-sized `src/services/apiService/newApiFamily/keyManagement.ts` Module that owns New API-family default behavior plus capability-local overrides. The New API-family Adapter composes that Module into `KeyManagementCapability`; legacy `getApiService(...)` behavior remains intact for old callers.

**Tech Stack:** TypeScript, existing `apiAdapters`, existing `apiService/common` and site override helpers, Vitest, `pnpm run validate:staged`, `pnpm compile`, `pnpm run validate:push`.

**Spec:** `docs/superpowers/specs/2026-06-28-new-api-family-adapter-detach-design.md`

---

## File Structure

Create:

- `src/services/apiService/newApiFamily/keyManagement.ts`
  - Exposes capability-sized New API-family key-management helpers.
  - Wraps common-compatible defaults.
  - Applies capability-local overrides for OneHub-family token inventory/model/group behavior and WONG token-secret resolution.
- `src/services/apiService/newApiFamily/index.ts`
  - Barrel for the New API-family implementation Module. Export only `keyManagement` in this slice.

Modify:

- `src/services/apiAdapters/newApi/keyManagement.ts`
  - Replace `getApiService(siteType)` calls with direct imports from `~/services/apiService/newApiFamily/keyManagement`.
- `tests/services/apiAdapters/keyManagement.test.ts`
  - Change the New API-family adapter test to mock `~/services/apiService/newApiFamily/keyManagement` instead of `~/services/apiService`.
  - Keep Sub2API and AIHubMix backend-helper tests unchanged except for any mock cleanup required by import ordering.
- `tests/services/apiService/index.test.ts`
  - Keep current legacy facade expectations. Add no new coverage unless implementation accidentally changes old behavior.
- `tests/services/apiService/common/tokenApi.test.ts`
  - Keep common token behavior covered. Add no new test unless the implementation moves common code.
- `tests/services/apiService/oneHub/index.test.ts`
  - Keep OneHub direct helper behavior covered. Add no new test unless override imports move.
- `tests/services/apiService/wong/index.test.ts`
  - Keep WONG token-secret method behavior covered. Add no new test unless override imports move.

Do not modify:

- `src/services/apiService/index.ts`
  - The legacy dynamic facade remains in place for old callers.
- `src/services/apiService/common/index.ts`
  - Do not move helper implementations in this slice.
- `src/services/apiService/oneHub/index.ts`
  - Reuse its existing key-management helpers for OneHub/DoneHub overrides.
- `src/services/apiService/wong/index.ts`
  - Reuse its existing WONG `resolveApiTokenKey(...)` override.
- Sub2API and AIHubMix adapters or backend helpers.
- Managed-site providers, model pricing, redemption, account bootstrap/data/refresh, locale files, telemetry files, settings search, Playwright tests, or new site-type definitions.

---

### Task 1: Add New API-Family Key-Management Implementation Module

**Files:**

- Create: `src/services/apiService/newApiFamily/keyManagement.ts`
- Create: `src/services/apiService/newApiFamily/index.ts`
- Test: `tests/services/apiService/newApiFamily/keyManagement.test.ts`

- [ ] **Step 1: Write failing New API-family implementation tests**

Create `tests/services/apiService/newApiFamily/keyManagement.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchUserGroups,
  resolveApiTokenKey,
  updateApiToken,
} from "~/services/apiService/newApiFamily/keyManagement"
import { AuthTypeEnum, type ApiToken } from "~/types"

const {
  commonCreateApiToken,
  commonDeleteApiToken,
  commonFetchAccountAvailableModels,
  commonFetchAccountTokens,
  commonFetchUserGroups,
  commonResolveApiTokenKey,
  commonUpdateApiToken,
  oneHubFetchAccountAvailableModels,
  oneHubFetchAccountTokens,
  oneHubFetchUserGroups,
  wongResolveApiTokenKey,
} = vi.hoisted(() => ({
  commonCreateApiToken: vi.fn(),
  commonDeleteApiToken: vi.fn(),
  commonFetchAccountAvailableModels: vi.fn(),
  commonFetchAccountTokens: vi.fn(),
  commonFetchUserGroups: vi.fn(),
  commonResolveApiTokenKey: vi.fn(),
  commonUpdateApiToken: vi.fn(),
  oneHubFetchAccountAvailableModels: vi.fn(),
  oneHubFetchAccountTokens: vi.fn(),
  oneHubFetchUserGroups: vi.fn(),
  wongResolveApiTokenKey: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  createApiToken: commonCreateApiToken,
  deleteApiToken: commonDeleteApiToken,
  fetchAccountAvailableModels: commonFetchAccountAvailableModels,
  fetchAccountTokens: commonFetchAccountTokens,
  fetchUserGroups: commonFetchUserGroups,
  resolveApiTokenKey: commonResolveApiTokenKey,
  updateApiToken: commonUpdateApiToken,
}))

vi.mock("~/services/apiService/oneHub", () => ({
  fetchAccountAvailableModels: oneHubFetchAccountAvailableModels,
  fetchAccountTokens: oneHubFetchAccountTokens,
  fetchUserGroups: oneHubFetchUserGroups,
}))

vi.mock("~/services/apiService/wong", () => ({
  resolveApiTokenKey: wongResolveApiTokenKey,
}))

const request = {
  baseUrl: "https://api.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    accessToken: "access-token",
  },
}

const token = {
  id: 123,
  key: "sk-abcd************wxyz",
  name: "Example token",
} as ApiToken

const tokenData = {
  name: "Example token",
  remain_quota: 500000,
  expired_time: -1,
  unlimited_quota: false,
  model_limits_enabled: false,
  model_limits: "",
  allow_ips: "",
  group: "",
}

describe("newApiFamily keyManagement implementation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("uses common-compatible helpers by default", async () => {
    const tokens = [token]
    const groups = {
      default: { desc: "Default", ratio: 1 },
    }
    const models = ["gpt-4o-mini"]

    commonFetchAccountTokens.mockResolvedValueOnce(tokens)
    commonCreateApiToken.mockResolvedValueOnce(true)
    commonUpdateApiToken.mockResolvedValueOnce(true)
    commonResolveApiTokenKey.mockResolvedValueOnce("sk-real")
    commonDeleteApiToken.mockResolvedValueOnce(true)
    commonFetchUserGroups.mockResolvedValueOnce(groups)
    commonFetchAccountAvailableModels.mockResolvedValueOnce(models)

    await expect(
      fetchAccountTokens(request, {
        siteType: SITE_TYPES.NEW_API,
        page: 2,
        size: 25,
      }),
    ).resolves.toBe(tokens)
    await expect(
      createApiToken(request, {
        siteType: SITE_TYPES.NEW_API,
        tokenData,
      }),
    ).resolves.toBe(true)
    await expect(
      updateApiToken(request, {
        siteType: SITE_TYPES.NEW_API,
        tokenId: token.id,
        tokenData,
      }),
    ).resolves.toBe(true)
    await expect(
      resolveApiTokenKey(request, {
        siteType: SITE_TYPES.NEW_API,
        token,
      }),
    ).resolves.toBe("sk-real")
    await expect(
      deleteApiToken(request, {
        siteType: SITE_TYPES.NEW_API,
        tokenId: token.id,
      }),
    ).resolves.toBe(true)
    await expect(
      fetchUserGroups(request, { siteType: SITE_TYPES.NEW_API }),
    ).resolves.toBe(groups)
    await expect(
      fetchAccountAvailableModels(request, {
        siteType: SITE_TYPES.NEW_API,
      }),
    ).resolves.toBe(models)

    expect(commonFetchAccountTokens).toHaveBeenCalledWith(request, 2, 25)
    expect(commonCreateApiToken).toHaveBeenCalledWith(request, tokenData)
    expect(commonUpdateApiToken).toHaveBeenCalledWith(
      request,
      token.id,
      tokenData,
    )
    expect(commonResolveApiTokenKey).toHaveBeenCalledWith(request, token)
    expect(commonDeleteApiToken).toHaveBeenCalledWith(request, token.id)
    expect(commonFetchUserGroups).toHaveBeenCalledWith(request)
    expect(commonFetchAccountAvailableModels).toHaveBeenCalledWith(request)
  })

  it("uses OneHub-family helpers for token list, groups, and available models", async () => {
    const tokens = [token]
    const groups = {
      onehub: { desc: "OneHub", ratio: 1.5 },
    }
    const models = ["onehub-model"]

    oneHubFetchAccountTokens.mockResolvedValueOnce(tokens)
    oneHubFetchUserGroups.mockResolvedValueOnce(groups)
    oneHubFetchAccountAvailableModels.mockResolvedValueOnce(models)

    await expect(
      fetchAccountTokens(request, {
        siteType: SITE_TYPES.DONE_HUB,
        page: 4,
        size: 10,
      }),
    ).resolves.toBe(tokens)
    await expect(
      fetchUserGroups(request, { siteType: SITE_TYPES.DONE_HUB }),
    ).resolves.toBe(groups)
    await expect(
      fetchAccountAvailableModels(request, {
        siteType: SITE_TYPES.DONE_HUB,
      }),
    ).resolves.toBe(models)

    expect(oneHubFetchAccountTokens).toHaveBeenCalledWith(request, 4, 10)
    expect(oneHubFetchUserGroups).toHaveBeenCalledWith(request)
    expect(oneHubFetchAccountAvailableModels).toHaveBeenCalledWith(request)
    expect(commonFetchAccountTokens).not.toHaveBeenCalled()
    expect(commonFetchUserGroups).not.toHaveBeenCalled()
    expect(commonFetchAccountAvailableModels).not.toHaveBeenCalled()
  })

  it("uses WONG token-secret resolution while keeping other operations common-compatible", async () => {
    wongResolveApiTokenKey.mockResolvedValueOnce("sk-wong-secret")
    commonFetchAccountTokens.mockResolvedValueOnce([token])

    await expect(
      resolveApiTokenKey(request, {
        siteType: SITE_TYPES.WONG_GONGYI,
        token,
      }),
    ).resolves.toBe("sk-wong-secret")
    await expect(
      fetchAccountTokens(request, {
        siteType: SITE_TYPES.WONG_GONGYI,
      }),
    ).resolves.toEqual([token])

    expect(wongResolveApiTokenKey).toHaveBeenCalledWith(request, token)
    expect(commonResolveApiTokenKey).not.toHaveBeenCalled()
    expect(commonFetchAccountTokens).toHaveBeenCalledWith(request, 0, 100)
  })
})
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```powershell
pnpm vitest run tests/services/apiService/newApiFamily/keyManagement.test.ts
```

Expected: FAIL with a missing module error for `~/services/apiService/newApiFamily/keyManagement`.

- [ ] **Step 3: Add the New API-family key-management implementation**

Create `src/services/apiService/newApiFamily/keyManagement.ts`:

```ts
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import * as commonKeyManagement from "~/services/apiService/common"
import * as oneHubKeyManagement from "~/services/apiService/oneHub"
import * as wongKeyManagement from "~/services/apiService/wong"
import type {
  ApiServiceRequest,
  CreateTokenRequest,
  CreateTokenResult,
  UserGroupInfo,
} from "~/services/apiService/common/type"
import type { ApiToken } from "~/types"

type PaginationOptions = {
  page?: number
  size?: number
}

type NewApiFamilySiteOptions = {
  siteType: AccountSiteType
}

type KeyManagementImplementation = {
  fetchAccountTokens(
    request: ApiServiceRequest,
    page?: number,
    size?: number,
  ): Promise<ApiToken[]>
  createApiToken(
    request: ApiServiceRequest,
    tokenData: CreateTokenRequest,
  ): Promise<CreateTokenResult>
  updateApiToken(
    request: ApiServiceRequest,
    tokenId: number,
    tokenData: CreateTokenRequest,
  ): Promise<boolean | void>
  resolveApiTokenKey(
    request: ApiServiceRequest,
    token: Pick<ApiToken, "id" | "key">,
  ): Promise<string>
  deleteApiToken(
    request: ApiServiceRequest,
    tokenId: number,
  ): Promise<boolean | void>
  fetchUserGroups(
    request: ApiServiceRequest,
  ): Promise<Record<string, UserGroupInfo>>
  fetchAccountAvailableModels(request: ApiServiceRequest): Promise<string[]>
}

const defaultKeyManagementImplementation: KeyManagementImplementation = {
  fetchAccountTokens: commonKeyManagement.fetchAccountTokens,
  createApiToken: commonKeyManagement.createApiToken,
  updateApiToken: commonKeyManagement.updateApiToken,
  resolveApiTokenKey: commonKeyManagement.resolveApiTokenKey,
  deleteApiToken: commonKeyManagement.deleteApiToken,
  fetchUserGroups: commonKeyManagement.fetchUserGroups,
  fetchAccountAvailableModels: commonKeyManagement.fetchAccountAvailableModels,
}

const oneHubKeyManagementOverrides: Partial<KeyManagementImplementation> = {
  fetchAccountTokens: oneHubKeyManagement.fetchAccountTokens,
  fetchUserGroups: oneHubKeyManagement.fetchUserGroups,
  fetchAccountAvailableModels: oneHubKeyManagement.fetchAccountAvailableModels,
}

const keyManagementOverrides: Partial<
  Record<AccountSiteType, Partial<KeyManagementImplementation>>
> = {
  [SITE_TYPES.ONE_HUB]: oneHubKeyManagementOverrides,
  [SITE_TYPES.DONE_HUB]: oneHubKeyManagementOverrides,
  [SITE_TYPES.WONG_GONGYI]: {
    resolveApiTokenKey: wongKeyManagement.resolveApiTokenKey,
  },
}

function getKeyManagementImplementation(
  siteType: AccountSiteType,
): KeyManagementImplementation {
  return {
    ...defaultKeyManagementImplementation,
    ...keyManagementOverrides[siteType],
  }
}

export async function fetchAccountTokens(
  request: ApiServiceRequest,
  options: NewApiFamilySiteOptions & PaginationOptions,
): Promise<ApiToken[]> {
  const implementation = getKeyManagementImplementation(options.siteType)
  return implementation.fetchAccountTokens(
    request,
    options.page ?? 0,
    options.size ?? 100,
  )
}

export async function createApiToken(
  request: ApiServiceRequest,
  options: NewApiFamilySiteOptions & { tokenData: CreateTokenRequest },
): Promise<CreateTokenResult> {
  const implementation = getKeyManagementImplementation(options.siteType)
  return implementation.createApiToken(request, options.tokenData)
}

export async function updateApiToken(
  request: ApiServiceRequest,
  options: NewApiFamilySiteOptions & {
    tokenId: number
    tokenData: CreateTokenRequest
  },
): Promise<boolean | void> {
  const implementation = getKeyManagementImplementation(options.siteType)
  return implementation.updateApiToken(
    request,
    options.tokenId,
    options.tokenData,
  )
}

export async function resolveApiTokenKey(
  request: ApiServiceRequest,
  options: NewApiFamilySiteOptions & {
    token: Pick<ApiToken, "id" | "key">
  },
): Promise<string> {
  const implementation = getKeyManagementImplementation(options.siteType)
  return implementation.resolveApiTokenKey(request, options.token)
}

export async function deleteApiToken(
  request: ApiServiceRequest,
  options: NewApiFamilySiteOptions & { tokenId: number },
): Promise<boolean | void> {
  const implementation = getKeyManagementImplementation(options.siteType)
  return implementation.deleteApiToken(request, options.tokenId)
}

export async function fetchUserGroups(
  request: ApiServiceRequest,
  options: NewApiFamilySiteOptions,
): Promise<Record<string, UserGroupInfo>> {
  const implementation = getKeyManagementImplementation(options.siteType)
  return implementation.fetchUserGroups(request)
}

export async function fetchAccountAvailableModels(
  request: ApiServiceRequest,
  options: NewApiFamilySiteOptions,
): Promise<string[]> {
  const implementation = getKeyManagementImplementation(options.siteType)
  return implementation.fetchAccountAvailableModels(request)
}
```

- [ ] **Step 4: Add the New API-family barrel**

Create `src/services/apiService/newApiFamily/index.ts`:

```ts
export * as keyManagement from "./keyManagement"
```

- [ ] **Step 5: Run the new implementation test**

Run:

```powershell
pnpm vitest run tests/services/apiService/newApiFamily/keyManagement.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the implementation Module**

Run:

```powershell
git add src/services/apiService/newApiFamily/keyManagement.ts src/services/apiService/newApiFamily/index.ts tests/services/apiService/newApiFamily/keyManagement.test.ts
git commit -m "refactor(api-service): add new api key management implementation"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 2: Rewire New API Adapter Key Management

**Files:**

- Modify: `src/services/apiAdapters/newApi/keyManagement.ts`
- Modify: `tests/services/apiAdapters/keyManagement.test.ts`

- [ ] **Step 1: Update adapter tests to mock the New API-family implementation Module**

In `tests/services/apiAdapters/keyManagement.test.ts`, remove `mockGetApiService` from the hoisted object.

Replace the current `~/services/apiService` mock:

```ts
vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
}))
```

with a mock for the New API-family implementation Module:

```ts
vi.mock("~/services/apiService/newApiFamily/keyManagement", () => ({
  createApiToken: mockCreateApiToken,
  deleteApiToken: mockDeleteApiToken,
  fetchAccountAvailableModels: mockFetchAccountAvailableModels,
  fetchAccountTokens: mockFetchAccountTokens,
  fetchUserGroups: mockFetchUserGroups,
  resolveApiTokenKey: mockResolveApiTokenKey,
  updateApiToken: mockUpdateApiToken,
}))
```

In `beforeEach`, remove the `mockGetApiService.mockReturnValue(...)` setup.

In `"delegates New API-family key operations through the site-specific apiService"`, rename the test to:

```ts
it("delegates New API-family key operations through the New API-family implementation", async () => {
```

Remove:

```ts
expect(mockGetApiService).not.toHaveBeenCalled()
```

Replace the final `mockGetApiService.mock.calls` assertion with assertions that every implementation call receives the `siteType` option:

```ts
expect(mockFetchAccountTokens).toHaveBeenCalledWith(request, {
  siteType: SITE_TYPES.ONE_HUB,
  page: 2,
  size: 25,
})
expect(mockCreateApiToken).toHaveBeenCalledWith(request, {
  siteType: SITE_TYPES.ONE_HUB,
  tokenData,
})
expect(mockUpdateApiToken).toHaveBeenCalledWith(request, {
  siteType: SITE_TYPES.ONE_HUB,
  tokenId: token.id,
  tokenData,
})
expect(mockResolveApiTokenKey).toHaveBeenCalledWith(request, {
  siteType: SITE_TYPES.ONE_HUB,
  token,
})
expect(mockDeleteApiToken).toHaveBeenCalledWith(request, {
  siteType: SITE_TYPES.ONE_HUB,
  tokenId: token.id,
})
expect(mockFetchUserGroups).toHaveBeenCalledWith(request, {
  siteType: SITE_TYPES.ONE_HUB,
})
expect(mockFetchAccountAvailableModels).toHaveBeenCalledWith(request, {
  siteType: SITE_TYPES.ONE_HUB,
})
```

In `"propagates New API-family key lifecycle errors from the site-specific apiService"`, rename the test to:

```ts
it("propagates New API-family key lifecycle errors from the implementation Module", async () => {
```

Replace:

```ts
expect(mockDeleteApiToken).toHaveBeenCalledWith(request, token.id)
```

with:

```ts
expect(mockDeleteApiToken).toHaveBeenCalledWith(request, {
  siteType: SITE_TYPES.ONE_HUB,
  tokenId: token.id,
})
```

- [ ] **Step 2: Run adapter key-management tests and verify the expected failure**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/keyManagement.test.ts
```

Expected: FAIL because `src/services/apiAdapters/newApi/keyManagement.ts` still imports `getApiService(...)` and calls old argument shapes.

- [ ] **Step 3: Rewire the New API adapter implementation**

Modify `src/services/apiAdapters/newApi/keyManagement.ts`.

Replace:

```ts
import { getApiService } from "~/services/apiService"
```

with:

```ts
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchUserGroups,
  resolveApiTokenKey,
  updateApiToken,
} from "~/services/apiService/newApiFamily/keyManagement"
```

Replace the `return` object in `createNewApiKeyManagement(...)` with:

```ts
  return {
    fetchTokens: (request, options) =>
      fetchAccountTokens(request, {
        siteType,
        page: options?.page,
        size: options?.size,
      }),
    createToken: (request, tokenData) =>
      createApiToken(request, { siteType, tokenData }),
    updateToken: ({ request, tokenId, tokenData }) =>
      updateApiToken(request, { siteType, tokenId, tokenData }),
    resolveTokenKey: ({ request, token }) =>
      resolveApiTokenKey(request, { siteType, token }),
    deleteToken: ({ request, tokenId }) =>
      deleteApiToken(request, { siteType, tokenId }),
    fetchAvailableModels: (request) =>
      fetchAccountAvailableModels(request, { siteType }),
    userGroups: {
      fetch: (request) => fetchUserGroups(request, { siteType }),
    },
  }
```

- [ ] **Step 4: Run adapter key-management tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/keyManagement.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run registry tests to catch capability shape regressions**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/registry.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the adapter rewire**

Run:

```powershell
git add src/services/apiAdapters/newApi/keyManagement.ts tests/services/apiAdapters/keyManagement.test.ts
git commit -m "refactor(api-adapters): detach new api key management"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 3: Preserve Legacy Facade Behavior

**Files:**

- Test: `tests/services/apiService/index.test.ts`
- Test: `tests/services/apiService/common/tokenApi.test.ts`
- Test: `tests/services/apiService/oneHub/index.test.ts`
- Test: `tests/services/apiService/wong/index.test.ts`

- [ ] **Step 1: Run existing legacy facade and helper tests**

Run:

```powershell
pnpm vitest run tests/services/apiService/index.test.ts tests/services/apiService/common/tokenApi.test.ts tests/services/apiService/oneHub/index.test.ts tests/services/apiService/wong/index.test.ts
```

Expected: PASS. These tests prove the legacy `getApiService(...)` facade and the direct backend helpers still behave as before.

- [ ] **Step 2: Add a legacy regression test only if Step 1 exposes a gap**

If Step 1 fails because existing tests do not cover one of these still-supported legacy calls:

- `getApiService(SITE_TYPES.ONE_HUB).fetchAccountTokens(...)`
- `getApiService(SITE_TYPES.WONG_GONGYI).resolveApiTokenKey(...)`
- `getApiService(SITE_TYPES.NEW_API).fetchUserGroups(...)`

then add the missing assertion to `tests/services/apiService/index.test.ts` using the existing hoisted mocks. For example, for common user groups, add `commonFetchUserGroups` to the hoisted mocks and common mock:

```ts
const {
  commonFetchUserGroups,
} = vi.hoisted(() => ({
  commonFetchUserGroups: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  fetchUserGroups: commonFetchUserGroups,
}))
```

Then add:

```ts
it("should route common user groups through the legacy facade", async () => {
  commonFetchUserGroups.mockResolvedValue({ default: { desc: "Default", ratio: 1 } })

  const request = {
    baseUrl: "https://example.invalid",
    auth: { authType: "access_token", userId: "1", accessToken: "token" },
  }

  await (getApiService(SITE_TYPES.NEW_API).fetchUserGroups as any)(request)

  expect(commonFetchUserGroups).toHaveBeenCalledWith(request)
})
```

Do not add this test if existing coverage is already sufficient and Step 1 passes.

- [ ] **Step 3: Run legacy tests again if Step 2 changed tests**

Run:

```powershell
pnpm vitest run tests/services/apiService/index.test.ts tests/services/apiService/common/tokenApi.test.ts tests/services/apiService/oneHub/index.test.ts tests/services/apiService/wong/index.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit only if Step 2 changed tests**

If Step 2 added or changed tests, run:

```powershell
git add tests/services/apiService/index.test.ts
git commit -m "test(api-service): preserve key management facade behavior"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

Skip this commit if Step 2 made no changes.

---

### Task 4: Final Validation And Scope Audit

**Files:**

- Review all task-scoped files changed in Tasks 1-3.

- [ ] **Step 1: Assert the New API adapter no longer imports the legacy facade**

Run:

```powershell
rg -n "getApiService|~/services/apiService\"|~/services/apiService'" src/services/apiAdapters/newApi/keyManagement.ts
```

Expected: no output.

- [ ] **Step 2: Run focused implementation and adapter tests**

Run:

```powershell
pnpm vitest run tests/services/apiService/newApiFamily/keyManagement.test.ts tests/services/apiAdapters/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run legacy facade and backend helper tests**

Run:

```powershell
pnpm vitest run tests/services/apiService/index.test.ts tests/services/apiService/common/tokenApi.test.ts tests/services/apiService/oneHub/index.test.ts tests/services/apiService/wong/index.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run TypeScript compile**

Run:

```powershell
pnpm compile
```

Expected: PASS.

- [ ] **Step 5: Run staged validation**

If there are uncommitted task-scoped changes, stage only those files:

```powershell
git status --short
git add src/services/apiService/newApiFamily/keyManagement.ts src/services/apiService/newApiFamily/index.ts src/services/apiAdapters/newApi/keyManagement.ts tests/services/apiService/newApiFamily/keyManagement.test.ts tests/services/apiAdapters/keyManagement.test.ts tests/services/apiService/index.test.ts
pnpm run validate:staged
```

Expected: PASS. Existing unrelated untracked files may remain untracked and must not be staged.

If all prior task commits succeeded and there are no uncommitted task files, run:

```powershell
git status --short
```

Expected: only unrelated pre-existing untracked files remain.

- [ ] **Step 6: Run push gate before publishing**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS. This gate is required before pushing or opening a PR because this slice adds a new shared service Module and changes import graph wiring.

- [ ] **Step 7: Inspect final diff scope**

If tasks were committed individually, run:

```powershell
git show --stat --oneline HEAD~3..HEAD
git diff --name-status HEAD~3..HEAD
```

Expected changed files are limited to:

```text
src/services/apiService/newApiFamily/keyManagement.ts
src/services/apiService/newApiFamily/index.ts
src/services/apiAdapters/newApi/keyManagement.ts
tests/services/apiService/newApiFamily/keyManagement.test.ts
tests/services/apiAdapters/keyManagement.test.ts
tests/services/apiService/index.test.ts
```

`tests/services/apiService/index.test.ts` should appear only if Task 3 added missing legacy coverage.

- [ ] **Step 8: Report execution notes**

Before handing off, report:

```text
Focused tests:
- pnpm vitest run tests/services/apiService/newApiFamily/keyManagement.test.ts tests/services/apiAdapters/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts
- pnpm vitest run tests/services/apiService/index.test.ts tests/services/apiService/common/tokenApi.test.ts tests/services/apiService/oneHub/index.test.ts tests/services/apiService/wong/index.test.ts

Validation:
- pnpm compile
- pnpm run validate:staged
- pnpm run validate:push

Telemetry decision:
- none; this is internal service routing with no new user action, setting, background flow, or analytics field.

Settings search decision:
- none; no settings UI, route, anchor, or search definition changes.

E2E decision:
- no Playwright E2E; the risk is service Module routing and Adapter delegation, covered by Vitest.
```

---

## Out Of Scope

- Do not modify `src/services/apiService/index.ts`.
- Do not migrate account bootstrap, account data, account refresh, model pricing, redemption, site notice, or token provisioning.
- Do not rename `common` to `newApiFamily`.
- Do not move common helper implementations out of `src/services/apiService/common/index.ts`.
- Do not modify OneHub or WONG backend helper behavior.
- Do not migrate Sub2API or AIHubMix key-management adapters.
- Do not touch managed-site provider/channel CRUD, model sync, locale files, telemetry schemas, settings search files, Playwright tests, or new site-type definitions.
- Do not add import guards or dependency tooling in this slice.

## Self-Review

- Spec coverage: Task 1 creates the `newApiFamily/keyManagement` Implementation Module and capability-local override map. Task 2 rewires `apiAdapters/newApi/keyManagement.ts` away from `getApiService(...)`. Task 3 preserves legacy facade behavior. Task 4 covers focused tests, compile, staged validation, push validation, scope audit, telemetry, settings search, and E2E decision.
- Scope control: The plan does not touch other adapter capabilities, managed-site flows, `apiService/index.ts`, `common` rename, locale files, telemetry, settings search, or Playwright tests.
- Type consistency: The plan consistently uses `KeyManagementCapability.fetchTokens(request, options)`, `createToken(request, tokenData)`, `updateToken({ request, tokenId, tokenData })`, `resolveTokenKey({ request, token })`, `deleteToken({ request, tokenId })`, `userGroups.fetch(request)`, and `fetchAvailableModels(request)`.
- Compatibility: Legacy `getApiService(...)` remains intact. New API-family Adapter calls pass `siteType` explicitly to the implementation Module, avoiding hidden argument inspection inside the Adapter.
