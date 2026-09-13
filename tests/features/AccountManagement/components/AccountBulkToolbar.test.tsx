import userEvent from "@testing-library/user-event"
import { afterEach, expect, it, vi } from "vitest"

import { AccountBulkToolbar } from "~/features/AccountManagement/components/AccountList/AccountBulkToolbar"
import { act, render, screen } from "~~/tests/test-utils/render"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("keeps selection available when resizing between direct controls and the compact menu", async () => {
  let availableWidth = 0
  let actionsWrapped = false
  let notifyResize = () => {}
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => availableWidth,
  )
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const top =
        this.dataset.testid === "account-bulk-action-group" && actionsWrapped
          ? 40
          : 0
      return new DOMRect(0, top, 120, 28)
    },
  )
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: () => void) {}
      observe(element: HTMLElement) {
        if (element.dataset.testid === "account-bulk-action-group") {
          notifyResize = this.callback
        }
      }
      unobserve() {}
      disconnect() {}
    },
  )
  const onSelectVisible = vi.fn()
  const user = userEvent.setup()
  render(
    <AccountBulkToolbar
      selectedAccounts={[]}
      visibleAccountIds={new Set(["alpha"])}
      isBusy={false}
      isDisabling={false}
      isCopying={false}
      onSelectVisible={onSelectVisible}
      onClearVisible={vi.fn()}
      onClearAll={vi.fn()}
      onDeselect={vi.fn()}
      onDisable={vi.fn()}
      onCopy={vi.fn()}
      onDelete={vi.fn()}
      onExit={vi.fn()}
    />,
  )
  await screen.findByRole("button", { name: "account:bulk.selectionScope" })
  act(() => {
    availableWidth = 600
    notifyResize()
  })
  await user.click(
    screen.getByRole("button", { name: "account:bulk.selectVisible" }),
  )
  expect(onSelectVisible).toHaveBeenCalledTimes(1)
  expect(
    screen.queryByRole("button", { name: "account:bulk.selectionScope" }),
  ).not.toBeInTheDocument()
  const actions = screen.getByTestId("account-bulk-action-group")
  expect(actions).toHaveClass("before:w-px")

  act(() => {
    availableWidth = 220
    actionsWrapped = true
    notifyResize()
  })
  expect(
    screen.queryByRole("button", { name: "account:bulk.selectVisible" }),
  ).not.toBeInTheDocument()
  expect(actions).toHaveClass("before:h-px")
  expect(actions).not.toHaveClass("before:w-px")
  await user.click(
    screen.getByRole("button", { name: "account:bulk.selectionScope" }),
  )
  await user.click(
    screen.getByRole("menuitem", { name: "account:bulk.selectVisible" }),
  )
  expect(onSelectVisible).toHaveBeenCalledTimes(2)

  act(() => {
    availableWidth = 600
    actionsWrapped = false
    notifyResize()
  })
  expect(
    screen.queryByRole("button", { name: "account:bulk.selectionScope" }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole("button", { name: "account:bulk.selectVisible" }),
  ).toBeEnabled()
  expect(actions).toHaveClass("before:w-px")
  expect(actions).not.toHaveClass("before:h-px")
})
