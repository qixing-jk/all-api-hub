# Current Tab Autodetect Content Fetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make account auto-detect continue using the matched current tab's content-script fetch for API requests during the auto-detect flow, so incognito sidepanel imports can use the page's session and required headers without limiting the transport preference to one site family.

**Architecture:** Preserve the existing current-tab/background/direct detection order, but carry a task-scoped `fetchContext` from successful current-tab detection into normal `apiService` requests. The common fetch executor treats that context as a transport preference: when the final request URL is same-origin with the matched tab and the response type is safe for extension messaging, it first executes the already-built request through `ContentPerformTempWindowFetch`; on mismatch, unsupported response type, opt-out, or content-script failure, it falls back to the existing direct/temp-window fetch path. The change is limited to the auto-detect completion path by only attaching this context from `autoDetectAccount`; saved account refresh and long-running background operations continue using requests without current-tab context.

**Tech Stack:** TypeScript, WXT WebExtension APIs, React sidepanel, Vitest, existing content-script fetch handler (`RuntimeActionIds.ContentPerformTempWindowFetch`).

---

## File Structure

- Modify `src/services/siteDetection/autoDetectService.ts`
  - Extend `AutoDetectResult.data` and `UserDataResult` with a source/fetch context for current-tab detection.
  - Pass the already-selected current tab id into `autoDetectFromCurrentTab` and `getUserDataFromCurrentTab` to avoid a second active-tab lookup drift.
- Modify `src/services/apiService/common/type.ts`
  - Add a current-tab `fetchContext` to `ApiServiceRequest`.
  - Add a request-level `currentTabTransport` opt-out for callers that must bypass tab messaging.
- Modify `src/services/apiService/common/utils.ts`
  - Prefer current-tab content fetch when a request has same-origin current-tab context.
  - Reuse the final authenticated `fetchOptions` built by the common executor.
  - Fall back to the existing direct/temp-window fetch path if tab messaging fails.
- Modify `src/services/accounts/accountOperations.ts`
  - Pass current-tab context into normal service-layer requests during auto-detect completion.
  - Preserve site-specific adapter behavior for Sub2API, AIHubMix, WONG, AnyRouter, and other overrides by keeping all business calls on `getApiService(siteType)`.
- Modify `tests/services/autoDetectService.test.ts`
  - Assert current-tab detection returns a current-tab fetch context and sends the content-script request to the matched tab id.
  - Add a regression for the two-query drift: first matched tab differs from later active tab, and the implementation must still use the matched tab.
- Modify `tests/services/apiService/common/fetchApi.test.ts`
  - Cover current-tab content fetch success, same-origin gating, failure fallback, opt-out, and binary response exclusion.
- Modify `tests/services/accountOperations.autoDetectAccount.test.ts`
  - Verify auto-detect completion passes current-tab context into normal service requests across site types.

---

### Task 1: Carry Current-Tab Fetch Context From Site Detection

**Files:**
- Modify: `src/services/siteDetection/autoDetectService.ts`
- Test: `tests/services/autoDetectService.test.ts`

- [ ] **Step 1: Write failing tests for current-tab context and tab-id stability**

Add these tests inside `describe("autoDetectSmart", () => { ... })` in `tests/services/autoDetectService.test.ts` after the existing `"uses the active tab content-script flow when the current tab matches the target origin"` test.

