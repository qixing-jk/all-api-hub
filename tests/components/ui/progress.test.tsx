import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Progress } from "~/components/ui/progress"

describe("Progress", () => {
  it("maps a value against its maximum and exposes progress semantics", () => {
    render(
      <Progress
        aria-label="Account check progress"
        value={2}
        max={4}
        indicatorClassName="bg-emerald-600"
      />,
    )

    const progress = screen.getByRole("progressbar", {
      name: "Account check progress",
    })
    expect(progress).toHaveAttribute("aria-valuemax", "4")
    expect(progress).toHaveAttribute("aria-valuenow", "2")

    const indicator = progress.querySelector('[data-slot="progress-indicator"]')
    expect(indicator).toHaveClass("bg-emerald-600")
    expect(indicator).toHaveStyle({ transform: "translateX(-50%)" })
  })

  it("clamps an out-of-range value to the configured maximum", () => {
    render(<Progress aria-label="Clamped progress" value={7} max={4} />)

    const progress = screen.getByRole("progressbar", {
      name: "Clamped progress",
    })
    expect(progress).toHaveAttribute("aria-valuenow", "4")
    expect(
      progress.querySelector('[data-slot="progress-indicator"]'),
    ).toHaveStyle({ transform: "translateX(-0%)" })
  })
})
