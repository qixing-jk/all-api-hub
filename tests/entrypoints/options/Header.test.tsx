import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

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
  beforeEach(() => {
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      writable: true,
      value: 0,
    })
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === "(max-width: 767px)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })

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

  it("keeps the logo title visible before scrolling on mobile", async () => {
    const { container } = render(
      <Header
        onSearchOpen={vi.fn()}
        onTitleClick={vi.fn()}
        onMenuToggle={vi.fn()}
        isMobileSidebarOpen={false}
      />,
    )

    expect(
      await screen.findByRole("link", { name: "ui:app.name" }),
    ).toBeInTheDocument()
    expect(
      container.textContent?.match(/ui:optionsSearch\.placeholder/g)?.length ??
        0,
    ).toBe(1)
  })

  it("switches to the expanded mobile search trigger after scrolling", async () => {
    window.scrollY = 48

    const { container } = render(
      <Header
        onSearchOpen={vi.fn()}
        onTitleClick={vi.fn()}
        onMenuToggle={vi.fn()}
        isMobileSidebarOpen={false}
      />,
    )

    window.dispatchEvent(new Event("scroll"))

    expect(
      await screen.findByText("ui:optionsSearch.placeholder"),
    ).toBeInTheDocument()
    expect(
      container.textContent?.match(/ui:optionsSearch\.placeholder/g)?.length ??
        0,
    ).toBe(2)
    expect(
      screen.queryByRole("link", { name: "ui:app.name" }),
    ).not.toBeInTheDocument()
  })
})
