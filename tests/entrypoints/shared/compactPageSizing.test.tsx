import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest"

import { initializeCompactPageSizing } from "~/entrypoints/shared/compactPageSizing"
import { getDeviceTypeInfo, isDesktopDevice } from "~/utils/browser"

const { isPopupMock, isSidePanelMock } = vi.hoisted(() => ({
  isPopupMock: vi.fn(() => false),
  isSidePanelMock: vi.fn(() => false),
}))

vi.mock("~/utils/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser")>()
  return {
    ...actual,
    isExtensionPopup: isPopupMock,
    isExtensionSidePanel: isSidePanelMock,
  }
})

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
)
const originalInnerWidthDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "innerWidth",
)
const originalScreenWidthDescriptor = Object.getOwnPropertyDescriptor(
  screen,
  "width",
)
const originalScreenHeightDescriptor = Object.getOwnPropertyDescriptor(
  screen,
  "height",
)
const baseNavigator = globalThis.navigator

let addEventListenerSpy: MockInstance<typeof window.addEventListener>
let matchMediaSpy: MockInstance<typeof window.matchMedia>

function configureDevice(
  options: {
    userAgent?: string
    mobileHint?: boolean | null
    maxTouchPoints?: number
    screenWidth?: number
    screenHeight?: number
    coarsePointer?: boolean
  } = {},
) {
  const {
    userAgent = "Mozilla/5.0",
    mobileHint,
    maxTouchPoints = 0,
    screenWidth = 1366,
    screenHeight = 768,
    coarsePointer = false,
  } = options
  const navigatorProperties: PropertyDescriptorMap = {
    userAgent: { configurable: true, value: userAgent },
    maxTouchPoints: { configurable: true, value: maxTouchPoints },
  }
  if (typeof mobileHint !== "undefined") {
    navigatorProperties.userAgentData = {
      configurable: true,
      value: { mobile: mobileHint },
    }
  }

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: Object.create(baseNavigator, navigatorProperties),
  })
  Object.defineProperty(screen, "width", {
    configurable: true,
    value: screenWidth,
  })
  Object.defineProperty(screen, "height", {
    configurable: true,
    value: screenHeight,
  })
  matchMediaSpy.mockImplementation((query) => {
    return {
      matches: coarsePointer && query.includes("coarse"),
    } as MediaQueryList
  })
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  })
}

function minWidth() {
  return document.documentElement.style.getPropertyValue(
    "--extension-surface-min-width",
  )
}

beforeEach(() => {
  document.documentElement.removeAttribute("data-compact-extension-page")
  document.documentElement.style.removeProperty("--extension-surface-min-width")
  isPopupMock.mockReturnValue(true)
  isSidePanelMock.mockReturnValue(false)
  addEventListenerSpy = vi.spyOn(window, "addEventListener")
  matchMediaSpy = vi.spyOn(window, "matchMedia")
  configureDevice()
})

afterEach(() => {
  for (const [type, listener, options] of addEventListenerSpy.mock.calls) {
    if (type === "resize") {
      window.removeEventListener("resize", listener as EventListener, options)
    }
  }
  vi.restoreAllMocks()

  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor)
  } else {
    Reflect.deleteProperty(globalThis, "navigator")
  }
  if (originalInnerWidthDescriptor) {
    Object.defineProperty(window, "innerWidth", originalInnerWidthDescriptor)
  } else {
    Reflect.deleteProperty(window, "innerWidth")
  }
  if (originalScreenWidthDescriptor) {
    Object.defineProperty(screen, "width", originalScreenWidthDescriptor)
  } else {
    Reflect.deleteProperty(screen, "width")
  }
  if (originalScreenHeightDescriptor) {
    Object.defineProperty(screen, "height", originalScreenHeightDescriptor)
  } else {
    Reflect.deleteProperty(screen, "height")
  }
  document.documentElement.removeAttribute("data-compact-extension-page")
  document.documentElement.style.removeProperty("--extension-surface-min-width")
})

