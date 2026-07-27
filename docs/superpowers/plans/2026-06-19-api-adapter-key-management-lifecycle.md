# API Adapter Key Management Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen `SiteAdapter.keyManagement` so account token deletion, group lookup, available-model lookup, group coverage repair, and secondary token inventory reads no longer call the legacy `getApiService(...)` facade from product modules.

**Architecture:** Extend the existing key-management adapter instead of adding a parallel capability. Backend protocol modules remain the delegated implementations; product code asks `createDisplayAccountApiContext(...)` and `requireDisplayAccountKeyManagement(...)` for the site-specific token lifecycle surface.

**Tech Stack:** TypeScript, React hooks/components, WXT extension services, existing `apiAdapters`, Vitest, `pnpm run validate:staged`, `pnpm run validate:push`.

**Spec:** `docs/superpowers/specs/2026-06-19-api-adapter-key-management-lifecycle-design.md`

---

## File Structure

- Modify `src/services/apiAdapters/contracts/keyManagement.ts`
  - Adds `deleteToken(...)`, `fetchUserGroups(...)`, and `fetchAvailableModels(...)` to the existing `KeyManagementCapability`.
- Modify `src/services/apiAdapters/newApi/keyManagement.ts`
  - Delegates the new methods to the site-bound `getApiService(siteType)` implementation.
- Modify `src/services/apiAdapters/sub2api/keyManagement.ts`
  - Delegates the new methods to Sub2API backend helpers.
- Modify `src/services/apiAdapters/aihubmix/keyManagement.ts`
  - Delegates the new methods to AIHubMix backend helpers.
- Modify `tests/services/apiAdapters/keyManagement.test.ts`
  - Covers delegation for delete, groups, and available models.
- Modify `tests/services/apiAdapters/registry.test.ts`
  - Verifies registered key-management adapters expose the widened method set.
- Modify `src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenData.ts`
  - Loads model and group bootstrap data through `keyManagement`.
- Modify `tests/entrypoints/options/pages/KeyManagement/useTokenData.test.tsx`
  - Mocks adapter-backed bootstrap data.
- Modify `src/services/accounts/accountOperations.ts`
  - Routes `resolveSub2ApiQuickCreateResolution(...)` group lookup through `keyManagement`.
- Modify `tests/services/accountOperations.ensureAccountApiToken.test.ts`
  - Moves Sub2API quick-create group mocks from `getApiService(...)` to adapter `keyManagement.fetchUserGroups(...)`.
- Modify `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`
  - Keeps post-save behavior covered after quick-create group lookup moves to the adapter.
- Modify `src/features/KeyManagement/hooks/useKeyManagement.ts`
  - Loads and deletes Key Management page tokens through `keyManagement`.
- Modify `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`
  - Migrates token inventory and delete mocks to adapter key-management mocks.
- Modify `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
  - Routes group coverage list/group/create/delete operations through `keyManagement`.
- Modify `tests/services/accountKeyGroupCoverage.test.ts`
  - Migrates group coverage mocks and delete assertions to the adapter method signatures.
- Modify `src/components/KiloCodeExportDialog.tsx`
  - Loads token inventory through `keyManagement`.
- Modify `tests/components/KiloCodeExportDialog.test.tsx`
  - Updates inventory mocks to `getSiteAdapter(...).keyManagement.fetchTokens(...)`.
- Modify `src/components/dialogs/VerifyApiDialog/index.tsx`
  - Loads account-source token inventory through `keyManagement`.
- Modify `tests/components/VerifyApiDialog.test.tsx`
  - Updates account-source token mocks to the adapter path.
- Modify `src/components/dialogs/VerifyCliSupportDialog/index.tsx`
  - Loads account-source token inventory through `keyManagement`.
- Modify `tests/components/VerifyCliSupportDialog.test.tsx`
  - Updates the `apiServiceRequest` partial mock for the new imports.
- Modify `src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts`
  - Loads and refetches account tokens through `keyManagement`.
- Modify `tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx`
  - Updates Channel dialog token inventory mocks to the adapter path.

Do not modify:

- `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
  - Token list/create already uses `keyManagement`; only its quick-create dependency changes through `accountOperations.ts`.
