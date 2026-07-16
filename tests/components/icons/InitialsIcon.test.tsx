import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  createInitialsIcon,
  InitialsIcon,
} from "~/components/icons/InitialsIcon"

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

  it("creates a stable icon component that forwards icon-like props", () => {
    const ExampleIcon = createInitialsIcon("E")

    render(<ExampleIcon className="h-3 w-3" aria-hidden={true} />)

    const icon = screen.getByText("E")

    expect(icon).toHaveAttribute("aria-hidden", "true")
    expect(icon).toHaveClass("h-3", "w-3")
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
