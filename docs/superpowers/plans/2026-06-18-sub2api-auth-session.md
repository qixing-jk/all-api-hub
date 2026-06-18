# Sub2API Auth Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-18-sub2api-auth-session-design.md`

**Goal:** Move Sub2API stored-auth hydration and rotated-auth persistence from generic `ApiServiceRequest.accountAuthStore` to a Sub2API-specific auth session port.

**Architecture:** Add a Sub2API-owned auth session contract and an account-layer storage adapter. Sub2API protocol code keeps token refresh, browser-session re-sync, retry, and error normalization; account/application code supplies the session only for Sub2API account-scoped requests. Generic `ApiTransportRequest` returns to a transport-only DTO.

**Tech Stack:** TypeScript, WXT extension services, existing `apiService/sub2api` helpers, existing `apiAdapters`, Vitest, `pnpm run validate:staged`.

---

## File Structure

- Create `src/services/apiService/sub2api/authSession.ts`
  - Owns `Sub2ApiAuthSession`, auth snapshot/update types, and the session-aware request extension type.
  - Does not import `accountStorage`.
- Create `src/services/accounts/sub2apiAuthSession.ts`
  - Account-layer Adapter from `accountStorage` to `Sub2ApiAuthSession`.
  - Preserves `AccountUpdateUserTimestampMode.Preserve` for auth-only writes.
- Modify `src/services/apiService/sub2api/index.ts`
  - Replaces `request.accountAuthStore` with `request.sub2apiAuthSession`.
  - Keeps protocol behavior and public operation signatures otherwise stable.
- Modify `src/services/accounts/utils/apiServiceRequest.ts`
  - Removes direct `accountStorage` injection from generic requests.
  - Attaches `accountSub2ApiAuthSession` only to Sub2API display-account contexts.
- Modify `src/services/apiTransport/type.ts`
  - Removes `accountAuthStore` from `ApiTransportRequest`.
- Create `tests/services/accounts/sub2apiAuthSession.test.ts`
  - Covers stored auth snapshot reads and timestamp-preserving auth writes.
- Modify `tests/services/accounts/apiServiceRequest.test.ts`
  - Verifies non-Sub2API requests stay plain.
  - Verifies Sub2API display-account contexts carry the auth session.
- Modify `tests/services/apiService/sub2api/index.test.ts`
  - Migrates stored-auth hydration and rotated-auth persistence tests to the session port.
- Modify `tests/services/apiService/sub2api/keyManagement.test.ts`
  - Migrates key-management recovery tests to the session port.

---

## Task 1: Add The Auth Session Contract And Account Adapter

**Files:**
- Create: `src/services/apiService/sub2api/authSession.ts`
- Create: `src/services/accounts/sub2apiAuthSession.ts`
- Create: `tests/services/accounts/sub2apiAuthSession.test.ts`

- [ ] **Step 1: Write the failing account-layer session test**

