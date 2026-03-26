import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { RuntimeActionIds } from "~/constants/runtimeActions"

type RuntimeMessageListener = (
  request: any,
  sender: any,
  sendResponse: (response: any) => void,
) => unknown

describe("setupRuntimeMessageListeners routing", () => {
  let runtimeMessageListener: RuntimeMessageListener | undefined
  let applyActionClickBehavior: ReturnType<typeof vi.fn>
  let getCookieHeaderForUrlResult: ReturnType<typeof vi.fn>
  let hasCookieReadPermissionForUrl: ReturnType<typeof vi.fn>
  let handleManagedSiteModelSyncMessage: ReturnType<typeof vi.fn>
  let setupContextMenus: ReturnType<typeof vi.fn>

  beforeEach(() => {
    runtimeMessageListener = undefined
    applyActionClickBehavior = vi.fn()
    getCookieHeaderForUrlResult = vi.fn()
    hasCookieReadPermissionForUrl = vi.fn().mockResolvedValue(true)
    handleManagedSiteModelSyncMessage = vi.fn()
    setupContextMenus = vi.fn().mockResolvedValue(undefined)

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

    vi.doMock("~/entrypoints/background/actionClickBehavior", () => ({
      applyActionClickBehavior,
    }))

    vi.doMock("~/utils/browser/cookieHelper", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("~/utils/browser/cookieHelper")>()
      return {
        ...actual,
        getCookieHeaderForUrlResult,
        hasCookieReadPermissionForUrl,
      }
    })

    vi.doMock("~/entrypoints/background/contextMenus", () => ({
      setupContextMenus,
    }))

    vi.doMock("~/services/models/modelSync", () => ({
      handleManagedSiteModelSyncMessage,
    }))

    // runtimeMessages imports these modules; provide minimal stubs to avoid heavy side effects.
    vi.doMock("~/services/checkin/autoCheckin/scheduler", () => ({
      handleAutoCheckinMessage: vi.fn(),
    }))
    vi.doMock("~/services/accounts/autoRefreshService", () => ({
      handleAutoRefreshMessage: vi.fn(),
    }))
    vi.doMock("~/services/managedSites/channelConfigStorage", () => ({
      handleChannelConfigMessage: vi.fn(),
    }))
    vi.doMock("~/services/checkin/externalCheckInService", () => ({
      handleExternalCheckInMessage: vi.fn(),
    }))
    vi.doMock("~/services/redemption/redemptionAssist", () => ({
      handleRedemptionAssistMessage: vi.fn(),
    }))
    vi.doMock("~/services/history/usageHistory/scheduler", () => ({
      handleUsageHistoryMessage: vi.fn(),
    }))
    vi.doMock("~/services/webdav/webdavAutoSyncService", () => ({
      handleWebdavAutoSyncMessage: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.doUnmock("~/utils/browser/browserApi")
    vi.doUnmock("~/entrypoints/background/actionClickBehavior")
    vi.doUnmock("~/utils/browser/cookieHelper")
    vi.doUnmock("~/entrypoints/background/contextMenus")
    vi.doUnmock("~/services/models/modelSync")
    vi.doUnmock("~/services/checkin/autoCheckin/scheduler")
    vi.doUnmock("~/services/accounts/autoRefreshService")
    vi.doUnmock("~/services/managedSites/channelConfigStorage")
    vi.doUnmock("~/services/checkin/externalCheckInService")
    vi.doUnmock("~/services/redemption/redemptionAssist")
    vi.doUnmock("~/services/history/usageHistory/scheduler")
    vi.doUnmock("~/services/webdav/webdavAutoSyncService")
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("routes exact-match actions and responds synchronously", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")

    const sendResponse = vi.fn()
    const result = runtimeMessageListener?.(
      {
        action: RuntimeActionIds.PreferencesUpdateActionClickBehavior,
        behavior: "openPopup",
      },
      {},
      sendResponse,
    )

    expect(applyActionClickBehavior).toHaveBeenCalledWith("openPopup")
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
    expect(result).toBe(true)
  })

  it("refreshes context menus when requested", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")

    const sendResponse = vi.fn()
    const result = runtimeMessageListener?.(
      {
        action: RuntimeActionIds.PreferencesRefreshContextMenus,
      },
      {},
      sendResponse,
    )

    expect(result).toBe(true)
    expect(setupContextMenus).toHaveBeenCalledTimes(1)

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
  })

  it("routes prefix actions to the feature handler and keeps the response channel open", async () => {
    const { setupRuntimeMessageListeners } = await import(
      "~/entrypoints/background/runtimeMessages"
    )

    setupRuntimeMessageListeners()
    expect(runtimeMessageListener).toBeTypeOf("function")

    const sendResponse = vi.fn()
    const request = { action: RuntimeActionIds.ModelSyncGetNextRun }

    const result = runtimeMessageListener?.(request, {}, sendResponse)

    expect(handleManagedSiteModelSyncMessage).toHaveBeenCalledWith(
      request,
      sendResponse,
    )
    expect(result).toBe(true)
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
