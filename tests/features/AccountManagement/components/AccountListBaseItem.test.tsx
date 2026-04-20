import { fireEvent, render, screen } from "@testing-library/react"
import React from "react"
import { describe, expect, it, vi } from "vitest"

import { NonSortableAccountListItem } from "~/features/AccountManagement/components/AccountList/AccountListBaseItem"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

vi.mock("~/components/ui", () => ({
  CardItem: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  IconButton: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}))

vi.mock("~/contexts/DeviceContext", () => ({
  DeviceProvider: ({ children }: any) => children,
  useDevice: () => ({
    isTouchDevice: false,
  }),
}))

vi.mock("~/features/AccountManagement/components/AccountActionButtons", () => ({
  default: () => <div />,
}))

vi.mock(
  "~/features/AccountManagement/components/AccountList/BalanceDisplay",
  () => ({
    default: () => <div />,
  }),
)

vi.mock("~/features/AccountManagement/components/AccountList/SiteInfo", () => ({
  default: ({ site }: any) => <div>{site.name}</div>,
}))

const site = buildDisplaySiteData({
  id: "acc-1",
  name: "Alpha",
})

function renderItem(
  overrides: Partial<
    React.ComponentProps<typeof NonSortableAccountListItem>
  > = {},
) {
  const onActivateDnd = overrides.onActivateDnd ?? vi.fn()

  render(
    <NonSortableAccountListItem
      site={site}
      onCopyKey={vi.fn()}
      onDeleteWithDialog={vi.fn()}
      isDragDisabled={false}
      handleLabel="Activate drag"
      showHandle={true}
      onActivateDnd={onActivateDnd}
      {...overrides}
    />,
  )

  return {
    onActivateDnd,
  }
}

describe("NonSortableAccountListItem", () => {
  it("activates dnd from each supported handle interaction", () => {
    const { onActivateDnd } = renderItem()

    const handle = screen.getByRole("button", { name: "Activate drag" })

    fireEvent.click(handle)
    fireEvent.focus(handle)
    fireEvent.mouseEnter(handle)
    fireEvent.pointerDown(handle)
    fireEvent.touchStart(handle)

    expect(onActivateDnd).toHaveBeenCalledTimes(5)
  })

  it("does not render a handle when handle display is disabled", () => {
    const { onActivateDnd } = renderItem({
      showHandle: false,
    })

    expect(
      screen.queryByRole("button", { name: "Activate drag" }),
    ).not.toBeInTheDocument()
    expect(onActivateDnd).not.toHaveBeenCalled()
  })

  it("does not activate dnd when the handle is disabled", () => {
    const { onActivateDnd } = renderItem({
      isDragDisabled: true,
    })

    const handle = screen.getByRole("button", { name: "Activate drag" })

    expect(handle).toBeDisabled()

    fireEvent.click(handle)
    fireEvent.focus(handle)
    fireEvent.mouseEnter(handle)
    fireEvent.pointerDown(handle)
    fireEvent.touchStart(handle)

    expect(onActivateDnd).not.toHaveBeenCalled()
  })

  it("ignores handle interactions when no activation callback is provided", () => {
    renderItem({
      onActivateDnd: undefined,
    })

    const handle = screen.getByRole("button", { name: "Activate drag" })

    fireEvent.click(handle)
    fireEvent.focus(handle)
    fireEvent.mouseEnter(handle)
    fireEvent.pointerDown(handle)
    fireEvent.touchStart(handle)

    expect(handle).toBeInTheDocument()
  })
})
