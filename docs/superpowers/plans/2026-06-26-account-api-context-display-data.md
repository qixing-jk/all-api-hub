# Account API Context Display Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move account request-context ownership into `src/services/accounts/**` while preserving existing display-account UI flows and legacy request enrichment behavior.

**Architecture:** Add request-only `AccountApiContext` builders beside the existing display-account capability context in `src/services/accounts/utils/apiServiceRequest.ts`. Move missing-`accountId` compatibility enrichment into an accounts-owned legacy helper, have `apiService/common/utils.ts` delegate to that helper without importing storage, and keep `fetchTodayIncome(...)` as the one documented temporary `apiService/common/index.ts` storage exception for this first slice.

**Tech Stack:** TypeScript, Vitest, WXT extension services, account storage utilities, apiTransport request helpers, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-26-account-api-context-display-data-design.md`

---

## File Structure

Create:

- `src/services/accounts/utils/legacyAccountAwareRequest.ts`
  - Own the temporary `baseUrl + userId` fallback currently hidden in `apiService/common/utils.ts`.
  - Import `accountStorage` here, not in `src/services/apiService/common/utils.ts`.
  - Preserve current warning context and cookie-session fallback behavior.
- `tests/services/accounts/legacyAccountAwareRequest.test.ts`
  - Move the account-enrichment behavior tests out of `tests/services/apiService/common/utils.test.ts`.

Modify:

- `src/services/accounts/utils/apiServiceRequest.ts`
  - Export `DisplayAccountApiSnapshot`, `AccountApiContext`, `DisplayAccountApiCapabilityContext`, and `StoredAccountApiContextError`.
  - Add `createDisplayAccountRequestContext(account)` for snapshot account contexts.
  - Add `resolveStoredAccountApiContext(accountId)` for latest persisted account contexts.
  - Keep `createDisplayAccountApiContext(account)` as the adapter-capability context and implement it through `createDisplayAccountRequestContext(account)`.
- `tests/services/accounts/apiServiceRequest.test.ts`
  - Add focused tests for request-only snapshot context, stored context, Sub2API decoration, missing id, and deleted account errors.
- `src/services/apiService/common/utils.ts`
  - Remove direct `accountStorage` import.
  - Delegate compatibility enrichment to `resolveLegacyAccountAwareRequest(...)` before calling transport.
- `tests/services/apiService/common/utils.test.ts`
  - Replace storage-enrichment tests with pass-through/delegation tests.
- `src/services/accounts/defaultTokenLifecycle/requests.ts`
  - Replace duplicated stored-account request construction with `createAccountApiRequestFromStoredAccount(account).request` after Task 2 introduces that helper.
- `tests/services/accounts/defaultTokenLifecycle.test.ts`
  - Keep behavior expectations, updating expected request construction to the new shared helper if needed.
- `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
  - Replace the local `createAccountApiRequest(...)` implementation with a call to the new shared context builder while preserving abort signal support.
- `tests/services/accountKeyRepair.test.ts`
  - Update only if the migrated request shape changes a focused expectation.

Do not modify in this slice:

- `src/types/index.ts`
  - Do not delete or rename `DisplaySiteData` fields.
- `src/services/apiService/common/index.ts`
  - Leave `fetchTodayIncome(...)` storage lookup in place and document it as the remaining temporary exception. Moving that policy is a follow-up slice because it requires a cleaner account-data orchestration boundary.
- `src/locales/**`
- telemetry schemas, settings search definitions, or Playwright E2E tests.

---

## Implementation Notes

Preserve these public behaviors:

- `createDisplayAccountApiContext(account)` still returns `adapter`, `keyManagement`, `tokenProvisioning`, and `request`.
- Display snapshot requests use `account.id` as `request.accountId`.
- Cookie-auth session values are placed in `request.auth.cookie`; keep top-level `request.cookieAuthSessionCookie` only in the legacy helper for migration compatibility.
- Sub2API requests still receive `sub2apiAuthSession: accountSub2ApiAuthSession` when the account-site profile allows account API auth-session decoration.
- `fetchApi(...)` and `fetchApiData(...)` still preserve current missing-`accountId` fallback through the accounts-owned legacy helper during migration.
- `fetchTodayIncome(...)` remains compatible for now and may still import `accountStorage` through `src/services/apiService/common/index.ts`.

Use these exact names:

```ts
export type DisplayAccountApiSnapshot = Pick<
  DisplaySiteData,
  | "id"
  | "siteType"
  | "baseUrl"
  | "authType"
  | "userId"
  | "token"
  | "cookieAuthSessionCookie"
>

export interface AccountApiContext {
  accountId: string
  siteType: AccountSiteType
  request: ApiServiceRequest | Sub2ApiAuthSessionRequest
}

export interface DisplayAccountApiCapabilityContext
  extends AccountApiContext {
  adapter: SiteAdapter
  keyManagement: KeyManagementCapability | undefined
  tokenProvisioning: TokenProvisioningCapability | undefined
}
```

Telemetry decision: none. This is an internal request-context ownership refactor and does not add a user-visible action, state, or funnel.