```ts
  it("returns a current-tab fetch context when current-tab detection succeeds", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 101,
        active: true,
        url: "https://example.com/dashboard",
      },
    ])
    browserAny.tabs.sendMessage.mockResolvedValue({
      success: true,
      data: {
        userId: 12,
        user: { id: 12, username: "alice" },
      },
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result).toEqual({
      success: true,
      data: {
        userId: 12,
        user: { id: 12, username: "alice" },
        siteType: SITE_TYPES.NEW_API,
        accessToken: undefined,
        sub2apiAuth: undefined,
        fetchContext: {
          kind: "current-tab",
          tabId: 101,
        },
      },
    })
    expect(browserAny.tabs.sendMessage).toHaveBeenCalledWith(101, {
      action: expect.any(String),
      url: "https://example.com/console",
    })
    expect(mockGetActiveTabs).not.toHaveBeenCalled()
  })

  it("uses the matched current tab id instead of re-querying active tabs", async () => {
    mockGetActiveOrAllTabs.mockResolvedValue([
      {
        id: 101,
        active: true,
        url: "https://example.com/dashboard",
      },
    ])
    mockGetActiveTabs.mockResolvedValue([
      {
        id: 202,
        active: true,
        url: "https://other.example.com/home",
      },
    ])
    browserAny.tabs.sendMessage.mockResolvedValue({
      success: true,
      data: {
        userId: 12,
        user: { id: 12, username: "alice" },
      },
    })

    const result = await autoDetectSmart("https://example.com/console")

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      userId: 12,
      fetchContext: {
        kind: "current-tab",
        tabId: 101,
      },
    })
    expect(browserAny.tabs.sendMessage).toHaveBeenCalledWith(101, {
      action: expect.any(String),
      url: "https://example.com/console",
    })
    expect(browserAny.tabs.sendMessage).not.toHaveBeenCalledWith(
      202,
      expect.anything(),
    )
    expect(mockGetActiveTabs).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the focused failing tests**

Run:

```bash
pnpm vitest --run tests/services/autoDetectService.test.ts
```

Expected: the new tests fail because `fetchContext` is not present and `getUserDataFromCurrentTab` still calls `getActiveTabs`.

- [ ] **Step 3: Update auto-detect result types and current-tab flow**

In `src/services/siteDetection/autoDetectService.ts`, add a fetch context type near the existing interfaces:

```ts
export type AutoDetectFetchContext =
  | {
      kind: "current-tab"
      tabId: number
    }
  | {
      kind: "default"
    }
```

Update `AutoDetectResult.data` and `UserDataResult`:

```ts
interface AutoDetectResult {
  success: boolean
  data?: {
    userId: number
    user: any
    siteType: AccountSiteType
    accessToken?: string
    sub2apiAuth?: Sub2ApiAuthConfig
    fetchContext?: AutoDetectFetchContext
  }
  error?: string
  errorCode?: AutoDetectErrorCode
}

interface UserDataResult {
  userId: number
  user: any
  accessToken?: string
  sub2apiAuth?: Sub2ApiAuthConfig
  siteTypeHint?: AccountSiteType
  fetchContext?: AutoDetectFetchContext
}
```

Update `combineUserDataAndSiteType` so it forwards the context:

```ts
    return {
      success: true,
      data: {
        userId: userData.userId,
        user: userData.user,
        siteType,
        accessToken: userData.accessToken,
        sub2apiAuth: userData.sub2apiAuth,
        fetchContext: userData.fetchContext,
      },
    }
```

Change `getUserDataFromCurrentTab` to receive the already-matched tab id:

```ts
async function getUserDataFromCurrentTab(
  url: string,
  siteType: AccountSiteType,
  tabId: number,
): Promise<CurrentTabUserDataResult> {
  let contentScriptUnavailable = false

  try {
    try {
      const userResponse = await browser.tabs.sendMessage(tabId, {
        action: RuntimeActionIds.ContentGetUserFromLocalStorage,
        url: url,
      })

      if (userResponse?.success && userResponse.data) {
        return {
          userData: {
            userId: userResponse.data.userId,
            user: userResponse.data.user,
            accessToken: userResponse.data.accessToken,
            sub2apiAuth: userResponse.data.sub2apiAuth,
            siteTypeHint: normalizeSiteTypeHint(userResponse.data.siteTypeHint),
            fetchContext: {
              kind: "current-tab",
              tabId,
            },
          },
          contentScriptUnavailable,
        }
      }
    } catch (error) {
      contentScriptUnavailable = isMessageReceiverUnavailableError(error)

      if (contentScriptUnavailable) {
        logger.warn("当前标签页 content script 不可用，尝试 API 降级", {
          url,
          tabId,
          error: getErrorMessage(error),
        })
      } else {
        logger.error("从当前标签页获取用户数据失败", error)
      }
    }

    const fallbackUserData = await getUserDataViaAPI(url, siteType)
    if (fallbackUserData) {
      return {
        userData: fallbackUserData,
        contentScriptUnavailable,
      }
    }

    return { userData: null, contentScriptUnavailable }
  } catch (error) {
    logger.error("从当前标签页获取用户数据失败", error)
    return { userData: null, contentScriptUnavailable }
  }
}
```

Change `autoDetectFromCurrentTab` signature and call:

```ts
async function autoDetectFromCurrentTab(
  url: string,
  tabId: number,
): Promise<AutoDetectResult> {
  logger.debug("使用当前标签页方式", { url, tabId })

  const siteType = await getAccountSiteType(url)

  const { userData, contentScriptUnavailable } =
    await getUserDataFromCurrentTab(url, siteType, tabId)

  const result = await combineUserDataAndSiteType(userData, url)
  ...
}
```

Update the call in `autoDetectSmart`:

```ts
          const currentTabResult = await autoDetectFromCurrentTab(
            detectionUrl,
            currentTab.id,
          )
