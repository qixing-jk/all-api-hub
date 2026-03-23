import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import HeaderSection from "~/entrypoints/popup/components/HeaderSection"
import { isExtensionSidePanel } from "~/utils/browser"
import { getSidePanelSupport } from "~/utils/browser/browserApi"
import {
  openApiCredentialProfilesPage,
  openBugReportPage,
  openCommunityPage,
  openFeatureRequestPage,
  openFullAccountManagerPage,
  openFullBookmarkManagerPage,
  openSidePanelPage,
} from "~/utils/navigation"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

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

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    isRefreshing: false,
    handleRefresh: vi.fn().mockResolvedValue({ success: 0, failed: 0 }),
  }),
}))

vi.mock("~/utils/navigation", () => ({
  openApiCredentialProfilesPage: vi.fn(),
  openBugReportPage: vi.fn(),
  openCommunityPage: vi.fn(),
  openFeatureRequestPage: vi.fn(),
  openFullAccountManagerPage: vi.fn(),
  openFullBookmarkManagerPage: vi.fn(),
  openSettingsPage: vi.fn(),
  openSidePanelPage: vi.fn(),
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
const mockedOpenSidePanelPage = vi.mocked(openSidePanelPage)

describe("popup HeaderSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedIsExtensionSidePanel.mockReturnValue(false)
    mockedGetSidePanelSupport.mockReturnValue({
      supported: true,
      kind: "chromium-side-panel",
    })
  })

  it("shows open side panel button in popup", async () => {
    render(<HeaderSection />)

    expect(
      await screen.findByRole("button", {
        name: "common:actions.openSidePanel",
      }),
    ).toBeInTheDocument()
  })

  it("hides open side panel button inside side panel", async () => {
    mockedIsExtensionSidePanel.mockReturnValue(true)
    render(<HeaderSection />)

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

    render(<HeaderSection />)

    expect(
      screen.queryByRole("button", { name: "common:actions.openSidePanel" }),
    ).not.toBeInTheDocument()
  })

  it("routes the open side panel button through the shared navigation helper", async () => {
    render(<HeaderSection />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "common:actions.openSidePanel",
      }),
    )

    expect(mockedOpenSidePanelPage).toHaveBeenCalledTimes(1)
  })

  it("routes open full page to account manager for accounts view", async () => {
    render(<HeaderSection activeView="accounts" />)

    fireEvent.click(
      await screen.findByRole("button", { name: "ui:navigation.account" }),
    )

    expect(mockedOpenFullAccountManagerPage).toHaveBeenCalledTimes(1)
  })

  it("routes open full page to bookmark manager for bookmarks view", async () => {
    render(<HeaderSection activeView="bookmarks" />)

    fireEvent.click(
      await screen.findByRole("button", { name: "ui:navigation.bookmark" }),
    )

    expect(mockedOpenFullBookmarkManagerPage).toHaveBeenCalledTimes(1)
  })

  it("routes open full page to API credential profiles for API credentials view", async () => {
    render(<HeaderSection activeView="apiCredentialProfiles" />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "ui:navigation.apiCredentialProfiles",
      }),
    )

    expect(mockedOpenApiCredentialProfilesPage).toHaveBeenCalledTimes(1)
  })

  it("opens feedback actions from the header menu", async () => {
    const user = userEvent.setup()

    render(<HeaderSection />)

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
})
