import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { createRootMock, isMobileDeviceMock, renderMock, setDocumentTitleMock } =
  vi.hoisted(() => {
    const renderMock = vi.fn()
    return {
      createRootMock: vi.fn(() => ({ render: renderMock })),
      isMobileDeviceMock: vi.fn(),
      renderMock,
      setDocumentTitleMock: vi.fn(),
    }
  })

vi.mock("react-dom/client", () => ({
  default: { createRoot: createRootMock },
}))
vi.mock("~/components/RootErrorBoundary", () => ({
  RootErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock("~/entrypoints/popup/App", () => ({ default: () => null }))
vi.mock("~/utils/browser", () => ({ isMobileDevice: isMobileDeviceMock }))
vi.mock("~/utils/i18n", () => ({}))
vi.mock("~/utils/i18n/core", () => ({ t: vi.fn(() => "Loading") }))
vi.mock("~/utils/navigation/documentTitle", () => ({
  setDocumentTitle: setDocumentTitleMock,
}))

const POPUP_WIDTH_PROPERTY = "--extension-popup-width"
const POPUP_HEIGHT_PROPERTY = "--extension-popup-height"
const originalViewport = {
  height: window.innerHeight,
  width: window.innerWidth,
}
let resizeListener: EventListener | undefined

function setViewportSize(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  })
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  })
}

describe("popup entrypoint sizing", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    document.body.innerHTML = '<div id="root"></div>'
    document.documentElement.classList.remove("desktop-extension-popup")
    document.documentElement.style.removeProperty(POPUP_WIDTH_PROPERTY)
    document.documentElement.style.removeProperty(POPUP_HEIGHT_PROPERTY)
    setViewportSize(500, 700)
  })

  afterEach(() => {
    if (resizeListener) {
      window.removeEventListener("resize", resizeListener)
      resizeListener = undefined
    }
    document.documentElement.classList.remove("desktop-extension-popup")
    document.documentElement.style.removeProperty(POPUP_WIDTH_PROPERTY)
    document.documentElement.style.removeProperty(POPUP_HEIGHT_PROPERTY)
    setViewportSize(originalViewport.width, originalViewport.height)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("seeds and clamps the desktop action popup to the usable viewport", async () => {
    let animationFrameCallback: FrameRequestCallback | undefined
    isMobileDeviceMock.mockReturnValue(false)
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        animationFrameCallback = callback
        return 1
      }),
    )
    const addEventListenerSpy = vi.spyOn(window, "addEventListener")

    await import("~/entrypoints/popup/main")

    expect(setDocumentTitleMock).toHaveBeenCalledWith("popup")
    expect(document.documentElement).toHaveClass("desktop-extension-popup")
    expect(
      document.documentElement.style.getPropertyValue(POPUP_WIDTH_PROPERTY),
    ).toBe("410px")
    expect(
      document.documentElement.style.getPropertyValue(POPUP_HEIGHT_PROPERTY),
    ).toBe("600px")

    setViewportSize(320, 480)
    animationFrameCallback?.(0)
    expect(
      document.documentElement.style.getPropertyValue(POPUP_WIDTH_PROPERTY),
    ).toBe("320px")
    expect(
      document.documentElement.style.getPropertyValue(POPUP_HEIGHT_PROPERTY),
    ).toBe("480px")

    resizeListener = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === "resize",
    )?.[1] as EventListener | undefined
    expect(resizeListener).toBeDefined()
    setViewportSize(350, 550)
    resizeListener?.(new Event("resize"))
    expect(
      document.documentElement.style.getPropertyValue(POPUP_WIDTH_PROPERTY),
    ).toBe("350px")
    expect(
      document.documentElement.style.getPropertyValue(POPUP_HEIGHT_PROPERTY),
    ).toBe("550px")

    setViewportSize(100, 100)
    resizeListener?.(new Event("resize"))
    expect(
      document.documentElement.style.getPropertyValue(POPUP_WIDTH_PROPERTY),
    ).toBe("350px")
    expect(
      document.documentElement.style.getPropertyValue(POPUP_HEIGHT_PROPERTY),
    ).toBe("550px")
    expect(createRootMock).toHaveBeenCalledWith(document.getElementById("root"))
    expect(renderMock).toHaveBeenCalledOnce()
  })

  it("does not apply desktop popup sizing on mobile", async () => {
    isMobileDeviceMock.mockReturnValue(true)
    const requestAnimationFrameMock = vi.fn()
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock)

    await import("~/entrypoints/popup/main")

    expect(document.documentElement).not.toHaveClass("desktop-extension-popup")
    expect(
      document.documentElement.style.getPropertyValue(POPUP_WIDTH_PROPERTY),
    ).toBe("")
    expect(
      document.documentElement.style.getPropertyValue(POPUP_HEIGHT_PROPERTY),
    ).toBe("")
    expect(requestAnimationFrameMock).not.toHaveBeenCalled()
    expect(renderMock).toHaveBeenCalledOnce()
  })
})
