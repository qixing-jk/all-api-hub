import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CardItem } from "~/components/ui/CardItem"

describe("CardItem", () => {
  it("keeps settings rows horizontal on wider viewports while allowing child content to respond to container width", () => {
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
      "sm:flex-row",
    )
    expect(screen.getByTestId("right-content").parentElement).toHaveClass(
      "w-full",
      "sm:ml-auto",
      "sm:w-auto",
      "sm:flex-none",
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

  it("renders supplemental title content beside the title", () => {
    render(
      <CardItem
        title="Bookmarks"
        titleContent={<span data-testid="title-badge">Granted</span>}
        rightContent={<button type="button">Remove</button>}
      />,
    )

    const title = screen.getByText("Bookmarks")
    const badge = screen.getByTestId("title-badge")

    expect(title.parentElement).toHaveClass("flex", "flex-wrap", "gap-2")
    expect(title.parentElement).toContainElement(badge)
    expect(
      screen.getByRole("button", { name: "Remove" }).parentElement,
    ).not.toContainElement(badge)
  })
})
