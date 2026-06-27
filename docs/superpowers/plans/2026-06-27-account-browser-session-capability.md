# Account Browser Session Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize account-site browser-session reads so Sub2API session import, token re-sync, active-tab account matching, and auto-detect current-tab reads consume one normalized Module instead of duplicating runtime-message orchestration.

**Architecture:** Add `src/services/accountBrowserSession/` as the browser-context orchestration seam. It wraps existing `sendTabMessage`, `getAllTabs`, and `sendRuntimeMessage` calls, while keeping page-local `localStorage` extraction inside the existing `ContentSessionExtractor` path. Then migrate callers one by one without changing runtime action names, background handlers, saved account shape, user-facing copy, or existing `SiteAdapter` API capabilities.

**Tech Stack:** TypeScript, WXT browser helpers, Vitest, Testing Library, existing WebExtension fake-browser test setup.

---

## File Structure

- Create `src/services/accountBrowserSession/types.ts`
  - Owns normalized browser-session result types and input option types.
- Create `src/services/accountBrowserSession/sessionReader.ts`
  - Owns tab selection, runtime-message calls, normalization, predicates, and temp-window fallback.
- Create `src/services/accountBrowserSession/index.ts`
  - Barrel export for callers.
- Create `tests/services/accountBrowserSession/sessionReader.test.ts`
  - Focused TDD coverage for normalization and fallback ordering.
- Modify `src/services/apiService/sub2api/tokenResync.ts`
  - Replace duplicated same-origin tab scan/temp-window fallback with the new Module.
- Modify `tests/services/apiService/sub2api/tokenResync.test.ts`
  - Preserve public behavior while depending on the new Module shape.
- Modify `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
  - Replace Sub2API session import tab scan/temp-window fallback with the new Module.
- Modify `tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx`
  - Preserve existing UI behavior and reduce direct assertions on browser-message internals where they are now covered by service tests.
- Modify `src/features/AccountManagement/hooks/AccountDataContext.tsx`
  - Replace active-tab user verification direct message construction with the new Module.
- Modify `tests/features/AccountManagement/hooks/AccountDataContext.test.tsx`
  - Preserve active-tab account matching behavior.
- Modify `src/services/siteDetection/autoDetectService.ts`
  - Replace current-tab direct content-session message construction with the new Module while keeping API fallback and analytics behavior.
- Modify `tests/services/autoDetectService.test.ts`
  - Preserve current-tab, API fallback, and content-script-unavailable behavior.

---

## Task 1: Add The Account Browser-Session Module

**Files:**

- Create: `src/services/accountBrowserSession/types.ts`
- Create: `src/services/accountBrowserSession/sessionReader.ts`
- Create: `src/services/accountBrowserSession/index.ts`
- Create: `tests/services/accountBrowserSession/sessionReader.test.ts`

- [ ] **Step 1: Write failing tests for tab read normalization and failure handling**

Create `tests/services/accountBrowserSession/sessionReader.test.ts` with these initial tests:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import {
  readAccountBrowserSessionFromTab,
  readAccountBrowserSessionFromExistingTabs,
  resolveAccountBrowserSession,
} from "~/services/accountBrowserSession"

const {
  mockGetAllTabs,
  mockGetBrowserApiCapabilities,
  mockSendRuntimeMessage,
  mockSendTabMessage,
} = vi.hoisted(() => ({
  mockGetAllTabs: vi.fn(),
  mockGetBrowserApiCapabilities: vi.fn(),
  mockSendRuntimeMessage: vi.fn(),
  mockSendTabMessage: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  getAllTabs: mockGetAllTabs,
  getBrowserApiCapabilities: mockGetBrowserApiCapabilities,
  sendRuntimeMessage: mockSendRuntimeMessage,
  sendTabMessage: mockSendTabMessage,
}))

describe("account browser-session reader", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetBrowserApiCapabilities.mockReturnValue({
      hasWindows: true,
      hasTabs: true,
      hasBackgroundMessaging: true,
    })
  })

  it("reads and normalizes a successful tab content-session response", async () => {
    mockSendTabMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: 42,
        user: { username: " tab-user " },
        accessToken: " jwt-from-tab ",
        siteTypeHint: SITE_TYPES.SUB2API,
        sub2apiAuth: {
          refreshToken: " refresh-token ",
          tokenExpiresAt: 123456,
        },
      },
    })

    const session = await readAccountBrowserSessionFromTab({
      tabId: 12,
      baseUrl: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      fetchContext: {
        kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
        tabId: 12,
        origin: "https://sub2.example.com",
        incognito: true,
        cookieStoreId: "firefox-container-1",
      },
    })

    expect(session).toEqual({
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      siteType: SITE_TYPES.SUB2API,
      userId: "42",
      user: { username: " tab-user " },
      accessToken: "jwt-from-tab",
      siteTypeHint: SITE_TYPES.SUB2API,
      sub2apiAuth: {
        refreshToken: "refresh-token",
        tokenExpiresAt: 123456,
      },
      fetchContext: {
        kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
        tabId: 12,
        origin: "https://sub2.example.com",
        incognito: true,
        cookieStoreId: "firefox-container-1",
      },
    })
    expect(mockSendTabMessage).toHaveBeenCalledWith(12, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
    })
  })

  it("returns null for failed or unusable tab responses", async () => {
    mockSendTabMessage
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true, data: { userId: "   " } })
      .mockRejectedValueOnce(new Error("receiver missing"))

    await expect(
      readAccountBrowserSessionFromTab({
        tabId: 1,
        baseUrl: "https://sub2.example.com",
        siteType: SITE_TYPES.SUB2API,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      }),
    ).resolves.toBeNull()
    await expect(
      readAccountBrowserSessionFromTab({
        tabId: 1,
        baseUrl: "https://sub2.example.com",
        siteType: SITE_TYPES.SUB2API,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      }),
    ).resolves.toBeNull()
    await expect(
      readAccountBrowserSessionFromTab({
        tabId: 1,
        baseUrl: "https://sub2.example.com",
        siteType: SITE_TYPES.SUB2API,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      }),
    ).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
pnpm vitest run tests/services/accountBrowserSession/sessionReader.test.ts
```

