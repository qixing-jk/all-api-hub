# Account Completion Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-17-account-completion-adapter-design.md`

**Goal:** Move account auto-detect completion rules behind `getSiteAdapter(siteType).accountCompletion` while preserving the current `autoDetectAccount(...)` response behavior.

**Architecture:** Add a narrow `accountCompletion` capability to `src/services/apiAdapters`. New API-family, Sub2API, and AIHubMix Adapters own site-specific completion rules; `completeAutoDetectedAccount(...)` stays the product-level orchestrator for fetch-context validation, helper creation, and final response data assembly.

**Tech Stack:** TypeScript, Vitest, existing `apiAdapters`, existing account auto-detect completion tests, `pnpm run validate:staged`.

---

## File Structure

- Create `src/services/apiAdapters/contracts/accountCompletion.ts`
  - Defines the Adapter Interface for account auto-detect completion.
- Modify `src/services/apiAdapters/contracts/siteAdapter.ts`
  - Adds optional `accountCompletion`.
- Create `src/services/apiAdapters/newApi/accountCompletion.ts`
  - Implements compatible New API-family account completion.
- Modify `src/services/apiAdapters/newApi/index.ts`
  - Exposes the New API-family completion capability.
- Create `src/services/apiAdapters/sub2api/accountCompletion.ts`
  - Implements Sub2API account completion.
- Modify `src/services/apiAdapters/sub2api/index.ts`
  - Exposes the Sub2API completion capability.
- Create `src/services/apiAdapters/aihubmix/accountCompletion.ts`
  - Implements AIHubMix account completion.
- Create `src/services/apiAdapters/aihubmix/index.ts`
  - Exposes the AIHubMix Adapter with only `accountCompletion`.
- Modify `src/services/apiAdapters/registry.ts`
  - Returns AIHubMix Adapter and verifies completion capability support.
- Create `tests/services/apiAdapters/newApi/accountCompletion.test.ts`
  - Covers compatible-site completion rules.
- Create `tests/services/apiAdapters/sub2api/accountCompletion.test.ts`
  - Covers Sub2API completion rules.
- Create `tests/services/apiAdapters/aihubmix/accountCompletion.test.ts`
  - Covers AIHubMix completion rules.
- Modify `tests/services/apiAdapters/registry.test.ts`
  - Covers registry-visible `accountCompletion`.
- Modify `src/services/accounts/autoDetectCompletion/completion.ts`
  - Routes completion through `getSiteAdapter(siteType).accountCompletion`.
- Modify `tests/services/accounts/autoDetectCompletion/completion.test.ts`
  - Covers the orchestrator and missing capability behavior.
- Keep `tests/services/accountOperations.autoDetectAccount.test.ts`
  - Existing broad workflow contract remains green.

---

## Task 1: Add Account Completion Contract And New API-Family Adapter

**Files:**
- Create: `src/services/apiAdapters/contracts/accountCompletion.ts`
- Modify: `src/services/apiAdapters/contracts/siteAdapter.ts`
- Create: `src/services/apiAdapters/newApi/accountCompletion.ts`
- Modify: `src/services/apiAdapters/newApi/index.ts`
- Create: `tests/services/apiAdapters/newApi/accountCompletion.test.ts`
- Modify: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Write the failing New API-family Adapter test**

Create `tests/services/apiAdapters/newApi/accountCompletion.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

import {
  AUTO_DETECT_FAILURE_REASONS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { newApiAccountCompletion } from "~/services/apiAdapters/newApi/accountCompletion"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiService/common/type"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"

const {
  getApiServiceMock,
  fetchUserInfoMock,
  getOrCreateAccessTokenMock,
  fetchSiteStatusMock,
  fetchSupportCheckInMock,
  extractDefaultExchangeRateMock,
} = vi.hoisted(() => ({
  getApiServiceMock: vi.fn(),
  fetchUserInfoMock: vi.fn(),
  getOrCreateAccessTokenMock: vi.fn(),
  fetchSiteStatusMock: vi.fn(),
  fetchSupportCheckInMock: vi.fn(),
  extractDefaultExchangeRateMock: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: getApiServiceMock,
}))

const createServiceRequest = (input: {
  baseUrl: string
  auth: ApiServiceRequest["auth"]
  context: {
    fetchContext?: ApiServiceRequest["fetchContext"]
  }
}): ApiServiceRequest => ({
  baseUrl: input.baseUrl,
  auth: input.auth,
  ...(input.context.fetchContext
    ? { fetchContext: input.context.fetchContext }
    : {}),
})

const helpers = {
  createServiceRequest,
  fetchSiteName: vi.fn(async (siteStatus: { system_name?: string } | null) =>
    siteStatus?.system_name ? siteStatus.system_name : "Example",
  ),
  createCompletionError: (reason: string, cause: unknown) =>
    Object.assign(new Error(cause instanceof Error ? cause.message : reason), {
      name: "AutoDetectCompletionError",
      reason,
      cause,
    }),
  trimString: (value: unknown) =>
    typeof value === "string" ? value.trim() : "",
  createInitialCheckInConfig: (input: {
    enableDetection: boolean
    autoCheckInEnabled: boolean
  }) => ({
    enableDetection: input.enableDetection,
    autoCheckInEnabled: input.autoCheckInEnabled,
    siteStatus: {
      isCheckedInToday: false,
    },
    customCheckIn: {
      url: "",
      redeemUrl: "",
      openRedeemWithCheckIn: true,
      isCheckedInToday: false,
    },
  }),
  handleCheckInSupportFetchFailure: vi.fn(() => false),
}

const fetchContext = {
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
  tabId: 1,
  origin: "https://new.example.com",
}

const mockService = () => {
  getApiServiceMock.mockReturnValue({
    fetchUserInfo: fetchUserInfoMock,
    getOrCreateAccessToken: getOrCreateAccessTokenMock,
    fetchSiteStatus: fetchSiteStatusMock,
    fetchSupportCheckIn: fetchSupportCheckInMock,
    extractDefaultExchangeRate: extractDefaultExchangeRateMock,
  })
}

describe("newApiAccountCompletion", () => {
  it("completes access-token accounts through getOrCreateAccessToken", async () => {
    mockService()
    const siteStatus = {
      system_name: "Status Portal",
      checkin_enabled: true,
    }
    getOrCreateAccessTokenMock.mockResolvedValueOnce({
      username: "  service-user  ",
      access_token: "  service-token  ",
    })
    fetchSiteStatusMock.mockResolvedValueOnce(siteStatus)
    extractDefaultExchangeRateMock.mockReturnValueOnce(6.8)

    await expect(
      newApiAccountCompletion.complete(
        {
          url: "https://new.example.com",
          requestedAuthType: AuthTypeEnum.AccessToken,
          context: { fetchContext },
          autoDetectContext: {
            strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
            siteType: SITE_TYPES.NEW_API,
          },
          detected: {
            userId: "7",
            siteType: SITE_TYPES.NEW_API,
            fetchContext,
          },
        },
        helpers,
      ),
    ).resolves.toMatchObject({
      username: "service-user",
      siteName: "Status Portal",
      accessToken: "service-token",
      userId: "7",
      exchangeRate: 6.8,
      authType: AuthTypeEnum.AccessToken,
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
      },
    })

    expect(getApiServiceMock).toHaveBeenCalledWith(SITE_TYPES.NEW_API)
    expect(getOrCreateAccessTokenMock).toHaveBeenCalledWith({
      baseUrl: "https://new.example.com",
      fetchContext,
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "7",
      },
    })
    expect(fetchUserInfoMock).not.toHaveBeenCalled()
    expect(fetchSiteStatusMock).toHaveBeenCalledWith({
      baseUrl: "https://new.example.com",
      fetchContext,
      auth: {
        authType: AuthTypeEnum.AccessToken,
      },
    })
    expect(fetchSupportCheckInMock).not.toHaveBeenCalled()
    expect(extractDefaultExchangeRateMock).toHaveBeenCalledWith(siteStatus)
  })

  it("completes cookie accounts through fetchUserInfo and support probing", async () => {
    mockService()
    fetchUserInfoMock.mockResolvedValueOnce({
      username: "cookie-user",
      access_token: "",
    })
    fetchSiteStatusMock.mockResolvedValueOnce({
      system_name: "Cookie Portal",
    })
    fetchSupportCheckInMock.mockResolvedValueOnce(true)
    extractDefaultExchangeRateMock.mockReturnValueOnce(null)

    const result = await newApiAccountCompletion.complete(
      {
        url: "https://cookie.example.com",
        requestedAuthType: AuthTypeEnum.Cookie,
        context: {},
        detected: {
          userId: "8",
          siteType: SITE_TYPES.ONE_API,
        },
      },
      helpers,
    )

    expect(result).toMatchObject({
      username: "cookie-user",
      accessToken: "",
      authType: AuthTypeEnum.Cookie,
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
      },
    })
    expect(fetchUserInfoMock).toHaveBeenCalledWith({
      baseUrl: "https://cookie.example.com",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "8",
      },
    })
    expect(fetchSupportCheckInMock).toHaveBeenCalledWith({
      baseUrl: "https://cookie.example.com",
      auth: {
        authType: AuthTypeEnum.None,
      },
    })
  })

  it("classifies missing username and access token", async () => {
    mockService()
    getOrCreateAccessTokenMock.mockResolvedValueOnce({
      username: "  ",
      access_token: "  ",
    })
    fetchSiteStatusMock.mockResolvedValueOnce({
      system_name: "Broken Portal",
      checkin_enabled: false,
    })
    extractDefaultExchangeRateMock.mockReturnValueOnce(null)

    await expect(
      newApiAccountCompletion.complete(
        {
          url: "https://broken.example.com",
          requestedAuthType: AuthTypeEnum.AccessToken,
          context: {},
          detected: {
            userId: "9",
            siteType: SITE_TYPES.NEW_API,
          },
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    })
  })
})
```

