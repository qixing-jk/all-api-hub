# API Adapter Account Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route manual account add/edit live account-data loading through `SiteAdapter.accountData` instead of the legacy `getApiService(...).fetchAccountData(...)` facade.

**Architecture:** Add a narrow `accountData` Adapter capability for raw `AccountData` snapshots. Provider Adapters delegate to existing backend implementations, while `accountOperations` keeps product persistence, fallback, timeout, and health semantics.

**Tech Stack:** TypeScript, WXT, Vitest, pnpm, existing `src/services/apiAdapters/**` patterns.

---

## File Structure

Create:

- `src/services/apiAdapters/contracts/accountData.ts`
  - Defines the `AccountDataCapability` Interface.
- `src/services/apiAdapters/newApi/accountData.ts`
  - New API-family Adapter implementation, delegating to `getApiService(siteType).fetchAccountData(...)`.
- `src/services/apiAdapters/sub2api/accountData.ts`
  - Sub2API Adapter implementation, delegating to `~/services/apiService/sub2api.fetchAccountData`.
- `src/services/apiAdapters/aihubmix/accountData.ts`
  - AIHubMix Adapter implementation, delegating to `~/services/apiService/aihubmix.fetchAccountData`.
- `tests/services/apiAdapters/accountData.test.ts`
  - Adapter delegation tests for New API-family, Sub2API, and AIHubMix.

Modify:

- `src/services/apiAdapters/contracts/siteAdapter.ts`
  - Adds optional `accountData?: AccountDataCapability`.
- `src/services/apiAdapters/newApi/index.ts`
  - Attaches `createNewApiAccountData(siteType)`.
- `src/services/apiAdapters/sub2api/index.ts`
  - Attaches `sub2ApiAccountData`.
- `src/services/apiAdapters/aihubmix/index.ts`
  - Attaches `aihubmixAccountData`.
- `tests/services/apiAdapters/registry.test.ts`
  - Verifies Adapter registry exposes `accountData` for supported site types.
- `tests/services/accountOperations.validateAndSaveAccount.test.ts`
  - Migrates mocks from `getApiService(...).fetchAccountData` to `getSiteAdapter(...).accountData.fetchData`.
  - Keeps manual save/update behavior assertions.
- `tests/services/accountOperations.test.ts`
  - Migrates validate-update tests to Adapter-based account-data mocks.
- `src/services/accounts/accountOperations.ts`
  - Imports `getSiteAdapter` and `AccountDataCapability`.
  - Adds `requireAccountDataCapability(...)`.
  - Routes `validateAndSaveAccount(...)` and `validateAndUpdateAccount(...)` through the Adapter capability.

Do not modify:

- `src/services/accounts/accountStorage.ts`
  - Saved-account refresh already uses `accountRefresh`; do not route it through `accountData`.
- `src/services/apiService/**`
  - Existing backend implementations remain the delegated implementation.
- `src/services/apiAdapters/contracts/accountRefresh.ts`
  - Keep saved refresh separate from manual add/edit live data loading.
- locale files, telemetry files, settings search files, Playwright tests.

---

### Task 1: Add Account Data Adapter Capability

**Files:**

- Create: `tests/services/apiAdapters/accountData.test.ts`
- Create: `src/services/apiAdapters/contracts/accountData.ts`
- Create: `src/services/apiAdapters/newApi/accountData.ts`
- Create: `src/services/apiAdapters/sub2api/accountData.ts`
- Create: `src/services/apiAdapters/aihubmix/accountData.ts`

- [ ] **Step 1: Write the failing Adapter delegation tests**

