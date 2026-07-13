import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { TEMP_CONTEXT_MODES } from "~/services/preferences/userPreferences"
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
          tempContextMode: TEMP_CONTEXT_MODES.Tab,
        },
      },
      TEMP_CONTEXT_MODES,
      userPreferences: {
        getPreferences: vi.fn().mockResolvedValue({
          tempWindowFallback: {
            tempContextMode: TEMP_CONTEXT_MODES.Tab,
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
      "~/entrypoints/background/tempWindowPool"
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
      "~/entrypoints/background/tempWindowPool"
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
      "~/entrypoints/background/tempWindowPool"
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
      "~/entrypoints/background/tempWindowPool"
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
      "~/entrypoints/background/tempWindowPool"
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
      "~/entrypoints/background/tempWindowPool"
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
    } = await import("~/entrypoints/background/tempWindowPool")

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
      "~/entrypoints/background/tempWindowPool"
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
      "~/entrypoints/background/tempWindowPool"
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
      "~/entrypoints/background/tempWindowPool"
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
})
