import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"

type RuntimeMessageListener = (
  request: any,
  sender: any,
  sendResponse: (response: any) => void,
) => unknown

describe("setupRuntimeMessageListeners routing", () => {
  let runtimeMessageListener: RuntimeMessageListener | undefined
  let applyActionClickBehavior: ReturnType<typeof vi.fn>
  let handleManagedSiteModelSyncMessage: ReturnType<typeof vi.fn>
  let setupContextMenus: ReturnType<typeof vi.fn>

  beforeEach(() => {
    runtimeMessageListener = undefined
    applyActionClickBehavior = vi.fn()
    handleManagedSiteModelSyncMessage = vi.fn()
    setupContextMenus = vi.fn().mockResolvedValue(undefined)

    vi.resetModules()

    vi.doMock("~/utils/browserApi", async (importOriginal) => {
      const actual = await importOriginal<typeof import("~/utils/browserApi")>()
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

    vi.doMock("~/entrypoints/background/contextMenus", () => ({
      setupContextMenus,
    }))

    vi.doMock("~/services/modelSync", () => ({
      handleManagedSiteModelSyncMessage,
    }))

    // runtimeMessages imports these modules; provide minimal stubs to avoid heavy side effects.
    vi.doMock("~/services/autoCheckin/scheduler", () => ({
      handleAutoCheckinMessage: vi.fn(),
    }))
    vi.doMock("~/services/accounts/autoRefreshService", () => ({
      handleAutoRefreshMessage: vi.fn(),
    }))
    vi.doMock("~/services/channelConfigStorage", () => ({
      handleChannelConfigMessage: vi.fn(),
    }))
    vi.doMock("~/services/externalCheckInService", () => ({
      handleExternalCheckInMessage: vi.fn(),
    }))
    vi.doMock("~/services/redemptionAssist", () => ({
      handleRedemptionAssistMessage: vi.fn(),
    }))
    vi.doMock("~/services/usageHistory/scheduler", () => ({
      handleUsageHistoryMessage: vi.fn(),
    }))
    vi.doMock("~/services/webdav/webdavAutoSyncService", () => ({
      handleWebdavAutoSyncMessage: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.doUnmock("~/utils/browserApi")
    vi.doUnmock("~/entrypoints/background/actionClickBehavior")
    vi.doUnmock("~/entrypoints/background/contextMenus")
    vi.doUnmock("~/services/modelSync")
    vi.doUnmock("~/services/autoCheckin/scheduler")
    vi.doUnmock("~/services/accounts/autoRefreshService")
    vi.doUnmock("~/services/channelConfigStorage")
    vi.doUnmock("~/services/externalCheckInService")
    vi.doUnmock("~/services/redemptionAssist")
    vi.doUnmock("~/services/usageHistory/scheduler")
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
})
