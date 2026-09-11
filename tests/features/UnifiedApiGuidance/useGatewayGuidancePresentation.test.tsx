import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useGatewayGuidancePresentation } from "~/features/UnifiedApiGuidance/useGatewayGuidancePresentation"

describe("useGatewayGuidancePresentation", () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, "", "/")
  })
  afterEach(() => {
    document.getElementById("gateway-setup-guide")?.remove()
    window.history.replaceState(null, "", "/")
    vi.restoreAllMocks()
  })

  it("introduces optional setup and keeps preview separate from starting", () => {
    const first = renderHook(() => useGatewayGuidancePresentation(false, false))
    expect(first.result.current).toMatchObject({
      expanded: false,
      started: false,
    })
    act(() => first.result.current.toggle())
    expect(first.result.current.expanded).toBe(true)
    act(() => first.result.current.toggle())
    first.unmount()
    const second = renderHook(() =>
      useGatewayGuidancePresentation(false, false),
    )
    expect(second.result.current).toMatchObject({
      expanded: false,
      started: false,
    })
  })

  it("falls back to optional discovery when saved presentation cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable")
    })
    const { result } = renderHook(() =>
      useGatewayGuidancePresentation(false, false),
    )
    expect(result.current).toMatchObject({ expanded: false, started: false })
    act(() => result.current.toggle())
    expect(result.current.expanded).toBe(true)
  })

  it("keeps preview usable when presentation storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable")
    })
    const { result } = renderHook(() =>
      useGatewayGuidancePresentation(false, false),
    )
    act(() => result.current.toggle())
    expect(result.current).toMatchObject({ expanded: true, started: false })
    act(() => result.current.toggle())
    expect(result.current.expanded).toBe(false)
  })

  it("automatically removes newly completed guidance and allows revisiting it", () => {
    const { result, rerender } = renderHook(
      ({ completed }) => useGatewayGuidancePresentation(completed, true),
      { initialProps: { completed: false } },
    )
    expect(result.current.expanded).toBe(true)
    act(() => result.current.toggle())
    act(() => result.current.toggle())
    rerender({ completed: true })
    expect(result.current.expanded).toBe(false)
    act(() => result.current.toggle())
    expect(result.current.expanded).toBe(true)
  })

  it("opens and focuses a requested completed guide after data loads, without starting setup", () => {
    window.history.replaceState(
      null,
      "",
      "/options.html?gatewayGuide=1&keep=yes#overview",
    )
    localStorage.setItem(
      "gatewayGuidance.overview.presentation",
      JSON.stringify({ completed: true, expanded: false }),
    )
    const guide = document.createElement("div")
    guide.id = "gateway-setup-guide"
    guide.tabIndex = -1
    guide.scrollIntoView = vi.fn()
    document.body.appendChild(guide)
    const { result, rerender, unmount } = renderHook(
      ({ ready }) => useGatewayGuidancePresentation(true, false, ready),
      { initialProps: { ready: false } },
    )
    expect(result.current.expanded).toBe(false)
    rerender({ ready: true })
    expect(result.current.expanded).toBe(true)
    expect(result.current.started).toBe(false)
    expect(document.activeElement).toBe(guide)
    expect(guide.scrollIntoView).toHaveBeenCalled()
    expect(
      new URL(window.location.href).searchParams.get("gatewayGuide"),
    ).toBeNull()
    expect(new URL(window.location.href).searchParams.get("keep")).toBe("yes")
    act(() => result.current.toggle())
    expect(result.current.expanded).toBe(false)
    unmount()
  })
})
