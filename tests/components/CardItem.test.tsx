import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CardItem } from "~/components/ui/CardItem"

describe("CardItem", () => {
  it("adds top spacing above left content when header copy is present", () => {
    render(
      <CardItem
        title="Title"
        leftContent={<span data-testid="left-content">Left content</span>}
      />,
    )

    expect(screen.getByTestId("left-content").parentElement).toHaveClass("mt-2")
  })

  it("omits top spacing above left content when header copy is absent", () => {
    render(
      <CardItem
        leftContent={<span data-testid="left-content">Left content</span>}
      />,
    )

    expect(screen.getByTestId("left-content").parentElement).not.toHaveClass(
      "mt-2",
    )
  })
})
