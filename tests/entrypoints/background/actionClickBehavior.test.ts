import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"

describe("background applyActionClickBehavior", () => {
  let addActionClickListener: ReturnType<typeof vi.fn>
  let removeActionClickListener: ReturnType<typeof vi.fn>
  let setActionPopup: ReturnType<typeof vi.fn>
  let getSidePanelSupport: ReturnType<typeof vi.fn>
  let openSidePanel: ReturnType<typeof vi.fn>
  let openOrFocusOptionsMenuItem: ReturnType<typeof vi.fn>

  beforeEach(() => {
    addActionClickListener = vi.fn()
    removeActionClickListener = vi.fn()
    setActionPopup = vi.fn().mockResolvedValue(undefined)
    getSidePanelSupport = vi.fn()
    openSidePanel = vi.fn()
    openOrFocusOptionsMenuItem = vi.fn()

    vi.resetModules()

    vi.doMock("~/utils/browserApi", () => ({
      addActionClickListener,
      getSidePanelSupport,
      openSidePanel,
      removeActionClickListener,
      setActionPopup,
    }))

    vi.doMock("~/utils/navigation", () => ({
      openOrFocusOptionsMenuItem,
    }))
  })

  afterEach(() => {
    vi.doUnmock("~/utils/browserApi")
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
    expect(setActionPopup).toHaveBeenCalledWith("popup.html")
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
    expect(setActionPopup).toHaveBeenCalledWith("")
    expect(addActionClickListener).toHaveBeenCalledTimes(1)
  })

  it("falls back to options when openSidePanel throws despite support", async () => {
    getSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    openSidePanel.mockRejectedValueOnce(new Error("fail"))

    const { applyActionClickBehavior } = await import(
      "~/entrypoints/background/actionClickBehavior"
    )

    await applyActionClickBehavior("sidepanel")

    const clickHandler = addActionClickListener.mock.calls[0]?.[0]
    expect(typeof clickHandler).toBe("function")

    await clickHandler?.()

    expect(openOrFocusOptionsMenuItem).toHaveBeenCalledWith(MENU_ITEM_IDS.BASIC)
  })
})
