# Account Auto-Detect Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-17-account-auto-detect-completion-design.md`

**Goal:** Extract post-detection account completion from `autoDetectAccount(...)` into a narrow account completion module while preserving the current public response shape.

**Architecture:** Keep `autoDetectAccount(...)` as the product workflow owner for URL validation, detection, response shaping, and analytics failure metadata. Move token/user-info completion, site status, check-in defaults, exchange-rate extraction, and site-specific completion rules into `src/services/accounts/autoDetectCompletion/`. Move site-name resolution to a small helper so the new completion module does not import back from `accountOperations.ts`.

**Tech Stack:** TypeScript, Vitest, existing `apiService` facade, existing account auto-detect tests, `pnpm run validate:staged`.

---

## File Structure

- Create `src/services/accounts/siteName.ts`
  - Owns `extractDomainPrefix(...)` and `getSiteName(...)`.
  - Keeps the existing site-name behavior intact.
- Modify `src/services/accounts/accountOperations.ts`
  - Imports `getSiteName(...)` from `siteName.ts` for the temporary success path.
  - Re-exports `extractDomainPrefix(...)` and `getSiteName(...)` so existing callers and tests do not change imports.
  - Later calls `completeAutoDetectedAccount(...)` after successful `autoDetectSmart(...)`.
- Create `src/services/accounts/autoDetectCompletion/types.ts`
  - Defines the completion boundary types and typed completion error.
- Create `src/services/accounts/autoDetectCompletion/completion.ts`
  - Owns the extracted completion orchestration.
  - Keeps `getApiService(...)` inside the new module for this migration slice.
- Create `tests/services/accounts/autoDetectCompletion/completion.test.ts`
  - Adds focused coverage for the new module.
- Keep `tests/services/accountOperations.autoDetectAccount.test.ts`
  - Existing tests remain the broad migration contract.
- Keep `tests/services/accountOperations.test.ts`
  - Existing `getSiteName(...)` and `extractDomainPrefix(...)` tests remain the compatibility contract.

---

## Task 1: Extract Site Name Helper Without Behavior Changes

**Files:**
- Create: `src/services/accounts/siteName.ts`
- Modify: `src/services/accounts/accountOperations.ts`
- Test: `tests/services/accountOperations.test.ts`

- [ ] **Step 1: Run the existing site-name contract before editing**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.test.ts -t "extractDomainPrefix|getSiteName"
```

Expected: PASS. These tests prove the helper extraction is behavior-neutral.

- [ ] **Step 2: Create the dedicated site-name helper**

Create `src/services/accounts/siteName.ts`:

```ts
import {
  ACCOUNT_SITE_TITLE_RULES,
  SITE_TYPES,
} from "~/constants/siteType"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"

/**
 * 提取域名关键部分（排除 www 与常见双后缀）供 UI 显示默认站点名使用。
 * @param hostname 待分析的主机名
 * @returns 规范化后的前缀并首字母大写
 */
export function extractDomainPrefix(hostname: string): string {
  if (!hostname) return ""

  const withoutWww = hostname.replace(/^www\./, "")
  const parts = withoutWww.split(".")

  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1]
    const secondLastPart = parts[parts.length - 2]
    const doubleSuffixes = ["com", "net", "org", "gov", "edu", "co"]

    if (
      parts.length >= 3 &&
      doubleSuffixes.includes(secondLastPart) &&
      lastPart.length === 2
    ) {
      return (
        parts[parts.length - 3].charAt(0).toUpperCase() +
        parts[parts.length - 3].slice(1)
      )
    }

    return secondLastPart.charAt(0).toUpperCase() + secondLastPart.slice(1)
  }

  return withoutWww.charAt(0).toUpperCase() + withoutWww.slice(1)
}
```

Continue the same file with the existing site-name logic:

```ts
/**
 * 判断站点名称是否仍是默认标题（如“未知站点”），用于决定是否替换。
 * @param siteName 待检测的站点名称
 * @returns true 表示不是默认名称
 */