- [ ] **Step 2: Update registry tests for New API-family capability**

In `tests/services/apiAdapters/registry.test.ts`, inside the New API-family loop, add:

```ts
expect(adapter.accountCompletion).toEqual({
  complete: expect.any(Function),
})
```

Keep the AIHubMix and Sub2API assertions unchanged in this task.

- [ ] **Step 3: Run the failing tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: FAIL because `newApi/accountCompletion.ts` and the `accountCompletion` contract do not exist yet.

- [ ] **Step 4: Add the account completion contract**

Create `src/services/apiAdapters/contracts/accountCompletion.ts`:

```ts
import type { AutoDetectFailureReason } from "~/constants/autoDetect"
import type {
  AutoDetectCompletionData,
  AutoDetectCompletionRequest,
} from "~/services/accounts/autoDetectCompletion/types"
import type {
  ApiServiceFetchContext,
  ApiServiceRequest,
  SiteStatusInfo,
} from "~/services/apiService/common/type"

export type AccountCompletionRuntimeContext = {
  fetchContext?: ApiServiceFetchContext
}

export type AccountCompletionServiceRequestInput = {
  baseUrl: string
  auth: ApiServiceRequest["auth"]
  context: AccountCompletionRuntimeContext
}

export type AccountCompletionAdapterRequest = AutoDetectCompletionRequest & {
  context: AccountCompletionRuntimeContext
}

export type AccountCompletionAdapterResult = Omit<
  AutoDetectCompletionData,
  "siteType" | "fetchContext" | "autoDetectContext"
>

export type AccountCompletionHelpers = {
  createServiceRequest(
    input: AccountCompletionServiceRequestInput,
  ): ApiServiceRequest
  fetchSiteName(siteStatus: SiteStatusInfo | null): Promise<string>
  createCompletionError(reason: AutoDetectFailureReason, cause: unknown): Error
  trimString(value: unknown): string
  createInitialCheckInConfig(input: {
    enableDetection: boolean
    autoCheckInEnabled: boolean
  }): AutoDetectCompletionData["checkIn"]
  handleCheckInSupportFetchFailure(error: unknown): false
}

export type AccountCompletionCapability = {
  complete(
    request: AccountCompletionAdapterRequest,
    helpers: AccountCompletionHelpers,
  ): Promise<AccountCompletionAdapterResult>
}
```

- [ ] **Step 5: Extend the SiteAdapter contract**

In `src/services/apiAdapters/contracts/siteAdapter.ts`, add:

```ts
import type { AccountCompletionCapability } from "./accountCompletion"
```

Then add this property to `SiteAdapter`:

```ts
  accountCompletion?: AccountCompletionCapability
```

- [ ] **Step 6: Implement New API-family account completion**

Create `src/services/apiAdapters/newApi/accountCompletion.ts`:

```ts
import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { UI_CONSTANTS } from "~/constants/ui"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"

import type {
  AccountCompletionAdapterRequest,
  AccountCompletionCapability,
  AccountCompletionHelpers,
} from "../contracts/accountCompletion"

const readTokenInfo = (value: unknown) =>
  value && typeof value === "object"
    ? (value as { username?: unknown; access_token?: unknown })
    : {}

const fetchTokenInfo = async (
  request: AccountCompletionAdapterRequest,
  helpers: AccountCompletionHelpers,
) => {
  const service = getApiService(request.detected.siteType)
  const { url, requestedAuthType, detected, context } = request

  if (requestedAuthType === AuthTypeEnum.Cookie) {
    return await service.fetchUserInfo(
      helpers.createServiceRequest({
        baseUrl: url,
        context,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: detected.userId,
        },
      }),
    )
  }

  if (requestedAuthType === AuthTypeEnum.AccessToken) {
    return await service.getOrCreateAccessToken(
      helpers.createServiceRequest({
        baseUrl: url,
        context,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: detected.userId,
        },
      }),
    )
  }

  return null
}

export const newApiAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const service = getApiService(request.detected.siteType)
    const { url, requestedAuthType, context } = request

    let tokenInfo: unknown
    try {
      tokenInfo = await fetchTokenInfo(request, helpers)
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
        error,
      )
    }

    let siteStatus = null
    try {
      siteStatus = await service.fetchSiteStatus(
        helpers.createServiceRequest({
          baseUrl: url,
          context,
          auth: {
            authType: requestedAuthType || AuthTypeEnum.None,
          },
        }),
      )
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
        error,
      )
    }

    const checkSupport =
      typeof siteStatus?.checkin_enabled === "boolean"
        ? siteStatus.checkin_enabled
        : await service
            .fetchSupportCheckIn(
              helpers.createServiceRequest({
                baseUrl: url,
                context,
                auth: {
                  authType: AuthTypeEnum.None,
                },
              }),
            )
            .catch(helpers.handleCheckInSupportFetchFailure)

    const tokenData = readTokenInfo(tokenInfo)
    const username = helpers.trimString(tokenData.username)
    const accessToken = helpers.trimString(tokenData.access_token)
    const isAccessTokenMissing =
      requestedAuthType === AuthTypeEnum.AccessToken && !accessToken

    if (!username || isAccessTokenMissing) {
      throw helpers.createCompletionError(
        isAccessTokenMissing
          ? AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing
          : AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
        new Error(
          isAccessTokenMissing
            ? "access token missing"
            : "username missing",
        ),
      )
    }

    return {
      username,
      siteName: await helpers.fetchSiteName(siteStatus),
      accessToken,
      userId: request.detected.userId.toString(),
      exchangeRate:
        service.extractDefaultExchangeRate(siteStatus) ??
        UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: requestedAuthType,
      checkIn: helpers.createInitialCheckInConfig({
        enableDetection: checkSupport ?? false,
        autoCheckInEnabled: true,
      }),
    }
  },
}
```

- [ ] **Step 7: Expose New API-family account completion**

In `src/services/apiAdapters/newApi/index.ts`, add:

```ts
import { newApiAccountCompletion } from "./accountCompletion"
```

Then update `newApiAdapter`:

```ts
export const newApiAdapter: SiteAdapter = {
  siteType: SITE_TYPES.NEW_API,
  family: "newApiFamily",
  siteNotice: newApiSiteNotice,
  accountCompletion: newApiAccountCompletion,
}
```

- [ ] **Step 8: Run the New API-family Adapter tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Run:

```powershell
git status --porcelain
git add src/services/apiAdapters/contracts/accountCompletion.ts src/services/apiAdapters/contracts/siteAdapter.ts src/services/apiAdapters/newApi/accountCompletion.ts src/services/apiAdapters/newApi/index.ts tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/apiAdapters/registry.test.ts
pnpm run validate:staged
git commit -m "refactor(api-adapters): add new-api account completion"
```

Expected: `validate:staged` exits 0, then the commit contains only the account-completion contract, New API-family Adapter, and focused tests.

---

## Task 2: Add Sub2API Account Completion Adapter

**Files:**
- Create: `src/services/apiAdapters/sub2api/accountCompletion.ts`
- Modify: `src/services/apiAdapters/sub2api/index.ts`
- Create: `tests/services/apiAdapters/sub2api/accountCompletion.test.ts`
- Modify: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Write the failing Sub2API Adapter test**

Create `tests/services/apiAdapters/sub2api/accountCompletion.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { sub2ApiAccountCompletion } from "~/services/apiAdapters/sub2api/accountCompletion"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"

const {
  getApiServiceMock,
  fetchUserInfoMock,
  getOrCreateAccessTokenMock,
  fetchSiteStatusMock,
  fetchSupportCheckInMock,
  extractDefaultExchangeRateMock,
} = vi.hoisted(() => ({
  getApiServiceMock: vi.fn(),
  fetchUserInfoMock: vi.fn(),
  getOrCreateAccessTokenMock: vi.fn(),
  fetchSiteStatusMock: vi.fn(),
  fetchSupportCheckInMock: vi.fn(),
  extractDefaultExchangeRateMock: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: getApiServiceMock,
}))

const helpers = {
  createServiceRequest: (input: {
    baseUrl: string
    auth: ApiServiceRequest["auth"]
    context: {
      fetchContext?: ApiServiceRequest["fetchContext"]
    }
  }): ApiServiceRequest => ({
    baseUrl: input.baseUrl,
    auth: input.auth,
    ...(input.context.fetchContext
      ? { fetchContext: input.context.fetchContext }
      : {}),
  }),
  fetchSiteName: vi.fn(async (siteStatus: { system_name?: string } | null) =>
    siteStatus?.system_name ? siteStatus.system_name : "Sub2",
  ),
  createCompletionError: (reason: string, cause: unknown) =>
    Object.assign(new Error(cause instanceof Error ? cause.message : reason), {
      name: "AutoDetectCompletionError",
      reason,
      cause,
    }),
  trimString: (value: unknown) =>
    typeof value === "string" ? value.trim() : "",
  createInitialCheckInConfig: (input: {
    enableDetection: boolean
    autoCheckInEnabled: boolean
  }) => ({
    enableDetection: input.enableDetection,
    autoCheckInEnabled: input.autoCheckInEnabled,
    siteStatus: {
      isCheckedInToday: false,
    },
    customCheckIn: {
      url: "",
      redeemUrl: "",
      openRedeemWithCheckIn: true,
      isCheckedInToday: false,
    },
  }),
  handleCheckInSupportFetchFailure: vi.fn(() => false),
}

describe("sub2ApiAccountCompletion", () => {
  it("uses detected access-token data and disables check-in", async () => {
    getApiServiceMock.mockReturnValue({
      fetchUserInfo: fetchUserInfoMock,
      getOrCreateAccessToken: getOrCreateAccessTokenMock,
      fetchSiteStatus: fetchSiteStatusMock,
      fetchSupportCheckIn: fetchSupportCheckInMock,
      extractDefaultExchangeRate: extractDefaultExchangeRateMock,
    })
    const sub2apiAuth = {
      refreshToken: "refresh-token",
      tokenExpiresAt: 1999999999999,
    }
    const siteStatus = {
      system_name: "Runtime Portal",
    }
    fetchSiteStatusMock.mockResolvedValueOnce(siteStatus)
    extractDefaultExchangeRateMock.mockReturnValueOnce(null)

    const result = await sub2ApiAccountCompletion.complete(
      {
        url: "https://sub2.example.com",
        requestedAuthType: AuthTypeEnum.Cookie,
        context: {},
        detected: {
          userId: "12",
          user: { id: 12, username: "  " },
          siteType: SITE_TYPES.SUB2API,
          accessToken: "  jwt-token  ",
          sub2apiAuth,
        },
      },
      helpers,
    )

    expect(fetchUserInfoMock).not.toHaveBeenCalled()
    expect(getOrCreateAccessTokenMock).not.toHaveBeenCalled()
    expect(fetchSupportCheckInMock).not.toHaveBeenCalled()
    expect(fetchSiteStatusMock).toHaveBeenCalledWith({
      baseUrl: "https://sub2.example.com",
      auth: {
        authType: AuthTypeEnum.AccessToken,
      },
    })
    expect(result).toMatchObject({
      username: "",
      siteName: "Runtime Portal",
      accessToken: "jwt-token",
      userId: "12",
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: AuthTypeEnum.AccessToken,
      sub2apiAuth,
      checkIn: {
        enableDetection: false,
        autoCheckInEnabled: false,
      },
    })
  })

  it("classifies missing detected access token", async () => {
    getApiServiceMock.mockReturnValue({
      fetchSiteStatus: fetchSiteStatusMock,
      extractDefaultExchangeRate: extractDefaultExchangeRateMock,
    })
    fetchSiteStatusMock.mockResolvedValueOnce({
      system_name: "Runtime Portal",
    })
    extractDefaultExchangeRateMock.mockReturnValueOnce(null)

    await expect(
      sub2ApiAccountCompletion.complete(
        {
          url: "https://sub2.example.com",
          requestedAuthType: AuthTypeEnum.Cookie,
          context: {},
          detected: {
            userId: "12",
            siteType: SITE_TYPES.SUB2API,
            accessToken: "  ",
          },
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    })
  })
})
```

