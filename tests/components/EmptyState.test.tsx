import { describe, expect, it, vi } from "vitest"

import { EmptyState } from "~/components/ui"
import { render, screen } from "~~/tests/test-utils/render"

describe("EmptyState", () => {
  it("renders a loading label for a loading single action", async () => {
    render(
      <EmptyState
        icon={<span>state</span>}
        title="Configuration required"
        action={{
          label: "Check now",
          loadingLabel: "Checking...",
          loading: true,
          onClick: vi.fn(),
        }}
      />,
    )

    const action = await screen.findByRole("button", { name: "Checking..." })

    expect(action).toHaveTextContent("Checking...")
    expect(action).not.toHaveTextContent("Check now")
  })

  it("keeps the action label while loading when no loading label is provided", async () => {
    render(
      <EmptyState
        icon={<span>state</span>}
        title="Configuration required"
        action={{
          label: "Check now",
          loading: true,
          onClick: vi.fn(),
        }}
      />,
    )

    expect(
      await screen.findByRole("button", { name: "Check now" }),
    ).toHaveTextContent("Check now")
  })

  it("renders a loading label only for the loading action in an action list", async () => {
    render(
      <EmptyState
        icon={<span>state</span>}
        title="Configuration required"
        actions={[
          {
            label: "Create key",
            loadingLabel: "Creating...",
            loading: true,
            onClick: vi.fn(),
          },
          {
            label: "Open settings",
            loadingLabel: "Opening...",
            onClick: vi.fn(),
          },
        ]}
      />,
    )

    const loadingAction = await screen.findByRole("button", {
      name: "Creating...",
    })

    expect(loadingAction).toHaveTextContent("Creating...")
    expect(loadingAction).not.toHaveTextContent("Create key")
    expect(
      screen.getByRole("button", { name: "Open settings" }),
    ).toBeInTheDocument()
  })

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