```

Guard before the call:

```ts
        if (
          currentUrl.origin === targetUrl.origin &&
          typeof currentTab.id === "number"
        ) {
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm vitest --run tests/services/autoDetectService.test.ts
```

Expected: all tests in `autoDetectService.test.ts` pass after updating existing expected results to include `fetchContext: undefined` where strict equality currently expects the full data object.

- [ ] **Step 5: Commit Task 1**

Stage only the task files:

```bash
git add src/services/siteDetection/autoDetectService.ts tests/services/autoDetectService.test.ts
git commit -m "fix(accounts): carry current-tab auto-detect context"
```

---

### Task 2: Add Auto-Detect Content Fetch Helpers

**Files:**
- Create: `src/services/accounts/autoDetectContentFetch.ts`
- Create: `tests/services/accounts/autoDetectContentFetch.test.ts`

- [ ] **Step 1: Write tests for the content fetch helper**

Create `tests/services/accounts/autoDetectContentFetch.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchUserInfoViaAutoDetectContent,
  getOrCreateAccessTokenViaAutoDetectContent,
} from "~/services/accounts/autoDetectContentFetch"
import { RuntimeActionIds } from "~/constants/runtimeActions"

describe("autoDetectContentFetch", () => {
  const browserAny = globalThis.browser as any
  const originalTabs = browserAny.tabs

  beforeEach(() => {
    vi.clearAllMocks()
    browserAny.tabs = {
      sendMessage: vi.fn(),
    }
  })

  afterEach(() => {
    browserAny.tabs = originalTabs
  })

  it("fetches user info through the current tab with compatibility headers", async () => {
    browserAny.tabs.sendMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        message: "",
        data: {
          id: 2,
          username: "test",
          access_token: "existing-token",
        },
      },
    })

    const result = await fetchUserInfoViaAutoDetectContent({
      tabId: 123,
      baseUrl: "https://ai.example.com/",
      userId: 2,
    })

    expect(result).toEqual({
      id: 2,
      username: "test",
      access_token: "existing-token",
      user: {
        id: 2,
        username: "test",
        access_token: "existing-token",
      },
    })
    expect(browserAny.tabs.sendMessage).toHaveBeenCalledWith(123, {
      action: RuntimeActionIds.ContentPerformTempWindowFetch,
      requestId: expect.stringMatching(/^auto-detect-content-fetch-/),
      fetchUrl: "https://ai.example.com/api/user/self",
      responseType: "json",
      fetchOptions: {
        method: "GET",
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Pragma: "no-cache",
          "New-API-User": "2",
          "User-id": "2",
        }),
      },
    })
  })

  it("creates an access token through the current tab when user info has none", async () => {
    browserAny.tabs.sendMessage
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: {
          success: true,
          message: "",
          data: {
            id: 2,
            username: "test",
            access_token: "",
          },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        status: 200,
        data: {
          success: true,
          message: "",
          data: "created-token",
        },
      })

    const result = await getOrCreateAccessTokenViaAutoDetectContent({
      tabId: 123,
      baseUrl: "https://ai.example.com/",
      userId: 2,
    })

    expect(result).toEqual({
      username: "test",
      access_token: "created-token",
    })
    expect(browserAny.tabs.sendMessage).toHaveBeenNthCalledWith(
      2,
      123,
      expect.objectContaining({
        action: RuntimeActionIds.ContentPerformTempWindowFetch,
        fetchUrl: "https://ai.example.com/api/user/token",
      }),
    )
  })

  it("throws a stable error when content fetch returns an API failure envelope", async () => {
    browserAny.tabs.sendMessage.mockResolvedValueOnce({
      success: false,
      status: 401,
      data: {
        success: false,
        message: "Unauthorized, not logged in",
      },
      error: "Unauthorized, not logged in",
    })

    await expect(
      fetchUserInfoViaAutoDetectContent({
        tabId: 123,
        baseUrl: "https://ai.example.com/",
        userId: 2,
      }),
    ).rejects.toThrow("Unauthorized, not logged in")
  })

  it("throws when the content response is missing required user fields", async () => {
    browserAny.tabs.sendMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        message: "",
        data: {
          id: 2,
        },
      },
    })

    await expect(
      fetchUserInfoViaAutoDetectContent({
        tabId: 123,
        baseUrl: "https://ai.example.com/",
        userId: 2,
      }),
    ).rejects.toThrow("auto_detect_content_user_info_incomplete")
  })
})
```

- [ ] **Step 2: Run the new failing test**

Run:

```bash
pnpm vitest --run tests/services/accounts/autoDetectContentFetch.test.ts
```

Expected: FAIL because `src/services/accounts/autoDetectContentFetch.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/services/accounts/autoDetectContentFetch.ts`:

```ts
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { buildCompatUserIdHeaders } from "~/services/apiService/common/compatHeaders"
import { REQUEST_CONFIG } from "~/services/apiService/common/constant"
import { ApiError } from "~/services/apiService/common/errors"
import type { UserInfo } from "~/services/apiService/common/type"
import { sendTabMessageWithRetry } from "~/utils/browser/browserApi"
import {
  EXTENSION_HEADER_NAME,
  EXTENSION_HEADER_VALUE,
} from "~/utils/browser/cookieHelper"
import { getErrorMessage } from "~/utils/core/error"
import { joinUrl } from "~/utils/core/url"