- [ ] **Step 2: Update registry tests for Sub2API account completion**

In the Sub2API test in `tests/services/apiAdapters/registry.test.ts`, add:

```ts
expect(adapter.accountCompletion).toEqual({
  complete: expect.any(Function),
})
```

- [ ] **Step 3: Run the failing Sub2API tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/sub2api/accountCompletion.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: FAIL because `sub2api/accountCompletion.ts` does not exist yet.

- [ ] **Step 4: Implement the Sub2API account completion Adapter**

Create `src/services/apiAdapters/sub2api/accountCompletion.ts`:

```ts
import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"

import type { AccountCompletionCapability } from "../contracts/accountCompletion"

export const sub2ApiAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const service = getApiService(SITE_TYPES.SUB2API)
    const { url, detected, context } = request

    let siteStatus = null
    try {
      siteStatus = await service.fetchSiteStatus(
        helpers.createServiceRequest({
          baseUrl: url,
          context,
          auth: {
            authType: AuthTypeEnum.AccessToken,
          },
        }),
      )
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
        error,
      )
    }

    const accessToken = helpers.trimString(detected.accessToken)
    if (!accessToken) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
        new Error("access token missing"),
      )
    }

    return {
      username: helpers.trimString(detected.user?.username),
      siteName: await helpers.fetchSiteName(siteStatus),
      accessToken,
      userId: detected.userId.toString(),
      exchangeRate:
        service.extractDefaultExchangeRate(siteStatus) ??
        UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: AuthTypeEnum.AccessToken,
      checkIn: helpers.createInitialCheckInConfig({
        enableDetection: false,
        autoCheckInEnabled: false,
      }),
      ...(detected.sub2apiAuth ? { sub2apiAuth: detected.sub2apiAuth } : {}),
    }
  },
}
```

- [ ] **Step 5: Expose the Sub2API account completion capability**

In `src/services/apiAdapters/sub2api/index.ts`, add:

```ts
import { sub2ApiAccountCompletion } from "./accountCompletion"
```

Then update `sub2ApiAdapter`:

```ts
export const sub2ApiAdapter: SiteAdapter = {
  siteType: SITE_TYPES.SUB2API,
  family: "sub2api",
  siteAnnouncements: sub2ApiSiteAnnouncements,
  modelCatalog: sub2ApiModelCatalog,
  accountCompletion: sub2ApiAccountCompletion,
}
```

- [ ] **Step 6: Run the Sub2API Adapter tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/sub2api/accountCompletion.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

Run:

```powershell
git status --porcelain
git add src/services/apiAdapters/sub2api/accountCompletion.ts src/services/apiAdapters/sub2api/index.ts tests/services/apiAdapters/sub2api/accountCompletion.test.ts tests/services/apiAdapters/registry.test.ts
pnpm run validate:staged
git commit -m "refactor(api-adapters): add sub2api account completion"
```

Expected: `validate:staged` exits 0, then the commit contains only the Sub2API Adapter and tests.

---

## Task 3: Add AIHubMix Account Completion Adapter

**Files:**
- Create: `src/services/apiAdapters/aihubmix/accountCompletion.ts`
- Create: `src/services/apiAdapters/aihubmix/index.ts`
- Modify: `src/services/apiAdapters/registry.ts`
- Create: `tests/services/apiAdapters/aihubmix/accountCompletion.test.ts`
- Modify: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Write the failing AIHubMix Adapter test**

