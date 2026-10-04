import { beforeEach, describe, expect, it, vi } from "vitest"

import About from "~/features/About/About"
import { getFeedbackDestinationUrls } from "~/utils/navigation/feedbackLinks"
import { render, screen } from "~~/tests/test-utils/render"

const { useIsStarredMock } = vi.hoisted(() => ({
  useIsStarredMock: vi.fn(),
}))

vi.mock("~/features/StarPromotion/useStarPromotionActive", () => ({
  useIsStarred: () => useIsStarredMock(),
}))

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

vi.mock("~/features/ProductTour", () => ({
  ProductTourReplayCard: () => null,
}))

describe("About", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useIsStarredMock.mockReturnValue(false) // not starred yet
  })
  it("shows feedback and support links wired to the shared destinations", async () => {
    render(<About />, { withReleaseUpdateStatusProvider: false })

    expect(
      await screen.findByText("about:feedbackSection.title"),
    ).toBeInTheDocument()

    const feedbackUrls = getFeedbackDestinationUrls("en")

    expect(
      await screen.findByRole("link", {
        name: "about:feedbackSection.bugReport.button",
      }),
    ).toHaveAttribute("href", feedbackUrls.bugReport)
    expect(
      await screen.findByRole("link", {
        name: "about:feedbackSection.featureRequest.button",
      }),
    ).toHaveAttribute("href", feedbackUrls.featureRequest)
    expect(
      await screen.findByRole("link", {
        name: "about:feedbackSection.languageRequest.button",
      }),
    ).toHaveAttribute("href", feedbackUrls.languageRequest)
    const communityLink = await screen.findByRole("link", {
      name: "about:feedbackSection.community.button",
    })
    expect(communityLink).toHaveAttribute("href", feedbackUrls.community)

    const discussionLink = await screen.findByRole("link", {
      name: "about:feedbackSection.discussion.button",
    })
    expect(discussionLink).toHaveAttribute("href", feedbackUrls.discussions)
    expect(
      communityLink.compareDocumentPosition(discussionLink) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it("renders unstarred GitHub repo card with 'starRepo' button and no badge", async () => {
    render(<About />, { withReleaseUpdateStatusProvider: false })

    const starLink = await screen.findByRole("link", {
      name: "about:starRepo",
    })
    expect(starLink).toBeInTheDocument()

    expect(
      screen.queryByTestId("about-github-already-starred"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("about-github-starred-badge"),
    ).not.toBeInTheDocument()
  })

  it("renders starred GitHub repo card with 'viewRepo' button, badge, and no self-report action", async () => {
    useIsStarredMock.mockReturnValue(true) // starred

    render(<About />, { withReleaseUpdateStatusProvider: false })

    expect(
      await screen.findByRole("link", { name: "about:viewRepo" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "about:starRepo" }),
    ).not.toBeInTheDocument()

    const badge = screen.getByTestId("about-github-starred-badge")
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent("about:alreadyStarred")

    expect(
      screen.queryByTestId("about-github-already-starred"),
    ).not.toBeInTheDocument()
  })
})
