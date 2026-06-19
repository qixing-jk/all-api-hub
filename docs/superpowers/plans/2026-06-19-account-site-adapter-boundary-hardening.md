# Account Site Adapter Boundary Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the account-site adapter boundary so account-mainline token flows use `SiteAdapter.keyManagement` and lint blocks new legacy `apiService` dependencies.

**Architecture:** Deepen the existing `KeyManagementCapability` Interface with `updateToken`, migrate the remaining account-mainline create/edit token paths to that Interface, then remove the transitional `service` escape hatch from `createDisplayAccountApiContext`. Keep legacy `getApiService(...)` usage only in backend/adapters and explicitly named non-account-mainline exception zones.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, ESLint flat config, pnpm, existing `SiteAdapter` and account workflow helpers.

**Spec:** `docs/superpowers/specs/2026-06-19-account-site-adapter-boundary-hardening-design.md`

---

## File Structure

Modify:

- `src/services/apiAdapters/contracts/keyManagement.ts`
  - Add `UpdateTokenRequest` and `KeyManagementCapability.updateToken(...)`.
- `src/services/apiAdapters/newApi/keyManagement.ts`
  - Delegate New API-family token updates through `getApiService(siteType).updateApiToken(...)`.
- `src/services/apiAdapters/sub2api/keyManagement.ts`
  - Delegate token updates through the existing Sub2API backend helper.
- `src/services/apiAdapters/aihubmix/keyManagement.ts`
  - Delegate token updates through the existing AIHubMix backend helper.
- `tests/services/apiAdapters/keyManagement.test.ts`
  - Make `updateToken(...)` part of the adapter contract test surface.
- `src/features/KeyManagement/components/AddTokenDialog/index.tsx`
  - Route edit-mode submit through `requireDisplayAccountKeyManagement(...).updateToken(...)`.
- `tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx`
  - Split adapter update mocks from legacy service update mocks and prove edit mode uses the adapter.
- `src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts`
  - Route default-key creation through `requireDisplayAccountKeyManagement(...).createToken(...)`.
- `tests/entrypoints/options/pages/ModelList/ModelKeyDialog.test.tsx`
  - Split adapter create mocks from legacy service create mocks and prove default create uses the adapter.
- `tests/entrypoints/options/pages/ModelList/ModelKeyDialog.sub2api.test.tsx`
  - Keep Sub2API default create coverage on the adapter path.
- `src/services/accounts/utils/apiServiceRequest.ts`
  - Remove `getApiService` import and the returned `service` property.
- `tests/services/accounts/apiServiceRequest.test.ts`
  - Assert the display-account context returns only adapter-backed fields and the request.
- `eslint.config.js`
  - Add account-mainline import guard for the root `apiService` facade. Keep the existing backend-specific `apiService` guard instead of duplicating it.

Do not modify:

- `src/services/managedSites/**`
- `src/services/models/modelSync/**`
- `src/services/redemption/**`
- `src/services/apiCredentialProfiles/**`
- Account Dialog UI policy, locales, settings search, telemetry schema, or Playwright E2E tests.

---

## Implementation Notes

Preserve behavior while changing the Seam:

- Add Token edit mode should keep the existing success toast, failure toast fallback, analytics success/failure completion, `onSuccess` behavior, and close timing.
- Model Key default creation should keep group validation, `generateDefaultTokenRequest()` payload generation, retry-after-create inventory refresh, one-time-key UI behavior, and analytics completion.
- `createDisplayAccountApiContext(...)` should continue to decorate Sub2API display-account requests with `accountSub2ApiAuthSession`.
- Imports from `~/services/apiService/common/type`, `~/services/apiService/common/apiKey`, and `~/services/apiService/common/errors` stay allowed in this slice.

Intermediate commits should keep the repository type-checkable whenever practical. The task order below avoids removing `service` from the shared helper until the two product callers stop using it.

Telemetry decision: none. This is an internal refactor with no new product event.

Settings search decision: none. No settings UI, target ids, anchors, or search metadata change.

E2E decision: no new Playwright E2E. The risk is adapter routing, helper shape, TypeScript, and lint enforcement; Vitest plus ESLint is the correct layer.

---

### Task 1: Add `updateToken` To The Key Management Adapter Contract

**Files:**