interface AutoDetectContentFetchContext {
  tabId: number
  baseUrl: string
  userId?: number | string
}

interface ContentFetchResponse<T> {
  success?: boolean
  status?: number
  data?: T
  error?: string
}

interface ApiEnvelope<T> {
  success?: boolean
  message?: string
  data?: T
}

interface AutoDetectContentFetchOptions
  extends AutoDetectContentFetchContext {
  endpoint: string
  method?: string
}

const buildAutoDetectHeaders = (
  userId: number | string | undefined,
): Record<string, string> => ({
  "Content-Type": REQUEST_CONFIG.HEADERS.CONTENT_TYPE,
  Pragma: REQUEST_CONFIG.HEADERS.PRAGMA,
  [EXTENSION_HEADER_NAME]: EXTENSION_HEADER_VALUE,
  ...buildCompatUserIdHeaders(userId),
})

const unwrapApiEnvelope = <T>(
  response: ContentFetchResponse<ApiEnvelope<T> | T>,
  endpoint: string,
): T => {
  if (!response.success) {
    throw new ApiError(
      response.error || "auto_detect_content_fetch_failed",
      response.status,
      endpoint,
    )
  }

  const payload = response.data
  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    "data" in payload
  ) {
    const envelope = payload as ApiEnvelope<T>
    if (envelope.success === false) {
      throw new ApiError(
        envelope.message || "auto_detect_content_fetch_failed",
        response.status,
        endpoint,
      )
    }
    return envelope.data as T
  }

  return payload as T
}

