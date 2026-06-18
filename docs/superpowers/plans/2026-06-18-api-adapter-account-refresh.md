# API Adapter Account Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move saved-account refresh through `SiteAdapter.accountRefresh` while preserving existing account refresh behavior.

**Architecture:** Add a narrow `accountRefresh` capability to the existing `apiAdapters` Interface. Backend adapters delegate to the existing legacy refresh helpers, while `accountStorage.refreshAccount(...)` keeps product-owned persistence, manual balance overrides, custom check-in merging, balance-history capture, and Sub2API auth-update persistence.

**Tech Stack:** TypeScript, WXT extension services, Vitest, existing `apiService` compatibility facade, existing `apiAdapters` registry.

---

## File Structure

- Create `src/services/apiAdapters/contracts/accountRefresh.ts`
  - Owns the `AccountRefreshCapability` Interface.
  - Reuses `ApiServiceAccountRequest`, `ApiServiceRequest`, and `RefreshAccountResult`.
- Modify `src/services/apiAdapters/contracts/siteAdapter.ts`
  - Adds optional `accountRefresh?: AccountRefreshCapability`.
- Create `src/services/apiAdapters/newApi/accountRefresh.ts`
  - Creates a site-scoped New API-family refresh Adapter.
- Modify `src/services/apiAdapters/newApi/index.ts`
  - Registers `accountRefresh` for every New API-family site type.
- Create `src/services/apiAdapters/sub2api/accountRefresh.ts`
  - Delegates Sub2API refresh and check-in support probing to existing Sub2API helpers.
- Modify `src/services/apiAdapters/sub2api/index.ts`
  - Registers Sub2API `accountRefresh`.
- Create `src/services/apiAdapters/aihubmix/accountRefresh.ts`
  - Delegates AIHubMix refresh and check-in support probing to existing AIHubMix helpers.
- Modify `src/services/apiAdapters/aihubmix/index.ts`
  - Registers AIHubMix `accountRefresh`.
- Modify `src/services/accounts/accountStorage.ts`
  - Replaces direct refresh-path `getApiService(...)` calls with `getSiteAdapter(...).accountRefresh`.
  - Keeps account persistence and product merge rules in account storage.
- Create `tests/services/apiAdapters/newApi/accountRefresh.test.ts`
  - Covers New API-family Adapter delegation.
- Create `tests/services/apiAdapters/sub2api/accountRefresh.test.ts`
  - Covers Sub2API Adapter delegation and `authUpdate` preservation.
- Create `tests/services/apiAdapters/aihubmix/accountRefresh.test.ts`
  - Covers AIHubMix Adapter delegation and unchanged disabled-check-in/zeroed-stat result.
- Modify `tests/services/apiAdapters/registry.test.ts`
  - Expects `accountRefresh` on New API-family, Sub2API, and AIHubMix Adapters.
- Modify `tests/services/accountStorage.test.ts`
  - Mocks `getSiteAdapter(...)`.
  - Verifies refresh uses `accountRefresh`.
  - Verifies missing capability produces persisted unhealthy status without throwing out of the refresh workflow.
  - Keeps existing manual balance, support-probe failure, Sub2API auth-update, and snapshot assertions passing.

## Task 1: Add Failing Adapter Capability Tests

**Files:**
- Create: `tests/services/apiAdapters/newApi/accountRefresh.test.ts`
- Create: `tests/services/apiAdapters/sub2api/accountRefresh.test.ts`
- Create: `tests/services/apiAdapters/aihubmix/accountRefresh.test.ts`
- Modify: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Write the New API-family Adapter test**