Create `tests/services/apiAdapters/accountData.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { aihubmixAccountData } from "~/services/apiAdapters/aihubmix/accountData"
import { createNewApiAccountData } from "~/services/apiAdapters/newApi/accountData"
import { sub2ApiAccountData } from "~/services/apiAdapters/sub2api/accountData"
import type { AccountData } from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"

const {
  mockAihubmixFetchAccountData,
  mockFetchAccountData,
  mockGetApiService,
  mockSub2ApiFetchAccountData,
} = vi.hoisted(() => ({
  mockAihubmixFetchAccountData: vi.fn(),
  mockFetchAccountData: vi.fn(),
  mockGetApiService: vi.fn(),
  mockSub2ApiFetchAccountData: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: mockGetApiService,
}))

vi.mock("~/services/apiService/sub2api", () => ({
  fetchAccountData: mockSub2ApiFetchAccountData,
}))

vi.mock("~/services/apiService/aihubmix", () => ({
  fetchAccountData: mockAihubmixFetchAccountData,
}))

const request = {
  baseUrl: "https://api.example.invalid",
  accountId: "account-1",
  checkIn: {
    enableDetection: true,
    autoCheckInEnabled: true,
    siteStatus: {
      isCheckedInToday: false,
    },
  },
  includeTodayCashflow: false,
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    accessToken: "account-token",
  },
}

const accountData: AccountData = {
  quota: 123,
  today_prompt_tokens: 1,
  today_completion_tokens: 2,
  today_quota_consumption: 3,
  today_requests_count: 4,
  today_income: 5,
  checkIn: request.checkIn,
}

const disabledCheckInAccountData: AccountData = {
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
}

describe("apiAdapter accountData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiService.mockReturnValue({
      fetchAccountData: mockFetchAccountData,
    })
  })

  it("delegates New API-family account data through the site-specific apiService", async () => {
    mockFetchAccountData.mockResolvedValueOnce(accountData)

    const accountDataCapability = createNewApiAccountData(SITE_TYPES.ONE_HUB)

    expect(mockGetApiService).not.toHaveBeenCalled()

    await expect(accountDataCapability.fetchData(request)).resolves.toBe(
      accountData,
    )

    expect(mockGetApiService).toHaveBeenCalledOnce()
    expect(mockGetApiService).toHaveBeenCalledWith(SITE_TYPES.ONE_HUB)
    expect(mockFetchAccountData).toHaveBeenCalledOnce()
    expect(mockFetchAccountData).toHaveBeenCalledWith(request)
  })

  it("delegates Sub2API account data without reshaping disabled check-in or zeroed stats", async () => {
    mockSub2ApiFetchAccountData.mockResolvedValueOnce(disabledCheckInAccountData)

    await expect(sub2ApiAccountData.fetchData(request)).resolves.toBe(
      disabledCheckInAccountData,
    )

    expect(mockGetApiService).not.toHaveBeenCalled()
    expect(mockSub2ApiFetchAccountData).toHaveBeenCalledOnce()
    expect(mockSub2ApiFetchAccountData).toHaveBeenCalledWith(request)
  })

  it("delegates AIHubMix account data without reshaping disabled check-in or zeroed fields", async () => {
    mockAihubmixFetchAccountData.mockResolvedValueOnce(disabledCheckInAccountData)

    await expect(aihubmixAccountData.fetchData(request)).resolves.toBe(
      disabledCheckInAccountData,
    )

    expect(mockGetApiService).not.toHaveBeenCalled()
    expect(mockAihubmixFetchAccountData).toHaveBeenCalledOnce()
    expect(mockAihubmixFetchAccountData).toHaveBeenCalledWith(request)
  })
})
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/accountData.test.ts
```

Expected: FAIL with missing module errors for one or more of:

- `~/services/apiAdapters/aihubmix/accountData`
- `~/services/apiAdapters/newApi/accountData`
- `~/services/apiAdapters/sub2api/accountData`

- [ ] **Step 3: Add the accountData contract**

Create `src/services/apiAdapters/contracts/accountData.ts`:

```ts
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/apiService/common/type"

export type AccountDataRequest = ApiServiceAccountRequest

export type AccountDataCapability = {
  fetchData(request: AccountDataRequest): Promise<AccountData>
}
```