Expected: fail because `~/services/accountBrowserSession` does not exist.

- [ ] **Step 3: Implement the public types**

Create `src/services/accountBrowserSession/types.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"
import type { ApiServiceFetchContext } from "~/services/apiService/common/type"
import type { Sub2ApiAuthConfig } from "~/types"

export const ACCOUNT_BROWSER_SESSION_SOURCES = {
  CURRENT_TAB: "current_tab",
  EXISTING_TAB: "existing_tab",
  TEMP_WINDOW: "temp_window",
} as const

export type AccountBrowserSessionSource =
  (typeof ACCOUNT_BROWSER_SESSION_SOURCES)[keyof typeof ACCOUNT_BROWSER_SESSION_SOURCES]

export type AccountBrowserSessionFetchContext = ApiServiceFetchContext

export type AccountBrowserSession = {
  source: AccountBrowserSessionSource
  siteType: AccountSiteType
  siteTypeHint?: AccountSiteType
  userId: string
  user: Record<string, unknown>
  accessToken?: string
  sub2apiAuth?: Sub2ApiAuthConfig
  fetchContext?: AccountBrowserSessionFetchContext
}

export type AccountBrowserSessionPredicate = (
  session: AccountBrowserSession,
) => boolean

export type ReadAccountBrowserSessionFromTabOptions = {
  tabId: number
  baseUrl: string
  siteType: AccountSiteType
  source: Extract<
    AccountBrowserSessionSource,
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB
  >
  fetchContext?: AccountBrowserSessionFetchContext
}

export type ReadAccountBrowserSessionFromExistingTabsOptions = {
  baseUrl: string
  siteType: AccountSiteType
  isUsableSession?: AccountBrowserSessionPredicate
}

export type ResolveAccountBrowserSessionOptions = {
  baseUrl: string
  siteType: AccountSiteType
  currentTab?: {
    tabId: number
    incognito?: boolean
    cookieStoreId?: string
  }
  useExistingTabs?: boolean
  useTempWindow?: boolean
  suppressMinimize?: boolean
  requestIdPrefix?: string
  isUsableSession?: AccountBrowserSessionPredicate
}
```

- [ ] **Step 4: Implement tab reading and normalization**

Create `src/services/accountBrowserSession/sessionReader.ts`:

```ts
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { isAccountSiteType } from "~/constants/siteType"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import {
  getAllTabs,
  getBrowserApiCapabilities,
  sendRuntimeMessage,
  sendTabMessage,
} from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { tryParseOrigin } from "~/utils/core/urlParsing"

import type {
  AccountBrowserSession,
  AccountBrowserSessionFetchContext,
  ReadAccountBrowserSessionFromExistingTabsOptions,
  ReadAccountBrowserSessionFromTabOptions,
  ResolveAccountBrowserSessionOptions,
} from "./types"

const logger = createLogger("AccountBrowserSession")

const hasNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const normalizeOptionalString = (value: unknown): string | undefined =>
  hasNonEmptyString(value) ? value.trim() : undefined

const normalizeSub2ApiAuth = (
  value: unknown,
): AccountBrowserSession["sub2apiAuth"] => {
  if (!value || typeof value !== "object") return undefined

  const refreshToken = normalizeOptionalString(
    (value as { refreshToken?: unknown }).refreshToken,
  )
  if (!refreshToken) return undefined

  const tokenExpiresAt = (value as { tokenExpiresAt?: unknown }).tokenExpiresAt

  return {
    refreshToken,
    ...(typeof tokenExpiresAt === "number" && Number.isFinite(tokenExpiresAt)
      ? { tokenExpiresAt }
      : {}),
  }
}

const normalizeSessionData = (
  data: unknown,
  options: {
    source: AccountBrowserSession["source"]
    siteType: AccountBrowserSession["siteType"]
    fetchContext?: AccountBrowserSessionFetchContext
  },
): AccountBrowserSession | null => {
  if (!data || typeof data !== "object") return null

  const payload = data as {
    userId?: unknown
    user?: unknown
    accessToken?: unknown
    siteTypeHint?: unknown
    siteType?: unknown
    sub2apiAuth?: unknown
    fetchContext?: AccountBrowserSessionFetchContext
  }

  const userId = normalizeAccountIdentity(payload.userId)
  if (!userId) return null

  const user =
    payload.user && typeof payload.user === "object" && !Array.isArray(payload.user)
      ? (payload.user as Record<string, unknown>)
      : { id: userId, username: userId }
  const accessToken = normalizeOptionalString(payload.accessToken)
  const siteTypeHint = isAccountSiteType(payload.siteTypeHint)
    ? payload.siteTypeHint
    : isAccountSiteType(payload.siteType)
      ? payload.siteType
      : undefined
  const sub2apiAuth = normalizeSub2ApiAuth(payload.sub2apiAuth)
  const fetchContext = options.fetchContext ?? payload.fetchContext

  return {
    source: options.source,
    siteType: options.siteType,
    ...(siteTypeHint ? { siteTypeHint } : {}),
    userId,
    user,
    ...(accessToken ? { accessToken } : {}),
    ...(sub2apiAuth ? { sub2apiAuth } : {}),
    ...(fetchContext ? { fetchContext } : {}),
  }
}

export async function readAccountBrowserSessionFromTab(
  options: ReadAccountBrowserSessionFromTabOptions,
): Promise<AccountBrowserSession | null> {
  try {
    const response = await sendTabMessage(options.tabId, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: options.baseUrl,
      siteType: options.siteType,
    })

    if (!response?.success || !response.data) return null

    return normalizeSessionData(response.data, {
      source: options.source,
      siteType: options.siteType,
      fetchContext: options.fetchContext,
    })
  } catch (error) {
    logger.debug("Failed to read account browser session from tab", {
      tabId: options.tabId,
      siteType: options.siteType,
      error,
    })
    return null
  }
}

const getSameOriginTabs = async (baseUrl: string) => {
  const origin = tryParseOrigin(baseUrl)
  if (!origin) return []
  if (!getBrowserApiCapabilities().hasTabs) return []

  const tabs = await getAllTabs().catch(() => [])
  return tabs
    .filter((tab) => {
      if (!tab?.id || !tab.url) return false
      return tryParseOrigin(tab.url) === origin
    })
    .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)))
}

export async function readAccountBrowserSessionFromExistingTabs(
  options: ReadAccountBrowserSessionFromExistingTabsOptions,
): Promise<AccountBrowserSession | null> {
  const tabs = await getSameOriginTabs(options.baseUrl)

  for (const tab of tabs) {
    const tabId = tab.id
    if (typeof tabId !== "number") continue

    const session = await readAccountBrowserSessionFromTab({
      tabId,
      baseUrl: options.baseUrl,
      siteType: options.siteType,
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })

    if (session && (!options.isUsableSession || options.isUsableSession(session))) {
      return session
    }
  }

  return null
}

const readAccountBrowserSessionFromTempWindow = async (
  options: ResolveAccountBrowserSessionOptions,
): Promise<AccountBrowserSession | null> => {
  try {
    const response = await sendRuntimeMessage({
      action: RuntimeActionIds.AutoDetectSite,
      url: options.baseUrl,
      requestId: `${options.requestIdPrefix ?? "account-browser-session"}-${Date.now()}`,
      ...(options.suppressMinimize ? { suppressMinimize: true } : {}),
      ...(options.currentTab?.incognito === true ? { useIncognito: true } : {}),
      ...(options.currentTab?.cookieStoreId
        ? { cookieStoreId: options.currentTab.cookieStoreId }
        : {}),
    })

    if (!response?.success || !response.data) return null

    return normalizeSessionData(response.data, {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
      siteType: options.siteType,
    })
  } catch (error) {
    logger.debug("Failed to read account browser session from temp window", {
      siteType: options.siteType,
      error,
    })
    return null
  }
}

export async function resolveAccountBrowserSession(
  options: ResolveAccountBrowserSessionOptions,
): Promise<AccountBrowserSession | null> {
  const isUsable = options.isUsableSession ?? (() => true)

  if (options.currentTab) {
    const origin = tryParseOrigin(options.baseUrl)
    const session = await readAccountBrowserSessionFromTab({
      tabId: options.currentTab.tabId,
      baseUrl: options.baseUrl,
      siteType: options.siteType,
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      fetchContext: {
        kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
        tabId: options.currentTab.tabId,
        ...(origin ? { origin } : {}),
        ...(options.currentTab.incognito === true ? { incognito: true } : {}),
        ...(options.currentTab.cookieStoreId
          ? { cookieStoreId: options.currentTab.cookieStoreId }
          : {}),
      },
    })
    if (session && isUsable(session)) return session
  }

  if (options.useExistingTabs) {
    const session = await readAccountBrowserSessionFromExistingTabs({
      baseUrl: options.baseUrl,
      siteType: options.siteType,
      isUsableSession: isUsable,
    })
    if (session) return session
  }

  if (options.useTempWindow) {
    const session = await readAccountBrowserSessionFromTempWindow(options)
    if (session && isUsable(session)) return session
  }

  return null
}
```

- [ ] **Step 5: Add the barrel export**

Create `src/services/accountBrowserSession/index.ts`:

```ts
export * from "./sessionReader"
export * from "./types"
```

- [ ] **Step 6: Run tests to verify GREEN**

Run:

```powershell
pnpm vitest run tests/services/accountBrowserSession/sessionReader.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Add fallback-order and predicate tests**

Append these tests inside the same `describe` block:

```ts
  it("filters same-origin tabs, tries the active tab first, and honors the usability predicate", async () => {
    mockGetAllTabs.mockResolvedValueOnce([
      { id: 1, url: "https://other.example.com/dashboard", active: true },
      { id: 2, url: "https://sub2.example.com/settings", active: false },
      { id: 3, url: "https://sub2.example.com/console", active: true },
    ])
    mockSendTabMessage
      .mockResolvedValueOnce({
        success: true,
        data: {
          userId: "1",
          user: { username: "without-refresh" },
          accessToken: "token-1",
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          userId: "2",
          user: { username: "with-refresh" },
          accessToken: "token-2",
          sub2apiAuth: { refreshToken: "refresh-2" },
        },
      })

    const session = await readAccountBrowserSessionFromExistingTabs({
      baseUrl: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
      isUsableSession: (candidate) =>
        Boolean(candidate.sub2apiAuth?.refreshToken),
    })

    expect(session?.userId).toBe("2")
    expect(session?.source).toBe(ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB)
    expect(mockSendTabMessage).toHaveBeenNthCalledWith(1, 3, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
    })
    expect(mockSendTabMessage).toHaveBeenNthCalledWith(2, 2, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
    })
  })

  it("falls back to temp-window auto-detect when existing tabs are unusable", async () => {
    mockGetAllTabs.mockResolvedValueOnce([
      { id: 10, url: "https://sub2.example.com/dashboard", active: true },
    ])
    mockSendTabMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "10",
        user: { username: "tab-user" },
        accessToken: "tab-token",
      },
    })
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      data: {
        userId: "11",
        user: { username: "temp-user" },
        accessToken: "temp-token",
        sub2apiAuth: { refreshToken: "temp-refresh" },
      },
    })

    const session = await resolveAccountBrowserSession({
      baseUrl: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
      useExistingTabs: true,
      useTempWindow: true,
      requestIdPrefix: "test-session",
      isUsableSession: (candidate) =>
        Boolean(candidate.sub2apiAuth?.refreshToken),
    })

    expect(session).toEqual(
      expect.objectContaining({
        source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
        userId: "11",
        accessToken: "temp-token",
        sub2apiAuth: { refreshToken: "temp-refresh" },
      }),
    )
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.AutoDetectSite,
        url: "https://sub2.example.com",
        requestId: expect.stringMatching(/^test-session-/),
      }),
    )
  })
