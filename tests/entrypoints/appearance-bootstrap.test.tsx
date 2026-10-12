import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import appearanceEntrypoint from "~/entrypoints/appearance-bootstrap"
import { createDeferred } from "~~/tests/test-utils/deferred"

const {
  bootstrapAppearanceMock,
  isDesktopDeviceMock,
  isExtensionPopupMock,
  isExtensionSidePanelMock,
} = vi.hoisted(() => ({
  bootstrapAppearanceMock: vi.fn(),
  isDesktopDeviceMock: vi.fn(),
  isExtensionPopupMock: vi.fn(),
  isExtensionSidePanelMock: vi.fn(),
}))

vi.mock("~/utils/browser", () => ({
  isDesktopDevice: isDesktopDeviceMock,
  isExtensionPopup: isExtensionPopupMock,
  isExtensionSidePanel: isExtensionSidePanelMock,
}))
vi.mock("~/utils/ui/bootstrapAppearance", () => ({
  bootstrapAppearance: bootstrapAppearanceMock,
}))

const WIDTH_PROPERTY = "--extension-surface-min-width"
const originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth")!

describe("appearance entrypoint", () => {
  let addedListeners: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    isExtensionPopupMock.mockReturnValue(true)
    isExtensionSidePanelMock.mockReturnValue(false)
    isDesktopDeviceMock.mockReturnValue(false)
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android Mobile")
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 20,
    })
    addedListeners = vi.spyOn(window, "addEventListener")
    document.documentElement.removeAttribute("data-compact-extension-page")
    document.documentElement.style.removeProperty(WIDTH_PROPERTY)
  })

  afterEach(() => {
    for (const [event, listener] of addedListeners.mock.calls) {
      if (event === "resize") {
        window.removeEventListener(event, listener as EventListener)
      }
    }
    document.documentElement.removeAttribute("data-compact-extension-page")
    document.documentElement.style.removeProperty(WIDTH_PROPERTY)
    Object.defineProperty(window, "innerWidth", originalWidth)
    vi.restoreAllMocks()
  })

  it.each(["popup", "sidepanel"])(
    "seeds the mobile %s before asynchronous appearance loading starts",
    (surface) => {
      isExtensionPopupMock.mockReturnValue(surface === "popup")
      isExtensionSidePanelMock.mockReturnValue(surface === "sidepanel")
      const appearanceReady = createDeferred<void>()
      bootstrapAppearanceMock.mockImplementation(() => {
        // Appearance loading can wait on extension storage. Mobile sizing must
        // already be active at this point, before its promise settles.
        expect(document.documentElement.dataset.compactExtensionPage).toBe(
          "mobile",
        )
        expect(
          document.documentElement.style.getPropertyValue(WIDTH_PROPERTY),
        ).toBe("")
        return appearanceReady.promise
      })

      appearanceEntrypoint.main()
      expect(bootstrapAppearanceMock).toHaveBeenCalledOnce()
      appearanceReady.resolve()
    },
  )

  it.each(["desktop popup", "options page"])(
    "still starts appearance loading without changing sizing on a %s",
    (surface) => {
      isDesktopDeviceMock.mockReturnValue(surface === "desktop popup")
      isExtensionPopupMock.mockReturnValue(surface === "desktop popup")
      document.documentElement.style.setProperty(WIDTH_PROPERTY, "410px")
      bootstrapAppearanceMock.mockResolvedValue(undefined)

      appearanceEntrypoint.main()

      expect(bootstrapAppearanceMock).toHaveBeenCalledOnce()
      expect(
        document.documentElement.dataset.compactExtensionPage,
      ).toBeUndefined()
      expect(
        document.documentElement.style.getPropertyValue(WIDTH_PROPERTY),
      ).toBe("410px")
    },
  )
})
