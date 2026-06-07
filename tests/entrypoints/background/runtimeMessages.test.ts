import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { PreferencesMessageTypes } from "~/services/preferences/messaging"
import { ProductAnalyticsMessageTypes } from "~/services/productAnalytics/messaging"

type RuntimeMessageListener = (
  request: any,
  sender: any,
  sendResponse: (response: any) => void,
) => unknown

describe("setupRuntimeMessageListeners routing", () => {
  let runtimeMessageListener: RuntimeMessageListener | undefined
  let getCookieHeaderForUrlResult: ReturnType<typeof vi.fn>
  let hasCookieReadPermissionForUrl: ReturnType<typeof vi.fn>
  let originalBrowserCookies: unknown
  let setupManagedSiteModelSyncMessagingListeners: ReturnType<typeof vi.fn>
  let setupPreferencesMessagingListeners: ReturnType<typeof vi.fn>
  let setupProductAnnouncementMessagingListeners: ReturnType<typeof vi.fn>
  let setupRedemptionAssistMessagingListeners: ReturnType<typeof vi.fn>
  let setupProductAnalyticsMessagingListeners: ReturnType<typeof vi.fn>

  beforeEach(() => {
    runtimeMessageListener = undefined
    getCookieHeaderForUrlResult = vi.fn()
    hasCookieReadPermissionForUrl = vi.fn().mockResolvedValue(true)
    originalBrowserCookies = (globalThis as any).browser?.cookies
    setupManagedSiteModelSyncMessagingListeners = vi.fn()
    setupPreferencesMessagingListeners = vi.fn()
    setupProductAnnouncementMessagingListeners = vi.fn()
    setupRedemptionAssistMessagingListeners = vi.fn()
    setupProductAnalyticsMessagingListeners = vi.fn()

    vi.resetModules()

    vi.doMock("~/utils/browser/browserApi", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/browserApi")>()
      return {
        ...actual,
        onRuntimeMessage: vi.fn((listener: RuntimeMessageListener) => {
          runtimeMessageListener = listener
        }),
      }
    })

    vi.doMock("~/utils/browser/cookieHelper", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/cookieHelper")>()
      return {
        ...actual,
        getCookieHeaderForUrlResult,
        hasCookieReadPermissionForUrl,
      }
    })

    vi.doMock("~/services/models/modelSync", () => ({
      setupManagedSiteModelSyncMessagingListeners,
    }))

    vi.doMock("~/services/preferences/runtimePreferencesService", () => ({
      setupPreferencesMessagingListeners,
    }))

    vi.doMock("~/services/productAnnouncements/service", () => ({
      setupProductAnnouncementMessagingListeners,
    }))

    // runtimeMessages imports these modules; provide minimal stubs to avoid heavy side effects.
    vi.doMock("~/services/checkin/autoCheckin/scheduler", () => ({
      setupAutoCheckinMessagingListeners: vi.fn(),
    }))
    vi.doMock("~/services/accounts/autoRefreshService", () => ({
      setupAutoRefreshMessagingListeners: vi.fn(),
    }))
    vi.doMock("~/services/managedSites/channelConfigStorage", () => ({
      setupChannelConfigMessagingListeners: vi.fn(),
    }))
    vi.doMock("~/services/checkin/externalCheckInService", () => ({
      setupExternalCheckInMessagingListeners: vi.fn(),
    }))
    vi.doMock("~/services/redemption/redemptionAssist", () => ({
      setupRedemptionAssistMessagingListeners,
    }))
    vi.doMock("~/services/productAnalytics/runtime", () => ({
      setupProductAnalyticsMessagingListeners,
    }))
    vi.doMock("~/services/history/usageHistory/scheduler", () => ({
      setupUsageHistoryMessagingListeners: vi.fn(),
    }))
    vi.doMock("~/services/webdav/webdavAutoSyncService", () => ({
      setupWebdavAutoSyncMessagingListeners: vi.fn(),
    }))
    vi.doMock("~/services/history/dailyBalanceHistory/scheduler", () => ({
      setupDailyBalanceHistoryMessagingListeners: vi.fn(),
      handleDailyBalanceHistoryMessage: vi.fn(),
    }))
    vi.doMock("~/services/integrations/ldohSiteLookup/background", () => ({
      setupLdohSiteLookupMessagingListeners: vi.fn(),
    }))
    vi.doMock("~/services/notifications/taskNotificationService", () => ({
      setupTaskNotificationMessagingListeners: vi.fn(),
    }))
    vi.doMock("~/services/siteAnnouncements/scheduler", () => ({
      setupSiteAnnouncementsMessagingListeners: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.doUnmock("~/utils/browser/browserApi")
    vi.doUnmock("~/utils/browser/cookieHelper")
    vi.doUnmock("~/services/models/modelSync")
    vi.doUnmock("~/services/preferences/runtimePreferencesService")
    vi.doUnmock("~/services/productAnnouncements/service")
    vi.doUnmock("~/services/checkin/autoCheckin/scheduler")
    vi.doUnmock("~/services/accounts/autoRefreshService")
    vi.doUnmock("~/services/managedSites/channelConfigStorage")
    vi.doUnmock("~/services/checkin/externalCheckInService")
    vi.doUnmock("~/services/redemption/redemptionAssist")
    vi.doUnmock("~/services/productAnalytics/runtime")
    vi.doUnmock("~/services/history/usageHistory/scheduler")
    vi.doUnmock("~/services/webdav/webdavAutoSyncService")
    ;(globalThis as any).browser.cookies = originalBrowserCookies
    vi.doUnmock("~/services/history/dailyBalanceHistory/scheduler")
    vi.doUnmock("~/services/siteAnnouncements/scheduler")
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("sets up typed preferences messaging listeners", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")
    expect(setupPreferencesMessagingListeners).toHaveBeenCalledTimes(1)
  })

  it("does not route typed-only preferences actions through the raw listener", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")

    const requests = [
      {
        type: PreferencesMessageTypes.UpdateActionClickBehavior,
        data: { behavior: "popup" },
      },
      {
        type: PreferencesMessageTypes.RefreshContextMenus,
      },
    ]

    for (const request of requests) {
      const sendResponse = vi.fn()
      const result = runtimeMessageListener?.(request, {}, sendResponse)

      expect(result).toBeUndefined()
      expect(sendResponse).not.toHaveBeenCalled()
    }
  })

  it("sets up typed model-sync messaging listeners", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")
    expect(setupManagedSiteModelSyncMessagingListeners).toHaveBeenCalledTimes(1)
  })

  it("sets up typed redemption assist messaging listeners", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")
    expect(setupRedemptionAssistMessagingListeners).toHaveBeenCalledTimes(1)
  })

  it("sets up typed product analytics messaging listeners", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")
    expect(setupProductAnalyticsMessagingListeners).toHaveBeenCalledTimes(1)
  })

  it("sets up typed product announcement messaging listeners", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")
    expect(setupProductAnnouncementMessagingListeners).toHaveBeenCalledTimes(1)
  })

  it("does not route typed-only product analytics actions through the raw listener", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")

    const sendResponse = vi.fn()
    const result = runtimeMessageListener?.(
      {
        type: ProductAnalyticsMessageTypes.TrackEvent,
        data: {
          eventName: "app_opened",
          properties: { entrypoint: "popup" },
        },
      },
      {},
      sendResponse,
    )

    expect(result).toBeUndefined()
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it("returns undefined when action is missing", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")

    const sendResponse = vi.fn()
    const result = runtimeMessageListener?.({}, {}, sendResponse)

    expect(sendResponse).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it("returns undefined when action is unknown", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")

    const sendResponse = vi.fn()
    const result = runtimeMessageListener?.(
      { action: "unknownAction" },
      {},
      sendResponse,
    )

    expect(sendResponse).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it("returns a structured no-cookie failure for cookie import requests", async () => {
    getCookieHeaderForUrlResult.mockResolvedValueOnce({ header: "" })

    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")

    const sendResponse = vi.fn()
    const result = runtimeMessageListener?.(
      {
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: "https://example.com",
      },
      {},
      sendResponse,
    )

    expect(result).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getCookieHeaderForUrlResult).toHaveBeenCalledWith(
      "https://example.com",
      {
        includeSession: true,
      },
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      errorCode: COOKIE_IMPORT_FAILURE_REASONS.NoCookiesFound,
    })
  })

  it("reads cookies from the requested cookie store for cookie import requests", async () => {
    getCookieHeaderForUrlResult.mockResolvedValueOnce({
      header: "session=incognito",
    })

    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")

    const sendResponse = vi.fn()
    const result = runtimeMessageListener?.(
      {
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: "https://example.com",
        cookieStoreId: "1-incognito",
      },
      {},
      sendResponse,
    )

    expect(result).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getCookieHeaderForUrlResult).toHaveBeenCalledWith(
      "https://example.com",
      {
        includeSession: true,
        storeId: "1-incognito",
      },
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: "session=incognito",
    })
  })

  it("resolves the cookie store from the source tab for incognito cookie import requests", async () => {
    getCookieHeaderForUrlResult.mockResolvedValueOnce({
      header: "session=incognito",
    })
    const getAllCookieStores = vi.fn().mockResolvedValueOnce([
      { id: "0", tabIds: [1] },
      { id: "1-incognito", tabIds: [42] },
    ])
    ;(globalThis as any).browser.cookies = {
      ...((globalThis as any).browser.cookies ?? {}),
      getAllCookieStores,
    }

    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")

    const sendResponse = vi.fn()
    const result = runtimeMessageListener?.(
      {
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: "https://example.com",
        sourceTabId: 42,
        sourceTabIncognito: true,
      },
      {},
      sendResponse,
    )

    expect(result).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getAllCookieStores).toHaveBeenCalledTimes(1)
    expect(getCookieHeaderForUrlResult).toHaveBeenCalledWith(
      "https://example.com",
      {
        includeSession: true,
        storeId: "1-incognito",
      },
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: "session=incognito",
    })
  })

  it("falls back to the default cookie store when source-tab store lookup fails", async () => {
    getCookieHeaderForUrlResult.mockResolvedValueOnce({
      header: "session=regular",
    })
    const getAllCookieStores = vi
      .fn()
      .mockRejectedValueOnce(new Error("cookie store lookup failed"))
    ;(globalThis as any).browser.cookies = {
      ...((globalThis as any).browser.cookies ?? {}),
      getAllCookieStores,
    }

    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")

    const sendResponse = vi.fn()
    const result = runtimeMessageListener?.(
      {
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: "https://example.com",
        sourceTabId: 42,
        sourceTabIncognito: true,
      },
      {},
      sendResponse,
    )

    expect(result).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(getAllCookieStores).toHaveBeenCalledTimes(1)
    expect(getCookieHeaderForUrlResult).toHaveBeenCalledWith(
      "https://example.com",
      {
        includeSession: true,
      },
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: "session=regular",
    })
  })

  it("returns a permission failure before reading cookies when access is missing", async () => {
    hasCookieReadPermissionForUrl.mockResolvedValueOnce(false)

    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")

    const sendResponse = vi.fn()
    const result = runtimeMessageListener?.(
      {
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: "https://example.com",
      },
      {},
      sendResponse,
    )

    expect(result).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(hasCookieReadPermissionForUrl).toHaveBeenCalledWith(
      "https://example.com",
    )
    expect(getCookieHeaderForUrlResult).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      errorCode: COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied,
    })
  })

  it("preserves permission-denied diagnostics for cookie import requests", async () => {
    getCookieHeaderForUrlResult.mockResolvedValueOnce({
      header: "",
      failureReason: COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied,
      errorMessage: "Missing host permission for the tab",
    })

    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")

    const sendResponse = vi.fn()
    const result = runtimeMessageListener?.(
      {
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: "https://example.com",
      },
      {},
      sendResponse,
    )

    expect(result).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      errorCode: COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied,
      error: "Missing host permission for the tab",
    })
  })

  it("preserves read-failed diagnostics for cookie import requests", async () => {
    getCookieHeaderForUrlResult.mockResolvedValueOnce({
      header: "",
      failureReason: COOKIE_IMPORT_FAILURE_REASONS.ReadFailed,
      errorMessage: "storage backend failed",
    })

    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")

    const sendResponse = vi.fn()
    const result = runtimeMessageListener?.(
      {
        action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
        url: "https://example.com",
      },
      {},
      sendResponse,
    )

    expect(result).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(hasCookieReadPermissionForUrl).toHaveBeenCalledWith(
      "https://example.com",
    )
    expect(getCookieHeaderForUrlResult).toHaveBeenCalledWith(
      "https://example.com",
      {
        includeSession: true,
      },
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      errorCode: COOKIE_IMPORT_FAILURE_REASONS.ReadFailed,
      error: "storage backend failed",
    })
  })
})
