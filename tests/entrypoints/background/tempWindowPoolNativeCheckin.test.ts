import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { AuthTypeEnum } from "~/types"

const originalBrowser = (globalThis as any).browser

type RuntimeMessage = {
  action: string
  requestId?: string
}

function findLastCallIndex<T>(
  calls: T[],
  predicate: (call: T) => boolean,
): number {
  for (let index = calls.length - 1; index >= 0; index -= 1) {
    if (predicate(calls[index])) return index
  }

  return -1
}

async function settleTempContextReadiness() {
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(500)
  await Promise.resolve()
  await vi.advanceTimersByTimeAsync(500)
}

describe("tempWindowPool native check-in page action", () => {
  let createTabMock: ReturnType<typeof vi.fn>
  let createWindowMock: ReturnType<typeof vi.fn>
  let removeTabOrWindowMock: ReturnType<typeof vi.fn>
  let hasWindowsApiMock: ReturnType<typeof vi.fn>
  let onTabRemovedMock: ReturnType<typeof vi.fn>
  let onWindowRemovedMock: ReturnType<typeof vi.fn>
  let sendMessageMock: ReturnType<typeof vi.fn>
  let tabsGetMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()

    createTabMock = vi.fn().mockResolvedValue({ id: 701 })
    createWindowMock = vi.fn()
    removeTabOrWindowMock = vi.fn().mockResolvedValue(undefined)
    hasWindowsApiMock = vi.fn(() => true)
    onTabRemovedMock = vi.fn(() => () => {})
    onWindowRemovedMock = vi.fn(() => () => {})
    tabsGetMock = vi.fn().mockResolvedValue({ status: "complete" })
    sendMessageMock = vi.fn(async (_tabId: number, message: RuntimeMessage) => {
      switch (message.action) {
        case RuntimeActionIds.ContentShowShieldBypassUi:
          return undefined
        case RuntimeActionIds.ContentCheckCapGuard:
        case RuntimeActionIds.ContentCheckCloudflareGuard:
          return { success: true, passed: true }
        case RuntimeActionIds.ContentGetUserFromLocalStorage:
          return {
            success: true,
            data: {
              userId: "target-user",
              user: { id: "target-user", username: "Target" },
              siteTypeHint: SITE_TYPES.NEW_API,
            },
          }
        case RuntimeActionIds.ContentTriggerCheckinPageAction:
          return {
            success: true,
            status: "clicked",
            clicked: true,
            reason: "clicked",
            detection: {
              hasTurnstile: false,
              reasons: [],
              score: 0,
              title: "Check in",
              url: "https://example.invalid/console/personal",
            },
          }
        default:
          throw new Error(`Unexpected action: ${message.action}`)
      }
    })
    ;(globalThis as any).browser = {
      storage: originalBrowser.storage,
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      },
      tabs: {
        get: tabsGetMock,
        query: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue(undefined),
        sendMessage: sendMessageMock,
      },
      windows: {
        get: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
      },
    }

    vi.doMock("~/utils/browser/browserApi", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserApi")>()
      return {
        ...actual,
        createTab: createTabMock,
        createWindow: createWindowMock,
        hasWindowsAPI: hasWindowsApiMock,
        onTabRemoved: onTabRemovedMock,
        onWindowRemoved: onWindowRemovedMock,
        removeTabOrWindow: removeTabOrWindowMock,
      }
    })
    vi.doMock("~/services/preferences/userPreferences", () => ({
      DEFAULT_PREFERENCES: {
        tempWindowFallback: {
          tempContextMode: "tab",
        },
      },
      userPreferences: {
        getPreferences: vi.fn().mockResolvedValue({
          tempWindowFallback: {
            tempContextMode: "tab",
          },
        }),
      },
    }))
    vi.doMock("~/utils/i18n/core", () => ({
      t: vi.fn((key: string) => key),
    }))
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("refuses invalid native page action requests before opening a context", async () => {
    const { handleTempWindowCheckinPageAction } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )

    const sendResponse = vi.fn()
    await handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
      },
      sendResponse,
    )

    expect(createTabMock).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      reason: "invalid_request",
      error: "messages:background.invalidFetchRequest",
    })
  })

  it("resolves page identity and triggers the page action when identity matches", async () => {
    const { handleTempWindowCheckinPageAction } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-match",
        authType: AuthTypeEnum.AccessToken,
        trigger: { kind: "checkinButton" },
      },
      sendResponse,
    )

    await settleTempContextReadiness()
    await request

    expect(sendMessageMock).toHaveBeenCalledWith(
      701,
      expect.objectContaining({
        action: RuntimeActionIds.ContentGetUserFromLocalStorage,
        url: "https://example.invalid/console/personal",
        siteType: SITE_TYPES.NEW_API,
      }),
    )
    expect(sendMessageMock).toHaveBeenCalledWith(
      701,
      expect.objectContaining({
        action: RuntimeActionIds.ContentTriggerCheckinPageAction,
        requestId: "req-native-match",
        trigger: { kind: "checkinButton" },
      }),
    )
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        reason: "clicked",
        identity: {
          userId: "target-user",
          user: { id: "target-user", username: "Target" },
          siteTypeHint: SITE_TYPES.NEW_API,
        },
        trigger: expect.objectContaining({
          status: "clicked",
          clicked: true,
        }),
      }),
    )
  })

  it("does not click when page identity is missing", async () => {
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: RuntimeMessage) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            return { success: false, error: "not logged in" }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowCheckinPageAction } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-missing-identity",
      },
      sendResponse,
    )

    await settleTempContextReadiness()
    await request

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      701,
      expect.objectContaining({
        action: RuntimeActionIds.ContentTriggerCheckinPageAction,
      }),
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      reason: "identity_missing",
      identity: null,
    })
  })

  it("does not click when page identity lookup rejects", async () => {
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: RuntimeMessage) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            throw new Error("identity runtime unavailable")
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowCheckinPageAction } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-identity-rejects",
      },
      sendResponse,
    )

    await settleTempContextReadiness()
    await request

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      701,
      expect.objectContaining({
        action: RuntimeActionIds.ContentTriggerCheckinPageAction,
      }),
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      reason: "identity_missing",
      identity: null,
    })
  })

  it("does not click when page identity differs from the target account", async () => {
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: RuntimeMessage) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            return {
              success: true,
              data: {
                userId: "other-user",
                user: { id: "other-user" },
              },
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowCheckinPageAction } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-mismatch",
      },
      sendResponse,
    )

    await settleTempContextReadiness()
    await request

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      reason: "identity_mismatch",
      identity: {
        userId: "other-user",
        user: { id: "other-user" },
      },
      expectedUserId: "target-user",
    })
  })

  it("maps a content trigger target miss without treating it as success", async () => {
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: RuntimeMessage) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            return {
              success: true,
              data: {
                userId: "target-user",
                user: { id: "target-user" },
              },
            }
          case RuntimeActionIds.ContentTriggerCheckinPageAction:
            return {
              success: true,
              status: "target_not_found",
              clicked: false,
              reason: "noTarget",
              detection: {
                hasTurnstile: false,
                reasons: [],
                score: 0,
                title: "Check in",
                url: "https://example.invalid/console/personal",
              },
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowCheckinPageAction } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-target-missing",
      },
      sendResponse,
    )

    await settleTempContextReadiness()
    await request

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        reason: "target_not_found",
        trigger: expect.objectContaining({
          status: "target_not_found",
          clicked: false,
        }),
      }),
    )
  })

  it("navigates a reused context back to the requested page before triggering", async () => {
    const {
      handleTempWindowCheckinPageAction,
      handleTempWindowTurnstileFetch,
    } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )

    const firstRequest = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-reuse-first",
      },
      vi.fn(),
    )
    await settleTempContextReadiness()
    await firstRequest

    sendMessageMock.mockImplementation(
      async (_tabId: number, message: RuntimeMessage) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentWaitForTurnstileToken:
            return {
              success: true,
              status: "token_obtained",
              token: "turnstile-token",
              detection: {
                hasTurnstile: true,
                reasons: ["widget"],
                score: 1,
                title: "Challenge",
                url: "https://example.invalid/console/challenge",
              },
            }
          case RuntimeActionIds.ContentPerformTempWindowFetch:
            return { success: true, data: { ok: true } }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            return {
              success: true,
              data: {
                userId: "target-user",
                user: { id: "target-user" },
              },
            }
          case RuntimeActionIds.ContentTriggerCheckinPageAction:
            return {
              success: true,
              status: "clicked",
              clicked: true,
              reason: "clicked",
              detection: {
                hasTurnstile: false,
                reasons: [],
                score: 0,
                title: "Check in",
                url: "https://example.invalid/console/personal",
              },
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const turnstileResponse = vi.fn()
    const turnstileRequest = handleTempWindowTurnstileFetch(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/challenge",
        fetchUrl: "https://example.invalid/api/checkin",
        fetchOptions: { method: "POST" },
        requestId: "req-native-reuse-turnstile",
      },
      turnstileResponse,
    )
    await settleTempContextReadiness()
    await turnstileRequest

    const secondResponse = vi.fn()
    const secondRequest = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-reuse-second",
      },
      secondResponse,
    )
    await settleTempContextReadiness()
    await secondRequest

    expect((globalThis as any).browser.tabs.update).toHaveBeenCalledWith(701, {
      url: "https://example.invalid/console/challenge",
    })
    expect((globalThis as any).browser.tabs.update).toHaveBeenCalledWith(701, {
      url: "https://example.invalid/console/personal",
    })

    const personalNavigationIndex = findLastCallIndex(
      (globalThis as any).browser.tabs.update.mock.calls,
      ([, updateInfo]: [number, { url?: string }]) =>
        updateInfo.url === "https://example.invalid/console/personal",
    )
    const identityLookupIndex = findLastCallIndex(
      sendMessageMock.mock.calls,
      (call) => {
        const message = call[1] as RuntimeMessage | undefined
        return (
          message?.action === RuntimeActionIds.ContentGetUserFromLocalStorage &&
          message.requestId === undefined
        )
      },
    )

    expect(personalNavigationIndex).toBeGreaterThan(-1)
    expect(identityLookupIndex).toBeGreaterThan(-1)
    expect(personalNavigationIndex).toBeLessThan(identityLookupIndex)
    expect(secondResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        reason: "clicked",
      }),
    )
  })

  it("verifies the live tab url before reusing a cached temp context page", async () => {
    const { handleTempWindowCheckinPageAction } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )

    const firstRequest = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-live-url-first",
      },
      vi.fn(),
    )
    await settleTempContextReadiness()
    await firstRequest

    tabsGetMock.mockResolvedValue({ status: "complete", url: "about:blank" })

    const secondResponse = vi.fn()
    const secondRequest = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-live-url-second",
      },
      secondResponse,
    )
    await settleTempContextReadiness()
    await secondRequest

    expect((globalThis as any).browser.tabs.update).toHaveBeenCalledWith(701, {
      url: "https://example.invalid/console/personal",
    })
    expect(secondResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        reason: "clicked",
      }),
    )
  })

  it("maps a content trigger throttle without treating it as success", async () => {
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: RuntimeMessage) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            return {
              success: true,
              data: {
                userId: "target-user",
                user: { id: "target-user" },
              },
            }
          case RuntimeActionIds.ContentTriggerCheckinPageAction:
            return {
              success: true,
              status: "throttled",
              clicked: false,
              reason: "throttled",
              detection: {
                hasTurnstile: false,
                reasons: [],
                score: 0,
                title: "Check in",
                url: "https://example.invalid/console/personal",
              },
            }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowCheckinPageAction } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-throttled",
      },
      sendResponse,
    )

    await settleTempContextReadiness()
    await request

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        reason: "throttled",
        trigger: expect.objectContaining({
          status: "throttled",
          clicked: false,
        }),
      }),
    )
  })

  it("maps missing and failed content trigger responses to trigger_failed", async () => {
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: RuntimeMessage) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentGetUserFromLocalStorage:
            return {
              success: true,
              data: {
                userId: "target-user",
                user: { id: "target-user" },
              },
            }
          case RuntimeActionIds.ContentTriggerCheckinPageAction:
            return message.requestId === "req-native-trigger-no-response"
              ? undefined
              : { success: false, error: "content trigger failed" }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowCheckinPageAction } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )

    const noResponse = vi.fn()
    const noResponseRequest = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-trigger-no-response",
      },
      noResponse,
    )

    await settleTempContextReadiness()
    await noResponseRequest

    const failedResponse = vi.fn()
    const failedRequest = handleTempWindowCheckinPageAction(
      {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        expectedUserId: "target-user",
        siteType: SITE_TYPES.NEW_API,
        requestId: "req-native-trigger-failed",
      },
      failedResponse,
    )

    await settleTempContextReadiness()
    await failedRequest

    expect(noResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        reason: "trigger_failed",
        error: "No response from temp window fetch",
      }),
    )
    expect(failedResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        reason: "trigger_failed",
        error: "content trigger failed",
      }),
    )
  })

  it("keeps browser check-in visible, triggers once, and waits for success evidence", async () => {
    let browserCheckInSteps = 0
    tabsGetMock.mockResolvedValue({
      id: 701,
      windowId: 77,
      status: "complete",
      url: "https://example.invalid/checkin",
    })
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: RuntimeMessage) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentWaitForTurnstileToken:
            return {
              success: true,
              status: "not_present",
              token: null,
              detection: {
                hasTurnstile: false,
                reasons: [],
                score: 0,
                title: "Check in",
                url: "https://example.invalid/checkin",
              },
            }
          case RuntimeActionIds.ContentRunBrowserCheckIn:
            browserCheckInSteps += 1
            return browserCheckInSteps === 1
              ? {
                  success: false,
                  reason: "action_triggered",
                  actionTriggered: true,
                  currentUrl: "https://example.invalid/checkin",
                }
              : {
                  success: true,
                  reason: "completed",
                  actionTriggered: true,
                  matchedCondition: "text",
                  currentUrl: "https://example.invalid/checkin",
                }
          default:
            throw new Error(`Unexpected action: ${message.action}`)
        }
      },
    )

    const { handleTempWindowBrowserCheckIn } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowBrowserCheckIn(
      {
        pageUrl: "https://example.invalid/checkin",
        requestId: "req-browser-checkin",
        action: { kind: "page_load" },
        success: { textPattern: "check-in complete" },
        timeoutMs: 5_000,
      },
      sendResponse,
    )

    await settleTempContextReadiness()
    await request

    expect((globalThis as any).browser.windows.update).toHaveBeenCalledWith(
      77,
      {
        focused: true,
      },
    )
    expect((globalThis as any).browser.tabs.update).toHaveBeenCalledWith(701, {
      active: true,
    })
    expect(browserCheckInSteps).toBe(2)
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      reason: "completed",
      actionTriggered: true,
      matchedCondition: "text",
      currentUrl: "https://example.invalid/checkin",
    })
  })

  it("waits for the page Turnstile token after the native check-in click", async () => {
    let browserCheckInSteps = 0
    let turnstileWaits = 0
    tabsGetMock.mockResolvedValue({
      id: 702,
      windowId: 78,
      status: "complete",
      url: "https://example.invalid/checkin",
    })
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: RuntimeMessage) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentWaitForTurnstileToken:
            turnstileWaits += 1
            return {
              success: true,
              status: "token_obtained",
              token: "page-token-must-not-be-replayed",
              detection: {
                hasTurnstile: true,
                reasons: ["cf-turnstile-response-field"],
                score: 3,
                title: "Check in",
                url: "https://example.invalid/checkin",
              },
            }
          case RuntimeActionIds.ContentRunBrowserCheckIn:
            browserCheckInSteps += 1
            return browserCheckInSteps === 1
              ? {
                  success: false,
                  reason: "action_triggered",
                  actionTriggered: true,
                  currentUrl: "https://example.invalid/checkin",
                }
              : {
                  success: true,
                  reason: "completed",
                  actionTriggered: true,
                  matchedCondition: "text",
                  currentUrl: "https://example.invalid/checkin",
                }
          default:
            throw new Error("Unexpected action: " + message.action)
        }
      },
    )

    const { handleTempWindowBrowserCheckIn } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )

    const sendResponse = vi.fn()
    const request = handleTempWindowBrowserCheckIn(
      {
        pageUrl: "https://example.invalid/checkin",
        requestId: "req-browser-checkin-turnstile",
        action: {
          kind: "click_selector",
          selector: "#check-in",
        },
        success: { textPattern: "check-in complete" },
        timeoutMs: 5_000,
      },
      sendResponse,
    )

    await settleTempContextReadiness()
    await request

    expect(turnstileWaits).toBe(1)
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        reason: "completed",
      }),
    )

    const actions = sendMessageMock.mock.calls.map(
      ([, message]) => message.action,
    )
    expect(
      actions.filter(
        (action) => action === RuntimeActionIds.ContentWaitForTurnstileToken,
      ),
    ).toHaveLength(1)
    expect(actions).not.toContain(
      RuntimeActionIds.ContentPerformTempWindowFetch,
    )
  })

  it("continues without a Turnstile wait when the page has no widget", async () => {
    let browserCheckInSteps = 0
    tabsGetMock.mockResolvedValue({
      id: 703,
      windowId: 79,
      status: "complete",
      url: "https://example.invalid/checkin",
    })
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: RuntimeMessage) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentWaitForTurnstileToken:
            return {
              success: true,
              status: "not_present",
              token: null,
              detection: {
                hasTurnstile: false,
                reasons: [],
                score: 0,
                title: "Check in",
                url: "https://example.invalid/checkin",
              },
            }
          case RuntimeActionIds.ContentRunBrowserCheckIn:
            browserCheckInSteps += 1
            return browserCheckInSteps === 1
              ? {
                  success: false,
                  reason: "action_triggered",
                  actionTriggered: true,
                  currentUrl: "https://example.invalid/checkin",
                }
              : {
                  success: true,
                  reason: "completed",
                  actionTriggered: true,
                  matchedCondition: "selector",
                  currentUrl: "https://example.invalid/checkin",
                }
          default:
            throw new Error("Unexpected action: " + message.action)
        }
      },
    )

    const { handleTempWindowBrowserCheckIn } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )
    const sendResponse = vi.fn()
    const request = handleTempWindowBrowserCheckIn(
      {
        pageUrl: "https://example.invalid/checkin",
        requestId: "req-browser-checkin-no-turnstile",
        action: { kind: "click_selector", selector: "#check-in" },
        success: { selector: ".done" },
        timeoutMs: 5_000,
      },
      sendResponse,
    )

    await settleTempContextReadiness()
    await request

    expect(browserCheckInSteps).toBe(2)
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, reason: "completed" }),
    )
  })

  it("does not report success when the page Turnstile wait fails", async () => {
    let browserCheckInSteps = 0
    tabsGetMock.mockResolvedValue({
      id: 704,
      windowId: 80,
      status: "complete",
      url: "https://example.invalid/checkin",
    })
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: RuntimeMessage) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentWaitForTurnstileToken:
            return {
              success: true,
              status: "timeout",
              token: null,
              detection: {
                hasTurnstile: true,
                reasons: ["cf-turnstile-class"],
                score: 2,
                title: "Check in",
                url: "https://example.invalid/checkin",
              },
            }
          case RuntimeActionIds.ContentRunBrowserCheckIn:
            browserCheckInSteps += 1
            return browserCheckInSteps === 1
              ? {
                  success: false,
                  reason: "action_triggered",
                  actionTriggered: true,
                  currentUrl: "https://example.invalid/checkin",
                }
              : {
                  success: true,
                  reason: "completed",
                  actionTriggered: true,
                  matchedCondition: "text",
                  currentUrl: "https://example.invalid/checkin",
                }
          default:
            throw new Error("Unexpected action: " + message.action)
        }
      },
    )

    const { handleTempWindowBrowserCheckIn } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )
    const sendResponse = vi.fn()
    const request = handleTempWindowBrowserCheckIn(
      {
        pageUrl: "https://example.invalid/checkin",
        requestId: "req-browser-checkin-turnstile-timeout",
        action: { kind: "click_selector", selector: "#check-in" },
        success: { textPattern: "never appears" },
        timeoutMs: 1_000,
      },
      sendResponse,
    )

    await settleTempContextReadiness()
    await vi.advanceTimersByTimeAsync(2_000)
    await request

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, reason: "timeout" }),
    )
  })

  it("waits for the replacement document before asking it about Turnstile", async () => {
    let browserCheckInSteps = 0
    let turnstileWaits = 0
    let clickObserved = false
    let postClickTabReads = 0
    let navigationSettled = false

    tabsGetMock.mockImplementation(async () => {
      if (!clickObserved) {
        return {
          id: 705,
          windowId: 81,
          status: "complete",
          url: "https://example.invalid/checkin",
        }
      }

      postClickTabReads += 1
      if (postClickTabReads < 2) {
        return {
          id: 705,
          windowId: 81,
          status: "loading",
          url: "https://example.invalid/checkin/processing",
        }
      }

      navigationSettled = true
      return {
        id: 705,
        windowId: 81,
        status: "complete",
        url: "https://example.invalid/checkin/success",
      }
    })
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: RuntimeMessage) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentWaitForTurnstileToken:
            turnstileWaits += 1
            if (!navigationSettled) {
              throw new Error("Receiving end does not exist")
            }
            return {
              success: true,
              status: "not_present",
              token: null,
              detection: {
                hasTurnstile: false,
                reasons: [],
                score: 0,
                title: "Check in",
                url: "https://example.invalid/checkin/success",
              },
            }
          case RuntimeActionIds.ContentRunBrowserCheckIn:
            browserCheckInSteps += 1
            if (browserCheckInSteps === 1) {
              clickObserved = true
              return {
                success: false,
                reason: "action_triggered",
                actionTriggered: true,
                currentUrl: "https://example.invalid/checkin",
              }
            }
            return {
              success: true,
              reason: "completed",
              actionTriggered: true,
              matchedCondition: "url",
              currentUrl: "https://example.invalid/checkin/success",
            }
          default:
            throw new Error("Unexpected action: " + message.action)
        }
      },
    )

    const { handleTempWindowBrowserCheckIn } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )
    const sendResponse = vi.fn()
    const request = handleTempWindowBrowserCheckIn(
      {
        pageUrl: "https://example.invalid/checkin",
        requestId: "req-browser-checkin-navigation",
        action: { kind: "click_selector", selector: "#check-in" },
        success: { urlPattern: "/checkin/success$" },
        timeoutMs: 8_000,
      },
      sendResponse,
    )

    await settleTempContextReadiness()
    await vi.advanceTimersByTimeAsync(12_000)
    await request

    expect(postClickTabReads).toBeGreaterThanOrEqual(2)
    expect(turnstileWaits).toBe(1)
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        reason: "completed",
        matchedCondition: "url",
      }),
    )
  })

  it("does not reapply the pre-action identity guard after a click redirect", async () => {
    let browserCheckInSteps = 0
    const browserCheckInMessages: Array<Record<string, unknown>> = []
    tabsGetMock.mockResolvedValue({
      id: 706,
      windowId: 82,
      status: "complete",
      url: "https://example.invalid/checkin",
    })
    sendMessageMock.mockImplementation(
      async (_tabId: number, message: RuntimeMessage) => {
        switch (message.action) {
          case RuntimeActionIds.ContentShowShieldBypassUi:
            return undefined
          case RuntimeActionIds.ContentCheckCapGuard:
          case RuntimeActionIds.ContentCheckCloudflareGuard:
            return { success: true, passed: true }
          case RuntimeActionIds.ContentWaitForTurnstileToken:
            return {
              success: true,
              status: "not_present",
              token: null,
              detection: {
                hasTurnstile: false,
                reasons: [],
                score: 0,
                title: "Check in",
                url: "https://example.invalid/checkin",
              },
            }
          case RuntimeActionIds.ContentRunBrowserCheckIn:
            browserCheckInSteps += 1
            browserCheckInMessages.push(message as Record<string, unknown>)
            return browserCheckInSteps === 1
              ? {
                  success: false,
                  reason: "action_triggered",
                  actionTriggered: true,
                  currentUrl: "https://example.invalid/checkin",
                }
              : {
                  success: true,
                  reason: "completed",
                  actionTriggered: true,
                  matchedCondition: "selector",
                  currentUrl: "https://example.invalid/checkin/success",
                }
          default:
            throw new Error("Unexpected action: " + message.action)
        }
      },
    )

    const { handleTempWindowBrowserCheckIn } = await import(
      "~~/tests/entrypoints/background/tempWindowPoolTestAdapter"
    )
    const sendResponse = vi.fn()
    const request = handleTempWindowBrowserCheckIn(
      {
        pageUrl: "https://example.invalid/checkin",
        requestId: "req-browser-checkin-identity-redirect",
        action: { kind: "click_selector", selector: "#check-in" },
        identity: {
          selector: ".account",
          textPattern: "target@example.com",
        },
        success: { selector: ".check-in-success" },
        timeoutMs: 5_000,
      },
      sendResponse,
    )

    await settleTempContextReadiness()
    await request

    expect(browserCheckInMessages[0]).toHaveProperty("identity")
    expect(browserCheckInMessages[1]).not.toHaveProperty("identity")
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, reason: "completed" }),
    )
  })
})