- Modify `tests/services/apiAdapters/keyManagement.test.ts`
- Modify `src/services/apiAdapters/contracts/keyManagement.ts`
- Modify `src/services/apiAdapters/newApi/keyManagement.ts`
- Modify `src/services/apiAdapters/sub2api/keyManagement.ts`
- Modify `src/services/apiAdapters/aihubmix/keyManagement.ts`

- [ ] **Step 1: Write failing adapter contract tests**

In `tests/services/apiAdapters/keyManagement.test.ts`, extend the hoisted mocks:

```ts
const {
  mockAihubmixCreateApiToken,
  mockAihubmixDeleteApiToken,
  mockAihubmixFetchAccountAvailableModels,
  mockAihubmixFetchAccountTokens,
  mockAihubmixFetchUserGroups,
  mockAihubmixResolveApiTokenKey,
  mockAihubmixUpdateApiToken,
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
  mockSub2ApiUpdateApiToken,
  mockUpdateApiToken,
} = vi.hoisted(() => ({
  mockAihubmixCreateApiToken: vi.fn(),
  mockAihubmixDeleteApiToken: vi.fn(),
  mockAihubmixFetchAccountAvailableModels: vi.fn(),
  mockAihubmixFetchAccountTokens: vi.fn(),
  mockAihubmixFetchUserGroups: vi.fn(),
  mockAihubmixResolveApiTokenKey: vi.fn(),
  mockAihubmixUpdateApiToken: vi.fn(),
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
  mockSub2ApiUpdateApiToken: vi.fn(),
  mockUpdateApiToken: vi.fn(),
}))
```

Update the backend mocks:

```ts
vi.mock("~/services/apiService/sub2api", () => ({
  createApiToken: mockSub2ApiCreateApiToken,
  deleteApiToken: mockSub2ApiDeleteApiToken,
  fetchAccountAvailableModels: mockSub2ApiFetchAccountAvailableModels,
  fetchAccountTokens: mockSub2ApiFetchAccountTokens,
  fetchUserGroups: mockSub2ApiFetchUserGroups,
  resolveApiTokenKey: mockSub2ApiResolveApiTokenKey,
  updateApiToken: mockSub2ApiUpdateApiToken,
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  createApiToken: mockAihubmixCreateApiToken,
  deleteApiToken: mockAihubmixDeleteApiToken,
  fetchAccountAvailableModels: mockAihubmixFetchAccountAvailableModels,
  fetchAccountTokens: mockAihubmixFetchAccountTokens,
  fetchUserGroups: mockAihubmixFetchUserGroups,
  resolveApiTokenKey: mockAihubmixResolveApiTokenKey,
  updateApiToken: mockAihubmixUpdateApiToken,
}))
```

In `beforeEach`, return `updateApiToken` from the New API-family service mock:

```ts
mockGetApiService.mockReturnValue({
  createApiToken: mockCreateApiToken,
  deleteApiToken: mockDeleteApiToken,
  fetchAccountAvailableModels: mockFetchAccountAvailableModels,
  fetchAccountTokens: mockFetchAccountTokens,
  fetchUserGroups: mockFetchUserGroups,
  resolveApiTokenKey: mockResolveApiTokenKey,
  updateApiToken: mockUpdateApiToken,
})
```

Inside `delegates New API-family key operations through the site-specific apiService`, add the update assertion between create and resolve:

```ts
mockUpdateApiToken.mockResolvedValueOnce(true)

await expect(
  keyManagement.updateToken({
    request,
    tokenId: token.id,
    tokenData,
  }),
).resolves.toBe(true)

expect(mockGetApiService.mock.calls).toEqual([
  [SITE_TYPES.ONE_HUB],
  [SITE_TYPES.ONE_HUB],
  [SITE_TYPES.ONE_HUB],
  [SITE_TYPES.ONE_HUB],
  [SITE_TYPES.ONE_HUB],
  [SITE_TYPES.ONE_HUB],
  [SITE_TYPES.ONE_HUB],
])
expect(mockUpdateApiToken).toHaveBeenCalledWith(request, token.id, tokenData)
```

Inside `delegates Sub2API key operations to backend key helpers`, add:

```ts
mockSub2ApiUpdateApiToken.mockResolvedValueOnce(true)

await expect(
  sub2ApiKeyManagement.updateToken({
    request,
    tokenId: token.id,
    tokenData,
  }),
).resolves.toBe(true)

expect(mockSub2ApiUpdateApiToken).toHaveBeenCalledWith(
  request,
  token.id,
  tokenData,
)
```

