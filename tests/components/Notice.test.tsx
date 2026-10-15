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
    expect(notice).toHaveClass("bg-warning-soft")
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
    expect(notice.className).toContain("bg-primary-soft")
    expect(screen.getByText("Saved for later")).toBeVisible()
  })

  it("renders a neutral tone notice with muted styling", () => {
    render(
      <Notice
        tone="neutral"
        title="Neutral Notice"
        description="A neutral contextual hint."
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    const notice = screen.getByRole("status")
    expect(notice).toHaveAttribute("data-tone", "neutral")
    expect(notice.className).toContain("bg-muted/40")
    expect(screen.getByText("Neutral Notice")).toBeVisible()
    expect(screen.getByText("A neutral contextual hint.")).toBeVisible()
  })

  it("renders a compact sm size notice without circular icon badge and with iconWrapperClassName", () => {
    render(
      <Notice
        tone="neutral"
        size="sm"
        icon={<span data-testid="custom-icon">icon</span>}
        iconWrapperClassName="custom-icon-wrapper"
        description="Compact hint"
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withUserPreferencesProvider: false,
        withThemeProvider: false,
      },
    )

    const notice = screen.getByRole("status")
    expect(notice.className).toContain("py-density-2")
    expect(notice.className).not.toContain("shadow-xs")

    const iconWrapper = screen.getByTestId("custom-icon").parentElement
    expect(iconWrapper).toHaveClass("custom-icon-wrapper")
    expect(iconWrapper).not.toHaveClass("size-6")
    expect(iconWrapper).not.toHaveClass("rounded-full")
  })
})
