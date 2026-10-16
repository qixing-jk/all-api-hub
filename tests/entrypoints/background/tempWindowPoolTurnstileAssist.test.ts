import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { createTempContextTurnstileAssist } from "~/services/browsingContext/tempPage/turnstileAssist"
import { TURNSTILE_ASSIST_PRESENTATIONS } from "~/services/checkin/turnstile/assistPresentation"

const originalBrowser = (globalThis as any).browser

const {
  getAccountByIdMock,
  getCookieHeaderForUrlMock,
  addAuthMethodHeaderMock,
  applyTempWindowCookieRuleMock,
  removeTempWindowCookieRuleMock,
  applyTempWindowDownloadBlockRuleMock,
  removeTempWindowDownloadBlockRuleMock,
  applyFirefoxTempWindowDownloadBlockRuleMock,
  removeFirefoxTempWindowDownloadBlockRuleMock,
  isProtectionBypassFirefoxEnvMock,
  getSiteTypeMock,
  createBrowserFocusObservationMock,
  recordShieldBypassFocusObservationMock,
  recordShieldBypassTempWindowFetchResultMock,
  recordShieldBypassTempWindowTurnstileFetchResultMock,
} = vi.hoisted(() => ({
  getAccountByIdMock: vi.fn(),
  getCookieHeaderForUrlMock: vi.fn(),
  addAuthMethodHeaderMock: vi.fn(),
  applyTempWindowCookieRuleMock: vi.fn(),
  removeTempWindowCookieRuleMock: vi.fn(),
  applyTempWindowDownloadBlockRuleMock: vi.fn(),
  removeTempWindowDownloadBlockRuleMock: vi.fn(),
  applyFirefoxTempWindowDownloadBlockRuleMock: vi.fn(),
  removeFirefoxTempWindowDownloadBlockRuleMock: vi.fn(),
  isProtectionBypassFirefoxEnvMock: vi.fn(),
  getSiteTypeMock: vi.fn(),
  createBrowserFocusObservationMock: vi.fn(),
  recordShieldBypassFocusObservationMock: vi.fn(),
  recordShieldBypassTempWindowFetchResultMock: vi.fn(),
  recordShieldBypassTempWindowTurnstileFetchResultMock: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAccountById: getAccountByIdMock },
}))

vi.mock("~/services/productAnalytics/facts/shieldBypassSummary", () => ({
  recordShieldBypassTempWindowFetchResult:
    recordShieldBypassTempWindowFetchResultMock,
  recordShieldBypassTempWindowTurnstileFetchResult:
    recordShieldBypassTempWindowTurnstileFetchResultMock,
  recordShieldBypassFocusObservation: recordShieldBypassFocusObservationMock,
}))

vi.mock("~/utils/browser/dnrCookieInjector", () => ({
  applyTempWindowCookieRule: applyTempWindowCookieRuleMock,
  removeTempWindowCookieRule: removeTempWindowCookieRuleMock,
  applyTempWindowDownloadBlockRule: applyTempWindowDownloadBlockRuleMock,
  removeTempWindowDownloadBlockRule: removeTempWindowDownloadBlockRuleMock,
}))

vi.mock("~/utils/browser/firefoxTempWindowDownloadBlocker", () => ({
  applyFirefoxTempWindowDownloadBlockRule:
    applyFirefoxTempWindowDownloadBlockRuleMock,
  removeFirefoxTempWindowDownloadBlockRule:
    removeFirefoxTempWindowDownloadBlockRuleMock,
}))

vi.mock("~/utils/browser/protectionBypass", () => ({
  isProtectionBypassFirefoxEnv: isProtectionBypassFirefoxEnvMock,
}))

vi.mock("~/services/siteDetection/detectSiteType", () => ({
  getAccountSiteType: getSiteTypeMock,
}))

/** Creates a promise whose settlement the test drives. */
const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

type ContentWaitDeferred = ReturnType<typeof createDeferred<any>>

type PresentedAssist = {
  presented: boolean
  reason?: string
  focused?: boolean
  notified?: boolean
}

/** Settles the temp-context ready checks the pool performs while opening. */
async function settleTempContextReadiness() {
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(500)
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(500)
}

