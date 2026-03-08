import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import HeaderSection from "~/entrypoints/popup/components/HeaderSection"
import { isExtensionSidePanel } from "~/utils/browser"
import {
  openApiCredentialProfilesPage,
  openBugReportPage,
  openDiscussionsPage,
  openFeatureRequestPage,
  openFullAccountManagerPage,
  openFullBookmarkManagerPage,
} from "~/utils/navigation"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

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

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    isRefreshing: false,
    handleRefresh: vi.fn().mockResolvedValue({ success: 0, failed: 0 }),
  }),
}))

vi.mock("~/utils/navigation", () => ({
  openApiCredentialProfilesPage: vi.fn(),
  openBugReportPage: vi.fn(),
  openDiscussionsPage: vi.fn(),
  openFeatureRequestPage: vi.fn(),
  openFullAccountManagerPage: vi.fn(),
  openFullBookmarkManagerPage: vi.fn(),
  openSettingsPage: vi.fn(),
  openSidePanelPage: vi.fn(),
}))

const mockedIsExtensionSidePanel = vi.mocked(isExtensionSidePanel)
const mockedOpenApiCredentialProfilesPage = vi.mocked(
  openApiCredentialProfilesPage,
)
const mockedOpenBugReportPage = vi.mocked(openBugReportPage)
const mockedOpenDiscussionsPage = vi.mocked(openDiscussionsPage)
const mockedOpenFeatureRequestPage = vi.mocked(openFeatureRequestPage)
const mockedOpenFullAccountManagerPage = vi.mocked(openFullAccountManagerPage)
const mockedOpenFullBookmarkManagerPage = vi.mocked(openFullBookmarkManagerPage)

describe("popup HeaderSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedIsExtensionSidePanel.mockReturnValue(false)
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
    await user.click(
      await screen.findByRole("menuitem", { name: "ui:feedback.discussion" }),
    )

    expect(mockedOpenDiscussionsPage).toHaveBeenCalledTimes(1)
  })
})
