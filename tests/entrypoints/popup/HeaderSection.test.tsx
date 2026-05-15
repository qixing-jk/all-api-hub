import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useUpdateLogDialogContext } from "~/components/dialogs/UpdateLogDialog"
import HeaderSection from "~/entrypoints/popup/components/HeaderSection"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsActionId,
  type ProductAnalyticsFeatureId,
} from "~/services/productAnalytics/events"
import { isExtensionSidePanel } from "~/utils/browser"
import { getSidePanelSupport } from "~/utils/browser/browserApi"
import {
  openApiCredentialProfilesPage,
  openBugReportPage,
  openCommunityPage,
  openFeatureRequestPage,
  openFullAccountManagerPage,
  openFullBookmarkManagerPage,
  openPermissionsOnboardingPage,
  openSettingsPage,
  openSidePanelPage,
} from "~/utils/navigation"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()
  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
    useUserPreferencesContext: () => ({
      themeMode: "system",
      updateThemeMode: vi.fn().mockResolvedValue(true),
    }),
  }
})

vi.mock("~/assets/icon.png", () => ({
  default: "icon.png",
}))

vi.mock("~/components/dialogs/UpdateLogDialog", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/components/dialogs/UpdateLogDialog")
    >()

  return {
    ...actual,
    useUpdateLogDialogContext: vi.fn(),
  }
})

vi.mock("~/utils/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser")>()
  return {
    ...actual,
    isExtensionSidePanel: vi.fn().mockReturnValue(false),
  }
})

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    getSidePanelSupport: vi.fn(),
  }
})

vi.mock("~/contexts/ReleaseUpdateStatusContext", () => ({
  useReleaseUpdateStatus: () => ({
    status: null,
    isLoading: false,
    isChecking: false,
    error: null,
    refresh: vi.fn(),
    checkNow: vi.fn(),
  }),
}))

vi.mock("~/utils/navigation", () => ({
  openApiCredentialProfilesPage: vi.fn(),
  openBugReportPage: vi.fn(),
  openCommunityPage: vi.fn(),
  openFeatureRequestPage: vi.fn(),
  openFullAccountManagerPage: vi.fn(),
  openFullBookmarkManagerPage: vi.fn(),
  openPermissionsOnboardingPage: vi.fn(),
  openSettingsPage: vi.fn(),
  openSidePanelPage: vi.fn(),
}))

const {
  handleRefreshMock,
  startProductAnalyticsActionMock,
  trackerCompleteMock,
  trackProductAnalyticsActionStartedMock,
} = vi.hoisted(() => ({
  handleRefreshMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  trackerCompleteMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    isRefreshing: false,
    handleRefresh: handleRefreshMock,
  }),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    startProductAnalyticsActionMock(...args),
  trackProductAnalyticsActionStarted: (...args: any[]) =>
    trackProductAnalyticsActionStartedMock(...args),
}))

const mockedIsExtensionSidePanel = vi.mocked(isExtensionSidePanel)
const mockedGetSidePanelSupport = vi.mocked(getSidePanelSupport)
const mockedOpenApiCredentialProfilesPage = vi.mocked(
  openApiCredentialProfilesPage,
)
const mockedOpenBugReportPage = vi.mocked(openBugReportPage)
const mockedOpenCommunityPage = vi.mocked(openCommunityPage)
const mockedOpenFeatureRequestPage = vi.mocked(openFeatureRequestPage)
const mockedOpenFullAccountManagerPage = vi.mocked(openFullAccountManagerPage)
const mockedOpenFullBookmarkManagerPage = vi.mocked(openFullBookmarkManagerPage)
const mockedOpenPermissionsOnboardingPage = vi.mocked(
  openPermissionsOnboardingPage,
)
const mockedOpenSettingsPage = vi.mocked(openSettingsPage)
const mockedOpenSidePanelPage = vi.mocked(openSidePanelPage)
const mockedUseUpdateLogDialogContext = vi.mocked(useUpdateLogDialogContext)

const expectPopupHeaderAction = ({
  featureId,
  actionId,
}: {
  featureId: ProductAnalyticsFeatureId
  actionId: ProductAnalyticsActionId
}) => {
  expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledWith({
    featureId,
    actionId,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.PopupHeader,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
  })
}

