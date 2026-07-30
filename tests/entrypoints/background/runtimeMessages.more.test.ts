import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { WEB_AI_API_CHECK_TARGET_IDS } from "~/features/BasicSettings/components/tabs/WebAiApiCheck/searchTargets"
import { ProductAnalyticsMessageTypes } from "~/services/productAnalytics/messaging"
import { RedemptionAssistMessageTypes } from "~/services/redemption/redemptionAssistMessaging"

type RuntimeMessageListener = (
  request: any,
  sender: any,
  sendResponse: (response: any) => void,
) => unknown

const backgroundExecution = {
  version: 1,
  kind: "automatic",
  feature: "site_detection",
  trigger: "background_recovery",
  surface: "background",
} as const

const popupExecution = {
  version: 1,
  kind: "automatic",
  feature: "site_detection",
  trigger: "ui_lifecycle",
  surface: "popup",
} as const

const mocks = vi.hoisted(() => ({
  onRuntimeMessage: vi.fn(),
  containsPermissions: vi.fn(),
  applyActionClickBehavior: vi.fn(),
  getCookieHeaderForUrlResult: vi.fn(),
  hasCookieReadPermissionForUrl: vi.fn(),
  setupManagedSiteModelSyncMessagingListeners: vi.fn(),
  setupReleaseUpdateMessagingListeners: vi.fn(),
  setupAutoCheckinMessagingListeners: vi.fn(),
  setupAutoRefreshMessagingListeners: vi.fn(),
  setupChannelConfigMessagingListeners: vi.fn(),
  setupExternalCheckInMessagingListeners: vi.fn(),
  setupRedemptionAssistMessagingListeners: vi.fn(),
  setupUsageHistoryMessagingListeners: vi.fn(),
  setupWebdavAutoSyncMessagingListeners: vi.fn(),
  handleDailyBalanceHistoryMessage: vi.fn(),
  setupDailyBalanceHistoryMessagingListeners: vi.fn(),
  setupTaskNotificationMessagingListeners: vi.fn(),
  setupSiteAnnouncementsMessagingListeners: vi.fn(),
  setupProductAnnouncementMessagingListeners: vi.fn(),
  setupPreferencesMessagingListeners: vi.fn(),
  setupLdohSiteLookupMessagingListeners: vi.fn(),
  setupWebAiApiCheckMessagingListeners: vi.fn(),
  setupAccountKeyRepairMessagingListeners: vi.fn(),
  setupProductAnalyticsMessagingListeners: vi.fn(),
  setupContextMenus: vi.fn(),
  trackCookieInterceptorUrl: vi.fn(),
  openOrFocusOptionsMenuItem: vi.fn(),
  handleCloseTempWindow: vi.fn(),
  handleTempWindowOpenRouterManagementKeyAction: vi.fn(),
  cancelTempWindowOpenRouterManagementKeyAction: vi.fn(),
  markTempWindowOpenRouterManagementKeyDispatched: vi.fn(),
  openBugReportPage: vi.fn(),
  executeProtectionBypassTask: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  containsPermissions: mocks.containsPermissions,
  onRuntimeMessage: mocks.onRuntimeMessage,
}))

vi.mock("~/entrypoints/background/actionClickBehavior", () => ({
  applyActionClickBehavior: mocks.applyActionClickBehavior,
}))

vi.mock("~/utils/browser/cookieHelper", () => ({
  getCookieHeaderForUrlResult: mocks.getCookieHeaderForUrlResult,
  hasCookieReadPermissionForUrl: mocks.hasCookieReadPermissionForUrl,
}))

vi.mock("~/entrypoints/background/contextMenus", () => ({
  setupContextMenus: mocks.setupContextMenus,
}))

vi.mock("~/entrypoints/background/cookieInterceptor", () => ({
  trackCookieInterceptorUrl: mocks.trackCookieInterceptorUrl,
}))

vi.mock("~/utils/navigation", () => ({
  openOrFocusOptionsMenuItem: mocks.openOrFocusOptionsMenuItem,
  openBugReportPage: mocks.openBugReportPage,
}))