Create `tests/services/apiAdapters/newApi/accountRefresh.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createNewApiAccountRefresh } from "~/services/apiAdapters/newApi/accountRefresh"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

const {
  mockFetchSupportCheckIn,
  mockGetApiService,
  mockRefreshAccountData,
} = vi.hoisted(() => ({
  mockFetchSupportCheckIn: vi.fn(),
  mockGetApiService: vi.fn(),
  mockRefreshAccountData: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
}))

const supportRequest = {
  baseUrl: "https://one.example.invalid",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "account-token",
  },
}

const refreshRequest = {
  ...supportRequest,
  accountId: "account-1",
  checkIn: {
    enableDetection: true,
    autoCheckInEnabled: true,
    siteStatus: {
      isCheckedInToday: false,
    },
  },
  includeTodayCashflow: false,
}

describe("createNewApiAccountRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiService.mockReturnValue({
      fetchSupportCheckIn: mockFetchSupportCheckIn,
      refreshAccountData: mockRefreshAccountData,
    })
  })

  it("delegates refresh operations through the site-specific apiService", async () => {
    const refreshResult = {
      success: true,
      data: {
        quota: 123,
        today_prompt_tokens: 1,
        today_completion_tokens: 2,
        today_quota_consumption: 3,
        today_requests_count: 4,
        today_income: 5,
        checkIn: refreshRequest.checkIn,
      },
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: "ok",
      },
    }
    mockFetchSupportCheckIn.mockResolvedValueOnce(true)
    mockRefreshAccountData.mockResolvedValueOnce(refreshResult)

    const accountRefresh = createNewApiAccountRefresh(SITE_TYPES.ONE_HUB)

    await expect(
      accountRefresh.fetchCheckInSupport?.(supportRequest),
    ).resolves.toBe(true)
    await expect(accountRefresh.refreshAccount(refreshRequest)).resolves.toBe(
      refreshResult,
    )

    expect(mockGetApiService).toHaveBeenCalledWith(SITE_TYPES.ONE_HUB)
    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith(supportRequest)
    expect(mockRefreshAccountData).toHaveBeenCalledWith(refreshRequest)
  })
})
```

- [ ] **Step 2: Write the Sub2API Adapter test**

Create `tests/services/apiAdapters/sub2api/accountRefresh.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { sub2ApiAccountRefresh } from "~/services/apiAdapters/sub2api/accountRefresh"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

const { mockFetchSupportCheckIn, mockRefreshAccountData } = vi.hoisted(() => ({
  mockFetchSupportCheckIn: vi.fn(),
  mockRefreshAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/sub2api", () => ({
  fetchSupportCheckIn: mockFetchSupportCheckIn,
  refreshAccountData: mockRefreshAccountData,
}))

const supportRequest = {
  baseUrl: "https://sub2.example.invalid",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "dashboard-jwt",
    refreshToken: "refresh-token",
    tokenExpiresAt: 1999999999999,
  },
}

const refreshRequest = {
  ...supportRequest,
  accountId: "sub2-account",
  checkIn: {
    enableDetection: true,
    siteStatus: {
      isCheckedInToday: false,
    },
  },
  includeTodayCashflow: true,
}

describe("sub2ApiAccountRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates refresh operations and preserves authUpdate fields", async () => {
    const refreshResult = {
      success: true,
      data: {
        quota: 42,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
        checkIn: {
          enableDetection: false,
        },
      },
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: "ok",
      },
      authUpdate: {
        accessToken: "new-dashboard-jwt",
        userId: "7",
        username: "alice",
        sub2apiAuth: {
          refreshToken: "new-refresh-token",
          tokenExpiresAt: 2000000000000,
        },
      },
    }
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)
    mockRefreshAccountData.mockResolvedValueOnce(refreshResult)

    await expect(
      sub2ApiAccountRefresh.fetchCheckInSupport?.(supportRequest),
    ).resolves.toBe(false)
    await expect(
      sub2ApiAccountRefresh.refreshAccount(refreshRequest),
    ).resolves.toBe(refreshResult)

    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith(supportRequest)
    expect(mockRefreshAccountData).toHaveBeenCalledWith(refreshRequest)
  })
})
```

- [ ] **Step 3: Write the AIHubMix Adapter test**

