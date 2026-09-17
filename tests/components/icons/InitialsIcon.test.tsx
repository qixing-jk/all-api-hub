import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { InitialsIcon } from "~/components/icons/InitialsIcon"

describe("InitialsIcon", () => {
  it("renders the caller-provided monogram as a decorative icon", () => {
    render(
      <InitialsIcon
        initials="EX"
        className="h-4 w-4 text-current"
        aria-hidden={true}
      />,
    )

    const icon = screen.getByText("EX")

    expect(icon).toHaveAttribute("aria-hidden", "true")
    expect(icon).toHaveClass("h-4", "w-4", "text-current")
  })

  it("uses fixed small-icon font sizes for one- and two-character monograms", () => {
    render(
      <>
        <InitialsIcon initials="E" aria-hidden={true} />
        <InitialsIcon initials="EX" aria-hidden={true} />
      </>,
    )

    expect(screen.getByText("E")).toHaveClass("text-[9px]")
    expect(screen.getByText("EX")).toHaveClass("text-[8px]")
  })
})
