import { describe, expect, it, vi } from "vitest"

import { EmptyState } from "~/components/ui"
import { render, screen } from "~~/tests/test-utils/render"

describe("EmptyState", () => {
  it("renders a trailing action icon when rightIcon is provided", async () => {
    const onClick = vi.fn()
    const { container } = render(
      <EmptyState
        icon={<span data-testid="state-icon">state</span>}
        title="Configuration required"
        action={{
          label: "Open settings",
          onClick,
          rightIcon: (
            <span data-testid="right-icon" aria-hidden="true">
              arrow
            </span>
          ),
        }}
      />,
    )

    const button = await screen.findByRole("button", { name: "Open settings" })
    expect(button).toBeInTheDocument()
    expect(screen.getByTestId("right-icon")).toHaveTextContent("arrow")
    expect(container.querySelector("button span:last-child")).toHaveTextContent(
      "arrow",
    )
  })

  it("keeps the legacy action icon as the leading button icon", async () => {
    const onClick = vi.fn()
    const { container } = render(
      <EmptyState
        icon={<span data-testid="state-icon">state</span>}
        title="Configuration required"
        action={{
          label: "Open settings",
          onClick,
          icon: (
            <span data-testid="left-icon" aria-hidden="true">
              gear
            </span>
          ),
        }}
      />,
    )

    const button = await screen.findByRole("button", { name: "Open settings" })
    expect(button).toBeInTheDocument()
    expect(screen.getByTestId("left-icon")).toHaveTextContent("gear")
    expect(
      container.querySelector("button span:first-child"),
    ).toHaveTextContent("gear")
  })
})