function isNotDefaultSiteName(siteName: string): boolean {
  return !ACCOUNT_SITE_TITLE_RULES.some(
    (rule) => rule.name !== SITE_TYPES.UNKNOWN && rule.regex.test(siteName),
  )
}

/**
 * 根据 Tab、URL 或站点状态信息推断最终展示的站点名称。
 * @param input 可能为浏览器 Tab 对象或字符串 URL
 * @param siteTypeHint Optional site-type hint so site-specific API overrides can
 * be used when resolving the display name.
 * @param siteStatusInfo Optional pre-fetched site status info to avoid redundant API calls when resolving the display name.
 * @returns 计算后的站点名称
 */
export async function getSiteName(
  input: browser.tabs.Tab | string,
  siteTypeHint?: string,
  siteStatusInfo?: { system_name?: string | null } | null,
): Promise<string> {
  const urlString = typeof input === "string" ? input : input.url ?? ""
  const tabTitle = typeof input === "string" ? null : input.title

  if (tabTitle && isNotDefaultSiteName(tabTitle)) {
    return tabTitle
  }

  const urlObj = new URL(urlString)
  const hostWithProtocol = `${urlObj.protocol}//${urlObj.host}`

  if (siteTypeHint) {
    const resolvedSiteStatus =
      siteStatusInfo ??
      (await getApiService(siteTypeHint).fetchSiteStatus({
        baseUrl: hostWithProtocol,
        auth: {
          authType: AuthTypeEnum.None,
        },
      }))

    if (
      resolvedSiteStatus?.system_name &&
      isNotDefaultSiteName(resolvedSiteStatus.system_name)
    ) {
      return resolvedSiteStatus.system_name
    }
  }

  return extractDomainPrefix(urlObj.hostname)
}
```

- [ ] **Step 3: Re-export the helper from account operations**

In `src/services/accounts/accountOperations.ts`, add this import near the account helper imports:

```ts
import { getSiteName } from "~/services/accounts/siteName"
```

Add this re-export after the constants:

```ts
export {
  extractDomainPrefix,
  getSiteName,
} from "~/services/accounts/siteName"
```

Remove these imports from `accountOperations.ts` because the moved helper now owns them:

```ts
  ACCOUNT_SITE_TITLE_RULES,
```

- [ ] **Step 4: Delete the old helper bodies from account operations**

Remove the full `extractDomainPrefix(...)`, `IsNotDefaultSiteName(...)`, and `getSiteName(...)` implementations from `src/services/accounts/accountOperations.ts`. Do not remove any surrounding account save/update functions.

- [ ] **Step 5: Verify the helper extraction**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.test.ts -t "extractDomainPrefix|getSiteName"
```

Expected: PASS.

- [ ] **Step 6: Commit the neutral helper extraction**

Run:

```powershell
git add src/services/accounts/siteName.ts src/services/accounts/accountOperations.ts
git commit -m "refactor(accounts): extract site name helper"
```

Expected: commit succeeds. If the repository policy prefers one final commit for the whole slice, skip this commit and keep the same files unstaged until Task 4.

---

## Task 2: Add Completion Module Contracts And Focused Tests

**Files:**
- Create: `src/services/accounts/autoDetectCompletion/types.ts`
- Create: `src/services/accounts/autoDetectCompletion/completion.ts`
- Create: `tests/services/accounts/autoDetectCompletion/completion.test.ts`

- [ ] **Step 1: Write the focused completion-module tests**

