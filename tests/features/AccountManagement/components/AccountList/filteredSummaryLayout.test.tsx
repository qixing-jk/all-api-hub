import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useFilteredSummaryLabelHeight } from "~/features/AccountManagement/components/AccountList/filteredSummaryLayout"

let resize: () => void
const disconnect = vi.fn()
const observe = vi.fn()

function Columns({
  tall = true,
  visible = true,
  cashflow = true,
  language = "en",
  minimum = true,
}) {
  const ref = useFilteredSummaryLabelHeight(cashflow, language)
  if (!visible) return null
  return (
    <div ref={ref} role="region" aria-label="Financial metrics">
      {["Balance", "Consumption", "Income"].map((name, index) => (
        <div key={name} role="group" aria-label={name}>
          <span
            data-filtered-summary-label=""
            style={{ minHeight: minimum ? "32px" : undefined }}
          >
            <span data-height={tall && index === 1 ? 48 : 16}>{name}</span>
          </span>
          <span>$7.00</span>
        </div>
      ))}
    </div>
  )
}

describe("filtered summary label rows", () => {
  beforeEach(() => {
    vi.stubGlobal("CSS", { supports: vi.fn(() => false) })
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback
        }
        observe = observe
        disconnect = disconnect
      },
    )
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return { height: Number(this.dataset.height ?? 0) } as DOMRect
      },
    )
    observe.mockClear()
    disconnect.mockClear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("shares the tallest intrinsic label and shrinks again when wrapping changes", () => {
    const { rerender, unmount } = render(<Columns />)
    const grid = screen.getByRole("region", { name: "Financial metrics" })
    expect(grid.style.getPropertyValue("--filtered-summary-label-height")).toBe(
      "48px",
    )
    expect(screen.getByRole("group", { name: "Consumption" })).toBeVisible()
    rerender(<Columns tall={false} />)
    act(() => resize())
    expect(grid.style.getPropertyValue("--filtered-summary-label-height")).toBe(
      "32px",
    )
    act(() => resize())
    expect(grid.style.getPropertyValue("--filtered-summary-label-height")).toBe(
      "32px",
    )
    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it("replaces observers when language or visible metrics change", () => {
    const { rerender } = render(<Columns />)
    rerender(<Columns language="ja" cashflow={false} />)
    expect(disconnect).toHaveBeenCalledOnce()
    expect(
      screen
        .getByRole("region")
        .style.getPropertyValue("--filtered-summary-label-height"),
    ).toBe("48px")
  })

  it("leaves native subgrid sizing to the browser", () => {
    vi.mocked(CSS.supports).mockReturnValue(true)
    render(<Columns />)
    expect(observe).not.toHaveBeenCalled()
    expect(
      screen
        .getByRole("region")
        .style.getPropertyValue("--filtered-summary-label-height"),
    ).toBe("")
  })

  it("does not observe an absent grid", () => {
    render(<Columns visible={false} />)
    expect(observe).not.toHaveBeenCalled()
  })

  it("uses intrinsic label height when no minimum or CSS support API applies", () => {
    vi.stubGlobal("CSS", undefined)
    render(<Columns tall={false} minimum={false} />)
    expect(
      screen
        .getByRole("region")
        .style.getPropertyValue("--filtered-summary-label-height"),
    ).toBe("16px")
  })
})
