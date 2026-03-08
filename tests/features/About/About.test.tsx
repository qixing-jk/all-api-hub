import { describe, expect, it } from "vitest"

import About from "~/features/About/About"
import { getFeedbackDestinationUrls } from "~/utils/navigation/feedbackLinks"
import { render, screen } from "~~/tests/test-utils/render"

describe("About", () => {
  it("shows feedback and support links wired to the shared destinations", async () => {
    render(<About />)

    expect(
      await screen.findByText("about:feedbackSection.title"),
    ).toBeInTheDocument()

    const feedbackUrls = getFeedbackDestinationUrls()

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
        name: "about:feedbackSection.discussion.button",
      }),
    ).toHaveAttribute("href", feedbackUrls.discussions)
  })
})