describe("initializeCompactPageSizing", () => {
  it("waits out the initial sliver, then follows usable and narrowed popup widths", () => {
    configureDevice({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
      mobileHint: true,
      maxTouchPoints: 5,
      screenWidth: 412,
      screenHeight: 915,
    })
    setViewportWidth(20)

    initializeCompactPageSizing()

    expect(document.documentElement).toHaveAttribute(
      "data-compact-extension-page",
      "mobile",
    )
    expect(minWidth()).toBe("")

    setViewportWidth(0)
    window.dispatchEvent(new Event("resize"))
    expect(minWidth()).toBe("")

    setViewportWidth(48)
    window.dispatchEvent(new Event("resize"))
    expect(minWidth()).toBe("")

    setViewportWidth(180)
    window.dispatchEvent(new Event("resize"))
    expect(minWidth()).toBe("180px")

    setViewportWidth(48)
    window.dispatchEvent(new Event("resize"))
    expect(minWidth()).toBe("48px")

    setViewportWidth(0)
    window.dispatchEvent(new Event("resize"))
    expect(minWidth()).toBe("48px")
  })

  it("applies to an initially usable narrow side panel", () => {
    isPopupMock.mockReturnValue(false)
    isSidePanelMock.mockReturnValue(true)
    configureDevice({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      mobileHint: true,
      maxTouchPoints: 5,
      screenWidth: 390,
      screenHeight: 844,
    })
    setViewportWidth(80)

    initializeCompactPageSizing()

    expect(document.documentElement).toHaveAttribute(
      "data-compact-extension-page",
      "mobile",
    )
    expect(minWidth()).toBe("80px")
  })

  it.each(["popup", "sidepanel"])(
    "avoids redundant style writes when the mobile %s width constraint is unchanged",
    (surface) => {
      isPopupMock.mockReturnValue(surface === "popup")
      isSidePanelMock.mockReturnValue(surface === "sidepanel")
      configureDevice({ userAgent: "Android Mobile", mobileHint: true })
      setViewportWidth(390)
      initializeCompactPageSizing()
      expect(minWidth()).toBe("320px")

      const setPropertySpy = vi.spyOn(
        document.documentElement.style,
        "setProperty",
      )

      for (const width of [390, 820, 600]) {
        setViewportWidth(width)
        window.dispatchEvent(new Event("resize"))
      }
      expect(setPropertySpy).not.toHaveBeenCalled()

      setViewportWidth(180)
      window.dispatchEvent(new Event("resize"))
      expect(minWidth()).toBe("180px")
      expect(setPropertySpy).toHaveBeenCalledTimes(1)

      for (const width of [180, 0]) {
        setViewportWidth(width)
        window.dispatchEvent(new Event("resize"))
      }
      expect(minWidth()).toBe("180px")
      expect(setPropertySpy).toHaveBeenCalledTimes(1)

      setViewportWidth(390)
      window.dispatchEvent(new Event("resize"))
      expect(minWidth()).toBe("320px")
      expect(setPropertySpy).toHaveBeenCalledTimes(2)
    },
  )

  it("leaves desktop popup sizing untouched", () => {
    configureDevice({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0",
      maxTouchPoints: 0,
      screenWidth: 1920,
      screenHeight: 1080,
    })
    setViewportWidth(300)

    expect(isDesktopDevice()).toBe(true)
    initializeCompactPageSizing()

    expect(document.documentElement).not.toHaveAttribute(
      "data-compact-extension-page",
    )
    expect(minWidth()).toBe("")
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    )
  })

  it("does not resize a touch Windows host when client hints are unavailable", () => {
    configureDevice({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0",
      maxTouchPoints: 10,
      screenWidth: 1220,
      screenHeight: 686,
      coarsePointer: true,
    })
    setViewportWidth(300)

    expect(getDeviceTypeInfo()).toMatchObject({
      type: "mobile",
      isMobile: true,
      isTouchDevice: true,
    })
    initializeCompactPageSizing()

    expect(document.documentElement).not.toHaveAttribute(
      "data-compact-extension-page",
    )
    expect(minWidth()).toBe("")
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    )
  })

  it("has no effect on the options page", () => {
    isPopupMock.mockReturnValue(false)
    isSidePanelMock.mockReturnValue(false)
    configureDevice({
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
      mobileHint: true,
      maxTouchPoints: 5,
      screenWidth: 412,
      screenHeight: 915,
    })
    setViewportWidth(300)

    initializeCompactPageSizing()

    expect(document.documentElement).not.toHaveAttribute(
      "data-compact-extension-page",
    )
    expect(minWidth()).toBe("")
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    )
  })
})
