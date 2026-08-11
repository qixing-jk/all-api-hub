import { act, render, screen } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  calculateRepairResultListMaxHeight,
  useRepairResultListMaxHeight,
} from "~/features/KeyManagement/components/RepairMissingKeysDialog/useRepairResultListMaxHeight"

function rect(top: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left: 0,
    right: 0,
    top,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }
}

function HeightHarness() {
  const resultListRef = useRef<HTMLDivElement | null>(null)
  const maxHeight = useRepairResultListMaxHeight(resultListRef)

  return (
    <div data-slot="modal-panel" data-layout="panel" style={{ maxHeight: 648 }}>
      <div data-layout="header" />
      <div
        data-slot="modal-body"
        data-layout="body"
        style={{ paddingBottom: 24 }}
      >
        <div data-layout="content-root">
          <div
            ref={resultListRef}
            data-layout="result-list"
            style={maxHeight === null ? undefined : { maxHeight }}
          >
            Results
          </div>
        </div>
      </div>
      <div data-layout="footer" />
    </div>
  )
}

describe("useRepairResultListMaxHeight", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("subtracts the measured upper content, footer, and body padding", () => {
    expect(
      calculateRepairResultListMaxHeight({
        bodyPaddingBottom: 24,
        footerHeight: 44,
        listOffsetTop: 464,
        modalMaxHeight: 648,
        trailingContentHeight: 1,
      }),
    ).toBe(115)
  })

  it("updates the result list when the measured upper content changes", async () => {
    let resultListTop = 500
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        switch (this.dataset.layout) {
          case "panel":
            return rect(36, 648)
          case "result-list":
            return rect(resultListTop, 800)
          case "content-root":
            return rect(100, resultListTop + 701)
          case "footer":
            return rect(640, 44)
          default:
            return rect(0, 0)
        }
      },
    )

    render(<HeightHarness />)

    const resultList = await screen.findByText("Results")
    expect(resultList).toHaveStyle({ maxHeight: "115px" })

    resultListTop = 520
    act(() => window.dispatchEvent(new Event("resize")))

    expect(resultList).toHaveStyle({ maxHeight: "95px" })
  })
})