Create `tests/services/apiAdapters/aihubmix/accountCompletion.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { aihubmixAccountCompletion } from "~/services/apiAdapters/aihubmix/accountCompletion"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"

const {
  getApiServiceMock,
  getOrCreateAccessTokenMock,
  fetchSiteStatusMock,
  fetchSupportCheckInMock,
  extractDefaultExchangeRateMock,
} = vi.hoisted(() => ({
  getApiServiceMock: vi.fn(),
  getOrCreateAccessTokenMock: vi.fn(),
  fetchSiteStatusMock: vi.fn(),
  fetchSupportCheckInMock: vi.fn(),
  extractDefaultExchangeRateMock: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: getApiServiceMock,
}))

const helpers = {
  createServiceRequest: (input: {
    baseUrl: string
    auth: ApiServiceRequest["auth"]
    context: {
      fetchContext?: ApiServiceRequest["fetchContext"]
    }
  }): ApiServiceRequest => ({
    baseUrl: input.baseUrl,
    auth: input.auth,
    ...(input.context.fetchContext
      ? { fetchContext: input.context.fetchContext }
      : {}),
  }),
  fetchSiteName: vi.fn(async (siteStatus: { system_name?: string } | null) =>
    siteStatus?.system_name ? siteStatus.system_name : "AIHubMix",
  ),
  createCompletionError: (reason: string, cause: unknown) =>
    Object.assign(new Error(cause instanceof Error ? cause.message : reason), {
      name: "AutoDetectCompletionError",
      reason,
      cause,
    }),
  trimString: (value: unknown) =>
    typeof value === "string" ? value.trim() : "",
  createInitialCheckInConfig: (input: {
    enableDetection: boolean
    autoCheckInEnabled: boolean
  }) => ({
    enableDetection: input.enableDetection,
    autoCheckInEnabled: input.autoCheckInEnabled,
    siteStatus: {
      isCheckedInToday: false,
    },
    customCheckIn: {
      url: "",
      redeemUrl: "",
      openRedeemWithCheckIn: true,
      isCheckedInToday: false,
    },
  }),
  handleCheckInSupportFetchFailure: vi.fn(() => false),
}

const mockService = () => {
  getApiServiceMock.mockReturnValue({
    getOrCreateAccessToken: getOrCreateAccessTokenMock,
    fetchSiteStatus: fetchSiteStatusMock,
    fetchSupportCheckIn: fetchSupportCheckInMock,
    extractDefaultExchangeRate: extractDefaultExchangeRateMock,
  })
}

describe("aihubmixAccountCompletion", () => {
  it("uses detected access-token data and probes status with cookie auth", async () => {
    mockService()
    const siteStatus = {
      system_name: "AIHubMix",
      checkin_enabled: false,
    }
    fetchSiteStatusMock.mockResolvedValueOnce(siteStatus)
    extractDefaultExchangeRateMock.mockReturnValueOnce(null)

    const result = await aihubmixAccountCompletion.complete(
      {
        url: "https://aihubmix.com",
        requestedAuthType: AuthTypeEnum.Cookie,
        context: {},
        detected: {
          userId: "11",
          user: { id: 11, username: "  aihubmix-user  " },
          siteType: SITE_TYPES.AIHUBMIX,
          accessToken: "  detected-console-token  ",
        },
      },
      helpers,
    )

    expect(getOrCreateAccessTokenMock).not.toHaveBeenCalled()
    expect(fetchSiteStatusMock).toHaveBeenCalledWith({
      baseUrl: "https://aihubmix.com",
      auth: {
        authType: AuthTypeEnum.Cookie,
      },
    })
    expect(result).toMatchObject({
      username: "aihubmix-user",
      accessToken: "detected-console-token",
      authType: AuthTypeEnum.AccessToken,
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      checkIn: {
        enableDetection: false,
        autoCheckInEnabled: true,
      },
    })
  })

  it("falls back to getOrCreateAccessToken when detected token data is absent", async () => {
    mockService()
    getOrCreateAccessTokenMock.mockResolvedValueOnce({
      username: "fallback-user",
      access_token: "fallback-token",
    })
    fetchSiteStatusMock.mockResolvedValueOnce({
      system_name: "AIHubMix",
    })
    fetchSupportCheckInMock.mockResolvedValueOnce(true)
    extractDefaultExchangeRateMock.mockReturnValueOnce(null)

    const result = await aihubmixAccountCompletion.complete(
      {
        url: "https://aihubmix.com",
        requestedAuthType: AuthTypeEnum.Cookie,
        context: {},
        detected: {
          userId: "11",
          user: { id: 11, username: "fallback-user" },
          siteType: SITE_TYPES.AIHUBMIX,
        },
      },
      helpers,
    )

    expect(getOrCreateAccessTokenMock).toHaveBeenCalledWith({
      baseUrl: "https://aihubmix.com",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "11",
      },
    })
    expect(result).toMatchObject({
      username: "fallback-user",
      accessToken: "fallback-token",
      authType: AuthTypeEnum.AccessToken,
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
      },
    })
  })

  it("classifies missing username and token", async () => {
    mockService()
    fetchSiteStatusMock.mockResolvedValueOnce({
      system_name: "AIHubMix",
      checkin_enabled: false,
    })
    extractDefaultExchangeRateMock.mockReturnValueOnce(null)

    await expect(
      aihubmixAccountCompletion.complete(
        {
          url: "https://aihubmix.com",
          requestedAuthType: AuthTypeEnum.Cookie,
          context: {},
          detected: {
            userId: "11",
            user: { id: 11, username: "  " },
            siteType: SITE_TYPES.AIHUBMIX,
            accessToken: "  ",
          },
        },
        helpers,
      ),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    })
  })
})
```

- [ ] **Step 2: Update registry tests for AIHubMix account completion**

In the AIHubMix registry test, change the capability expectations to:

```ts
expect(adapter.accountCompletion).toEqual({
  complete: expect.any(Function),
})
expect(adapter.siteNotice).toBeUndefined()
expect(adapter.siteAnnouncements).toBeUndefined()
expect(adapter.modelCatalog).toBeUndefined()
```

- [ ] **Step 3: Run the failing AIHubMix tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/aihubmix/accountCompletion.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: FAIL because `apiAdapters/aihubmix` does not exist yet.

- [ ] **Step 4: Implement the AIHubMix account completion Adapter**

Create `src/services/apiAdapters/aihubmix/accountCompletion.ts`:

```ts
import { AUTO_DETECT_FAILURE_REASONS } from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"

import type { AccountCompletionCapability } from "../contracts/accountCompletion"

const getDetectedTokenInfo = (
  detected: Parameters<AccountCompletionCapability["complete"]>[0]["detected"],
  trimString: (value: unknown) => string,
) =>
  typeof detected.accessToken === "string"
    ? {
        username: trimString(detected.user?.username),
        access_token: trimString(detected.accessToken),
      }
    : null

export const aihubmixAccountCompletion: AccountCompletionCapability = {
  async complete(request, helpers) {
    const service = getApiService(SITE_TYPES.AIHUBMIX)
    const { url, detected, context } = request

    let tokenInfo: unknown = getDetectedTokenInfo(
      detected,
      helpers.trimString,
    )
    if (!tokenInfo) {
      try {
        tokenInfo = await service.getOrCreateAccessToken(
          helpers.createServiceRequest({
            baseUrl: url,
            context,
            auth: {
              authType: AuthTypeEnum.Cookie,
              userId: detected.userId,
            },
          }),
        )
      } catch (error) {
        throw helpers.createCompletionError(
          AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
          error,
        )
      }
    }

    let siteStatus = null
    try {
      siteStatus = await service.fetchSiteStatus(
        helpers.createServiceRequest({
          baseUrl: url,
          context,
          auth: {
            authType: AuthTypeEnum.Cookie,
          },
        }),
      )
    } catch (error) {
      throw helpers.createCompletionError(
        AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
        error,
      )
    }

    const checkSupport =
      typeof siteStatus?.checkin_enabled === "boolean"
        ? siteStatus.checkin_enabled
        : await service
            .fetchSupportCheckIn(
              helpers.createServiceRequest({
                baseUrl: url,
                context,
                auth: {
                  authType: AuthTypeEnum.None,
                },
              }),
            )
            .catch(helpers.handleCheckInSupportFetchFailure)

    const tokenData =
      tokenInfo && typeof tokenInfo === "object"
        ? (tokenInfo as { username?: unknown; access_token?: unknown })
        : {}
    const username = helpers.trimString(tokenData.username)
    const accessToken = helpers.trimString(tokenData.access_token)

    if (!username || !accessToken) {
      throw helpers.createCompletionError(
        !accessToken
          ? AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing
          : AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
        new Error(!accessToken ? "access token missing" : "username missing"),
      )
    }

    return {
      username,
      siteName: await helpers.fetchSiteName(siteStatus),
      accessToken,
      userId: detected.userId.toString(),
      exchangeRate:
        service.extractDefaultExchangeRate(siteStatus) ??
        UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: AuthTypeEnum.AccessToken,
      checkIn: helpers.createInitialCheckInConfig({
        enableDetection: checkSupport ?? false,
        autoCheckInEnabled: true,
      }),
    }
  },
}
```

- [ ] **Step 5: Add the AIHubMix Adapter entrypoint**