Create `tests/services/accounts/autoDetectCompletion/completion.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_DETECT_FAILURE_REASONS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { completeAutoDetectedAccount } from "~/services/accounts/autoDetectCompletion/completion"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"

const {
  mockFetchSiteStatus,
  mockFetchSupportCheckIn,
  mockExtractDefaultExchangeRate,
  mockFetchUserInfo,
  mockGetOrCreateAccessToken,
} = vi.hoisted(() => ({
  mockFetchSiteStatus: vi.fn(),
  mockFetchSupportCheckIn: vi.fn(),
  mockExtractDefaultExchangeRate: vi.fn(),
  mockFetchUserInfo: vi.fn(),
  mockGetOrCreateAccessToken: vi.fn(),
}))

vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: vi.fn(() => ({
      fetchSiteStatus: mockFetchSiteStatus,
      fetchSupportCheckIn: mockFetchSupportCheckIn,
      extractDefaultExchangeRate: mockExtractDefaultExchangeRate,
      fetchUserInfo: mockFetchUserInfo,
      getOrCreateAccessToken: mockGetOrCreateAccessToken,
    })),
  }
})

const currentTabFetchContext = (origin: string) => ({
  kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
  tabId: 123,
  origin,
})

describe("completeAutoDetectedAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("completes compatible access-token accounts through the service layer", async () => {
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "billing-user",
      access_token: "account-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Billing Portal",
      checkin_enabled: true,
      price: 7.5,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(7.5)

    const fetchContext = currentTabFetchContext("https://new.example.com")
    const autoDetectContext = {
      strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
      siteType: SITE_TYPES.NEW_API,
    }

    const result = await completeAutoDetectedAccount({
      url: "https://new.example.com",
      requestedAuthType: AuthTypeEnum.AccessToken,
      detected: {
        userId: "7",
        user: { id: 7, username: "billing-user" },
        siteType: SITE_TYPES.NEW_API,
        fetchContext,
      },
      autoDetectContext,
    })

    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://new.example.com",
      fetchContext,
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "7",
      },
    })
    expect(mockFetchSiteStatus).toHaveBeenCalledWith({
      baseUrl: "https://new.example.com",
      fetchContext,
      auth: {
        authType: AuthTypeEnum.AccessToken,
      },
    })
    expect(result).toMatchObject({
      username: "billing-user",
      siteName: "Billing Portal",
      accessToken: "account-token",
      userId: "7",
      exchangeRate: 7.5,
      authType: AuthTypeEnum.AccessToken,
      siteType: SITE_TYPES.NEW_API,
      fetchContext,
      autoDetectContext,
      checkIn: {
        enableDetection: true,
        autoCheckInEnabled: true,
        siteStatus: {
          isCheckedInToday: false,
        },
      },
    })
  })

  it("uses detected Sub2API access-token data and disables check-in output", async () => {
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Sub2 Portal",
      checkin_enabled: true,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const sub2apiAuth = {
      refreshToken: "refresh-token",
      tokenExpiresAt: 123,
    }

    const result = await completeAutoDetectedAccount({
      url: "https://sub2.example.com",
      requestedAuthType: AuthTypeEnum.Cookie,
      detected: {
        userId: "12",
        user: { id: 12, username: "" },
        siteType: SITE_TYPES.SUB2API,
        accessToken: "jwt-token",
        sub2apiAuth,
      },
    })

    expect(mockFetchUserInfo).not.toHaveBeenCalled()
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      username: "",
      accessToken: "jwt-token",
      userId: "12",
      exchangeRate: UI_CONSTANTS.EXCHANGE_RATE.DEFAULT,
      authType: AuthTypeEnum.AccessToken,
      siteType: SITE_TYPES.SUB2API,
      sub2apiAuth,
      checkIn: {
        enableDetection: false,
        autoCheckInEnabled: false,
      },
    })
  })

  it("throws AccessTokenMissing when access-token completion returns no token", async () => {
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "missing-token-user",
      access_token: "",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Missing Token Portal",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    await expect(
      completeAutoDetectedAccount({
        url: "https://token.example.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "5",
          siteType: SITE_TYPES.NEW_API,
        },
      }),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing,
    })
  })

  it("throws UsernameMissing when non-Sub2API completion returns no username", async () => {
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "",
      access_token: "account-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Missing Username Portal",
      checkin_enabled: false,
    })
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    await expect(
      completeAutoDetectedAccount({
        url: "https://username.example.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "6",
          siteType: SITE_TYPES.NEW_API,
        },
      }),
    ).rejects.toMatchObject({
      reason: AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
    })
  })

  it("classifies site status failures", async () => {
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "status-user",
      access_token: "status-token",
    })
    mockFetchSiteStatus.mockRejectedValueOnce(
      new Error("private status backend text"),
    )

    await expect(
      completeAutoDetectedAccount({
        url: "https://status.example.com",
        requestedAuthType: AuthTypeEnum.AccessToken,
        detected: {
          userId: "9",
          siteType: SITE_TYPES.NEW_API,
        },
      }),
    ).rejects.toMatchObject({
      name: "AutoDetectCompletionError",
      reason: AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
    })
  })
})
```