vi.mock("~/entrypoints/background/tempWindowPool", () => ({
  handleCloseTempWindow: mocks.handleCloseTempWindow,
}))

vi.mock("~/entrypoints/background/openrouter/managementKeyAction", () => ({
  handleTempWindowOpenRouterManagementKeyAction:
    mocks.handleTempWindowOpenRouterManagementKeyAction,
  cancelTempWindowOpenRouterManagementKeyAction:
    mocks.cancelTempWindowOpenRouterManagementKeyAction,
  markTempWindowOpenRouterManagementKeyDispatched:
    mocks.markTempWindowOpenRouterManagementKeyDispatched,
}))

vi.mock("~/services/models/modelSync", () => ({
  setupManagedSiteModelSyncMessagingListeners:
    mocks.setupManagedSiteModelSyncMessagingListeners,
}))

vi.mock("~/services/updates/releaseUpdateService", () => ({
  setupReleaseUpdateMessagingListeners:
    mocks.setupReleaseUpdateMessagingListeners,
}))

vi.mock("~/services/checkin/autoCheckin/scheduler", () => ({
  setupAutoCheckinMessagingListeners: mocks.setupAutoCheckinMessagingListeners,
}))

vi.mock("~/services/accounts/autoRefreshService", () => ({
  setupAutoRefreshMessagingListeners: mocks.setupAutoRefreshMessagingListeners,
}))

vi.mock("~/services/managedSites/channelConfigStorage", () => ({
  setupChannelConfigMessagingListeners:
    mocks.setupChannelConfigMessagingListeners,
}))

vi.mock("~/services/checkin/externalCheckInService", () => ({
  setupExternalCheckInMessagingListeners:
    mocks.setupExternalCheckInMessagingListeners,
}))

vi.mock("~/services/redemption/redemptionAssist", () => ({
  setupRedemptionAssistMessagingListeners:
    mocks.setupRedemptionAssistMessagingListeners,
}))

vi.mock("~/services/history/usageHistory/scheduler", () => ({
  setupUsageHistoryMessagingListeners:
    mocks.setupUsageHistoryMessagingListeners,
}))

vi.mock("~/services/history/dailyBalanceHistory/scheduler", () => ({
  handleDailyBalanceHistoryMessage: mocks.handleDailyBalanceHistoryMessage,
  setupDailyBalanceHistoryMessagingListeners:
    mocks.setupDailyBalanceHistoryMessagingListeners,
}))

vi.mock("~/services/webdav/webdavAutoSyncService", () => ({
  setupWebdavAutoSyncMessagingListeners:
    mocks.setupWebdavAutoSyncMessagingListeners,
}))

vi.mock("~/services/notifications/taskNotificationService", () => ({
  setupTaskNotificationMessagingListeners:
    mocks.setupTaskNotificationMessagingListeners,
}))

vi.mock("~/services/siteAnnouncements/scheduler", () => ({
  setupSiteAnnouncementsMessagingListeners:
    mocks.setupSiteAnnouncementsMessagingListeners,
}))

vi.mock("~/services/productAnnouncements/service", () => ({
  setupProductAnnouncementMessagingListeners:
    mocks.setupProductAnnouncementMessagingListeners,
}))

vi.mock("~/services/preferences/runtimePreferencesService", () => ({
  setupPreferencesMessagingListeners: mocks.setupPreferencesMessagingListeners,
}))

vi.mock("~/services/integrations/ldohSiteLookup/background", () => ({
  setupLdohSiteLookupMessagingListeners:
    mocks.setupLdohSiteLookupMessagingListeners,
}))

vi.mock("~/services/verification/webAiApiCheck/background", () => ({
  setupWebAiApiCheckMessagingListeners:
    mocks.setupWebAiApiCheckMessagingListeners,
}))

vi.mock("~/services/accounts/accountKeyAutoProvisioning", () => ({
  setupAccountKeyRepairMessagingListeners:
    mocks.setupAccountKeyRepairMessagingListeners,
}))

vi.mock("~/services/productAnalytics/runtime", () => ({
  setupProductAnalyticsMessagingListeners:
    mocks.setupProductAnalyticsMessagingListeners,
}))