Inside `delegates AIHubMix key operations while preserving fetch option behavior`, add:

```ts
mockAihubmixUpdateApiToken.mockResolvedValueOnce(true)

await expect(
  aihubmixKeyManagement.updateToken({
    request,
    tokenId: token.id,
    tokenData,
  }),
).resolves.toBe(true)

expect(mockAihubmixUpdateApiToken).toHaveBeenCalledWith(
  request,
  token.id,
  tokenData,
)
```

- [ ] **Step 2: Run the adapter test and confirm it fails**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/keyManagement.test.ts
```

Expected result: FAIL because `updateToken` is not implemented on the adapter objects.

- [ ] **Step 3: Add the contract method**

In `src/services/apiAdapters/contracts/keyManagement.ts`, add this type after `DeleteTokenRequest`:

```ts
export type UpdateTokenRequest = {
  request: ApiServiceRequest
  tokenId: number
  tokenData: CreateTokenRequest
}
```

Add `updateToken(...)` after `createToken(...)` in `KeyManagementCapability`:

```ts
  updateToken(request: UpdateTokenRequest): Promise<boolean | void>
```

- [ ] **Step 4: Implement `updateToken` in adapters**

In `src/services/apiAdapters/newApi/keyManagement.ts`, add:

```ts
    updateToken: ({ request, tokenId, tokenData }) =>
      getApiService(siteType).updateApiToken(request, tokenId, tokenData),
```

In `src/services/apiAdapters/sub2api/keyManagement.ts`, add `updateApiToken` to the import:

```ts
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchUserGroups,
  resolveApiTokenKey,
  updateApiToken,
} from "~/services/apiService/sub2api"
```

Then add:

```ts
  updateToken: ({ request, tokenId, tokenData }) =>
    updateApiToken(request, tokenId, tokenData),
```

In `src/services/apiAdapters/aihubmix/keyManagement.ts`, add `updateApiToken` to the import:

```ts
import {
  createApiToken,
  deleteApiToken,
  fetchAccountAvailableModels,
  fetchAccountTokens,
  fetchUserGroups,
  resolveApiTokenKey,
  updateApiToken,
} from "~/services/apiService/aihubmix"
```

Then add:

```ts
  updateToken: ({ request, tokenId, tokenData }) =>
    updateApiToken(request, tokenId, tokenData),
```

- [ ] **Step 5: Run the adapter test and confirm it passes**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/keyManagement.test.ts
```

Expected result: PASS.

- [ ] **Step 6: Commit the adapter contract**

Run:

```powershell
git add src/services/apiAdapters/contracts/keyManagement.ts src/services/apiAdapters/newApi/keyManagement.ts src/services/apiAdapters/sub2api/keyManagement.ts src/services/apiAdapters/aihubmix/keyManagement.ts tests/services/apiAdapters/keyManagement.test.ts
git commit -m "refactor(api-adapters): add token update capability"
```

Expected result: commit succeeds and the hook passes staged validation for the touched files.

---

### Task 2: Migrate Add Token Edit Mode To `keyManagement.updateToken`

**Files:**

- Modify `tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx`
- Modify `src/features/KeyManagement/components/AddTokenDialog/index.tsx`

- [ ] **Step 1: Split edit-mode adapter and legacy service mocks**

In `tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx`, add a new hoisted mock:

```ts
const {
  createApiTokenMock,
  updateApiTokenMock,
  updateTokenMock,
  fetchAccountAvailableModelsMock,
  fetchUserGroupsMock,
  startProductAnalyticsActionMock,
  toastSuccessMock,
  toastErrorMock,
  trackerCompleteMock,
  createApiCredentialProfileMock,
} = vi.hoisted(() => ({
  createApiTokenMock: vi.fn(),
  updateApiTokenMock: vi.fn(),
  updateTokenMock: vi.fn(),
  fetchAccountAvailableModelsMock: vi.fn(),
  fetchUserGroupsMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  trackerCompleteMock: vi.fn(),
  createApiCredentialProfileMock: vi.fn(),
}))
```

Keep the legacy service mock as a tripwire:

```ts
vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    updateApiToken: (...args: any[]) => updateApiTokenMock(...args),
    fetchAccountAvailableModels: (...args: any[]) =>
      fetchAccountAvailableModelsMock(...args),
    fetchUserGroups: (...args: any[]) => fetchUserGroupsMock(...args),
  }),
}))
```