Create `tests/services/apiAdapters/aihubmix/accountRefresh.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { aihubmixAccountRefresh } from "~/services/apiAdapters/aihubmix/accountRefresh"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

const { mockFetchSupportCheckIn, mockRefreshAccountData } = vi.hoisted(() => ({
  mockFetchSupportCheckIn: vi.fn(),
  mockRefreshAccountData: vi.fn(),
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  fetchSupportCheckIn: mockFetchSupportCheckIn,
  refreshAccountData: mockRefreshAccountData,
}))

const supportRequest = {
  baseUrl: "https://aihubmix.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "aihubmix-access-token",
  },
}

const refreshRequest = {
  ...supportRequest,
  accountId: "aihubmix-account",
  checkIn: {
    enableDetection: true,
    siteStatus: {
      isCheckedInToday: false,
    },
  },
  includeTodayCashflow: true,
}

describe("aihubmixAccountRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("delegates refresh operations without reshaping disabled check-in or zeroed stats", async () => {
    const refreshResult = {
      success: true,
      data: {
        quota: 9800,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
        checkIn: {
          enableDetection: false,
          siteStatus: {
            isCheckedInToday: undefined,
          },
        },
      },
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: "ok",
      },
    }
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)
    mockRefreshAccountData.mockResolvedValueOnce(refreshResult)

    await expect(
      aihubmixAccountRefresh.fetchCheckInSupport?.(supportRequest),
    ).resolves.toBe(false)
    await expect(
      aihubmixAccountRefresh.refreshAccount(refreshRequest),
    ).resolves.toBe(refreshResult)

    expect(mockFetchSupportCheckIn).toHaveBeenCalledWith(supportRequest)
    expect(mockRefreshAccountData).toHaveBeenCalledWith(refreshRequest)
  })
})
```

- [ ] **Step 4: Update registry expectations**

In `tests/services/apiAdapters/registry.test.ts`, add `accountRefresh` expectations.

In the Sub2API test, after the existing `keyManagement` expectation, add:

```ts
    expect(adapter.accountRefresh).toEqual({
      fetchCheckInSupport: expect.any(Function),
      refreshAccount: expect.any(Function),
    })
```

In the New API-family loop, after the existing `keyManagement` expectation, add:

```ts
      expect(adapter.accountRefresh).toEqual({
        fetchCheckInSupport: expect.any(Function),
        refreshAccount: expect.any(Function),
      })
```

In the AIHubMix test, after the existing `keyManagement` expectation, add:

```ts
    expect(adapter.accountRefresh).toEqual({
      fetchCheckInSupport: expect.any(Function),
      refreshAccount: expect.any(Function),
    })
```

- [ ] **Step 5: Run tests and verify the expected failure**

Run:

```bash
pnpm vitest --run tests/services/apiAdapters/newApi/accountRefresh.test.ts tests/services/apiAdapters/sub2api/accountRefresh.test.ts tests/services/apiAdapters/aihubmix/accountRefresh.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: FAIL because the new `accountRefresh` modules and `SiteAdapter.accountRefresh` contract do not exist yet.

## Task 2: Implement Adapter Capability And Registry Wiring

**Files:**
- Create: `src/services/apiAdapters/contracts/accountRefresh.ts`
- Modify: `src/services/apiAdapters/contracts/siteAdapter.ts`
- Create: `src/services/apiAdapters/newApi/accountRefresh.ts`
- Modify: `src/services/apiAdapters/newApi/index.ts`
- Create: `src/services/apiAdapters/sub2api/accountRefresh.ts`
- Modify: `src/services/apiAdapters/sub2api/index.ts`
- Create: `src/services/apiAdapters/aihubmix/accountRefresh.ts`
- Modify: `src/services/apiAdapters/aihubmix/index.ts`
- Test: `tests/services/apiAdapters/newApi/accountRefresh.test.ts`
- Test: `tests/services/apiAdapters/sub2api/accountRefresh.test.ts`
- Test: `tests/services/apiAdapters/aihubmix/accountRefresh.test.ts`
- Test: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Add the contract**

Create `src/services/apiAdapters/contracts/accountRefresh.ts`:

```ts
import type {
  ApiServiceAccountRequest,
  ApiServiceRequest,
  RefreshAccountResult,
} from "~/services/apiService/common/type"

export type AccountRefreshSupportRequest = {
  baseUrl: string
  auth: ApiServiceRequest["auth"]
}

export type AccountRefreshRequest = ApiServiceAccountRequest