describe("popup HeaderSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("MODE", "development")
    trackProductAnalyticsActionStartedMock.mockReset()
    trackerCompleteMock.mockReset()
    trackerCompleteMock.mockResolvedValue(undefined)
    startProductAnalyticsActionMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: trackerCompleteMock,
    })
    handleRefreshMock.mockReset()
    handleRefreshMock.mockResolvedValue({ success: 0, failed: 0 })
    mockedIsExtensionSidePanel.mockReturnValue(false)
    mockedGetSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
    mockedUseUpdateLogDialogContext.mockReturnValue({
      state: { isOpen: false, version: null },
      openDialog: vi.fn(),
      closeDialog: vi.fn(),
    })
  })

  it("shows open side panel button in popup", async () => {
    render(<HeaderSection />, { withReleaseUpdateStatusProvider: false })

    expect(
      await screen.findByRole("button", {
        name: "common:actions.openSidePanel",
      }),
    ).toBeInTheDocument()
  })

  it("hides open side panel button inside side panel", async () => {
    mockedIsExtensionSidePanel.mockReturnValue(true)
    render(<HeaderSection />, { withReleaseUpdateStatusProvider: false })

    expect(
      screen.queryByRole("button", { name: "common:actions.openSidePanel" }),
    ).not.toBeInTheDocument()
  })

  it("hides open side panel button when side panel is unsupported", async () => {
    mockedGetSidePanelSupport.mockReturnValue({
      supported: false,
      kind: "unsupported",
      reason: "missing",
    })

    render(<HeaderSection />, { withReleaseUpdateStatusProvider: false })

    expect(
      screen.queryByRole("button", { name: "common:actions.openSidePanel" }),
    ).not.toBeInTheDocument()
  })

  it("routes the open side panel button through the shared navigation helper", async () => {
    render(<HeaderSection />, { withReleaseUpdateStatusProvider: false })

    fireEvent.click(
      await screen.findByRole("button", {
        name: "common:actions.openSidePanel",
      }),
    )

    expect(mockedOpenSidePanelPage).toHaveBeenCalledTimes(1)
    expectPopupHeaderAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenSidepanelFromPopup,
    })
  })

  it("routes open full page to account manager for accounts view", async () => {
    render(<HeaderSection activeView="accounts" />, {
      withReleaseUpdateStatusProvider: false,
    })

    fireEvent.click(
      await screen.findByRole("button", { name: "ui:navigation.account" }),
    )

    expect(mockedOpenFullAccountManagerPage).toHaveBeenCalledTimes(1)
    expectPopupHeaderAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupAccountManagementPage,
    })
  })

  it("routes open full page to bookmark manager for bookmarks view", async () => {
    render(<HeaderSection activeView="bookmarks" />, {
      withReleaseUpdateStatusProvider: false,
    })

    fireEvent.click(
      await screen.findByRole("button", { name: "ui:navigation.bookmark" }),
    )

    expect(mockedOpenFullBookmarkManagerPage).toHaveBeenCalledTimes(1)
    expectPopupHeaderAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.BookmarkManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupBookmarkManagementPage,
    })
  })

  it("routes open full page to API credential profiles for API credentials view", async () => {
    render(<HeaderSection activeView="apiCredentialProfiles" />, {
      withReleaseUpdateStatusProvider: false,
    })

    fireEvent.click(
      await screen.findByRole("button", {
        name: "ui:navigation.apiCredentialProfiles",
      }),
    )

    expect(mockedOpenApiCredentialProfilesPage).toHaveBeenCalledTimes(1)
    expectPopupHeaderAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupApiCredentialProfilesPage,
    })
  })

  it("completes popup header refresh analytics with the default success result", async () => {
    handleRefreshMock.mockResolvedValueOnce({ success: 4, failed: 0 })

    render(<HeaderSection />, { withReleaseUpdateStatusProvider: false })

    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.refresh" }),
    )
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshPopupAccounts,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.PopupHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
    })
    await waitFor(() => {
      expect(trackerCompleteMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            successCount: 4,
            failureCount: 0,
          },
        },
      )
    })
  })

  it("completes popup header refresh analytics failure with an unknown error category", async () => {
    handleRefreshMock.mockRejectedValue(new Error("refresh failed"))

    render(<HeaderSection />, { withReleaseUpdateStatusProvider: false })

    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.refresh" }),
    )

    await waitFor(() => {
      expect(trackerCompleteMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
  })

  it("tracks popup header settings shortcut as started-only analytics", async () => {
    render(<HeaderSection />, { withReleaseUpdateStatusProvider: false })

    fireEvent.click(
      await screen.findByRole("button", { name: "common:labels.settings" }),
    )
    expect(mockedOpenSettingsPage).toHaveBeenCalledTimes(1)
    expectPopupHeaderAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnalyticsSettings,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenPopupSettingsPage,
    })
  })

  it("opens feedback actions from the header menu", async () => {
    const user = userEvent.setup()

    render(<HeaderSection />, { withReleaseUpdateStatusProvider: false })

    await user.click(
      await screen.findByRole("button", { name: "ui:feedback.trigger" }),
    )
    await user.click(
      await screen.findByRole("menuitem", { name: "ui:feedback.bugReport" }),
    )

    expect(mockedOpenBugReportPage).toHaveBeenCalledTimes(1)

    await user.click(
      await screen.findByRole("button", { name: "ui:feedback.trigger" }),
    )
    await user.click(
      await screen.findByRole("menuitem", {
        name: "ui:feedback.featureRequest",
      }),
    )

    expect(mockedOpenFeatureRequestPage).toHaveBeenCalledTimes(1)

    await user.click(
      await screen.findByRole("button", { name: "ui:feedback.trigger" }),
    )
    expect(
      screen.queryByRole("menuitem", { name: "ui:feedback.discussion" }),
    ).not.toBeInTheDocument()
    await user.click(
      await screen.findByRole("menuitem", { name: "ui:feedback.community" }),
    )

    expect(mockedOpenCommunityPage).toHaveBeenCalledTimes(1)
    expect(mockedOpenCommunityPage).toHaveBeenCalledWith("en")
  })

  it("opens onboarding from the shared development dialog debug menu", async () => {
    const user = userEvent.setup()

    render(<HeaderSection />, { withReleaseUpdateStatusProvider: false })

    await user.click(
      await screen.findByRole("button", { name: "Dev: Dialog debug menu" }),
    )
    await user.click(
      await screen.findByRole("menuitem", {
        name: "Dev: Trigger onboarding",
      }),
    )

    expect(mockedOpenPermissionsOnboardingPage).toHaveBeenCalledWith({
      reason: "debug",
    })
  })
})