- `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
  - Default-token list/create already uses `keyManagement`.
- `src/services/apiService/**`
  - Existing backend functions stay as delegated implementations.
- locale files, telemetry schemas, settings search files, Playwright tests, redemption code, managed-site provider/channel CRUD, or new site-type definitions.

---

### Task 1: Extend Key Management Adapter Lifecycle Methods

**Files:**
- Modify: `src/services/apiAdapters/contracts/keyManagement.ts`
- Modify: `src/services/apiAdapters/newApi/keyManagement.ts`
- Modify: `src/services/apiAdapters/sub2api/keyManagement.ts`
- Modify: `src/services/apiAdapters/aihubmix/keyManagement.ts`
- Modify: `tests/services/apiAdapters/keyManagement.test.ts`
- Modify: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Update adapter delegation tests for the widened interface**

In `tests/services/apiAdapters/keyManagement.test.ts`, extend the hoisted mocks:

```ts
const {
  mockAihubmixCreateApiToken,
  mockAihubmixDeleteApiToken,
  mockAihubmixFetchAccountAvailableModels,
  mockAihubmixFetchAccountTokens,
  mockAihubmixFetchUserGroups,
  mockAihubmixResolveApiTokenKey,
  mockCreateApiToken,
  mockDeleteApiToken,
  mockFetchAccountAvailableModels,
  mockFetchAccountTokens,
  mockFetchUserGroups,
  mockGetApiService,
  mockResolveApiTokenKey,
  mockSub2ApiCreateApiToken,
  mockSub2ApiDeleteApiToken,
  mockSub2ApiFetchAccountAvailableModels,
  mockSub2ApiFetchAccountTokens,
  mockSub2ApiFetchUserGroups,
  mockSub2ApiResolveApiTokenKey,
} = vi.hoisted(() => ({
  mockAihubmixCreateApiToken: vi.fn(),
  mockAihubmixDeleteApiToken: vi.fn(),
  mockAihubmixFetchAccountAvailableModels: vi.fn(),
  mockAihubmixFetchAccountTokens: vi.fn(),
  mockAihubmixFetchUserGroups: vi.fn(),
  mockAihubmixResolveApiTokenKey: vi.fn(),
  mockCreateApiToken: vi.fn(),
  mockDeleteApiToken: vi.fn(),
  mockFetchAccountAvailableModels: vi.fn(),
  mockFetchAccountTokens: vi.fn(),
  mockFetchUserGroups: vi.fn(),
  mockGetApiService: vi.fn(),
  mockResolveApiTokenKey: vi.fn(),
  mockSub2ApiCreateApiToken: vi.fn(),
  mockSub2ApiDeleteApiToken: vi.fn(),
  mockSub2ApiFetchAccountAvailableModels: vi.fn(),
  mockSub2ApiFetchAccountTokens: vi.fn(),
  mockSub2ApiFetchUserGroups: vi.fn(),
  mockSub2ApiResolveApiTokenKey: vi.fn(),
}))
```

Update the Sub2API module mock:

```ts
vi.mock("~/services/apiService/sub2api", () => ({
  createApiToken: mockSub2ApiCreateApiToken,
  deleteApiToken: mockSub2ApiDeleteApiToken,
  fetchAccountAvailableModels: mockSub2ApiFetchAccountAvailableModels,
  fetchAccountTokens: mockSub2ApiFetchAccountTokens,
  fetchUserGroups: mockSub2ApiFetchUserGroups,
  resolveApiTokenKey: mockSub2ApiResolveApiTokenKey,
}))
```

Update the AIHubMix module mock:

```ts
vi.mock("~/services/apiService/aihubmix", () => ({
  createApiToken: mockAihubmixCreateApiToken,
  deleteApiToken: mockAihubmixDeleteApiToken,
  fetchAccountAvailableModels: mockAihubmixFetchAccountAvailableModels,
  fetchAccountTokens: mockAihubmixFetchAccountTokens,
  fetchUserGroups: mockAihubmixFetchUserGroups,
  resolveApiTokenKey: mockAihubmixResolveApiTokenKey,
}))
```

In `beforeEach`, return the widened site-specific service:

```ts
mockGetApiService.mockReturnValue({
  createApiToken: mockCreateApiToken,
  deleteApiToken: mockDeleteApiToken,
  fetchAccountAvailableModels: mockFetchAccountAvailableModels,
  fetchAccountTokens: mockFetchAccountTokens,
  fetchUserGroups: mockFetchUserGroups,
  resolveApiTokenKey: mockResolveApiTokenKey,
})
```

Add shared test data after `tokenData`:

```ts
const userGroups = {
  default: { desc: "Default", ratio: 1 },
  vip: { desc: "VIP", ratio: 2 },
}

const availableModels = ["gpt-4o-mini", "claude-3-haiku"]
```

Extend the New API-family test:

```ts
mockDeleteApiToken.mockResolvedValueOnce(true)
mockFetchUserGroups.mockResolvedValueOnce(userGroups)
mockFetchAccountAvailableModels.mockResolvedValueOnce(availableModels)

await expect(
  keyManagement.deleteToken({ request, tokenId: token.id }),
).resolves.toBe(true)
await expect(keyManagement.fetchUserGroups(request)).resolves.toBe(userGroups)
await expect(keyManagement.fetchAvailableModels(request)).resolves.toBe(
  availableModels,
)

expect(mockDeleteApiToken).toHaveBeenCalledWith(request, token.id)
expect(mockFetchUserGroups).toHaveBeenCalledWith(request)
expect(mockFetchAccountAvailableModels).toHaveBeenCalledWith(request)
```

Extend the Sub2API test:

```ts
mockSub2ApiDeleteApiToken.mockResolvedValueOnce(true)
mockSub2ApiFetchUserGroups.mockResolvedValueOnce(userGroups)
mockSub2ApiFetchAccountAvailableModels.mockResolvedValueOnce(availableModels)

await expect(
  sub2ApiKeyManagement.deleteToken({ request, tokenId: token.id }),
).resolves.toBe(true)
await expect(sub2ApiKeyManagement.fetchUserGroups(request)).resolves.toBe(
  userGroups,
)
await expect(sub2ApiKeyManagement.fetchAvailableModels(request)).resolves.toBe(
  availableModels,
)

expect(mockSub2ApiDeleteApiToken).toHaveBeenCalledWith(request, token.id)
expect(mockSub2ApiFetchUserGroups).toHaveBeenCalledWith(request)
expect(mockSub2ApiFetchAccountAvailableModels).toHaveBeenCalledWith(request)
```

Extend the AIHubMix test:

```ts
mockAihubmixDeleteApiToken.mockResolvedValueOnce(true)
mockAihubmixFetchUserGroups.mockResolvedValueOnce(userGroups)
mockAihubmixFetchAccountAvailableModels.mockResolvedValueOnce(availableModels)

await expect(
  aihubmixKeyManagement.deleteToken({ request, tokenId: token.id }),
).resolves.toBe(true)
await expect(aihubmixKeyManagement.fetchUserGroups(request)).resolves.toBe(
  userGroups,
)
await expect(aihubmixKeyManagement.fetchAvailableModels(request)).resolves.toBe(
  availableModels,
)

expect(mockAihubmixDeleteApiToken).toHaveBeenCalledWith(request, token.id)
expect(mockAihubmixFetchUserGroups).toHaveBeenCalledWith(request)
expect(mockAihubmixFetchAccountAvailableModels).toHaveBeenCalledWith(request)
```

- [ ] **Step 2: Update registry expectations**

In `tests/services/apiAdapters/registry.test.ts`, replace each `adapter.keyManagement` expectation with:

```ts
expect(adapter.keyManagement).toEqual({
  fetchTokens: expect.any(Function),
  createToken: expect.any(Function),
  resolveTokenKey: expect.any(Function),
  deleteToken: expect.any(Function),
  fetchUserGroups: expect.any(Function),
  fetchAvailableModels: expect.any(Function),
})
```

Apply this to the Sub2API test, the New API-family loop, and the AIHubMix test.

- [ ] **Step 3: Run adapter tests and verify the expected failure**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: FAIL because `KeyManagementCapability` does not yet include `deleteToken`, `fetchUserGroups`, or `fetchAvailableModels`.

- [ ] **Step 4: Extend the key-management contract**

Modify `src/services/apiAdapters/contracts/keyManagement.ts` to include `UserGroupInfo` and `DeleteTokenRequest`:

```ts
import type {
  ApiServiceRequest,
  CreateTokenRequest,
  CreateTokenResult,
  UserGroupInfo,
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

export type DeleteTokenRequest = {
  request: ApiServiceRequest
  tokenId: number
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
    request: ResolveTokenSecretRequest<TToken>,
  ): Promise<string>
  deleteToken(request: DeleteTokenRequest): Promise<boolean | void>
  fetchUserGroups(
    request: ApiServiceRequest,
  ): Promise<Record<string, UserGroupInfo>>
  fetchAvailableModels(request: ApiServiceRequest): Promise<string[]>
}
```

- [ ] **Step 5: Extend New API-family key management**

Modify `src/services/apiAdapters/newApi/keyManagement.ts`:

```ts
export function createNewApiKeyManagement(
  siteType: AccountSiteType,
): KeyManagementCapability {
  return {
    fetchTokens: (request, options) =>
      getApiService(siteType).fetchAccountTokens(
        request,
        options?.page,
        options?.size,
      ),
    createToken: (request, tokenData) =>
      getApiService(siteType).createApiToken(request, tokenData),
    resolveTokenKey: ({ request, token }) =>
      getApiService(siteType).resolveApiTokenKey(request, token),
    deleteToken: ({ request, tokenId }) =>
      getApiService(siteType).deleteApiToken(request, tokenId),
    fetchUserGroups: (request) =>
      getApiService(siteType).fetchUserGroups(request),
    fetchAvailableModels: (request) =>
      getApiService(siteType).fetchAccountAvailableModels(request),
  }
}
```

- [ ] **Step 6: Extend Sub2API key management**

Modify `src/services/apiAdapters/sub2api/keyManagement.ts`:

```ts
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchUserGroups,
  resolveApiTokenKey,
} from "~/services/apiService/sub2api"

export const sub2ApiKeyManagement: KeyManagementCapability = {
  fetchTokens: (request, options) =>
    fetchAccountTokens(request, options?.page, options?.size),
  createToken: (request, tokenData) => createApiToken(request, tokenData),
  resolveTokenKey: ({ request, token }) => resolveApiTokenKey(request, token),
  deleteToken: ({ request, tokenId }) => deleteApiToken(request, tokenId),
  fetchUserGroups: (request) => fetchUserGroups(request),
  fetchAvailableModels: (request) => fetchAccountAvailableModels(request),
}
```

- [ ] **Step 7: Extend AIHubMix key management**

Modify `src/services/apiAdapters/aihubmix/keyManagement.ts`:

```ts
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchUserGroups,
  resolveApiTokenKey,
} from "~/services/apiService/aihubmix"

export const aihubmixKeyManagement: KeyManagementCapability = {
  fetchTokens: (request) => fetchAccountTokens(request),
  createToken: (request, tokenData) => createApiToken(request, tokenData),
  resolveTokenKey: ({ request, token }) => resolveApiTokenKey(request, token),
  deleteToken: ({ request, tokenId }) => deleteApiToken(request, tokenId),
  fetchUserGroups: (request) => fetchUserGroups(request),
  fetchAvailableModels: (request) => fetchAccountAvailableModels(request),
}
```

- [ ] **Step 8: Run adapter tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit adapter lifecycle methods**

Run:

```powershell
git add src/services/apiAdapters/contracts/keyManagement.ts src/services/apiAdapters/newApi/keyManagement.ts src/services/apiAdapters/sub2api/keyManagement.ts src/services/apiAdapters/aihubmix/keyManagement.ts tests/services/apiAdapters/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts
git commit -m "refactor(api-adapters): extend key management lifecycle"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 2: Route Add Token Bootstrap And Sub2API Quick-Create Groups

**Files:**
- Modify: `src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenData.ts`
- Modify: `tests/entrypoints/options/pages/KeyManagement/useTokenData.test.tsx`
- Modify: `src/services/accounts/accountOperations.ts`
- Modify: `tests/services/accountOperations.ensureAccountApiToken.test.ts`
- Modify: `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`

- [ ] **Step 1: Update `useTokenData` tests to mock adapter key-management bootstrap methods**

In `tests/entrypoints/options/pages/KeyManagement/useTokenData.test.tsx`, update the `apiServiceRequest` mock:

```ts
vi.mock("~/services/accounts/utils/apiServiceRequest", () => ({
  createDisplayAccountApiContext: (...args: any[]) =>
    createDisplayAccountApiContextMock(...args),
  requireDisplayAccountKeyManagement: (
    _account: unknown,
    keyManagement: unknown,
  ) => keyManagement,
}))
```

In `beforeEach`, return `keyManagement` instead of `service`:

```ts
createDisplayAccountApiContextMock.mockReturnValue({
  keyManagement: {
    fetchAvailableModels: fetchAccountAvailableModelsMock,
    fetchUserGroups: fetchUserGroupsMock,
  },
  request: { accountId: ACCOUNT.id },
})
```

Keep the existing assertions against `fetchAccountAvailableModelsMock` and `fetchUserGroupsMock`; those function names can remain as test-local legacy names even though the adapter method is `fetchAvailableModels(...)`.

- [ ] **Step 2: Update Sub2API quick-create tests to source groups from the adapter**

In `tests/services/accountOperations.ensureAccountApiToken.test.ts`, extend the `getSiteAdapterMock` key-management object:

```ts
getSiteAdapterMock: vi.fn(() => ({
  keyManagement: {
    fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
    createToken: (...args: unknown[]) => createApiTokenMock(...args),
    resolveTokenKey: vi.fn(),
    deleteToken: vi.fn(),
    fetchUserGroups: (...args: unknown[]) => fetchUserGroupsMock(...args),
    fetchAvailableModels: vi.fn(),
  },
})),
```

Replace the `~/services/apiService` mock with an inert facade for this test file:

```ts
vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: vi.fn(() => ({})),
  }
})
```

In `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`, make the same `keyManagement.fetchUserGroups` addition:

```ts
getSiteAdapterMock: vi.fn(() => ({
  keyManagement: {
    fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
    createToken: (...args: unknown[]) => createApiTokenMock(...args),
    resolveTokenKey: vi.fn(),
    deleteToken: vi.fn(),
    fetchUserGroups: (...args: unknown[]) => fetchUserGroupsMock(...args),
    fetchAvailableModels: vi.fn(),
  },
})),
```

Replace that file's `~/services/apiService` mock with:

```ts
vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: vi.fn(() => ({})),
  }
})
```

- [ ] **Step 3: Run affected tests and verify the expected failures**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/KeyManagement/useTokenData.test.tsx tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
```

Expected: FAIL because `useTokenData.ts` and `resolveSub2ApiQuickCreateResolution(...)` still call `service.fetchAccountAvailableModels(...)` and `service.fetchUserGroups(...)`.

- [ ] **Step 4: Route Add Token bootstrap data through key management**

Modify `src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenData.ts`.

Replace the import:

```ts
import { createDisplayAccountApiContext } from "~/services/accounts/utils/apiServiceRequest"
```

with:

```ts
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
} from "~/services/accounts/utils/apiServiceRequest"
```

Replace the context and bootstrap load block:

```ts
const { service, request } =
  createDisplayAccountApiContext(currentAccount)

const [models, groupsData] = await Promise.all([
  service.fetchAccountAvailableModels(request),
  service.fetchUserGroups(request).catch((error) => {
    if (isFeatureUnsupportedError(error)) {
      return EMPTY_USER_GROUPS
    }

    throw error
  }),
])
```

with:

```ts
const { keyManagement, request } =
  createDisplayAccountApiContext(currentAccount)
const capability = requireDisplayAccountKeyManagement(
  currentAccount,
  keyManagement,
)

const [models, groupsData] = await Promise.all([
  capability.fetchAvailableModels(request),
  capability.fetchUserGroups(request).catch((error) => {
    if (isFeatureUnsupportedError(error)) {
      return EMPTY_USER_GROUPS
    }

    throw error
  }),
])
```

Do not change the group defaulting block below this code.

- [ ] **Step 5: Route Sub2API quick-create group lookup through key management**

Modify `src/services/accounts/accountOperations.ts`.

Replace the group lookup in `resolveSub2ApiQuickCreateResolution(...)`:

```ts
const { service, request } = createDisplayAccountApiContext(account)
const groups = await service.fetchUserGroups(request)
```

with:

```ts
const { keyManagement, request } = createDisplayAccountApiContext(account)
const groups = await requireDisplayAccountKeyManagement(
  account,
  keyManagement,
).fetchUserGroups(request)
```

Keep `getApiService(...)` imports and uses that support other account operations outside this function.

- [ ] **Step 6: Run affected tests**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/KeyManagement/useTokenData.test.tsx tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit bootstrap and quick-create migration**

Run:

```powershell
git add src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenData.ts tests/entrypoints/options/pages/KeyManagement/useTokenData.test.tsx src/services/accounts/accountOperations.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
git commit -m "refactor(key-management): load groups and models through adapters"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 3: Route Key Management Page Inventory And Delete

**Files:**
- Modify: `src/features/KeyManagement/hooks/useKeyManagement.ts`
- Modify: `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`

- [ ] **Step 1: Add an adapter registry mock to the Key Management hook tests**

In `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`, add this import:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
```

Add this module mock near the existing `~/services/apiService` mock:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: vi.fn(),
}))
```

Add this helper after `createWrapper()`:

```ts
const createAdapterWithKeyManagement = (overrides: {
  fetchTokens?: ReturnType<typeof vi.fn>
  createToken?: ReturnType<typeof vi.fn>
  resolveTokenKey?: ReturnType<typeof vi.fn>
  deleteToken?: ReturnType<typeof vi.fn>
  fetchUserGroups?: ReturnType<typeof vi.fn>
  fetchAvailableModels?: ReturnType<typeof vi.fn>
} = {}) => ({
  siteType: SITE_TYPES.NEW_API,
  keyManagement: {
    fetchTokens: overrides.fetchTokens ?? vi.fn().mockResolvedValue([]),
    createToken: overrides.createToken ?? vi.fn(),
    resolveTokenKey:
      overrides.resolveTokenKey ??
      vi.fn(async ({ token }: { token: { key: string } }) => token.key),
    deleteToken: overrides.deleteToken ?? vi.fn().mockResolvedValue(undefined),
    fetchUserGroups: overrides.fetchUserGroups ?? vi.fn().mockResolvedValue({}),
    fetchAvailableModels:
      overrides.fetchAvailableModels ?? vi.fn().mockResolvedValue([]),
  },
})
```

In the top-level `beforeEach`, reset the adapter mock:

```ts
vi.mocked(getSiteAdapter).mockReset()
vi.mocked(getSiteAdapter).mockReturnValue(createAdapterWithKeyManagement() as any)
vi.mocked(getApiService).mockReset()
vi.mocked(getApiService).mockReturnValue({} as any)
```

This file should no longer rely on `getApiService(...)` for token inventory, deletion, reveal, or copy behavior after the test migration is complete.

- [ ] **Step 2: Replace inventory mock setup**

In `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`, replace each token inventory setup shaped like:

```ts
vi.mocked(getApiService).mockReturnValue({ fetchAccountTokens } as any)
```

or:

```ts
mockedGetApiService.mockReturnValue({ fetchAccountTokens } as any)
```

with:

```ts
vi.mocked(getSiteAdapter).mockReturnValue(
  createAdapterWithKeyManagement({
    fetchTokens: fetchAccountTokens,
  }) as any,
)
vi.mocked(getApiService).mockReturnValue({} as any)
```

Keep existing assertions against `fetchAccountTokens`; the same local mock is now called through `keyManagement.fetchTokens(...)`.

- [ ] **Step 3: Replace secret-resolution mock setup and expectations**

In reveal/copy tests, replace setup shaped like:

```ts
const resolveApiTokenKey = vi.fn().mockResolvedValue(resolvedKey)
vi.mocked(getApiService).mockReturnValue({
  fetchAccountTokens,
  resolveApiTokenKey,
} as any)
```

with:

```ts
const resolveTokenKey = vi.fn().mockResolvedValue(resolvedKey)
vi.mocked(getSiteAdapter).mockReturnValue(
  createAdapterWithKeyManagement({
    fetchTokens: fetchAccountTokens,
    resolveTokenKey,
  }) as any,
)
vi.mocked(getApiService).mockReturnValue({} as any)
```

Replace assertions shaped like:

```ts
expect(resolveApiTokenKey).toHaveBeenCalledTimes(1)
```

with:

```ts
expect(resolveTokenKey).toHaveBeenCalledTimes(1)
```

For copy-only tests that do not load inventory first, use:

```ts
const resolveTokenKey = vi.fn().mockResolvedValue("resolved-token-secret")
vi.mocked(getSiteAdapter).mockReturnValue(
  createAdapterWithKeyManagement({
    resolveTokenKey,
  }) as any,
)
vi.mocked(getApiService).mockReturnValue({} as any)
```

For resolver failure tests, use the same `resolveTokenKey` setup with `mockRejectedValue(...)` and keep the existing toast and analytics assertions unchanged.

- [ ] **Step 4: Replace delete mock setup and expectations**

In each delete test, replace:

```ts
const deleteApiToken = vi.fn().mockResolvedValue(undefined)
vi.mocked(getApiService).mockReturnValue({
  fetchAccountTokens,
  deleteApiToken,
} as any)
```

with:

```ts
const deleteToken = vi.fn().mockResolvedValue(undefined)
vi.mocked(getSiteAdapter).mockReturnValue(
  createAdapterWithKeyManagement({
    fetchTokens: fetchAccountTokens,
    deleteToken,
  }) as any,
)
vi.mocked(getApiService).mockReturnValue({} as any)
```

Replace expectations shaped like:

```ts
expect(deleteApiToken).toHaveBeenCalledWith(expect.anything(), token.id)
```

with:

```ts
expect(deleteToken).toHaveBeenCalledWith({
  request: expect.anything(),
  tokenId: token.id,
})
```

For the test that asserts the numeric token id `303`, use:

```ts
expect(deleteToken).toHaveBeenCalledWith({
  request: expect.anything(),
  tokenId: 303,
})
```

- [ ] **Step 5: Run the hook test and verify the expected failure**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx
```

Expected: FAIL because `useKeyManagement.ts` still calls `service.fetchAccountTokens(...)` and `service.deleteApiToken(...)`.

- [ ] **Step 6: Route inventory loading through key management**

Modify `src/features/KeyManagement/hooks/useKeyManagement.ts`.

Ensure the import from `apiServiceRequest` includes the guard:

```ts
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
```

Replace the load block:

```ts
const { service, request } = createDisplayAccountApiContext(account)
const tokens = await service.fetchAccountTokens(request)
```

with:

```ts
const { keyManagement, request } = createDisplayAccountApiContext(account)
const tokens = await requireDisplayAccountKeyManagement(
  account,
  keyManagement,
).fetchTokens(request)
```

Keep the existing non-array validation block.

- [ ] **Step 7: Route delete through key management**

In `handleDeleteToken(...)`, replace:

```ts
const { service, request } = createDisplayAccountApiContext(account)
await service.deleteApiToken(request, token.id)
```

with:

```ts
const { keyManagement, request } = createDisplayAccountApiContext(account)
await requireDisplayAccountKeyManagement(account, keyManagement).deleteToken({
  request,
  tokenId: token.id,
})
```

Keep optimistic local removal, managed-site status invalidation, toasts, analytics, and reload behavior unchanged.

- [ ] **Step 8: Run the hook test**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Confirm direct legacy calls are gone from the hook**

Run:

```powershell
rg -n "fetchAccountTokens|deleteApiToken|service\\." src/features/KeyManagement/hooks/useKeyManagement.ts
```

Expected: no matches for `fetchAccountTokens`, `deleteApiToken`, or `service.`.

- [ ] **Step 10: Commit Key Management page migration**

Run:

```powershell
git add src/features/KeyManagement/hooks/useKeyManagement.ts tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx
git commit -m "refactor(key-management): route page lifecycle through adapters"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 4: Route Group Coverage And Invalid-Token Repair

**Files:**
- Modify: `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
- Modify: `tests/services/accountKeyGroupCoverage.test.ts`

- [ ] **Step 1: Update group coverage tests to mock the adapter registry**

In `tests/services/accountKeyGroupCoverage.test.ts`, replace:

```ts
vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: vi.fn(() => mocks),
  }
})
```

with:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: vi.fn(() => ({
    keyManagement: {
      fetchTokens: (...args: unknown[]) => mocks.fetchAccountTokens(...args),
      fetchUserGroups: (...args: unknown[]) => mocks.fetchUserGroups(...args),
      createToken: (...args: unknown[]) => mocks.createApiToken(...args),
      deleteToken: (...args: unknown[]) => mocks.deleteApiToken(...args),
      resolveTokenKey: vi.fn(),
      fetchAvailableModels: vi.fn(),
    },
  })),
}))
```

Keep the `mocks` object names unchanged to reduce churn:

```ts
const mocks = vi.hoisted(() => ({
  fetchAccountTokens: vi.fn(),
  fetchUserGroups: vi.fn(),
  createApiToken: vi.fn(),
  deleteApiToken: vi.fn(),
}))
```

Update invalid-token deletion assertions from:

```ts
expect(mocks.deleteApiToken).toHaveBeenCalledWith(expect.anything(), 9)
```

to:

```ts
expect(mocks.deleteApiToken).toHaveBeenCalledWith({
  request: expect.anything(),
  tokenId: 9,
})
```

Use the same object expectation for any other `deleteApiToken` call assertions in this file.

- [ ] **Step 2: Run group coverage tests and verify the expected failure**

Run:

```powershell
pnpm vitest run tests/services/accountKeyGroupCoverage.test.ts
```

Expected: FAIL because `groupCoverage.ts` still imports `getApiService(...)` and calls `service.fetchAccountTokens(...)`, `service.fetchUserGroups(...)`, `service.createApiToken(...)`, and `service.deleteApiToken(...)`.

- [ ] **Step 3: Route group coverage through key management**

Modify `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`.

Replace:

```ts
import { getApiService } from "~/services/apiService"
```

with:

```ts
import { requireDisplayAccountKeyManagement } from "~/services/accounts/utils/apiServiceRequest"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
```

In `ensureAccountKeysForAvailableGroups(...)`, replace:

```ts
const service = getApiService(displaySiteData.siteType)
const request = createAccountApiRequest(account, displaySiteData)
const accountId = displaySiteData.id || account.id

const tokens = await service.fetchAccountTokens(request)
```

with:

```ts
const keyManagement = requireDisplayAccountKeyManagement(
  displaySiteData,
  getSiteAdapter(displaySiteData.siteType).keyManagement,
)
const request = createAccountApiRequest(account, displaySiteData)
const accountId = displaySiteData.id || account.id

const tokens = await keyManagement.fetchTokens(request)
```

Replace:

```ts
const groupsData = await service.fetchUserGroups(request)
```

with:

```ts
const groupsData = await keyManagement.fetchUserGroups(request)
```

Replace default token creation:

```ts
await service.createApiToken(request, generateDefaultTokenRequest())
```

with:

```ts
await keyManagement.createToken(request, generateDefaultTokenRequest())
```

Replace group token creation:

```ts
await service.createApiToken(
  request,
  buildGroupDefaultTokenRequest(group),
)
```

with:

```ts
await keyManagement.createToken(request, buildGroupDefaultTokenRequest(group))
```

- [ ] **Step 4: Route invalid-token deletion through key management**

In `deleteInvalidAccountToken(...)`, replace:

```ts
const service = getApiService(displaySiteData.siteType)
const request = createAccountApiRequest(account, displaySiteData)
await service.deleteApiToken(request, token.tokenId)
```

with:

```ts
const keyManagement = requireDisplayAccountKeyManagement(
  displaySiteData,
  getSiteAdapter(displaySiteData.siteType).keyManagement,
)
const request = createAccountApiRequest(account, displaySiteData)
await keyManagement.deleteToken({
  request,
  tokenId: token.tokenId,
})
```

- [ ] **Step 5: Run group coverage tests**

Run:

```powershell
pnpm vitest run tests/services/accountKeyGroupCoverage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Confirm the group coverage module no longer imports the legacy facade**

Run:

```powershell
rg -n "getApiService|fetchAccountTokens|fetchUserGroups|createApiToken|deleteApiToken" src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts
```

Expected: no matches.

- [ ] **Step 7: Commit group coverage migration**

Run:

```powershell
git add src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts tests/services/accountKeyGroupCoverage.test.ts
git commit -m "refactor(accounts): audit group keys through adapters"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 5: Route Secondary Token Inventory Surfaces

**Files:**
- Modify: `src/components/KiloCodeExportDialog.tsx`
- Modify: `tests/components/KiloCodeExportDialog.test.tsx`
- Modify: `src/components/dialogs/VerifyApiDialog/index.tsx`
- Modify: `tests/components/VerifyApiDialog.test.tsx`
- Modify: `src/components/dialogs/VerifyCliSupportDialog/index.tsx`
- Modify: `tests/components/VerifyCliSupportDialog.test.tsx`
- Modify: `src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts`
- Modify: `tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx`

- [ ] **Step 1: Update Kilo Code export tests**

In `tests/components/KiloCodeExportDialog.test.tsx`, add a registry mock after the existing `~/services/apiService` mock:

```ts
const mockGetSiteAdapter = vi.fn()

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: (...args: unknown[]) => mockGetSiteAdapter(...args),
}))
```

In `beforeEach`, add:

```ts
mockGetSiteAdapter.mockReset()
mockGetSiteAdapter.mockReturnValue({
  keyManagement: {
    fetchTokens: (...args: unknown[]) => mockFetchAccountTokens(...args),
    createToken: vi.fn(),
    resolveTokenKey: (...args: unknown[]) => mockResolveApiTokenKey(...args),
    deleteToken: vi.fn(),
    fetchUserGroups: (...args: unknown[]) => mockFetchUserGroups(...args),
    fetchAvailableModels: (...args: unknown[]) =>
      mockFetchAccountAvailableModels(...args),
  },
})
```

Keep `mockGetApiService` only for any remaining non-inventory legacy service calls in this test file. If `rg -n "mockGetApiService|getApiService" tests/components/KiloCodeExportDialog.test.tsx` shows no remaining uses after this task, remove the dead mock.

- [ ] **Step 2: Update Verify API dialog tests**

In `tests/components/VerifyApiDialog.test.tsx`, replace the token inventory `apiService` mock with an adapter registry mock.

Add:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: () => ({
    keyManagement: {
      fetchTokens: (...args: any[]) => mockFetchAccountTokens(...args),
      createToken: vi.fn(),
      resolveTokenKey: async ({ token }: { token: { key: string } }) =>
        token.key,
      deleteToken: vi.fn(),
      fetchUserGroups: vi.fn(),
      fetchAvailableModels: vi.fn(),
    },
  }),
}))
```

Replace:

```ts
vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    fetchAccountTokens: (...args: any[]) => mockFetchAccountTokens(...args),
    resolveApiTokenKey: async (_request: unknown, token: { key: string }) =>
      token.key,
  }),
}))
```

with:

```ts
vi.mock("~/services/apiService", () => ({
  getApiService: () => ({}),
}))
```

- [ ] **Step 3: Update Verify CLI support dialog tests**

In `tests/components/VerifyCliSupportDialog.test.tsx`, replace the `apiServiceRequest` mock with a partial mock that exposes the new imports:

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
      createDisplayAccountApiContext: (account: any) => ({
        keyManagement: {
          fetchTokens: (...args: any[]) => mockFetchAccountTokens(...args),
          createToken: vi.fn(),
          resolveTokenKey: vi.fn(),
          deleteToken: vi.fn(),
          fetchUserGroups: vi.fn(),
          fetchAvailableModels: vi.fn(),
        },
        request: {
          baseUrl: account.baseUrl,
          accountId: account.id,
          auth: {
            authType: account.authType,
            userId: account.userId,
            accessToken: account.token,
            cookie: account.cookieAuthSessionCookie,
          },
        },
      }),
      requireDisplayAccountKeyManagement: (
        _account: unknown,
        keyManagement: unknown,
      ) => keyManagement,
      resolveDisplayAccountTokenForSecret: (...args: any[]) =>
        mockResolveDisplayAccountTokenForSecret(...args),
    }
  },
)
```

Replace the `~/services/apiService` mock with:

```ts
vi.mock("~/services/apiService", () => ({
  getApiService: () => ({}),
}))
```

- [ ] **Step 4: Update Channel dialog tests**

In `tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx`, replace the token inventory `apiService` mock with a registry-backed key-management mock:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: () => ({
    keyManagement: {
      fetchTokens: (...args: any[]) => mockFetchAccountTokens(...args),
      createToken: vi.fn(),
      resolveTokenKey: ({ request, token }: any) =>
        mockResolveApiTokenKey(request, token),
      deleteToken: vi.fn(),
      fetchUserGroups: vi.fn(),
      fetchAvailableModels: vi.fn(),
    },
  }),
}))
```

Replace the existing `~/services/apiService` mock with:

```ts
vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()

  return {
    ...actual,
    getApiService: vi.fn(() => ({})),
  }
})
```

Keep every assertion against `mockFetchAccountTokens`; only the route to that mock changes.

- [ ] **Step 5: Run secondary surface tests and verify expected failures**

Run:

```powershell
pnpm vitest run tests/components/KiloCodeExportDialog.test.tsx tests/components/VerifyApiDialog.test.tsx tests/components/VerifyCliSupportDialog.test.tsx tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
```

Expected: FAIL because the source components still use `getApiService(...).fetchAccountTokens(...)` or `service.fetchAccountTokens(...)`.

- [ ] **Step 6: Migrate Kilo Code export token inventory loading**

Modify `src/components/KiloCodeExportDialog.tsx`.

Replace:

```ts
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import { getApiService } from "~/services/apiService"
```

with:

```ts
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
```

Delete the `buildFetchTokenArgs(...)` helper.

Replace:

```ts
const service = getApiService(site.siteType)
const tokens = await service.fetchAccountTokens(
  buildFetchTokenArgs(site),
)
```

with:

```ts
const { keyManagement, request } = createDisplayAccountApiContext(site)
const tokens = await requireDisplayAccountKeyManagement(
  site,
  keyManagement,
).fetchTokens(request)
```

Keep the existing non-array handling and error message behavior.

- [ ] **Step 7: Migrate Verify API dialog token inventory loading**

Modify `src/components/dialogs/VerifyApiDialog/index.tsx`.

Replace:

```ts
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import { getApiService } from "~/services/apiService"
```

with:

```ts
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
```

Replace the token load call:

```ts
const accountTokens = await getApiService(
  account.siteType,
).fetchAccountTokens({
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
const { keyManagement, request } = createDisplayAccountApiContext(account)
const accountTokens = await requireDisplayAccountKeyManagement(
  account,
  keyManagement,
).fetchTokens(request)
```

Do not change compatible-token filtering, history loading, probe execution, or analytics.

- [ ] **Step 8: Migrate Verify CLI support token inventory loading**

Modify `src/components/dialogs/VerifyCliSupportDialog/index.tsx`.

Replace:

```ts
import { resolveDisplayAccountTokenForSecret } from "~/services/accounts/utils/apiServiceRequest"
import { getApiService } from "~/services/apiService"
```

with:

```ts
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
```

Replace the account-source load call:

```ts
const accountTokens = await getApiService(
  account.siteType,
).fetchAccountTokens({
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
const { keyManagement, request } = createDisplayAccountApiContext(account)
const accountTokens = await requireDisplayAccountKeyManagement(
  account,
  keyManagement,
).fetchTokens(request)
```

Keep the profile-source branch unchanged.

- [ ] **Step 9: Migrate Channel dialog token inventory loading and refetching**

Modify `src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts`.

Update the import:

```ts
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
```

In `openSub2ApiTokenCreationDialog(...)`, replace:

```ts
const { service, request } = createDisplayAccountApiContext(account)
const existingTokens = await service.fetchAccountTokens(request)
```

with:

```ts
const { keyManagement, request } = createDisplayAccountApiContext(account)
const existingTokens = await requireDisplayAccountKeyManagement(
  account,
  keyManagement,
).fetchTokens(request)
```

In `openCredentialDuplicateWarning(...)`, replace the service/request locals:

```ts
let accountApiService:
  | ReturnType<typeof createDisplayAccountApiContext>["service"]
  | null = null
let accountApiRequest:
  | ReturnType<typeof createDisplayAccountApiContext>["request"]
  | null = null
```

with:

```ts
let accountKeyManagement:
  | NonNullable<ReturnType<typeof createDisplayAccountApiContext>["keyManagement"]>
  | null = null
let accountApiRequest:
  | ReturnType<typeof createDisplayAccountApiContext>["request"]
  | null = null
```

Replace the initial inventory load:

```ts
const accountApiContext =
  createDisplayAccountApiContext(displaySiteData)
accountApiService = accountApiContext.service
accountApiRequest = accountApiContext.request
const existingTokens =
  await accountApiService.fetchAccountTokens(accountApiRequest)
```

with:

```ts
const accountApiContext =
  createDisplayAccountApiContext(displaySiteData)
accountKeyManagement = requireDisplayAccountKeyManagement(
  displaySiteData,
  accountApiContext.keyManagement,
)
accountApiRequest = accountApiContext.request
const existingTokens = await accountKeyManagement.fetchTokens(accountApiRequest)
```

Replace the refetch block:

```ts
const refetchedTokens =
  accountApiService && accountApiRequest
    ? await accountApiService.fetchAccountTokens(
        accountApiRequest,
      )
    : null
```

with:

```ts
const refetchedTokens =
  accountKeyManagement && accountApiRequest
    ? await accountKeyManagement.fetchTokens(accountApiRequest)
    : null
```

Keep `Array.isArray(...)` guards, token-id diff selection, duplicate warning behavior, and cancellation guards unchanged.

- [ ] **Step 10: Run secondary surface tests**

Run:

```powershell
pnpm vitest run tests/components/KiloCodeExportDialog.test.tsx tests/components/VerifyApiDialog.test.tsx tests/components/VerifyCliSupportDialog.test.tsx tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Commit secondary surface migration**

Run:

```powershell
git add src/components/KiloCodeExportDialog.tsx tests/components/KiloCodeExportDialog.test.tsx src/components/dialogs/VerifyApiDialog/index.tsx tests/components/VerifyApiDialog.test.tsx src/components/dialogs/VerifyCliSupportDialog/index.tsx tests/components/VerifyCliSupportDialog.test.tsx src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
git commit -m "refactor(dialogs): load account tokens through adapters"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

### Task 6: Final Validation And Scope Audit

**Files:**
- Review all task-scoped files changed in Tasks 1-5.

- [ ] **Step 1: Run focused adapter and service tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accountKeyGroupCoverage.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused UI hook and dialog tests**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/KeyManagement/useTokenData.test.tsx tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx tests/components/KiloCodeExportDialog.test.tsx tests/components/VerifyApiDialog.test.tsx tests/components/VerifyCliSupportDialog.test.tsx tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run related validation for changed source files**

Run:

```powershell
pnpm vitest related --run src/services/apiAdapters/contracts/keyManagement.ts src/services/apiAdapters/newApi/keyManagement.ts src/services/apiAdapters/sub2api/keyManagement.ts src/services/apiAdapters/aihubmix/keyManagement.ts src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenData.ts src/services/accounts/accountOperations.ts src/features/KeyManagement/hooks/useKeyManagement.ts src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts src/components/KiloCodeExportDialog.tsx src/components/dialogs/VerifyApiDialog/index.tsx src/components/dialogs/VerifyCliSupportDialog/index.tsx src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts
```

Expected: PASS. If `vitest related` expands to unrelated long-running suites or times out, classify that as tooling and keep the focused suites plus `pnpm compile` as the primary evidence.

- [ ] **Step 4: Run TypeScript compile**

Run:

```powershell
pnpm compile
```

Expected: PASS.

- [ ] **Step 5: Audit remaining legacy token lifecycle calls in migrated surfaces**

Run:

```powershell
rg -n "fetchAccountTokens|deleteApiToken|fetchUserGroups|fetchAccountAvailableModels|getApiService\\(" src/features/KeyManagement src/services/accounts/accountKeyAutoProvisioning src/components/KiloCodeExportDialog.tsx src/components/dialogs/VerifyApiDialog src/components/dialogs/VerifyCliSupportDialog src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts
```

Expected remaining matches:

```text
src/components/dialogs/ChannelDialog/hooks/useChannelForm.ts
```

`useChannelForm.ts` may still use `getApiService(...).fetchUserGroups(...)` for managed-site channel form group loading; that managed-site channel flow is out of scope for this key-management lifecycle slice. No migrated file should match direct `fetchAccountTokens`, `deleteApiToken`, `fetchAccountAvailableModels`, or `getApiService(...)` for account token lifecycle.

- [ ] **Step 6: Run commit gate**

Run:

```powershell
git status --porcelain=v1
pnpm run validate:staged
```

Expected: `validate:staged` passes for task-scoped staged files. Existing unrelated untracked files may remain untracked and must not be staged.

- [ ] **Step 7: Run push gate before publishing**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS. This gate is required before pushing or opening a PR because this slice changes shared adapter contracts and multiple token-workflow call sites.

- [ ] **Step 8: Inspect final diff scope**

If tasks were committed individually, run:

```powershell
git show --stat --oneline HEAD~5..HEAD
git diff --name-status HEAD~5..HEAD
```

Expected changed files are limited to:

```text
src/services/apiAdapters/contracts/keyManagement.ts
src/services/apiAdapters/newApi/keyManagement.ts
src/services/apiAdapters/sub2api/keyManagement.ts
src/services/apiAdapters/aihubmix/keyManagement.ts
src/features/KeyManagement/components/AddTokenDialog/hooks/useTokenData.ts
src/services/accounts/accountOperations.ts
src/features/KeyManagement/hooks/useKeyManagement.ts
src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts
src/components/KiloCodeExportDialog.tsx
src/components/dialogs/VerifyApiDialog/index.tsx
src/components/dialogs/VerifyCliSupportDialog/index.tsx
src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts
tests/services/apiAdapters/keyManagement.test.ts
tests/services/apiAdapters/registry.test.ts
tests/entrypoints/options/pages/KeyManagement/useTokenData.test.tsx
tests/services/accountOperations.ensureAccountApiToken.test.ts
tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx
tests/services/accountKeyGroupCoverage.test.ts
tests/components/KiloCodeExportDialog.test.tsx
tests/components/VerifyApiDialog.test.tsx
tests/components/VerifyCliSupportDialog.test.tsx
tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
```

No locale files, telemetry schema, settings search files, Playwright tests, redemption logic, managed-site provider/channel CRUD, account completion internals, model pricing assembly, or new site types should be changed.

- [ ] **Step 9: Record execution notes**

Before handing off, report:

```text
Focused tests:
- pnpm vitest run tests/services/apiAdapters/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accountKeyGroupCoverage.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
- pnpm vitest run tests/entrypoints/options/pages/KeyManagement/useTokenData.test.tsx tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx tests/components/KiloCodeExportDialog.test.tsx tests/components/VerifyApiDialog.test.tsx tests/components/VerifyCliSupportDialog.test.tsx tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx

Validation:
- pnpm compile
- pnpm run validate:staged
- pnpm run validate:push

Telemetry decision:
- Reuse existing telemetry. No new user action, setting, or analytics field was added.

Settings search decision:
- None. No settings UI, route, anchor, or search definition changed.

E2E decision:
- No new Playwright E2E. This refactor changes service-layer routing and hook/component mocked-token loading paths covered by Vitest; browser runtime behavior is unchanged.
```

---

## Out Of Scope

- Do not add a new site type.
- Do not migrate redemption or `redeemCode(...)`.
- Do not migrate managed-site channel CRUD, channel status checks, model sync, provider registration, or `useChannelForm.ts` managed-site group loading.
- Do not migrate account completion internals such as `fetchSiteStatus(...)`, `fetchSupportCheckIn(...)`, or `getOrCreateAccessToken(...)`.
- Do not move model pricing assembly, Sub2API estimated pricing, or `PricingResponse` construction.
- Do not introduce a provisioning policy engine.
- Do not remove `getApiService(...)` or `ApiServiceCapabilities` globally.
- Do not add an import guard in this slice.
- Do not change user-facing copy, locale keys, telemetry schema, settings search entries, or Playwright E2E tests.

## Self-Review

- Spec coverage: Task 1 widens `KeyManagementCapability` and adapter implementations for New API-family, Sub2API, and AIHubMix. Task 2 migrates Add Token model/group bootstrap and Sub2API quick-create group resolution. Task 3 migrates Key Management page inventory and deletion. Task 4 migrates group coverage and invalid-token repair. Task 5 migrates secondary token inventory surfaces. Task 6 covers validation, telemetry, settings search, E2E, and scope audit.
- Scope control: The plan does not touch redemption, managed-site CRUD, account completion internals, pricing assembly, new site types, locale files, telemetry schema, settings search, or Playwright tests.
- Type consistency: The plan consistently uses `KeyManagementCapability.fetchTokens(request, options)`, `createToken(request, tokenData)`, `resolveTokenKey({ request, token })`, `deleteToken({ request, tokenId })`, `fetchUserGroups(request)`, and `fetchAvailableModels(request)`.
- Compatibility: `createDisplayAccountApiContext(...)` remains the display-account request source, so Sub2API auth-session decoration is preserved for account-scoped reads. Stored-account create request behavior remains owned by existing post-save/default-token helpers and is not changed in this slice.
