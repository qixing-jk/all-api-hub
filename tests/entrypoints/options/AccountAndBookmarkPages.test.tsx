import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fireEvent, render, screen } from "~/tests/test-utils/render"

const openAddAccountMock = vi.fn()

vi.mock("~/features/AccountManagement/hooks/AccountManagementProvider", () => ({
  AccountManagementProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openAddAccount: openAddAccountMock,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  AccountDataProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useAccountDataContext: () => ({
    displayData: [],
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
  useAccountActionsContext: () => ({
    handleOpenExternalCheckIns: vi.fn(),
  }),
}))

vi.mock("~/features/AccountManagement/components/AccountList", () => ({
  default: () => <div>AccountList</div>,
}))

vi.mock("~/features/SiteBookmarks/components/BookmarksList", () => ({
  default: () => <div>BookmarksList</div>,
}))

vi.mock("~/features/SiteBookmarks/components/BookmarkDialog", () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>BookmarkDialogOpen</div> : null,
}))

beforeEach(() => {
  openAddAccountMock.mockReset()
})

describe("options AccountManagement page", () => {
  it("renders accounts view and opens add account dialog", async () => {
    const { default: AccountManagement } = await import(
      "~/entrypoints/options/pages/AccountManagement"
    )

    render(<AccountManagement />)

    expect(await screen.findByText("AccountList")).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("button", { name: "account:addAccount" }),
    )
    expect(openAddAccountMock).toHaveBeenCalledTimes(1)

    expect(
      screen.queryByRole("button", { name: "bookmark:switch.bookmarks" }),
    ).not.toBeInTheDocument()
  })
})

describe("options BookmarkManagement page", () => {
  it("renders bookmarks view and opens bookmark dialog", async () => {
    const { default: BookmarkManagement } = await import(
      "~/entrypoints/options/pages/BookmarkManagement"
    )

    render(<BookmarkManagement />)

    expect(await screen.findByText("BookmarksList")).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("button", { name: "bookmark:actions.add" }),
    )
    expect(await screen.findByText("BookmarkDialogOpen")).toBeInTheDocument()
  })
})
