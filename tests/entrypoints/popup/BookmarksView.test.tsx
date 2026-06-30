import { useState, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getPopupViewTestId } from "~/entrypoints/popup/testIds"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { fireEvent, render, screen, within } from "~~/tests/test-utils/render"

const {
  apiCredentialProfilesPreloadMock,
  isExtensionPopupMock,
  markPopupClosedDuringCriticalFlowMock,
  bookmarksPreloadMock,
  trackProductAnalyticsActionStartedMock,
} = vi.hoisted(() => ({
  bookmarksPreloadMock: vi.fn(),
  apiCredentialProfilesPreloadMock: vi.fn(),
  isExtensionPopupMock: vi.fn(() => true),
  markPopupClosedDuringCriticalFlowMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
}))

vi.mock("~/components/AppLayout", () => ({
  AppLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("~/components/PopupInterruptionHintBanner", () => ({
  default: () => <div>PopupInterruptionHintBanner</div>,
}))

vi.mock("~/features/AccountManagement/hooks/AccountManagementProvider", () => ({
  AccountManagementProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("~/utils/browser", () => ({
  isExtensionPopup: isExtensionPopupMock,
  isExtensionSidePanel: () => false,
  isMobileDevice: () => false,
}))

vi.mock("~/services/popupInterruptionHint", () => ({
  markPopupClosedDuringCriticalFlow: markPopupClosedDuringCriticalFlowMock,
}))

vi.mock("~/hooks/useProductAnalyticsPageView", () => ({
  useProductAnalyticsPageView: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionStarted: (...args: any[]) =>
    trackProductAnalyticsActionStartedMock(...args),
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
    isExtensionPopupMock.mockReturnValue(true)
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

    const accountsView = screen.getByTestId(getPopupViewTestId("accounts"))
    expect(within(accountsView).getByText("AccountList")).toBeInTheDocument()

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "bookmark:switch.accounts",
      "apiCredentialProfiles:popup.tabLabel",
      "bookmark:switch.bookmarks",
    ])

    fireEvent.click(
      await screen.findByRole("tab", { name: "bookmark:switch.bookmarks" }),
    )

    expect(bookmarksPreloadMock).toHaveBeenCalledTimes(1)
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BookmarkManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectBookmarksView,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.PopupViewTabs,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
    })
    expect(await screen.findByText("HeaderRefresh:false")).toBeInTheDocument()
    expect(screen.queryByText("BalanceSection")).not.toBeInTheDocument()
    expect(screen.getByText("BookmarkStatsSection")).toBeInTheDocument()
    expect(
      screen.queryByText("ApiCredentialProfilesStatsSection"),
    ).not.toBeInTheDocument()
    expect(screen.getByText("ActionButtons")).toBeInTheDocument()
    expect(screen.queryByText("AccountList")).not.toBeInTheDocument()

    const bookmarksView = screen.getByTestId(getPopupViewTestId("bookmarks"))
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
    expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectApiCredentialProfilesView,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.PopupViewTabs,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
    })
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
      getPopupViewTestId("apiCredentialProfiles"),
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

  it("records a pending popup interruption hint when the popup page is hidden", async () => {
    const { default: App } = await import("~/entrypoints/popup/App")

    render(<App />)
    await screen.findByText("ActionButtons")

    window.dispatchEvent(new Event("pagehide"))

    expect(markPopupClosedDuringCriticalFlowMock).toHaveBeenCalledTimes(1)
  })

  it("does not track popup interruption state outside the popup window", async () => {
    isExtensionPopupMock.mockReturnValue(false)
    const { default: App } = await import("~/entrypoints/popup/App")

    render(<App />)
    await screen.findByText("ActionButtons")

    window.dispatchEvent(new Event("pagehide"))

    expect(markPopupClosedDuringCriticalFlowMock).not.toHaveBeenCalled()
  })
})
