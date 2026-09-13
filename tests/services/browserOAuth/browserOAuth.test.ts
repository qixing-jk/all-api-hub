import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  createBrowserOAuthContext,
  type BrowserOAuthFlow,
} from "~/services/browserOAuth/browserOAuth"

const tabUpdatedListeners = vi.hoisted(
  () => [] as Array<(tabId: number, changeInfo: unknown, tab: any) => void>,
)
const removalListeners = vi.hoisted(() => ({
  tab: undefined as ((id: number) => void) | undefined,
  window: undefined as ((id: number) => void) | undefined,
}))
const browserApi = vi.hoisted(() => ({
  createWindow: vi.fn(),
  getBrowserCookie: vi.fn(),
  getTab: vi.fn(),
  onTabRemoved: vi.fn((listener: (id: number) => void) => {
    removalListeners.tab = listener
    return vi.fn()
  }),
  onTabUpdated: vi.fn((listener) => {
    tabUpdatedListeners.push(listener)
    return vi.fn()
  }),
  onWindowRemoved: vi.fn((listener: (id: number) => void) => {
    removalListeners.window = listener
    return vi.fn()
  }),
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
    browserApi.removeWindow.mockReset()
    browserApi.queryTabs.mockReset()
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
  afterEach(() => {
    vi.useRealTimers()
  })

  const authenticate = () =>
    browserOAuthContext.authenticate({
      origin,
      expectedIdentity: "user-1",
      requestId: "edge-case",
    })

  it("rejects a login path outside the account origin before opening a popup", async () => {
    const context = createBrowserOAuthContext({
      ...testFlow,
      loginPath: "https://other.invalid/login",
    })
    await expect(
      context.authenticate({ origin, requestId: "invalid-path" }),
    ).resolves.toMatchObject({ status: "failed" })
    expect(browserApi.createWindow).not.toHaveBeenCalled()
  })

  it("finds the popup tab when createWindow omits tabs", async () => {
    browserApi.createWindow.mockResolvedValue({ id: 7 })
    browserApi.queryTabs.mockResolvedValue([loginTab])
    await expect(authenticate()).resolves.toMatchObject({
      status: "authenticated",
    })
    expect(browserApi.queryTabs).toHaveBeenCalledWith({ windowId: 7 })
  })

  it("cleans up a popup that has no usable tab", async () => {
    browserApi.createWindow.mockResolvedValue({ id: 7 })
    browserApi.queryTabs.mockResolvedValue([])
    await expect(authenticate()).resolves.toMatchObject({ status: "failed" })
    expect(browserApi.removeWindow).toHaveBeenCalledWith(7)
  })

  it("closes by tab ID when the window ID is unavailable", async () => {
    browserApi.createWindow.mockResolvedValue({ tabs: [loginTab] })
    await expect(authenticate()).resolves.toMatchObject({
      status: "authenticated",
    })
    expect(browserApi.removeTab).toHaveBeenCalledWith(11)
  })

  it("keeps verified success when the popup was already closed during cleanup", async () => {
    browserApi.removeWindow.mockRejectedValue(new Error("Already closed"))
    await expect(authenticate()).resolves.toMatchObject({
      status: "authenticated",
    })
  })

  it.each([
    [null, "failed"],
    [{ success: false }, "failed"],
    [
      { success: true, authorizationUrl: "https://untrusted.invalid" },
      "failed",
    ],
  ])("rejects invalid preparation %#", async (preparation, status) => {
    browserApi.sendTabMessageWithRetry
      .mockReset()
      .mockResolvedValueOnce(preparation)
    await expect(authenticate()).resolves.toMatchObject({ status })
    expect(browserApi.updateTab).not.toHaveBeenCalled()
  })

  it.each([
    [{ reason: "identity_mismatch" }, "identity_mismatch"],
    [{ success: false }, "failed"],
  ])("rejects unverified callback %#", async (completion, status) => {
    browserApi.sendTabMessageWithRetry
      .mockReset()
      .mockResolvedValueOnce({ success: true, authorizationUrl })
      .mockResolvedValueOnce(completion)
    await expect(authenticate()).resolves.toMatchObject({ status })
  })

  it("rejects navigation away before asking the content script for credentials", async () => {
    browserApi.getTab
      .mockResolvedValueOnce(loginTab)
      .mockResolvedValue({ ...loginTab, url: "https://other.invalid" })
    await expect(authenticate()).resolves.toMatchObject({ status: "failed" })
    expect(browserApi.sendTabMessageWithRetry).not.toHaveBeenCalled()
  })

  it.each(["tab", "window"] as const)(
    "handles user cancellation by closing the %s",
    async (kind) => {
      browserApi.getTab.mockResolvedValue({ ...loginTab, status: "loading" })
      const result = authenticate()
      await vi.waitFor(() => expect(browserApi.onTabRemoved).toHaveBeenCalled())
      removalListeners[kind]?.(kind === "tab" ? 11 : 7)
      await expect(result).resolves.toMatchObject({ status: "cancelled" })
    },
  )

  it("handles a vanished initial tab", async () => {
    browserApi.getTab.mockRejectedValue(new Error("No tab"))
    await expect(authenticate()).resolves.toMatchObject({ status: "cancelled" })
  })

  it("times out without treating an incomplete initial page as a login", async () => {
    vi.useFakeTimers()
    browserApi.getTab.mockResolvedValue({ ...loginTab, status: "loading" })
    const result = authenticate()
    await vi.advanceTimersByTimeAsync(30_000)
    await expect(result).resolves.toMatchObject({
      status: "interaction_required",
    })
    expect(browserApi.updateTab).not.toHaveBeenCalled()
  })

  it("observes callback completion through the keepalive poll", async () => {
    vi.useFakeTimers()
    browserApi.getTab.mockImplementation(async () =>
      browserApi.updateTab.mock.calls.length
        ? { ...loginTab, url: authorizationUrl }
        : loginTab,
    )
    const result = authenticate()
    await vi.advanceTimersByTimeAsync(1)
    browserApi.getTab.mockResolvedValue(completedTab)
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(result).resolves.toMatchObject({ status: "authenticated" })
  })

  it("cancels if the tab disappears during callback polling", async () => {
    vi.useFakeTimers()
    browserApi.getTab.mockResolvedValue({ ...loginTab, status: "loading" })
    const result = authenticate()
    await vi.advanceTimersByTimeAsync(1)
    browserApi.getTab.mockRejectedValue(new Error("No tab"))
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(result).resolves.toMatchObject({ status: "cancelled" })
  })

  it("retries failed authorization delivery while ignoring intermediate URLs", async () => {
    vi.useFakeTimers()
    const flow = {
      ...testFlow,
      authorizationInteraction: {
        action: actions.authorize,
        isInteractionUrl: (current: URL, requested: URL) =>
          current.href === requested.href,
      },
    }
    const context = createBrowserOAuthContext(flow)
    browserApi.getTab.mockImplementation(async () =>
      browserApi.updateTab.mock.calls.length
        ? { ...loginTab, url: "invalid URL" }
        : loginTab,
    )
    browserApi.sendTabMessageWithRetry
      .mockReset()
      .mockResolvedValueOnce({ success: true, authorizationUrl })
      .mockRejectedValueOnce(new Error("Content script not ready"))
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        identity: "user-1",
        completed: true,
      })
    const result = context.authenticate({
      origin,
      requestId: "retry-interaction",
    })
    await vi.advanceTimersByTimeAsync(1)
    browserApi.getTab.mockResolvedValue({ ...loginTab, url: authorizationUrl })
    await vi.advanceTimersByTimeAsync(20_000)
    await vi.advanceTimersByTimeAsync(20_000)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(browserApi.sendTabMessageWithRetry).toHaveBeenCalledTimes(3)
    browserApi.getTab.mockResolvedValue(completedTab)
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(result).resolves.toMatchObject({ status: "authenticated" })
  })
})