export type AccountRefreshCapability = {
  fetchCheckInSupport?(
    request: AccountRefreshSupportRequest,
  ): Promise<boolean>
  refreshAccount(request: AccountRefreshRequest): Promise<RefreshAccountResult>
}
```

- [ ] **Step 2: Extend `SiteAdapter`**

Modify `src/services/apiAdapters/contracts/siteAdapter.ts`.

Add the import:

```ts
import type { AccountRefreshCapability } from "./accountRefresh"
```

Add the optional capability to `SiteAdapter`:

```ts
  accountRefresh?: AccountRefreshCapability
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
}
```

- [ ] **Step 3: Add the New API-family Adapter**

Create `src/services/apiAdapters/newApi/accountRefresh.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import { getApiService } from "~/services/apiService"

/**
 * Create account-refresh operations bound to the New API-family site type.
 */
export function createNewApiAccountRefresh(
  siteType: AccountSiteType,
): AccountRefreshCapability {
  return {
    fetchCheckInSupport: (request) =>
      getApiService(siteType).fetchSupportCheckIn(request),
    refreshAccount: (request) =>
      getApiService(siteType).refreshAccountData(request),
  }
}
```

- [ ] **Step 4: Register the New API-family Adapter capability**

Modify `src/services/apiAdapters/newApi/index.ts`.

Add:

```ts
import { createNewApiAccountRefresh } from "./accountRefresh"
```

Add the property inside `createNewApiAdapter(...)`:

```ts
  accountRefresh: createNewApiAccountRefresh(siteType),
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
})
```

- [ ] **Step 5: Add the Sub2API Adapter**

Create `src/services/apiAdapters/sub2api/accountRefresh.ts`:

```ts
import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import {
  fetchSupportCheckIn,
  refreshAccountData,
} from "~/services/apiService/sub2api"

export const sub2ApiAccountRefresh: AccountRefreshCapability = {
  fetchCheckInSupport: (request) => fetchSupportCheckIn(request),
  refreshAccount: (request) => refreshAccountData(request),
}
```

- [ ] **Step 6: Register the Sub2API Adapter capability**

Modify `src/services/apiAdapters/sub2api/index.ts`.

Add:

```ts
import { sub2ApiAccountRefresh } from "./accountRefresh"
```

Add the property inside `sub2ApiAdapter`:

```ts
  accountRefresh: sub2ApiAccountRefresh,
```

The object should include:

```ts
export const sub2ApiAdapter: SiteAdapter = {
  siteType: SITE_TYPES.SUB2API,
  family: "sub2api",
  siteAnnouncements: sub2ApiSiteAnnouncements,
  modelCatalog: sub2ApiModelCatalog,
  accountCompletion: sub2ApiAccountCompletion,
  keyManagement: sub2ApiKeyManagement,
  accountRefresh: sub2ApiAccountRefresh,
}
```

- [ ] **Step 7: Add the AIHubMix Adapter**

Create `src/services/apiAdapters/aihubmix/accountRefresh.ts`:

```ts
import type { AccountRefreshCapability } from "~/services/apiAdapters/contracts/accountRefresh"
import {
  fetchSupportCheckIn,
  refreshAccountData,
} from "~/services/apiService/aihubmix"

export const aihubmixAccountRefresh: AccountRefreshCapability = {
  fetchCheckInSupport: (request) => fetchSupportCheckIn(request),
  refreshAccount: (request) => refreshAccountData(request),
}
```

- [ ] **Step 8: Register the AIHubMix Adapter capability**

Modify `src/services/apiAdapters/aihubmix/index.ts`.

Add:

```ts
import { aihubmixAccountRefresh } from "./accountRefresh"
```

Add the property inside `aihubmixAdapter`:

```ts
  accountRefresh: aihubmixAccountRefresh,
```

The object should include:

```ts
export const aihubmixAdapter: SiteAdapter = {
  siteType: SITE_TYPES.AIHUBMIX,
  accountCompletion: aihubmixAccountCompletion,
  keyManagement: aihubmixKeyManagement,
  accountRefresh: aihubmixAccountRefresh,
}
```

- [ ] **Step 9: Run focused Adapter tests**

Run:

```bash
pnpm vitest --run tests/services/apiAdapters/newApi/accountRefresh.test.ts tests/services/apiAdapters/sub2api/accountRefresh.test.ts tests/services/apiAdapters/aihubmix/accountRefresh.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Adapter capability**