/**
 * Waits long enough for a presentation to have happened, so "nothing was
 * presented yet" assertions cannot pass merely because the call is still queued
 * on its own microtasks.
 */
async function flushAssistWork() {
  for (let step = 0; step < 5; step += 1) {
    await vi.advanceTimersByTimeAsync(20)
    await Promise.resolve()
  }
}

/** Runs the pool's delayed temp-context release for a finished request. */
async function settleTempContextRelease() {
  await vi.advanceTimersByTimeAsync(2_100)
  await Promise.resolve()
}

describe("tempWindowPool Turnstile assist turns", () => {
  let createTabMock: ReturnType<typeof vi.fn>
  let createWindowMock: ReturnType<typeof vi.fn>
  let hasWindowsApiMock: ReturnType<typeof vi.fn>
  let onTabRemovedMock: ReturnType<typeof vi.fn>
  let onWindowRemovedMock: ReturnType<typeof vi.fn>
  let hasPermissionMock: ReturnType<typeof vi.fn>
  let sendMessageMock: ReturnType<typeof vi.fn>
  let tabsGetMock: ReturnType<typeof vi.fn>
  let tabsQueryMock: ReturnType<typeof vi.fn>
  let tabsUpdateMock: ReturnType<typeof vi.fn>
  let windowsUpdateMock: ReturnType<typeof vi.fn>
  let notificationCreateMock: ReturnType<typeof vi.fn>
  let notificationClearMock: ReturnType<typeof vi.fn>
  let notificationClickListeners: Array<(notificationId: string) => void>
  let runtimeMessageListeners: Array<
    (
      message: any,
      sender: any,
      sendResponse: (res?: any) => void,
    ) => void | boolean
  >
  let getPreferencesMock: ReturnType<typeof vi.fn>
  let turnstileAssistPresentation: string
  let createdContexts: Array<{ windowId: number; tabId: number }>
  let contentWaits: Map<number, ContentWaitDeferred>
  let presentFromPool: typeof import("./tempWindowPoolTestAdapter").presentTempContextForTurnstileAssist

  let fetchFromPool: typeof import("./tempWindowPoolTestAdapter").handleTempWindowTurnstileFetch

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()

    createdContexts = []
    contentWaits = new Map()
    notificationClickListeners = []
    runtimeMessageListeners = []
    turnstileAssistPresentation = TURNSTILE_ASSIST_PRESENTATIONS.Page

    getAccountByIdMock.mockReset()
    getCookieHeaderForUrlMock.mockReset().mockResolvedValue("")
    addAuthMethodHeaderMock
      .mockReset()
      .mockImplementation(async (headers: HeadersInit, mode: string) => ({
        ...(headers as Record<string, string>),
        "X-Auth-Mode": mode,
      }))
    applyTempWindowCookieRuleMock.mockReset().mockResolvedValue(null)
    removeTempWindowCookieRuleMock.mockReset().mockResolvedValue(undefined)
    applyTempWindowDownloadBlockRuleMock.mockReset().mockResolvedValue(null)
    removeTempWindowDownloadBlockRuleMock
      .mockReset()
      .mockResolvedValue(undefined)
    applyFirefoxTempWindowDownloadBlockRuleMock
      .mockReset()
      .mockResolvedValue(null)
    removeFirefoxTempWindowDownloadBlockRuleMock
      .mockReset()
      .mockResolvedValue(undefined)
    isProtectionBypassFirefoxEnvMock.mockReset().mockReturnValue(false)
    getSiteTypeMock.mockReset().mockResolvedValue("new-api")
    createBrowserFocusObservationMock.mockReset().mockImplementation(() => ({
      finish: vi.fn().mockResolvedValue({
        start: "focused",
        transition: "remained_focused",
        end: "focused",
      }),
      cancel: vi.fn(),
    }))
    recordShieldBypassFocusObservationMock
      .mockReset()
      .mockResolvedValue(undefined)
    recordShieldBypassTempWindowFetchResultMock
      .mockReset()
      .mockResolvedValue(undefined)
    recordShieldBypassTempWindowTurnstileFetchResultMock
      .mockReset()
      .mockResolvedValue(undefined)

    createTabMock = vi.fn()
    createWindowMock = vi.fn(async () => {
      const windowId = 101 + createdContexts.length
      const tabId = 201 + createdContexts.length
      createdContexts.push({ windowId, tabId })
      return { id: windowId }
    })
    hasWindowsApiMock = vi.fn(() => true)
    onTabRemovedMock = vi.fn(() => () => {})
    onWindowRemovedMock = vi.fn(() => () => {})
    hasPermissionMock = vi.fn().mockResolvedValue(true)
    tabsGetMock = vi.fn(async (tabId: number) => ({
      id: tabId,
      status: "complete",
      windowId: createdContexts.find((item) => item.tabId === tabId)?.windowId,
    }))
    tabsQueryMock = vi.fn(async (query?: { windowId?: number }) => {
      const match = createdContexts.find(
        (item) => item.windowId === query?.windowId,
      )
      return match ? [{ id: match.tabId }] : []
    })
    tabsUpdateMock = vi.fn().mockResolvedValue(undefined)
    windowsUpdateMock = vi.fn().mockResolvedValue(undefined)
    notificationCreateMock = vi.fn(
      async (notificationId: string) => notificationId,
    )
    notificationClearMock = vi.fn().mockResolvedValue(true)
    getPreferencesMock = vi.fn(async () => ({
      tempWindowFallback: {
        tempContextMode: "window",
        turnstileAssistPresentation,
      },
    }))
    sendMessageMock = vi.fn(
      async (tabId: number, message: { action: string }) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentWaitForTurnstileToken: {
            const deferred = createDeferred<any>()
            contentWaits.set(tabId, deferred)
            return deferred.promise
          }
          case RuntimeActionIds.ContentPerformTempWindowFetch:
            return { success: true, status: 200, data: { success: true } }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )
    ;(globalThis as any).browser = {
      storage: originalBrowser.storage,
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
        sendMessage: vi.fn().mockResolvedValue(undefined),
        onMessage: {
          addListener: vi.fn((listener) => {
            runtimeMessageListeners.push(listener)
          }),
          removeListener: vi.fn(),
        },
      },
      scripting: {
        executeScript: vi.fn(async () => [
          { result: { hasApi: true, token: "token-from-probe" } },
        ]),
      },
      tabs: {
        get: tabsGetMock,
        query: tabsQueryMock,
        update: tabsUpdateMock,
        sendMessage: sendMessageMock,
      },
      windows: {
        get: vi.fn(),
        update: windowsUpdateMock,
      },
      alarms: {
        create: vi.fn(),
        get: vi.fn().mockResolvedValue(undefined),
      },
      notifications: {
        getPermissionLevel: vi.fn().mockResolvedValue("granted"),
        create: notificationCreateMock,
        clear: notificationClearMock,
        onClicked: {
          addListener: vi.fn((listener: (id: string) => void) => {
            notificationClickListeners.push(listener)
          }),
          removeListener: vi.fn(),
        },
      },
    }

    vi.doMock("~/utils/browser/tabs", async (importOriginal) => ({
      ...(await importOriginal<typeof import("~/utils/browser/tabs")>()),
      createTab: createTabMock,
      onTabRemoved: onTabRemovedMock,
    }))
    vi.doMock("~/utils/browser/windows", async (importOriginal) => ({
      ...(await importOriginal<typeof import("~/utils/browser/windows")>()),
      createWindow: createWindowMock,
      hasWindowsAPI: hasWindowsApiMock,
      onWindowRemoved: onWindowRemovedMock,
    }))
    vi.doMock(
      "~/services/permissions/permissionManager",
      async (importOriginal) => {
        const actual =
          await importOriginal<
            typeof import("~/services/permissions/permissionManager")
          >()

        return {
          ...actual,
          hasPermission: hasPermissionMock,
        }
      },
    )
    vi.doMock("~/utils/browser/cookieHelper", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/cookieHelper")>()

      return {
        ...actual,
        addAuthMethodHeader: addAuthMethodHeaderMock,
        getCookieHeaderForUrl: getCookieHeaderForUrlMock,
      }
    })
    vi.doMock("~/utils/browser/browserFocus", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserFocus")>()

      return {
        ...actual,
        createBrowserFocusObservation: createBrowserFocusObservationMock,
      }
    })
    vi.doMock("~/services/preferences/userPreferences", () => ({
      userPreferences: { getPreferences: getPreferencesMock },
    }))
    vi.doMock("~/utils/i18n/core", () => ({
      t: vi.fn((key: string) => key),
    }))
    vi.doMock("~/utils/browser/notifications", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/notifications")>()
      return {
        ...actual,
        clearNotification: vi.fn(actual.clearNotification),
      }
    })
    // Load the pool fixture before the behavior clock starts. Cold module
    // transforms on Windows must not race a running fake-timer scenario.
    const adapter = await import("./tempWindowPoolTestAdapter")
    presentFromPool = adapter.presentTempContextForTurnstileAssist
    fetchFromPool = adapter.handleTempWindowTurnstileFetch
  }, 120_000)

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser
    vi.useRealTimers()
    vi.doUnmock("~/utils/browser/tabs")
    vi.doUnmock("~/utils/browser/windows")
    vi.doUnmock("~/services/permissions/permissionManager")
    vi.doUnmock("~/services/preferences/userPreferences")
    vi.doUnmock("~/utils/i18n/core")
    vi.doUnmock("~/utils/browser/notifications")
    vi.resetModules()
    vi.restoreAllMocks()
  })

  /** Windows the pool brought to the foreground, in call order. */
  function focusedWindowIds() {
    return windowsUpdateMock.mock.calls
      .filter(
        ([, options]) =>
          (options as { focused?: boolean } | undefined)?.focused === true,
      )
      .map(([windowId]) => windowId)
  }

  /** Starts one in-flight Turnstile fetch for a distinct origin. */
  async function startTurnstileFetch(requestId: string, origin: string) {
    const sendResponse = vi.fn()
    const request = fetchFromPool(
      {
        originUrl: origin,
        pageUrl: `${origin}/checkin`,
        fetchUrl: `${origin}/api/checkin`,
        fetchOptions: { method: "POST" },
        requestId,
      },
      sendResponse,
    )

    await settleTempContextReadiness()
    return { request, sendResponse }
  }

  /** Asks the pool to present one waiting verification window. */
  async function presentAssist(
    requestId: string,
    options?: { forceFocus?: boolean },
  ) {
    return (await presentFromPool(requestId, options)) as PresentedAssist
  }

  async function finish(task: Awaited<ReturnType<typeof startTurnstileFetch>>) {
    for (const deferred of contentWaits.values())
      deferred.resolve({ success: false, status: "timeout" })
    await task.request
    await settleTempContextRelease()
  }

  it("keeps failed reminders in the background without enabling another channel", async () => {
    turnstileAssistPresentation = "page"
    const task = await startTurnstileFetch("req-failed", "https://a.invalid")
    expect(await presentAssist("req-failed")).toMatchObject({
      presented: false,
      reason: "notice_unavailable",
    })
    expect(focusedWindowIds()).toEqual([])
    expect(notificationCreateMock).not.toHaveBeenCalled()
    await finish(task)
  })

  it("sends both enabled reminders and clears the page reminder on completion", async () => {
    turnstileAssistPresentation = "both"
    ;(globalThis as any).browser.runtime.sendMessage.mockResolvedValue({
      presented: true,
    })
    const task = await startTurnstileFetch("req-both", "https://a.invalid")
    expect(await presentAssist("req-both")).toMatchObject({
      presented: true,
      focused: false,
      channels: ["page", "system"],
    })
    expect(notificationCreateMock).toHaveBeenCalledWith(
      "all-api-hub:turnstile-assist:req-both",
      expect.objectContaining({ isClickable: true }),
    )
    expect(focusedWindowIds()).toEqual([])
    await finish(task)
    expect(
      (globalThis as any).browser.runtime.sendMessage,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-both", dismiss: true }),
    )
  })

  it("does not use page reminders when only browser notifications are enabled", async () => {
    turnstileAssistPresentation = "notify"
    notificationCreateMock.mockResolvedValue(null)
    ;(globalThis as any).browser.runtime.sendMessage.mockResolvedValue({
      presented: true,
    })
    const task = await startTurnstileFetch("req-system", "https://a.invalid")
    expect(await presentAssist("req-system")).toMatchObject({
      presented: false,
    })
    expect(
      (globalThis as any).browser.runtime.sendMessage,
    ).not.toHaveBeenCalled()
    expect(focusedWindowIds()).toEqual([])
    await finish(task)
  })

  it("stays quiet when both channels are disabled", async () => {
    turnstileAssistPresentation = "quiet"
    const task = await startTurnstileFetch("req-quiet", "https://a.invalid")
    expect(await presentAssist("req-quiet")).toMatchObject({
      presented: false,
      reason: "quiet",
    })
    expect(focusedWindowIds()).toEqual([])
    expect(notificationCreateMock).not.toHaveBeenCalled()
    await finish(task)
  })

  it("focuses verification only after the user clicks a browser notification", async () => {
    turnstileAssistPresentation = "notify"
    const task = await startTurnstileFetch("req-click", "https://a.invalid")
    expect(await presentAssist("req-click")).toMatchObject({
      presented: true,
      focused: false,
    })
    expect(focusedWindowIds()).toEqual([])
    const { setupTempWindowListeners } = await import(
      "./tempWindowPoolTestAdapter"
    )
    setupTempWindowListeners()
    notificationClickListeners.forEach((listener) =>
      listener("all-api-hub:turnstile-assist:req-click"),
    )
    await flushAssistWork()
    expect(focusedWindowIds()).toEqual([101])
    await finish(task)
    notificationClickListeners.forEach((listener) =>
      listener("all-api-hub:turnstile-assist:req-click"),
    )
    await flushAssistWork()
    expect(focusedWindowIds()).toEqual([101])
  })

  it("validates request and context existence and failure handling during assist presentation", async () => {
    expect(await presentAssist("")).toEqual({
      presented: false,
      reason: "missing_request",
    })
    expect(await presentAssist("nonexistent")).toEqual({
      presented: false,
      reason: "missing_context",
    })

    const task = await startTurnstileFetch(
      "req-present-fail",
      "https://a.invalid",
    )
    windowsUpdateMock.mockRejectedValueOnce(new Error("window crashed"))
    expect(
      await presentAssist("req-present-fail", { forceFocus: true }),
    ).toEqual({
      presented: false,
      reason: "present_failed",
    })
    await finish(task)
  })

  it("falls back to focused window and active tab when runtime message is not presented", async () => {
    turnstileAssistPresentation = "page"
    ;(globalThis as any).browser.runtime.sendMessage.mockResolvedValue({
      presented: false,
    })
    tabsQueryMock.mockImplementation(
      async (query?: {
        windowId?: number
        active?: boolean
        lastFocusedWindow?: boolean
      }) => {
        if (query?.windowId != null) {
          const match = createdContexts.find(
            (item) => item.windowId === query.windowId,
          )
          return match ? [{ id: match.tabId }] : []
        }
        if (query?.active) return [{ id: 999 }]
        return []
      },
    )
    sendMessageMock.mockImplementation(
      async (tabId: number, message: { action: string }) => {
        if (message.action === RuntimeActionIds.TurnstileAssistPageNotice) {
          return { presented: true }
        }
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentWaitForTurnstileToken: {
            const deferred = createDeferred<any>()
            contentWaits.set(tabId, deferred)
            return deferred.promise
          }
          case RuntimeActionIds.ContentPerformTempWindowFetch:
            return { success: true, status: 200, data: { success: true } }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const task = await startTurnstileFetch(
      "req-tab-fallback",
      "https://a.invalid",
    )
    const assistResult = await presentAssist("req-tab-fallback")
    expect(assistResult).toMatchObject({
      presented: true,
      channels: ["page"],
    })
    expect(sendMessageMock).toHaveBeenCalledWith(
      999,
      expect.objectContaining({
        action: RuntimeActionIds.TurnstileAssistPageNotice,
        requestId: "req-tab-fallback",
      }),
      expect.anything(),
    )

    await finish(task)
    expect(sendMessageMock).toHaveBeenCalledWith(
      999,
      expect.objectContaining({
        action: RuntimeActionIds.TurnstileAssistPageNotice,
        requestId: "req-tab-fallback",
        dismiss: true,
      }),
      expect.anything(),
    )
  })

  it("handles turnstile assist runtime messages for assist requests, probe api, and user click open", async () => {
    const { setupTempWindowListeners } = await import(
      "./tempWindowPoolTestAdapter"
    )
    setupTempWindowListeners()
    const handler = runtimeMessageListeners[0]!

    // Unrecognized action
    expect(handler({ action: "unknown_action" }, {}, vi.fn())).toBeUndefined()

    const task = await startTurnstileFetch("req-msg", "https://a.invalid")

    // 1. TurnstileRequestUserAssist
    const replyUserAssist = vi.fn()
    ;(globalThis as any).browser.runtime.sendMessage.mockResolvedValue({
      presented: true,
    })
    expect(
      handler(
        {
          action: RuntimeActionIds.TurnstileRequestUserAssist,
          requestId: "req-msg",
        },
        {},
        replyUserAssist,
      ),
    ).toBe(true)
    await flushAssistWork()
    expect(replyUserAssist).toHaveBeenCalledWith(
      expect.objectContaining({ presented: true }),
    )

    // 2. TurnstileReadPageApi
    const replyProbe = vi.fn()
    expect(
      handler(
        { action: RuntimeActionIds.TurnstileReadPageApi, allowExecute: true },
        { tab: { id: 201 } },
        replyProbe,
      ),
    ).toBe(true)
    await flushAssistWork()
    expect(replyProbe).toHaveBeenCalledWith({
      success: true,
      token: "token-from-probe",
      hasApi: true,
    })

    // Probe missing tab
    const replyProbeMissing = vi.fn()
    expect(
      handler(
        { action: RuntimeActionIds.TurnstileReadPageApi },
        { tab: { id: 999 } },
        replyProbeMissing,
      ),
    ).toBe(true)
    await flushAssistWork()
    expect(replyProbeMissing).toHaveBeenCalledWith({
      success: false,
      token: null,
      hasApi: false,
    })

    // 3. TurnstileAssistOpen - missing notice
    const replyOpenMissing = vi.fn()
    expect(
      handler(
        {
          action: RuntimeActionIds.TurnstileAssistOpen,
          requestId: "no-notice",
        },
        {},
        replyOpenMissing,
      ),
    ).toBe(true)
    expect(replyOpenMissing).toHaveBeenCalledWith({
      presented: false,
      reason: "missing_notice",
    })

    // 4. TurnstileAssistOpen - with notice registered via tab fallback
    tabsQueryMock.mockImplementation(
      async (query?: { windowId?: number; active?: boolean }) => {
        if (query?.active) return [{ id: 999 }]
        return []
      },
    )
    ;(globalThis as any).browser.runtime.sendMessage.mockResolvedValue({
      presented: false,
    })
    const prevSendMessage = sendMessageMock.getMockImplementation()
    sendMessageMock.mockImplementation(
      async (tabId: number, message: { action: string }, ...args) => {
        if (message.action === RuntimeActionIds.TurnstileAssistPageNotice) {
          return { presented: true }
        }
        return (prevSendMessage as ((...args: any[]) => any) | undefined)?.(
          tabId,
          message,
          ...args,
        )
      },
    )
    await presentAssist("req-msg")

    // Mismatched sender tab
    const replyMismatch = vi.fn()
    expect(
      handler(
        { action: RuntimeActionIds.TurnstileAssistOpen, requestId: "req-msg" },
        { tab: { id: 888 } },
        replyMismatch,
      ),
    ).toBe(true)
    expect(replyMismatch).toHaveBeenCalledWith({
      presented: false,
      reason: "missing_notice",
    })

    // Matching sender tab
    const replyMatch = vi.fn()
    expect(
      handler(
        { action: RuntimeActionIds.TurnstileAssistOpen, requestId: "req-msg" },
        { tab: { id: 999 } },
        replyMatch,
      ),
    ).toBe(true)
    await flushAssistWork()
    expect(replyMatch).toHaveBeenCalledWith(
      expect.objectContaining({ presented: true, focused: true }),
    )
    expect(focusedWindowIds()).toContain(101)

    await finish(task)
  })

  it("ignores notification clicks with unrelated notification IDs", async () => {
    const { setupTempWindowListeners } = await import(
      "./tempWindowPoolTestAdapter"
    )
    setupTempWindowListeners()
    notificationClickListeners.forEach((listener) =>
      listener("unrelated-notification-id"),
    )
    await flushAssistWork()
    expect(focusedWindowIds()).toEqual([])
  })

  it("covers turnstile assist edge cases for detached contexts, tab resolution, and notice handling", async () => {
    // 1. Line 90: clearNotification rejection in drop
    const notifications = await import("~/utils/browser/notifications")
    vi.mocked(notifications.clearNotification).mockRejectedValueOnce(
      new Error("clear failed"),
    )
    const assist = createTempContextTurnstileAssist({
      getRequestContext: () => undefined,
      hasTab: () => false,
    })
    expect(() => assist.drop("req-drop")).not.toThrow()
    await Promise.resolve()

    // 2. Lines 134, 136, 137: context without ownerWindowId resolving window from getTab
    tabsGetMock.mockResolvedValueOnce({ id: 301, windowId: 777 })
    const tabOnlyContext: any = { tabId: 301 }
    const assistTabOnly = createTempContextTurnstileAssist({
      getRequestContext: () => tabOnlyContext,
      hasTab: () => true,
    })
    const forceFocusRes = await assistTabOnly.present("req-no-win", {
      forceFocus: true,
    })
    expect(forceFocusRes).toMatchObject({ presented: true, focused: true })
    expect(windowsUpdateMock).toHaveBeenCalledWith(777, expect.anything())

    // 3. Lines 176, 177: context detachment during deliverTurnstileAssistNotice
    turnstileAssistPresentation = "page"
    let detachableContext: any = { tabId: 302, ownerWindowId: 888 }
    const assistDetachable = createTempContextTurnstileAssist({
      getRequestContext: () => detachableContext,
      hasTab: () => true,
    })
    ;(globalThis as any).browser.runtime.sendMessage.mockImplementationOnce(
      async () => {
        detachableContext = undefined
        return { presented: true }
      },
    )
    const detachedRes = await assistDetachable.present("req-detach")
    expect(detachedRes).toEqual({ presented: false, reason: "missing_context" })

    // 4. Line 197: context missing immediately after clearAssistNotice during forceFocus
    let getContextCall = 0
    const assistVolatile = createTempContextTurnstileAssist({
      getRequestContext: () => {
        getContextCall++
        return getContextCall === 1 ? ({ tabId: 303 } as any) : undefined
      },
      hasTab: () => true,
    })
    const volatileRes = await assistVolatile.present("req-volatile", {
      forceFocus: true,
    })
    expect(volatileRes).toEqual({ presented: false, reason: "missing_context" })

    // 5. Line 65: queryTabs error in notifyCurrentPage
    tabsQueryMock.mockRejectedValueOnce(new Error("tabs query failed"))
    ;(globalThis as any).browser.runtime.sendMessage.mockResolvedValueOnce({
      presented: false,
    })
    const assistQueryFail = createTempContextTurnstileAssist({
      getRequestContext: () => ({ tabId: 304, ownerWindowId: 999 }) as any,
      hasTab: () => true,
    })
    const failRes = await assistQueryFail.present("req-query-fail")
    expect(failRes).toMatchObject({
      presented: false,
      reason: "notice_unavailable",
    })

    // 6. Line 275: TurnstileAssistOpen with non-string requestId
    assist.setup()
    const lastHandler =
      runtimeMessageListeners[runtimeMessageListeners.length - 1]!
    const replyNonString = vi.fn()
    expect(
      lastHandler(
        { action: RuntimeActionIds.TurnstileAssistOpen, requestId: 12345 },
        {},
        replyNonString,
      ),
    ).toBe(true)
    expect(replyNonString).toHaveBeenCalledWith({
      presented: false,
      reason: "missing_notice",
    })
  })
})