Create `src/services/apiAdapters/aihubmix/index.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"

import type { SiteAdapter } from "../contracts/siteAdapter"
import { aihubmixAccountCompletion } from "./accountCompletion"

export const aihubmixAdapter: SiteAdapter = {
  siteType: SITE_TYPES.AIHUBMIX,
  accountCompletion: aihubmixAccountCompletion,
}
```

- [ ] **Step 6: Register AIHubMix in the Adapter registry**

In `src/services/apiAdapters/registry.ts`, add:

```ts
import { aihubmixAdapter } from "./aihubmix"
```

Then update `getSiteAdapter(...)` before the New API-family fallback:

```ts
  if (siteType === SITE_TYPES.AIHUBMIX) {
    return aihubmixAdapter
  }
```

- [ ] **Step 7: Run the AIHubMix Adapter tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/aihubmix/accountCompletion.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

Run:

```powershell
git status --porcelain
git add src/services/apiAdapters/aihubmix src/services/apiAdapters/registry.ts tests/services/apiAdapters/aihubmix/accountCompletion.test.ts tests/services/apiAdapters/registry.test.ts
pnpm run validate:staged
git commit -m "refactor(api-adapters): add aihubmix account completion"
```

Expected: `validate:staged` exits 0, then the commit contains only the AIHubMix Adapter, registry change, and tests.

---

## Task 4: Route Auto-Detect Completion Through The Adapter

**Files:**
- Modify: `src/services/accounts/autoDetectCompletion/completion.ts`
- Modify: `tests/services/accounts/autoDetectCompletion/completion.test.ts`
- Test: `tests/services/accountOperations.autoDetectAccount.test.ts`

- [ ] **Step 1: Replace the completion test service mock with an Adapter mock**

In `tests/services/accounts/autoDetectCompletion/completion.test.ts`, replace the existing `getApiService` mock setup with:

```ts
const { getSiteAdapterMock, accountCompletionMock } = vi.hoisted(() => ({
  getSiteAdapterMock: vi.fn(),
  accountCompletionMock: {
    complete: vi.fn(),
  },
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: getSiteAdapterMock,
}))
```

Keep the current imports for `AutoDetectCompletionError`,
`completeAutoDetectedAccount`, `API_SERVICE_FETCH_CONTEXT_KINDS`,
`ApiServiceFetchContext`, and `AuthTypeEnum`.

- [ ] **Step 2: Add focused orchestrator tests**

Replace the existing service-layer matrix in `tests/services/accounts/autoDetectCompletion/completion.test.ts` with tests focused on orchestration:

```ts
describe("auto-detect completion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSiteAdapterMock.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      accountCompletion: accountCompletionMock,
    })
  })

  it("passes validated current-tab fetch context to the site Adapter", async () => {
    const fetchContext = {
      kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
      tabId: 123,
      origin: "https://status.example.com",
    }
    const autoDetectContext = {
      strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
      siteType: SITE_TYPES.NEW_API,
    }
    accountCompletionMock.complete.mockResolvedValueOnce({
      username: "service-user",
      siteName: "Status Portal",
      accessToken: "service-token",
      userId: "7",
      exchangeRate: 6.8,
      authType: AuthTypeEnum.AccessToken,
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
        siteStatus: {
          isCheckedInToday: false,
        },
        customCheckIn: {
          url: "",
          redeemUrl: "",
          openRedeemWithCheckIn: true,
          isCheckedInToday: false,
        },
      },
    })

    const result = await completeAutoDetectedAccount({
      url: "https://status.example.com",
      requestedAuthType: AuthTypeEnum.AccessToken,
      autoDetectContext,
      detected: {
        userId: "7",
        siteType: SITE_TYPES.NEW_API,
        fetchContext,
      },
    })

    expect(getSiteAdapterMock).toHaveBeenCalledWith(SITE_TYPES.NEW_API)
    expect(accountCompletionMock.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://status.example.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        context: { fetchContext },
        detected: expect.objectContaining({
          userId: "7",
          siteType: SITE_TYPES.NEW_API,
        }),
      }),
      expect.objectContaining({
        createServiceRequest: expect.any(Function),
        fetchSiteName: expect.any(Function),
        createCompletionError: expect.any(Function),
        trimString: expect.any(Function),
        createInitialCheckInConfig: expect.any(Function),
        handleCheckInSupportFetchFailure: expect.any(Function),
      }),
    )
    expect(result).toMatchObject({
      username: "service-user",
      siteName: "Status Portal",
      accessToken: "service-token",
      siteType: SITE_TYPES.NEW_API,
      fetchContext,
      autoDetectContext,
    })
  })

  it("drops malformed current-tab fetch context before calling the Adapter", async () => {
    const malformedFetchContext = {
      kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
      tabId: "not-a-number",
      origin: "https://malformed.example.com",
    } as unknown as ApiServiceFetchContext
    accountCompletionMock.complete.mockResolvedValueOnce({
      username: "malformed-context-user",
      siteName: "Malformed Context Portal",
      accessToken: "malformed-context-token",
      userId: "8",
      exchangeRate: null,
      authType: AuthTypeEnum.AccessToken,
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
        siteStatus: {
          isCheckedInToday: false,
        },
        customCheckIn: {
          url: "",
          redeemUrl: "",
          openRedeemWithCheckIn: true,
          isCheckedInToday: false,
        },
      },
    })

    const result = await completeAutoDetectedAccount({
      url: "https://malformed.example.com",
      requestedAuthType: AuthTypeEnum.AccessToken,
      detected: {
        userId: "8",
        siteType: SITE_TYPES.NEW_API,
        fetchContext: malformedFetchContext,
      },
    })

    expect(accountCompletionMock.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {},
      }),
      expect.any(Object),
    )
    expect(result).not.toHaveProperty("fetchContext")
  })

  it("classifies missing accountCompletion as an unexpected completion error", async () => {
    getSiteAdapterMock.mockReturnValueOnce({
      siteType: SITE_TYPES.NEW_API,
    })

    await expect(
      completeAutoDetectedAccount({
        url: "https://missing.example.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "9",
          siteType: SITE_TYPES.NEW_API,
        },
      }),
    ).rejects.toBeInstanceOf(AutoDetectCompletionError)
  })

  it("passes Adapter completion errors through unchanged", async () => {
    const completionError = new AutoDetectCompletionError(
      AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
      new Error("token failed"),
    )
    accountCompletionMock.complete.mockRejectedValueOnce(completionError)

    await expect(
      completeAutoDetectedAccount({
        url: "https://token.example.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "10",
          siteType: SITE_TYPES.NEW_API,
        },
      }),
    ).rejects.toBe(completionError)
  })
})
```

Add one browser-context retention test after the malformed-context test:

```ts
it("retains browser fetch context before calling the Adapter", async () => {
  const fetchContext = {
    kind: API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
    cookieStoreId: "firefox-container-2",
  }
  accountCompletionMock.complete.mockResolvedValueOnce({
    username: "browser-context-user",
    siteName: "Browser Context Portal",
    accessToken: "browser-context-token",
    userId: "9",
    exchangeRate: null,
    authType: AuthTypeEnum.AccessToken,
    checkIn: {
      enableDetection: true,
      autoCheckInEnabled: true,
      siteStatus: {
        isCheckedInToday: false,
      },
      customCheckIn: {
        url: "",
        redeemUrl: "",
        openRedeemWithCheckIn: true,
        isCheckedInToday: false,
      },
    },
  })

  const result = await completeAutoDetectedAccount({
    url: "https://browser-context.example.com",
    requestedAuthType: AuthTypeEnum.AccessToken,
    detected: {
      userId: "9",
      siteType: SITE_TYPES.NEW_API,
      fetchContext,
    },
  })

  expect(accountCompletionMock.complete).toHaveBeenCalledWith(
    expect.objectContaining({
      context: { fetchContext },
    }),
    expect.any(Object),
  )
  expect(result.fetchContext).toEqual(fetchContext)
})
```

- [ ] **Step 3: Run the focused completion test and verify failure before implementation**

Run:

```powershell
pnpm vitest run tests/services/accounts/autoDetectCompletion/completion.test.ts
```

Expected: FAIL because `completeAutoDetectedAccount(...)` still calls `getApiService(...)` and does not use `getSiteAdapter(...)`.

- [ ] **Step 4: Import the Adapter registry in completion**

In `src/services/accounts/autoDetectCompletion/completion.ts`, add:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
```

Remove this import because the orchestrator no longer calls service methods directly:

```ts
import { getApiService } from "~/services/apiService"
```

Keep imports for `AUTO_DETECT_FAILURE_REASONS`, `getSiteName`,
`ApiServiceFetchContext`, `ApiServiceRequest`, `SiteStatusInfo`, `AuthTypeEnum`,
`getErrorMessage`, and `logger`. Remove the `t` import after deleting the old
validation-message branch, because completion error messages remain owned by
`accountOperations.ts`.

- [ ] **Step 5: Keep shared helpers in completion**

Keep these helper functions in `completion.ts`:

```ts
function getAutoDetectFetchContext(
  detected: DetectedAccountIdentity,
): ApiServiceFetchContext | undefined {
  const fetchContext = detected.fetchContext
  if (fetchContext?.kind === API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT) {
    return fetchContext
  }

  if (fetchContext?.kind === API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB) {
    if (
      typeof fetchContext.tabId === "number" &&
      typeof fetchContext.origin === "string" &&
      fetchContext.origin.trim()
    ) {
      return fetchContext
    }
  }

  if (fetchContext?.incognito === true || fetchContext?.cookieStoreId) {
    return fetchContext
  }

  return undefined
}

