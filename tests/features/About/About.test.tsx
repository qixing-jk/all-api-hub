import { describe, expect, it, vi } from "vitest"

import About from "~/features/About/About"
import { getFeedbackDestinationUrls } from "~/utils/navigation/feedbackLinks"
import { render, screen } from "~~/tests/test-utils/render"

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

describe("About", () => {
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
})