- [ ] **Step 4: Add the New API-family Adapter**

Create `src/services/apiAdapters/newApi/accountData.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { getApiService } from "~/services/apiService"

/**
 * Create account-data loading bound to the New API-family site type.
 */
export function createNewApiAccountData(
  siteType: AccountSiteType,
): AccountDataCapability {
  return {
    fetchData: (request) => getApiService(siteType).fetchAccountData(request),
  }
}
```

- [ ] **Step 5: Add the Sub2API Adapter**

Create `src/services/apiAdapters/sub2api/accountData.ts`:

```ts
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchAccountData } from "~/services/apiService/sub2api"

export const sub2ApiAccountData: AccountDataCapability = {
  fetchData: (request) => fetchAccountData(request),
}
```

- [ ] **Step 6: Add the AIHubMix Adapter**

Create `src/services/apiAdapters/aihubmix/accountData.ts`:

```ts
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { fetchAccountData } from "~/services/apiService/aihubmix"

export const aihubmixAccountData: AccountDataCapability = {
  fetchData: (request) => fetchAccountData(request),
}
```

- [ ] **Step 7: Run the Adapter delegation test**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/accountData.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

Run:

```powershell
git status --short
git add src/services/apiAdapters/contracts/accountData.ts src/services/apiAdapters/newApi/accountData.ts src/services/apiAdapters/sub2api/accountData.ts src/services/apiAdapters/aihubmix/accountData.ts tests/services/apiAdapters/accountData.test.ts
git commit -m "refactor(api-adapters): add account data capability"
```

Expected: commit succeeds after staged validation.

---

### Task 2: Register Account Data On Site Adapters

**Files:**

- Modify: `src/services/apiAdapters/contracts/siteAdapter.ts`
- Modify: `src/services/apiAdapters/newApi/index.ts`
- Modify: `src/services/apiAdapters/sub2api/index.ts`
- Modify: `src/services/apiAdapters/aihubmix/index.ts`
- Test: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Write failing registry expectations**

Modify `tests/services/apiAdapters/registry.test.ts`.

In the Sub2API test, after the `accountRefresh` expectation, add:

```ts
expect(adapter.accountData).toEqual({
  fetchData: expect.any(Function),
})
```

In the New API-family loop, after the `accountRefresh` expectation, add:

```ts
expect(adapter.accountData).toEqual({
  fetchData: expect.any(Function),
})
```

In the AIHubMix test, after the `accountRefresh` expectation, add:

```ts
expect(adapter.accountData).toEqual({
  fetchData: expect.any(Function),
})
```

- [ ] **Step 2: Run registry tests to verify they fail**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/registry.test.ts
```

Expected: FAIL because `adapter.accountData` is `undefined`.

- [ ] **Step 3: Extend the SiteAdapter Interface**

Modify `src/services/apiAdapters/contracts/siteAdapter.ts`.

Add the import:

```ts
import type { AccountDataCapability } from "./accountData"
```

Add the optional property before `accountCompletion`:

```ts
  accountData?: AccountDataCapability
```

The final type should include this group:

```ts
  modelPricing?: ModelPricingCapability
  accountData?: AccountDataCapability
  accountCompletion?: AccountCompletionCapability
  keyManagement?: KeyManagementCapability
  accountRefresh?: AccountRefreshCapability
```

- [ ] **Step 4: Attach accountData to the New API-family Adapter**

Modify `src/services/apiAdapters/newApi/index.ts`.

Add the import:

```ts
import { createNewApiAccountData } from "./accountData"
```

Add the property in `createNewApiAdapter(...)`:

```ts
  accountData: createNewApiAccountData(siteType),
```

Place it near the other account capabilities:

```ts
  siteNotice: newApiSiteNotice,
  accountData: createNewApiAccountData(siteType),
  accountCompletion: newApiAccountCompletion,
  keyManagement: createNewApiKeyManagement(siteType),