Settings search decision: none. No settings UI, anchors, search targets, or deep links change.

E2E decision: no new Playwright E2E by default. The risk is deterministic request construction and storage lookup ownership, which is better covered by focused Vitest tests. Add E2E only if a later implementation slice changes cross-entrypoint browser behavior.

---

### Task 1: Add Snapshot Request-Only Context

**Files:**

- Modify: `src/services/accounts/utils/apiServiceRequest.ts`
- Test: `tests/services/accounts/apiServiceRequest.test.ts`

- [ ] **Step 1: Add failing snapshot-context tests**

Add these imports in `tests/services/accounts/apiServiceRequest.test.ts`:

```ts
import {
  canManageDisplayAccountTokens,
  createDisplayAccountApiContext,
  createDisplayAccountRequestContext,
  fetchDisplayAccountTokens,
  InvalidTokenPayloadError,
  resolveDisplayAccountTokenForSecret,
} from "~/services/accounts/utils/apiServiceRequest"
```

Add these tests inside `describe("fetchDisplayAccountTokens", () => { ... })` after the existing `"returns the token array when the API payload is valid"` test:

```ts
  it("builds a request-only context from a display account snapshot", () => {
    expect(createDisplayAccountRequestContext(ACCOUNT as any)).toEqual({
      accountId: "account-1",
      siteType: "new-api",
      request: expect.objectContaining(REQUEST),
    })
    expect(createDisplayAccountRequestContext(ACCOUNT as any)).not.toHaveProperty(
      "adapter",
    )
    expect(
      createDisplayAccountRequestContext(ACCOUNT as any).request,
    ).not.toHaveProperty("cookieAuthSessionCookie")
  })

  it("keeps cookie-auth sessions in request auth for display snapshots", () => {
    const context = createDisplayAccountRequestContext({
      ...ACCOUNT,
      authType: AuthTypeEnum.Cookie,
      token: "",
      cookieAuthSessionCookie: "session=abc",
    } as any)

    expect(context.request).toEqual(
      expect.objectContaining({
        accountId: "account-1",
        auth: expect.objectContaining({
          authType: AuthTypeEnum.Cookie,
          cookie: "session=abc",
        }),
      }),
    )
  })

  it("rejects display account snapshots without a stable id", () => {
    expect(() =>
      createDisplayAccountRequestContext({
        ...ACCOUNT,
        id: "   ",
      } as any),
    ).toThrow("account_api_context_missing_account_id")
  })
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm vitest --run tests/services/accounts/apiServiceRequest.test.ts
```

Expected: FAIL because `createDisplayAccountRequestContext` is not exported.

- [ ] **Step 3: Add request-only types and builder**

In `src/services/accounts/utils/apiServiceRequest.ts`, update imports:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import { shouldDecorateAccountApiRequestWithAuthSession } from "~/services/accounts/accountSiteProfile"
import { accountSub2ApiAuthSession } from "~/services/accounts/sub2apiAuthSession"
import { formatOptionalSkPrefixSiteToken } from "~/services/accountTokens/apiTokenKey"
import type { SiteAdapter } from "~/services/apiAdapters/contracts/siteAdapter"
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import type { TokenProvisioningCapability } from "~/services/apiAdapters/contracts/tokenProvisioning"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import type { Sub2ApiAuthSessionRequest } from "~/services/apiService/sub2api/authSession"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"
```

Add these exports after `InvalidTokenPayloadError`:

```ts
export class StoredAccountApiContextError extends Error {
  readonly code:
    | "MISSING_ACCOUNT_ID"
    | "ACCOUNT_NOT_FOUND"
    | "MISSING_BASE_URL"
    | "MISSING_USER_ID"
    | "MISSING_CREDENTIAL"

  constructor(
    code: StoredAccountApiContextError["code"],
    message: string,
  ) {
    super(message)
    this.name = "StoredAccountApiContextError"
    this.code = code
  }
}

export type DisplayAccountApiSnapshot = Pick<
  DisplaySiteData,
  | "id"
  | "siteType"
  | "baseUrl"
  | "authType"
  | "userId"
  | "token"
  | "cookieAuthSessionCookie"
>

export interface AccountApiContext {
  accountId: string
  siteType: AccountSiteType
  request: ApiServiceRequest | Sub2ApiAuthSessionRequest
}

