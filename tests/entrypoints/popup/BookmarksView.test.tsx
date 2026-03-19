import { useState, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { fireEvent, render, screen, within } from "~~/tests/test-utils/render"

const { bookmarksPreloadMock, apiCredentialProfilesPreloadMock } = vi.hoisted(
  () => ({
    bookmarksPreloadMock: vi.fn(),
    apiCredentialProfilesPreloadMock: vi.fn(),
  }),
)

vi.mock("~/components/AppLayout", () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("~/features/AccountManagement/hooks/AccountManagementProvider", () => ({
  AccountManagementProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("~/utils/browser", () => ({
  isExtensionSidePanel: () => false,
  isMobileDevice: () => false,
}))

vi.mock("~/entrypoints/popup/components/HeaderSection", () => ({
  default: ({ showRefresh }: { showRefresh?: boolean }) => (
    <div>{`HeaderRefresh:${String(showRefresh)}`}</div>
  ),
}))

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

vi.mock("~/entrypoints/popup/viewRegistry", () => ({
  usePopupViewRegistry: () => {
    const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false)
    const [
      apiCredentialProfilesDialogOpen,
      setApiCredentialProfilesDialogOpen,
    ] = useState(false)

    return {
      accounts: {
        showRefresh: true,
        headerAction: <div>ShareOverviewSnapshotButton</div>,
        statsSection: <div>BalanceSection</div>,
        primaryActionLabel: "account:addAccount",
        onPrimaryAction: vi.fn(),
        content: <div>AccountList</div>,
      },
      bookmarks: {
        showRefresh: false,
        statsSection: <div>BookmarkStatsSection</div>,
        primaryActionLabel: "bookmark:actions.add",
        onPrimaryAction: () => setBookmarkDialogOpen(true),
        content: (
          <div>
            <div>BookmarksList</div>
            {bookmarkDialogOpen ? <div>BookmarkDialogOpen</div> : null}
          </div>
        ),
        preload: bookmarksPreloadMock,
      },
      apiCredentialProfiles: {
        showRefresh: false,
        statsSection: <div>ApiCredentialProfilesStatsSection</div>,
        primaryActionLabel: "apiCredentialProfiles:actions.add",
        onPrimaryAction: () => setApiCredentialProfilesDialogOpen(true),
        content: (
          <div>
            <div>ApiCredentialProfilesPopupView</div>
            {apiCredentialProfilesDialogOpen ? (
              <div>ApiCredentialProfileDialogOpen</div>
            ) : null}
          </div>
        ),
        preload: apiCredentialProfilesPreloadMock,
      },
    }
  },
}))

describe("popup bookmarks view", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

    const accountsView = screen.getByTestId("popup-view-accounts")
    expect(within(accountsView).getByText("AccountList")).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("tab", { name: "bookmark:switch.bookmarks" }),
    )

    expect(bookmarksPreloadMock).toHaveBeenCalledTimes(1)
    expect(await screen.findByText("HeaderRefresh:false")).toBeInTheDocument()
    expect(screen.queryByText("BalanceSection")).not.toBeInTheDocument()
    expect(screen.getByText("BookmarkStatsSection")).toBeInTheDocument()
    expect(
      screen.queryByText("ApiCredentialProfilesStatsSection"),
    ).not.toBeInTheDocument()
    expect(screen.getByText("ActionButtons")).toBeInTheDocument()
    expect(screen.queryByText("AccountList")).not.toBeInTheDocument()

    const bookmarksView = screen.getByTestId("popup-view-bookmarks")
    expect(within(bookmarksView).getByText("BookmarksList")).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("button", { name: "bookmark:actions.add" }),
    )
    expect(await screen.findByText("BookmarkDialogOpen")).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("tab", {
        name: "apiCredentialProfiles:popup.tabLabel",
      }),
    )

    expect(apiCredentialProfilesPreloadMock).toHaveBeenCalledTimes(1)
    expect(await screen.findByText("HeaderRefresh:false")).toBeInTheDocument()
    expect(screen.queryByText("BalanceSection")).not.toBeInTheDocument()
    expect(screen.queryByText("BookmarkStatsSection")).not.toBeInTheDocument()
    expect(
      screen.getByText("ApiCredentialProfilesStatsSection"),
    ).toBeInTheDocument()
    expect(screen.getByText("ActionButtons")).toBeInTheDocument()
    expect(screen.queryByText("AccountList")).not.toBeInTheDocument()
    expect(screen.queryByText("BookmarksList")).not.toBeInTheDocument()

    const apiCredentialProfilesView = screen.getByTestId(
      "popup-view-apiCredentialProfiles",
    )
    expect(
      within(apiCredentialProfilesView).getByText(
        "ApiCredentialProfilesPopupView",
      ),
    ).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("button", {
        name: "apiCredentialProfiles:actions.add",
      }),
    )
    expect(
      await screen.findByText("ApiCredentialProfileDialogOpen"),
    ).toBeInTheDocument()
  })
})