```

- [ ] **Step 8: Run tests to verify GREEN**

Run:

```powershell
pnpm vitest run tests/services/accountBrowserSession/sessionReader.test.ts
```

Expected: all tests pass.

- [ ] **Step 9: Commit Task 1**

Run:

```powershell
git add src/services/accountBrowserSession tests/services/accountBrowserSession
git commit -m "feat(account-session): add browser session reader"
```

Expected: commit succeeds after the staged validation hook.

---

## Task 2: Migrate Sub2API Token Re-Sync

**Files:**

- Modify: `src/services/apiService/sub2api/tokenResync.ts`
- Modify: `tests/services/apiService/sub2api/tokenResync.test.ts`
- Read: `src/services/accountBrowserSession/sessionReader.ts`

- [ ] **Step 1: Write failing mock-seam tests**

Replace the browser API mock in `tests/services/apiService/sub2api/tokenResync.test.ts` with an account browser-session mock:

```ts
const { mockResolveAccountBrowserSession } = vi.hoisted(() => ({
  mockResolveAccountBrowserSession: vi.fn(),
}))

vi.mock("~/services/accountBrowserSession", () => ({
  resolveAccountBrowserSession: mockResolveAccountBrowserSession,
}))
```

Keep imports of `RuntimeActionIds` only if another assertion still needs it; otherwise remove it.

Rewrite the behavior tests to assert the public contract and the new dependency:

```ts
it("returns an existing-tab token from the browser-session reader", async () => {
  mockResolveAccountBrowserSession.mockResolvedValueOnce({
    source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    siteType: "sub2api",
    userId: "42",
    user: { username: "tab-user" },
    accessToken: " token-from-tab ",
  })

  await expect(
    resyncSub2ApiAuthToken("https://sub2.example.com"),
  ).resolves.toEqual({
    accessToken: "token-from-tab",
    source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
  })
  expect(mockResolveAccountBrowserSession).toHaveBeenCalledWith(
    expect.objectContaining({
      baseUrl: "https://sub2.example.com",
      siteType: "sub2api",
      useExistingTabs: true,
      useTempWindow: true,
      requestIdPrefix: "sub2api-token-resync",
      isUsableSession: expect.any(Function),
    }),
  )
})

it("maps current-tab source to the existing public existing-tab source", async () => {
  mockResolveAccountBrowserSession.mockResolvedValueOnce({
    source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
    siteType: "sub2api",
    userId: "42",
    user: { username: "tab-user" },
    accessToken: "current-tab-token",
  })

  await expect(
    resyncSub2ApiAuthToken("https://sub2.example.com"),
  ).resolves.toEqual({
    accessToken: "current-tab-token",
    source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
  })
})

it("returns a temp-window token from the browser-session reader", async () => {
  mockResolveAccountBrowserSession.mockResolvedValueOnce({
    source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
    siteType: "sub2api",
    userId: "7",
    user: { username: "temp-user" },
    accessToken: " temp-window-token ",
  })

  await expect(
    resyncSub2ApiAuthToken("https://sub2.example.com"),
  ).resolves.toEqual({
    accessToken: "temp-window-token",
    source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
  })
})

it("returns null when the browser-session reader finds no usable token", async () => {
  mockResolveAccountBrowserSession.mockResolvedValueOnce(null)

  await expect(
    resyncSub2ApiAuthToken("https://sub2.example.com"),
  ).resolves.toBeNull()
})
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```powershell
pnpm vitest run tests/services/apiService/sub2api/tokenResync.test.ts
```

Expected: fail because `tokenResync.ts` still uses direct browser helper imports and does not call `resolveAccountBrowserSession`.

- [ ] **Step 3: Replace `tokenResync.ts` implementation**

Replace the direct browser orchestration in `src/services/apiService/sub2api/tokenResync.ts` with:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  resolveAccountBrowserSession,
  type AccountBrowserSession,
} from "~/services/accountBrowserSession"

type Sub2ApiResyncedToken = {
  accessToken: string
  source:
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW
}

const hasUsableAccessToken = (session: AccountBrowserSession): boolean =>
  typeof session.accessToken === "string" && session.accessToken.trim().length > 0

const mapResyncSource = (
  source: AccountBrowserSession["source"],
): Sub2ApiResyncedToken["source"] => {
  switch (source) {
    case ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB:
    case ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB:
      return ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB
    case ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW:
      return ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW
    default: {
      const exhaustive: never = source
      return exhaustive
    }
  }
}