Run:

```bash
git add src/services/apiAdapters/contracts/accountRefresh.ts src/services/apiAdapters/contracts/siteAdapter.ts src/services/apiAdapters/newApi/accountRefresh.ts src/services/apiAdapters/newApi/index.ts src/services/apiAdapters/sub2api/accountRefresh.ts src/services/apiAdapters/sub2api/index.ts src/services/apiAdapters/aihubmix/accountRefresh.ts src/services/apiAdapters/aihubmix/index.ts tests/services/apiAdapters/newApi/accountRefresh.test.ts tests/services/apiAdapters/sub2api/accountRefresh.test.ts tests/services/apiAdapters/aihubmix/accountRefresh.test.ts tests/services/apiAdapters/registry.test.ts
git commit -m "refactor(api-adapters): add account refresh capability"
```

Expected: commit succeeds after the pre-commit hook runs `validate:staged`.

## Task 3: Add Failing Account Storage Migration Tests

**Files:**
- Modify: `tests/services/accountStorage.test.ts`

- [ ] **Step 1: Replace legacy API service mocks with `getSiteAdapter` mocks**

In `tests/services/accountStorage.test.ts`, update the hoisted mock block.

Remove these entries:

```ts
  mockValidateAccountConnection,
  mockFetchTodayIncome,
```

Add this entry:

```ts
  mockGetSiteAdapter,
```

Add `mockGetSiteAdapter: vi.fn(),` in the returned object:

```ts
  mockGetSiteAdapter: vi.fn(),
```

The hoisted block should contain these refresh-related mocks:

```ts
  mockFetchSupportCheckIn,
  mockGetAccountSiteType,
  mockGetSiteAdapter,
  mockRefreshAccountData,
```

- [ ] **Step 2: Replace the `apiService` module mock with an adapter-registry mock**

Remove this mock:

```ts
vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    fetchTodayIncome: mockFetchTodayIncome,
    refreshAccountData: mockRefreshAccountData,
    validateAccountConnection: mockValidateAccountConnection,
    fetchSupportCheckIn: mockFetchSupportCheckIn,
  })),
}))
```

Add this mock in the same area:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: mockGetSiteAdapter,
}))
```

After the replacement, `accountStorage.test.ts` should not mock `~/services/apiService` directly.

- [ ] **Step 3: Update `beforeEach` default adapter behavior**

In the `beforeEach`, remove:

```ts
    mockValidateAccountConnection.mockReset()
    mockFetchTodayIncome.mockReset()
```

Add:

```ts
    mockGetSiteAdapter.mockReset()
```

After the existing `mockRefreshAccountData.mockImplementation(...)`, add:

```ts
    mockGetSiteAdapter.mockReturnValue({
      accountRefresh: {
        fetchCheckInSupport: mockFetchSupportCheckIn,
        refreshAccount: mockRefreshAccountData,
      },
    })
```

- [ ] **Step 4: Remove obsolete legacy mock defaults and assertions**

Remove this default:

```ts
    mockFetchTodayIncome.mockResolvedValue({ today_income: 0 })
```

Remove these assertions from refresh tests:

```ts
    expect(mockFetchTodayIncome).not.toHaveBeenCalled()
```

There should be no `mockValidateAccountConnection` or `mockFetchTodayIncome` references left after this step.

Verify with:

```bash
rg -n "mockValidateAccountConnection|mockFetchTodayIncome" tests/services/accountStorage.test.ts
```

Expected: no matches.

- [ ] **Step 5: Add an assertion that re-detected site type drives adapter selection**

In the test named `"refreshAccount should re-detect unknown site type and check-in support"`, after the `mockGetAccountSiteType` assertion, add:

```ts
    expect(mockGetSiteAdapter).toHaveBeenCalledWith("one-api")
```

- [ ] **Step 6: Add an assertion that known site type drives adapter selection**

In the test named `"refreshAccount should skip re-detection when site metadata is complete"`, after `expect(mockGetAccountSiteType).not.toHaveBeenCalled()`, add:

```ts
    expect(mockGetSiteAdapter).toHaveBeenCalledWith("one-api")