function createAutoDetectApiRequest(params: {
  baseUrl: string
  auth: ApiServiceRequest["auth"]
  fetchContext?: ApiServiceFetchContext
}): ApiServiceRequest {
  return {
    baseUrl: params.baseUrl,
    auth: params.auth,
    ...(params.fetchContext ? { fetchContext: params.fetchContext } : {}),
  }
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function createInitialCheckInConfig(input: {
  enableDetection: boolean
  autoCheckInEnabled: boolean
}) {
  return {
    enableDetection: input.enableDetection,
    autoCheckInEnabled: input.autoCheckInEnabled,
    siteStatus: {
      isCheckedInToday: false,
    },
    customCheckIn: {
      url: "",
      redeemUrl: "",
      openRedeemWithCheckIn: true,
      isCheckedInToday: false,
    },
  }
}
```

Delete local token-branch helpers that are no longer used after the Adapter call is introduced.

- [ ] **Step 6: Add Adapter helper construction**

In `src/services/accounts/autoDetectCompletion/completion.ts`, add:

```ts
const createMissingAccountCompletionCapabilityError = (siteType: string) =>
  new Error(`accountCompletion is not implemented for ${siteType}`)

const createCompletionError = (
  reason: AutoDetectFailureReason,
  cause: unknown,
) => new AutoDetectCompletionError(reason, cause)

const createAccountCompletionHelpers = (params: {
  url: string
  siteType: string
  fetchContext?: ApiServiceFetchContext
}) => ({
  createServiceRequest(input: {
    baseUrl: string
    auth: ApiServiceRequest["auth"]
    context: {
      fetchContext?: ApiServiceFetchContext
    }
  }) {
    return createAutoDetectApiRequest({
      baseUrl: input.baseUrl,
      auth: input.auth,
      fetchContext: input.context.fetchContext,
    })
  },
  fetchSiteName(siteStatus: SiteStatusInfo | null) {
    return getSiteName(params.url, params.siteType, siteStatus)
  },
  createCompletionError,
  trimString,
  createInitialCheckInConfig,
  handleCheckInSupportFetchFailure(error: unknown) {
    logger.warn("Auto-detect check-in support probe failed", {
      siteType: params.siteType,
      error: getErrorMessage(error),
    })
    return false as const
  },
})
```

This helper intentionally accepts `siteType: string` because
`getSiteName(url, siteType, siteStatus)` already accepts a string hint.

- [ ] **Step 7: Replace the central completion branches with the Adapter call**

Replace the body of `completeAutoDetectedAccount(...)` after `autoDetectFetchContext` is resolved with:

```ts
  const adapter = getSiteAdapter(siteType)
  if (!adapter.accountCompletion) {
    throw new AutoDetectCompletionError(
      AUTO_DETECT_FAILURE_REASONS.UnexpectedException,
      createMissingAccountCompletionCapabilityError(siteType),
    )
  }

  const completed = await adapter.accountCompletion.complete(
    {
      url,
      requestedAuthType,
      detected,
      autoDetectContext,
      context: {
        ...(autoDetectFetchContext
          ? { fetchContext: autoDetectFetchContext }
          : {}),
      },
    },
    createAccountCompletionHelpers({
      url,
      siteType,
      fetchContext: autoDetectFetchContext,
    }),
  )

  return {
    ...completed,
    siteType,
    ...(autoDetectFetchContext ? { fetchContext: autoDetectFetchContext } : {}),
    autoDetectContext,
  }
```

After this replacement, remove the old `isSub2Api`, `isAIHubMix`, token promise, site status promise, check-in promise, and exchange-rate code from `completion.ts`.

- [ ] **Step 8: Run the completion orchestrator tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/autoDetectCompletion/completion.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run the public auto-detect workflow regression suite**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.autoDetectAccount.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 4**

Run:

```powershell
git status --porcelain
git add src/services/accounts/autoDetectCompletion/completion.ts tests/services/accounts/autoDetectCompletion/completion.test.ts
pnpm run validate:staged
git commit -m "refactor(accounts): route completion through adapters"
```

Expected: `validate:staged` exits 0, then the commit contains only completion orchestrator changes and tests.

---

## Task 5: Final Validation And Scope Audit

**Files:**
- Validate: `src/services/apiAdapters/**`
- Validate: `src/services/accounts/autoDetectCompletion/completion.ts`
- Validate: `tests/services/apiAdapters/**`
- Validate: `tests/services/accounts/autoDetectCompletion/completion.test.ts`
- Validate: `tests/services/accountOperations.autoDetectAccount.test.ts`

- [ ] **Step 1: Run focused validation**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/registry.test.ts tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/apiAdapters/sub2api/accountCompletion.test.ts tests/services/apiAdapters/aihubmix/accountCompletion.test.ts tests/services/accounts/autoDetectCompletion/completion.test.ts tests/services/accountOperations.autoDetectAccount.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run related validation**

Run:

```powershell
pnpm vitest related --run src/services/apiAdapters/contracts/accountCompletion.ts src/services/apiAdapters/registry.ts src/services/accounts/autoDetectCompletion/completion.ts
```

Expected: PASS. If `vitest related` cannot map a newly created file before staging, classify that as tooling and keep the focused test suite as the primary evidence.

- [ ] **Step 3: Run TypeScript validation**

Run:

```powershell
pnpm compile
```

Expected: PASS.

- [ ] **Step 4: Run the commit gate for any remaining task-scoped changes**

If Tasks 1 through 4 were committed individually and there are no remaining task-scoped changes, inspect status only. If implementation was batched, stage only task-scoped files and run:

```powershell
git add src/services/apiAdapters/contracts/accountCompletion.ts src/services/apiAdapters/contracts/siteAdapter.ts src/services/apiAdapters/newApi/accountCompletion.ts src/services/apiAdapters/newApi/index.ts src/services/apiAdapters/sub2api/accountCompletion.ts src/services/apiAdapters/sub2api/index.ts src/services/apiAdapters/aihubmix src/services/apiAdapters/registry.ts src/services/accounts/autoDetectCompletion/completion.ts tests/services/apiAdapters/registry.test.ts tests/services/apiAdapters/newApi/accountCompletion.test.ts tests/services/apiAdapters/sub2api/accountCompletion.test.ts tests/services/apiAdapters/aihubmix/accountCompletion.test.ts tests/services/accounts/autoDetectCompletion/completion.test.ts
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 5: Inspect the final diff or recent commits**

If changes are staged, run:

```powershell
git diff --cached --stat
git diff --cached --name-status
```

Expected staged files are limited to:

```text
src/services/apiAdapters/contracts/accountCompletion.ts
src/services/apiAdapters/contracts/siteAdapter.ts
src/services/apiAdapters/newApi/accountCompletion.ts
src/services/apiAdapters/newApi/index.ts
src/services/apiAdapters/sub2api/accountCompletion.ts
src/services/apiAdapters/sub2api/index.ts
src/services/apiAdapters/aihubmix/accountCompletion.ts
src/services/apiAdapters/aihubmix/index.ts
src/services/apiAdapters/registry.ts
src/services/accounts/autoDetectCompletion/completion.ts
tests/services/apiAdapters/registry.test.ts
tests/services/apiAdapters/newApi/accountCompletion.test.ts
tests/services/apiAdapters/sub2api/accountCompletion.test.ts
tests/services/apiAdapters/aihubmix/accountCompletion.test.ts
tests/services/accounts/autoDetectCompletion/completion.test.ts
```

If Tasks 1 through 4 were committed individually, run:

```powershell
git log --oneline -6
git show --stat --oneline HEAD~4..HEAD
```

Expected recent commits include:

```text
refactor(api-adapters): add new-api account completion
refactor(api-adapters): add sub2api account completion
refactor(api-adapters): add aihubmix account completion
refactor(accounts): route completion through adapters
```

- [ ] **Step 6: Confirm no out-of-scope migration leaked in**

Run:

```powershell
git diff --name-only HEAD~4..HEAD
```

Expected: no task changes under these paths unless implementation was intentionally batched and the diff is still task-scoped:

```text
src/services/accounts/accountPostSaveWorkflow/
src/services/apiCredentialProfiles/
src/services/redemption/
src/services/managedSites/
src/features/AccountManagement/components/AccountDialog/
src/locales/
e2e/
```

Also confirm:

- no post-save token provisioning behavior moved
- no Model List pricing behavior changed
- no Account Dialog UI state changed
- no locale key was added
- no telemetry event was added
- no Playwright E2E test was added

- [ ] **Step 7: Run the pre-push / PR gate before publishing**

Before pushing, opening a PR, or updating a PR branch, run:

```powershell
pnpm run validate:push
```

Expected: PASS. If it fails, classify the failure as code, tooling, environment, auth, network, or permission before changing code.

- [ ] **Step 8: Final commit if implementation was batched**

If Tasks 1 through 4 were not committed individually, commit the final staged task-scoped diff:

```powershell
git commit -m "refactor(api-adapters): migrate account completion"
```

If Tasks 1 through 4 were committed individually, skip this step and report the commit hashes.

- [ ] **Step 9: Record final status**

Run:

```powershell
git status --porcelain
```

Expected: only unrelated pre-existing untracked files remain.

---

## Out Of Scope

- Do not move post-save token provisioning in this implementation.
- Do not move Sub2API price-estimation inputs.
- Do not move AIHubMix Model List pricing.
- Do not change Account Dialog UI behavior.
- Do not change detection strategy selection or site-type detection.
- Do not add locale keys, telemetry fields, settings search entries, or Playwright E2E tests.

## Telemetry Decision

Telemetry decision: reuse existing.

This refactor does not add a new user action, setting, async workflow, or visible result. Existing `autoDetectContext` and `autoDetectFailureReason` data continue to flow through `AccountValidationResponse`.

## Settings Search Decision

Settings search decision: none.

No settings UI, route, anchor, or search definition changes.

## E2E Decision

E2E decision: no Playwright E2E.

The risk is service-layer routing and response-shape preservation. Focused Vitest coverage plus the existing `accountOperations.autoDetectAccount` suite is the right validation layer.

## Self-Review Checklist

- Spec coverage:
  - Task 1 adds the `accountCompletion` contract and New API-family Adapter.
  - Task 2 adds Sub2API account completion behavior.
  - Task 3 adds AIHubMix account completion behavior.
  - Task 4 routes `completeAutoDetectedAccount(...)` through the Adapter and keeps `autoDetectAccount(...)` response shaping unchanged.
  - Task 5 validates focused behavior, TypeScript contracts, commit gate, push gate, and scope.
- Placeholder scan:
  - Every task has exact files, code snippets, commands, expected results, and commit commands.
  - No step asks a worker to invent missing error handling or unspecified tests.
- Type consistency:
  - The plan consistently uses `AccountCompletionCapability.complete(request, helpers)`.
  - The plan consistently uses `AccountCompletionAdapterRequest.context.fetchContext`.
  - Adapter results omit `siteType`, `fetchContext`, and `autoDetectContext`; the orchestrator attaches them.
- Scope guard:
  - Token provisioning, model pricing, Account Dialog UI state, locale files, telemetry, settings search, and E2E remain outside this slice.
