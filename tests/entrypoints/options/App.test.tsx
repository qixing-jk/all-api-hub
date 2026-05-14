import { act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { lazy } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import App from "~/entrypoints/options/App"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_PAGE_IDS,
} from "~/services/productAnalytics/events"
import { render, screen } from "~~/tests/test-utils/render"

const {
  mockedHandleMenuItemChange,
  mockedOptionsSearchDialog,
  mockedUseProductAnalyticsPageView,
  mockedUseSearchHotkeys,
  mockUseHashNavigationState,
} = vi.hoisted(() => ({
  mockedHandleMenuItemChange: vi.fn(),
  mockedOptionsSearchDialog: vi.fn(),
  mockedUseProductAnalyticsPageView: vi.fn(),
  mockedUseSearchHotkeys: vi.fn(),
  mockUseHashNavigationState: {
    activeMenuItem: "basic",
    routeParams: { source: "test" },
    refreshKey: 7,
  },
}))

vi.mock("~/components/AppLayout", () => ({
  AppLayout: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  useUserPreferencesContext: () => ({
    managedSiteType: "new-api",
    preferences: {
      autoCheckin: {
        globalEnabled: true,
      },
    },
    showTodayCashflow: true,
  }),
}))

vi.mock("~/entrypoints/options/hooks/useHashNavigation", () => ({
  useHashNavigation: () => ({
    activeMenuItem: mockUseHashNavigationState.activeMenuItem,
    routeParams: mockUseHashNavigationState.routeParams,
    handleMenuItemChange: mockedHandleMenuItemChange,
    refreshKey: mockUseHashNavigationState.refreshKey,
  }),
}))

vi.mock("~/hooks/useProductAnalyticsPageView", () => ({
  useProductAnalyticsPageView: mockedUseProductAnalyticsPageView,
}))

vi.mock("~/entrypoints/options/components/Header", () => ({
  default: ({
    onSearchOpen,
    onTitleClick,
  }: {
    onSearchOpen: () => void
    onTitleClick: () => void
  }) => (
    <div>
      <button onClick={onSearchOpen}>open search</button>
      <button onClick={onTitleClick}>go basic</button>
    </div>
  ),
}))

vi.mock("~/entrypoints/options/components/Sidebar", () => ({
  default: ({
    onMenuItemClick,
  }: {
    onMenuItemClick: (itemId: string) => void
  }) => (
    <button onClick={() => onMenuItemClick(MENU_ITEM_IDS.ACCOUNT)}>
      sidebar account
    </button>
  ),
}))

vi.mock("~/entrypoints/options/pages/BasicSettings", () => ({
  default: () => <div>basic settings fallback</div>,
}))

vi.mock("~/entrypoints/options/search/useOptionsSearch", () => ({
  useOptionsSearchContext: (context: Record<string, unknown>) => ({
    ...context,
    sidePanelSupported: true,
  }),
}))

vi.mock("~/entrypoints/options/search/useSearchHotkeys", () => ({
  useSearchHotkeys: mockedUseSearchHotkeys,
}))

vi.mock("~/entrypoints/options/search/OptionsSearchDialog", () => ({
  OptionsSearchDialog: (props: Record<string, unknown>) => {
    mockedOptionsSearchDialog(props)

    return props.open ? (
      <div role="dialog">
        <button
          onClick={() =>
            (
              props.onPageNavigate as (
                pageId: string,
                params?: Record<string, string | undefined>,
              ) => void
            )("bookmark", { anchor: "bookmarks" })
          }
        >
          navigate bookmark
        </button>
        <button
          onClick={() => (props.onOpenChange as (open: boolean) => void)(false)}
        >
          close dialog
        </button>
      </div>
    ) : null
  },
}))

vi.mock("~/entrypoints/options/constants", () => ({
  menuItems: Object.values(MENU_ITEM_IDS).map((id) => {
    const MockPage = ({
      routeParams,
      refreshKey,
    }: {
      routeParams: Record<string, string>
      refreshKey: number
    }) => (
      <div>
        <div>source:{routeParams.source}</div>
        <div>refresh:{refreshKey}</div>
      </div>
    )

    return {
      id,
      component:
        id === MENU_ITEM_IDS.BASIC
          ? lazy(async () => ({ default: MockPage }))
          : MockPage,
    }
  }),
}))

