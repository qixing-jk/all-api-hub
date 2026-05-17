import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CardItem } from "~/components/ui/CardItem"

describe("CardItem", () => {
  it("uses container-width responsive layout instead of viewport-only rows", () => {
    const { container } = render(
      <CardItem
        title="Title"
        description="Description"
        rightContent={<span data-testid="right-content">Right</span>}
      />,
    )

    expect(container.firstElementChild).toHaveClass(
      "[container-type:inline-size]",
      "flex-col",
      "[@container(min-width:42rem)]:flex-row",
    )
    expect(screen.getByTestId("right-content").parentElement).toHaveClass(
      "w-full",
      "[@container(min-width:42rem)]:w-auto",
    )
  })

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

  it("adds top spacing above left content when only description is present", () => {
    render(
      <CardItem
        description="Desc"
        leftContent={<span data-testid="left-content">Left</span>}
      />,
    )

    expect(screen.getByTestId("left-content").parentElement).toHaveClass("mt-2")
  })
})
