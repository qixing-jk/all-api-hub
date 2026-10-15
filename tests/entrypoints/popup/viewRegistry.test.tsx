import {
  forwardRef,
  Suspense,
  useEffect,
  useImperativeHandle,
  useState,
} from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { usePopupViewRegistry } from "~/entrypoints/popup/viewRegistry"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

const {
  accountListPropsMock,
  handleAddAccountClickMock,
  openAddBookmarkMock,
  openAddDialogMock,
  accountDataMock,
} = vi.hoisted(() => ({
  accountListPropsMock: vi.fn(),
  handleAddAccountClickMock: vi.fn(),
  openAddBookmarkMock: vi.fn(),
  openAddDialogMock: vi.fn(),
  accountDataMock: vi.fn(),
}))

vi.mock("~/features/AccountManagement/opening/useAddAccountHandler", () => ({
  useAddAccountHandler: () => ({
    handleAddAccountClick: handleAddAccountClickMock,
  }),
}))

vi.mock("~/features/AccountManagement/data/AccountDataContext", () => ({
  useAccountDataContext: accountDataMock,
}))

vi.mock("~/features/SiteBookmarks/editor/BookmarkDialogStateContext", () => ({
  useBookmarkDialogContext: () => ({
    openAddBookmark: openAddBookmarkMock,
  }),
}))

vi.mock("~/features/AccountManagement/components/AccountList", () => ({
  default: (props: Record<string, unknown>) => {
    accountListPropsMock(props)
    return <div>AccountList</div>
  },
}))

vi.mock(
  "~/features/AccountManagement/components/NewcomerSponsorRecommendationsSection",
  () => ({
    NewcomerSponsorRecommendationsSection: () => (
      <div>NewcomerSponsorRecommendationsSection</div>
    ),
  }),
)

vi.mock("~/entrypoints/popup/components/BalanceSection", () => ({
  default: ({
    onFilterCurrentSiteAccounts,
  }: {
    onFilterCurrentSiteAccounts?: (query: string) => void
  }) => (
    <button onClick={() => onFilterCurrentSiteAccounts?.("example.com")}>
      BalanceSection
    </button>
  ),
}))

vi.mock("~/entrypoints/popup/components/ShareOverviewSnapshotButton", () => ({
  default: () => <button>ShareOverviewSnapshotButton</button>,
}))