Create `tests/services/accounts/sub2apiAuthSession.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AccountUpdateUserTimestampMode } from "~/services/accounts/accountDefaults"
import { accountSub2ApiAuthSession } from "~/services/accounts/sub2apiAuthSession"

const { getAccountByIdMock, updateAccountMock } = vi.hoisted(() => ({
  getAccountByIdMock: vi.fn(),
  updateAccountMock: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAccountById: (...args: unknown[]) => getAccountByIdMock(...args),
    updateAccount: (...args: unknown[]) => updateAccountMock(...args),
  },
}))

describe("accountSub2ApiAuthSession", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAccountByIdMock.mockResolvedValue(null)
    updateAccountMock.mockResolvedValue(true)
  })

  it("returns a narrow stored auth snapshot for an existing Sub2API account", async () => {
    getAccountByIdMock.mockResolvedValueOnce({
      account_info: {
        id: "9",
        access_token: " stored-jwt ",
      },
      sub2apiAuth: {
        refreshToken: " stored-refresh ",
        tokenExpiresAt: 1_700_000_000_000,
      },
    })

    await expect(
      accountSub2ApiAuthSession.getLatestAuth("account-1"),
    ).resolves.toEqual({
      accessToken: "stored-jwt",
      userId: "9",
      sub2apiAuth: {
        refreshToken: "stored-refresh",
        tokenExpiresAt: 1_700_000_000_000,
      },
    })

    expect(getAccountByIdMock).toHaveBeenCalledWith("account-1")
  })

  it("returns null when the account no longer exists", async () => {
    getAccountByIdMock.mockResolvedValueOnce(null)

    await expect(
      accountSub2ApiAuthSession.getLatestAuth("missing-account"),
    ).resolves.toBeNull()
  })

  it("persists access-token-only re-sync updates while preserving the user timestamp", async () => {
    await expect(
      accountSub2ApiAuthSession.persistAuthUpdate("account-1", {
        accessToken: "resynced-jwt",
      }),
    ).resolves.toBe(true)

    expect(updateAccountMock).toHaveBeenCalledWith(
      "account-1",
      {
        account_info: {
          access_token: "resynced-jwt",
        },
      },
      { userTimestampMode: AccountUpdateUserTimestampMode.Preserve },
    )
  })

  it("persists rotated refresh-token metadata while preserving the user timestamp", async () => {
    await expect(
      accountSub2ApiAuthSession.persistAuthUpdate("account-1", {
        accessToken: "new-jwt",
        refreshToken: "new-refresh",
        tokenExpiresAt: 1_700_000_060_000,
      }),
    ).resolves.toBe(true)

    expect(updateAccountMock).toHaveBeenCalledWith(
      "account-1",
      {
        account_info: {
          access_token: "new-jwt",
        },
        sub2apiAuth: {
          refreshToken: "new-refresh",
          tokenExpiresAt: 1_700_000_060_000,
        },
      },
      { userTimestampMode: AccountUpdateUserTimestampMode.Preserve },
    )
  })
})
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run:

```powershell
pnpm vitest run tests/services/accounts/sub2apiAuthSession.test.ts
```

Expected: FAIL because `src/services/accounts/sub2apiAuthSession.ts` and `src/services/apiService/sub2api/authSession.ts` do not exist yet.

- [ ] **Step 3: Add the Sub2API auth session contract**

Create `src/services/apiService/sub2api/authSession.ts`:

```ts
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { AccountIdentity, Sub2ApiAuthConfig } from "~/types"

export type Sub2ApiStoredAuthSnapshot = {
  accessToken?: string
  userId?: AccountIdentity
  sub2apiAuth?: Sub2ApiAuthConfig
}

export type Sub2ApiPersistAuthUpdate = {
  accessToken: string
  refreshToken?: string
  tokenExpiresAt?: number
}

export type Sub2ApiAuthSession = {
  getLatestAuth(accountId: string): Promise<Sub2ApiStoredAuthSnapshot | null>
  persistAuthUpdate(
    accountId: string,
    update: Sub2ApiPersistAuthUpdate,
  ): Promise<boolean>
}

export type Sub2ApiAuthSessionRequest<
  TRequest extends ApiServiceRequest = ApiServiceRequest,
> = TRequest & {
  sub2apiAuthSession?: Sub2ApiAuthSession
}

export function getSub2ApiAuthSession(
  request: ApiServiceRequest,
): Sub2ApiAuthSession | undefined {
  return (request as Sub2ApiAuthSessionRequest).sub2apiAuthSession
}
```

- [ ] **Step 4: Add the account-layer storage adapter**

Create `src/services/accounts/sub2apiAuthSession.ts`:

```ts
import { AccountUpdateUserTimestampMode } from "~/services/accounts/accountDefaults"
import { accountStorage } from "~/services/accounts/accountStorage"
import type {
  Sub2ApiAuthSession,
  Sub2ApiPersistAuthUpdate,
  Sub2ApiStoredAuthSnapshot,
} from "~/services/apiService/sub2api/authSession"

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const normalizeTokenExpiresAt = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

const buildStoredAuthSnapshot = (account: any): Sub2ApiStoredAuthSnapshot => {
  const accessToken = normalizeString(account.account_info?.access_token)
  const refreshToken = normalizeString(account.sub2apiAuth?.refreshToken)
  const tokenExpiresAt = normalizeTokenExpiresAt(
    account.sub2apiAuth?.tokenExpiresAt,
  )

  return {
    ...(accessToken ? { accessToken } : {}),
    ...(account.account_info?.id !== undefined
      ? { userId: account.account_info.id }
      : {}),
    ...(refreshToken
      ? {
          sub2apiAuth: {
            refreshToken,
            ...(typeof tokenExpiresAt === "number" ? { tokenExpiresAt } : {}),
          },
        }
      : {}),
  }
}

