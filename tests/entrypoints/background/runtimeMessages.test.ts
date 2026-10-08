import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
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
  let executeProtectionBypassTask: ReturnType<typeof vi.fn>
  let handleOpenRouterManagementKeyAction: ReturnType<typeof vi.fn>
  let handleTempContextDebugMessage: ReturnType<typeof vi.fn>
  let appendLogHistory: ReturnType<typeof vi.fn>
  let clearLogHistory: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    getCookieHeaderForUrlResult = vi.fn()
    hasCookieReadPermissionForUrl = vi.fn()
    setupManagedSiteModelSyncMessagingListeners = vi.fn()
    setupPreferencesMessagingListeners = vi.fn()
    setupProductAnnouncementMessagingListeners = vi.fn()
    setupRedemptionAssistMessagingListeners = vi.fn()
    setupProductAnalyticsMessagingListeners = vi.fn()
    executeProtectionBypassTask = vi.fn()
    handleOpenRouterManagementKeyAction = vi.fn()
    handleTempContextDebugMessage = vi.fn()
    appendLogHistory = vi.fn()
    clearLogHistory = vi.fn()
    vi.doMock("~/services/logging/logHistory", () => ({
      appendLogHistory,
      clearLogHistory,
    }))

    vi.doMock("~/entrypoints/background/tempContextDebug", () => ({
      isTempContextDebugAction: (action: unknown) =>
        action === RuntimeActionIds.TempContextDebugListMarkers,
      handleTempContextDebugMessage,
    }))

    vi.doMock("~/utils/browser/runtimeMessages", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/runtimeMessages")>()
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
    vi.doMock(
      "~/services/checkin/autoCheckin/scheduling/schedulerMessaging",
      () => ({
        setupAutoCheckinMessagingListeners: vi.fn(),
      }),
    )
    vi.doMock("~/services/accounts/autoRefreshService", () => ({
      setupAutoRefreshMessagingListeners: vi.fn(),
    }))
    vi.doMock("~/services/managedSites/channelConfigHandlers", () => ({
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
    vi.doMock("~/entrypoints/background/protectionBypassCoordinator", () => ({
      protectionBypassCoordinator: {
        execute: executeProtectionBypassTask,
      },
    }))
    vi.doMock(
      "~/services/browsingContext/tempPage/openrouterManagementKeyAction",
      () => ({
        handleTempWindowOpenRouterManagementKeyAction:
          handleOpenRouterManagementKeyAction,
        cancelTempWindowOpenRouterManagementKeyAction: vi.fn(),
        markTempWindowOpenRouterManagementKeyDispatched: vi.fn(),
      }),
    )
    vi.doMock("~/services/history/usageHistory/scheduler", () => ({
      setupUsageHistoryMessagingListeners: vi.fn(),
    }))
    vi.doMock("~/services/webdav/webdavAutoSyncMessageHandlers", () => ({
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
    vi.doMock("~/services/siteAnnouncements/runtimeMessages", () => ({
      setupSiteAnnouncementsMessagingListeners: vi.fn(),
    }))

    // Keep this expensive background dependency graph cached for all routing cases.
    await import("~/entrypoints/background/runtimeMessages")
  })

  beforeEach(() => {
    vi.clearAllMocks()
    runtimeMessageListener = undefined
    originalBrowserCookies = (globalThis as any).browser?.cookies
    getCookieHeaderForUrlResult.mockReset()
    hasCookieReadPermissionForUrl.mockReset().mockResolvedValue(true)
    setupManagedSiteModelSyncMessagingListeners.mockReset()
    setupPreferencesMessagingListeners.mockReset()
    setupProductAnnouncementMessagingListeners.mockReset()
    setupRedemptionAssistMessagingListeners.mockReset()
    setupProductAnalyticsMessagingListeners.mockReset()
    executeProtectionBypassTask.mockReset().mockResolvedValue({ success: true })
    handleOpenRouterManagementKeyAction.mockReset().mockResolvedValue(undefined)
    handleTempContextDebugMessage.mockReset().mockResolvedValue(undefined)
    appendLogHistory.mockReset().mockResolvedValue(undefined)
    clearLogHistory.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    ;(globalThis as any).browser.cookies = originalBrowserCookies
    vi.unstubAllGlobals()
  })

  afterAll(() => {
    vi.doUnmock("~/utils/browser/extensionStorage")
    vi.doUnmock("~/utils/browser/tabs")
    vi.doUnmock("~/utils/browser/windows")
    vi.doUnmock("~/utils/browser/runtimeMessages")
    vi.doUnmock("~/utils/browser/runtime")
    vi.doUnmock("~/utils/browser/bookmarks")
    vi.doUnmock("~/utils/browser/storage")
    vi.doUnmock("~/utils/browser/sidePanel")
    vi.doUnmock("~/utils/browser/alarms")
    vi.doUnmock("~/utils/browser/notifications")
    vi.doUnmock("~/utils/browser/contextMenus")
    vi.doUnmock("~/utils/browser/cookies")
    vi.doUnmock("~/utils/browser/action")
    vi.doUnmock("~/utils/browser/permissions")
    vi.doUnmock("~/utils/browser/cookieHelper")
    vi.doUnmock("~/services/models/modelSync")
    vi.doUnmock("~/services/preferences/runtimePreferencesService")
    vi.doUnmock("~/services/productAnnouncements/service")
    vi.doUnmock("~/services/checkin/autoCheckin/scheduling/schedulerMessaging")
    vi.doUnmock("~/services/accounts/autoRefreshService")
    vi.doUnmock("~/services/managedSites/channelConfigHandlers")
    vi.doUnmock("~/services/checkin/externalCheckInService")
    vi.doUnmock("~/services/redemption/redemptionAssist")
    vi.doUnmock("~/services/productAnalytics/runtime")
    vi.doUnmock("~/entrypoints/background/protectionBypassCoordinator")
    vi.doUnmock(
      "~/services/browsingContext/tempPage/openrouterManagementKeyAction",
    )
    vi.doUnmock("~/entrypoints/background/tempContextDebug")
    vi.doUnmock("~/services/logging/logHistory")
    vi.doUnmock("~/services/history/usageHistory/scheduler")
    vi.doUnmock("~/services/webdav/webdavAutoSyncService")
    vi.doUnmock("~/services/webdav/webdavAutoSyncMessageHandlers")
    vi.doUnmock("~/services/history/dailyBalanceHistory/scheduler")
    vi.doUnmock("~/services/integrations/ldohSiteLookup/background")
    vi.doUnmock("~/services/notifications/taskNotificationService")
    vi.doUnmock("~/services/siteAnnouncements/scheduler")
    vi.doUnmock("~/services/siteAnnouncements/runtimeMessages")
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("acknowledges relayed history only after persistence and reports write failures", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )
    setupRuntimeMessageListeners()
    let persist!: () => void
    appendLogHistory.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        persist = resolve
      }),
    )
    const respond = vi.fn()
    const logEntry = { id: "relayed-record", message: "account read" }
    expect(
      runtimeMessageListener?.(
        { action: RuntimeActionIds.CloudflareGuardLog, logEntry },
        {},
        respond,
      ),
    ).toBe(true)
    expect(appendLogHistory).toHaveBeenCalledWith(logEntry)
    expect(respond).not.toHaveBeenCalled()
    persist()
    await vi.waitFor(() =>
      expect(respond).toHaveBeenCalledWith({ success: true }),
    )
    appendLogHistory.mockRejectedValueOnce(new Error("storage failed"))
    const failed = await new Promise((resolve) =>
      runtimeMessageListener?.(
        { action: RuntimeActionIds.CloudflareGuardLog, logEntry },
        {},
        resolve,
      ),
    )
    expect(failed).toEqual({ success: false })
  })

  it("clears the background producer queue before acknowledging and reports failures", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )
    setupRuntimeMessageListeners()
    let finish!: () => void
    clearLogHistory.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve
      }),
    )
    const respond = vi.fn()
    runtimeMessageListener?.({ action: "logHistory:clear" }, {}, respond)
    expect(clearLogHistory).toHaveBeenCalledTimes(1)
    expect(respond).not.toHaveBeenCalled()
    finish()
    await vi.waitFor(() =>
      expect(respond).toHaveBeenCalledWith({ success: true }),
    )
    clearLogHistory.mockRejectedValueOnce(new Error("storage failed"))
    const failed = await new Promise((resolve) =>
      runtimeMessageListener?.({ action: "logHistory:clear" }, {}, resolve),
    )
    expect(failed).toEqual({ success: false })
  })

  it("executes developer API methods with their receiver and returns properties or errors", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )
    const receiver = {
      id: "test-extension",
      getPlatformInfo: vi.fn(function (this: unknown) {
        expect(this).toBe(receiver)
        return Promise.resolve({ os: "win" })
      }),
    }
    vi.stubGlobal("chrome", { runtime: receiver })
    setupRuntimeMessageListeners()
    for (const [path, args, expected] of [
      ["runtime.getPlatformInfo", [], { success: true, data: { os: "win" } }],
      ["runtime.id", [], { success: true, data: "test-extension" }],
      [
        "missing.method",
        [],
        {
          success: false,
          error: expect.stringContaining("Cannot read property"),
        },
      ],
    ]) {
      const response = new Promise((resolve) => {
        expect(
          runtimeMessageListener?.(
            {
              action: RuntimeActionIds.DevExecuteBrowserApi,
              payload: { path, args },
            },
            {},
            resolve,
          ),
        ).toBe(true)
      })
      expect(await response).toEqual(expected)
    }
  })

  it("keeps the runtime channel open for a temp-context debug response", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )
    setupRuntimeMessageListeners()
    const request = { action: RuntimeActionIds.TempContextDebugListMarkers }
    const sendResponse = vi.fn()

    expect(runtimeMessageListener?.(request, {}, sendResponse)).toBe(true)
    expect(handleTempContextDebugMessage).toHaveBeenCalledWith(
      request,
      sendResponse,
    )
  })

  it("keeps relayed account summaries visible at the normal info log level", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )
    const { setLoggingPreferences } = await import("~/utils/core/logger")
    setupRuntimeMessageListeners()
    const log = vi.spyOn(console, "info").mockImplementation(() => {})
    const sendResponse = vi.fn()
    setLoggingPreferences({ consoleEnabled: true, level: "info" })
    try {
      runtimeMessageListener?.(
        {
          action: RuntimeActionIds.CloudflareGuardLog,
          event: "detection_finished",
          details: {
            diagnosticScope: "account_detection",
            requestId: "detect-relay",
            outcome: "failed",
          },
        },
        { tab: { id: 8 } },
        sendResponse,
      )
      expect(sendResponse).toHaveBeenCalledWith({ success: true })
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining("AccountDetectionRelay"),
        expect.objectContaining({
          requestId: "detect-relay",
          details: expect.objectContaining({ outcome: "failed" }),
          sender: expect.objectContaining({ tabId: 8 }),
        }),
      )
    } finally {
      setLoggingPreferences({ consoleEnabled: false, level: "debug" })
    }
  })

  it("routes OpenRouter page mutation through protection-bypass authorization", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )
    setupRuntimeMessageListeners()
    const sendResponse = vi.fn()
    const sender = { url: "chrome-extension://test/popup.html" }
    const protectionBypassExecution = {
      version: 2,
      kind: "user_command",
      command: "add_account",
      surface: "popup",
    }

    expect(
      runtimeMessageListener?.(
        {
          action: RuntimeActionIds.ProtectionBypassExecuteTask,
          execution: protectionBypassExecution,
          task: {
            kind: "openrouter_management_key_action",
            params: {
              requestId: "request-openrouter",
              operation: { kind: "create", label: "Example label" },
            },
          },
        },
        sender,
        sendResponse,
      ),
    ).toBe(true)
    expect(executeProtectionBypassTask).toHaveBeenCalledWith({
      task: {
        kind: "openrouter_management_key_action",
        params: {
          requestId: "request-openrouter",
          operation: { kind: "create", label: "Example label" },
        },
      },
      execution: protectionBypassExecution,
    })
    expect(handleOpenRouterManagementKeyAction).not.toHaveBeenCalled()
  })

  it("rejects malformed Firefox-popup OpenRouter tasks before the Coordinator", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )
    setupRuntimeMessageListeners()
    const sendResponse = vi.fn()

    expect(
      runtimeMessageListener?.(
        {
          action: RuntimeActionIds.ProtectionBypassExecuteTask,
          execution: {
            version: 2,
            kind: "user_command",
            command: "add_account",
            surface: "popup",
          },
          task: {
            kind: "openrouter_management_key_action",
            params: {},
          },
        },
        { url: "moz-extension://example.invalid/popup.html" },
        sendResponse,
      ),
    ).toBe(true)

    expect(executeProtectionBypassTask).not.toHaveBeenCalled()
    expect(handleOpenRouterManagementKeyAction).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "messages:background.tempWindowPolicyContextInvalid",
      code: API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
    })
  })

  it("exposes internal tab ownership to account browsing-context consumers", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )
    const { registerInternalTab, unregisterInternalTab } = await import(
      "~/services/browsingContext/internalTabsBackground"
    )
    await registerInternalTab(901, { windowScope: "shared", createdAt: 1 })
    setupRuntimeMessageListeners()
    const response = new Promise<{ tabIds: number[] }>((resolve) => {
      expect(
        runtimeMessageListener?.(
          { action: RuntimeActionIds.GetInternalTabIds, tabIds: [901, 902] },
          {},
          resolve,
        ),
      ).toBe(true)
    })
    expect((await response).tabIds).toContain(901)
    await unregisterInternalTab(901)
  })

  it("reports ownership lookup failure instead of an empty confirmed result", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )
    setupRuntimeMessageListeners()
    const read = vi
      .spyOn(browser.storage.local, "get")
      .mockRejectedValue(new Error("storage unavailable"))
    try {
      const response = await new Promise((resolve) =>
        runtimeMessageListener?.(
          { action: RuntimeActionIds.GetInternalTabIds, tabIds: [999] },
          {},
          resolve,
        ),
      )
      expect(response).toEqual({ success: false })
    } finally {
      read.mockRestore()
    }
  })

  it.each([undefined, ["901"], [-1], [1.5]])(
    "rejects invalid ownership candidates: %j",
    async (tabIds) => {
      const { setupRuntimeMessageListeners } = await import(
        "~/entrypoints/background/runtimeMessages"
      )
      setupRuntimeMessageListeners()
      const response = await new Promise((resolve) =>
        runtimeMessageListener?.(
          { action: RuntimeActionIds.GetInternalTabIds, tabIds },
          {},
          resolve,
        ),
      )
      expect(response).toEqual({ success: false })
    },
  )

  it.each([
    [{ tab: { id: 951 } }, "internal", true],
    [{ tab: { id: 952 } }, "ordinary", true],
    [{}, "unknown", false],
  ])(
    "classifies content using the actual sender, ignoring claimed tab IDs: %j",
    async (sender, pageContext, success) => {
      const { setupRuntimeMessageListeners } = await import(
        "~/entrypoints/background/runtimeMessages"
      )
      const { registerInternalTab, unregisterInternalTab } = await import(
        "~/services/browsingContext/internalTabsBackground"
      )
      await registerInternalTab(951, { windowScope: "shared", createdAt: 1 })
      setupRuntimeMessageListeners()
      try {
        const response = await new Promise((resolve) =>
          runtimeMessageListener?.(
            {
              action: RuntimeActionIds.GetSenderPageContext,
              tabId: 952,
              tabIds: [952],
            },
            sender,
            resolve,
          ),
        )
        expect(response).toEqual({ success, pageContext })
      } finally {
        await unregisterInternalTab(951)
      }
    },
  )

  it("reports unknown sender context when ownership storage cannot be read", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )
    setupRuntimeMessageListeners()
    const read = vi
      .spyOn(browser.storage.local, "get")
      .mockRejectedValue(new Error("unavailable"))
    try {
      const response = await new Promise((resolve) =>
        runtimeMessageListener?.(
          { action: RuntimeActionIds.GetSenderPageContext },
          { tab: { id: 959 } },
          resolve,
        ),
      )
      expect(response).toEqual({ success: false, pageContext: "unknown" })
    } finally {
      read.mockRestore()
    }
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
