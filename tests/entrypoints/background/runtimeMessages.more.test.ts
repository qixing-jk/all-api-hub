import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { WEB_AI_API_CHECK_TARGET_IDS } from "~/features/BasicSettings/components/tabs/WebAiApiCheck/searchTargets"
import { ProductAnalyticsMessageTypes } from "~/services/productAnalytics/messaging"
import { RedemptionAssistMessageTypes } from "~/services/redemption/redemptionAssistMessaging"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"

type RuntimeMessageListener = (
  request: any,
  sender: any,
  sendResponse: (response: any) => void,
) => unknown

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
  handleOpenTempWindow: vi.fn(),
  handleCloseTempWindow: vi.fn(),
  handleAutoDetectSite: vi.fn(),
  handleTempWindowFetch: vi.fn(),
  handleTempWindowCheckinPageAction: vi.fn(),
  handleTempWindowTurnstileFetch: vi.fn(),
  handleTempWindowGetRenderedTitle: vi.fn(),
  openBugReportPage: vi.fn(),
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
  handleOpenTempWindow: mocks.handleOpenTempWindow,
  handleCloseTempWindow: mocks.handleCloseTempWindow,
  handleAutoDetectSite: mocks.handleAutoDetectSite,
  handleTempWindowFetch: mocks.handleTempWindowFetch,
  handleTempWindowCheckinPageAction: mocks.handleTempWindowCheckinPageAction,
  handleTempWindowTurnstileFetch: mocks.handleTempWindowTurnstileFetch,
  handleTempWindowGetRenderedTitle: mocks.handleTempWindowGetRenderedTitle,
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

describe("setupRuntimeMessageListeners additional routing", () => {
  let runtimeMessageListener: RuntimeMessageListener | undefined
  const originalBrowser = (globalThis as any).browser

  beforeEach(() => {
    runtimeMessageListener = undefined
    vi.clearAllMocks()

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

  it("routes additional raw runtime actions to their feature handlers", async () => {
    const listener = await loadListener()

    const cases = [
      {
        request: {
          action: RuntimeActionIds.TempWindowCheckinPageAction,
          originUrl: "https://example.invalid",
          pageUrl: "https://example.invalid/console/personal",
          siteType: "new-api",
          expectedUserId: "target-user",
        },
        expected: mocks.handleTempWindowCheckinPageAction,
      },
      {
        request: {
          action: RuntimeActionIds.BalanceHistoryDebugSeedEstimateSnapshots,
        },
        expected: mocks.handleDailyBalanceHistoryMessage,
      },
    ]

    for (const { request, expected } of cases) {
      const sendResponse = vi.fn()
      const sender = { tab: { id: 42 }, frameId: 0, url: "https://example.com" }
      const result = listener(request, sender, sendResponse)

      expect(result).toBe(true)
      expect(expected).toHaveBeenLastCalledWith(
        request.action === RuntimeActionIds.TempWindowCheckinPageAction
          ? {
              ...request,
              tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
            }
          : request,
        sendResponse,
      )
    }
  })

  it.each([
    {
      action: RuntimeActionIds.AutoDetectSite,
      handler: mocks.handleAutoDetectSite,
      fields: { url: "https://example.invalid/account" },
    },
    {
      action: RuntimeActionIds.TempWindowFetch,
      handler: mocks.handleTempWindowFetch,
      fields: {
        originUrl: "https://example.invalid",
        fetchUrl: "https://example.invalid/api/models",
      },
    },
    {
      action: RuntimeActionIds.TempWindowTurnstileFetch,
      handler: mocks.handleTempWindowTurnstileFetch,
      fields: {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/checkin",
        fetchUrl: "https://example.invalid/api/checkin",
      },
    },
    {
      action: RuntimeActionIds.TempWindowCheckinPageAction,
      handler: mocks.handleTempWindowCheckinPageAction,
      fields: {
        originUrl: "https://example.invalid",
        pageUrl: "https://example.invalid/console/personal",
        siteType: "new-api",
        expectedUserId: "target-user",
      },
    },
    {
      action: RuntimeActionIds.TempWindowGetRenderedTitle,
      handler: mocks.handleTempWindowGetRenderedTitle,
      fields: { originUrl: "https://example.invalid" },
    },
  ])(
    "normalizes source and boolean overrides for $action runtime requests",
    async ({ action, handler, fields }) => {
      const listener = await loadListener()
      const sendResponse = vi.fn()

      listener(
        {
          action,
          ...fields,
          tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
          suppressMinimize: "true",
        },
        {},
        sendResponse,
      )
      let normalizedRequest = handler.mock.calls.at(-1)?.[0]
      expect(normalizedRequest).toMatchObject({
        action,
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      })
      expect(normalizedRequest).not.toHaveProperty("suppressMinimize")

      listener({ action, ...fields, suppressMinimize: true }, {}, sendResponse)
      normalizedRequest = handler.mock.calls.at(-1)?.[0]
      expect(normalizedRequest).toMatchObject({
        action,
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        suppressMinimize: true,
      })

      listener(
        {
          action,
          ...fields,
          tempWindowRequestSource: "untrusted",
          suppressMinimize: false,
        },
        {},
        sendResponse,
      )
      expect(handler).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action,
          tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
          suppressMinimize: false,
        }),
        sendResponse,
      )
    },
  )

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