```

- [ ] **Step 7: Add a missing-capability regression test**

Add this test near the existing refresh-account tests, after `"refreshAccount should continue when check-in support detection throws"`:

```ts
  it("refreshAccount should persist an unhealthy state when account refresh is unsupported", async () => {
    const account = createAccount({
      id: "unsupported-refresh",
      site_url: "https://unsupported.example.com",
      site_type: "unsupported-site",
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
        siteStatus: {
          isCheckedInToday: false,
        },
      },
    })
    seedStorage([account])

    mockGetSiteAdapter.mockReturnValueOnce({
      siteType: "unsupported-site",
    })

    const result = await accountStorage.refreshAccount(
      "unsupported-refresh",
      true,
    )
    const updatedAccount = await accountStorage.getAccountById(
      "unsupported-refresh",
    )

    expect(result).toEqual(
      expect.objectContaining({
        refreshed: true,
      }),
    )
    expect(mockFetchSupportCheckIn).not.toHaveBeenCalled()
    expect(mockRefreshAccountData).not.toHaveBeenCalled()
    expect(updatedAccount?.health).toEqual({
      status: SiteHealthStatus.Unknown,
      reason: "accountRefresh is not implemented for unsupported-site",
      code: undefined,
    })
  })
```

- [ ] **Step 8: Run account storage test and verify the expected failure**

Run:

```bash
pnpm vitest --run tests/services/accountStorage.test.ts
```

Expected: FAIL because `accountStorage.refreshAccount(...)` still imports `getApiService(...)` and does not call `getSiteAdapter(...).accountRefresh`.

## Task 4: Migrate `accountStorage.refreshAccount(...)`

**Files:**
- Modify: `src/services/accounts/accountStorage.ts`
- Test: `tests/services/accountStorage.test.ts`

- [ ] **Step 1: Replace the refresh-path import**

In `src/services/accounts/accountStorage.ts`, remove:

```ts
import { getApiService } from "~/services/apiService"
```

Add:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import type { RefreshAccountResult } from "~/services/apiService/common/type"
```

- [ ] **Step 2: Add the missing-capability result helper**

After:

```ts
const logger = createLogger("AccountStorage")
```

add:

```ts
const createMissingAccountRefreshResult = (
  siteType: string,
): RefreshAccountResult => ({
  success: false,
  healthStatus: {
    status: SiteHealthStatus.Unknown,
    message: `accountRefresh is not implemented for ${siteType}`,
    code: undefined,
  },
})
```

- [ ] **Step 3: Resolve `accountRefresh` after auth is built**

Inside `refreshAccount(...)`, after the `auth` object is created, add:

```ts
      const accountRefresh = getSiteAdapter(account.site_type).accountRefresh
```

This should be placed before the `currentCheckIn` declaration.

- [ ] **Step 4: Replace check-in support probing**

Replace this block:

```ts
      try {
        const support = await getApiService(
          account.site_type,
        ).fetchSupportCheckIn({
          baseUrl,
          auth,
        })

        if (typeof support === "boolean") {
          checkInForRefresh = {
            ...checkInForRefresh,
            enableDetection: support,
          }
        }
      } catch (error) {
        logger.warn("Failed to determine check-in support", { baseUrl, error })
      }
```

with:

```ts
      if (accountRefresh?.fetchCheckInSupport) {
        try {
          const support = await accountRefresh.fetchCheckInSupport({
            baseUrl,
            auth,
          })

          if (typeof support === "boolean") {
            checkInForRefresh = {
              ...checkInForRefresh,
              enableDetection: support,
            }
          }
        } catch (error) {
          logger.warn("Failed to determine check-in support", {
            baseUrl,
            error,
          })
        }
      }
```

- [ ] **Step 5: Replace account data refresh**

Replace:

```ts
      // 刷新账号数据
      const result = await getApiService(account.site_type).refreshAccountData({
        baseUrl: account.site_url,
        accountId: account.id,
        checkIn: checkInForRefresh,
        auth,
        includeTodayCashflow,
      })
```

