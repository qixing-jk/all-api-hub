import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import Header from "~/entrypoints/options/components/Header"
import {
  openBugReportPage,
  openCommunityPage,
  openFeatureRequestPage,
} from "~/utils/navigation"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("~/contexts/ReleaseUpdateStatusContext", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/contexts/ReleaseUpdateStatusContext")
    >()

  return {
    ...actual,
    useReleaseUpdateStatus: () => ({
      status: null,
      isLoading: false,
      isChecking: false,
      error: null,
      refresh: vi.fn(),
      checkNow: vi.fn(),
    }),
  }
})

vi.mock("~/assets/icon.png", () => ({
  default: "icon.png",
}))

vi.mock("~/components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher" />,
}))

vi.mock("~/entrypoints/options/components/HeaderThemeSwitcher", () => ({
  default: () => <div data-testid="theme-switcher" />,
}))

vi.mock("~/utils/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/navigation")>()
  return {
    ...actual,
    openBugReportPage: vi.fn(),
    openCommunityPage: vi.fn(),
    openFeatureRequestPage: vi.fn(),
  }
})

const mockedOpenBugReportPage = vi.mocked(openBugReportPage)
const mockedOpenCommunityPage = vi.mocked(openCommunityPage)
const mockedOpenFeatureRequestPage = vi.mocked(openFeatureRequestPage)

describe("options Header", () => {
  it("exposes feedback shortcuts from the options header", async () => {
    const user = userEvent.setup()

    render(
      <Header
        onSearchOpen={vi.fn()}
        onTitleClick={vi.fn()}
        onMenuToggle={vi.fn()}
        isMobileSidebarOpen={false}
      />,
    )

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
      await screen.findByRole("menuitem", { name: "ui:feedback.community" }),
    )
    expect(mockedOpenCommunityPage).toHaveBeenCalledTimes(1)
    expect(mockedOpenCommunityPage).toHaveBeenCalledWith("en")
  })
})