export async function fetchApiDataViaAutoDetectContent<T>({
  tabId,
  baseUrl,
  userId,
  endpoint,
  method = "GET",
}: AutoDetectContentFetchOptions): Promise<T> {
  const fetchUrl = joinUrl(baseUrl, endpoint)
  const requestId = `auto-detect-content-fetch-${Date.now()}`

  try {
    const response = (await sendTabMessageWithRetry(tabId, {
      action: RuntimeActionIds.ContentPerformTempWindowFetch,
      requestId,
      fetchUrl,
      responseType: "json",
      fetchOptions: {
        method,
        credentials: "include",
        headers: buildAutoDetectHeaders(userId),
      },
    })) as ContentFetchResponse<ApiEnvelope<T> | T>

    return unwrapApiEnvelope<T>(response, endpoint)
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new ApiError(getErrorMessage(error), undefined, endpoint)
  }
}

export async function fetchUserInfoViaAutoDetectContent(
  context: AutoDetectContentFetchContext,
): Promise<{
  id: number
  username: string
  access_token: string
  user: UserInfo
}> {
  const userData = await fetchApiDataViaAutoDetectContent<UserInfo>({
    ...context,
    endpoint: "/api/user/self",
  })

  if (
    !userData ||
    typeof userData.id !== "number" ||
    typeof userData.username !== "string"
  ) {
    throw new ApiError("auto_detect_content_user_info_incomplete")
  }

  return {
    id: userData.id,
    username: userData.username,
    access_token:
      typeof userData.access_token === "string" ? userData.access_token : "",
    user: userData,
  }
}

export async function getOrCreateAccessTokenViaAutoDetectContent(
  context: AutoDetectContentFetchContext,
): Promise<{
  username: string
  access_token: string
}> {
  const userInfo = await fetchUserInfoViaAutoDetectContent(context)
  let accessToken = userInfo.access_token

  if (!accessToken) {
    accessToken = await fetchApiDataViaAutoDetectContent<string>({
      ...context,
      endpoint: "/api/user/token",
    })
  }

  return {
    username: userInfo.username,
    access_token: accessToken,
  }
}
```

If TypeScript reports `UserInfo` is not exported from `~/services/apiService/common/type`, inspect that file and import the existing exported user-info type. If no public type exists, use a local minimal type:

```ts
type AutoDetectUserInfo = {
  id: number
  username: string
  access_token?: string
  [key: string]: unknown
}
```

and replace `UserInfo` with `AutoDetectUserInfo`.

- [ ] **Step 4: Run the helper test**

Run:

```bash
pnpm vitest --run tests/services/accounts/autoDetectContentFetch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Stage only the task files:

```bash
git add src/services/accounts/autoDetectContentFetch.ts tests/services/accounts/autoDetectContentFetch.test.ts
git commit -m "feat(accounts): add current-tab auto-detect fetch helper"
```

---

### Task 3: Route New API Auto-Detect Completion Through Current Tab

**Files:**
- Modify: `src/services/accounts/accountOperations.ts`
- Modify: `tests/services/accountOperations.autoDetectAccount.test.ts`

- [ ] **Step 1: Write failing tests for current-tab content fetch routing**

Modify `tests/services/accountOperations.autoDetectAccount.test.ts`.

Extend the hoisted mocks:

```ts
  mockFetchUserInfoViaAutoDetectContent,
  mockGetOrCreateAccessTokenViaAutoDetectContent,
```

with:

```ts
  mockFetchUserInfoViaAutoDetectContent: vi.fn(),
  mockGetOrCreateAccessTokenViaAutoDetectContent: vi.fn(),
```

Add this mock after the existing `autoDetectService` mock:

```ts
vi.mock("~/services/accounts/autoDetectContentFetch", () => ({
  fetchUserInfoViaAutoDetectContent: mockFetchUserInfoViaAutoDetectContent,
  getOrCreateAccessTokenViaAutoDetectContent:
    mockGetOrCreateAccessTokenViaAutoDetectContent,
}))
```