export interface DisplayAccountApiCapabilityContext
  extends AccountApiContext {
  adapter: SiteAdapter
  keyManagement: KeyManagementCapability | undefined
  tokenProvisioning: TokenProvisioningCapability | undefined
}
```

Replace the existing `buildApiRequestFromDisplayAccount(...)` signature with:

```ts
const buildApiRequestFromDisplayAccount = (
  account: DisplayAccountApiSnapshot,
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

Add this exported function before `createDisplayAccountApiContext(...)`:

```ts
export const createDisplayAccountRequestContext = (
  account: DisplayAccountApiSnapshot,
): AccountApiContext => {
  if (!hasNonEmptyString(account.id)) {
    throw new StoredAccountApiContextError(
      "MISSING_ACCOUNT_ID",
      "account_api_context_missing_account_id",
    )
  }

  return {
    accountId: account.id,
    siteType: account.siteType,
    request: withDisplayAccountAuthSession(
      account,
      buildApiRequestFromDisplayAccount(account),
    ),
  }
}
```

Replace `createDisplayAccountApiContext(...)` with:

```ts
export const createDisplayAccountApiContext = (
  account: DisplayAccountApiSnapshot,
): DisplayAccountApiCapabilityContext => {
  const adapter = getSiteAdapter(account.siteType)
  const context = createDisplayAccountRequestContext(account)

  return {
    ...context,
    adapter,
    keyManagement: adapter.keyManagement,
    tokenProvisioning: adapter.tokenProvisioning,
  }
}
```

Update `fetchDisplayAccountTokens(...)` and `resolveDisplayAccountTokenForSecret(...)` parameter types from the inline `Pick<DisplaySiteData, ...>` shape to `DisplayAccountApiSnapshot`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
pnpm vitest --run tests/services/accounts/apiServiceRequest.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git status --porcelain
git add src/services/accounts/utils/apiServiceRequest.ts tests/services/accounts/apiServiceRequest.test.ts
git commit -m "refactor(accounts): add display account request context"
```

Expected: commit succeeds. If pre-commit rewrites files, inspect `git status --porcelain` and `git diff --cached` before retrying.

---

### Task 2: Add Stored Account API Context

**Files:**

- Modify: `src/services/accounts/utils/apiServiceRequest.ts`
- Test: `tests/services/accounts/apiServiceRequest.test.ts`

- [ ] **Step 1: Add failing stored-context tests**

Add this hoisted mock block near the existing mocks in `tests/services/accounts/apiServiceRequest.test.ts`:

```ts
const { mockGetAccountById } = vi.hoisted(() => ({
  mockGetAccountById: vi.fn(),
}))
```

Add this mock after the existing `sub2apiAuthSession` mock:

```ts
vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAccountById: mockGetAccountById,
  },
}))
```

Update the import from `~/services/accounts/utils/apiServiceRequest`:

```ts
import {
  canManageDisplayAccountTokens,
  createDisplayAccountApiContext,
  createDisplayAccountRequestContext,
  fetchDisplayAccountTokens,
  InvalidTokenPayloadError,
  resolveDisplayAccountTokenForSecret,
  resolveStoredAccountApiContext,
  StoredAccountApiContextError,
} from "~/services/accounts/utils/apiServiceRequest"
```

Add this helper after `REQUEST`:

```ts
const buildStoredAccount = (overrides: Record<string, unknown> = {}) => ({
  id: "account-1",
  site_name: "Example",
  site_url: "https://example.com",
  site_type: "new-api",
  authType: AuthTypeEnum.AccessToken,
  account_info: {
    id: "1",
    username: "Ada",
    access_token: "token",
  },
  cookieAuth: undefined,
  ...overrides,
})
```

In the existing `beforeEach`, add:

```ts
    mockGetAccountById.mockReset()
```

Add these tests after the snapshot-context tests:

```ts
  it("resolves stored account context from the latest persisted account", async () => {
    mockGetAccountById.mockResolvedValueOnce(
      buildStoredAccount({
        account_info: {
          id: "stored-user",
          username: "Latest",
          access_token: "stored-token",
        },
      }),
    )

    await expect(resolveStoredAccountApiContext("account-1")).resolves.toEqual({
      accountId: "account-1",
      siteType: "new-api",
      request: expect.objectContaining({
        baseUrl: "https://example.com",
        accountId: "account-1",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "stored-user",
          accessToken: "stored-token",
          cookie: undefined,
        },
      }),
    })
    expect(mockGetAccountById).toHaveBeenCalledWith("account-1")
  })

  it("preserves stored cookie-auth session in request auth", async () => {
    mockGetAccountById.mockResolvedValueOnce(
      buildStoredAccount({
        authType: AuthTypeEnum.Cookie,
        account_info: {
          id: "stored-user",
          username: "Latest",
          access_token: "",
        },
        cookieAuth: {
          sessionCookie: "session=stored",
        },
      }),
    )

    const context = await resolveStoredAccountApiContext("account-1")

    expect(context.request).toEqual(
      expect.objectContaining({
        accountId: "account-1",
        auth: expect.objectContaining({
          authType: AuthTypeEnum.Cookie,
          userId: "stored-user",
          accessToken: "",
          cookie: "session=stored",
        }),
      }),
    )
    expect(context.request).not.toHaveProperty("cookieAuthSessionCookie")
  })

  it("decorates stored Sub2API contexts with the account auth session port", async () => {
    mockGetAccountById.mockResolvedValueOnce(
      buildStoredAccount({
        site_type: SITE_TYPES.SUB2API,
      }),
    )

    const context = await resolveStoredAccountApiContext("account-1")

    expect(context.siteType).toBe(SITE_TYPES.SUB2API)
    expect(context.request).toEqual(
      expect.objectContaining({
        sub2apiAuthSession: accountSub2ApiAuthSession,
      }),
    )
  })

  it("throws a stable error when the stored account id is blank", async () => {
    await expect(resolveStoredAccountApiContext("   ")).rejects.toMatchObject({
      name: "StoredAccountApiContextError",
      code: "MISSING_ACCOUNT_ID",
      message: "account_api_context_missing_account_id",
    })
    expect(mockGetAccountById).not.toHaveBeenCalled()
  })

  it("throws a stable error when the stored account no longer exists", async () => {
    mockGetAccountById.mockResolvedValueOnce(null)

    await expect(resolveStoredAccountApiContext("missing")).rejects.toMatchObject({
      name: "StoredAccountApiContextError",
      code: "ACCOUNT_NOT_FOUND",
      message: "account_api_context_account_not_found",
    })
  })

  it("exposes StoredAccountApiContextError for caller recovery checks", () => {
    expect(
      new StoredAccountApiContextError(
        "MISSING_CREDENTIAL",
        "account_api_context_missing_credential",
      ),
    ).toMatchObject({
      name: "StoredAccountApiContextError",
      code: "MISSING_CREDENTIAL",
      message: "account_api_context_missing_credential",
    })
  })
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm vitest --run tests/services/accounts/apiServiceRequest.test.ts
```

Expected: FAIL because `resolveStoredAccountApiContext` is not exported.

- [ ] **Step 3: Add stored-account context builder**

In `src/services/accounts/utils/apiServiceRequest.ts`, add imports:

```ts
import { accountStorage } from "~/services/accounts/accountStorage"
import type { SiteAccount } from "~/types"
```

Add this type and helper after `buildApiRequestFromDisplayAccount(...)`:

```ts
type StoredAccountApiRequestSource = Pick<
  SiteAccount,
  "id" | "site_url" | "site_type" | "authType" | "account_info" | "cookieAuth"