```

- [ ] **Step 5: Attach accountData to the Sub2API Adapter**

Modify `src/services/apiAdapters/sub2api/index.ts`.

Add the import:

```ts
import { sub2ApiAccountData } from "./accountData"
```

Add the property:

```ts
  accountData: sub2ApiAccountData,
```

Place it before `accountCompletion`:

```ts
  siteAnnouncements: sub2ApiSiteAnnouncements,
  modelCatalog: sub2ApiModelCatalog,
  accountData: sub2ApiAccountData,
  accountCompletion: sub2ApiAccountCompletion,
```

- [ ] **Step 6: Attach accountData to the AIHubMix Adapter**

Modify `src/services/apiAdapters/aihubmix/index.ts`.

Add the import:

```ts
import { aihubmixAccountData } from "./accountData"
```

Add the property:

```ts
  accountData: aihubmixAccountData,
```

Place it before `accountCompletion`:

```ts
export const aihubmixAdapter: SiteAdapter = {
  siteType: SITE_TYPES.AIHUBMIX,
  accountData: aihubmixAccountData,
  accountCompletion: aihubmixAccountCompletion,
  keyManagement: aihubmixKeyManagement,
  accountRefresh: aihubmixAccountRefresh,
  modelPricing: aihubmixModelPricing,
}
```

- [ ] **Step 7: Run Adapter and registry tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/accountData.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

Run:

```powershell
git status --short
git add src/services/apiAdapters/contracts/siteAdapter.ts src/services/apiAdapters/newApi/index.ts src/services/apiAdapters/sub2api/index.ts src/services/apiAdapters/aihubmix/index.ts tests/services/apiAdapters/registry.test.ts
git commit -m "refactor(api-adapters): register account data adapters"
```

Expected: commit succeeds after staged validation.

---

### Task 3: Route validateAndSaveAccount Through accountData

**Files:**

- Modify: `tests/services/accountOperations.validateAndSaveAccount.test.ts`
- Modify: `src/services/accounts/accountOperations.ts`

- [ ] **Step 1: Add getSiteAdapter test mock alongside the legacy apiService mock**

Modify the top of `tests/services/accountOperations.validateAndSaveAccount.test.ts`.

Replace:

```ts
const { fetchAccountDataMock, ensureDefaultApiTokenForAccountMock } =
  vi.hoisted(() => ({
    fetchAccountDataMock: vi.fn(),
    ensureDefaultApiTokenForAccountMock: vi.fn(),
  }))
```

with:

```ts
const {
  fetchAccountDataMock,
  getApiServiceMock,
  getSiteAdapterMock,
  ensureDefaultApiTokenForAccountMock,
} =
  vi.hoisted(() => ({
    fetchAccountDataMock: vi.fn(),
    getApiServiceMock: vi.fn(),
    getSiteAdapterMock: vi.fn(),
    ensureDefaultApiTokenForAccountMock: vi.fn(),
  }))
```

Then change the `~/services/apiService` mock from:

```ts
vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    fetchAccountData: fetchAccountDataMock,
  })),
}))
```

to:

```ts
vi.mock("~/services/apiService", () => ({
  getApiService: getApiServiceMock,
}))
```

Then add a separate Adapter registry mock:

```ts
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: getSiteAdapterMock,
}))
```

In the `beforeEach`, after the preferences spy, add:

```ts
    getApiServiceMock.mockReturnValue({
      fetchAccountData: fetchAccountDataMock,
    })
    getSiteAdapterMock.mockReturnValue({
      accountData: {
        fetchData: fetchAccountDataMock,
      },
    })