/**
 * Re-sync Sub2API JWT from browser-session state.
 *
 * Strategy:
 * 1) Prefer an already-open same-origin tab through the browser-session reader.
 * 2) Fall back to the temp-window auto-detect context.
 */
export async function resyncSub2ApiAuthToken(
  baseUrl: string,
): Promise<Sub2ApiResyncedToken | null> {
  const session = await resolveAccountBrowserSession({
    baseUrl,
    siteType: SITE_TYPES.SUB2API,
    useExistingTabs: true,
    useTempWindow: true,
    requestIdPrefix: "sub2api-token-resync",
    isUsableSession: hasUsableAccessToken,
  })

  const accessToken = session?.accessToken?.trim()
  if (!session || !accessToken) return null

  return {
    accessToken,
    source: mapResyncSource(session.source),
  }
}
```

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```powershell
pnpm vitest run tests/services/accountBrowserSession/sessionReader.test.ts tests/services/apiService/sub2api/tokenResync.test.ts
```

Expected: both suites pass.

- [ ] **Step 5: Commit Task 2**

Run:

```powershell
git add src/services/apiService/sub2api/tokenResync.ts tests/services/apiService/sub2api/tokenResync.test.ts
git commit -m "refactor(sub2api): use browser session reader for token resync"
```

Expected: commit succeeds after the staged validation hook.

---

## Task 3: Migrate Sub2API Session Import In Account Dialog

**Files:**

- Modify: `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Modify: `tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx`
- Read: `src/services/accountBrowserSession/sessionReader.ts`

- [ ] **Step 1: Add a failing test that mocks the new Module instead of browser APIs**

At the top of `tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx`, add a hoisted mock:

```ts
const {
  mockOpenWithAccount,
  mockOpenDefaultTokenQuickCreateDialogForAccount,
  mockResolveAccountBrowserSession,
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockOpenWithAccount: vi.fn(),
  mockOpenDefaultTokenQuickCreateDialogForAccount: vi.fn(),
  mockResolveAccountBrowserSession: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}))

vi.mock("~/services/accountBrowserSession", () => ({
  resolveAccountBrowserSession: mockResolveAccountBrowserSession,
}))
```

If the file already has a `vi.hoisted` block for dialog/toast mocks, merge this into that existing block instead of creating a second block with duplicate names.

In `beforeEach`, reset the new mock:

```ts
mockResolveAccountBrowserSession.mockResolvedValue(null)
```

Add this test near the existing Sub2API import tests:

```ts
it("imports Sub2API session data through the browser-session reader", async () => {
  mockResolveAccountBrowserSession.mockResolvedValueOnce({
    source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    siteType: SITE_TYPES.SUB2API,
    userId: "42",
    user: { username: "tab-user" },
    accessToken: "jwt-from-reader",
    sub2apiAuth: {
      refreshToken: "refresh-from-reader",
      tokenExpiresAt: 123456,
    },
  })

  const { result } = renderHook(() =>
    useAccountDialog({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    }),
  )

  await waitFor(() => {
    expect(result.current.state).toBeTruthy()
  })

  await act(async () => {
    result.current.setters.setUrl("https://sub2.example.com")
    result.current.setters.setSiteType(SITE_TYPES.SUB2API)
  })

  await act(async () => {
    await result.current.handlers.handleImportSub2apiSession()
  })

  expect(mockResolveAccountBrowserSession).toHaveBeenCalledWith(
    expect.objectContaining({
      baseUrl: "https://sub2.example.com",
      siteType: SITE_TYPES.SUB2API,
      useExistingTabs: true,
      useTempWindow: true,
      requestIdPrefix: "account-dialog-sub2api-import",
      isUsableSession: expect.any(Function),
    }),
  )
  expect(result.current.state.sub2apiRefreshToken).toBe("refresh-from-reader")
  expect(result.current.state.sub2apiTokenExpiresAt).toBe(123456)
  expect(result.current.state.accessToken).toBe("jwt-from-reader")
  expect(result.current.state.userId).toBe("42")
  expect(result.current.state.username).toBe("tab-user")
  expect(mockToastSuccess).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the account-dialog suite to verify RED**

Run:

```powershell
pnpm vitest run tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx
```

Expected: fail because `handleImportSub2apiSession` still scans tabs and calls runtime messages directly.

- [ ] **Step 3: Migrate `handleImportSub2apiSession`**

In `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`:

Remove unused imports after the migration:

```ts
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  getAllTabs,
  getBrowserApiCapabilities,
  sendRuntimeMessage,
  sendTabMessage,
} from "~/utils/browser/browserApi"
import { tryParseOrigin } from "~/utils/core/urlParsing"
```

Add this import:

```ts
import {
  resolveAccountBrowserSession,
  type AccountBrowserSession,
} from "~/services/accountBrowserSession"
```

Replace the browser-scanning body inside `handleImportSub2apiSession` with:

```ts
      const baseUrl = url.trim()
      const hasUsableSub2apiRefreshToken = (
        value: AccountBrowserSession | null,
      ): value is AccountBrowserSession =>
        typeof value?.sub2apiAuth?.refreshToken === "string" &&
        value.sub2apiAuth.refreshToken.trim().length > 0

      const imported = await resolveAccountBrowserSession({
        baseUrl,
        siteType: SITE_TYPES.SUB2API,
        useExistingTabs: true,
        useTempWindow: true,
        requestIdPrefix: "account-dialog-sub2api-import",
        isUsableSession: hasUsableSub2apiRefreshToken,
      })

      const refreshToken = imported?.sub2apiAuth?.refreshToken?.trim() ?? ""
