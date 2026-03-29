import { fireEvent, render, screen } from "@testing-library/react"
import { forwardRef, Suspense, useImperativeHandle, useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { usePopupViewRegistry } from "~/entrypoints/popup/viewRegistry"

const { handleAddAccountClickMock, openAddBookmarkMock, openAddDialogMock } =
  vi.hoisted(() => ({
    handleAddAccountClickMock: vi.fn(),
    openAddBookmarkMock: vi.fn(),
    openAddDialogMock: vi.fn(),
  }))

vi.mock("~/hooks/useAddAccountHandler", () => ({
  useAddAccountHandler: () => ({
    handleAddAccountClick: handleAddAccountClickMock,
  }),
}))

vi.mock("~/features/SiteBookmarks/hooks/BookmarkDialogStateContext", () => ({
  useBookmarkDialogContext: () => ({
    openAddBookmark: openAddBookmarkMock,
  }),
}))

vi.mock("~/features/AccountManagement/components/AccountList", () => ({
  default: () => <div>AccountList</div>,
}))

vi.mock("~/entrypoints/popup/components/BalanceSection", () => ({
  default: () => <div>BalanceSection</div>,
}))

vi.mock("~/entrypoints/popup/components/ShareOverviewSnapshotButton", () => ({
  default: () => <button>ShareOverviewSnapshotButton</button>,
}))

vi.mock("~/features/SiteBookmarks/components/BookmarksList", () => ({
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
  "~/features/ApiCredentialProfiles/components/ApiCredentialProfilesPopupView",
  () => ({
    default: forwardRef(function ApiCredentialProfilesPopupView(_props, ref) {
      useImperativeHandle(ref, () => ({
        openAddDialog: openAddDialogMock,
      }))

      return <div>ApiCredentialProfilesPopupView</div>
    }),
  }),
)

/**
 *
 */
function RegistryProbe({
  mountApiContent = true,
}: {
  mountApiContent?: boolean
}) {
  const registry = usePopupViewRegistry()

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

/**
 *
 */
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
  })

  it("builds the default account and bookmark views with their actions", async () => {
    render(<RegistryProbe />)

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
    render(<DeferredApiMountProbe />)

    fireEvent.click(screen.getByRole("button", { name: "queue-api-add" }))
    expect(openAddDialogMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "mount-api-content" }))

    expect(
      await screen.findByText("ApiCredentialProfilesPopupView"),
    ).toBeInTheDocument()
    expect(openAddDialogMock).toHaveBeenCalledTimes(1)
  })
})