```

Keep the legacy `getApiServiceMock` in this file during Task 3 because this
same file still contains update-path tests. Those update-path tests should keep
passing until Task 4 migrates `validateAndUpdateAccount(...)`.

- [ ] **Step 2: Update direct mock assertions in the save/update test file**

In `tests/services/accountOperations.validateAndSaveAccount.test.ts`, update assertions that currently inspect `getApiService`.

In `"normalizes unsupported site types before saving"`, replace:

```ts
const { getApiService } = await import("~/services/apiService")
```

with:

```ts
const { getSiteAdapter } = await import("~/services/apiAdapters/registry")
```

And replace:

```ts
expect(getApiService).toHaveBeenCalledWith(SITE_TYPES.UNKNOWN)
```

with:

```ts
expect(getSiteAdapter).toHaveBeenCalledWith(SITE_TYPES.UNKNOWN)
```

Keep all `fetchAccountDataMock` request-shape assertions unchanged in this task. They should still fail until production code calls `accountData.fetchData(...)`.

- [ ] **Step 3: Add a missing-capability fallback save test**

In `tests/services/accountOperations.validateAndSaveAccount.test.ts`, add this test inside `describe("accountOperations validateAndSaveAccount", () => { ... })` after `"saves a warning-only Sub2API account when remote data refresh fails"`:

```ts
  it("saves warning-only account data when accountData capability is missing", async () => {
    getSiteAdapterMock.mockReturnValueOnce({})

    const result = await validateAndSaveAccount(
      "https://unsupported.example.com",
      "Unsupported Portal",
      "tester",
      "token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result).toMatchObject({
      success: true,
      message: "messages:warnings.accountSavedWithoutDataRefresh",
      feedbackLevel: "warning",
    })
    expect(fetchAccountDataMock).not.toHaveBeenCalled()

    const saved = await accountStorage.getAccountById(result.accountId!)
    expect(saved).toMatchObject({
      site_name: "Unsupported Portal",
      health: {
        status: SiteHealthStatus.Warning,
        reason: "accountData is not implemented for new-api",
      },
      account_info: {
        id: "1",
        username: "tester",
        access_token: "token",
        quota: 0,
      },
    })
  })
```

- [ ] **Step 4: Run save/update tests to verify they fail**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.validateAndSaveAccount.test.ts
```

Expected: FAIL because `accountOperations` still imports `getApiService(...)` and does not use `getSiteAdapter(...)`.

- [ ] **Step 5: Import Adapter registry and capability type**

Modify `src/services/accounts/accountOperations.ts`.

Add imports near the existing account/service imports:

```ts
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
```

Keep the existing `getApiService` import because other functions in the file still use it for unmigrated capabilities such as `fetchUserGroups(...)`, `fetchSiteStatus(...)`, and account completion helpers.

- [ ] **Step 6: Add the local capability guard**

In `src/services/accounts/accountOperations.ts`, add this helper near other small local helpers, before `validateAndSaveAccount(...)`:

```ts
const createMissingAccountDataCapabilityError = (siteType: string): Error =>
  new Error(`accountData is not implemented for ${siteType}`)

const requireAccountDataCapability = (
  siteType: string,
  accountData: AccountDataCapability | undefined,
): AccountDataCapability => {
  if (!accountData) {
    throw createMissingAccountDataCapabilityError(siteType)
  }

  return accountData
}
```

- [ ] **Step 7: Route validateAndSaveAccount live data loading through the Adapter**

In `validateAndSaveAccount(...)`, inside the non-deferred `try` block, replace:

```ts
    const freshAccountData = await withTimeout(
      getApiService(normalizedSiteType).fetchAccountData({
        baseUrl: requestBaseUrl,
        checkIn: checkInConfig,
        accountId: undefined, // New account, no ID yet
        includeTodayCashflow,
        auth: {
          authType,
          userId: accountIdentity,
          accessToken: accessToken.trim(),
          cookie:
            authType === AuthTypeEnum.Cookie
              ? sessionCookieHeader.trim()
              : undefined,
        },
      }),
      MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS,
      () =>
        createAccountDataFetchTimeoutError(
          MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS,
        ),
    )
```