const buildPersistedAuthUpdate = (
  update: Sub2ApiPersistAuthUpdate,
): Record<string, any> => {
  const persisted: Record<string, any> = {
    account_info: {
      access_token: update.accessToken,
    },
  }

  if (update.refreshToken) {
    persisted.sub2apiAuth = {
      refreshToken: update.refreshToken,
      ...(typeof update.tokenExpiresAt === "number" &&
      Number.isFinite(update.tokenExpiresAt)
        ? { tokenExpiresAt: update.tokenExpiresAt }
        : {}),
    }
  }

  return persisted
}

export const accountSub2ApiAuthSession: Sub2ApiAuthSession = {
  async getLatestAuth(accountId) {
    const account = await accountStorage.getAccountById(accountId)
    return account ? buildStoredAuthSnapshot(account) : null
  },
  async persistAuthUpdate(accountId, update) {
    return accountStorage.updateAccount(accountId, buildPersistedAuthUpdate(update), {
      userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
    })
  },
}
```

- [ ] **Step 5: Run the account-layer session test**

Run:

```powershell
pnpm vitest run tests/services/accounts/sub2apiAuthSession.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the auth session contract and account adapter**

Run:

```powershell
git add src/services/apiService/sub2api/authSession.ts src/services/accounts/sub2apiAuthSession.ts tests/services/accounts/sub2apiAuthSession.test.ts
git commit -m "refactor(sub2api): add auth session port"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

## Task 2: Refactor Sub2API Protocol Code To Use The Session Port

**Files:**
- Modify: `src/services/apiService/sub2api/index.ts`
- Modify: `tests/services/apiService/sub2api/index.test.ts`
- Modify: `tests/services/apiService/sub2api/keyManagement.test.ts`

- [ ] **Step 1: Update the key-management test request helper**

In `tests/services/apiService/sub2api/keyManagement.test.ts`, change the hoisted mocks from account storage naming to session naming.

Replace:

```ts
  getAccountByIdMock,
  updateAccountMock,
```

with:

```ts
  getLatestAuthMock,
  persistAuthUpdateMock,
```

Replace the corresponding `vi.fn()` definitions:

```ts
  getLatestAuthMock: vi.fn(),
  persistAuthUpdateMock: vi.fn(),
