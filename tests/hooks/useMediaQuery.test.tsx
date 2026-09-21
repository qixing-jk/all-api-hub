import { renderHook } from "@testing-library/react"
import { act } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  useIsDesktop,
  useIsMobile,
  useIsSmallScreen,
  useMediaQuery,
} from "~/hooks/useMediaQuery"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

describe("useMediaQuery", () => {
  let matchMediaMock: any
  let addEventListenerMock: ReturnType<typeof vi.fn>
  let removeEventListenerMock: ReturnType<typeof vi.fn>
  let addListenerMock: ReturnType<typeof vi.fn>
  let removeListenerMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    addEventListenerMock = vi.fn()
    removeEventListenerMock = vi.fn()
    addListenerMock = vi.fn()
    removeListenerMock = vi.fn()
    matchMediaMock = vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
      addListener: addListenerMock,
      removeListener: removeListenerMock,
      dispatchEvent: vi.fn(),
    }))
    window.matchMedia = matchMediaMock
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns false when media query does not match", () => {
    const { result } = renderHook(() => useMediaQuery("(max-width: 1px)"))
    expect(result.current).toBe(false)
  })

  it("returns true when media query matches", () => {
    matchMediaMock.mockReturnValue({
      matches: true,
      media: "(max-width: 1px)",
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })
    const { result } = renderHook(() => useMediaQuery("(max-width: 1px)"))
    expect(result.current).toBe(true)
  })

  it("registers event listener on mount", () => {
    renderHook(() => useMediaQuery("(max-width: 1px)"))
    expect(addEventListenerMock).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    )
  })

  it("cleans up event listeners on unmount", () => {
    const { unmount } = renderHook(() => useMediaQuery("(max-width: 768px)"))
    unmount()
    expect(removeEventListenerMock).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    )
  })

  it("updates when media query match changes", async () => {
    const { result } = renderHook(() => useMediaQuery("(max-width: 1px)"))
    expect(result.current).toBe(false)

    const changeHandler = atIndex(addEventListenerMock.mock.calls, 0)[1]

    // Wrap the state update in act to ensure React processes it
    await act(async () => {
      changeHandler({ matches: true } as MediaQueryListEvent)
    })

    expect(result.current).toBe(true)
  })

  it("falls back to legacy media query listeners when addEventListener is unavailable", async () => {
    matchMediaMock.mockReturnValue({
      matches: false,
      media: "(max-width: 1px)",
      addEventListener: undefined,
      removeEventListener: undefined,
      addListener: addListenerMock,
      removeListener: removeListenerMock,
      dispatchEvent: vi.fn(),
    })

    const { result, unmount } = renderHook(() =>
      useMediaQuery("(max-width: 1px)"),
    )

    expect(addListenerMock).toHaveBeenCalledWith(expect.any(Function))

    const changeHandler = atIndex(addListenerMock.mock.calls, 0)[0]

    await act(async () => {
      changeHandler({ matches: true } as MediaQueryListEvent)
    })

    expect(result.current).toBe(true)

    unmount()

    expect(removeListenerMock).toHaveBeenCalledWith(changeHandler)
  })

  describe("predefined breakpoint hooks", () => {
    it("useIsMobile uses correct media query", () => {
      renderHook(() => useIsMobile())
      expect(matchMediaMock).toHaveBeenCalledWith("(max-width: 767px)")
    })

    it("useIsDesktop uses correct media query", () => {
      renderHook(() => useIsDesktop())
      expect(matchMediaMock).toHaveBeenCalledWith("(min-width: 1024px)")
    })

    it("useIsSmallScreen uses correct media query", () => {
      renderHook(() => useIsSmallScreen())
      expect(matchMediaMock).toHaveBeenCalledWith("(max-width: 639px)")
    })
  })
})
