import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"

type RuntimeMessageListener = (
  request: any,
  sender: any,
  sendResponse: (response: any) => void,
) => unknown

const mocks = vi.hoisted(() => ({
  onRuntimeMessage: vi.fn(),
  applyActionClickBehavior: vi.fn(),
  getCookieHeaderForUrlResult: vi.fn(),
  hasCookieReadPermissionForUrl: vi.fn(),
  handleManagedSiteModelSyncMessage: vi.fn(),
  handleReleaseUpdateMessage: vi.fn(),
  handleAutoCheckinMessage: vi.fn(),
  handleAutoRefreshMessage: vi.fn(),
  handleChannelConfigMessage: vi.fn(),
  handleExternalCheckInMessage: vi.fn(),
  handleRedemptionAssistMessage: vi.fn(),
  handleUsageHistoryMessage: vi.fn(),
  handleWebdavAutoSyncMessage: vi.fn(),
  handleDailyBalanceHistoryMessage: vi.fn(),
  handleLdohSiteLookupMessage: vi.fn(),
  handleWebAiApiCheckMessage: vi.fn(),
  handleAccountKeyRepairMessage: vi.fn(),
  setupContextMenus: vi.fn(),
  trackCookieInterceptorUrl: vi.fn(),
  openOrFocusOptionsMenuItem: vi.fn(),
  handleOpenTempWindow: vi.fn(),
  handleCloseTempWindow: vi.fn(),
  handleAutoDetectSite: vi.fn(),
  handleTempWindowFetch: vi.fn(),
  handleTempWindowTurnstileFetch: vi.fn(),
  handleTempWindowGetRenderedTitle: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()

  return {
    ...actual,
    getManifest: vi.fn(() => ({ optional_permissions: [] })),
    onRuntimeMessage: mocks.onRuntimeMessage,
  }
})

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
}))

vi.mock("~/entrypoints/background/tempWindowPool", () => ({
  handleOpenTempWindow: mocks.handleOpenTempWindow,
  handleCloseTempWindow: mocks.handleCloseTempWindow,
  handleAutoDetectSite: mocks.handleAutoDetectSite,
  handleTempWindowFetch: mocks.handleTempWindowFetch,
  handleTempWindowTurnstileFetch: mocks.handleTempWindowTurnstileFetch,
  handleTempWindowGetRenderedTitle: mocks.handleTempWindowGetRenderedTitle,
}))

vi.mock("~/services/models/modelSync", () => ({
  handleManagedSiteModelSyncMessage: mocks.handleManagedSiteModelSyncMessage,
}))

vi.mock("~/services/updates/releaseUpdateService", () => ({
  handleReleaseUpdateMessage: mocks.handleReleaseUpdateMessage,
}))

vi.mock("~/services/checkin/autoCheckin/scheduler", () => ({
  handleAutoCheckinMessage: mocks.handleAutoCheckinMessage,
}))

vi.mock("~/services/accounts/autoRefreshService", () => ({
  handleAutoRefreshMessage: mocks.handleAutoRefreshMessage,
}))

vi.mock("~/services/managedSites/channelConfigStorage", () => ({
  handleChannelConfigMessage: mocks.handleChannelConfigMessage,
}))

vi.mock("~/services/checkin/externalCheckInService", () => ({
  handleExternalCheckInMessage: mocks.handleExternalCheckInMessage,
}))

vi.mock("~/services/redemption/redemptionAssist", () => ({
  handleRedemptionAssistMessage: mocks.handleRedemptionAssistMessage,
}))

vi.mock("~/services/history/usageHistory/scheduler", () => ({
  handleUsageHistoryMessage: mocks.handleUsageHistoryMessage,
}))

vi.mock("~/services/history/dailyBalanceHistory/scheduler", () => ({
  handleDailyBalanceHistoryMessage: mocks.handleDailyBalanceHistoryMessage,
}))

vi.mock("~/services/webdav/webdavAutoSyncService", () => ({
  handleWebdavAutoSyncMessage: mocks.handleWebdavAutoSyncMessage,
}))

vi.mock("~/services/integrations/ldohSiteLookup/background", () => ({
  handleLdohSiteLookupMessage: mocks.handleLdohSiteLookupMessage,
}))