- [ ] **Step 2: Run the new test and verify it fails for the missing module**

Run:

```powershell
pnpm vitest run tests/services/accounts/autoDetectCompletion/completion.test.ts
```

Expected: FAIL with an import error for `~/services/accounts/autoDetectCompletion/completion` or `~/services/accounts/autoDetectCompletion/types`.

- [ ] **Step 3: Add the completion boundary types**

Create `src/services/accounts/autoDetectCompletion/types.ts`:

```ts
import type {
  AutoDetectAnalyticsContext,
  AutoDetectFailureReason,
} from "~/constants/autoDetect"
import type { AccountSiteType } from "~/constants/siteType"
import type { ApiServiceFetchContext } from "~/services/apiService/common/type"
import type {
  AuthTypeEnum,
  CheckInConfig,
  Sub2ApiAuthConfig,
} from "~/types"
import { getErrorMessage } from "~/utils/core/error"

export type DetectedAccountIdentity = {
  userId: string
  user?: { username?: unknown } | Record<string, unknown> | null
  siteType: AccountSiteType
  accessToken?: string
  sub2apiAuth?: Sub2ApiAuthConfig
  fetchContext?: ApiServiceFetchContext
}

export type AutoDetectCompletionRequest = {
  url: string
  requestedAuthType: AuthTypeEnum
  detected: DetectedAccountIdentity
  autoDetectContext?: AutoDetectAnalyticsContext
}

export type AutoDetectCompletionData = {
  username: string
  siteName: string
  accessToken: string
  userId: string
  exchangeRate: number
  authType: AuthTypeEnum
  checkIn: CheckInConfig
  siteType: AccountSiteType
  sub2apiAuth?: Sub2ApiAuthConfig
  fetchContext?: ApiServiceFetchContext
  autoDetectContext?: AutoDetectAnalyticsContext
}

/**
 * Preserves the failing completion step while keeping the original error
 * available for UI classification.
 */
export class AutoDetectCompletionError extends Error {
  constructor(
    readonly reason: AutoDetectFailureReason,
    cause: unknown,
  ) {
    super(getErrorMessage(cause))
    this.name = "AutoDetectCompletionError"
    this.cause = cause
  }
}
```

- [ ] **Step 4: Add the completion implementation**

Create `src/services/accounts/autoDetectCompletion/completion.ts`:

