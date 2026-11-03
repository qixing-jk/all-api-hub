import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useModelListHeight } from "~/features/ModelList/presentation/useModelListHeight"

describe("model list height measurements", () => {
  it("coalesces measurements and cancels an unmounted list's pending update", () => {
    let frame: FrameRequestCallback | undefined
    const request = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        frame = callback
        return 42
      })
    const cancel = vi.spyOn(window, "cancelAnimationFrame")
    const { result, unmount } = renderHook(useModelListHeight)
    act(() => {
      result.current.handleListHeightChanged(100)
      result.current.handleListHeightChanged(200)
    })
    expect(request).toHaveBeenCalledTimes(1)
    act(() => frame?.(0))
    expect(result.current.listHeight).toBe(200)
    act(() => result.current.handleListHeightChanged(300))
    unmount()
    expect(cancel).toHaveBeenCalledWith(42)
    request.mockRestore()
    cancel.mockRestore()
  })
})
