import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("background applyActionClickBehavior", () => {
  let addActionClickListener: ReturnType<typeof vi.fn>
  let removeActionClickListener: ReturnType<typeof vi.fn>
  let setActionPopup: ReturnType<typeof vi.fn>
  let getSidePanelSupport: ReturnType<typeof vi.fn>

  beforeEach(() => {
    addActionClickListener = vi.fn()
    removeActionClickListener = vi.fn()
    setActionPopup = vi.fn().mockResolvedValue(undefined)
    getSidePanelSupport = vi.fn()

    vi.resetModules()

    vi.doMock("~/utils/browserApi", () => ({
      addActionClickListener,
      getSidePanelSupport,
      openSidePanel: vi.fn(),
      removeActionClickListener,
      setActionPopup,
    }))

    vi.doMock("~/utils/navigation", () => ({
      openOrFocusOptionsMenuItem: vi.fn(),
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
})
