import { describe, expect, it, vi } from "vitest"

import { EmptyState } from "~/components/ui"
import { render, screen } from "~~/tests/test-utils/render"

describe("EmptyState", () => {
  it("renders a trailing action icon when rightIcon is provided", async () => {
    const onClick = vi.fn()
    render(
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
    const rightIcon = screen.getByTestId("right-icon")
    const labelNode = Array.from(button.childNodes).find(
      (node) =>
        node.nodeType === Node.TEXT_NODE &&
        node.textContent?.includes("Open settings"),
    )

    expect(button).toBeInTheDocument()
    expect(labelNode).toBeTruthy()
    expect(rightIcon).toHaveTextContent("arrow")
    expect(
      rightIcon.parentElement!.compareDocumentPosition(labelNode!) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy()
  })

  it("keeps the legacy action icon as the leading button icon", async () => {
    const onClick = vi.fn()
    render(
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
    const leftIcon = screen.getByTestId("left-icon")
    const labelNode = Array.from(button.childNodes).find(
      (node) =>
        node.nodeType === Node.TEXT_NODE &&
        node.textContent?.includes("Open settings"),
    )

    expect(button).toBeInTheDocument()
    expect(labelNode).toBeTruthy()
    expect(leftIcon).toHaveTextContent("gear")
    expect(
      leftIcon.parentElement!.compareDocumentPosition(labelNode!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
