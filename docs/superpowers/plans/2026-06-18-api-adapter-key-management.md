# API Adapter Key Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a narrow `keyManagement` capability to site adapters and route account token list/create/secret flows through it.

**Architecture:** Keep HTTP/protocol behavior in existing `apiService/*` modules and add adapter wrappers that expose only token inventory, token creation, and token-secret resolution. Preserve `getApiService(...)` as a compatibility facade for non-migrated Key Management CRUD and group/model helpers, while moving the high-leverage account save/copy paths to `getSiteAdapter(siteType).keyManagement`.

**Tech Stack:** TypeScript, WXT extension service modules, React account-management UI, Vitest with existing test utilities.

**Implementation status:** Shipped in this branch. The task sections below are retained as the execution record for the completed slice, not as remaining work.

---

## File Structure

- Create `src/services/apiAdapters/contracts/keyManagement.ts`
  - Defines the adapter-level key management interface.
- Modify `src/services/apiAdapters/contracts/siteAdapter.ts`
  - Adds optional `keyManagement?: KeyManagementCapability`.
- Create `src/services/apiAdapters/newApi/keyManagement.ts`
  - Binds New API-family key operations to the current `siteType` via `getApiService(siteType)`.
- Modify `src/services/apiAdapters/newApi/index.ts`
  - Exports `createNewApiAdapter(siteType)` so registry-created OneHub/DoneHub/etc adapters keep their site-specific backend overrides.
- Create `src/services/apiAdapters/sub2api/keyManagement.ts`
  - Delegates to Sub2API token helpers.
- Modify `src/services/apiAdapters/sub2api/index.ts`
  - Attaches `sub2ApiKeyManagement`.
- Create `src/services/apiAdapters/aihubmix/keyManagement.ts`
  - Delegates to AIHubMix token helpers and preserves one-time-secret behavior from the backend helper.
- Modify `src/services/apiAdapters/aihubmix/index.ts`
  - Attaches `aihubmixKeyManagement`.
- Modify `src/services/apiAdapters/registry.ts`
  - Uses `createNewApiAdapter(siteType)` instead of spreading a static adapter.
- Create `tests/services/apiAdapters/keyManagement.test.ts`
  - Verifies adapter delegation for New API-family, Sub2API, and AIHubMix.
- Modify `tests/services/apiAdapters/registry.test.ts`
  - Verifies registry exposes `keyManagement` for supported adapters.
- Modify `src/services/accounts/utils/apiServiceRequest.ts`
  - Adds adapter/key-management context and routes display-account list/secret helpers through it.
- Modify `tests/services/accounts/apiServiceRequest.test.ts`
  - Updates mocks and expectations for adapter-backed token helpers.
- Modify `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
  - Routes post-save inventory/create through adapter key management.
- Modify `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
  - Routes background-safe default token provisioning through adapter key management.
- Modify `src/services/accounts/accountOperations.ts`
  - Routes legacy `ensureAccountApiToken(...)` key list/create through adapter key management while keeping `fetchUserGroups(...)` on `getApiService(...)`.
- Modify `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`
  - Updates key-operation mocks to use `getSiteAdapter(...)`.
- Modify `tests/services/accountOperations.ensureAccountApiToken.test.ts`
  - Updates key-operation mocks to use `getSiteAdapter(...)` and keeps `fetchUserGroups(...)` on `getApiService(...)`.
- Modify `src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts`
  - Uses display-account token helper for list/refresh and adapter key management for create.
- Modify `tests/features/AccountManagement/components/CopyKeyDialog.test.tsx`
  - Updates key-operation mocks to use adapter key management.
- Modify `tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx`
  - Updates Sub2API dialog mocks with the same adapter-backed shape.
- Modify `src/features/AccountManagement/components/AccountActionButtons/index.tsx`
  - Uses `fetchDisplayAccountTokens(...)` for smart-copy and managed-channel locate inventory reads.
- Modify `tests/features/AccountManagement/components/AccountActionButtons.test.tsx`
  - Mocks `fetchDisplayAccountTokens(...)` and preserves behavior assertions.

---

### Task 1: Add Adapter Key Management Capability (shipped)

**Files:**
- Create: `src/services/apiAdapters/contracts/keyManagement.ts`
- Create: `src/services/apiAdapters/newApi/keyManagement.ts`
- Create: `src/services/apiAdapters/sub2api/keyManagement.ts`
- Create: `src/services/apiAdapters/aihubmix/keyManagement.ts`
- Modify: `src/services/apiAdapters/contracts/siteAdapter.ts`
- Modify: `src/services/apiAdapters/newApi/index.ts`
- Modify: `src/services/apiAdapters/sub2api/index.ts`
- Modify: `src/services/apiAdapters/aihubmix/index.ts`
- Modify: `src/services/apiAdapters/registry.ts`
- Create: `tests/services/apiAdapters/keyManagement.test.ts`
- Modify: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Write failing adapter delegation tests**

