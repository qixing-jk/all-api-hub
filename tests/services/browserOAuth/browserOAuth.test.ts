import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BROWSER_OAUTH_STATUS } from "~/constants/browserOAuth"
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
      status: BROWSER_OAUTH_STATUS.Authenticated,
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
      status: BROWSER_OAUTH_STATUS.Authenticated,
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
      status: BROWSER_OAUTH_STATUS.Authenticated,
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
    ).resolves.toMatchObject({ status: BROWSER_OAUTH_STATUS.IdentityMismatch })
    expect(browserApi.setBrowserCookie).not.toHaveBeenCalled()
    expect(browserApi.sendTabMessageWithRetry).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ action: actions.clear }),
      expect.anything(),
    )
  })

  it("serializes browser login flows that share a concurrency key", async () => {
    // GitHub and Linux DO AgentRouter logins use separate contexts that share
    // one concurrency key because they authenticate the same site session.
    const siblingContext = createBrowserOAuthContext({
      ...testFlow,
      id: "example-oauth-sibling",
      displayName: "Example Account (Linux DO)",
    })
    let resolveFirstWindow: ((value: null) => void) | undefined
    browserApi.createWindow.mockImplementationOnce(
      () =>
        new Promise<null>((resolve) => {
          resolveFirstWindow = resolve
        }),
    )

    const first = browserOAuthContext.authenticate({
      expectedIdentity: "user-1",
      origin,
      requestId: "request-1",
    })
    await vi.waitFor(() => expect(browserApi.createWindow).toHaveBeenCalled())

    const second = siblingContext.authenticate({
      expectedIdentity: "user-1",
      origin,
      requestId: "request-2",
    })
    await Promise.resolve()
    expect(browserApi.createWindow).toHaveBeenCalledTimes(1)

    resolveFirstWindow?.(null)
    await expect(first).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Failed,
    })
    await expect(second).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Authenticated,
    })
    expect(browserApi.createWindow).toHaveBeenCalledTimes(2)
  })

  it("keeps flows with different concurrency keys independent", async () => {
    const otherContext = createBrowserOAuthContext({
      ...testFlow,
      id: "example-oauth-other",
      concurrencyKey: "example-session-other",
    })
    let resolveFirstWindow: ((value: null) => void) | undefined
    browserApi.createWindow.mockImplementationOnce(
      () =>
        new Promise<null>((resolve) => {
          resolveFirstWindow = resolve
        }),
    )

    const first = browserOAuthContext.authenticate({
      expectedIdentity: "user-1",
      origin,
      requestId: "request-1",
    })
    await vi.waitFor(() =>
      expect(browserApi.createWindow).toHaveBeenCalledTimes(1),
    )

    const second = otherContext.authenticate({
      expectedIdentity: "user-1",
      origin,
      requestId: "request-2",
    })

    await expect(second).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Authenticated,
    })
    expect(browserApi.createWindow).toHaveBeenCalledTimes(2)

    resolveFirstWindow?.(null)
    await expect(first).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Failed,
    })
  })
  it("joins concurrent logins for the same expected account onto one browser flow", async () => {
    // A manual check-in and a scheduled run can ask for the same account at the
    // same time; the second request must observe the first flow, not open a
    // second popup or fail with a misleading login error.
    let resolveWindow: ((value: unknown) => void) | undefined
    browserApi.createWindow.mockImplementationOnce(
      () =>
        new Promise<unknown>((resolve) => {
          resolveWindow = resolve
        }),
    )
    browserApi.sendTabMessageWithRetry
      .mockResolvedValueOnce({ success: true, authorizationUrl })
      .mockResolvedValueOnce({
        success: true,
        identity: "user-1",
        completed: true,
      })

    const first = browserOAuthContext.authenticate({
      expectedIdentity: "user-1",
      origin,
      requestId: "request-1",
    })
    await vi.waitFor(() =>
      expect(browserApi.createWindow).toHaveBeenCalledTimes(1),
    )
    const second = browserOAuthContext.authenticate({
      expectedIdentity: "user-1",
      origin,
      requestId: "request-2",
    })

    resolveWindow?.({ id: 7, tabs: [loginTab] })

    await expect(first).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Authenticated,
    })
    await expect(second).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Authenticated,
    })
    expect(browserApi.createWindow).toHaveBeenCalledTimes(1)
    expect(browserApi.sendTabMessageWithRetry).toHaveBeenCalledTimes(2)

    // Joining only covers the in-flight flow: the next request logs in again.
    await expect(
      browserOAuthContext.authenticate({
        expectedIdentity: "user-1",
        origin,
        requestId: "request-3",
      }),
    ).resolves.toMatchObject({ status: BROWSER_OAUTH_STATUS.Authenticated })
    expect(browserApi.createWindow).toHaveBeenCalledTimes(2)
  })

  it("keeps concurrent first-time logins apart when no identity is expected", async () => {
    let resolveWindow: ((value: unknown) => void) | undefined
    browserApi.createWindow.mockImplementationOnce(
      () =>
        new Promise<unknown>((resolve) => {
          resolveWindow = resolve
        }),
    )
    browserApi.sendTabMessageWithRetry
      .mockResolvedValueOnce({ success: true, authorizationUrl })
      .mockResolvedValueOnce({
        success: true,
        identity: "user-1",
        completed: true,
      })

    const first = browserOAuthContext.authenticate({
      origin,
      requestId: "request-1",
    })
    await vi.waitFor(() =>
      expect(browserApi.createWindow).toHaveBeenCalledTimes(1),
    )
    const second = browserOAuthContext.authenticate({
      origin,
      requestId: "request-2",
    })

    resolveWindow?.({ id: 7, tabs: [loginTab] })

    await expect(first).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Authenticated,
    })
    await expect(second).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Authenticated,
    })
    expect(browserApi.createWindow).toHaveBeenCalledTimes(2)
    expect(browserApi.sendTabMessageWithRetry).toHaveBeenCalledTimes(4)
  })

  it("reports a busy session when a queued login outlives its wait bound", async () => {
    let resolveWindow: ((value: unknown) => void) | undefined
    browserApi.createWindow.mockImplementationOnce(
      () =>
        new Promise<unknown>((resolve) => {
          resolveWindow = resolve
        }),
    )
    const boundedContext = createBrowserOAuthContext(
      { ...testFlow, id: "example-oauth-bounded" },
      { sessionWaitTimeoutMs: 25 },
    )

    const holding = browserOAuthContext.authenticate({
      expectedIdentity: "user-1",
      origin,
      requestId: "request-1",
    })
    await vi.waitFor(() =>
      expect(browserApi.createWindow).toHaveBeenCalledTimes(1),
    )

    const queued = await boundedContext.authenticate({
      expectedIdentity: "user-1",
      origin,
      requestId: "request-2",
    })

    expect(queued).toMatchObject({
      status: BROWSER_OAUTH_STATUS.SessionBusy,
      message: expect.stringContaining("in progress"),
    })

    resolveWindow?.(null)
    await expect(holding).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Failed,
    })

    // The expired waiter never opened its own popup, and the shared session is
    // free again once the holder released it.
    await expect(
      browserOAuthContext.authenticate({
        expectedIdentity: "user-1",
        origin,
        requestId: "request-3",
      }),
    ).resolves.toMatchObject({ status: BROWSER_OAUTH_STATUS.Authenticated })
    expect(browserApi.createWindow).toHaveBeenCalledTimes(2)
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
    ).resolves.toMatchObject({ status: BROWSER_OAUTH_STATUS.Failed })
    expect(browserApi.createWindow).not.toHaveBeenCalled()
  })

  it("finds the popup tab when createWindow omits tabs", async () => {
    browserApi.createWindow.mockResolvedValue({ id: 7 })
    browserApi.queryTabs.mockResolvedValue([loginTab])
    await expect(authenticate()).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Authenticated,
    })
    expect(browserApi.queryTabs).toHaveBeenCalledWith({ windowId: 7 })
  })

  it("cleans up a popup that has no usable tab", async () => {
    browserApi.createWindow.mockResolvedValue({ id: 7 })
    browserApi.queryTabs.mockResolvedValue([])
    await expect(authenticate()).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Failed,
    })
    expect(browserApi.removeWindow).toHaveBeenCalledWith(7)
  })

  it("fails without querying unrelated tabs when the popup has no identifiers", async () => {
    browserApi.createWindow.mockResolvedValue({})
    await expect(authenticate()).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Failed,
    })
    expect(browserApi.queryTabs).not.toHaveBeenCalled()
    expect(browserApi.removeWindow).not.toHaveBeenCalled()
    expect(browserApi.removeTab).not.toHaveBeenCalled()
  })

  it("closes by tab ID when the window ID is unavailable", async () => {
    browserApi.createWindow.mockResolvedValue({ tabs: [loginTab] })
    await expect(authenticate()).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Authenticated,
    })
    expect(browserApi.removeTab).toHaveBeenCalledWith(11)
  })

  it("keeps verified success when the popup was already closed during cleanup", async () => {
    browserApi.removeWindow.mockRejectedValue(new Error("Already closed"))
    await expect(authenticate()).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Authenticated,
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
    await expect(authenticate()).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Failed,
    })
    expect(browserApi.sendTabMessageWithRetry).not.toHaveBeenCalled()
  })

  it.each(["tab", "window"] as const)(
    "handles user cancellation by closing the %s",
    async (kind) => {
      browserApi.getTab.mockResolvedValue({ ...loginTab, status: "loading" })
      const result = authenticate()
      await vi.waitFor(() => expect(browserApi.onTabRemoved).toHaveBeenCalled())
      removalListeners[kind]?.(kind === "tab" ? 11 : 7)
      await expect(result).resolves.toMatchObject({
        status: BROWSER_OAUTH_STATUS.Cancelled,
      })
    },
  )

  it("handles a vanished initial tab", async () => {
    browserApi.getTab.mockRejectedValue(new Error("No tab"))
    await expect(authenticate()).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Cancelled,
    })
  })

  it("times out without treating an incomplete initial page as a login", async () => {
    vi.useFakeTimers()
    browserApi.getTab.mockResolvedValue({ ...loginTab, status: "loading" })
    const result = authenticate()
    await vi.advanceTimersByTimeAsync(30_000)
    await expect(result).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.InteractionRequired,
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
    await expect(result).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Authenticated,
    })
  })

  it("cancels if the tab disappears during callback polling", async () => {
    vi.useFakeTimers()
    browserApi.getTab.mockResolvedValue({ ...loginTab, status: "loading" })
    const result = authenticate()
    await vi.advanceTimersByTimeAsync(1)
    browserApi.getTab.mockRejectedValue(new Error("No tab"))
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(result).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Cancelled,
    })
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
    await expect(result).resolves.toMatchObject({
      status: BROWSER_OAUTH_STATUS.Authenticated,
    })
  })
})