Add `updateToken` to the adapter mock:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: () => ({
    keyManagement: {
      fetchTokens: vi.fn(async () => []),
      createToken: (...args: any[]) => createApiTokenMock(...args),
      updateToken: (...args: any[]) => updateTokenMock(...args),
      resolveTokenKey: async ({ token }: { token: { key: string } }) =>
        token.key,
      deleteToken: vi.fn(),
      fetchUserGroups: (...args: any[]) => fetchUserGroupsMock(...args),
      fetchAvailableModels: (...args: any[]) =>
        fetchAccountAvailableModelsMock(...args),
    },
  }),
}))
```

In `beforeEach`, reset both update mocks:

```ts
updateApiTokenMock.mockReset()
updateTokenMock.mockReset()
```

- [ ] **Step 2: Make edit-mode tests expect adapter update**

In every edit-mode test in `AddTokenDialog.prefill.test.tsx`, replace setup calls like:

```ts
updateApiTokenMock.mockResolvedValueOnce(true)
```

with:

```ts
updateTokenMock.mockResolvedValueOnce(true)
```

Replace failure setup:

```ts
updateApiTokenMock.mockRejectedValueOnce(new Error("   "))
```

with:

```ts
updateTokenMock.mockRejectedValueOnce(new Error("   "))
```

In `does not apply prefill when editing a token`, replace the update assertion with:

```ts
await waitFor(() => {
  expect(updateTokenMock).toHaveBeenCalledTimes(1)
})

expect(updateTokenMock.mock.calls[0]?.[0]).toMatchObject({
  tokenId: 123,
  tokenData: {
    name: "Existing key",
    model_limits_enabled: false,
    model_limits: "",
  },
})
expect(updateApiTokenMock).not.toHaveBeenCalled()
```

For the other edit-mode success/failure tests, add this after the submit settles:

```ts
expect(updateApiTokenMock).not.toHaveBeenCalled()
```

- [ ] **Step 3: Run the Add Token dialog test and confirm it fails**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx
```

Expected result: FAIL because edit mode still calls `service.updateApiToken(...)`, so `updateTokenMock` is not called and `updateApiTokenMock` is called.

- [ ] **Step 4: Migrate edit-mode implementation**

In `src/features/KeyManagement/components/AddTokenDialog/index.tsx`, replace:

```ts
      const { keyManagement, request, service } =
        createDisplayAccountApiContext(currentAccount)

      if (isEditMode && editingToken) {
        await service.updateApiToken(request, editingToken.id, tokenData)
        toast.success(t("dialog.updateSuccess"))
      } else {
```

with:

```ts
      const { keyManagement, request } =
        createDisplayAccountApiContext(currentAccount)

      if (isEditMode && editingToken) {
        await requireDisplayAccountKeyManagement(
          currentAccount,
          keyManagement,
        ).updateToken({
          request,
          tokenId: editingToken.id,
          tokenData,
        })
        toast.success(t("dialog.updateSuccess"))
      } else {
```

- [ ] **Step 5: Run the Add Token dialog test and confirm it passes**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx
```

Expected result: PASS.

- [ ] **Step 6: Commit Add Token migration**

Run:

```powershell
git add src/features/KeyManagement/components/AddTokenDialog/index.tsx tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx
git commit -m "refactor(key-management): update tokens through adapters"
```

Expected result: commit succeeds and the hook passes staged validation for the touched files.

---

### Task 3: Migrate Model Key Default Creation To `keyManagement.createToken`

**Files:**

- Modify `tests/entrypoints/options/pages/ModelList/ModelKeyDialog.test.tsx`
- Modify `tests/entrypoints/options/pages/ModelList/ModelKeyDialog.sub2api.test.tsx`
- Modify `src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts`

- [ ] **Step 1: Split adapter and legacy create mocks in `ModelKeyDialog.test.tsx`**

In `tests/entrypoints/options/pages/ModelList/ModelKeyDialog.test.tsx`, replace the single create mock with two mocks:

```ts
const {
  fetchAccountTokensMock,
  adapterCreateTokenMock,
  legacyCreateApiTokenMock,
  toastSuccessMock,
  toastErrorMock,
  resolveDisplayAccountTokenForSecretMock,
  openKeysPageMock,
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  trackProductAnalyticsActionStartedMock,
  createApiCredentialProfileMock,
} = vi.hoisted(() => ({
  fetchAccountTokensMock: vi.fn(),
  adapterCreateTokenMock: vi.fn(),
  legacyCreateApiTokenMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  resolveDisplayAccountTokenForSecretMock: vi.fn(),
  openKeysPageMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
  createApiCredentialProfileMock: vi.fn(),
}))
```

Keep the legacy service mock as a tripwire:

```ts
vi.mock("~/services/apiService", () => ({
  getApiService: () => ({
    createApiToken: (...args: any[]) => legacyCreateApiTokenMock(...args),
    fetchAccountAvailableModels: vi.fn(async () => []),
    fetchUserGroups: vi.fn(async () => ({})),
    updateApiToken: vi.fn(async () => true),
  }),
}))
```

Route the adapter mock to `adapterCreateTokenMock`:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: () => ({
    keyManagement: {
      fetchTokens: (...args: any[]) => fetchAccountTokensMock(...args),
      createToken: (...args: any[]) => adapterCreateTokenMock(...args),
      resolveTokenKey: async ({ token }: { token: { key: string } }) =>
        token.key,
    },
  }),
}))
```