Create `tests/services/apiAdapters/keyManagement.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { aihubmixKeyManagement } from "~/services/apiAdapters/aihubmix/keyManagement"
import { createNewApiKeyManagement } from "~/services/apiAdapters/newApi/keyManagement"
import { sub2ApiKeyManagement } from "~/services/apiAdapters/sub2api/keyManagement"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import { AuthTypeEnum, type ApiToken } from "~/types"

const {
  getApiServiceMock,
  newApiFetchTokensMock,
  newApiCreateTokenMock,
  newApiResolveTokenKeyMock,
  sub2ApiFetchTokensMock,
  sub2ApiCreateTokenMock,
  sub2ApiResolveTokenKeyMock,
  aihubmixFetchTokensMock,
  aihubmixCreateTokenMock,
  aihubmixResolveTokenKeyMock,
} = vi.hoisted(() => ({
  getApiServiceMock: vi.fn(),
  newApiFetchTokensMock: vi.fn(),
  newApiCreateTokenMock: vi.fn(),
  newApiResolveTokenKeyMock: vi.fn(),
  sub2ApiFetchTokensMock: vi.fn(),
  sub2ApiCreateTokenMock: vi.fn(),
  sub2ApiResolveTokenKeyMock: vi.fn(),
  aihubmixFetchTokensMock: vi.fn(),
  aihubmixCreateTokenMock: vi.fn(),
  aihubmixResolveTokenKeyMock: vi.fn(),
}))

vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: (...args: unknown[]) => getApiServiceMock(...args),
  }
})

vi.mock("~/services/apiService/sub2api", () => ({
  fetchAccountTokens: (...args: unknown[]) => sub2ApiFetchTokensMock(...args),
  createApiToken: (...args: unknown[]) => sub2ApiCreateTokenMock(...args),
  resolveApiTokenKey: (...args: unknown[]) => sub2ApiResolveTokenKeyMock(...args),
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  fetchAccountTokens: (...args: unknown[]) => aihubmixFetchTokensMock(...args),
  createApiToken: (...args: unknown[]) => aihubmixCreateTokenMock(...args),
  resolveApiTokenKey: (...args: unknown[]) =>
    aihubmixResolveTokenKeyMock(...args),
}))

const request: ApiServiceRequest = {
  baseUrl: "https://api.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "7",
    accessToken: "access-token",
  },
}

const token = {
  id: 11,
  user_id: 7,
  key: "sk-token",
  status: 1,
  name: "default",
  created_time: 1,
  accessed_time: 1,
  expired_time: -1,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
} as ApiToken

const tokenRequest = {
  name: "default",
  remain_quota: 0,
  expired_time: -1,
  unlimited_quota: true,
  model_limits_enabled: false,
  model_limits: "",
  allow_ips: "",
  group: "",
}

describe("keyManagement adapters", () => {
  beforeEach(() => {
    getApiServiceMock.mockReset()
    newApiFetchTokensMock.mockReset()
    newApiCreateTokenMock.mockReset()
    newApiResolveTokenKeyMock.mockReset()
    sub2ApiFetchTokensMock.mockReset()
    sub2ApiCreateTokenMock.mockReset()
    sub2ApiResolveTokenKeyMock.mockReset()
    aihubmixFetchTokensMock.mockReset()
    aihubmixCreateTokenMock.mockReset()
    aihubmixResolveTokenKeyMock.mockReset()
  })

  it("delegates New API-family key operations through the bound site type", async () => {
    const service = {
      fetchAccountTokens: newApiFetchTokensMock.mockResolvedValue([token]),
      createApiToken: newApiCreateTokenMock.mockResolvedValue(token),
      resolveApiTokenKey: newApiResolveTokenKeyMock.mockResolvedValue("sk-real"),
    }
    getApiServiceMock.mockReturnValue(service)

    const keyManagement = createNewApiKeyManagement(SITE_TYPES.ONE_HUB)

    await expect(
      keyManagement.fetchTokens(request, { page: 2, size: 25 }),
    ).resolves.toEqual([token])
    await expect(keyManagement.createToken(request, tokenRequest)).resolves.toBe(
      token,
    )
    await expect(
      keyManagement.resolveTokenKey({ request, token }),
    ).resolves.toBe("sk-real")

    expect(getApiServiceMock).toHaveBeenCalledWith(SITE_TYPES.ONE_HUB)
    expect(newApiFetchTokensMock).toHaveBeenCalledWith(request, 2, 25)
    expect(newApiCreateTokenMock).toHaveBeenCalledWith(request, tokenRequest)
    expect(newApiResolveTokenKeyMock).toHaveBeenCalledWith(request, token)
  })

  it("delegates Sub2API key operations to the Sub2API helpers", async () => {
    sub2ApiFetchTokensMock.mockResolvedValue([token])
    sub2ApiCreateTokenMock.mockResolvedValue(token)
    sub2ApiResolveTokenKeyMock.mockResolvedValue("sub2-real")

    await expect(
      sub2ApiKeyManagement.fetchTokens(request, { page: 3, size: 10 }),
    ).resolves.toEqual([token])
    await expect(
      sub2ApiKeyManagement.createToken(request, tokenRequest),
    ).resolves.toBe(token)
    await expect(
      sub2ApiKeyManagement.resolveTokenKey({ request, token }),
    ).resolves.toBe("sub2-real")

    expect(sub2ApiFetchTokensMock).toHaveBeenCalledWith(request, 3, 10)
    expect(sub2ApiCreateTokenMock).toHaveBeenCalledWith(request, tokenRequest)
    expect(sub2ApiResolveTokenKeyMock).toHaveBeenCalledWith(request, token)
  })

  it("delegates AIHubMix key operations to the AIHubMix helpers", async () => {
    aihubmixFetchTokensMock.mockResolvedValue([token])
    aihubmixCreateTokenMock.mockResolvedValue(token)
    aihubmixResolveTokenKeyMock.mockResolvedValue("aihubmix-real")

    await expect(aihubmixKeyManagement.fetchTokens(request)).resolves.toEqual([
      token,
    ])
    await expect(
      aihubmixKeyManagement.createToken(request, tokenRequest),
    ).resolves.toBe(token)
    await expect(
      aihubmixKeyManagement.resolveTokenKey({ request, token }),
    ).resolves.toBe("aihubmix-real")

    expect(aihubmixFetchTokensMock).toHaveBeenCalledWith(request)
    expect(aihubmixCreateTokenMock).toHaveBeenCalledWith(request, tokenRequest)
    expect(aihubmixResolveTokenKeyMock).toHaveBeenCalledWith(request, token)
  })
})
```