Add these tests after `"uses the cookie-auth user-info flow when Cookie auth is selected"`:

```ts
  it("uses current-tab content fetch for New API cookie-auth auto-detect completion", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: 7,
        siteType: SITE_TYPES.NEW_API,
        fetchContext: {
          kind: "current-tab",
          tabId: 123,
        },
      },
    })
    mockFetchUserInfoViaAutoDetectContent.mockResolvedValueOnce({
      username: "incognito-cookie-user",
      access_token: "",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      billing_mode: "quota",
      system_name: "Incognito Portal",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(true)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(6.6)

    const result = await autoDetectAccount(
      "https://cookie.example.com",
      AuthTypeEnum.Cookie,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "incognito-cookie-user",
      siteName: "Incognito Portal",
      authType: AuthTypeEnum.Cookie,
    })
    expect(mockFetchUserInfoViaAutoDetectContent).toHaveBeenCalledWith({
      tabId: 123,
      baseUrl: "https://cookie.example.com",
      userId: 7,
    })
    expect(mockFetchUserInfo).not.toHaveBeenCalled()
  })

  it("uses current-tab content fetch for New API access-token auto-detect completion", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: 7,
        siteType: SITE_TYPES.NEW_API,
        fetchContext: {
          kind: "current-tab",
          tabId: 123,
        },
      },
    })
    mockGetOrCreateAccessTokenViaAutoDetectContent.mockResolvedValueOnce({
      username: "incognito-token-user",
      access_token: "incognito-created-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      billing_mode: "quota",
      system_name: "Incognito Token Portal",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(true)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(6.6)

    const result = await autoDetectAccount(
      "https://cookie.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "incognito-token-user",
      accessToken: "incognito-created-token",
      authType: AuthTypeEnum.AccessToken,
    })
    expect(mockGetOrCreateAccessTokenViaAutoDetectContent).toHaveBeenCalledWith({
      tabId: 123,
      baseUrl: "https://cookie.example.com",
      userId: 7,
    })
    expect(mockGetOrCreateAccessToken).not.toHaveBeenCalled()
  })

  it("falls back to the service-layer New API token flow when current-tab content fetch fails", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: 7,
        siteType: SITE_TYPES.NEW_API,
        fetchContext: {
          kind: "current-tab",
          tabId: 123,
        },
      },
    })
    mockGetOrCreateAccessTokenViaAutoDetectContent.mockRejectedValueOnce(
      new Error("content fetch unavailable"),
    )
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "fallback-user",
      access_token: "fallback-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Fallback Portal",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://cookie.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      username: "fallback-user",
      accessToken: "fallback-token",
    })
    expect(mockGetOrCreateAccessToken).toHaveBeenCalledWith({
      baseUrl: "https://cookie.example.com",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: 7,
      },
    })
  })
```

- [ ] **Step 2: Run focused failing tests**

Run:

```bash
pnpm vitest --run tests/services/accountOperations.autoDetectAccount.test.ts
```

Expected: new tests fail because `accountOperations` does not use the content fetch helper yet.

- [ ] **Step 3: Implement current-tab completion routing**

In `src/services/accounts/accountOperations.ts`, import:

```ts
import {
  fetchUserInfoViaAutoDetectContent,
  getOrCreateAccessTokenViaAutoDetectContent,
} from "~/services/accounts/autoDetectContentFetch"
```

Add helper functions near the top-level helper functions:

```ts
function getCurrentTabAutoDetectContext(
  detectResultData: NonNullable<
    Awaited<ReturnType<typeof autoDetectSmart>>["data"]
  >,
):
  | {
      tabId: number
    }
  | undefined {
  const fetchContext = detectResultData.fetchContext
  if (
    fetchContext?.kind === "current-tab" &&
    typeof fetchContext.tabId === "number"
  ) {
    return { tabId: fetchContext.tabId }
  }
  return undefined
}

async function withAutoDetectContentFallback<T>(
  preferred: (() => Promise<T>) | null,
  fallback: () => Promise<T>,
): Promise<T> {
  if (!preferred) {
    return await fallback()
  }

  try {
    return await preferred()
  } catch (error) {
    logger.warn("Current-tab auto-detect content fetch failed; falling back", {
      error: getErrorMessage(error),
    })
    return await fallback()
  }
}
```

