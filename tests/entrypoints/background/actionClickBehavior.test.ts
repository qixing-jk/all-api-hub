import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { POPUP_PAGE_PATH } from "~/constants/extensionPages"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

describe("background applyActionClickBehavior", () => {
  let addActionClickListener: ReturnType<typeof vi.fn>
  let removeActionClickListener: ReturnType<typeof vi.fn>
  let setActionPopup: ReturnType<typeof vi.fn>
  let getSidePanelSupport: ReturnType<typeof vi.fn>
  let openSidePanelWithFallback: ReturnType<typeof vi.fn>
  let setPanelBehavior: ReturnType<typeof vi.fn>
  let startProductAnalyticsAction: ReturnType<typeof vi.fn>
  let trackerComplete: ReturnType<typeof vi.fn>

  beforeEach(() => {
    addActionClickListener = vi.fn()
    removeActionClickListener = vi.fn()
    setActionPopup = vi.fn().mockResolvedValue(undefined)
    getSidePanelSupport = vi.fn()
    openSidePanelWithFallback = vi.fn().mockResolvedValue(undefined)
    setPanelBehavior = vi.fn().mockResolvedValue(undefined)
    trackerComplete = vi.fn().mockResolvedValue(undefined)
    startProductAnalyticsAction = vi.fn().mockReturnValue({
      complete: trackerComplete,
    })
    ;(globalThis as any).chrome = {
      sidePanel: {
        setPanelBehavior,
      },
    }

    vi.resetModules()

    vi.doMock("~/utils/browser/browserApi", () => ({
      addActionClickListener,
      getSidePanelSupport,
      removeActionClickListener,
      setActionPopup,
    }))

    vi.doMock("~/utils/navigation", () => ({
      openSidePanelWithFallback,
    }))

    vi.doMock("~/services/productAnalytics/actions", () => ({
      startProductAnalyticsAction,
    }))
  })

  afterEach(() => {
    ;(globalThis as any).chrome = undefined
    vi.doUnmock("~/utils/browser/browserApi")
    vi.doUnmock("~/utils/navigation")
    vi.doUnmock("~/services/productAnalytics/actions")
    vi.resetModules()
    vi.restoreAllMocks()
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

    expect(removeActionClickListener).toHaveBeenCalledTimes(1)
    expect(setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    })
    expect(setActionPopup).toHaveBeenCalledWith(POPUP_PAGE_PATH)
    expect(addActionClickListener).not.toHaveBeenCalled()
  })

  it("installs sidepanel wiring when side panel is supported", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })

    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    await applyActionClickBehavior("sidepanel")

    expect(removeActionClickListener).toHaveBeenCalledTimes(1)
    expect(setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    })
    expect(setActionPopup).toHaveBeenCalledWith("")
    expect(addActionClickListener).toHaveBeenCalledTimes(1)
  })

  it("installs sidepanel wiring when Firefox sidebarAction is supported", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "firefox-sidebar-action",
    })

    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    await applyActionClickBehavior("sidepanel")

    expect(removeActionClickListener).toHaveBeenCalledTimes(1)
    expect(setPanelBehavior).toHaveBeenCalledWith({
      openPanelOnActionClick: false,
    })
    expect(setActionPopup).toHaveBeenCalledWith("")
    expect(addActionClickListener).toHaveBeenCalledTimes(1)
  })

  it("routes action clicks through the shared side-panel fallback helper", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    const clickedTab = { id: 123, windowId: 456 } as browser.tabs.Tab

    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    await applyActionClickBehavior("sidepanel")

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    expect(typeof clickHandler).toBe("function")

    await clickHandler?.(clickedTab)

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
    trackerComplete.mockRejectedValueOnce(new Error("analytics unavailable"))

    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    await applyActionClickBehavior("sidepanel")

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]

    await expect(
      clickHandler?.({ id: 123, windowId: 456 } as browser.tabs.Tab),
    ).resolves.toBeUndefined()

    expect(openSidePanelWithFallback).toHaveBeenCalledTimes(1)
    expect(trackerComplete).toHaveBeenCalledWith()
  })

  it("preserves side-panel failures when failure tracking also fails", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    const sidePanelError = new Error("side panel unavailable")
    openSidePanelWithFallback.mockRejectedValueOnce(sidePanelError)
    trackerComplete.mockRejectedValueOnce(new Error("analytics unavailable"))

    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    await applyActionClickBehavior("sidepanel")

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]

    await expect(
      clickHandler?.({ id: 123, windowId: 456 } as browser.tabs.Tab),
    ).rejects.toThrow(sidePanelError)

    expect(trackerComplete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      },
    )
  })
})