with:

```ts
      // 刷新账号数据
      const result = accountRefresh
        ? await accountRefresh.refreshAccount({
            baseUrl: account.site_url,
            accountId: account.id,
            checkIn: checkInForRefresh,
            auth,
            includeTodayCashflow,
          })
        : createMissingAccountRefreshResult(account.site_type)
```

- [ ] **Step 6: Run account storage test**

Run:

```bash
pnpm vitest --run tests/services/accountStorage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Confirm `accountStorage.ts` no longer imports `apiService`**

Run:

```bash
rg -n "getApiService|~/services/apiService" src/services/accounts/accountStorage.ts
```

Expected: no matches.

- [ ] **Step 8: Commit account storage migration**

Run:

```bash
git add src/services/accounts/accountStorage.ts tests/services/accountStorage.test.ts
git commit -m "refactor(account): route refresh through site adapters"
```

Expected: commit succeeds after the pre-commit hook runs `validate:staged`.

## Task 5: Final Validation And Diff Review

**Files:**
- Review all task-scoped files from Tasks 1-4.

- [ ] **Step 1: Run focused Adapter and account refresh tests**

Run:

```bash
pnpm vitest --run tests/services/apiAdapters/newApi/accountRefresh.test.ts tests/services/apiAdapters/sub2api/accountRefresh.test.ts tests/services/apiAdapters/aihubmix/accountRefresh.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accountStorage.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript compile**

Run:

```bash
pnpm compile
```

Expected: PASS.

- [ ] **Step 3: Run staged validation**

If there are staged files, run:

```bash
pnpm run validate:staged
```

Expected: PASS. If the command reformats files, inspect `git diff` and restage only task-scoped files.

- [ ] **Step 4: Run push gate**

Because this slice adds a shared exported Adapter contract and registry wiring, run:

```bash
pnpm run validate:push
```

Expected: PASS.

- [ ] **Step 5: Inspect the final diff**

Run:

```bash
git diff --stat HEAD~2..HEAD
git diff --name-status HEAD~2..HEAD
```

Expected: the diff is limited to:

```text
src/services/apiAdapters/contracts/accountRefresh.ts
src/services/apiAdapters/contracts/siteAdapter.ts
src/services/apiAdapters/newApi/accountRefresh.ts
src/services/apiAdapters/newApi/index.ts
src/services/apiAdapters/sub2api/accountRefresh.ts
src/services/apiAdapters/sub2api/index.ts
src/services/apiAdapters/aihubmix/accountRefresh.ts
src/services/apiAdapters/aihubmix/index.ts
src/services/accounts/accountStorage.ts
tests/services/apiAdapters/newApi/accountRefresh.test.ts
tests/services/apiAdapters/sub2api/accountRefresh.test.ts
tests/services/apiAdapters/aihubmix/accountRefresh.test.ts
tests/services/apiAdapters/registry.test.ts
tests/services/accountStorage.test.ts
```

- [ ] **Step 6: Check remaining direct account refresh facade usage**

Run:

```bash
rg -n "refreshAccountData\\(|fetchSupportCheckIn\\(" src/services/accounts src/features src/components
```

Expected: no `refreshAccountData(...)` or `fetchSupportCheckIn(...)` direct calls remain in `src/services/accounts/accountStorage.ts`. Other domains may still use the legacy facade and are outside this slice.

- [ ] **Step 7: Record execution notes**

Before handing off, report:

```text
Focused tests:
- pnpm vitest --run tests/services/apiAdapters/newApi/accountRefresh.test.ts tests/services/apiAdapters/sub2api/accountRefresh.test.ts tests/services/apiAdapters/aihubmix/accountRefresh.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accountStorage.test.ts

Validation:
- pnpm compile
- pnpm run validate:staged
- pnpm run validate:push

E2E decision:
- No Playwright E2E added. This slice changes service-layer routing and account-storage merge behavior covered by Vitest; browser runtime behavior is unchanged.

Telemetry decision:
- None. No new user-visible action, setting, async job, or analytics-worthy outcome is introduced; existing refresh behavior is rerouted behind an Adapter.
```