>

export const createAccountApiRequestFromStoredAccount = (
  account: StoredAccountApiRequestSource,
): AccountApiContext => {
  if (!hasNonEmptyString(account.id)) {
    throw new StoredAccountApiContextError(
      "MISSING_ACCOUNT_ID",
      "account_api_context_missing_account_id",
    )
  }

  if (!hasNonEmptyString(account.site_url)) {
    throw new StoredAccountApiContextError(
      "MISSING_BASE_URL",
      "account_api_context_missing_base_url",
    )
  }

  if (!hasNonEmptyString(account.account_info?.id)) {
    throw new StoredAccountApiContextError(
      "MISSING_USER_ID",
      "account_api_context_missing_user_id",
    )
  }

  const accessToken = account.account_info?.access_token ?? ""
  const cookie = account.cookieAuth?.sessionCookie

  if (account.authType === AuthTypeEnum.AccessToken && !hasNonEmptyString(accessToken)) {
    throw new StoredAccountApiContextError(
      "MISSING_CREDENTIAL",
      "account_api_context_missing_credential",
    )
  }

  if (
    account.authType === AuthTypeEnum.Cookie &&
    !hasNonEmptyString(accessToken) &&
    !hasNonEmptyString(cookie)
  ) {
    throw new StoredAccountApiContextError(
      "MISSING_CREDENTIAL",
      "account_api_context_missing_credential",
    )
  }

  const request: ApiServiceRequest = {
    baseUrl: account.site_url,
    accountId: account.id,
    auth: {
      authType: account.authType,
      userId: account.account_info.id,
      accessToken,
      cookie,
    },
  }

  return {
    accountId: account.id,
    siteType: account.site_type,
    request: withDisplayAccountAuthSession(
      { siteType: account.site_type },
      request,
    ),
  }
}
```

Add this exported function after `createAccountApiRequestFromStoredAccount(...)`:

```ts
export async function resolveStoredAccountApiContext(
  accountId: string,
): Promise<AccountApiContext> {
  if (!hasNonEmptyString(accountId)) {
    throw new StoredAccountApiContextError(
      "MISSING_ACCOUNT_ID",
      "account_api_context_missing_account_id",
    )
  }

  const account = await accountStorage.getAccountById(accountId)

  if (!account) {
    throw new StoredAccountApiContextError(
      "ACCOUNT_NOT_FOUND",
      "account_api_context_account_not_found",
    )
  }

  return createAccountApiRequestFromStoredAccount(account)
}
```

Format the long `if` conditions manually or let the repo hook run Prettier.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
pnpm vitest --run tests/services/accounts/apiServiceRequest.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```powershell
git status --porcelain
git add src/services/accounts/utils/apiServiceRequest.ts tests/services/accounts/apiServiceRequest.test.ts
git commit -m "refactor(accounts): resolve stored account api context"
```

Expected: commit succeeds.

---

### Task 3: Move Legacy Missing-AccountId Enrichment To Accounts

**Files:**

- Create: `src/services/accounts/utils/legacyAccountAwareRequest.ts`
- Create: `tests/services/accounts/legacyAccountAwareRequest.test.ts`
- Modify: `src/services/apiService/common/utils.ts`
- Test: `tests/services/apiService/common/utils.test.ts`

- [ ] **Step 1: Add legacy-helper tests in the accounts module**

Create `tests/services/accounts/legacyAccountAwareRequest.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveLegacyAccountAwareRequest } from "~/services/accounts/utils/legacyAccountAwareRequest"
import { AuthTypeEnum } from "~/types"