```

Keep the existing draft update logic, but read fields from `imported`:

```ts
      const tokenExpiresAtRaw = imported?.sub2apiAuth?.tokenExpiresAt
      const importedAccessToken = imported?.accessToken?.trim() ?? ""
      const importedUserId = normalizeAccountIdentity(imported?.userId) ?? ""
      const importedUsername =
        typeof imported?.user?.username === "string"
          ? imported.user.username.trim()
          : ""
```

- [ ] **Step 4: Update existing tests that asserted direct browser API calls**

For tests in `useAccountDialog.sub2apiConstraints.test.tsx` that currently set up `getAllTabs`, `globalThis.browser.tabs.sendMessage`, or `sendRuntimeMessage` solely for Sub2API session import, either:

- convert them to mock `mockResolveAccountBrowserSession` results, or
- delete the direct browser-message assertion when the behavior is already covered by `tests/services/accountBrowserSession/sessionReader.test.ts`.

Preserve these user-visible assertions:

- session import fills refresh token, expiry, access token, user id, and username
- missing refresh token keeps draft fields empty and shows `mockToastError`
- successful import shows `mockToastSuccess`

Use this missing-session test shape:

```ts
it("shows the existing missing-session feedback when the reader cannot provide a refresh token", async () => {
  mockResolveAccountBrowserSession.mockResolvedValueOnce(null)

  const { result } = renderHook(() =>
    useAccountDialog({
      mode: DIALOG_MODES.ADD,
      isOpen: true,
      onClose: vi.fn(),
      onSuccess: vi.fn(),
    }),
  )

  await waitFor(() => {
    expect(result.current.state).toBeTruthy()
  })

  await act(async () => {
    result.current.setters.setUrl("https://sub2.example.com")
    result.current.setters.setSiteType(SITE_TYPES.SUB2API)
  })

  await act(async () => {
    await result.current.handlers.handleImportSub2apiSession()
  })

  expect(result.current.state.sub2apiRefreshToken).toBe("")
  expect(result.current.state.accessToken).toBe("")
  expect(result.current.state.userId).toBe("")
  expect(mockToastError).toHaveBeenCalled()
})
```

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```powershell
pnpm vitest run tests/services/accountBrowserSession/sessionReader.test.ts tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx
```

Expected: both suites pass.

- [ ] **Step 6: Commit Task 3**

Run:

```powershell
git add src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx
git commit -m "refactor(account-dialog): use browser session reader for sub2api import"
```

Expected: commit succeeds after the staged validation hook.

---

## Task 4: Migrate Active-Tab Account Matching

**Files:**

- Modify: `src/features/AccountManagement/hooks/AccountDataContext.tsx`
- Modify: `tests/features/AccountManagement/hooks/AccountDataContext.test.tsx`
- Read: `src/services/accountBrowserSession/sessionReader.ts`

- [ ] **Step 1: Add a failing test/mock seam for AccountDataContext**

In `tests/features/AccountManagement/hooks/AccountDataContext.test.tsx`, add a hoisted mock:

```ts
const {
  mockReadAccountBrowserSessionFromTab,
  // keep existing hoisted mocks in this file
} = vi.hoisted(() => ({
  mockReadAccountBrowserSessionFromTab: vi.fn(),
  // keep existing mock initializers
}))

vi.mock("~/services/accountBrowserSession", () => ({
  readAccountBrowserSessionFromTab: mockReadAccountBrowserSessionFromTab,
}))
```

Merge this with the file's existing `vi.hoisted` block. Do not create duplicate `const` declarations.

Set the default in `beforeEach`:

```ts
mockReadAccountBrowserSessionFromTab.mockResolvedValue(null)
```

Update the existing test `"matches the active tab user to the correct same-origin account"` so the browser-session mock returns the current tab user:

```ts
mockReadAccountBrowserSessionFromTab.mockResolvedValueOnce({
  source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
  siteType: "new-api",
  userId: "42",
  user: { id: "42", username: "42" },
  fetchContext: {
    kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
    tabId: 7,
    origin: "https://api.example.com",
  },
})
```

Replace the final `globalThis.browser.tabs.sendMessage` assertion with:

```ts
expect(mockReadAccountBrowserSessionFromTab).toHaveBeenCalledWith({
  tabId: 7,
  baseUrl: "https://api.example.com",
  siteType: "new-api",
  source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
  fetchContext: {
    kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
    tabId: 7,
    origin: "https://api.example.com",
  },
})
```

- [ ] **Step 2: Run the suite to verify RED**

Run:

```powershell
pnpm vitest run tests/features/AccountManagement/hooks/AccountDataContext.test.tsx
```

Expected: fail because `AccountDataContext` still calls `sendTabMessage` directly.

- [ ] **Step 3: Migrate `AccountDataContext` active-tab read**

In `src/features/AccountManagement/hooks/AccountDataContext.tsx`, remove these imports if they become unused:

```ts
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { sendTabMessage } from "~/utils/browser/browserApi"
```

Keep the other browser helper imports.

Add:

```ts
import { readAccountBrowserSessionFromTab } from "~/services/accountBrowserSession"
```

Replace the direct `sendTabMessage` block with:

```ts
          const session = await readAccountBrowserSessionFromTab({
            tabId,
            baseUrl: parsedUrl.origin,
            siteType: siteTypeForUserRead,
            source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
            fetchContext: {
              kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
              tabId,
              origin: parsedUrl.origin,
            },
          })

          verifiedUserId = session?.userId ?? null
          verifiedUser = session?.user ?? null
