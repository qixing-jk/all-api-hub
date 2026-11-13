import { act, render, screen } from "@testing-library/react"
import type { CSSProperties } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useVerificationWorkspaceHeight } from "~/features/Verification/api/useVerificationWorkspaceHeight"

/** Supply browser layout measurements while exercising the hook's DOM boundary. */
function Workspace({
  wide = true,
  limit = "800px",
  composer = false,
  detailHidden = false,
}) {
  const { frameRef, isWide, availableHeight } =
    useVerificationWorkspaceHeight("selected")
  return (
    <div data-slot="modal-panel" style={{ maxHeight: limit }}>
      <div data-slot="modal-body">
        <div
          ref={frameRef}
          data-testid="frame"
          style={
            {
              "--verification-layout": wide ? "split" : "stacked",
            } as CSSProperties
          }
        >
          <div
            data-verification-detail
            hidden={detailHidden}
            style={{
              position: "absolute",
              padding: composer ? 8 : 0,
            }}
          >
            <output>{isWide ? "wide" : "narrow"}</output>
            <output data-testid="available-height">{availableHeight}</output>
            {composer ? (
              <div data-verification-detail-content style={{ rowGap: 8 }}>
                <div data-verification-introduction />
                <div data-testid="composer" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

afterEach(() => vi.restoreAllMocks())

describe("verification workspace height", () => {
  it("measures the viewport while the selected detail is hidden by the tests drawer", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return DOMRect.fromRect({
          y: this.dataset.testid === "frame" ? 250 : 0,
        })
      },
    )
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(700)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600)
    render(<Workspace detailHidden />)
    expect(screen.getByTestId("available-height")).toHaveTextContent("449")
    expect(screen.getByText("wide")).toBeInTheDocument()
    expect(
      screen
        .getByTestId("frame")
        .style.getPropertyValue("--verification-workspace-height"),
    ).toBe("449px")
  })
  it("keeps the frame budget stable while a narrow composer grows", () => {
    let composerHeight = 120
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return DOMRect.fromRect({
          y:
            this.dataset.testid === "frame" ||
            this.hasAttribute("data-verification-detail")
              ? 250
              : 0,
          height: this.dataset.testid === "composer" ? composerHeight : 0,
        })
      },
    )
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.getAttribute("data-slot") === "modal-panel" ? 700 : 400
      },
    )
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600)
    let pending: FrameRequestCallback | undefined
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pending = callback
      return 17
    })
    render(<Workspace wide={false} composer />)
    expect(screen.getByText("narrow")).toBeVisible()
    expect(screen.getByTestId("available-height")).toHaveTextContent("449")
    composerHeight = 250
    act(() => window.dispatchEvent(new Event("resize")))
    act(() => pending!(0))
    expect(screen.getByTestId("available-height")).toHaveTextContent("449")
    expect(
      screen
        .getByTestId("frame")
        .style.getPropertyValue("--verification-workspace-height"),
    ).toBe("449px")
  })
  it("keeps the frame budget stable when the mobile test list collapses", () => {
    let selectorsHeight = 200
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return DOMRect.fromRect({
          y: this.hasAttribute("data-verification-detail")
            ? 250 + selectorsHeight
            : this.dataset.testid === "frame"
              ? 250
              : 0,
        })
      },
    )
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.getAttribute("data-slot") === "modal-panel" ? 700 : 400
      },
    )
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600)
    let pending: FrameRequestCallback | undefined
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pending = callback
      return 17
    })
    render(<Workspace wide={false} />)
    expect(screen.getByText("narrow")).toBeVisible()
    expect(screen.getByTestId("available-height")).toHaveTextContent("449")
    selectorsHeight = 88
    act(() => window.dispatchEvent(new Event("resize")))
    act(() => pending!(0))
    expect(screen.getByTestId("available-height")).toHaveTextContent("449")
    expect(
      screen
        .getByTestId("frame")
        .style.getPropertyValue("--verification-workspace-height"),
    ).toBe("449px")
  })
  it("keeps the narrow height budget stable when a prompt expands", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        // The source fields and toolbar precede the frame; results do not.
        return DOMRect.fromRect({
          y: this.dataset.testid === "frame" ? 350 : 0,
        })
      },
    )
    let frameHeight = 300
    let contentHeight = 650
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.getAttribute("data-slot") === "modal-panel"
          ? 700
          : frameHeight
      },
    )
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600)
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      () => contentHeight,
    )
    let pending: FrameRequestCallback | undefined
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      pending = callback
      return 17
    })
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {})
    render(<Workspace wide={false} />)
    expect(screen.getByTestId("available-height")).toHaveTextContent("349")
    frameHeight += 200
    contentHeight += 200
    act(() => window.dispatchEvent(new Event("resize")))
    act(() => pending!(0))
    expect(screen.getByTestId("available-height")).toHaveTextContent("349")
    expect(screen.getByTestId("frame").style.height).toBe("")
  })

  it("reserves space for dialog controls and remeasures a changed viewport", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return DOMRect.fromRect({
          y: this.dataset.testid === "frame" ? 250 : 0,
        })
      },
    )
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
    const writeHeight = vi.spyOn(frame.style, "setProperty")
    act(() => window.dispatchEvent(new Event("resize")))
    act(() => pending!(0))
    expect(writeHeight).not.toHaveBeenCalled()
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
    // The budget is available to narrow settings, while the result keeps natural height.
    expect(screen.getByTestId("frame").style.height).toBe("")
    expect(screen.getByTestId("available-height")).toHaveTextContent(
      props.limit === "none" ? "0" : "799",
    )
  })
})