const { mockGetAccountByBaseUrlAndUserId } = vi.hoisted(() => ({
  mockGetAccountByBaseUrlAndUserId: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAccountByBaseUrlAndUserId: mockGetAccountByBaseUrlAndUserId,
  },
}))

describe("resolveLegacyAccountAwareRequest", () => {
  beforeEach(() => {
    mockGetAccountByBaseUrlAndUserId.mockReset()
  })

  it("enriches account metadata when accountId is absent", async () => {
    mockGetAccountByBaseUrlAndUserId.mockResolvedValueOnce({
      id: "account-1",
      cookieAuth: {
        sessionCookie: "session=stored",
      },
    })

    await expect(
      resolveLegacyAccountAwareRequest(
        {
          baseUrl: "https://example.com",
          auth: {
            authType: AuthTypeEnum.Cookie,
            userId: "123",
          },
        },
        { endpoint: "/api/test" },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        accountId: "account-1",
        cookieAuthSessionCookie: "session=stored",
      }),
    )

    expect(mockGetAccountByBaseUrlAndUserId).toHaveBeenCalledWith(
      "https://example.com",
      "123",
    )
  })

  it("preserves caller-provided legacy session cookie when enriching metadata", async () => {
    mockGetAccountByBaseUrlAndUserId.mockResolvedValueOnce({
      id: "account-1",
      cookieAuth: {
        sessionCookie: "session=stored",
      },
    })

    await expect(
      resolveLegacyAccountAwareRequest(
        {
          baseUrl: "https://example.com",
          cookieAuthSessionCookie: "session=fresh",
          auth: {
            authType: AuthTypeEnum.Cookie,
            userId: "123",
          },
        },
        { endpoint: "/api/test" },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        accountId: "account-1",
        cookieAuthSessionCookie: "session=fresh",
      }),
    )
  })

  it("returns the original request when lookup misses", async () => {
    const request = {
      baseUrl: "https://example.com",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "123",
      },
    }

    mockGetAccountByBaseUrlAndUserId.mockResolvedValueOnce(null)

    await expect(
      resolveLegacyAccountAwareRequest(request, { endpoint: "/api/test" }),
    ).resolves.toBe(request)
  })

  it("does not query storage when accountId is already present", async () => {
    const request = {
      baseUrl: "https://example.com",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "123",
      },
    }

    await expect(
      resolveLegacyAccountAwareRequest(request, { endpoint: "/api/test" }),
    ).resolves.toBe(request)
    expect(mockGetAccountByBaseUrlAndUserId).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the new helper test and verify it fails**

Run:

```powershell
pnpm vitest --run tests/services/accounts/legacyAccountAwareRequest.test.ts
```

Expected: FAIL because `src/services/accounts/utils/legacyAccountAwareRequest.ts` does not exist.

- [ ] **Step 3: Implement the accounts-owned legacy helper**

Create `src/services/accounts/utils/legacyAccountAwareRequest.ts`:

```ts
import { accountStorage } from "~/services/accounts/accountStorage"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("LegacyAccountAwareRequest")

/**
 * Temporary migration helper for legacy callers that still build requests
 * without stable account identity. New account API flows should use
 * createDisplayAccountRequestContext or resolveStoredAccountApiContext instead.
 */
export async function resolveLegacyAccountAwareRequest(
  request: ApiServiceRequest,
  context: { endpoint?: string } = {},
): Promise<ApiServiceRequest> {
  if (request.accountId) return request

  const userId = request.auth?.userId

  logger.warn("fetchApi called without accountId in request", {
    baseUrl: request.baseUrl,
    userId,
    endpoint: context.endpoint,
    authType: request.auth?.authType ?? AuthTypeEnum.None,
    hasAccessToken: Boolean(request.auth?.accessToken),
    hasCookie: Boolean(request.auth?.cookie),
  })

  const accountInfo = await accountStorage.getAccountByBaseUrlAndUserId(
    request.baseUrl,
    userId,
  )

  if (!accountInfo) return request

  return {
    ...request,
    accountId: accountInfo.id,
    cookieAuthSessionCookie:
      request.cookieAuthSessionCookie ?? accountInfo.cookieAuth?.sessionCookie,
  }
}
```

- [ ] **Step 4: Run the legacy helper test and verify it passes**

Run:

```powershell
pnpm vitest --run tests/services/accounts/legacyAccountAwareRequest.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update common utils tests to assert delegation, not storage**

In `tests/services/apiService/common/utils.test.ts`, remove the `mockGetAccountByBaseUrlAndUserId` hoist and the `vi.mock("~/services/accounts/accountStorage", ...)` block.

Add this hoist:

```ts
const { mockResolveLegacyAccountAwareRequest } = vi.hoisted(() => ({
  mockResolveLegacyAccountAwareRequest: vi.fn(),
}))
```

Add this mock:

```ts
vi.mock("~/services/accounts/utils/legacyAccountAwareRequest", () => ({
  resolveLegacyAccountAwareRequest: mockResolveLegacyAccountAwareRequest,
}))
```

In `beforeEach`, add:

```ts
    mockResolveLegacyAccountAwareRequest.mockReset()
    mockResolveLegacyAccountAwareRequest.mockImplementation(
      async (request) => request,
    )
```

Replace the four existing `fetchApiData` enrichment tests with these two tests:

```ts
    it("delegates account-aware compatibility resolution before transport", async () => {
      const request = {
        baseUrl: "https://example.com",
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "123",
        },
      }
      const enrichedRequest = {
        ...request,
        accountId: "account-1",
        cookieAuthSessionCookie: "session=stored",
      }
      mockResolveLegacyAccountAwareRequest.mockResolvedValueOnce(enrichedRequest)
      mockFetchApiData.mockResolvedValueOnce({ ok: true })

      await expect(
        fetchApiData(request, { endpoint: "/api/test" }),
      ).resolves.toEqual({ ok: true })

      expect(mockResolveLegacyAccountAwareRequest).toHaveBeenCalledWith(
        request,
        { endpoint: "/api/test" },
      )
      expect(mockFetchApiData).toHaveBeenCalledWith(enrichedRequest, {
        endpoint: "/api/test",
      })
    })

    it("passes through the original request when compatibility resolution is a no-op", async () => {
      const request = {
        baseUrl: "https://example.com",
        accountId: "account-1",
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: "123",
        },
      }
      const options = { endpoint: "/api/test" }
      mockFetchApiData.mockResolvedValueOnce({ ok: true })

      await expect(fetchApiData(request, options)).resolves.toEqual({
        ok: true,
      })

      expect(mockResolveLegacyAccountAwareRequest).toHaveBeenCalledWith(
        request,
        options,
      )
      expect(mockFetchApiData).toHaveBeenCalledWith(request, options)
    })
