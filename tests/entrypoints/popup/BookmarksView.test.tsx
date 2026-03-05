import {
  forwardRef,
  useImperativeHandle,
  useState,
  type ReactNode,
} from "react"
import { describe, expect, it, vi } from "vitest"

import { BookmarkDialogStateProvider } from "~/features/SiteBookmarks/hooks/BookmarkDialogStateContext"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

vi.mock("~/components/AppLayout", () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("~/features/AccountManagement/hooks/AccountManagementProvider", () => ({
  AccountManagementProvider: ({ children }: { children: ReactNode }) => (
    <BookmarkDialogStateProvider>{children}</BookmarkDialogStateProvider>
  ),
}))

vi.mock("~/utils/browser", () => ({
  isExtensionSidePanel: () => false,
  isMobileByUA: () => false,
}))

vi.mock("~/hooks/useAddAccountHandler", () => ({
  useAddAccountHandler: () => ({
    handleAddAccountClick: vi.fn(),
  }),
}))

vi.mock("~/entrypoints/popup/components/HeaderSection", () => ({
  default: ({ showRefresh }: { showRefresh?: boolean }) => (
    <div>{`HeaderRefresh:${String(showRefresh)}`}</div>
  ),
}))

vi.mock("~/entrypoints/popup/components/BalanceSection", () => ({
  default: () => <div>BalanceSection</div>,
}))

vi.mock("~/entrypoints/popup/components/ShareOverviewSnapshotButton", () => ({
  default: () => <div>ShareOverviewSnapshotButton</div>,
}))

vi.mock("~/entrypoints/popup/components/BookmarkStatsSection", () => ({
  default: () => <div>BookmarkStatsSection</div>,
}))

vi.mock(
  "~/entrypoints/popup/components/ApiCredentialProfilesStatsSection",
  () => ({
    default: () => <div>ApiCredentialProfilesStatsSection</div>,
  }),
)

vi.mock("~/entrypoints/popup/components/ActionButtons", () => ({
  default: ({
    primaryActionLabel,
    onPrimaryAction,
  }: {
    primaryActionLabel: string
    onPrimaryAction: () => void
  }) => (
    <div>
      <div>ActionButtons</div>
      <button onClick={onPrimaryAction}>{primaryActionLabel}</button>
    </div>
  ),
}))

vi.mock("~/features/AccountManagement/components/AccountList", () => ({
  default: () => <div>AccountList</div>,
}))

vi.mock("~/features/SiteBookmarks/components/BookmarksList", () => ({
  default: () => <div>BookmarksList</div>,
}))

vi.mock(
  "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesPopupView",
  () => ({
    default: forwardRef((_, ref) => {
      const [isAddOpen, setIsAddOpen] = useState(false)
      useImperativeHandle(
        ref,
        () => ({
          openAddDialog: () => setIsAddOpen(true),
        }),
        [],
      )

      return (
        <div>
          <div>ApiCredentialProfilesPopupView</div>
          {isAddOpen ? <div>ApiCredentialProfileDialogOpen</div> : null}
        </div>
      )
    }),
  }),
)

vi.mock("~/features/SiteBookmarks/components/BookmarkDialog", () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>BookmarkDialogOpen</div> : null,
}))

describe("popup bookmarks view", () => {
  it("switches between accounts, bookmarks, and api credentials layouts", async () => {
    const { default: App } = await import("~/entrypoints/popup/App")

    render(<App />)

    expect(await screen.findByText("HeaderRefresh:true")).toBeInTheDocument()
    expect(screen.getByText("BalanceSection")).toBeInTheDocument()
    expect(screen.queryByText("BookmarkStatsSection")).not.toBeInTheDocument()
    expect(
      screen.queryByText("ApiCredentialProfilesStatsSection"),
    ).not.toBeInTheDocument()
    expect(screen.getByText("ActionButtons")).toBeInTheDocument()
    expect(screen.getByText("AccountList")).toBeInTheDocument()
    expect(screen.queryByText("BookmarksList")).not.toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("tab", { name: "bookmark:switch.bookmarks" }),
    )

    expect(await screen.findByText("HeaderRefresh:false")).toBeInTheDocument()
    expect(screen.queryByText("BalanceSection")).not.toBeInTheDocument()
    expect(screen.getByText("BookmarkStatsSection")).toBeInTheDocument()
    expect(
      screen.queryByText("ApiCredentialProfilesStatsSection"),
    ).not.toBeInTheDocument()
    expect(screen.getByText("ActionButtons")).toBeInTheDocument()
    expect(screen.queryByText("AccountList")).not.toBeInTheDocument()
    expect(screen.getByText("BookmarksList")).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("tab", {
        name: "apiCredentialProfiles:popup.tabLabel",
      }),
    )

    expect(await screen.findByText("HeaderRefresh:false")).toBeInTheDocument()
    expect(screen.queryByText("BalanceSection")).not.toBeInTheDocument()
    expect(screen.queryByText("BookmarkStatsSection")).not.toBeInTheDocument()
    expect(
      screen.getByText("ApiCredentialProfilesStatsSection"),
    ).toBeInTheDocument()
    expect(screen.getByText("ActionButtons")).toBeInTheDocument()
    expect(screen.queryByText("AccountList")).not.toBeInTheDocument()
    expect(screen.queryByText("BookmarksList")).not.toBeInTheDocument()
    expect(
      screen.getByText("ApiCredentialProfilesPopupView"),
    ).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("button", {
        name: "apiCredentialProfiles:actions.add",
      }),
    )
    expect(
      await screen.findByText("ApiCredentialProfileDialogOpen"),
    ).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("tab", { name: "bookmark:switch.bookmarks" }),
    )

    fireEvent.click(
      await screen.findByRole("button", { name: "bookmark:actions.add" }),
    )
    expect(await screen.findByText("BookmarkDialogOpen")).toBeInTheDocument()
  })
})
