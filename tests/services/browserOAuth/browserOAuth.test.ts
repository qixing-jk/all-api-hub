import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createBrowserOAuthContext,
  type BrowserOAuthFlow,
} from "~/services/browserOAuth/browserOAuth"

const tabUpdatedListeners = vi.hoisted(
  () => [] as Array<(tabId: number, changeInfo: unknown, tab: any) => void>,
)
const browserApi = vi.hoisted(() => ({
  createWindow: vi.fn(),
  getBrowserCookie: vi.fn(),
  getTab: vi.fn(),
  onTabRemoved: vi.fn(() => vi.fn()),
  onTabUpdated: vi.fn((listener) => {
    tabUpdatedListeners.push(listener)
    return vi.fn()
  }),
  onWindowRemoved: vi.fn(() => vi.fn()),
  queryTabs: vi.fn(),
  removeBrowserCookie: vi.fn(),
  removeTab: vi.fn(),
  removeWindow: vi.fn(),
  sendTabMessageWithRetry: vi.fn(),
  setBrowserCookie: vi.fn(),
  updateTab: vi.fn(),
}))
const hasCookieReadPermissionForUrl = vi.hoisted(() => vi.fn())

vi.mock("~/utils/browser/browserApi", () => browserApi)
vi.mock("~/utils/browser/cookieHelper", () => ({
  hasCookieReadPermissionForUrl,
}))

const origin = "https://account.example.invalid"
const authorizationUrl = "https://oauth.example.invalid/authorize?state=signed"
const actions = {
  prepare: "test:prepare-oauth",
  complete: "test:complete-oauth",
  clear: "test:clear-oauth",
  authorize: "test:authorize-oauth",
} as const
const testFlow = {
  id: "example-oauth",
  concurrencyKey: "example-session",
  displayName: "Example Account",
  loginPath: "/login",
  prepareAction: actions.prepare,
  completeAction: actions.complete,
  clearEvidenceAction: actions.clear,
  parsePreparation(response) {
    const value = response as { success?: boolean; authorizationUrl?: unknown }
    return value.success === true && typeof value.authorizationUrl === "string"
      ? { authorizationUrl: value.authorizationUrl }
      : null
  },
  parseCompletion(response) {
    const value = response as {
      success?: boolean
      identity?: unknown
      completed?: unknown
      reason?: unknown
    }
    if (value.reason === "identity_mismatch") {
      return { status: "identity_mismatch" as const }
    }
    if (
      value.success !== true ||
      typeof value.identity !== "string" ||
      typeof value.completed !== "boolean"
    ) {
      return { status: "invalid" as const }
    }
    return {
      status: "verified" as const,
      identity: value.identity,
      evidence: { completed: value.completed },
    }
  },
  isAuthorizationUrl(url) {
    return url.origin === "https://oauth.example.invalid"
  },
  isCompletionUrl(url, accountOrigin) {
    return url.origin === accountOrigin && url.pathname === "/oauth/complete"
  },
} satisfies BrowserOAuthFlow<{ completed: boolean }>
const browserOAuthContext = createBrowserOAuthContext(testFlow)
const loginTab = {
  id: 11,
  windowId: 7,
  status: "complete",
  url: `${origin}/login`,
}
const completedTab = {
  ...loginTab,
  url: `${origin}/oauth/complete`,
}