```

- [ ] **Step 6: Run common utils test and verify it fails before code change**

Run:

```powershell
pnpm vitest --run tests/services/apiService/common/utils.test.ts
```

Expected: FAIL because `apiService/common/utils.ts` still imports `accountStorage` and does not call `resolveLegacyAccountAwareRequest`.

- [ ] **Step 7: Update common utils to delegate to the accounts helper**

In `src/services/apiService/common/utils.ts`, remove these imports:

```ts
import { accountStorage } from "~/services/accounts/accountStorage"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"
```

Add:

```ts
import { resolveLegacyAccountAwareRequest } from "~/services/accounts/utils/legacyAccountAwareRequest"
```

Delete:

```ts
const logger = createLogger("ApiServiceCommonUtils")

const resolveAccountAwareRequest = async (
  request: ApiServiceRequest,
  endpoint: string,
): Promise<ApiServiceRequest> => {
  ...
}
```

Update `fetchApiData(...)`:

```ts
export async function fetchApiData<T>(
  request: ApiServiceRequest,
  options: FetchApiOptions,
): Promise<T> {
  return await transportFetchApiData(
    await resolveLegacyAccountAwareRequest(request, {
      endpoint: options.endpoint,
    }),
    options,
  )
}
```

Update `fetchApi(...)`:

```ts
export async function fetchApi<T>(
  request: ApiServiceRequest,
  options: FetchApiOptions,
  _normalResponseType?: boolean,
): Promise<T | ApiResponse<T>> {
  return await transportFetchApi(
    await resolveLegacyAccountAwareRequest(request, {
      endpoint: options.endpoint,
    }),
    options,
    _normalResponseType as true,
  )
}
```

- [ ] **Step 8: Run focused tests and verify they pass**

Run:

```powershell
pnpm vitest --run tests/services/accounts/legacyAccountAwareRequest.test.ts tests/services/apiService/common/utils.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run ownership check for common utils**

Run:

```powershell
rg "accountStorage" src/services/apiService/common/utils.ts
```

Expected: no matches.

Run:

```powershell
rg "resolveAccountAwareRequest" src/services/apiService/common src/services/accounts
```

Expected: no matches.

Run:

```powershell
rg "resolveLegacyAccountAwareRequest" src/services/accounts src/services/apiService/common tests/services
```

Expected: matches only in the new helper, its test, `src/services/apiService/common/utils.ts`, and `tests/services/apiService/common/utils.test.ts`.

- [ ] **Step 10: Commit Task 3**

Run:

```powershell
git status --porcelain
git add src/services/accounts/utils/legacyAccountAwareRequest.ts tests/services/accounts/legacyAccountAwareRequest.test.ts src/services/apiService/common/utils.ts tests/services/apiService/common/utils.test.ts
git commit -m "refactor(accounts): own legacy api request enrichment"
```

Expected: commit succeeds.

---

### Task 4: Migrate Local Request Builders To The Shared Context Seam