```ts
import {
  AUTO_DETECT_FAILURE_REASONS,
  type AutoDetectFailureReason,
} from "~/constants/autoDetect"
import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import { getSiteName } from "~/services/accounts/siteName"
import { getApiService } from "~/services/apiService"
import {
  API_SERVICE_FETCH_CONTEXT_KINDS,
  type ApiServiceFetchContext,
  type ApiServiceRequest,
  type SiteStatusInfo,
} from "~/services/apiService/common/type"
import { AuthTypeEnum } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import {
  AutoDetectCompletionError,
  type AutoDetectCompletionData,
  type AutoDetectCompletionRequest,
} from "./types"

const logger = createLogger("AccountAutoDetectCompletion")

type AutoDetectTokenInfo = {
  username?: string | null
  access_token?: string | null
}

/**
 * Resolves the most specific auto-detect completion reason available for analytics.
 */
export function getAutoDetectCompletionFailureReason(
  error: unknown,
): AutoDetectFailureReason {
  return error instanceof AutoDetectCompletionError
    ? error.reason
    : AUTO_DETECT_FAILURE_REASONS.UnexpectedException
}

/**
 * Extracts the matched current-tab context from successful auto-detect data.
 */
function getAutoDetectFetchContext(
  detected: AutoDetectCompletionRequest["detected"],
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

/**
 * Builds the service-layer request used by auto-detect completion.
 */
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

function getDetectedUsername(
  user: AutoDetectCompletionRequest["detected"]["user"],
): string {
  if (!user || typeof user !== "object") {
    return ""
  }

  const username = (user as { username?: unknown }).username
  return typeof username === "string" ? username.trim() : ""
}

function getDetectedAccessToken(
  detected: AutoDetectCompletionRequest["detected"],
): string {
  return typeof detected.accessToken === "string"
    ? detected.accessToken.trim()
    : ""
}

function createCompletionValidationError(
  reason: AutoDetectFailureReason,
): AutoDetectCompletionError {
  const message =
    reason === AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing
      ? t("messages:operations.detection.getAccessTokenFailedDetailed")
      : t("messages:operations.detection.getUsernameFailedDetailed")

  return new AutoDetectCompletionError(reason, new Error(message))
}

export async function completeAutoDetectedAccount(
  request: AutoDetectCompletionRequest,
): Promise<AutoDetectCompletionData> {
  const { url, requestedAuthType, detected, autoDetectContext } = request
  const { userId, siteType, sub2apiAuth } = detected
  const autoDetectFetchContext = getAutoDetectFetchContext(detected)
  const isSub2Api = siteType === SITE_TYPES.SUB2API
  const isAIHubMix = siteType === SITE_TYPES.AIHUBMIX
  const effectiveAuthType =
    isSub2Api || isAIHubMix ? AuthTypeEnum.AccessToken : requestedAuthType
  const detectionAuthType = isAIHubMix
    ? AuthTypeEnum.Cookie
    : effectiveAuthType
  const apiService = getApiService(siteType)

  let tokenPromise: Promise<AutoDetectTokenInfo | null>

  if (isSub2Api) {
    tokenPromise = Promise.resolve({
      username: getDetectedUsername(detected.user),
      access_token: getDetectedAccessToken(detected),
    })
  } else if (isAIHubMix && typeof detected.accessToken === "string") {
    tokenPromise = Promise.resolve({
      username: getDetectedUsername(detected.user),
      access_token: getDetectedAccessToken(detected),
    })
  } else if (effectiveAuthType === AuthTypeEnum.Cookie) {
    tokenPromise = apiService.fetchUserInfo(
      createAutoDetectApiRequest({
        baseUrl: url,
        fetchContext: autoDetectFetchContext,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId,
        },
      }),
    )
  } else if (effectiveAuthType === AuthTypeEnum.AccessToken) {
    tokenPromise = apiService.getOrCreateAccessToken(
      createAutoDetectApiRequest({
        baseUrl: url,
        fetchContext: autoDetectFetchContext,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId,
        },
      }),
    )
  } else {
    tokenPromise = Promise.resolve(null)
  }

  const siteStatusPromise: Promise<SiteStatusInfo | null> =
    apiService
      .fetchSiteStatus(
        createAutoDetectApiRequest({
          baseUrl: url,
          fetchContext: autoDetectFetchContext,
          auth: {
            authType: detectionAuthType || AuthTypeEnum.None,
          },
        }),
      )
      .catch((error) => {
        throw new AutoDetectCompletionError(
          AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed,
          error,
        )
      })

  const checkSupportPromise: Promise<boolean | undefined> =
    siteStatusPromise.then((siteStatus) =>
      typeof siteStatus?.checkin_enabled === "boolean"
        ? siteStatus.checkin_enabled
        : apiService
            .fetchSupportCheckIn(
              createAutoDetectApiRequest({
                baseUrl: url,
                fetchContext: autoDetectFetchContext,
                auth: {
                  authType: AuthTypeEnum.None,
                },
              }),
            )
            .catch((error) => {
              logger.warn("Auto-detect check-in support probe failed", {
                siteType,
                error: getErrorMessage(error),
              })
              return false
            }),
    )

  const [tokenInfo, siteStatus, checkSupport, siteName] = await Promise.all([
    tokenPromise.catch((error) => {
      throw new AutoDetectCompletionError(
        AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
        error,
      )
    }),
    siteStatusPromise,
    checkSupportPromise,
    siteStatusPromise.then((resolvedSiteStatus) =>
      getSiteName(url, siteType, resolvedSiteStatus),
    ),
  ])

  const detectedUsername =
    typeof tokenInfo?.username === "string" ? tokenInfo.username : ""
  const accessToken =
    typeof tokenInfo?.access_token === "string" ? tokenInfo.access_token : ""
  const isUsernameMissing = !isSub2Api && !detectedUsername
  const isAccessTokenMissing =
    (effectiveAuthType === AuthTypeEnum.AccessToken || isAIHubMix) &&
    !accessToken

  if (isUsernameMissing || isAccessTokenMissing) {
    throw createCompletionValidationError(
      isAccessTokenMissing
        ? AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing
        : AUTO_DETECT_FAILURE_REASONS.UsernameMissing,
    )
  }

  const defaultExchangeRate =
    apiService.extractDefaultExchangeRate(siteStatus) ??
    UI_CONSTANTS.EXCHANGE_RATE.DEFAULT

  return {
    username: detectedUsername,
    siteName,
    accessToken,
    userId: userId.toString(),
    exchangeRate: defaultExchangeRate,
    authType: effectiveAuthType,
    checkIn: {
      enableDetection: isSub2Api ? false : checkSupport ?? false,
      autoCheckInEnabled: isSub2Api ? false : true,
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
    siteType,
    ...(isSub2Api && sub2apiAuth ? { sub2apiAuth } : {}),
    ...(autoDetectFetchContext ? { fetchContext: autoDetectFetchContext } : {}),
    autoDetectContext,
  }
}
```

