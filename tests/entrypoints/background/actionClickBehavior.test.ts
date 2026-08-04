import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { POPUP_PAGE_PATH } from "~/constants/extensionPages"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS } from "~/utils/browser/browserApi"

describe("background applyActionClickBehavior", () => {
  let addActionClickListener: ReturnType<typeof vi.fn>
  let setActionPopup: ReturnType<typeof vi.fn>
  let setNativeSidePanelActionClick: ReturnType<typeof vi.fn>
  let getSidePanelSupport: ReturnType<typeof vi.fn>
  let getPreferences: ReturnType<typeof vi.fn>
  let getPreferencesStrict: ReturnType<typeof vi.fn>
  let loggerWarn: ReturnType<typeof vi.fn>
  let openSidePanelWithFallback: ReturnType<typeof vi.fn>
  let openOptionsPage: ReturnType<typeof vi.fn>
  let openSettingsPage: ReturnType<typeof vi.fn>
  let startProductAnalyticsAction: ReturnType<typeof vi.fn>
  let trackerComplete: ReturnType<typeof vi.fn>

  beforeEach(() => {
    addActionClickListener = vi.fn()
    setActionPopup = vi.fn().mockResolvedValue(undefined)
    setNativeSidePanelActionClick = vi
      .fn()
      .mockResolvedValue(NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Unavailable)
    getSidePanelSupport = vi.fn()
    getPreferences = vi.fn().mockResolvedValue({
      actionClickBehavior: "popup",
    })
    getPreferencesStrict = vi.fn()
    loggerWarn = vi.fn()
    openSidePanelWithFallback = vi.fn().mockResolvedValue(undefined)
    openOptionsPage = vi.fn().mockResolvedValue(undefined)
    openSettingsPage = vi.fn().mockResolvedValue(undefined)
    trackerComplete = vi.fn().mockResolvedValue(undefined)
    startProductAnalyticsAction = vi.fn().mockReturnValue({
      complete: trackerComplete,
    })

    vi.resetModules()

    vi.doMock("~/utils/browser/browserApi", () => ({
      addActionClickListener,
      getSidePanelSupport,
      NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS,
      setActionPopup,
      setNativeSidePanelActionClick,
    }))

    vi.doMock("~/services/preferences/userPreferences", async () => {
      const actual = await vi.importActual<
        typeof import("~/services/preferences/userPreferences")
      >("~/services/preferences/userPreferences")

      return {
        ...actual,
        userPreferences: {
          getPreferences,
          getPreferencesStrict,
        },
      }
    })

    vi.doMock("~/utils/core/logger", () => ({
      createLogger: vi.fn(() => ({
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: loggerWarn,
      })),
    }))

    vi.doMock("~/utils/navigation", () => ({
      openSidePanelWithFallback,
      openOptionsPage,
      openSettingsPage,
    }))

    vi.doMock("~/services/productAnalytics/actions", () => ({
      startProductAnalyticsAction,
    }))
  })

  afterEach(() => {
    vi.doUnmock("~/utils/browser/browserApi")
    vi.doUnmock("~/services/preferences/userPreferences")
    vi.doUnmock("~/utils/core/logger")
    vi.doUnmock("~/utils/navigation")
    vi.doUnmock("~/services/productAnalytics/actions")
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("registers one stable toolbar listener", async () => {
    const { setupActionClickBehaviorListener } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    setupActionClickBehaviorListener()
    setupActionClickBehaviorListener()

    expect(addActionClickListener).toHaveBeenCalledTimes(2)
    expect(addActionClickListener.mock.calls[0]?.[0]).toBe(
      addActionClickListener.mock.calls[1]?.[0],
    )
  })

  it("falls back to popup wiring when sidepanel is requested but unsupported", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: false,
      kind: "unsupported",
      reason: "missing",
    })

    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    await applyActionClickBehavior("sidepanel")

    expect(setNativeSidePanelActionClick).toHaveBeenCalledWith(false)
    expect(setActionPopup).toHaveBeenCalledWith(POPUP_PAGE_PATH)
  })

  it("uses Chromium native routing for sidepanel mode", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    setNativeSidePanelActionClick.mockResolvedValue(
      NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Applied,
    )
    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    await applyActionClickBehavior("sidepanel")

    expect(setActionPopup).toHaveBeenCalledWith("")
    expect(setNativeSidePanelActionClick).toHaveBeenCalledWith(true)
    expect(openSidePanelWithFallback).not.toHaveBeenCalled()
  })

  it("uses the stable dispatcher when Chromium native routing fails", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    setNativeSidePanelActionClick.mockResolvedValue(
      NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Rejected,
    )
    const { applyActionClickBehavior, setupActionClickBehaviorListener } =
      await import("~/entrypoints/background/actionClickBehavior")
    setupActionClickBehaviorListener()
    await applyActionClickBehavior("sidepanel")

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    const clickedTab = { id: 123, windowId: 456 } as browser.tabs.Tab
    const clickResult = clickHandler(clickedTab)

    expect(openSidePanelWithFallback).toHaveBeenCalledWith(clickedTab)

    await clickResult
  })

  it("allows a known manual sidepanel fallback to transition to options", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    setNativeSidePanelActionClick.mockResolvedValue(
      NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Rejected,
    )
    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    await applyActionClickBehavior("sidepanel")
    await expect(applyActionClickBehavior("options")).resolves.toBeUndefined()

    expect(
      setNativeSidePanelActionClick.mock.calls.map(([enabled]) => enabled),
    ).toEqual([true, false])
    expect(setActionPopup.mock.calls.map(([popup]) => popup)).toEqual(["", ""])
  })

  it("keeps manual side-panel fallback available after support degrades", async () => {
    let support: ReturnType<typeof getSidePanelSupport> = {
      supported: true,
      kind: "chromium-side-panel",
    }
    getSidePanelSupport.mockImplementation(() => support)
    setNativeSidePanelActionClick.mockResolvedValue(
      NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Rejected,
    )
    openSidePanelWithFallback.mockImplementationOnce(async () => {
      support = {
        supported: false,
        kind: "unsupported",
        reason: "open-failed",
      }
    })
    const { applyActionClickBehavior, setupActionClickBehaviorListener } =
      await import("~/entrypoints/background/actionClickBehavior")
    setupActionClickBehaviorListener()
    await applyActionClickBehavior("sidepanel")

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    const clickedTab = { id: 123, windowId: 456 } as browser.tabs.Tab
    await clickHandler(clickedTab)
    await clickHandler(clickedTab)

    expect(openSidePanelWithFallback).toHaveBeenCalledTimes(2)
  })

  it("uses manual routing when Firefox sidebarAction is supported", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "firefox-sidebar-action",
    })
    const { applyActionClickBehavior, setupActionClickBehaviorListener } =
      await import("~/entrypoints/background/actionClickBehavior")
    setupActionClickBehaviorListener()

    await applyActionClickBehavior("sidepanel")
    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    const clickedTab = { id: 123, windowId: 456 } as browser.tabs.Tab
    const clickResult = clickHandler(clickedTab)

    expect(setNativeSidePanelActionClick).toHaveBeenCalledWith(false)
    expect(setActionPopup).toHaveBeenCalledWith("")
    expect(openSidePanelWithFallback).toHaveBeenCalledWith(clickedTab)

    await clickResult
  })

  it("disables Chromium native routing when options behavior is selected", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: false,
      kind: "unsupported",
      reason: "missing",
    })

    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    await applyActionClickBehavior("options")

    expect(setNativeSidePanelActionClick).toHaveBeenCalledWith(false)
    expect(setActionPopup).toHaveBeenCalledWith("")
  })

  it("rejects a cold Chromium options projection when native routing cannot be disabled", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    setNativeSidePanelActionClick.mockResolvedValue(
      NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Rejected,
    )
    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    await expect(applyActionClickBehavior("options")).rejects.toThrow(
      "Failed to disable native side-panel action click",
    )

    expect(setActionPopup).not.toHaveBeenCalled()
  })

  it("allows a cold Chromium options projection when native control is unavailable", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    await expect(applyActionClickBehavior("options")).resolves.toBeUndefined()

    expect(setActionPopup).toHaveBeenCalledWith("")
  })

  it("routes a cold options click from the durable preference", async () => {
    getPreferencesStrict.mockResolvedValue({
      actionClickBehavior: "options",
    })
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    const { setupActionClickBehaviorListener } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )
    setupActionClickBehaviorListener()

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    await clickHandler({ id: 123, windowId: 456 } as browser.tabs.Tab)

    expect(openOptionsPage).toHaveBeenCalledTimes(1)
  })

  it("falls back to basic settings when a cold preference read resolves to sidepanel", async () => {
    getPreferencesStrict.mockResolvedValue({
      actionClickBehavior: "sidepanel",
    })
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    const { setupActionClickBehaviorListener } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )
    setupActionClickBehaviorListener()

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    const clickedTab = { id: 123, windowId: 456 } as browser.tabs.Tab
    await clickHandler(clickedTab)

    expect(openSettingsPage).toHaveBeenCalledTimes(1)
    expect(openSidePanelWithFallback).not.toHaveBeenCalled()
  })

  it("leaves a cold popup click to the browser", async () => {
    getPreferencesStrict.mockResolvedValue({
      actionClickBehavior: "popup",
    })
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    const { setupActionClickBehaviorListener } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )
    setupActionClickBehaviorListener()

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    await clickHandler({ id: 123, windowId: 456 } as browser.tabs.Tab)

    expect(openOptionsPage).not.toHaveBeenCalled()
    expect(openSettingsPage).not.toHaveBeenCalled()
    expect(openSidePanelWithFallback).not.toHaveBeenCalled()
  })

  it("ignores a cold click when strict preference storage fails", async () => {
    const storageError = new Error("preference storage unavailable")
    getPreferencesStrict.mockRejectedValueOnce(storageError)
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    const { setupActionClickBehaviorListener } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )
    setupActionClickBehaviorListener()

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    await expect(
      clickHandler({ id: 123, windowId: 456 } as browser.tabs.Tab),
    ).resolves.toBeUndefined()

    expect(getPreferencesStrict).toHaveBeenCalledTimes(1)
    expect(getPreferences).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledWith(
      "Failed to resolve toolbar action click behavior",
      storageError,
    )
    expect(openOptionsPage).not.toHaveBeenCalled()
    expect(openSidePanelWithFallback).not.toHaveBeenCalled()
    expect(setActionPopup).not.toHaveBeenCalled()
    expect(setNativeSidePanelActionClick).not.toHaveBeenCalled()
  })

  it("keeps sidepanel clicks manual while Chromium native enable is pending", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    let releaseNativeEnable!: () => void
    setNativeSidePanelActionClick
      .mockResolvedValueOnce(NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Applied)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseNativeEnable = () =>
              resolve(NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Applied)
          }),
      )
    const { applyActionClickBehavior, setupActionClickBehaviorListener } =
      await import("~/entrypoints/background/actionClickBehavior")
    setupActionClickBehaviorListener()
    await applyActionClickBehavior("popup")

    const transition = applyActionClickBehavior("sidepanel")
    await vi.waitFor(() =>
      expect(setNativeSidePanelActionClick).toHaveBeenCalledTimes(2),
    )

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    const clickedTab = { id: 123, windowId: 456 } as browser.tabs.Tab
    await clickHandler(clickedTab)
    expect(openSidePanelWithFallback).toHaveBeenCalledWith(clickedTab)

    releaseNativeEnable()
    await transition
    await clickHandler(clickedTab)

    expect(openSidePanelWithFallback).toHaveBeenCalledTimes(1)
  })

  it("rejects a failed popup projection without committing the requested behavior", async () => {
    const popupError = new Error("action popup unavailable")
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    setNativeSidePanelActionClick.mockResolvedValue(
      NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Applied,
    )
    const { applyActionClickBehavior, setupActionClickBehaviorListener } =
      await import("~/entrypoints/background/actionClickBehavior")
    setupActionClickBehaviorListener()

    await applyActionClickBehavior("options")
    setActionPopup.mockRejectedValueOnce(popupError)

    await expect(applyActionClickBehavior("sidepanel")).rejects.toThrow(
      popupError,
    )

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    await clickHandler({ id: 123, windowId: 456 } as browser.tabs.Tab)

    expect(openOptionsPage).toHaveBeenCalledTimes(1)
  })

  it("keeps sidepanel clicks viable when a replacement popup projection fails", async () => {
    const popupError = new Error("action popup unavailable")
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    setNativeSidePanelActionClick
      .mockResolvedValueOnce(NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Applied)
      .mockResolvedValueOnce(NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Applied)
    const { applyActionClickBehavior, setupActionClickBehaviorListener } =
      await import("~/entrypoints/background/actionClickBehavior")
    setupActionClickBehaviorListener()

    await applyActionClickBehavior("sidepanel")
    setActionPopup.mockRejectedValueOnce(popupError)

    await expect(applyActionClickBehavior("options")).rejects.toThrow(
      popupError,
    )

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    const clickedTab = { id: 123, windowId: 456 } as browser.tabs.Tab
    await clickHandler(clickedTab)

    expect(
      setNativeSidePanelActionClick.mock.calls.map(([enabled]) => enabled),
    ).toEqual([true, false])
    expect(openSidePanelWithFallback).toHaveBeenCalledWith(clickedTab)
  })

  it("rejects a native sidepanel transition when native disable fails", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    setNativeSidePanelActionClick.mockResolvedValueOnce(
      NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Applied,
    )
    const { applyActionClickBehavior, setupActionClickBehaviorListener } =
      await import("~/entrypoints/background/actionClickBehavior")
    setupActionClickBehaviorListener()

    await applyActionClickBehavior("sidepanel")

    await expect(applyActionClickBehavior("options")).rejects.toThrow(
      "Failed to disable native side-panel action click",
    )

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    await clickHandler({ id: 123, windowId: 456 } as browser.tabs.Tab)

    expect(setActionPopup).toHaveBeenCalledTimes(1)
    expect(openOptionsPage).not.toHaveBeenCalled()
    expect(openSidePanelWithFallback).not.toHaveBeenCalled()
  })

  it("rejects a known native sidepanel transition after support degrades", async () => {
    let support: ReturnType<typeof getSidePanelSupport> = {
      supported: true,
      kind: "chromium-side-panel",
    }
    getSidePanelSupport.mockImplementation(() => support)
    setNativeSidePanelActionClick
      .mockResolvedValueOnce(NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Applied)
      .mockResolvedValueOnce(NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Rejected)
    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    await applyActionClickBehavior("sidepanel")
    support = {
      supported: false,
      kind: "unsupported",
      reason: "open-failed",
    }

    await expect(applyActionClickBehavior("options")).rejects.toThrow(
      "Failed to disable native side-panel action click",
    )

    expect(setActionPopup).toHaveBeenCalledTimes(1)
  })

  it("serializes browser action projections in request order", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    let releaseFirstPopup!: () => void
    setActionPopup.mockImplementationOnce(
      () => new Promise<void>((resolve) => (releaseFirstPopup = resolve)),
    )
    setNativeSidePanelActionClick.mockResolvedValue(
      NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Applied,
    )
    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    const first = applyActionClickBehavior("sidepanel")
    const second = applyActionClickBehavior("options")
    await vi.waitFor(() => expect(setActionPopup).toHaveBeenCalledTimes(1))

    releaseFirstPopup()
    await Promise.all([first, second])

    expect(setActionPopup.mock.calls.map(([popup]) => popup)).toEqual(["", ""])
    expect(
      setNativeSidePanelActionClick.mock.calls.map(([enabled]) => enabled),
    ).toEqual([true, false])
  })

  it("continues queued projections after a rejected projection", async () => {
    const popupError = new Error("action popup unavailable")
    getSidePanelSupport.mockReturnValue({
      supported: false,
      kind: "unsupported",
      reason: "missing",
    })
    setActionPopup.mockRejectedValueOnce(popupError)
    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    const failed = applyActionClickBehavior("sidepanel")
    const next = applyActionClickBehavior("options")

    await expect(failed).rejects.toThrow(popupError)
    await expect(next).resolves.toBeUndefined()
    expect(setActionPopup.mock.calls.map(([popup]) => popup)).toEqual([
      POPUP_PAGE_PATH,
      "",
    ])
  })

  it("records successful manual side-panel opens", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    setNativeSidePanelActionClick.mockResolvedValue(
      NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Rejected,
    )
    const clickedTab = { id: 123, windowId: 456 } as browser.tabs.Tab

    const { applyActionClickBehavior, setupActionClickBehaviorListener } =
      await import("~/entrypoints/background/actionClickBehavior")
    setupActionClickBehaviorListener()
    await applyActionClickBehavior("sidepanel")

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    await clickHandler(clickedTab)

    expect(openSidePanelWithFallback).toHaveBeenCalledWith(clickedTab)
    expect(startProductAnalyticsAction).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.SidepanelNavigation,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenSidepanelFromToolbarAction,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundToolbarAction,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    })
    expect(trackerComplete).toHaveBeenCalledWith()
  })

  it("does not let tracker completion failures break successful toolbar clicks", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    setNativeSidePanelActionClick.mockResolvedValue(
      NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Rejected,
    )
    trackerComplete.mockRejectedValueOnce(new Error("analytics unavailable"))

    const { applyActionClickBehavior, setupActionClickBehaviorListener } =
      await import("~/entrypoints/background/actionClickBehavior")
    setupActionClickBehaviorListener()
    await applyActionClickBehavior("sidepanel")

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]

    await expect(
      clickHandler({ id: 123, windowId: 456 } as browser.tabs.Tab),
    ).resolves.toBeUndefined()

    expect(openSidePanelWithFallback).toHaveBeenCalledTimes(1)
    expect(trackerComplete).toHaveBeenCalledWith()
  })

  it("preserves side-panel failures when failure tracking also fails", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    setNativeSidePanelActionClick.mockResolvedValue(
      NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Rejected,
    )
    const sidePanelError = new Error("side panel unavailable")
    openSidePanelWithFallback.mockRejectedValueOnce(sidePanelError)
    trackerComplete.mockRejectedValueOnce(new Error("analytics unavailable"))

    const { applyActionClickBehavior, setupActionClickBehaviorListener } =
      await import("~/entrypoints/background/actionClickBehavior")
    setupActionClickBehaviorListener()
    await applyActionClickBehavior("sidepanel")

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]

    await expect(
      clickHandler({ id: 123, windowId: 456 } as browser.tabs.Tab),
    ).rejects.toThrow(sidePanelError)

    expect(trackerComplete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
  })
})
