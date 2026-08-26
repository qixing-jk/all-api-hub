import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { CardItem } from "~/components/ui/CardItem"
import { Switch } from "~/components/ui/Switch"

describe("CardItem", () => {
  it("stacks non-switch settings content until the card container is wide enough", () => {
    const { container } = render(
      <CardItem
        title="Title"
        description="Description"
        rightContent={<span data-testid="right-content">Right</span>}
      />,
    )

    const cardItem = container.firstElementChild
    const contentLayout = container.querySelector(
      '[data-slot="card-item-content"]',
    )

    expect(cardItem).toHaveClass("[container-type:inline-size]")
    expect(contentLayout).toHaveClass(
      "flex-col",
      "items-start",
      "text-left",
      "[@container(min-width:42rem)]:flex-row",
      "[@container(min-width:42rem)]:items-center",
    )
    expect(screen.getByTestId("right-content").parentElement).toHaveClass(
      "flex",
      "w-full",
      "justify-end",
      "[@container(min-width:42rem)]:ml-auto",
      "[@container(min-width:42rem)]:block",
      "[@container(min-width:42rem)]:w-auto",
      "[@container(min-width:42rem)]:flex-none",
    )
  })

  it("keeps a direct switch on the right in an inline layout", () => {
    const { container } = render(
      <CardItem
        title="Title"
        description="Description"
        rightContent={<Switch checked={false} onChange={() => undefined} />}
      />,
    )

    const contentLayout = container.querySelector(
      '[data-slot="card-item-content"]',
    )
    const control = container.querySelector('[data-slot="card-item-control"]')

    expect(contentLayout).toHaveClass(
      "has-[>[data-slot=card-item-control]>[data-slot=switch]]:flex-row",
      "has-[>[data-slot=card-item-control]>[data-slot=switch]]:items-center",
    )
    expect(control).toHaveClass(
      "has-[>[data-slot=switch]]:ml-auto",
      "has-[>[data-slot=switch]]:w-auto",
      "has-[>[data-slot=switch]]:flex-none",
    )
  })

  it("composes a task-specific right-content width override", () => {
    render(
      <CardItem
        title="Title"
        rightContent={<span data-testid="right-content">Right</span>}
        rightContentClassName="[@container(min-width:42rem)]:flex-1"
      />,
    )

    expect(screen.getByTestId("right-content").parentElement).toHaveClass(
      "[@container(min-width:42rem)]:flex-1",
    )
    expect(screen.getByTestId("right-content").parentElement).not.toHaveClass(
      "[@container(min-width:42rem)]:flex-none",
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