with:

```ts
    const accountData = requireAccountDataCapability(
      normalizedSiteType,
      getSiteAdapter(normalizedSiteType).accountData,
    )
    const freshAccountData = await withTimeout(
      accountData.fetchData({
        baseUrl: requestBaseUrl,
        checkIn: checkInConfig,
        accountId: undefined, // New account, no ID yet
        includeTodayCashflow,
        auth: {
          authType,
          userId: accountIdentity,
          accessToken: accessToken.trim(),
          cookie:
            authType === AuthTypeEnum.Cookie
              ? sessionCookieHeader.trim()
              : undefined,
        },
      }),
      MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS,
      () =>
        createAccountDataFetchTimeoutError(
          MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS,
        ),
    )
```

- [ ] **Step 8: Run save/update tests**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.validateAndSaveAccount.test.ts
```

Expected: PASS. The update-path tests in this file should still pass because
the legacy `getApiServiceMock` remains available until Task 4 migrates
`validateAndUpdateAccount(...)`.

- [ ] **Step 9: Commit Task 3**

Run:

```powershell
git status --short
git add src/services/accounts/accountOperations.ts tests/services/accountOperations.validateAndSaveAccount.test.ts
git commit -m "refactor(account): use adapter account data on save"
```

Expected: commit succeeds after staged validation if only save-path changes are staged. If update-path test edits were required in the same file and cannot be split safely, include them in Task 4's commit instead of this one.

---

### Task 4: Route validateAndUpdateAccount Through accountData

**Files:**

- Modify: `tests/services/accountOperations.validateAndSaveAccount.test.ts`
- Modify: `tests/services/accountOperations.test.ts`
- Modify: `src/services/accounts/accountOperations.ts`

- [ ] **Step 1: Add a missing-capability fallback update test**

In `tests/services/accountOperations.validateAndSaveAccount.test.ts`, add this test near the existing update/deferred update tests:

```ts
  it("updates warning-only account data when accountData capability is missing", async () => {
    const accountId = await accountStorage.addAccount({
      site_name: "Old Example",
      site_url: "https://old.example.com",
      site_type: SITE_TYPES.NEW_API,
      health: { status: SiteHealthStatus.Healthy },
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      excludeFromTotalBalance: false,
      excludeFromTodayIncome: false,
      exchange_rate: 7,
      notes: "",
      tagIds: [],
      checkIn: CHECK_IN_DISABLED,
      account_info: {
        id: "previous-id",
        access_token: "old-token",
        username: "old-user",
        quota: 42,
        today_prompt_tokens: 1,
        today_completion_tokens: 2,
        today_quota_consumption: 3,
        today_requests_count: 4,
        today_income: 5,
      },
      last_sync_time: 123,
    })
    getSiteAdapterMock.mockReturnValueOnce({})

    const result = await validateAndUpdateAccount(
      accountId,
      "https://unsupported.example.com",
      "Unsupported Portal",
      "tester",
      "token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result).toMatchObject({
      success: true,
      message: "messages:warnings.accountUpdatedWithoutDataRefresh",
      feedbackLevel: "warning",
    })
    expect(fetchAccountDataMock).not.toHaveBeenCalled()

    const updated = await accountStorage.getAccountById(accountId)
    expect(updated).toMatchObject({
      site_name: "Unsupported Portal",
      health: {
        status: SiteHealthStatus.Warning,
        reason: "accountData is not implemented for new-api",
      },
      account_info: {
        id: "1",
        username: "tester",
        access_token: "token",
        quota: 0,
      },
    })
  })
```

- [ ] **Step 2: Migrate accountOperations.test.ts mocks to getSiteAdapter**

Modify the top of `tests/services/accountOperations.test.ts`.

Replace:

```ts
const { mockFetchAccountData, mockFetchSiteStatus, mockUpdateAccount } =
  vi.hoisted(() => ({
    mockFetchAccountData: vi.fn(),
    mockFetchSiteStatus: vi.fn(),
    mockUpdateAccount: vi.fn(),
  }))