**Files:**

- Modify: `src/services/accounts/defaultTokenLifecycle/requests.ts`
- Modify: `tests/services/accounts/defaultTokenLifecycle.test.ts`
- Modify: `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
- Test: `tests/services/accounts/defaultTokenLifecycle.test.ts`
- Test: `tests/services/accountKeyRepair.test.ts`

- [ ] **Step 1: Update default-token request expectation to shared helper**

In `tests/services/accounts/defaultTokenLifecycle.test.ts`, keep the existing import from `~/services/accounts/defaultTokenLifecycle` unchanged and add this import:

```ts
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
```

Replace the expectation:

```ts
    expect(createTokenMock).toHaveBeenCalledWith(
      createStoredAccountTokenRequest(buildStoredAccount(displayAccount)),
      generateDefaultTokenRequest(),
    )
```

with:

```ts
    expect(createTokenMock).toHaveBeenCalledWith(
      createAccountApiRequestFromStoredAccount(
        buildStoredAccount(displayAccount),
      ).request,
      generateDefaultTokenRequest(),
    )
```

- [ ] **Step 2: Run default-token test and verify behavior is still green before implementation cleanup**

Run:

```powershell
pnpm vitest --run tests/services/accounts/defaultTokenLifecycle.test.ts
```

Expected: PASS or FAIL only on import/type wiring. This step verifies the expected request shape is unchanged before replacing the implementation.

- [ ] **Step 3: Replace stored-token request implementation with shared builder**

In `src/services/accounts/defaultTokenLifecycle/requests.ts`, add:

```ts
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
```

Replace `createStoredAccountTokenRequest(...)` with:

```ts
/**
 * Creates an adapter request DTO from a stored account record.
 */
