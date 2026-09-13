import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { expect, it } from "vitest"

import { FeedbackReportPreview } from "~/features/CheckInFeedback/FeedbackReportPreview"
import { composeCheckInFeedback } from "~/services/checkin/feedback/report"

it("renders the outgoing issue with expandable literal diagnostics and sanitized user Markdown", async () => {
  const user = userEvent.setup()
  const { rerender } = render(
    <FeedbackReportPreview
      content={composeCheckInFeedback({
        labels: {
          site: "Site",
          problem: "What happened",
          details: "Diagnostics",
          clues: "Clues",
        },
        origin: "https://example.com",
        notes:
          "**Website works**\n\n[Help](https://example.com/help)\n<script>alert(1)</script>",
        details: "```\n</details>\n<script>literal diagnostic</script>",
        clues: "",
      })}
    />,
  )
  expect(screen.getByRole("heading", { name: "What happened" })).toBeVisible()
  expect(screen.getByText("Website works")).toBeVisible()
  const link = screen.getByRole("link", { name: "Help" })
  expect(link).toHaveAttribute("target", "_blank")
  expect(link).toHaveAttribute("rel", "noopener noreferrer")
  expect(screen.queryByText("alert(1)")).not.toBeInTheDocument()
  await user.click(screen.getByText("Diagnostics"))
  expect(screen.getByText(/literal diagnostic/)).toBeVisible()
  screen.getByText("Diagnostics").focus()
  rerender(
    <FeedbackReportPreview
      content={
        "## Changed description\n\n<details>\n<summary>Diagnostics</summary>\n\n```text\nupdated diagnostic\n```\n\n</details>"
      }
    />,
  )
  expect(screen.getByText("updated diagnostic")).toBeVisible()
  expect(screen.getByText("Diagnostics")).toHaveFocus()
})