```

Change `createRequest(...)` from:

```ts
const createRequest = (
  overrides: Partial<ApiServiceRequest> = {},
): ApiServiceRequest => ({
  baseUrl: "https://sub2.example.com",
  accountId: "acc-1",
  accountAuthStore: {
    getAccountById: (...args: any[]) => getAccountByIdMock(...args),
    updateAccount: (...args: any[]) => updateAccountMock(...args),
  },
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "1",
    accessToken: "old-jwt",
  },
  ...overrides,
})
```

to:

```ts
const createRequest = (
  overrides: Partial<ApiServiceRequest> = {},
): ApiServiceRequest => ({
  baseUrl: "https://sub2.example.com",
  accountId: "acc-1",
  sub2apiAuthSession: {
    getLatestAuth: (...args: any[]) => getLatestAuthMock(...args),
    persistAuthUpdate: (...args: any[]) => persistAuthUpdateMock(...args),
  },
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "1",
    accessToken: "old-jwt",
  },
  ...overrides,
} as ApiServiceRequest)
```

In the `beforeEach`, replace:

```ts
getAccountByIdMock.mockReset()
updateAccountMock.mockReset()
getAccountByIdMock.mockResolvedValue(null)
updateAccountMock.mockResolvedValue(true)
```

with:

```ts
getLatestAuthMock.mockReset()
persistAuthUpdateMock.mockReset()
getLatestAuthMock.mockResolvedValue(null)
persistAuthUpdateMock.mockResolvedValue(true)
```

Update stored-auth test data from full account objects to snapshots:

```ts
getLatestAuthMock.mockResolvedValueOnce({
  accessToken: "stored-jwt",
  userId: "9",
  sub2apiAuth: {
    refreshToken: "stored-refresh",
    tokenExpiresAt: now + 60_000,
  },
})
```

Update persistence assertions from `updateAccountMock` to:

```ts
expect(persistAuthUpdateMock).toHaveBeenCalledWith("acc-1", {
  accessToken: "new-jwt",
  refreshToken: "new-refresh",
  tokenExpiresAt: now + 3600 * 1000,
})
```

- [ ] **Step 2: Update the Sub2API account refresh tests**

In `tests/services/apiService/sub2api/index.test.ts`, replace the storage mocks:

```ts
mockGetAccountById
mockUpdateAccount
```

with session mocks:

```ts
mockGetLatestAuth
mockPersistAuthUpdate
```

For the test `"hydrates auth from stored account state and persists refreshed credentials"`, replace the stored account setup with:

```ts
mockGetLatestAuth.mockResolvedValueOnce({
  accessToken: "stored-jwt",
  userId: "9",
  sub2apiAuth: {
    refreshToken: "stored-refresh",
    tokenExpiresAt: now + 60_000,
  },
})
```

Replace the request override:

```ts
accountAuthStore: {
  getAccountById: (...args: any[]) => mockGetAccountById(...args),
  updateAccount: (...args: any[]) => mockUpdateAccount(...args),
},
```

with:

```ts
sub2apiAuthSession: {
  getLatestAuth: (...args: any[]) => mockGetLatestAuth(...args),
  persistAuthUpdate: (...args: any[]) => mockPersistAuthUpdate(...args),
},
```

Replace:

```ts
expect(mockGetAccountById).toHaveBeenCalledWith("account-1")
expect(mockUpdateAccount).toHaveBeenCalledWith(
  "account-1",
  {
    account_info: {
      access_token: "new-jwt",
    },
    sub2apiAuth: {
      refreshToken: "new-refresh",
      tokenExpiresAt: now + 3600 * 1000,
    },
  },
  { userTimestampMode: AccountUpdateUserTimestampMode.Preserve },
)
```

with:

```ts
expect(mockGetLatestAuth).toHaveBeenCalledWith("account-1")
expect(mockPersistAuthUpdate).toHaveBeenCalledWith("account-1", {
  accessToken: "new-jwt",
  refreshToken: "new-refresh",
  tokenExpiresAt: now + 3600 * 1000,
})
```

For the test `"reuses newer stored auth instead of refreshing again when account storage already rotated the JWT"`, replace sequential account responses with sequential snapshots:

```ts
mockGetLatestAuth
  .mockResolvedValueOnce({
    accessToken: "old-jwt",
    userId: "7",
    sub2apiAuth: {
      refreshToken: "old-refresh",
      tokenExpiresAt: now + 3600 * 1000,
    },
  })
  .mockResolvedValueOnce({
    accessToken: "external-jwt",
    userId: "7",
    sub2apiAuth: {
      refreshToken: "external-refresh",
      tokenExpiresAt: now + 3600 * 1000,
    },
  })
```

Replace inline `accountAuthStore` with inline `sub2apiAuthSession` using the same mock functions.

- [ ] **Step 3: Run Sub2API tests and verify expected failures**

Run:

```powershell
pnpm vitest run tests/services/apiService/sub2api/index.test.ts tests/services/apiService/sub2api/keyManagement.test.ts
```

Expected: FAIL because `apiService/sub2api/index.ts` still reads `request.accountAuthStore` and does not read `request.sub2apiAuthSession`.

- [ ] **Step 4: Replace storage types and imports in `apiService/sub2api/index.ts`**

In `src/services/apiService/sub2api/index.ts`, remove:

```ts
import { AccountUpdateUserTimestampMode } from "~/services/accounts/accountDefaults"
```

Add:

```ts
import {
  getSub2ApiAuthSession,
  type Sub2ApiAuthSession,
} from "./authSession"
```

Replace:

```ts
type Sub2ApiAccountAuthStore = NonNullable<
  ApiServiceRequest["accountAuthStore"]
>
```

with no replacement type. Use `Sub2ApiAuthSession` directly.

Replace `HydratedSub2ApiAuth`:

```ts
type HydratedSub2ApiAuth<
  TRequest extends ApiServiceRequest = ApiServiceRequest,