describe("browser OAuth context", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tabUpdatedListeners.length = 0
    hasCookieReadPermissionForUrl.mockResolvedValue(false)
    browserApi.createWindow.mockReset()
    browserApi.createWindow.mockResolvedValue({
      id: 7,
      tabs: [loginTab],
    })
    browserApi.getTab.mockReset()
    browserApi.getTab.mockImplementation(async () =>
      browserApi.updateTab.mock.calls.length > 0 ? completedTab : loginTab,
    )
    browserApi.sendTabMessageWithRetry.mockReset()
    browserApi.sendTabMessageWithRetry
      .mockResolvedValueOnce({
        success: true,
        authorizationUrl,
      })
      .mockResolvedValueOnce({
        success: true,
        identity: "user-1",
        completed: true,
      })
  })

  it("verifies login without cookie permissions or exporting credentials", async () => {
    await expect(
      browserOAuthContext.authenticate({
        expectedIdentity: "user-1",
        origin,
        requestId: "request-1",
      }),
    ).resolves.toEqual({
      status: "authenticated",
      identity: "user-1",
      evidence: { completed: true },
    })
    expect(hasCookieReadPermissionForUrl).not.toHaveBeenCalled()
    expect(browserApi.getBrowserCookie).not.toHaveBeenCalled()
    expect(browserApi.setBrowserCookie).not.toHaveBeenCalled()
    expect(browserApi.removeBrowserCookie).not.toHaveBeenCalled()
    expect(browserApi.removeWindow).toHaveBeenCalledWith(7)
  })

  it("supports first-time OAuth when no existing identity is expected", async () => {
    await expect(
      browserOAuthContext.authenticate({
        origin,
        requestId: "request-1",
      }),
    ).resolves.toMatchObject({
      status: "authenticated",
      identity: "user-1",
    })
  })

  it("runs a configured interaction only on the matching authorization page", async () => {
    const interactiveFlow = {
      ...testFlow,
      authorizationInteraction: {
        action: actions.authorize,
        isInteractionUrl(currentUrl, requestedUrl) {
          return (
            currentUrl.origin === requestedUrl.origin &&
            currentUrl.pathname === requestedUrl.pathname &&
            currentUrl.searchParams.get("state") ===
              requestedUrl.searchParams.get("state")
          )
        },
      },
    } satisfies BrowserOAuthFlow<{ completed: boolean }>
    const interactiveContext = createBrowserOAuthContext(interactiveFlow)
    const authorizationTab = {
      ...loginTab,
      url: authorizationUrl,
    }
    browserApi.getTab.mockImplementation(async () =>
      browserApi.updateTab.mock.calls.length > 0 ? authorizationTab : loginTab,
    )
    browserApi.sendTabMessageWithRetry.mockReset()
    browserApi.sendTabMessageWithRetry
      .mockResolvedValueOnce({ success: true, authorizationUrl })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        identity: "user-1",
        completed: true,
      })

    const authentication = interactiveContext.authenticate({
      expectedIdentity: "user-1",
      origin,
      requestId: "request-1",
    })
    await vi.waitFor(() =>
      expect(browserApi.sendTabMessageWithRetry).toHaveBeenCalledWith(
        11,
        expect.objectContaining({
          action: actions.authorize,
          authorizationUrl,
        }),
        expect.any(Object),
      ),
    )
    const completionListener = tabUpdatedListeners.at(-1)
    browserApi.getTab.mockResolvedValue(completedTab)
    completionListener?.(11, {}, completedTab)

    await expect(authentication).resolves.toMatchObject({
      status: "authenticated",
      identity: "user-1",
    })
  })

  it("rejects a different account without saving any credentials", async () => {
    browserApi.sendTabMessageWithRetry.mockReset()
    browserApi.sendTabMessageWithRetry
      .mockResolvedValueOnce({
        success: true,
        authorizationUrl,
      })
      .mockResolvedValueOnce({
        success: true,
        identity: "other-user",
        completed: true,
      })

    await expect(
      browserOAuthContext.authenticate({
        expectedIdentity: "user-1",
        origin,
        requestId: "request-1",
      }),
    ).resolves.toMatchObject({ status: "identity_mismatch" })
    expect(browserApi.setBrowserCookie).not.toHaveBeenCalled()
    expect(browserApi.sendTabMessageWithRetry).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ action: actions.clear }),
      expect.anything(),
    )
  })

  it("allows only one browser login flow at a time", async () => {
    let resolveWindow: ((value: null) => void) | undefined
    browserApi.createWindow.mockImplementationOnce(
      () =>
        new Promise<null>((resolve) => {
          resolveWindow = resolve
        }),
    )

    const first = browserOAuthContext.authenticate({
      expectedIdentity: "user-1",
      origin,
      requestId: "request-1",
    })
    await vi.waitFor(() => expect(browserApi.createWindow).toHaveBeenCalled())

    await expect(
      browserOAuthContext.authenticate({
        expectedIdentity: "user-1",
        origin,
        requestId: "request-2",
      }),
    ).resolves.toMatchObject({ status: "interaction_required" })

    resolveWindow?.(null)
    await expect(first).resolves.toMatchObject({ status: "failed" })
  })
})