After:

```ts
    const { userId, siteType, sub2apiAuth } = detectResult.data
```

add:

```ts
    const currentTabAutoDetectContext =
      getCurrentTabAutoDetectContext(detectResult.data)
```

Replace the New API/common Cookie and AccessToken `tokenPromise` branches with content fallback:

```ts
    } else if (effectiveAuthType === AuthTypeEnum.Cookie) {
      tokenPromise = withAutoDetectContentFallback(
        siteType === SITE_TYPES.NEW_API && currentTabAutoDetectContext
          ? () =>
              fetchUserInfoViaAutoDetectContent({
                tabId: currentTabAutoDetectContext.tabId,
                baseUrl: url,
                userId,
              })
          : null,
        () =>
          getApiService(siteType).fetchUserInfo({
            baseUrl: url,
            auth: {
              authType: AuthTypeEnum.Cookie,
              userId,
            },
          }),
      )
    } else if (effectiveAuthType === AuthTypeEnum.AccessToken) {
      tokenPromise = withAutoDetectContentFallback(
        siteType === SITE_TYPES.NEW_API && currentTabAutoDetectContext
          ? () =>
              getOrCreateAccessTokenViaAutoDetectContent({
                tabId: currentTabAutoDetectContext.tabId,
                baseUrl: url,
                userId,
              })
          : null,
        () =>
          getApiService(siteType).getOrCreateAccessToken({
            baseUrl: url,
            auth: {
              authType: AuthTypeEnum.Cookie,
              userId,
            },
          }),
      )
```

Keep Sub2API and AIHubMix branches above these unchanged.

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm vitest --run tests/services/accountOperations.autoDetectAccount.test.ts
```

Expected: PASS after updating any strict mock call counts affected by the imported helper mock.

- [ ] **Step 5: Commit Task 3**

Stage only the task files:

```bash
git add src/services/accounts/accountOperations.ts tests/services/accountOperations.autoDetectAccount.test.ts
git commit -m "fix(accounts): use current tab fetch during auto-detect"
```

---

### Task 4: Broaden Current-Tab Auto-Detect Fetch Coverage and Guard Behavior

**Files:**
- Modify: `src/services/accounts/accountOperations.ts`
- Modify: `tests/services/accountOperations.autoDetectAccount.test.ts`
- Modify: `tests/services/accounts/autoDetectContentFetch.test.ts`

- [ ] **Step 1: Add tests for non-New API boundaries**

Add this test to `tests/services/accountOperations.autoDetectAccount.test.ts`:

```ts
  it("does not use current-tab content fetch for Veloera until the route is explicitly supported", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce(null)
    mockAutoDetectSmart.mockResolvedValueOnce({
      success: true,
      data: {
        userId: 7,
        siteType: SITE_TYPES.VELOERA,
        fetchContext: {
          kind: "current-tab",
          tabId: 123,
        },
      },
    })
    mockGetOrCreateAccessToken.mockResolvedValueOnce({
      username: "veloera-user",
      access_token: "veloera-token",
    })
    mockFetchSiteStatus.mockResolvedValueOnce({
      system_name: "Veloera Portal",
    })
    mockFetchSupportCheckIn.mockResolvedValueOnce(false)
    mockExtractDefaultExchangeRate.mockReturnValueOnce(null)

    const result = await autoDetectAccount(
      "https://veloera.example.com",
      AuthTypeEnum.AccessToken,
    )

    expect(result.success).toBe(true)
    expect(mockGetOrCreateAccessTokenViaAutoDetectContent).not.toHaveBeenCalled()
    expect(mockGetOrCreateAccessToken).toHaveBeenCalled()
  })