Update `tests/services/apiAdapters/registry.test.ts` expectations:

```ts
expect(adapter.keyManagement).toEqual({
  fetchTokens: expect.any(Function),
  createToken: expect.any(Function),
  resolveTokenKey: expect.any(Function),
})
```

Add the expectation inside the Sub2API test, the New API-family loop, and the AIHubMix test.

- [ ] **Step 2: Run tests to verify the capability is missing**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: FAIL because `keyManagement.ts` files and `adapter.keyManagement` do not exist yet.

- [ ] **Step 3: Add the adapter contract**

Create `src/services/apiAdapters/contracts/keyManagement.ts`:

```ts
import type {
  ApiServiceRequest,
  CreateTokenRequest,
  CreateTokenResult,
} from "~/services/apiService/common/type"
import type { ApiToken } from "~/types"

export type FetchAccountTokensOptions = {
  page?: number
  size?: number
}

export type ResolveTokenSecretRequest<
  TToken extends Pick<ApiToken, "id" | "key"> = Pick<ApiToken, "id" | "key">,
> = {
  request: ApiServiceRequest
  token: TToken
}

export type KeyManagementCapability = {
  fetchTokens(
    request: ApiServiceRequest,
    options?: FetchAccountTokensOptions,
  ): Promise<ApiToken[]>
  createToken(
    request: ApiServiceRequest,
    tokenData: CreateTokenRequest,
  ): Promise<CreateTokenResult>
  resolveTokenKey<TToken extends Pick<ApiToken, "id" | "key">>(
    params: ResolveTokenSecretRequest<TToken>,
  ): Promise<string>
}
```

Modify `src/services/apiAdapters/contracts/siteAdapter.ts`:

```ts
import type { KeyManagementCapability } from "./keyManagement"
```

Add the property to `SiteAdapter`:

```ts
  keyManagement?: KeyManagementCapability
```

- [ ] **Step 4: Implement New API-family key management with a bound site type**

Create `src/services/apiAdapters/newApi/keyManagement.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import { getApiService } from "~/services/apiService"

import type { KeyManagementCapability } from "../contracts/keyManagement"

export const createNewApiKeyManagement = (
  siteType: AccountSiteType,
): KeyManagementCapability => ({
  fetchTokens(request, options) {
    return getApiService(siteType).fetchAccountTokens(
      request,
      options?.page,
      options?.size,
    )
  },
  createToken(request, tokenData) {
    return getApiService(siteType).createApiToken(request, tokenData)
  },
  resolveTokenKey({ request, token }) {
    return getApiService(siteType).resolveApiTokenKey(request, token)
  },
})
```

Replace `src/services/apiAdapters/newApi/index.ts` with:

```ts
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"

import type { SiteAdapter } from "../contracts/siteAdapter"
import { newApiAccountCompletion } from "./accountCompletion"
import { createNewApiKeyManagement } from "./keyManagement"
import { newApiSiteNotice } from "./siteNotice"

export const createNewApiAdapter = (
  siteType: AccountSiteType = SITE_TYPES.NEW_API,
): SiteAdapter => ({
  siteType,
  family: "newApiFamily",
  siteNotice: newApiSiteNotice,
  accountCompletion: newApiAccountCompletion,
  keyManagement: createNewApiKeyManagement(siteType),
})

export const newApiAdapter = createNewApiAdapter(SITE_TYPES.NEW_API)
```

- [ ] **Step 5: Implement Sub2API and AIHubMix key management**

Create `src/services/apiAdapters/sub2api/keyManagement.ts`:

```ts
import {
  createApiToken,
  fetchAccountTokens,
  resolveApiTokenKey,
} from "~/services/apiService/sub2api"

import type { KeyManagementCapability } from "../contracts/keyManagement"

export const sub2ApiKeyManagement: KeyManagementCapability = {
  fetchTokens(request, options) {
    return fetchAccountTokens(request, options?.page, options?.size)
  },
  createToken(request, tokenData) {
    return createApiToken(request, tokenData)
  },
  resolveTokenKey({ request, token }) {
    return resolveApiTokenKey(request, token)
  },
}
```

Modify `src/services/apiAdapters/sub2api/index.ts`:

```ts
import { sub2ApiKeyManagement } from "./keyManagement"
```

Add the property:

```ts
  keyManagement: sub2ApiKeyManagement,
```

Create `src/services/apiAdapters/aihubmix/keyManagement.ts`:

```ts
import {
  createApiToken,
  fetchAccountTokens,
  resolveApiTokenKey,
} from "~/services/apiService/aihubmix"

import type { KeyManagementCapability } from "../contracts/keyManagement"

export const aihubmixKeyManagement: KeyManagementCapability = {
  fetchTokens(request) {
    return fetchAccountTokens(request)
  },
  createToken(request, tokenData) {
    return createApiToken(request, tokenData)
  },
  resolveTokenKey({ request, token }) {
    return resolveApiTokenKey(request, token)
  },
}
```

Modify `src/services/apiAdapters/aihubmix/index.ts`:

```ts
import { aihubmixKeyManagement } from "./keyManagement"
```

Add the property:

```ts
  keyManagement: aihubmixKeyManagement,
```

- [ ] **Step 6: Update registry to use the New API adapter factory**

Modify `src/services/apiAdapters/registry.ts`:

```ts
import { createNewApiAdapter } from "./newApi"
```

Replace `createNewApiFamilyAdapter` with:

```ts
const createNewApiFamilyAdapter = (siteType: AccountSiteType): SiteAdapter =>
  createNewApiAdapter(siteType)
```

This preserves OneHub/DoneHub/Veloera key overrides because `keyManagement` now calls `getApiService(siteType)` with the registry site type.

- [ ] **Step 7: Run adapter tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit adapter capability**

Run:

```powershell
git add src/services/apiAdapters/contracts/keyManagement.ts src/services/apiAdapters/contracts/siteAdapter.ts src/services/apiAdapters/newApi/keyManagement.ts src/services/apiAdapters/newApi/index.ts src/services/apiAdapters/sub2api/keyManagement.ts src/services/apiAdapters/sub2api/index.ts src/services/apiAdapters/aihubmix/keyManagement.ts src/services/apiAdapters/aihubmix/index.ts src/services/apiAdapters/registry.ts tests/services/apiAdapters/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts
git commit -m "feat(api-adapters): add key management capability"
```

Expected: commit succeeds after the repo hook runs.

---

### Task 2: Route Display-Account Token Helpers Through Adapter

**Files:**
- Modify: `src/services/accounts/utils/apiServiceRequest.ts`
- Modify: `tests/services/accounts/apiServiceRequest.test.ts`

- [ ] **Step 1: Update failing helper tests**

Modify `tests/services/accounts/apiServiceRequest.test.ts` imports:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import { getApiService } from "~/services/apiService"
```

Add the registry mock:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: vi.fn(),
}))
```

Keep the `getApiService` mock because `createDisplayAccountApiContext(...)` remains a transitional context for non-migrated CRUD/group callers:

```ts
vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(),
}))
```

Use this setup in `beforeEach`:

```ts
let fetchTokens: ReturnType<typeof vi.fn>
let createToken: ReturnType<typeof vi.fn>
let resolveTokenKey: ReturnType<typeof vi.fn>
let keyManagement: {
  fetchTokens: typeof fetchTokens
  createToken: typeof createToken
  resolveTokenKey: typeof resolveTokenKey
}
let adapter: { siteType: string; keyManagement?: typeof keyManagement }
let service: { fetchUserGroups: ReturnType<typeof vi.fn> }

beforeEach(() => {
  fetchTokens = vi.fn()
  createToken = vi.fn()
  resolveTokenKey = vi.fn()
  keyManagement = { fetchTokens, createToken, resolveTokenKey }
  adapter = { siteType: "new-api", keyManagement }
  service = { fetchUserGroups: vi.fn() }
  vi.mocked(getSiteAdapter).mockReset()
  vi.mocked(getSiteAdapter).mockReturnValue(adapter as any)
  vi.mocked(getApiService).mockReset()
  vi.mocked(getApiService).mockReturnValue(service as any)
})
```

Change the valid payload test to expect adapter-backed calls:

```ts
fetchTokens.mockResolvedValue([{ id: 1, key: "sk-test", status: 1 }])

const result = await fetchDisplayAccountTokens(ACCOUNT as any)

expect(result).toEqual([{ id: 1, key: "sk-test", status: 1 }])
expect(fetchTokens).toHaveBeenCalledWith({
  baseUrl: "https://example.com",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "1",
    accessToken: "token",
    cookie: "",
  },
})
expect(createDisplayAccountApiContext(ACCOUNT as any)).toEqual({
  service,
  adapter,
  keyManagement,
  request: {
    baseUrl: "https://example.com",
    accountId: "account-1",
    auth: {
      authType: AuthTypeEnum.AccessToken,
      userId: "1",
      accessToken: "token",
      cookie: "",
    },
  },
})
```

Change secret-resolution tests to use `resolveTokenKey`:

```ts
resolveTokenKey.mockResolvedValue("sk-real")
```

Add a missing-capability test:

```ts
it("fails clearly when the site adapter does not expose key management", async () => {
  vi.mocked(getSiteAdapter).mockReturnValue({
    siteType: "unsupported",
  } as any)

  await expect(
    fetchDisplayAccountTokens({ ...ACCOUNT, siteType: "unsupported" } as any),
  ).rejects.toThrow("keyManagement is not implemented for unsupported")
})
```

- [ ] **Step 2: Run tests to verify old helper routing fails**

Run:

```powershell
pnpm vitest run tests/services/accounts/apiServiceRequest.test.ts
```

Expected: FAIL because `fetchDisplayAccountTokens(...)` still calls `service.fetchAccountTokens(...)`.

- [ ] **Step 3: Implement adapter-backed display-account context**

Modify `src/services/accounts/utils/apiServiceRequest.ts` imports:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
```

Add this helper after the logger:

```ts
export const createMissingKeyManagementCapabilityError = (
  siteType: string,
): Error => new Error(`keyManagement is not implemented for ${siteType}`)

export const requireDisplayAccountKeyManagement = (
  account: Pick<DisplaySiteData, "siteType">,
  keyManagement: KeyManagementCapability | undefined,
): KeyManagementCapability => {
  if (!keyManagement) {
    throw createMissingKeyManagementCapabilityError(account.siteType)
  }

  return keyManagement
}
```

Change `createDisplayAccountApiContext(...)`:

```ts
export const createDisplayAccountApiContext = (
  account: Pick<
    DisplaySiteData,
    | "siteType"
    | "baseUrl"
    | "id"
    | "authType"
    | "userId"
    | "token"
    | "cookieAuthSessionCookie"
  >,
) => {
  const adapter = getSiteAdapter(account.siteType)

  return {
    service: getApiService(account.siteType),
    adapter,
    keyManagement: adapter.keyManagement,
    request: buildApiRequestFromDisplayAccount(account),
  }
}
```

Change `fetchDisplayAccountTokens(...)`:

```ts
  const { keyManagement, request } = createDisplayAccountApiContext(account)
  const tokensResponse = await requireDisplayAccountKeyManagement(
    account,
    keyManagement,
  ).fetchTokens(request)
```

Change `resolveDisplayAccountTokenForSecret(...)`:

```ts
  const { keyManagement, request } = createDisplayAccountApiContext(account)
  const resolvedKey = await requireDisplayAccountKeyManagement(
    account,
    keyManagement,
  ).resolveTokenKey({ request, token })
```

- [ ] **Step 4: Run display-account helper tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/apiServiceRequest.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit display-account helper migration**

Run:

```powershell
git add src/services/accounts/utils/apiServiceRequest.ts tests/services/accounts/apiServiceRequest.test.ts
git commit -m "refactor(accounts): route display token helpers through adapters"
```

Expected: commit succeeds after the repo hook runs.

---

### Task 3: Route Account Token Provisioning Through Adapter

**Files:**
- Modify: `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
- Modify: `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
- Modify: `src/services/accounts/accountOperations.ts`
- Modify: `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`
- Modify: `tests/services/accountOperations.ensureAccountApiToken.test.ts`

- [ ] **Step 1: Update provisioning tests to mock adapter key operations**

In `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`, add the registry mock:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: vi.fn(() => ({
    keyManagement: {
      fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
      createToken: (...args: unknown[]) => createApiTokenMock(...args),
      resolveTokenKey: vi.fn(),
    },
  })),
}))
```

