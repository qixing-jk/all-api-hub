import { fireEvent, render as rtlRender, screen } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { REPO_URL } from "~/constants/about"
import { OptionsSidebarFooter } from "~/features/OptionsMenu/OptionsSidebarFooter"
import { createTab } from "~/utils/browser/tabs"
import { testI18n } from "~~/tests/test-utils/i18n"

const { useIsStarredMock } = vi.hoisted(() => ({
  useIsStarredMock: vi.fn(),
}))

vi.mock("~/features/StarPromotion/useStarPromotionActive", () => ({
  useIsStarred: () => useIsStarredMock(),
}))

vi.mock("~/utils/browser/tabs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser/tabs")>()
  return { ...actual, createTab: vi.fn().mockResolvedValue(undefined) }
})

vi.mock("~/features/OptionsMenu/SupportCommunityPopover", () => ({
  SupportCommunityPopover: ({
    section,
    children,
  }: {
    section: string
    children: React.ReactNode
  }) => (
    <div data-testid={`support-popover-${section}-wrapper`}>{children}</div>
  ),
}))

const render = (ui: React.ReactElement) =>
  rtlRender(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>)

describe("OptionsSidebarFooter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useIsStarredMock.mockReturnValue(false) // not starred yet
  })

  it("renders 4 footer links in expanded mode when not yet starred", () => {
    render(<OptionsSidebarFooter isCollapsed={false} />)

    const footer = screen.getByTestId("options-sidebar-footer")
    expect(footer).toBeInTheDocument()

    // 4 main buttons
    const githubBtn = screen.getByTestId("sidebar-footer-github")
    const docsBtn = screen.getByTestId("sidebar-footer-docs")
    const sponsorBtn = screen.getByTestId("sidebar-footer-sponsor")
    const communityBtn = screen.getByTestId("sidebar-footer-community")

    expect(githubBtn).toBeInTheDocument()
    expect(docsBtn).toBeInTheDocument()
    expect(sponsorBtn).toBeInTheDocument()
    expect(communityBtn).toBeInTheDocument()

    // Star icon is outline (not filled)
    const starIcon = screen.getByTestId("sidebar-footer-star-icon")
    expect(starIcon).toBeInTheDocument()
    expect(starIcon).not.toHaveClass("fill-star")
  })

  it("handles clicking github button when not yet starred (opens repo)", () => {
    render(<OptionsSidebarFooter isCollapsed={false} />)

    const githubBtn = screen.getByTestId("sidebar-footer-github")
    fireEvent.click(githubBtn)

    expect(createTab).toHaveBeenCalledWith(REPO_URL, true)
  })

  it("renders starred state correctly (golden style, opens repo)", () => {
    useIsStarredMock.mockReturnValue(true) // already starred

    render(<OptionsSidebarFooter isCollapsed={false} />)

    expect(
      screen.queryByTestId("sidebar-footer-already-starred"),
    ).not.toBeInTheDocument()

    // Star icon is filled gold
    const starIcon = screen.getByTestId("sidebar-footer-star-icon")
    expect(starIcon).toBeInTheDocument()
    expect(starIcon).toHaveClass("fill-star")

    const githubBtn = screen.getByTestId("sidebar-footer-github")
    fireEvent.click(githubBtn)

    expect(createTab).toHaveBeenCalledWith(REPO_URL, true)
  })

  it("routes docs, community, and sponsor actions", () => {
    render(<OptionsSidebarFooter isCollapsed={false} />)

    fireEvent.click(screen.getByTestId("sidebar-footer-docs"))
    expect(createTab).toHaveBeenCalledWith(
      expect.stringContaining("http"),
      true,
    )

    const sponsorWrapper = screen.getByTestId(
      "support-popover-sponsors-wrapper",
    )
    expect(sponsorWrapper).toContainElement(
      screen.getByTestId("sidebar-footer-sponsor"),
    )

    const communityWrapper = screen.getByTestId(
      "support-popover-community-wrapper",
    )
    expect(communityWrapper).toContainElement(
      screen.getByTestId("sidebar-footer-community"),
    )
  })

  it("renders compact icon buttons with accessible labels when collapsed", () => {
    render(<OptionsSidebarFooter isCollapsed={true} />)

    const footer = screen.getByTestId("options-sidebar-footer")
    expect(footer).toHaveClass("flex-col")

    const githubBtn = screen.getByTestId("sidebar-footer-github")
    const docsBtn = screen.getByTestId("sidebar-footer-docs")
    const sponsorBtn = screen.getByTestId("sidebar-footer-sponsor")
    const communityBtn = screen.getByTestId("sidebar-footer-community")

    expect(githubBtn).toHaveAttribute("aria-label")
    expect(docsBtn).toHaveAttribute("aria-label")
    expect(sponsorBtn).toHaveAttribute("aria-label")
    expect(communityBtn).toHaveAttribute("aria-label")

    // Clicking docs in collapsed mode opens documentation
    fireEvent.click(docsBtn)
    expect(createTab).toHaveBeenCalledWith(
      expect.stringContaining("http"),
      true,
    )
  })
})