export function createStoredAccountTokenRequest(
  account: SiteAccount,
): ApiServiceRequest {
  return createAccountApiRequestFromStoredAccount(account).request
}
```

- [ ] **Step 4: Replace group coverage local request builder**

In `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`, add:

```ts
import { createDisplayAccountRequestContext } from "~/services/accounts/utils/apiServiceRequest"
```

Replace the body of local `createAccountApiRequest(...)` with:

```ts
function createAccountApiRequest(
  account: SiteAccount,
  displaySiteData: DisplaySiteData,
  abortSignal?: AbortSignal,
): ApiServiceRequest {
  const snapshot = {
    ...displaySiteData,
    id: displaySiteData.id || account.id,
    baseUrl: displaySiteData.baseUrl || account.site_url,
  }
  const { request } = createDisplayAccountRequestContext(snapshot)

  return abortSignal ? { ...request, abortSignal } : request
}
```

Do not change surrounding key-management or token-provisioning logic.

- [ ] **Step 5: Run focused tests for migrated request builders**

Run:

```powershell
pnpm vitest --run tests/services/accounts/defaultTokenLifecycle.test.ts tests/services/accountKeyRepair.test.ts
```

Expected: PASS.

- [ ] **Step 6: Search for duplicated account request construction in touched account modules**

Run:

```powershell
rg "cookie: displaySiteData\\.cookieAuthSessionCookie|account_info\\.access_token|accountId: displaySiteData\\.id \\|\\| account\\.id" src/services/accounts
```

Expected: no matches in `src/services/accounts/defaultTokenLifecycle/requests.ts` or `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`. Other matches may remain in unrelated account modules and should be reported as follow-up unless they are part of this task.

- [ ] **Step 7: Commit Task 4**

Run:

```powershell
git status --porcelain
git add src/services/accounts/defaultTokenLifecycle/requests.ts tests/services/accounts/defaultTokenLifecycle.test.ts src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts
git commit -m "refactor(accounts): reuse account api context builders"
```

Expected: commit succeeds.

---

### Task 5: Document The Remaining Income Exception And Run Migration Gates

**Files:**

- Modify: `src/services/apiService/common/index.ts`
- Test: `tests/services/apiService/common/accountData.test.ts`

- [ ] **Step 1: Add explicit temporary exception comment to common income code**

In `src/services/apiService/common/index.ts`, keep the `accountStorage` import and add this comment immediately above it:

```ts
// Temporary exception during account API context migration:
// fetchTodayIncome still owns exchange-rate lookup until account-data refresh
// orchestration moves that policy into src/services/accounts/**.
import { accountStorage } from "~/services/accounts/accountStorage"
```

If import-order tooling moves the comment away from the import, place the same comment immediately above `fetchTodayIncome(...)` instead:

```ts
// Temporary exception during account API context migration:
// this helper still owns exchange-rate lookup until account-data refresh
// orchestration moves that policy into src/services/accounts/**.
export async function fetchTodayIncome(
```

- [ ] **Step 2: Keep current income tests unchanged and verify the exception behavior**

Run:

```powershell
pnpm vitest --run tests/services/apiService/common/accountData.test.ts
```

Expected: PASS, including these existing behaviors:

- `fetchTodayIncome uses the account exchange rate and parses quota fallbacks`
- `fetchTodayIncome falls back to lookup by baseUrl and userId when accountId is absent`

- [ ] **Step 3: Run all account/request focused tests**

Run:

```powershell
pnpm vitest --run tests/services/accounts/apiServiceRequest.test.ts tests/services/accounts/legacyAccountAwareRequest.test.ts tests/services/apiService/common/utils.test.ts tests/services/apiService/common/accountData.test.ts tests/services/accounts/defaultTokenLifecycle.test.ts tests/services/accountKeyRepair.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run ownership and migration checks**

Run:

```powershell
rg "accountStorage" src/services/apiService/common
```

Expected: one remaining match in `src/services/apiService/common/index.ts` for the documented `fetchTodayIncome(...)` exception, and no match in `src/services/apiService/common/utils.ts`.

Run:

```powershell
rg "getAccountByBaseUrlAndUserId" src/services/apiService src/services/apiAdapters
```

Expected: no matches in `src/services/apiService/common/utils.ts`. A match in `src/services/apiService/common/index.ts` is allowed only for the documented `fetchTodayIncome(...)` exception.

Run:

```powershell
rg "DisplaySiteData" src/services/apiService src/services/apiAdapters src/services/apiTransport
```

Expected: no new `DisplaySiteData` references from this branch. Existing unrelated matches should be inspected and reported, not rewritten in this slice.

Run:

```powershell
rg "accountId\\?:" src/types/index.ts src/services src/features
```

Expected: existing `DisplaySiteData.accountId?: string` may remain. No new optional account-id fields should appear in new account request-context code.

Run:

```powershell
rg "createDisplayAccountRequestContext|createDisplayAccountApiContext|resolveStoredAccountApiContext|resolveLegacyAccountAwareRequest" src tests
```

Expected: new request-only consumers use `createDisplayAccountRequestContext(...)` or `resolveStoredAccountApiContext(...)`; existing capability consumers may still use `createDisplayAccountApiContext(...)`; only compatibility code uses `resolveLegacyAccountAwareRequest(...)`.

- [ ] **Step 5: Run staged validation**

Run:

```powershell
git status --porcelain
git add src/services/accounts/utils/apiServiceRequest.ts src/services/accounts/utils/legacyAccountAwareRequest.ts src/services/apiService/common/utils.ts src/services/apiService/common/index.ts src/services/accounts/defaultTokenLifecycle/requests.ts src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accounts/legacyAccountAwareRequest.test.ts tests/services/apiService/common/utils.test.ts tests/services/apiService/common/accountData.test.ts tests/services/accounts/defaultTokenLifecycle.test.ts
pnpm run validate:staged
```

Expected: PASS.

If `tests/services/accountKeyRepair.test.ts` was modified, include it in the `git add` command before `validate:staged`.

- [ ] **Step 6: Run push-level validation because shared exports and request wiring changed**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS.

- [ ] **Step 7: Inspect final diff**

Run:

```powershell
git diff --cached --stat
git diff --cached -- src/services/accounts/utils/apiServiceRequest.ts src/services/accounts/utils/legacyAccountAwareRequest.ts src/services/apiService/common/utils.ts src/services/apiService/common/index.ts
```

Expected:

- `src/services/apiService/common/utils.ts` no longer imports `accountStorage`.
- `src/services/accounts/utils/legacyAccountAwareRequest.ts` is the only new owner of compatibility missing-`accountId` enrichment.
- `fetchTodayIncome(...)` is explicitly marked as the remaining temporary storage exception.
- No tokens, cookies, raw account identifiers beyond test placeholders, or real service secrets are added.

- [ ] **Step 8: Commit Task 5**

Run:

```powershell
git commit -m "refactor(accounts): clarify account api context ownership"
```

Expected: commit succeeds.

---

## Follow-Up Work Not In This Slice

- Move `fetchTodayIncome(...)` exchange-rate lookup and persisted-account selection out of `src/services/apiService/common/index.ts` into an accounts-owned account-data refresh orchestration helper.
- Delete `resolveLegacyAccountAwareRequest(...)` after all callers pass `accountId` or an explicit account context.
- Stop reading `DisplaySiteData.accountId`; use `DisplaySiteData.id` as the account id.
- Narrow more deep service parameters from full `DisplaySiteData` to `DisplayAccountApiSnapshot`, `AccountApiContext`, or `accountId`.
- Consider renaming `DisplaySiteData` only after service/protocol consumers no longer treat it as a general account object.

---

## Final Handoff Checklist

- [ ] Focused Vitest commands from Task 5 passed.
- [ ] `pnpm run validate:staged` passed.
- [ ] `pnpm run validate:push` passed.
- [ ] `rg "accountStorage" src/services/apiService/common` shows only the documented `fetchTodayIncome(...)` exception.
- [ ] Telemetry decision reported: none.
- [ ] Settings search decision reported: none.
- [ ] E2E decision reported: no new E2E; focused Vitest is the right layer for this slice.
- [ ] Maintainability decision reported: request-building logic centralized in accounts-owned context builders; income policy intentionally left as a documented follow-up because moving it would broaden account-data refresh orchestration.