In `beforeEach`, reset both mocks:

```ts
adapterCreateTokenMock.mockReset()
legacyCreateApiTokenMock.mockReset()
```

Replace each default-create setup in this file by changing the receiver only.
Examples:

```ts
adapterCreateTokenMock.mockResolvedValueOnce({
  ...TOKEN,
  id: 8,
  key: "sk-created-full-secret",
  name: "model-key",
})
adapterCreateTokenMock.mockRejectedValueOnce(new Error("create failed"))
adapterCreateTokenMock.mockResolvedValueOnce(false)
adapterCreateTokenMock.mockResolvedValueOnce(true)
```

For assertions that inspect the generated request, keep the existing matcher
body and change only the mock receiver:

```ts
expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
expect(adapterCreateTokenMock.mock.calls[0]?.[1]).toMatchObject({
  group: "default",
  model_limits_enabled: true,
  model_limits: "gpt-4",
})
expect(legacyCreateApiTokenMock).not.toHaveBeenCalled()
```

For tests that only assert creation happened, use:

```ts
expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
expect(legacyCreateApiTokenMock).not.toHaveBeenCalled()
```

- [ ] **Step 2: Split adapter and legacy create mocks in the Sub2API test**

In `tests/entrypoints/options/pages/ModelList/ModelKeyDialog.sub2api.test.tsx`, use the same split:

```ts
const {
  fetchAccountTokensMock,
  adapterCreateTokenMock,
  legacyCreateApiTokenMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  fetchAccountTokensMock: vi.fn(),
  adapterCreateTokenMock: vi.fn(),
  legacyCreateApiTokenMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))
```

Use `legacyCreateApiTokenMock` in the `~/services/apiService` mock and `adapterCreateTokenMock` in the `~/services/apiAdapters/registry` mock.

Replace create setups and assertions in both Sub2API tests:

```ts
adapterCreateTokenMock.mockResolvedValueOnce(true)

await waitFor(() => {
  expect(adapterCreateTokenMock).toHaveBeenCalledTimes(1)
  expect(fetchAccountTokensMock).toHaveBeenCalledTimes(2)
})
expect(legacyCreateApiTokenMock).not.toHaveBeenCalled()
```

