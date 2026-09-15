import { act, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { BookmarkTreeSelector } from "~/features/AccountManagement/components/BookmarkAccountImportDialog/BookmarkTreeSelector"

vi.mock("react-arborist", () => ({
  Tree: ({ rowHeight }: { rowHeight: number }) => (
    <div data-testid="virtual-row" style={{ height: rowHeight }} />
  ),
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("updates virtual row offsets when the inherited CSS measurement changes and disconnects", () => {
  let measuredHeight = 34
  let measureRow: (() => void) | undefined
  const disconnects: ReturnType<typeof vi.fn>[] = []
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return {
        height: this.classList.contains("h-(--density-tree-row)")
          ? measuredHeight
          : 240,
      } as DOMRect
    },
  )
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn()
      constructor(private callback: () => void) {
        disconnects.push(this.disconnect)
      }
      observe(element: HTMLElement) {
        if (element.classList.contains("h-(--density-tree-row)"))
          measureRow = this.callback
      }
    },
  )
  const { unmount } = render(
    <BookmarkTreeSelector
      tree={[{ id: "folder", title: "Folder", children: [] }]}
      selectedNodeIds={new Set()}
      onToggleNode={vi.fn()}
      onSetNodeSelection={vi.fn()}
    />,
  )
  expect(screen.getByTestId("virtual-row")).toHaveStyle({ height: "34px" })
  for (const height of [30, 38, 34]) {
    act(() => {
      measuredHeight = height
      measureRow?.()
    })
    expect(screen.getByTestId("virtual-row")).toHaveStyle({
      height: `${height}px`,
    })
  }
  unmount()
  for (const disconnect of disconnects)
    expect(disconnect).toHaveBeenCalledOnce()
})