vi.mock("~/features/SiteBookmarks/list/BookmarksList", () => ({
  default: () => <div>BookmarksList</div>,
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

vi.mock(
  "~/features/ApiCredentialProfiles/list/ApiCredentialProfilesPopupView",
  () => ({
    default: forwardRef(function ApiCredentialProfilesPopupView(
      props: { onHasProfilesChange?: (hasProfiles: boolean) => void },
      ref,
    ) {
      useEffect(() => {
        props.onHasProfilesChange?.(true)
      }, [props])

      useImperativeHandle(ref, () => ({
        openAddDialog: openAddDialogMock,
      }))

      return <div>ApiCredentialProfilesPopupView</div>
    }),
  }),
)

function RegistryProbe({
  isPopup = false,
  mountApiContent = true,
  scrollParent,
}: {
  isPopup?: boolean
  mountApiContent?: boolean
  scrollParent?: HTMLElement | null
}) {
  const registry = usePopupViewRegistry({ isPopup, scrollParent })

  return (
    <div>
      <div>{registry.accounts.primaryActionLabel}</div>
      <div>{registry.accounts.headerAction}</div>
      <div>{registry.accounts.statsSection}</div>
      <div>{registry.accounts.content}</div>

      <button onClick={registry.accounts.onPrimaryAction}>add-account</button>
      <button onClick={registry.bookmarks.onPrimaryAction}>add-bookmark</button>
      <button onClick={registry.apiCredentialProfiles.onPrimaryAction}>
        add-api-profile
      </button>
      <button onClick={() => registry.bookmarks.preload?.()}>
        preload-bookmarks
      </button>
      <button onClick={() => registry.apiCredentialProfiles.preload?.()}>
        preload-api-profiles
      </button>

      <Suspense fallback={<div>loading</div>}>
        {registry.bookmarks.statsSection}
        {registry.bookmarks.content}
        {registry.apiCredentialProfiles.statsSection}
        {mountApiContent ? registry.apiCredentialProfiles.content : null}
      </Suspense>
    </div>
  )
}

function DeferredApiMountProbe() {
  const registry = usePopupViewRegistry()
  const [showApiContent, setShowApiContent] = useState(false)

  return (
    <div>
      <button onClick={registry.apiCredentialProfiles.onPrimaryAction}>
        queue-api-add
      </button>
      <button onClick={() => setShowApiContent(true)}>mount-api-content</button>

      <Suspense fallback={<div>loading</div>}>
        {showApiContent ? registry.apiCredentialProfiles.content : null}
      </Suspense>
    </div>
  )
}

describe("usePopupViewRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    accountDataMock.mockReturnValue({
      accounts: [{ id: "account-1" }],
      bookmarks: [{ id: "bookmark-1" }],
      isInitialLoad: false,
    })
  })

  it("waits for accounts to load before offering onboarding and restores the overview after adding one", () => {
    accountDataMock.mockReturnValue({
      accounts: [],
      bookmarks: [],
      isInitialLoad: true,
    })
    const { rerender } = render(<RegistryProbe />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    expect(screen.queryByText("account:emptyState")).not.toBeInTheDocument()
    expect(screen.queryByText("BalanceSection")).not.toBeInTheDocument()
    expect(screen.getByText("AccountList")).toBeInTheDocument()
    expect(
      screen.queryByText("NewcomerSponsorRecommendationsSection"),
    ).not.toBeInTheDocument()

    accountDataMock.mockReturnValue({
      accounts: [],
      bookmarks: [],
      isInitialLoad: false,
    })
    rerender(<RegistryProbe />)
    expect(
      screen.getByRole("heading", { name: "account:emptyState" }),
    ).toBeVisible()
    expect(
      screen.getByText("NewcomerSponsorRecommendationsSection"),
    ).toBeVisible()
    expect(screen.queryByText("BalanceSection")).not.toBeInTheDocument()
    expect(
      screen.queryByText("ShareOverviewSnapshotButton"),
    ).not.toBeInTheDocument()

    accountDataMock.mockReturnValue({
      accounts: [{ id: "new-account" }],
      bookmarks: [],
      isInitialLoad: false,
    })
    rerender(<RegistryProbe />)
    expect(screen.queryByText("account:emptyState")).not.toBeInTheDocument()
    expect(screen.getByText("BalanceSection")).toBeVisible()
    expect(
      screen.queryByText("NewcomerSponsorRecommendationsSection"),
    ).not.toBeInTheDocument()
  })

  it("builds the default account and bookmark views with their actions", async () => {
    render(<RegistryProbe />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(screen.getByText("account:addAccount")).toBeInTheDocument()
    expect(screen.getByText("ShareOverviewSnapshotButton")).toBeInTheDocument()
    expect(screen.getByText("BalanceSection")).toBeInTheDocument()
    expect(screen.getByText("AccountList")).toBeInTheDocument()

    expect(await screen.findByText("BookmarkStatsSection")).toBeInTheDocument()
    expect(await screen.findByText("BookmarksList")).toBeInTheDocument()
    expect(
      await screen.findByText("ApiCredentialProfilesStatsSection"),
    ).toBeInTheDocument()
    expect(
      await screen.findByText("ApiCredentialProfilesPopupView"),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "add-account" }))
    fireEvent.click(screen.getByRole("button", { name: "add-bookmark" }))
    fireEvent.click(screen.getByRole("button", { name: "preload-bookmarks" }))
    fireEvent.click(screen.getByRole("button", { name: "add-api-profile" }))
    fireEvent.click(
      screen.getByRole("button", { name: "preload-api-profiles" }),
    )

    expect(handleAddAccountClickMock).toHaveBeenCalledTimes(1)
    expect(openAddBookmarkMock).toHaveBeenCalledTimes(1)
    expect(openAddDialogMock).toHaveBeenCalledTimes(1)
  })

  it("queues the API credential add action until the lazy view mounts", async () => {
    render(<DeferredApiMountProbe />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    fireEvent.click(screen.getByRole("button", { name: "queue-api-add" }))
    expect(openAddDialogMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "mount-api-content" }))

    expect(
      await screen.findByText("ApiCredentialProfilesPopupView"),
    ).toBeInTheDocument()
    expect(openAddDialogMock).toHaveBeenCalledTimes(1)
  })

  it("threads detected-site filter requests from the stats badge into account list search props", () => {
    render(<RegistryProbe />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    fireEvent.click(screen.getByRole("button", { name: "BalanceSection" }))

    expect(accountListPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialSearchQuery: "example.com",
        initialSearchQueryRevision: 1,
      }),
    )

    fireEvent.click(screen.getByRole("button", { name: "BalanceSection" }))

    expect(accountListPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialSearchQuery: "example.com",
        initialSearchQueryRevision: 2,
      }),
    )
  })

  it("disables popup reordering and forwards its shared scroll container", () => {
    const scrollParent = document.createElement("div")

    render(<RegistryProbe isPopup scrollParent={scrollParent} />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(accountListPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reorderUnavailableReason: "account:list.reorderUnavailableInPopup",
        showAddAccountAction: false,
        virtualScrollParent: scrollParent,
      }),
    )
  })

  it("omits API credentials and bookmark stats sections when empty", () => {
    accountDataMock.mockReturnValue({
      accounts: [],
      bookmarks: [],
      isInitialLoad: false,
    })

    render(<RegistryProbe mountApiContent={false} />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(screen.queryByText("BookmarkStatsSection")).not.toBeInTheDocument()
    expect(
      screen.queryByText("ApiCredentialProfilesStatsSection"),
    ).not.toBeInTheDocument()
  })
})
