import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { POPUP_PAGE_PATH } from "~/constants/extensionPages"

describe("background applyActionClickBehavior", () => {
  let addActionClickListener: ReturnType<typeof vi.fn>
  let removeActionClickListener: ReturnType<typeof vi.fn>
  let setActionPopup: ReturnType<typeof vi.fn>
  let getSidePanelSupport: ReturnType<typeof vi.fn>
  let openSidePanelWithFallback: ReturnType<typeof vi.fn>
  let setPanelBehavior: ReturnType<typeof vi.fn>

  beforeEach(() => {
    addActionClickListener = vi.fn()
    removeActionClickListener = vi.fn()
    setActionPopup = vi.fn().mockResolvedValue(undefined)
    getSidePanelSupport = vi.fn()
    openSidePanelWithFallback = vi.fn().mockResolvedValue(undefined)
    setPanelBehavior = vi.fn().mockResolvedValue(undefined)
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
  })

  afterEach(() => {
    ;(globalThis as any).chrome = undefined
    vi.doUnmock("~/utils/browser/browserApi")
    vi.doUnmock("~/utils/navigation")
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

    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    await applyActionClickBehavior("sidepanel")

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    expect(typeof clickHandler).toBe("function")

    await clickHandler?.()

    expect(openSidePanelWithFallback).toHaveBeenCalledTimes(1)
  })
})