vi.mock("~/services/verification/webAiApiCheck/background", () => ({
  handleWebAiApiCheckMessage: mocks.handleWebAiApiCheckMessage,
}))

vi.mock("~/services/accounts/accountKeyAutoProvisioning", () => ({
  handleAccountKeyRepairMessage: mocks.handleAccountKeyRepairMessage,
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
    ;(globalThis as any).browser = {
      runtime: {
        getURL: vi.fn(
          (path: string) => `chrome-extension://test-extension-id/${path}`,
        ),
      },
      permissions: {
        contains: vi.fn().mockResolvedValue(true),
      },
    }
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
    return runtimeMessageListener!
  }

  async function waitForAsyncResponse() {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it("handles permission checks for both success and failure responses", async () => {
    const permissionsContains = (globalThis as any).browser.permissions
      .contains as ReturnType<typeof vi.fn>
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

    permissionsContains.mockRejectedValueOnce(new Error("permission boom"))
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

  it("routes release update actions to the dedicated handler", async () => {
    const listener = await loadListener()
    const sendResponse = vi.fn()

    expect(
      listener(
        {
          action: RuntimeActionIds.ReleaseUpdateGetStatus,
        },
        {},
        sendResponse,
      ),
    ).toBe(true)

    expect(mocks.handleReleaseUpdateMessage).toHaveBeenCalledWith(
      {
        action: RuntimeActionIds.ReleaseUpdateGetStatus,
      },
      sendResponse,
    )
  })

  it("routes additional prefix-based actions to their feature handlers", async () => {
    const listener = await loadListener()

    const cases = [
      {
        request: { action: RuntimeActionIds.AutoRefreshRefreshNow },
        expected: mocks.handleAutoRefreshMessage,
      },
      {
        request: { action: RuntimeActionIds.WebdavAutoSyncSyncNow },
        expected: mocks.handleWebdavAutoSyncMessage,
      },
      {
        request: { action: RuntimeActionIds.AutoCheckinGetStatus },
        expected: mocks.handleAutoCheckinMessage,
      },
      {
        request: { action: RuntimeActionIds.ExternalCheckInOpenAndMark },
        expected: mocks.handleExternalCheckInMessage,
      },
      {
        request: { action: RuntimeActionIds.AccountKeyRepairStart },
        expected: mocks.handleAccountKeyRepairMessage,
      },
      {
        request: { action: RuntimeActionIds.ApiCheckRunProbe },
        expected: mocks.handleWebAiApiCheckMessage,
      },
      {
        request: {
          action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
        },
        expected: mocks.handleRedemptionAssistMessage,
      },
      {
        request: { action: RuntimeActionIds.ChannelConfigGet },
        expected: mocks.handleChannelConfigMessage,
      },
      {
        request: { action: RuntimeActionIds.UsageHistorySyncNow },
        expected: mocks.handleUsageHistoryMessage,
      },
      {
        request: { action: RuntimeActionIds.BalanceHistoryRefreshNow },
        expected: mocks.handleDailyBalanceHistoryMessage,
      },
      {
        request: { action: RuntimeActionIds.LdohSiteLookupRefreshSites },
        expected: mocks.handleLdohSiteLookupMessage,
      },
    ]

    for (const { request, expected } of cases) {
      const sendResponse = vi.fn()
      const sender = { tab: { id: 42 }, frameId: 0, url: "https://example.com" }
      const result = listener(request, sender, sendResponse)

      expect(result).toBe(true)

      if (expected === mocks.handleRedemptionAssistMessage) {
        expect(expected).toHaveBeenLastCalledWith(request, sender, sendResponse)
      } else {
        expect(expected).toHaveBeenLastCalledWith(request, sendResponse)
      }
    }
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

  it("surfaces outer handler errors as structured failures", async () => {
    mocks.applyActionClickBehavior.mockImplementationOnce(() => {
      throw new Error("apply boom")
    })

    const listener = await loadListener()
    const sendResponse = vi.fn()

    expect(
      listener(
        {
          action: RuntimeActionIds.PreferencesUpdateActionClickBehavior,
          behavior: "openPopup",
        },
        {},
        sendResponse,
      ),
    ).toBe(true)

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "apply boom",
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