```

Preserve the existing cache assignment and error handling structure.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```powershell
pnpm vitest run tests/services/accountBrowserSession/sessionReader.test.ts tests/features/AccountManagement/hooks/AccountDataContext.test.tsx
```

Expected: both suites pass.

- [ ] **Step 5: Commit Task 4**

Run:

```powershell
git add src/features/AccountManagement/hooks/AccountDataContext.tsx tests/features/AccountManagement/hooks/AccountDataContext.test.tsx
git commit -m "refactor(account-data): use browser session reader for active tab matching"
```

Expected: commit succeeds after the staged validation hook.

---

## Task 5: Migrate Auto-Detect Current-Tab Read

**Files:**

- Modify: `src/services/siteDetection/autoDetectService.ts`
- Modify: `tests/services/autoDetectService.test.ts`
- Read: `src/services/accountBrowserSession/sessionReader.ts`

- [ ] **Step 1: Add a failing mock-seam test**

In `tests/services/autoDetectService.test.ts`, add a hoisted mock:

```ts
const {
  mockFetchUserInfo,
  mockGetActiveOrAllTabs,
  mockGetActiveTabs,
  mockGetAccountSiteType,
  mockGetSiteAdapter,
  mockIsMessageReceiverUnavailableError,
  mockReadAccountBrowserSessionFromTab,
  mockSendRuntimeMessage,
} = vi.hoisted(() => ({
  mockFetchUserInfo: vi.fn(),
  mockGetActiveOrAllTabs: vi.fn(),
  mockGetActiveTabs: vi.fn(),
  mockGetAccountSiteType: vi.fn(),
  mockGetSiteAdapter: vi.fn(),
  mockIsMessageReceiverUnavailableError: vi.fn(),
  mockReadAccountBrowserSessionFromTab: vi.fn(),
  mockSendRuntimeMessage: vi.fn(),
}))