describe("options App", () => {
  beforeEach(() => {
    mockedHandleMenuItemChange.mockReset()
    mockedOptionsSearchDialog.mockReset()
    mockedUseProductAnalyticsPageView.mockReset()
    mockedUseSearchHotkeys.mockReset()
    mockUseHashNavigationState.activeMenuItem = "basic"
    mockUseHashNavigationState.routeParams = { source: "test" }
    mockUseHashNavigationState.refreshKey = 7
  })

  it("shows the lazy page fallback and wires the search dialog interactions", async () => {
    const user = userEvent.setup()

    render(<App />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    expect(screen.getByLabelText("common:status.loading")).toBeInTheDocument()
    expect(await screen.findByText("source:test")).toBeInTheDocument()
    expect(screen.getByText("refresh:7")).toBeInTheDocument()
    expect(mockedUseProductAnalyticsPageView).toHaveBeenCalledWith({
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      pageId: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
    })

    await user.click(screen.getByText("open search"))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await user.click(screen.getByText("navigate bookmark"))
    expect(mockedHandleMenuItemChange).toHaveBeenCalledWith("bookmark", {
      anchor: "bookmarks",
    })

    await user.click(screen.getByText("go basic"))
    expect(mockedHandleMenuItemChange).toHaveBeenCalledWith(MENU_ITEM_IDS.BASIC)
  })

  it("opens the search dialog from the registered hotkey callback", async () => {
    render(<App />, {
      withReleaseUpdateStatusProvider: false,
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

    const hotkeyRegistration = mockedUseSearchHotkeys.mock.calls[0]?.[0] as
      | { onOpen: () => void }
      | undefined
    act(() => {
      hotkeyRegistration?.onOpen()
    })

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })

  it.each([
    [
      MENU_ITEM_IDS.ACCOUNT,
      PRODUCT_ANALYTICS_PAGE_IDS.OptionsAccountManagement,
    ],
    [
      MENU_ITEM_IDS.BOOKMARK,
      PRODUCT_ANALYTICS_PAGE_IDS.OptionsBookmarkManagement,
    ],
    [MENU_ITEM_IDS.KEYS, PRODUCT_ANALYTICS_PAGE_IDS.OptionsKeyManagement],
    [
      MENU_ITEM_IDS.MANAGED_SITE_CHANNELS,
      PRODUCT_ANALYTICS_PAGE_IDS.OptionsManagedSiteChannels,
    ],
    [MENU_ITEM_IDS.MODELS, PRODUCT_ANALYTICS_PAGE_IDS.OptionsModelList],
    [
      MENU_ITEM_IDS.USAGE_ANALYTICS,
      PRODUCT_ANALYTICS_PAGE_IDS.OptionsUsageAnalytics,
    ],
    [
      MENU_ITEM_IDS.BALANCE_HISTORY,
      PRODUCT_ANALYTICS_PAGE_IDS.OptionsBalanceHistory,
    ],
    [
      MENU_ITEM_IDS.API_CREDENTIAL_PROFILES,
      PRODUCT_ANALYTICS_PAGE_IDS.OptionsApiCredentialProfiles,
    ],
    [
      MENU_ITEM_IDS.SITE_ANNOUNCEMENTS,
      PRODUCT_ANALYTICS_PAGE_IDS.OptionsSiteAnnouncements,
    ],
    [
      MENU_ITEM_IDS.IMPORT_EXPORT,
      PRODUCT_ANALYTICS_PAGE_IDS.OptionsImportExport,
    ],
    [MENU_ITEM_IDS.AUTO_CHECKIN, PRODUCT_ANALYTICS_PAGE_IDS.OptionsAutoCheckin],
    [
      MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC,
      PRODUCT_ANALYTICS_PAGE_IDS.OptionsManagedSiteModelSync,
    ],
    [MENU_ITEM_IDS.ABOUT, PRODUCT_ANALYTICS_PAGE_IDS.OptionsAbout],
    ["unknown-menu-id", PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings],
  ])(
    "maps active menu item %s to options analytics page id %s",
    async (activeMenuItem, pageId) => {
      mockUseHashNavigationState.activeMenuItem = activeMenuItem

      render(<App />, {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      })

      expect(screen.getByTestId("options-app")).toBeInTheDocument()
      expect(mockedUseProductAnalyticsPageView).toHaveBeenCalledWith({
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        pageId,
      })
    },
  )
})