> = {
  request: TRequest
  authSession?: Sub2ApiAuthSession
}
```

- [ ] **Step 5: Refactor `hydrateSub2ApiAuthRequest(...)`**

In `hydrateSub2ApiAuthRequest(...)`, replace:

```ts
  const accountAuthStore = request.accountAuthStore

  if (request.accountId && accountAuthStore) {
    const account = await accountAuthStore.getAccountById(request.accountId)
    if (account) {
      const storedAccessToken =
        typeof account.account_info?.access_token === "string"
          ? account.account_info.access_token.trim()
          : ""
      const storedRefreshToken = normalizeRefreshToken(
        account.sub2apiAuth?.refreshToken,
      )
      const storedTokenExpiresAt = normalizeTokenExpiresAt(
        account.sub2apiAuth?.tokenExpiresAt,
      )
```

with:

```ts
  const authSession = getSub2ApiAuthSession(request)

  if (request.accountId && authSession) {
    const storedAuth = await authSession.getLatestAuth(request.accountId)
    if (storedAuth) {
      const storedAccessToken = normalizeAccessToken(storedAuth.accessToken)
      const storedRefreshToken = normalizeRefreshToken(
        storedAuth.sub2apiAuth?.refreshToken,
      )
      const storedTokenExpiresAt = normalizeTokenExpiresAt(
        storedAuth.sub2apiAuth?.tokenExpiresAt,
      )
```

Inside that block, replace:

```ts
      if (userId === undefined) {
        userId = account.account_info?.id
      }
```

with:

```ts
      if (userId === undefined) {
        userId = storedAuth.userId
      }
```

At the return, replace:

```ts
    accountAuthStore,
```

with:

```ts
    authSession,
```

- [ ] **Step 6: Refactor persistence and auth-recovery parameter names**

Replace `persistSub2ApiAuthUpdate(...)` with:

```ts
const persistSub2ApiAuthUpdate = async (
  request: ApiServiceRequest,
  authUpdate: PersistableSub2ApiAuthUpdate,
  authSession: Sub2ApiAuthSession | undefined,
) => {
  if (!request.accountId) {
    return
  }

  if (!authSession) {
    return
  }

  try {
    const updated = await authSession.persistAuthUpdate(
      request.accountId,
      authUpdate,
    )
    if (!updated) {
      logger.warn("Failed to persist Sub2API auth update after key request", {
        accountId: request.accountId,
      })
    }
  } catch (error) {
    logger.warn("Failed to persist Sub2API auth update", {
      accountId: request.accountId,
      error: getSafeErrorMessage(error),
    })
  }
}
```

Then rename internal parameter fields from `accountAuthStore` to `authSession` in:

```text
refreshSub2ApiRequestAuth
resyncSub2ApiRequestAuth
retrySub2ApiRunnerWithResyncedAuth
executeAuthenticatedSub2ApiRequest
refreshSub2ApiAccountViaResync
fetchSub2ApiAccessTokenInfoWithResyncedAuth
fetchSub2ApiAccessTokenInfoWithAuthRecovery
getOrCreateAccessToken
refreshAccountData
```

For example, in `refreshSub2ApiRequestAuth(...)`, use:

```ts
const latestAuthSession =
  latestHydrated.authSession ?? params.authSession
```

and pass it to persistence:

```ts
await persistSub2ApiAuthUpdate(
  refreshedRequest,
  refreshed,
  latestAuthSession,
)
```

- [ ] **Step 7: Run Sub2API tests**

Run:

```powershell
pnpm vitest run tests/services/apiService/sub2api/index.test.ts tests/services/apiService/sub2api/keyManagement.test.ts
```

Expected: PASS.

- [ ] **Step 8: Confirm protocol code no longer references `accountAuthStore`**

Run:

```powershell
rg -n "accountAuthStore|Sub2ApiAccountAuthStore" src/services/apiService/sub2api tests/services/apiService/sub2api
```

Expected: no source matches. Test matches are allowed only if they are negative assertions; prefer no matches in these Sub2API test files.

- [ ] **Step 9: Commit the Sub2API protocol migration**

Run:

```powershell
git add src/services/apiService/sub2api/index.ts tests/services/apiService/sub2api/index.test.ts tests/services/apiService/sub2api/keyManagement.test.ts
git commit -m "refactor(sub2api): use auth session for token recovery"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

## Task 3: Route Account Display Contexts Through The Session And Remove Generic Storage

**Files:**
- Modify: `src/services/accounts/utils/apiServiceRequest.ts`
- Modify: `src/services/apiTransport/type.ts`
- Modify: `tests/services/accounts/apiServiceRequest.test.ts`

- [ ] **Step 1: Update account helper tests for Sub2API-only session decoration**

In `tests/services/accounts/apiServiceRequest.test.ts`, add:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import { accountSub2ApiAuthSession } from "~/services/accounts/sub2apiAuthSession"
```

Mock the session module:

```ts
vi.mock("~/services/accounts/sub2apiAuthSession", () => ({
  accountSub2ApiAuthSession: {
    getLatestAuth: vi.fn(),
    persistAuthUpdate: vi.fn(),
  },
}))
```

Replace the test named `"injects a narrow Sub2API auth store into account-scoped requests"` with:

```ts
  it("keeps non-Sub2API account-scoped requests transport-only", async () => {
    fetchTokens.mockResolvedValue([])

    await fetchDisplayAccountTokens(ACCOUNT as any)

    const request = fetchTokens.mock.calls[0]?.[0] as Record<string, unknown>
    expect(request).toEqual(expect.objectContaining(REQUEST))
    expect(request).not.toHaveProperty("accountAuthStore")
    expect(request).not.toHaveProperty("sub2apiAuthSession")
  })
```

Add a new Sub2API context test:

```ts
  it("adds a Sub2API auth session only for Sub2API display-account contexts", async () => {
    const sub2apiAccount = {
      ...ACCOUNT,
      siteType: SITE_TYPES.SUB2API,
    }
    fetchTokens.mockResolvedValue([])

    await fetchDisplayAccountTokens(sub2apiAccount as any)

    const request = fetchTokens.mock.calls[0]?.[0] as Record<string, unknown>
    expect(request).toEqual(expect.objectContaining(REQUEST))
    expect(request).not.toHaveProperty("accountAuthStore")
    expect(request.sub2apiAuthSession).toBe(accountSub2ApiAuthSession)
    expect(createDisplayAccountApiContext(sub2apiAccount as any).request).toEqual(
      expect.objectContaining({
        ...REQUEST,
        sub2apiAuthSession: accountSub2ApiAuthSession,
      }),
    )
  })
```

In the valid payload test, keep the existing context expectation but add:

```ts
      request: expect.not.objectContaining({
        accountAuthStore: expect.anything(),
      }),
```

Do not assert that all contexts are plain; Sub2API contexts intentionally carry the Sub2API-only session property so direct `createDisplayAccountApiContext(...)` key-management callers keep auth recovery.

- [ ] **Step 2: Run account helper tests and verify expected failures**

Run:

```powershell
pnpm vitest run tests/services/accounts/apiServiceRequest.test.ts
```

Expected: FAIL because `apiServiceRequest.ts` still imports `accountStorage` and injects `accountAuthStore`.

- [ ] **Step 3: Update `apiServiceRequest.ts` imports**

In `src/services/accounts/utils/apiServiceRequest.ts`, remove:

```ts
import { accountStorage } from "~/services/accounts/accountStorage"
```

Add:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import { accountSub2ApiAuthSession } from "~/services/accounts/sub2apiAuthSession"
import type { Sub2ApiAuthSessionRequest } from "~/services/apiService/sub2api/authSession"
```

- [ ] **Step 4: Add a display-account request decorator**

After `buildApiRequestFromDisplayAccount(...)`, add:

```ts
const withDisplayAccountAuthSession = (
  account: Pick<DisplaySiteData, "siteType">,
  request: ApiServiceRequest,
): ApiServiceRequest | Sub2ApiAuthSessionRequest => {
  if (account.siteType !== SITE_TYPES.SUB2API) {
    return request
  }

  return {
    ...request,
    sub2apiAuthSession: accountSub2ApiAuthSession,
  } satisfies Sub2ApiAuthSessionRequest
}
```

- [ ] **Step 5: Remove generic storage from request construction**

Change `buildApiRequestFromDisplayAccount(...)` from:

```ts
): ApiServiceRequest => ({
  baseUrl: account.baseUrl,
  accountId: account.id,
  accountAuthStore: accountStorage,
  auth: {
    authType: account.authType,
    userId: account.userId,
    accessToken: account.token,
    cookie: account.cookieAuthSessionCookie,
  },
})
```

to:

```ts
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

- [ ] **Step 6: Decorate the request returned by `createDisplayAccountApiContext(...)`**

Replace:

```ts
    request: buildApiRequestFromDisplayAccount(account),
```

with:

```ts
    request: withDisplayAccountAuthSession(
      account,
      buildApiRequestFromDisplayAccount(account),
    ),
```

This preserves Sub2API auth recovery for direct context callers such as Add Token, Copy Key, post-save token lookup, and legacy Key Management update/delete paths.

- [ ] **Step 7: Remove `accountAuthStore` from the generic transport type**

In `src/services/apiTransport/type.ts`, remove:

```ts
  accountAuthStore?: {
    getAccountById: (id: string) => Promise<any>
    updateAccount: (
      id: string,
      updates: Record<string, any>,
      options: { userTimestampMode: "preserve" | "touch" },
    ) => Promise<boolean>
  }
```

Do not add another generic storage property.

- [ ] **Step 8: Run account helper tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/apiServiceRequest.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run TypeScript compile to catch request type leaks**

Run:

```powershell
pnpm compile
```

Expected: PASS. If compile finds remaining `accountAuthStore` references, migrate them to `sub2apiAuthSession` or remove them if they are transport-only.

- [ ] **Step 10: Search for remaining generic storage references**

Run:

```powershell
rg -n "accountAuthStore|ApiServiceRequest\\[\"accountAuthStore\"\\]|Sub2ApiAccountAuthStore" src tests
```

Expected: no source matches. Test matches should be limited to negative assertions that prove generic requests do not expose `accountAuthStore`; remove stale fake storage setup.

- [ ] **Step 11: Commit account helper and transport cleanup**

Run:

```powershell
git add src/services/accounts/utils/apiServiceRequest.ts src/services/apiTransport/type.ts tests/services/accounts/apiServiceRequest.test.ts
git commit -m "refactor(accounts): scope sub2api auth session to account contexts"
```

Expected: commit succeeds after the repo hook runs `validate:staged`.

---

## Task 4: Verify Direct Account Context Callers And Runtime Bundle Scope

**Files:**
- Inspect: `src/features/KeyManagement/hooks/useKeyManagement.ts`
- Inspect: `src/features/KeyManagement/components/AddTokenDialog/index.tsx`
- Inspect: `src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts`
- Inspect: `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Inspect: `src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts`
- Inspect: `src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts`
- Test: `tests/features/AccountManagement/components/CopyKeyDialog.test.tsx`
- Test: `tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx`
- Test: `tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx`
- Test: `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`
- Test: `tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx`
- Test: `tests/entrypoints/options/pages/ModelList/ModelKeyDialog.test.tsx`
- Test: `tests/entrypoints/options/pages/ModelList/ModelKeyDialog.sub2api.test.tsx`
- Validate: Sub2API auth/session source files

- [ ] **Step 1: List direct context callers**

Run:

```powershell
rg -n "createDisplayAccountApiContext\\(" src tests
```

Expected: every direct caller receives the decorated `request` returned by `createDisplayAccountApiContext(...)`. No caller should build a replacement Sub2API key-management request manually.

- [ ] **Step 2: Confirm no protocol Module imports account storage**

Run:

```powershell
rg -n "accountStorage|sub2apiAuthSession" src/services/apiService/sub2api
```

Expected:

```text
src/services/apiService/sub2api/authSession.ts
src/services/apiService/sub2api/index.ts
```

There must be no import of `~/services/accounts/accountStorage` or `~/services/accounts/sub2apiAuthSession` from `src/services/apiService/sub2api/**`.

- [ ] **Step 3: Run focused tests that cover direct context consumers**

Run:

```powershell
pnpm vitest run tests/features/AccountManagement/components/CopyKeyDialog.test.tsx tests/features/AccountManagement/components/CopyKeyDialog.sub2api.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx tests/entrypoints/options/pages/KeyManagement/AddTokenDialog.prefill.test.tsx tests/entrypoints/options/pages/ModelList/ModelKeyDialog.test.tsx tests/entrypoints/options/pages/ModelList/ModelKeyDialog.sub2api.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run the DNR bundle smoke checks if import scope changed**

Run this if Step 2 shows any unexpected Sub2API protocol import path or if compile output indicates bundling-sensitive module movement:

```powershell
$env:AAH_E2E_BUILD_VARIANT = "dnr-required"; pnpm run build:e2e
pnpm run e2e:dnr-required -- --grep "grants the Chromium cookie/DNR optional permissions needed for cookie auth"
```

Expected: PASS. If these checks are skipped because Step 2 is clean and no bundle-sensitive import changed, report that decision explicitly.

---

## Task 5: Final Validation And Scope Audit

**Files:**
- Validate all task-scoped files from Tasks 1-4.

- [ ] **Step 1: Run focused service tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/sub2apiAuthSession.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/apiService/sub2api/index.test.ts tests/services/apiService/sub2api/keyManagement.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run adapter/account regression tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/sub2api/accountRefresh.test.ts tests/services/apiAdapters/sub2api/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accountStorage.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run related validation for changed source files**

Run:

```powershell
pnpm vitest related --run src/services/apiService/sub2api/authSession.ts src/services/accounts/sub2apiAuthSession.ts src/services/apiService/sub2api/index.ts src/services/accounts/utils/apiServiceRequest.ts src/services/apiTransport/type.ts
```

Expected: PASS. If `vitest related` cannot resolve a new file before staging, classify that as tooling and keep the focused suites plus `pnpm compile` as the primary evidence.

- [ ] **Step 4: Run TypeScript compile**

Run:

```powershell
pnpm compile
```

Expected: PASS.

- [ ] **Step 5: Run commit gate**

Run:

```powershell
git status --porcelain
pnpm run validate:staged
```

Expected: PASS for task-scoped staged files. Existing unrelated untracked files may remain untracked and must not be staged.

- [ ] **Step 6: Run push gate before publishing**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS. This is required before pushing or opening a PR because the slice changes shared TypeScript request types and cross-module auth-session wiring.

- [ ] **Step 7: Inspect final diff for scope**

If changes are staged, run:

```powershell
git diff --cached --stat
git diff --cached --name-status
```

If tasks were committed individually, run:

```powershell
git show --stat --oneline HEAD~3..HEAD
git diff --name-status HEAD~3..HEAD
```

Expected files are limited to:

```text
src/services/apiService/sub2api/authSession.ts
src/services/accounts/sub2apiAuthSession.ts
src/services/apiService/sub2api/index.ts
src/services/accounts/utils/apiServiceRequest.ts
src/services/apiTransport/type.ts
tests/services/accounts/sub2apiAuthSession.test.ts
tests/services/accounts/apiServiceRequest.test.ts
tests/services/apiService/sub2api/index.test.ts
tests/services/apiService/sub2api/keyManagement.test.ts
```

No locale files, telemetry schema, settings search files, Playwright tests, managed-site providers, model pricing, account completion, site announcements, or new site types should be changed.

- [ ] **Step 8: Record execution notes**

Before handing off, report:

```text
Focused tests:
- pnpm vitest run tests/services/accounts/sub2apiAuthSession.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/apiService/sub2api/index.test.ts tests/services/apiService/sub2api/keyManagement.test.ts
- pnpm vitest run tests/services/apiAdapters/sub2api/accountRefresh.test.ts tests/services/apiAdapters/sub2api/keyManagement.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accountStorage.test.ts

Validation:
- pnpm compile
- pnpm run validate:staged
- pnpm run validate:push

E2E decision:
- No new Playwright E2E added. Run the DNR build/smoke only if Sub2API protocol import scope changes or implementation evidence suggests a bundle-sensitive path.

Telemetry decision:
- None. No new user-visible action, setting, async result, or analytics-worthy outcome is introduced.
```

---

## Out Of Scope

- Do not rewrite Sub2API token refresh, dashboard re-sync, key parsing, or runtime `/v1/models` behavior.
- Do not move `accountStorage.refreshAccount(...)` persistence into the session port.
- Do not migrate full Key Management CRUD to a new adapter capability in this slice.
- Do not change Sub2API group selection UX, model pricing, site announcements, account completion, or account auto-detect.
- Do not add user-facing copy, locale keys, telemetry fields, settings search entries, Playwright E2E tests, or new site types.
- Do not import `accountStorage` or `accountSub2ApiAuthSession` from `src/services/apiService/sub2api/**`.

## Self-Review

- Spec coverage: Task 1 adds the auth session Interface and account-layer Adapter. Task 2 moves Sub2API hydration, refresh-token recovery, browser-session re-sync persistence, and rotated-auth writes to that Interface. Task 3 removes the generic transport property and supplies the session only for Sub2API account contexts. Task 4 verifies direct context callers and bundle-sensitive import scope. Task 5 covers validation and scope audit.
- Scope control: The plan keeps saved-account refresh persistence in `accountStorage.refreshAccount(...)` and does not touch unrelated adapter capabilities, UI copy, telemetry, settings search, or Playwright tests.
- Type consistency: The plan consistently uses `Sub2ApiAuthSession`, `Sub2ApiStoredAuthSnapshot`, `Sub2ApiPersistAuthUpdate`, and `Sub2ApiAuthSessionRequest`. It removes `ApiServiceRequest["accountAuthStore"]` and does not add another generic storage property.
- Compatibility: `createDisplayAccountApiContext(...)` keeps returning `service`, `adapter`, `keyManagement`, and `request`; the `request` is decorated only for Sub2API so existing direct key-management callers keep auth recovery without each caller learning the session Interface.
