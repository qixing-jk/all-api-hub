import { describe, expect, it } from "vitest"

import { Button, Notice } from "~/components/ui"
import { render, screen } from "~~/tests/test-utils/render"

describe("Notice", () => {
  it("renders a polite status notice with title, description, and actions", () => {
    render(
      <Notice
        tone="warning"
        title="Connection interrupted"
        description="Use a steadier surface to continue."
        actions={<Button size="sm">Continue</Button>}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    const notice = screen.getByRole("status")
    expect(notice).toHaveAttribute("aria-live", "polite")
    expect(notice.className).toContain("bg-amber-50")
    expect(screen.getByText("Connection interrupted")).toBeVisible()
    expect(
      screen.getByText("Use a steadier surface to continue."),
    ).toBeVisible()
    expect(screen.getByRole("button", { name: "Continue" })).toBeVisible()
  })

  it("renders children without optional copy, actions, or icon", () => {
    render(
      <Notice icon={null}>
        <span>Saved for later</span>
      </Notice>,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    const notice = screen.getByRole("status")
    expect(notice).not.toHaveAttribute("aria-labelledby")
    expect(notice).not.toHaveAttribute("aria-describedby")
    expect(notice.className).toContain("bg-blue-50")
    expect(screen.getByText("Saved for later")).toBeVisible()
  })
})