- [ ] **Step 5: Run the new completion tests**

Run:

```powershell
pnpm vitest run tests/services/accounts/autoDetectCompletion/completion.test.ts
```

Expected: PASS.

---

## Task 3: Route `autoDetectAccount(...)` Through The Completion Module

**Files:**
- Modify: `src/services/accounts/accountOperations.ts`
- Test: `tests/services/accountOperations.autoDetectAccount.test.ts`
- Test: `tests/services/accounts/autoDetectCompletion/completion.test.ts`

- [ ] **Step 1: Import the completion module**

In `src/services/accounts/accountOperations.ts`, add:

```ts
import {
  completeAutoDetectedAccount,
  getAutoDetectCompletionFailureReason,
} from "~/services/accounts/autoDetectCompletion/completion"
```

Remove these imports after the completion logic is deleted:

```ts
import {
  API_SERVICE_FETCH_CONTEXT_KINDS,
  type ApiServiceFetchContext,
  type ApiServiceRequest,
  type SiteStatusInfo,
} from "~/services/apiService/common/type"
```

Keep `getApiService` in `accountOperations.ts`; it is still used by non-auto-detect account operations and token provisioning.

- [ ] **Step 2: Remove the local completion error and request helpers**

Delete these private helpers from `src/services/accounts/accountOperations.ts`:

```ts
class AutoDetectCompletionError extends Error {
  constructor(
    readonly reason: AutoDetectFailureReason,
    cause: unknown,
  ) {
    super(getErrorMessage(cause))
    this.name = "AutoDetectCompletionError"
    this.cause = cause
  }
}

function getAutoDetectCompletionFailureReason(
  error: unknown,
): AutoDetectFailureReason {
  return error instanceof AutoDetectCompletionError
    ? error.reason
    : AUTO_DETECT_FAILURE_REASONS.UnexpectedException
}

function getAutoDetectFetchContext(...) {
  ...
}

function createAutoDetectApiRequest(...) {
  ...
}
```

Do not delete `withFinalAutoDetectSiteType(...)`, `getAutoDetectFailureReasonByErrorCode(...)`, or `getAutoDetectCompletionFailureMessage(...)`.

- [ ] **Step 3: Preserve validation-error response shaping**

Update `getAutoDetectCompletionFailureMessage(...)` in `src/services/accounts/accountOperations.ts` so validation failures keep the previous user-facing messages:

```ts
function getAutoDetectCompletionFailureMessage(
  reason: AutoDetectFailureReason,
  fallbackErrorMessage: string,
) {
  switch (reason) {
    case AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed:
    case AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing:
      return t("messages:operations.detection.getAccessTokenFailedDetailed")
    case AUTO_DETECT_FAILURE_REASONS.SiteStatusFetchFailed:
      return t("messages:operations.detection.getSiteStatusFailedDetailed")
    case AUTO_DETECT_FAILURE_REASONS.UsernameMissing:
      return t("messages:operations.detection.getUsernameFailedDetailed")
    default:
      return t("accountDialog:messages.autoDetectFailed", {
        error: fallbackErrorMessage,
      })
  }
}
```

Add this helper below it so `UsernameMissing` and `AccessTokenMissing` still return `AutoDetectErrorType.INVALID_RESPONSE`:

```ts
function getAutoDetectCompletionDetailedError(
  error: unknown,
  reason: AutoDetectFailureReason,
  message: string,
) {
  switch (reason) {
    case AUTO_DETECT_FAILURE_REASONS.UsernameMissing:
    case AUTO_DETECT_FAILURE_REASONS.AccessTokenMissing:
      return {
        type: AutoDetectErrorType.INVALID_RESPONSE,
        message,
      }
    default:
      return analyzeAutoDetectError(error)
  }
}
```

- [ ] **Step 4: Replace the success-branch completion block**

In `autoDetectAccount(...)`, keep everything through this user-id guard:

```ts
const { userId, siteType } = detectResult.data
autoDetectContext = withFinalAutoDetectSiteType(
  detectResult.autoDetectContext,
  siteType,
)

if (!userId) {
  return {
    success: false,
    message: t("messages:operations.detection.getUserIdFailedDetailed"),
    detailedError: {
      type: AutoDetectErrorType.INVALID_RESPONSE,
      message: t("messages:operations.detection.getUserIdFailedDetailed"),
    },
    autoDetectContext,
    autoDetectFailureReason: AUTO_DETECT_FAILURE_REASONS.UserIdMissing,
  }
}
```

Replace the old token, site status, check-in, exchange-rate, and success-data construction block with:

```ts
const completed = await completeAutoDetectedAccount({
  url,
  requestedAuthType: authType,
  detected: detectResult.data,
  autoDetectContext,
})

return {
  success: true,
  message: t("accountDialog:messages.autoDetectSuccess"),
  data: completed,
}
```

- [ ] **Step 5: Update the catch block to use the preserved detailed error**

Replace the final `detailedError` assignment in `autoDetectAccount(...)` with:

```ts
const detailedError = getAutoDetectCompletionDetailedError(
  error,
  autoDetectFailureReason,
  message,
)
```

The full catch block should end as:

```ts
  } catch (error) {
    const errorMessage = getErrorMessage(error)
    const autoDetectFailureReason = getAutoDetectCompletionFailureReason(error)
    const message = getAutoDetectCompletionFailureMessage(
      autoDetectFailureReason,
      errorMessage,
    )
    logger.error(
      t("messages:autodetect.failed", { error: errorMessage }),
      error,
    )
    const detailedError = getAutoDetectCompletionDetailedError(
      error,
      autoDetectFailureReason,
      message,
    )
    return {
      success: false,
      message,
      detailedError,
      autoDetectContext,
      autoDetectFailureReason,
    }
  }
}
```

- [ ] **Step 6: Run the existing auto-detect regression suite**

Run:

```powershell
pnpm vitest run tests/services/accountOperations.autoDetectAccount.test.ts
```

Expected: PASS. This confirms `AccountValidationResponse`, analytics context, fetch-context forwarding, AIHubMix, Sub2API, check-in fallback, and failure classifications did not regress.

- [ ] **Step 7: Run the new module tests again**

Run:

```powershell
pnpm vitest run tests/services/accounts/autoDetectCompletion/completion.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the completion extraction**

Run:

```powershell
git add src/services/accounts/accountOperations.ts src/services/accounts/autoDetectCompletion src/services/accounts/siteName.ts tests/services/accounts/autoDetectCompletion/completion.test.ts
git commit -m "refactor(accounts): extract auto-detect completion"
```

Expected: commit succeeds. If Task 1 was not committed separately, this commit includes the helper extraction and completion module together.

---

## Task 4: Final Validation And Diff Review

**Files:**
- Validate all files touched in Tasks 1 to 3.

- [ ] **Step 1: Run related unit coverage**

Run:

```powershell
pnpm vitest related --run src/services/accounts/accountOperations.ts src/services/accounts/siteName.ts src/services/accounts/autoDetectCompletion/completion.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted lint**

Run:

```powershell
pnpm exec eslint src/services/accounts src/features/AccountManagement/components/AccountDialog
```

Expected: PASS.

- [ ] **Step 3: Inspect the diff for scope drift**

Run:

```powershell
git diff --stat
git diff -- src/services/accounts/accountOperations.ts src/services/accounts/siteName.ts src/services/accounts/autoDetectCompletion tests/services/accounts/autoDetectCompletion
```

Expected:
- No changes to `src/services/siteDetection/autoDetectService.ts`.
- No changes to Account Dialog UI state, cookie import, duplicate confirmation, save/update behavior, or post-save token prompts.
- No locale, telemetry, settings search, or Playwright E2E changes.
- `accountOperations.ts` still exports `getSiteName` and `extractDomainPrefix`.

- [ ] **Step 4: Run the commit gate**

Stage only the task-scoped files, then run:

```powershell
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 5: Commit any remaining task-scoped changes**

If Task 1 and Task 3 were already committed and there are no remaining task-scoped changes, skip this step. Otherwise run:

```powershell
git add src/services/accounts/accountOperations.ts src/services/accounts/siteName.ts src/services/accounts/autoDetectCompletion tests/services/accounts/autoDetectCompletion/completion.test.ts
git commit -m "refactor(accounts): extract auto-detect completion"
```

Expected: commit succeeds.

- [ ] **Step 6: Decide whether to run the pre-push gate**

Run this before pushing or opening/updating a PR because the slice moves shared TypeScript account workflow logic:

```powershell
pnpm run validate:push
```

Expected: PASS. If it fails, classify the failure as code, tooling, environment, auth, network, or permission before changing code.

---

## Telemetry Decision

Telemetry decision: reuse existing.

This refactor does not add a new user action, setting, async workflow, or visible result. The existing `autoDetectContext` and `autoDetectFailureReason` fields continue to flow through `AccountValidationResponse`.

## Settings Search Decision

Settings search decision: none.

No settings UI, route, anchor, or search definition changes.

## E2E Decision

E2E decision: no Playwright E2E.

The risk is service-layer routing and response-shape preservation. Existing Vitest coverage exercises the Account Dialog consumer contract and browser-context metadata; the new module receives focused unit coverage.

## Self-Review Checklist

- Spec coverage:
  - Completion module introduced under `src/services/accounts/autoDetectCompletion/`.
  - `autoDetectSmart(...)`, detection strategies, Account Dialog, save flow, cookie import, and post-save token initialization remain unchanged.
  - Sub2API, AIHubMix, compatible cookie auth, compatible access-token auth, site status, check-in support, exchange-rate extraction, and failure classification are covered.
- Placeholder scan:
  - No task uses placeholder markers or incomplete test instructions.
  - Code steps include concrete snippets and commands.
- Type consistency:
  - `completeAutoDetectedAccount(...)` accepts `AutoDetectCompletionRequest` and returns `AutoDetectCompletionData`.
  - `accountOperations.ts` passes `requestedAuthType`, not `authType`, into the new module.
  - `AutoDetectCompletionError.reason` uses `AutoDetectFailureReason`.
- Scope guard:
  - Do not add a new site type in this slice.
  - Do not move full key management, model list, redemption, or managed-site behavior.
  - Keep `getApiService(...)` in the new completion module until a later adapter-capability slice.
