import { useState, type ReactNode } from "react"
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
  isMobileDevice: () => false,
}))

vi.mock("~/hooks/useAddAccountHandler", () => ({
  useAddAccountHandler: () => ({
    handleAddAccountClick: vi.fn(),
  }),
}))

vi.mock("~/hooks/useMediaQuery", () => ({
  useIsDesktop: () => false,
  useIsSmallScreen: () => false,
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

vi.mock(import("~/entrypoints/popup/components/BookmarkStatsSection"), () => ({
  default: () => <div>BookmarkStatsSection</div>,
}))

vi.mock(
  import("~/entrypoints/popup/components/ApiCredentialProfilesStatsSection"),
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

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    bookmarks: [],
    pinnedAccountIds: [],
    orderedAccountIds: [],
    tags: [],
    tagStore: { version: 1, tagsById: {} },
    isInitialLoad: false,
    isAccountPinned: () => false,
    togglePinAccount: vi.fn(),
    handleBookmarkReorder: vi.fn(),
    loadAccountData: vi.fn(),
  }),
}))

vi.mock(
  "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfilesController",
  () => ({
    useApiCredentialProfilesController: () => {
      const [isAddOpen, setIsAddOpen] = useState(false)

      return {
        profiles: [],
        isLoading: false,
        tags: [],
        tagNameById: new Map(),
        createTag: vi.fn(),
        renameTag: vi.fn(),
        deleteTag: vi.fn(),
        visibleKeys: new Set(),
        toggleKeyVisibility: vi.fn(),
        managedSiteType: "new-api",
        managedSiteLabel: "new-api",
        isEditorOpen: isAddOpen,
        setIsEditorOpen: vi.fn(),
        editingProfile: null,
        openAddDialog: () => setIsAddOpen(true),
        openEditDialog: vi.fn(),
        handleSave: vi.fn(),
        verifyingProfile: null,
        setVerifyingProfile: vi.fn(),
        cliVerifyingProfile: null,
        setCliVerifyingProfile: vi.fn(),
        ccSwitchProfile: null,
        setCCSwitchProfile: vi.fn(),
        kiloCodeProfile: null,
        setKiloCodeProfile: vi.fn(),
        cliProxyProfile: null,
        setCliProxyProfile: vi.fn(),
        claudeCodeRouterProfile: null,
        setClaudeCodeRouterProfile: vi.fn(),
        claudeCodeRouterBaseUrl: "",
        claudeCodeRouterApiKey: "",
        handleCopyBaseUrl: vi.fn(),
        handleCopyApiKey: vi.fn(),
        handleCopyBundle: vi.fn(),
        handleOpenModelManagement: vi.fn(),
        handleExport: vi.fn(),
        deletingProfile: null,
        isDeleting: false,
        handleRequestDelete: vi.fn(),
        closeDeleteDialog: vi.fn(),
        handleConfirmDelete: vi.fn(),
      }
    },
  }),
)

vi.mock(
  "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesListView",
  () => ({
    ApiCredentialProfilesListView: ({
      controller,
    }: {
      controller: { isEditorOpen: boolean }
    }) => (
      <div>
        <div>ApiCredentialProfilesListView</div>
        {controller.isEditorOpen ? (
          <div>ApiCredentialProfileDialogOpen</div>
        ) : null}
      </div>
    ),
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
    expect(screen.queryByText("bookmark:emptyState")).not.toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("tab", { name: "bookmark:switch.bookmarks" }),
    )

    expect(await screen.findByText("HeaderRefresh:false")).toBeInTheDocument()
    expect(await screen.findByText("BookmarkStatsSection")).toBeInTheDocument()
    expect(await screen.findByText("bookmark:emptyState")).toBeInTheDocument()
    expect(screen.queryByText("BalanceSection")).not.toBeInTheDocument()
    expect(
      screen.queryByText("ApiCredentialProfilesStatsSection"),
    ).not.toBeInTheDocument()
    expect(screen.getByText("ActionButtons")).toBeInTheDocument()
    expect(screen.queryByText("AccountList")).not.toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("tab", {
        name: "apiCredentialProfiles:popup.tabLabel",
      }),
    )

    expect(await screen.findByText("HeaderRefresh:false")).toBeInTheDocument()
    expect(
      await screen.findByText("ApiCredentialProfilesStatsSection"),
    ).toBeInTheDocument()
    expect(
      await screen.findByText("ApiCredentialProfilesListView"),
    ).toBeInTheDocument()
    expect(screen.queryByText("BalanceSection")).not.toBeInTheDocument()
    expect(screen.queryByText("BookmarkStatsSection")).not.toBeInTheDocument()
    expect(screen.getByText("ActionButtons")).toBeInTheDocument()
    expect(screen.queryByText("AccountList")).not.toBeInTheDocument()
    expect(screen.queryByText("bookmark:emptyState")).not.toBeInTheDocument()

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
    expect(await screen.findByText("bookmark:emptyState")).toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole("button", { name: "bookmark:actions.add" }),
    )
    expect(await screen.findByText("BookmarkDialogOpen")).toBeInTheDocument()
  })
})