```

with:

```ts
const {
  mockFetchAccountData,
  mockFetchSiteStatus,
  mockGetApiService,
  mockGetSiteAdapter,
  mockUpdateAccount,
} = vi.hoisted(() => ({
  mockFetchAccountData: vi.fn(),
  mockFetchSiteStatus: vi.fn(),
  mockGetApiService: vi.fn(),
  mockGetSiteAdapter: vi.fn(),
  mockUpdateAccount: vi.fn(),
}))
```

Replace the `~/services/apiService` mock with:

```ts
vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: mockGetApiService,
  }
})

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: mockGetSiteAdapter,
}))
```

In `beforeEach`, replace the existing resets with:

```ts
    mockFetchAccountData.mockReset()
    mockFetchSiteStatus.mockReset()
    mockGetApiService.mockReset()
    mockGetSiteAdapter.mockReset()
    mockUpdateAccount.mockReset()
    mockGetApiService.mockReturnValue({
      fetchSiteStatus: mockFetchSiteStatus,
    })
    mockGetSiteAdapter.mockReturnValue({
      accountData: {
        fetchData: mockFetchAccountData,
      },
    })
```

- [ ] **Step 3: Update accountOperations.test.ts site-type assertions**

In `"normalizes unsupported site types before updating"`, replace:

```ts
expect(vi.mocked(getApiService)).toHaveBeenCalledWith(SITE_TYPES.UNKNOWN)
```

with:

```ts
const { getSiteAdapter } = await import("~/services/apiAdapters/registry")
expect(vi.mocked(getSiteAdapter)).toHaveBeenCalledWith(SITE_TYPES.UNKNOWN)
```

Keep `getSiteName(...)` tests using `getApiService` unchanged. Those tests still verify site-status lookup and are not part of `accountData`.

- [ ] **Step 4: Run update tests to verify they fail**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.validateAndSaveAccount.test.ts tests/services/accountOperations.test.ts
```

Expected: FAIL because `validateAndUpdateAccount(...)` still calls `getApiService(...).fetchAccountData(...)`.

- [ ] **Step 5: Route validateAndUpdateAccount live data loading through the Adapter**

In `src/services/accounts/accountOperations.ts`, inside the non-deferred `validateAndUpdateAccount(...)` `try` block, replace:

```ts
    const freshAccountData = await getApiService(
      normalizedSiteType,
    ).fetchAccountData({
      baseUrl: requestBaseUrl,
      checkIn: checkInConfig,
      accountId,
      includeTodayCashflow,
      auth: {
        authType,
        userId: accountIdentity,
        accessToken: accessToken.trim(),
        cookie:
          authType === AuthTypeEnum.Cookie
            ? sessionCookieHeader.trim()
            : undefined,
      },
    })
```

with:

```ts
    const accountData = requireAccountDataCapability(
      normalizedSiteType,
      getSiteAdapter(normalizedSiteType).accountData,
    )
    const freshAccountData = await accountData.fetchData({
      baseUrl: requestBaseUrl,
      checkIn: checkInConfig,
      accountId,
      includeTodayCashflow,
      auth: {
        authType,
        userId: accountIdentity,
        accessToken: accessToken.trim(),
        cookie:
          authType === AuthTypeEnum.Cookie
            ? sessionCookieHeader.trim()
            : undefined,
      },
    })
```

- [ ] **Step 6: Run update tests**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.validateAndSaveAccount.test.ts tests/services/accountOperations.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run focused Adapter plus account operation tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/accountData.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accountOperations.validateAndSaveAccount.test.ts tests/services/accountOperations.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

Run:

```powershell
git status --short
git add src/services/accounts/accountOperations.ts tests/services/accountOperations.validateAndSaveAccount.test.ts tests/services/accountOperations.test.ts
git commit -m "refactor(account): use adapter account data on update"
```