vi.mock("~/services/accountBrowserSession", () => ({
  readAccountBrowserSessionFromTab: mockReadAccountBrowserSessionFromTab,
}))
```

Merge this with the existing hoisted block instead of duplicating it.

Set default:

```ts
mockReadAccountBrowserSessionFromTab.mockResolvedValue(null)
```

Add this test near current-tab tests:

```ts
it("uses the browser-session reader for current-tab auto-detect before API fallback", async () => {
  mockGetAccountSiteType.mockResolvedValueOnce(SITE_TYPES.SUB2API)
  mockGetActiveOrAllTabs.mockResolvedValue([
    {
      id: 201,
      active: true,
      url: "https://sub2.example.com/dashboard",
    },
  ])
  mockReadAccountBrowserSessionFromTab.mockResolvedValueOnce({
    source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
    siteType: SITE_TYPES.SUB2API,
    siteTypeHint: SITE_TYPES.SUB2API,
    userId: "42",
    user: { username: "tab-user" },
    accessToken: "jwt-from-tab",
    sub2apiAuth: { refreshToken: "refresh-from-tab" },
    fetchContext: {
      kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
      tabId: 201,
      origin: "https://sub2.example.com",
    },
  })

  const result = await autoDetectSmart("https://sub2.example.com/console")

  expect(result.success).toBe(true)
  expect(result.data).toEqual(
    expect.objectContaining({
      userId: "42",
      accessToken: "jwt-from-tab",
      sub2apiAuth: { refreshToken: "refresh-from-tab" },
      siteType: SITE_TYPES.SUB2API,
    }),
  )
  expect(mockReadAccountBrowserSessionFromTab).toHaveBeenCalledWith({
    tabId: 201,
    baseUrl: "https://sub2.example.com/console",
    siteType: SITE_TYPES.SUB2API,
    source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
    fetchContext: {
      kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
      tabId: 201,
      origin: "https://sub2.example.com",
    },
  })
  expect(mockFetchUserInfo).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run auto-detect suite to verify RED**

Run:

```powershell
pnpm vitest run tests/services/autoDetectService.test.ts
```

Expected: fail because `autoDetectService.ts` still calls `sendTabMessage` directly.

- [ ] **Step 3: Migrate current-tab content-session read**

In `src/services/siteDetection/autoDetectService.ts`, remove `sendTabMessage` from the browser helper import if it becomes unused.

Add:

```ts
import { readAccountBrowserSessionFromTab } from "~/services/accountBrowserSession"
```

In `getUserDataFromCurrentTab(...)`, replace the direct `sendTabMessage` call with:

```ts
      const session = await readAccountBrowserSessionFromTab({
        tabId,
        baseUrl: url,
        siteType,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
        fetchContext,
      })

      if (session) {
        return {
          userData: {
            userId: session.userId,
            user: session.user,
            accessToken: session.accessToken,
            sub2apiAuth: session.sub2apiAuth,
            siteTypeHint: normalizeSiteTypeHint(session.siteTypeHint),
            fetchContext,
          },
          contentScriptUnavailable,
          strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
          fetchContext,
        }
      }
```

Because the helper returns `null` for both failed responses and thrown content-message errors, preserve reload-hint behavior by passing an `onError` callback with the reader source context into `readAccountBrowserSessionFromTab`.

Extend `ReadAccountBrowserSessionFromTabOptions` in `types.ts`:

```ts
export type AccountBrowserSessionErrorContext = {
  source: AccountBrowserSessionSource
}

export type AccountBrowserSessionErrorHandler = (
  error: unknown,
  context: AccountBrowserSessionErrorContext,
) => void

// ...
  onError?: AccountBrowserSessionErrorHandler
```

In `readAccountBrowserSessionFromTab(...)` catch block:

```ts
    options.onError?.(error, { source: options.source })
```

Then call it from auto-detect:

```ts
        onError(error) {
          contentScriptUnavailable = isMessageReceiverUnavailableError(error)

          if (contentScriptUnavailable) {
            logger.warn("当前标签页 content script 不可用，尝试 API 降级", {
              url,
              tabId,
              fetchContext: summarizeApiServiceFetchContext(fetchContext),
              error: getErrorMessage(error),
            })
          } else {
            logger.warn("从当前标签页获取用户数据失败", {
              url,
              tabId,
              fetchContext: summarizeApiServiceFetchContext(fetchContext),
              error: getErrorMessage(error),
            })
          }
        },
```

- [ ] **Step 4: Add or adjust `onError` test coverage in the browser-session suite**

In `tests/services/accountBrowserSession/sessionReader.test.ts`, add:

```ts
  it("notifies callers about tab read errors without throwing", async () => {
    const onError = vi.fn()
    const error = new Error("receiver missing")
    mockSendTabMessage.mockRejectedValueOnce(error)

    await expect(
      readAccountBrowserSessionFromTab({
        tabId: 1,
        baseUrl: "https://sub2.example.com",
        siteType: SITE_TYPES.SUB2API,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
        onError,
      }),
    ).resolves.toBeNull()
    expect(onError).toHaveBeenCalledWith(error, {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
    })
  })
```

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```powershell
pnpm vitest run tests/services/accountBrowserSession/sessionReader.test.ts tests/services/autoDetectService.test.ts
```

Expected: both suites pass.

- [ ] **Step 6: Run all migrated focused suites together**

Run:

```powershell
pnpm vitest run tests/services/accountBrowserSession/sessionReader.test.ts tests/services/apiService/sub2api/tokenResync.test.ts tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx tests/features/AccountManagement/hooks/AccountDataContext.test.tsx tests/services/autoDetectService.test.ts
```

Expected: all suites pass.

- [ ] **Step 7: Commit Task 5**

Run:

```powershell
git add src/services/accountBrowserSession src/services/siteDetection/autoDetectService.ts tests/services/accountBrowserSession/sessionReader.test.ts tests/services/autoDetectService.test.ts
git commit -m "refactor(autodetect): use browser session reader for current tab"
```

Expected: commit succeeds after the staged validation hook.

---

## Task 6: Final Validation And Cleanup

**Files:**

- Inspect all task-scoped files from Tasks 1-5.
- Do not touch unrelated untracked root handoff files.

- [ ] **Step 1: Search for remaining direct session-read duplication**

Run:

```powershell
rg -n "ContentGetUserFromLocalStorage|AutoDetectSite|getAllTabs\\(|sendTabMessage\\(" src/services/apiService/sub2api/tokenResync.ts src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts src/features/AccountManagement/hooks/AccountDataContext.tsx src/services/siteDetection/autoDetectService.ts
```

Expected:

- `tokenResync.ts`: no direct `ContentGetUserFromLocalStorage`, `AutoDetectSite`, `getAllTabs`, or `sendTabMessage`.
- `useAccountDialog.ts`: no direct Sub2API session-import use of those browser APIs.
- `AccountDataContext.tsx`: may still import/use tab event helpers, but not direct `ContentGetUserFromLocalStorage`.
- `autoDetectService.ts`: no direct `ContentGetUserFromLocalStorage`; `AutoDetectSite` may remain for background/temp-window auto-detect outside the new Module.

- [ ] **Step 2: Run focused migrated suites**

Run:

```powershell
pnpm vitest run tests/services/accountBrowserSession/sessionReader.test.ts tests/services/apiService/sub2api/tokenResync.test.ts tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx tests/features/AccountManagement/hooks/AccountDataContext.test.tsx tests/services/autoDetectService.test.ts
```

Expected: all suites pass.

- [ ] **Step 3: Run related validation for changed source files**

Run:

```powershell
pnpm vitest related --run src/services/accountBrowserSession/sessionReader.ts src/services/apiService/sub2api/tokenResync.ts src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts src/features/AccountManagement/hooks/AccountDataContext.tsx src/services/siteDetection/autoDetectService.ts
```

Expected: related tests pass. If this command is unsupported by the local Vitest setup, record the exact error and use the focused suites from Step 2 plus `pnpm compile`.

- [ ] **Step 4: Run type validation**

Run:

```powershell
pnpm compile
```

Expected: TypeScript compile passes.

- [ ] **Step 5: Stage only task-scoped implementation files**

Run:

```powershell
git add src/services/accountBrowserSession tests/services/accountBrowserSession src/services/apiService/sub2api/tokenResync.ts tests/services/apiService/sub2api/tokenResync.test.ts src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx src/features/AccountManagement/hooks/AccountDataContext.tsx tests/features/AccountManagement/hooks/AccountDataContext.test.tsx src/services/siteDetection/autoDetectService.ts tests/services/autoDetectService.test.ts
```

Expected: only task-scoped files are staged.

- [ ] **Step 6: Run commit gate**

Run:

```powershell
pnpm run validate:staged
```

Expected: staged validation passes.

- [ ] **Step 7: Inspect final diff**

Run:

```powershell
git diff --cached --stat
git diff --cached -- src/services/accountBrowserSession src/services/apiService/sub2api/tokenResync.ts src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts src/features/AccountManagement/hooks/AccountDataContext.tsx src/services/siteDetection/autoDetectService.ts
```

Expected: no unrelated files, debug code, stale comments, or duplicate browser-session orchestration.

- [ ] **Step 8: Commit final cleanup if needed**

If all implementation work was committed task-by-task, skip this step.

If Task 6 produced staged fixes, run:

```powershell
git commit -m "refactor(account-session): centralize browser session reads"
```

Expected: commit succeeds after the staged validation hook.

- [ ] **Step 9: Run push gate because shared service code changed**

Run:

```powershell
pnpm run validate:push
```

Expected: compile, knip, and repo push validation pass.