Keep `~/services/apiService` mocked only for `fetchUserGroups(...)`:

```ts
vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: vi.fn(() => ({
      fetchUserGroups: (...args: unknown[]) => fetchUserGroupsMock(...args),
    })),
  }
})
```

In `tests/services/accountOperations.ensureAccountApiToken.test.ts`, use the same adapter mock:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: vi.fn(() => ({
    keyManagement: {
      fetchTokens: (...args: any[]) => fetchAccountTokensMock(...args),
      createToken: (...args: any[]) => createApiTokenMock(...args),
      resolveTokenKey: vi.fn(),
    },
  })),
}))
```

Keep this `getApiService` shape for Sub2API groups:

```ts
vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: vi.fn(() => ({
      fetchUserGroups: (...args: any[]) => fetchUserGroupsMock(...args),
    })),
  }
})
```

- [ ] **Step 2: Run provisioning tests to verify old routing fails**

Run:

```powershell
pnpm vitest run tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts
```

Expected: FAIL because implementation still expects `getApiService(...).fetchAccountTokens` and `getApiService(...).createApiToken`.

- [ ] **Step 3: Update post-save token workflow**

Modify `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts` imports:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import { requireDisplayAccountKeyManagement } from "~/services/accounts/utils/apiServiceRequest"
```

Replace inventory loading in `inspectAccountTokenInventory(...)`:

```ts
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    getSiteAdapter(displaySiteData.siteType).keyManagement,
  )
  const tokens = await keyManagement.fetchTokens(
    buildDisplayAccountRequest(displaySiteData),
  )
```

Replace service usage in `createDefaultToken(...)`:

```ts
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    getSiteAdapter(displaySiteData.siteType).keyManagement,
  )
  const tokenData = generateDefaultTokenRequest()
  if (typeof group === "string") {
    tokenData.group = group
  }

  const created = await keyManagement.createToken(
    buildCreateRequest(account),
    tokenData,
  )
```

Replace the follow-up inventory fetch:

```ts
  const updatedTokens = await keyManagement.fetchTokens(
    buildDisplayAccountRequest(displaySiteData),
  )
```

Remove the now-unused `getApiService` import.

- [ ] **Step 4: Update default-token auto-provisioning**

Modify `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts` imports:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import { requireDisplayAccountKeyManagement } from "~/services/accounts/utils/apiServiceRequest"
```

At the start of `ensureDefaultApiTokenForAccount(...)`, replace `service` with reusable requests and key management:

```ts
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    getSiteAdapter(displaySiteData.siteType).keyManagement,
  )
  const displayAccountRequest = {
    baseUrl: displaySiteData.baseUrl,
    accountId: displaySiteData.id,
    auth: {
      authType: displaySiteData.authType,
      userId: displaySiteData.userId,
      accessToken: displaySiteData.token,
      cookie: displaySiteData.cookieAuthSessionCookie,
    },
  }
  const createAccountRequest = {
    baseUrl: account.site_url,
    accountId: account.id,
    auth: {
      authType: account.authType,
      userId: account.account_info.id,
      accessToken: account.account_info.access_token,
      cookie: account.cookieAuth?.sessionCookie,
    },
  }
```

Replace all key calls:

```ts
  const tokens = await keyManagement.fetchTokens(displayAccountRequest)
```

```ts
  const createApiTokenResult = await keyManagement.createToken(
    createAccountRequest,
    newTokenData,
  )
```

```ts
  const updatedTokens = await keyManagement.fetchTokens(displayAccountRequest)
```

Remove the now-unused `getApiService` import.

- [ ] **Step 5: Update legacy `ensureAccountApiToken(...)`**

Modify `src/services/accounts/accountOperations.ts` imports:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
} from "~/services/accounts/utils/apiServiceRequest"
```

At the start of `ensureAccountApiToken(...)`, after `options`, define:

```ts
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    getSiteAdapter(displaySiteData.siteType).keyManagement,
  )
  const displayAccountRequest = {
    baseUrl: displaySiteData.baseUrl,
    accountId: displaySiteData.id,
    auth: {
      authType: displaySiteData.authType,
      userId: displaySiteData.userId,
      accessToken: displaySiteData.token,
      cookie: displaySiteData.cookieAuthSessionCookie,
    },
  }
  const createAccountRequest = {
    baseUrl: account.site_url,
    accountId: account.id,
    auth: {
      authType: account.authType,
      userId: account.account_info.id,
      accessToken: account.account_info.access_token,
      cookie: account.cookieAuth?.sessionCookie,
    },
  }
```