vi.mock("~/entrypoints/background/protectionBypassCoordinator", () => ({
  protectionBypassCoordinator: {
    execute: mocks.executeProtectionBypassTask,
  },
}))

describe("setupRuntimeMessageListeners additional routing", () => {
  let runtimeMessageListener: RuntimeMessageListener | undefined
  const originalBrowser = (globalThis as any).browser

  beforeEach(() => {
    runtimeMessageListener = undefined
    vi.clearAllMocks()
    mocks.executeProtectionBypassTask.mockResolvedValue({ success: true })

    mocks.onRuntimeMessage.mockImplementation(
      (listener: RuntimeMessageListener) => {
        runtimeMessageListener = listener
      },
    )
    mocks.hasCookieReadPermissionForUrl.mockResolvedValue(true)
    mocks.setupContextMenus.mockResolvedValue(undefined)
    mocks.trackCookieInterceptorUrl.mockResolvedValue(undefined)
    mocks.containsPermissions.mockResolvedValue(true)
    ;(globalThis as any).browser = {}
  })

  afterEach(() => {
    ;(globalThis as any).browser = originalBrowser
    vi.resetModules()
    vi.restoreAllMocks()
  })

  async function loadListener() {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")
    expect(mocks.setupReleaseUpdateMessagingListeners).toHaveBeenCalledTimes(1)
    expect(mocks.setupLdohSiteLookupMessagingListeners).toHaveBeenCalledTimes(1)
    expect(mocks.setupTaskNotificationMessagingListeners).toHaveBeenCalledTimes(
      1,
    )
    expect(mocks.setupChannelConfigMessagingListeners).toHaveBeenCalledTimes(1)
    expect(mocks.setupExternalCheckInMessagingListeners).toHaveBeenCalledTimes(
      1,
    )
    expect(mocks.setupAutoRefreshMessagingListeners).toHaveBeenCalledTimes(1)
    expect(mocks.setupWebdavAutoSyncMessagingListeners).toHaveBeenCalledTimes(1)
    expect(mocks.setupUsageHistoryMessagingListeners).toHaveBeenCalledTimes(1)
    expect(
      mocks.setupDailyBalanceHistoryMessagingListeners,
    ).toHaveBeenCalledTimes(1)
    expect(
      mocks.setupSiteAnnouncementsMessagingListeners,
    ).toHaveBeenCalledTimes(1)
    expect(
      mocks.setupProductAnnouncementMessagingListeners,
    ).toHaveBeenCalledTimes(1)
    expect(mocks.setupPreferencesMessagingListeners).toHaveBeenCalledTimes(1)
    expect(
      mocks.setupManagedSiteModelSyncMessagingListeners,
    ).toHaveBeenCalledTimes(1)
    expect(mocks.setupAccountKeyRepairMessagingListeners).toHaveBeenCalledTimes(
      1,
    )
    expect(mocks.setupAutoCheckinMessagingListeners).toHaveBeenCalledTimes(1)
    expect(mocks.setupWebAiApiCheckMessagingListeners).toHaveBeenCalledTimes(1)
    expect(mocks.setupRedemptionAssistMessagingListeners).toHaveBeenCalledTimes(
      1,
    )
    expect(mocks.setupProductAnalyticsMessagingListeners).toHaveBeenCalledTimes(
      1,
    )
    return runtimeMessageListener!
  }

  async function waitForAsyncResponse() {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it("handles permission checks for both success and failure responses", async () => {
    const listener = await loadListener()

    const sendResponse = vi.fn()
    expect(
      listener(
        {
          action: RuntimeActionIds.PermissionsCheck,
          permissions: { permissions: ["cookies"] },
        },
        {},
        sendResponse,
      ),
    ).toBe(true)

    await waitForAsyncResponse()
    expect(sendResponse).toHaveBeenCalledWith({ hasPermission: true })

    mocks.containsPermissions.mockRejectedValueOnce(
      new Error("permission boom"),
    )
    const failedResponse = vi.fn()

    expect(
      listener(
        {
          action: RuntimeActionIds.PermissionsCheck,
          permissions: { permissions: ["tabs"] },
        },
        {},
        failedResponse,
      ),
    ).toBe(true)

    await waitForAsyncResponse()
    expect(failedResponse).toHaveBeenCalledWith({
      hasPermission: false,
      error: "permission boom",
    })
  })

  it("tracks cookie interceptor URLs and surfaces tracker failures", async () => {
    const listener = await loadListener()

    const sendResponse = vi.fn()
    expect(
      listener(
        {
          action: RuntimeActionIds.CookieInterceptorTrackUrl,
          url: "https://example.com",
          ttlMs: 1234,
        },
        {},
        sendResponse,
      ),
    ).toBe(true)

    await waitForAsyncResponse()
    expect(mocks.trackCookieInterceptorUrl).toHaveBeenCalledWith(
      "https://example.com",
      1234,
    )
    expect(sendResponse).toHaveBeenCalledWith({ success: true })

    mocks.trackCookieInterceptorUrl.mockRejectedValueOnce(
      new Error("track boom"),
    )
    const failedResponse = vi.fn()
    expect(
      listener(
        {
          action: RuntimeActionIds.CookieInterceptorTrackUrl,
          url: "https://example.com/fail",
          ttlMs: 1,
        },
        {},
        failedResponse,
      ),
    ).toBe(true)

    await waitForAsyncResponse()
    expect(failedResponse).toHaveBeenCalledWith({
      success: false,
      error: "track boom",
    })
  })

  it("opens the expected settings destinations for background-triggered navigation", async () => {
    const listener = await loadListener()

    const openCalls = [
      {
        action: RuntimeActionIds.OpenSettingsCheckinRedeem,
        expectedArgs: [
          MENU_ITEM_IDS.BASIC,
          { tab: "checkinRedeem", anchor: "redemption-assist" },
        ],
      },
      {
        action: RuntimeActionIds.OpenSettingsShieldBypass,
        expectedArgs: [
          MENU_ITEM_IDS.BASIC,
          { tab: "refresh", anchor: "shield-settings" },
        ],
      },
      {
        action: RuntimeActionIds.OpenSettingsApiCredentialProfiles,
        expectedArgs: [MENU_ITEM_IDS.API_CREDENTIAL_PROFILES],
      },
      {
        action: RuntimeActionIds.OpenSettingsWebAiApiCheck,
        expectedArgs: [
          MENU_ITEM_IDS.BASIC,
          {
            tab: "webAiApiCheck",
            anchor: WEB_AI_API_CHECK_TARGET_IDS.enhancedAutoDetect,
          },
        ],
      },
    ]

    for (const item of openCalls) {
      const sendResponse = vi.fn()
      const result = listener({ action: item.action }, {}, sendResponse)

      expect(result).toBe(true)
      expect(sendResponse).toHaveBeenCalledWith({ success: true })
      expect(mocks.openOrFocusOptionsMenuItem).toHaveBeenLastCalledWith(
        ...item.expectedArgs,
      )
    }
  })

  it("opens the bug report feedback destination for background-triggered navigation", async () => {
    const listener = await loadListener()
    const sendResponse = vi.fn()
    mocks.openBugReportPage.mockResolvedValueOnce(undefined)

    const result = listener(
      { action: RuntimeActionIds.OpenFeedbackBugReport },
      {},
      sendResponse,
    )

    expect(result).toBe(true)
    await waitForAsyncResponse()
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
    expect(mocks.openBugReportPage).toHaveBeenCalledTimes(1)
  })

  it("surfaces bug report navigation failures", async () => {
    const listener = await loadListener()
    const sendResponse = vi.fn()
    mocks.openBugReportPage.mockRejectedValueOnce(
      new Error("navigation blocked"),
    )

    const result = listener(
      { action: RuntimeActionIds.OpenFeedbackBugReport },
      {},
      sendResponse,
    )

    expect(result).toBe(true)
    await waitForAsyncResponse()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "navigation blocked",
    })
  })

  it("routes all nine canonical tasks through one exact envelope", async () => {
    const listener = await loadListener()
    const tasks = [
      {
        kind: "api_fallback_fetch",
        params: {
          originUrl: "https://example.invalid",
          fetchUrl: "https://example.invalid/api/user/self",
        },
      },
      {
        kind: "profile_isolated_fetch",
        params: {
          originUrl: "https://example.invalid",
          fetchUrl: "https://example.invalid/api/user/self",
        },
      },
      {
        kind: "turnstile_fetch",
        params: {
          originUrl: "https://example.invalid",
          pageUrl: "https://example.invalid/checkin",
          fetchUrl: "https://example.invalid/api/checkin",
        },
      },
      {
        kind: "native_page_action",
        params: {
          originUrl: "https://example.invalid",
          pageUrl: "https://example.invalid/console/personal",
          siteType: "new-api",
          expectedUserId: "example-user",
        },
      },
      {
        kind: "openrouter_management_key_action",
        params: {
          requestId: "request-example",
          operation: { kind: "create", label: "extension-request-example" },
        },
      },
      {
        kind: "rendered_title",
        params: { originUrl: "https://example.invalid" },
      },
      {
        kind: "session_read",
        params: {
          url: "https://example.invalid",
          requestId: "request-session",
          siteType: "new-api",
        },
      },
      {
        kind: "new_api_session_read",
        params: {
          origin: "https://example.invalid",
          action: "channel_key",
          channelId: 7,
          userId: "example-user",
        },
      },
      {
        kind: "open_context",
        params: {
          url: "https://example.invalid",
          requestId: "request-open-context",
        },
      },
    ]

    for (const task of tasks) {
      const sendResponse = vi.fn()
      const sender = { tab: { id: 42 }, frameId: 0, url: "https://example.com" }
      const result = listener(
        {
          action: RuntimeActionIds.ProtectionBypassExecuteTask,
          execution: backgroundExecution,
          task,
        },
        sender,
        sendResponse,
      )

      expect(result).toBe(true)
      expect(mocks.executeProtectionBypassTask).toHaveBeenLastCalledWith({
        execution: backgroundExecution,
        task,
      })
    }
  })

  it.each(["protectionBypassExecution", "tempWindowRequestSource"])(
    "rejects nested duplicate authority key %s",
    async (key) => {
      const listener = await loadListener()
      const sendResponse = vi.fn()
      listener(
        {
          action: RuntimeActionIds.ProtectionBypassExecuteTask,
          execution: popupExecution,
          task: {
            kind: "rendered_title",
            params: {
              originUrl: "https://example.invalid",
              [key]: popupExecution,
            },
          },
        },
        {},
        sendResponse,
      )
      expect(mocks.executeProtectionBypassTask).not.toHaveBeenCalled()
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false }),
      )
    },
  )

  it("routes OpenRouter cancellation and dispatch markers by request ID", async () => {
    const listener = await loadListener()
    mocks.cancelTempWindowOpenRouterManagementKeyAction.mockReturnValue({
      requestId: "request-example",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: "dispatched_unconfirmed",
      label: "recognizable-label",
    })
    mocks.markTempWindowOpenRouterManagementKeyDispatched.mockReturnValue(true)

    const cancelResponse = vi.fn()
    expect(
      listener(
        {
          action:
            RuntimeActionIds.TempWindowCancelOpenRouterManagementKeyAction,
          requestId: "request-example",
        },
        {},
        cancelResponse,
      ),
    ).toBe(true)
    expect(cancelResponse).toHaveBeenCalledWith({
      requestId: "request-example",
      certainty: "known",
      cancellationAccepted: true,
      mutationState: "dispatched_unconfirmed",
      label: "recognizable-label",
    })

    const dispatchResponse = vi.fn()
    expect(
      listener(
        {
          action: RuntimeActionIds.TempWindowOpenRouterManagementKeyDispatched,
          requestId: "request-example",
        },
        {},
        dispatchResponse,
      ),
    ).toBe(true)
    expect(dispatchResponse).toHaveBeenCalledWith({
      requestId: "request-example",
      marked: true,
    })
  })

  it("rejects a canonical task when outer execution is missing", async () => {
    const listener = await loadListener()
    const sendResponse = vi.fn()

    listener(
      {
        action: RuntimeActionIds.ProtectionBypassExecuteTask,
        task: {
          kind: "openrouter_management_key_action",
          params: {
            requestId: "request-strict-boundary",
            operation: { kind: "create", label: "extension-request-example" },
          },
        },
      },
      {},
      sendResponse,
    )

    expect(mocks.executeProtectionBypassTask).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    )
  })

  it("normalizes malformed OpenRouter control-message request IDs", async () => {
    mocks.cancelTempWindowOpenRouterManagementKeyAction.mockReturnValue({
      requestId: "",
      certainty: "unknown",
    })
    mocks.markTempWindowOpenRouterManagementKeyDispatched.mockReturnValue(false)
    const listener = await loadListener()
    const sendResponse = vi.fn()

    listener(
      {
        action: RuntimeActionIds.TempWindowCancelOpenRouterManagementKeyAction,
        requestId: { private: "id" },
      },
      {},
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({
      requestId: "",
      certainty: "unknown",
    })
    expect(
      mocks.cancelTempWindowOpenRouterManagementKeyAction,
    ).toHaveBeenCalledWith("")

    sendResponse.mockClear()
    listener(
      {
        action: RuntimeActionIds.TempWindowOpenRouterManagementKeyDispatched,
        requestId: { private: "id" },
      },
      {},
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({
      requestId: "",
      marked: false,
    })
    expect(
      mocks.markTempWindowOpenRouterManagementKeyDispatched,
    ).toHaveBeenCalledWith("")
  })

  it("does not route typed Redemption Assist RPCs through the raw runtime listener", async () => {
    const listener = await loadListener()
    const sendResponse = vi.fn()

    const result = listener(
      {
        type: RedemptionAssistMessageTypes.ShouldPrompt,
        data: {
          url: "https://example.com/redeem",
          codes: ["CODE_1"],
        },
      },
      { tab: { id: 42 }, frameId: 0, url: "https://example.com" },
      sendResponse,
    )

    expect(result).toBeUndefined()
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it("does not route typed-only product analytics actions through the raw runtime listener", async () => {
    const listener = await loadListener()
    const sendResponse = vi.fn()
    const request = {
      type: ProductAnalyticsMessageTypes.TrackEvent,
      data: {
        eventName: "app_opened",
        properties: { entrypoint: "popup" },
      },
    }

    expect(listener(request, {}, sendResponse)).toBeUndefined()
    expect(sendResponse).not.toHaveBeenCalled()
  })

  it("returns cookie import success when a session cookie can be extracted", async () => {
    mocks.getCookieHeaderForUrlResult.mockResolvedValueOnce({
      header: "cf_clearance=abc; session=xyz",
    })

    const listener = await loadListener()
    const sendResponse = vi.fn()

    expect(
      listener(
        {
          action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
          url: "https://example.com",
        },
        {},
        sendResponse,
      ),
    ).toBe(true)

    await waitForAsyncResponse()
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: "session=xyz",
    })
  })

  it("returns a generic cookie import error when helper calls throw", async () => {
    mocks.hasCookieReadPermissionForUrl.mockRejectedValueOnce(
      new Error("permission lookup failed"),
    )

    const listener = await loadListener()
    const sendResponse = vi.fn()

    expect(
      listener(
        {
          action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
          url: "https://example.com",
        },
        {},
        sendResponse,
      ),
    ).toBe(true)

    await Promise.resolve()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "permission lookup failed",
    })
  })

  it("preserves the no-cookies fallback code when extraction still yields no session cookie", async () => {
    mocks.getCookieHeaderForUrlResult.mockResolvedValueOnce({
      header: "",
      failureReason: COOKIE_IMPORT_FAILURE_REASONS.NoCookiesFound,
    })

    const listener = await loadListener()
    const sendResponse = vi.fn()

    expect(
      listener(
        {
          action: RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie,
          url: "https://example.com",
        },
        {},
        sendResponse,
      ),
    ).toBe(true)

    await waitForAsyncResponse()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      errorCode: COOKIE_IMPORT_FAILURE_REASONS.NoCookiesFound,
    })
  })
})