Expected: commit succeeds after staged validation.

---

### Task 5: Final Validation And Diff Review

**Files:**

- Review all changed task files.
- No new implementation files should be added outside the paths listed in this plan.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/accountData.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accountOperations.validateAndSaveAccount.test.ts tests/services/accountOperations.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run type validation**

Run:

```powershell
pnpm compile
```

Expected: PASS.

- [ ] **Step 3: Run staged validation**

If there are any uncommitted task-scoped changes, stage only those files:

```powershell
git status --short
git add src/services/apiAdapters/contracts/accountData.ts src/services/apiAdapters/contracts/siteAdapter.ts src/services/apiAdapters/newApi/accountData.ts src/services/apiAdapters/newApi/index.ts src/services/apiAdapters/sub2api/accountData.ts src/services/apiAdapters/sub2api/index.ts src/services/apiAdapters/aihubmix/accountData.ts src/services/apiAdapters/aihubmix/index.ts src/services/accounts/accountOperations.ts tests/services/apiAdapters/accountData.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accountOperations.validateAndSaveAccount.test.ts tests/services/accountOperations.test.ts
pnpm run validate:staged
```

Expected: PASS. If all prior task commits succeeded and there is nothing staged, run `pnpm run validate:staged` only after staging the remaining task-scoped files.

- [ ] **Step 4: Run push gate**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff**

Run:

```powershell
git status --short --branch
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Expected changed files are limited to:

```text
src/services/apiAdapters/contracts/accountData.ts
src/services/apiAdapters/contracts/siteAdapter.ts
src/services/apiAdapters/newApi/accountData.ts
src/services/apiAdapters/newApi/index.ts
src/services/apiAdapters/sub2api/accountData.ts
src/services/apiAdapters/sub2api/index.ts
src/services/apiAdapters/aihubmix/accountData.ts
src/services/apiAdapters/aihubmix/index.ts
src/services/accounts/accountOperations.ts
tests/services/apiAdapters/accountData.test.ts
tests/services/apiAdapters/registry.test.ts
tests/services/accountOperations.validateAndSaveAccount.test.ts
tests/services/accountOperations.test.ts
```

Existing unrelated untracked local files may still appear in `git status`; do not stage or delete them.

- [ ] **Step 6: If final task-scoped changes remain uncommitted, commit them**

Run:

```powershell
git status --short
git add src/services/apiAdapters/contracts/accountData.ts src/services/apiAdapters/contracts/siteAdapter.ts src/services/apiAdapters/newApi/accountData.ts src/services/apiAdapters/newApi/index.ts src/services/apiAdapters/sub2api/accountData.ts src/services/apiAdapters/sub2api/index.ts src/services/apiAdapters/aihubmix/accountData.ts src/services/apiAdapters/aihubmix/index.ts src/services/accounts/accountOperations.ts tests/services/apiAdapters/accountData.test.ts tests/services/apiAdapters/registry.test.ts tests/services/accountOperations.validateAndSaveAccount.test.ts tests/services/accountOperations.test.ts
git commit -m "refactor(account): route account data through adapters"
```

Expected: commit succeeds. Skip this step if Tasks 1-4 already committed all task-scoped changes.

---

## Implementation Notes

- Keep `getApiService` imported in `accountOperations.ts`; this slice only migrates manual add/edit `fetchAccountData(...)`.
- Missing `accountData` capability must be thrown inside the existing live-load `try` blocks so the existing fallback save/update behavior handles it.
- Do not add user-facing copy for missing `accountData`.
- Do not modify `accountStorage.refreshAccount(...)`; that path intentionally uses `accountRefresh`.
- Use placeholder domains such as `example.invalid` in new tests.
- If `validate:staged` or commit hooks format files, inspect `git diff --cached` before retrying or committing.