- [ ] **Step 3: Run Model Key dialog tests and confirm they fail**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/ModelList/ModelKeyDialog.test.tsx tests/entrypoints/options/pages/ModelList/ModelKeyDialog.sub2api.test.tsx
```

Expected result: FAIL because `createDefaultKey(...)` still calls `service.createApiToken(...)`, so adapter create mocks are not called and legacy create mocks are called.

- [ ] **Step 4: Migrate Model Key default creation**

In `src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts`, add `requireDisplayAccountKeyManagement` to the existing import:

```ts
import {
  canManageDisplayAccountTokens,
  createDisplayAccountApiContext,
  fetchDisplayAccountTokens,
  InvalidTokenPayloadError,
  requireDisplayAccountKeyManagement,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
```

Replace:

```ts
        const { service, request } = createDisplayAccountApiContext(account)
        const tokenRequest = generateDefaultTokenRequest()
        tokenRequest.group = normalizedGroup
        const created = await service.createApiToken(request, tokenRequest)
```

with:

```ts
        const { keyManagement, request } =
          createDisplayAccountApiContext(account)
        const tokenRequest = generateDefaultTokenRequest()
        tokenRequest.group = normalizedGroup
        const created = await requireDisplayAccountKeyManagement(
          account,
          keyManagement,
        ).createToken(request, tokenRequest)
```

- [ ] **Step 5: Run Model Key dialog tests and confirm they pass**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/pages/ModelList/ModelKeyDialog.test.tsx tests/entrypoints/options/pages/ModelList/ModelKeyDialog.sub2api.test.tsx
```

Expected result: PASS.

- [ ] **Step 6: Commit Model Key migration**

Run:

```powershell
git add src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts tests/entrypoints/options/pages/ModelList/ModelKeyDialog.test.tsx tests/entrypoints/options/pages/ModelList/ModelKeyDialog.sub2api.test.tsx
git commit -m "refactor(model-list): create default keys through adapters"
```

Expected result: commit succeeds and the hook passes staged validation for the touched files.

---

### Task 4: Remove `service` From Display Account Context

**Files:**

- Modify `tests/services/accounts/apiServiceRequest.test.ts`
- Modify `src/services/accounts/utils/apiServiceRequest.ts`

- [ ] **Step 1: Update the context helper test to reject `service`**

In `tests/services/accounts/apiServiceRequest.test.ts`, remove:

```ts
import { getApiService } from "~/services/apiService"
```

Remove the `vi.mock("~/services/apiService", ...)` block.

In the `beforeEach`, remove the `service` local variable and these calls:

```ts
vi.mocked(getApiService).mockReset()
vi.mocked(getApiService).mockReturnValue(service as any)
```

Make the key-management mock include all required methods:

```ts
let updateToken: ReturnType<typeof vi.fn>
let deleteToken: ReturnType<typeof vi.fn>
let fetchUserGroups: ReturnType<typeof vi.fn>
let fetchAvailableModels: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchTokens = vi.fn()
  createToken = vi.fn()
  updateToken = vi.fn()
  resolveTokenKey = vi.fn()
  deleteToken = vi.fn()
  fetchUserGroups = vi.fn()
  fetchAvailableModels = vi.fn()
  keyManagement = {
    fetchTokens,
    createToken,
    updateToken,
    resolveTokenKey,
    deleteToken,
    fetchUserGroups,
    fetchAvailableModels,
  }
  adapter = { siteType: "new-api", keyManagement }

  vi.mocked(getSiteAdapter).mockReset()
  vi.mocked(getSiteAdapter).mockReturnValue(adapter as any)
})
```

Replace the context assertion in `returns the token array when the API payload is valid` with:

```ts
expect(createDisplayAccountApiContext(ACCOUNT as any)).toEqual({
  adapter,
  keyManagement,
  request: expect.objectContaining(REQUEST),
})
expect(createDisplayAccountApiContext(ACCOUNT as any)).not.toHaveProperty(
  "service",
)
```

- [ ] **Step 2: Run the helper test and confirm it fails**

Run:

```powershell
pnpm vitest run tests/services/accounts/apiServiceRequest.test.ts
```

Expected result: FAIL because `createDisplayAccountApiContext(...)` still returns `service`.

- [ ] **Step 3: Remove the service escape hatch**

In `src/services/accounts/utils/apiServiceRequest.ts`, remove:

```ts
import { getApiService } from "~/services/apiService"
```

Replace the return value in `createDisplayAccountApiContext(...)`:

```ts
  return {
    service: getApiService(account.siteType),
    adapter,
    keyManagement: adapter.keyManagement,
    request: withDisplayAccountAuthSession(
      account,
      buildApiRequestFromDisplayAccount(account),
    ),
  }
```

with:

```ts
  return {
    adapter,
    keyManagement: adapter.keyManagement,
    request: withDisplayAccountAuthSession(
      account,
      buildApiRequestFromDisplayAccount(account),
    ),
  }
```

- [ ] **Step 4: Run the helper test and compile**

Run:

```powershell
pnpm vitest run tests/services/accounts/apiServiceRequest.test.ts
pnpm compile
```

Expected result: both commands PASS. If `pnpm compile` finds another product caller destructuring `service`, migrate that caller only if it is an account-mainline token lifecycle path; otherwise stop and classify it against the spec non-goals.

- [ ] **Step 5: Run the service escape-hatch cleanup check**

Run:

```powershell
rg "createDisplayAccountApiContext\(.*service|service.*createDisplayAccountApiContext" src/features src/components src/services/accounts
```

Expected result: no output.

- [ ] **Step 6: Commit helper cleanup**

Run:

```powershell
git add src/services/accounts/utils/apiServiceRequest.ts tests/services/accounts/apiServiceRequest.test.ts
git commit -m "refactor(accounts): remove display account service escape hatch"
```

Expected result: commit succeeds and the hook passes staged validation for the touched files.

---

### Task 5: Add Root Facade ESLint Guardrail

**Files:**

- Modify `eslint.config.js`

- [ ] **Step 1: Add the root facade import pattern**

In `eslint.config.js`, add this constant after `apiServiceBackendImplementationImportPattern`:

```js
const accountSiteMainlineApiServiceFacadeImportPattern = {
  regex: "^(?:~/services/apiService|(?:\\.\\./){1,6}(?:services/)?apiService)$",
  message:
    "Account-site product flows must use ~/services/apiAdapters or account workflow helpers instead of the legacy apiService facade.",
}
```

- [ ] **Step 2: Add the account-mainline config block**

Add this block after the existing backend-specific apiService guard and before the AI API protocol guard:

```js
  // Guardrails: account-mainline product flows must not import the legacy apiService facade.
  {
    files: [
      "src/features/AccountManagement/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/features/KeyManagement/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/features/ModelList/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/components/dialogs/VerifyApiDialog/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/components/dialogs/VerifyCliSupportDialog/**/*.{js,cjs,mjs,jsx,ts,tsx}",
      "src/components/KiloCodeExportDialog.{js,cjs,mjs,jsx,ts,tsx}",
      "src/services/accounts/**/*.{js,cjs,mjs,jsx,ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            accountSiteMainlineApiServiceFacadeImportPattern,
          ],
        },
      ],
    },
  },
```

Do not duplicate `apiServiceBackendImplementationImportPattern` in this block.
The existing backend-specific guard already applies to these account-mainline
paths because they are not in its `ignores`. This task only closes the missing
root facade path. Do not include `~/services/apiService/common/**` in the
restricted pattern. Shared DTOs, token key normalizers, and common error types
remain allowed in this slice.

- [ ] **Step 3: Run ESLint for the guarded surfaces**

Run:

```powershell
pnpm exec eslint eslint.config.js src/services/accounts src/features/KeyManagement src/features/ModelList src/features/AccountManagement src/components/dialogs/VerifyApiDialog src/components/dialogs/VerifyCliSupportDialog src/components/KiloCodeExportDialog.tsx
```

Expected result: PASS. If ESLint reports a root `~/services/apiService`
account-mainline import, migrate that import to an adapter/workflow helper if it
is token lifecycle behavior. If it belongs to a spec non-goal, narrow the
guarded file glob and document the exception in the config comment. If the
existing backend-specific guard reports an implementation import such as
`~/services/apiService/sub2api`, route it through an adapter; do not add a
second backend-specific pattern to this new block.

- [ ] **Step 4: Run migration completeness checks**

Run:

```powershell
rg "getApiService\(" src/features src/components src/services/accounts
rg "service\.(createApiToken|updateApiToken|deleteApiToken|fetchAccountTokens|fetchUserGroups|fetchAccountAvailableModels)" src/features src/components src/services/accounts
rg "from \"~/services/apiService\"|from \"~/services/apiService/(aihubmix|anyrouter|axonHub|claudeCodeHub|doneHub|octopus|oneHub|sub2api|veloera|wong)" src/features/AccountManagement src/features/KeyManagement src/features/ModelList src/components src/services/accounts
```

Expected result: no account-mainline hits. Hits under managed-site/modelSync/redemption are outside these command targets or are explicitly non-goals.

- [ ] **Step 5: Commit lint guard**

Run:

```powershell
git add eslint.config.js
git commit -m "chore(eslint): guard account site service facade"
```

Expected result: commit succeeds and the hook passes staged validation for `eslint.config.js`.

---

### Task 6: Final Validation And Scope Audit

**Files:**

- Verify all task-scoped files from Tasks 1-5
- No new implementation files expected

- [ ] **Step 1: Run focused test suite**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/keyManagement.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx tests/entrypoints/options/pages/ModelList/ModelKeyDialog.test.tsx tests/entrypoints/options/pages/ModelList/ModelKeyDialog.sub2api.test.tsx
```

Expected result: PASS.

- [ ] **Step 2: Run boundary validation**

Run:

```powershell
pnpm exec eslint eslint.config.js src/services/accounts src/features/KeyManagement src/features/ModelList src/features/AccountManagement src/components/dialogs/VerifyApiDialog src/components/dialogs/VerifyCliSupportDialog src/components/KiloCodeExportDialog.tsx
```

Expected result: PASS.

- [ ] **Step 3: Run TypeScript validation**

Run:

```powershell
pnpm compile
```

Expected result: PASS.

- [ ] **Step 4: Run cleanup checks**

Run:

```powershell
rg "getApiService\(" src/features src/components src/services/accounts
rg "service\.(createApiToken|updateApiToken|deleteApiToken|fetchAccountTokens|fetchUserGroups|fetchAccountAvailableModels)" src/features src/components src/services/accounts
rg "createDisplayAccountApiContext\(.*service|service.*createDisplayAccountApiContext" src/features src/components src/services/accounts
rg "from \"~/services/apiService\"|from \"~/services/apiService/(aihubmix|anyrouter|axonHub|claudeCodeHub|doneHub|octopus|oneHub|sub2api|veloera|wong)" src/features/AccountManagement src/features/KeyManagement src/features/ModelList src/components src/services/accounts
```

Expected result: no output for all four commands.

- [ ] **Step 5: Inspect final diff**

Run:

```powershell
git status --porcelain=v1 -b
git diff --stat HEAD
git diff HEAD -- src/services/apiAdapters/contracts/keyManagement.ts src/services/apiAdapters/newApi/keyManagement.ts src/services/apiAdapters/sub2api/keyManagement.ts src/services/apiAdapters/aihubmix/keyManagement.ts src/services/accounts/utils/apiServiceRequest.ts src/features/KeyManagement/components/AddTokenDialog/index.tsx src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts eslint.config.js
```

Expected result: only task-scoped files are modified. Existing unrelated untracked files may remain and must not be staged.

- [ ] **Step 6: Run staged validation**

If there are task-scoped changes left after the last commit, stage only those files and run:

```powershell
pnpm run validate:staged
```

Expected result: PASS. If lint-staged modifies files, inspect `git diff` and commit only task-scoped changes.

- [ ] **Step 7: Run pre-push validation before PR or push**

Because this slice changes ESLint config and shared TypeScript contracts, run:

```powershell
pnpm run validate:push
```

Expected result: PASS. If `knip` reports unused exports after the interface migration, remove only the stale exports proven unused by the report and rerun `pnpm run validate:push`.

- [ ] **Step 8: Final commit if validation changed files**

If Task 6 produced formatting or export-hygiene fixes, commit them:

```powershell
git add eslint.config.js src/services/apiAdapters/contracts/keyManagement.ts src/services/apiAdapters/newApi/keyManagement.ts src/services/apiAdapters/sub2api/keyManagement.ts src/services/apiAdapters/aihubmix/keyManagement.ts src/services/accounts/utils/apiServiceRequest.ts src/features/KeyManagement/components/AddTokenDialog/index.tsx src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts tests/services/apiAdapters/keyManagement.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx tests/entrypoints/options/pages/ModelList/ModelKeyDialog.test.tsx tests/entrypoints/options/pages/ModelList/ModelKeyDialog.sub2api.test.tsx
git commit -m "chore: finish account site adapter boundary validation"
```

Expected result: commit succeeds. If no files changed, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - `KeyManagementCapability.updateToken` is covered by Task 1.
  - Add Token edit-mode adapter routing is covered by Task 2.
  - Model Key default create adapter routing is covered by Task 3.
  - Removing `createDisplayAccountApiContext(...).service` is covered by Task 4.
  - ESLint root facade guardrail is covered by Task 5; backend-specific imports remain covered by the existing guard.
  - Cleanup checks, compile, staged validation, and pre-push validation are covered by Task 6.
- Placeholder scan:
  - No unresolved placeholders, deferred implementation notes, or "fill in later" steps.
- Type consistency:
  - The plan uses `UpdateTokenRequest`, `updateToken`, `tokenId`, and `tokenData` consistently across tests, contracts, adapters, and product callers.
