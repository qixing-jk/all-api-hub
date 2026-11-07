import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useVerificationWorkspaceHeight } from "~/features/Verification/api/useVerificationWorkspaceHeight"

/** Supply browser layout measurements while exercising the hook's DOM boundary. */
function Workspace({ wide = true, limit = "800px" }) {
  const { frameRef, isWide } = useVerificationWorkspaceHeight("selected")
  return (
    <div data-slot="modal-panel" style={{ maxHeight: limit }}>
      <div data-slot="modal-body">
        <div ref={frameRef} data-testid="frame">
          <div
            data-verification-detail
            style={{ position: wide ? "absolute" : "static" }}
          >
            <output>{isWide ? "wide" : "narrow"}</output>
          </div>
        </div>
      </div>
    </div>
  )
}

afterEach(() => vi.restoreAllMocks())

describe("verification workspace height", () => {
  it("reserves space for dialog controls and remeasures a changed viewport", () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.getAttribute("data-slot") === "modal-panel" ? 700 : 400
      },
    )
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600)
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(650)
    let pending: FrameRequestCallback | undefined
    const request = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        pending = callback
        return 17
      })
    const cancel = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => {})
    const { unmount } = render(<Workspace />)
    const frame = screen.getByTestId("frame")
    expect(screen.getByText("wide")).toBeVisible()
    // 800 max - 100 dialog controls - 250 configuration - 1 rounding guard.
    expect(
      frame.style.getPropertyValue("--verification-workspace-height"),
    ).toBe("449px")
    const shell = frame.closest<HTMLElement>('[data-slot="modal-panel"]')!
    shell.style.maxHeight = "900px"
    act(() => {
      window.dispatchEvent(new Event("resize"))
      window.dispatchEvent(new Event("resize"))
    })
    expect(request).toHaveBeenCalledOnce()
    act(() => pending!(0))
    expect(
      frame.style.getPropertyValue("--verification-workspace-height"),
    ).toBe("549px")
    // Even a configuration taller than the available body retains an operable area.
    shell.style.maxHeight = "200px"
    act(() => window.dispatchEvent(new Event("resize")))
    act(() => pending!(0))
    expect(
      frame.style.getPropertyValue("--verification-workspace-height"),
    ).toBe("99px")
    act(() => window.dispatchEvent(new Event("resize")))
    unmount()
    expect(cancel).toHaveBeenCalledWith(17)
  })

  it.each([
    { wide: false, limit: "800px" },
    { wide: true, limit: "none" },
  ])("leaves natural height for $wide / $limit", (props) => {
    render(<Workspace {...props} />)
    expect(
      screen
        .getByTestId("frame")
        .style.getPropertyValue("--verification-workspace-height"),
    ).toBe("")
  })
})