Replace key calls:

```ts
  const tokens = await keyManagement.fetchTokens(displayAccountRequest)
```

```ts
    const createApiTokenResult = await keyManagement.createToken(
      createAccountRequest,
      newTokenData,
    )
```

```ts
      const updatedTokens = await keyManagement.fetchTokens(
        displayAccountRequest,
      )
```

Keep `getApiService(...)` imported in this file because `fetchAccountData(...)`, `getOrCreateAccessToken(...)`, and `resolveSub2ApiQuickCreateResolution(...)` still use it.

- [ ] **Step 6: Run provisioning tests**

Run:

```powershell
pnpm vitest run tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit provisioning migration**

Run:

```powershell
git add src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/services/accounts/accountOperations.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts
git commit -m "refactor(accounts): use key management adapters for token provisioning"
```

Expected: commit succeeds after the repo hook runs.

---

### Task 4: Route Account Row And Copy Dialog Token Reads Through Adapter

**Files:**
- Modify: `src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts`
- Modify: `src/features/AccountManagement/components/AccountActionButtons/index.tsx`
- Modify: `tests/features/AccountManagement/components/CopyKeyDialog.test.tsx`
- Modify: `tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx`
- Modify: `tests/features/AccountManagement/components/AccountActionButtons.test.tsx`

- [ ] **Step 1: Update UI tests for adapter-backed token calls**

In `tests/features/AccountManagement/components/CopyKeyDialog.test.tsx`, add `getSiteAdapter` mocking:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: () => ({
    keyManagement: {
      fetchTokens: (...args: any[]) => fetchAccountTokensMock(...args),
      createToken: (...args: any[]) => createApiTokenMock(...args),
      resolveTokenKey: (...args: any[]) => resolveApiTokenKeyMock(...args),
    },
  }),
}))
```

Keep `getApiService` for model and group helpers:

```ts
vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountAvailableModels: (...args: any[]) =>
      fetchAccountAvailableModelsMock(...args),
    fetchUserGroups: (...args: any[]) => fetchUserGroupsMock(...args),
  }),
}))
```

Apply the same mock split in `tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx`.

In `tests/features/AccountManagement/components/AccountActionButtons.test.tsx`, replace the `~/services/apiService` token-list mock with a partial mock for display-account helpers:

```ts
vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/utils/apiServiceRequest")
      >()
    return {
      ...actual,
      fetchDisplayAccountTokens: (...args: unknown[]) =>
        fetchAccountTokensMock(...args),
      resolveDisplayAccountTokenForSecret: async (
        _account: unknown,
        token: { key: string },
      ) => token,
    }
  },
)
```

Remove `fetchAccountTokensMock` from the `~/services/apiService` mock in this test file if no other assertion needs it.

- [ ] **Step 2: Run UI tests to verify old direct service calls fail**

Run:

```powershell
pnpm vitest run tests/features/AccountManagement/components/CopyKeyDialog.test.tsx tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx tests/features/AccountManagement/components/AccountActionButtons.test.tsx
```

Expected: FAIL until UI implementation uses adapter-backed helpers.

- [ ] **Step 3: Update Copy Key dialog hook**

Modify `src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts` imports:

```ts
import {
  canManageDisplayAccountTokens,
  createDisplayAccountApiContext,
  fetchDisplayAccountTokens,
  requireDisplayAccountKeyManagement,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
```

Change `fetchTokens`:

```ts
      const tokensResponse = await fetchDisplayAccountTokens(account)
      setTokens(tokensResponse)
```

Keep the existing catch block so load failures still set localized `loadFailed` copy.

Change `refreshTokensAfterCreate(...)`:

```ts
        const refreshedTokens = await fetchDisplayAccountTokens(account)
        setTokens(refreshedTokens)
```

Change `createDefaultKey(...)` before calling create:

```ts
      const { keyManagement, request } = createDisplayAccountApiContext(account)
      const created = await requireDisplayAccountKeyManagement(
        account,
        keyManagement,
      ).createToken(request, tokenRequest)
```

Keep the Sub2API quick-create resolution block before `createToken(...)`, and keep one-time-key handling in `refreshTokensAfterCreate(...)`.

- [ ] **Step 4: Update account row action token list calls**

Modify `src/features/AccountManagement/components/AccountActionButtons/index.tsx` imports:

```ts
import {
  fetchDisplayAccountTokens,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
```

Remove:

```ts
import { getApiService } from "~/services/apiService"
```

Replace the smart-copy inventory block with:

```ts
      const tokensResponse = await fetchDisplayAccountTokens(site)

      if (tokensResponse.length === 1) {
        const token = tokensResponse[0]
        const resolvedToken = await resolveDisplayAccountTokenForSecret(
          site,
          token,
        )
        await navigator.clipboard.writeText(resolvedToken.key)
        toast.success(t("actions.keyCopied"))
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
          insights: {
            itemCount: tokensResponse.length,
          },
        })
      } else {
        onCopyKey(site)
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped, {
          insights: {
            itemCount: tokensResponse.length,
          },
        })
      }
```

Replace managed-channel locate inventory and secret-resolution account loading with:

```ts
      const tokenLookupAccount = {
        ...site,
        baseUrl: accountBaseUrl,
      }
      const tokensResponse = await fetchDisplayAccountTokens(tokenLookupAccount)
      // ...
      const resolvedToken = await resolveDisplayAccountTokenForSecret(
        tokenLookupAccount,
        apiToken,
      )
```

Remove the old non-array branch in managed-channel locate because `fetchDisplayAccountTokens(...)` now owns invalid payload detection and throws `InvalidTokenPayloadError`.

- [ ] **Step 5: Run UI tests**

Run:

```powershell
pnpm vitest run tests/features/AccountManagement/components/CopyKeyDialog.test.tsx tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx tests/features/AccountManagement/components/AccountActionButtons.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit UI token-flow migration**

Run:

```powershell
git add src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts src/features/AccountManagement/components/AccountActionButtons/index.tsx tests/features/AccountManagement/components/CopyKeyDialog.test.tsx tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx tests/features/AccountManagement/components/AccountActionButtons.test.tsx
git commit -m "refactor(account-ui): use key management adapters for token flows"
```

Expected: commit succeeds after the repo hook runs.

---

### Task 5: Final Validation And Scope Audit

**Files:**
- Inspect all task-scoped files changed in Tasks 1-4.

- [ ] **Step 1: Run focused adapter and account tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused UI tests**

Run:

```powershell
pnpm vitest run tests/features/AccountManagement/components/CopyKeyDialog.test.tsx tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx tests/features/AccountManagement/components/AccountActionButtons.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run related tests for changed source files**

Run:

```powershell
pnpm vitest related --run src/services/apiAdapters/contracts/keyManagement.ts src/services/apiAdapters/registry.ts src/services/accounts/utils/apiServiceRequest.ts src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/services/accounts/accountOperations.ts src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts src/features/AccountManagement/components/AccountActionButtons/index.tsx
```

Expected: PASS.

- [ ] **Step 4: Run TypeScript compile**

Run:

```powershell
pnpm compile
```

Expected: PASS.

- [ ] **Step 5: Run commit gate**

Run:

```powershell
git status --porcelain=v1
pnpm run validate:staged
```

Expected: `validate:staged` passes for task-scoped staged files. Unrelated pre-existing untracked files may remain untracked and must not be staged.

- [ ] **Step 6: Run push gate before publishing**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS. This gate is required before pushing or opening a PR because the slice changes shared TypeScript contracts and account workflow routing.

- [ ] **Step 7: Inspect final diff for scope**

Run:

```powershell
git diff --stat HEAD
git diff -- src/services/apiAdapters src/services/accounts src/features/AccountManagement/components tests/services tests/features/AccountManagement
```

Expected: diff contains only key-management adapter contract/wrappers, account token-flow routing, and focused tests. No locale files, telemetry schema, settings search files, Playwright tests, managed-site provider logic, redemption logic, or new site types are changed.

---

## Telemetry Decision

Telemetry decision: reuse existing.

No new user action, setting, route, or analytics field is introduced. Existing copy-key, create-key, post-save, and managed-channel locate events remain emitted by their current owners.

## E2E Decision

E2E decision: no new Playwright E2E for this slice.

The behavior risk is adapter routing and response-shape preservation. Vitest coverage at adapter, service workflow, hook, and component levels directly covers that risk. Browser-level extension behavior is not the primary risk in this refactor.

## Self-Review

- Spec coverage: Task 1 adds the capability for New API-family, Sub2API, and AIHubMix. Task 2 routes display-account list/secret helpers. Task 3 routes post-save/default-token workflows. Task 4 routes Copy Key dialog and account row flows. Task 5 covers validation, telemetry, and E2E decisions.
- Scope control: The plan does not migrate full Key Management CRUD, `fetchUserGroups(...)`, redemption, model pricing, managed-site providers, site detection, locale files, telemetry schema, settings search, Playwright tests, or new site types.
- Type consistency: The plan consistently uses `keyManagement.fetchTokens(request, options)`, `keyManagement.createToken(request, tokenData)`, and `keyManagement.resolveTokenKey({ request, token })`.
- Compatibility: `createDisplayAccountApiContext(...)` keeps `service` while adding `adapter` and `keyManagement`, so existing non-migrated Key Management page callers keep working during this slice.