```

Add this test to `tests/services/accounts/autoDetectContentFetch.test.ts`:

```ts
  it("accepts direct data payloads from the content fetch handler", async () => {
    browserAny.tabs.sendMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        id: 2,
        username: "direct-user",
        access_token: "direct-token",
      },
    })

    const result = await fetchUserInfoViaAutoDetectContent({
      tabId: 123,
      baseUrl: "https://ai.example.com/",
      userId: 2,
    })

    expect(result.username).toBe("direct-user")
    expect(result.access_token).toBe("direct-token")
  })
```

- [ ] **Step 2: Run related tests**

Run:

```bash
pnpm vitest --run tests/services/accountOperations.autoDetectAccount.test.ts tests/services/accounts/autoDetectContentFetch.test.ts
```

Expected: PASS if Task 3 scoped content fetch to `SITE_TYPES.NEW_API` only and Task 2 accepts direct data payloads.

- [ ] **Step 3: Inspect behavior for accidental broad routing**

Open `src/services/accounts/accountOperations.ts` and verify current-tab content fetch is gated by:

```ts
siteType === SITE_TYPES.NEW_API && currentTabAutoDetectContext
```

Do not broaden to all site types in this task. AIHubMix and Sub2API already have distinct token/session models; Veloera can be added later with dedicated tests if needed.

- [ ] **Step 4: Commit Task 4**

Stage only the task files if changed:

```bash
git add src/services/accounts/accountOperations.ts tests/services/accountOperations.autoDetectAccount.test.ts tests/services/accounts/autoDetectContentFetch.test.ts
git commit -m "test(accounts): guard current-tab auto-detect routing"
```

If no implementation changes were needed after tests, commit only the tests.

---

### Task 5: Validation and Final Diff Review

**Files:**
- Validate all changed files.

- [ ] **Step 1: Run targeted related tests**

Run:

```bash
pnpm vitest --run tests/services/autoDetectService.test.ts tests/services/accountOperations.autoDetectAccount.test.ts tests/services/accounts/autoDetectContentFetch.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run pre-commit equivalent validation**

Run:

```bash
pnpm run validate:staged
```

Expected: PASS. If it fails because no files are staged, run the equivalent affected checks instead:

```bash
pnpm compile
pnpm vitest related --run src/services/siteDetection/autoDetectService.ts src/services/accounts/accountOperations.ts src/services/accounts/autoDetectContentFetch.ts
```

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git diff -- src/services/siteDetection/autoDetectService.ts src/services/accounts/accountOperations.ts src/services/accounts/autoDetectContentFetch.ts tests/services/autoDetectService.test.ts tests/services/accountOperations.autoDetectAccount.test.ts tests/services/accounts/autoDetectContentFetch.test.ts
```

Confirm:
- No token, cookie, or private URL values were added.
- The content fetch path is only used during auto-detect completion.
- Existing Sub2API and AIHubMix branches remain unchanged.
- Saved account refresh paths are not routed through current tabs.

- [ ] **Step 4: Commit validation cleanup if needed**

If validation caused formatting changes, stage and commit them with the related task files:

```bash
git add src/services/siteDetection/autoDetectService.ts src/services/accounts/accountOperations.ts src/services/accounts/autoDetectContentFetch.ts tests/services/autoDetectService.test.ts tests/services/accountOperations.autoDetectAccount.test.ts tests/services/accounts/autoDetectContentFetch.test.ts
git commit -m "test(accounts): validate current-tab auto-detect fetch"
```

Skip this commit if there are no new changes.

---

## Self-Review

- Spec coverage: The plan carries current-tab context, uses content fetch during New API auto-detect completion, preserves fallback behavior, and avoids changing saved-account runtime paths.
- Placeholder scan: No `TBD`, `TODO`, or unspecified test steps remain.
- Type consistency: `fetchContext.kind`, `tabId`, and helper names are consistent across detection, account operations, and tests.
- Risk note: The implementation is intentionally scoped to `SITE_TYPES.NEW_API` first. Other compatible site types can be broadened later only after checking their route/header requirements and adding tests.
