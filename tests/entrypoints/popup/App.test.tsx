import { beforeEach, describe, expect, it, vi } from "vitest"

import { useProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { render, screen } from "~~/tests/test-utils/render"

const {
  mockIsExtensionSidePanel,
  mockUsePopupViewRegistry,
  mockUsePreferences,
} = vi.hoisted(() => ({
  mockIsExtensionSidePanel: vi.fn(() => false),
  mockUsePopupViewRegistry: vi.fn(),
  mockUsePreferences: vi.fn(() => ({ isLoading: false })),
}))

vi.mock("~/components/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock("~/components/PopupInterruptionHintBanner", () => ({
  default: () => null,
}))

vi.mock("~/contexts/UserPreferencesContext", () => ({
  UserPreferencesProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useUserPreferencesContext: () => mockUsePreferences(),
}))

vi.mock("~/entrypoints/popup/components/HeaderSection", () => ({
  default: () => <div>header</div>,
}))

vi.mock("~/entrypoints/popup/components/PopupViewSwitchTabs", () => ({
  default: () => <div>view-tabs</div>,
}))

vi.mock("~/entrypoints/popup/components/ActionButtons", () => ({
  default: () => <div>action-buttons</div>,
}))

vi.mock("~/entrypoints/popup/viewRegistry", () => ({
  usePopupViewRegistry: () => mockUsePopupViewRegistry(),
}))

vi.mock(
  "~/features/AccountManagement/workspace/AccountManagementProvider",
  () => ({
    AccountManagementProvider: ({
      children,
    }: {
      children: React.ReactNode
    }) => <div>{children}</div>,
  }),
)

vi.mock("~/features/DevPanel", () => ({
  DevPanel: () => null,
  DevPanelProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("~/hooks/analytics/useProductAnalyticsPageView", () => ({
  useProductAnalyticsPageView: () => undefined,
}))

vi.mock("~/utils/browser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser")>()),
  isExtensionSidePanel: mockIsExtensionSidePanel,
}))

/**
 * Reads the product analytics scope the popup wraps its stats section with.
 */
function StatsScopeProbe() {
  const scope = useProductAnalyticsScope()

  return (
    <div data-testid="stats-scope">
      {`${scope.entrypoint ?? ""}/${scope.surfaceId ?? ""}`}
    </div>
  )
}

function HeaderScopeProbe() {
  const scope = useProductAnalyticsScope()
  return (
    <div data-testid="header-scope">{`${scope.entrypoint}/${scope.featureId}/${scope.surfaceId}`}</div>
  )
}

function buildViewRegistry() {
  const accountsView = {
    showRefresh: false,
    statsSection: <StatsScopeProbe />,
    primaryActionLabel: "add",
    onPrimaryAction: () => undefined,
    primaryAnalyticsAction: {
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateAccountDialog,
    },
    content: <div>account-list</div>,
  }

  return {
    accounts: accountsView,
    bookmarks: accountsView,
    apiCredentialProfiles: accountsView,
  }
}

describe("popup App stats section analytics scope", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePreferences.mockReturnValue({ isLoading: false })
    mockIsExtensionSidePanel.mockReturnValue(false)
    mockUsePopupViewRegistry.mockReturnValue(buildViewRegistry())
  })

  it("wraps the stats section in the popup stats surface", async () => {
    const { default: App } = await import("~/entrypoints/popup/App")

    render(<App />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(screen.getByTestId("stats-scope")).toHaveTextContent(
      `popup/${PRODUCT_ANALYTICS_SURFACE_IDS.PopupStats}`,
    )
    expect(screen.getByText("account-list")).toBeInTheDocument()
  })

  it("uses the side panel stats surface inside the side panel", async () => {
    mockIsExtensionSidePanel.mockReturnValue(true)
    const { default: App } = await import("~/entrypoints/popup/App")

    render(<App />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(screen.getByTestId("stats-scope")).toHaveTextContent(
      `sidepanel/${PRODUCT_ANALYTICS_SURFACE_IDS.SidepanelStats}`,
    )
  })

  it("hides the stats section while preferences are still loading", async () => {
    mockUsePreferences.mockReturnValue({ isLoading: true })
    const { default: App } = await import("~/entrypoints/popup/App")

    render(<App />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })

    expect(screen.queryByTestId("stats-scope")).not.toBeInTheDocument()
  })

  it.each([false, true])(
    "scopes the header action to its entrypoint (sidepanel=%s)",
    async (inSidePanel) => {
      mockIsExtensionSidePanel.mockReturnValue(inSidePanel)
      const registry = buildViewRegistry()
      mockUsePopupViewRegistry.mockReturnValue({
        ...registry,
        accounts: { ...registry.accounts, headerAction: <HeaderScopeProbe /> },
      })
      const { default: App } = await import("~/entrypoints/popup/App")
      render(<App />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      })

      expect(screen.getByTestId("header-scope")).toHaveTextContent(
        `${inSidePanel ? "sidepanel" : "popup"}/${PRODUCT_ANALYTICS_FEATURE_IDS.ShareSnapshots}/${inSidePanel ? PRODUCT_ANALYTICS_SURFACE_IDS.SidepanelHeader : PRODUCT_ANALYTICS_SURFACE_IDS.PopupHeader}`,
      )
    },
  )
})
