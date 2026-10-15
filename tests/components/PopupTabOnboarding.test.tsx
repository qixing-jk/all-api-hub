import userEvent from "@testing-library/user-event"
import { Bookmark } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

import { PopupTabOnboarding } from "~/components/PopupTabOnboarding"
import { render, screen } from "~~/tests/test-utils/render"

describe("PopupTabOnboarding", () => {
  it("renders icon, title, description, and primary action button", async () => {
    const handleClick = vi.fn()

    render(
      <PopupTabOnboarding
        icon={Bookmark}
        title="No items found"
        titleId="test-title-id"
        description="Add your first item to get started."
        action={{
          label: "Add Item",
          onClick: handleClick,
          testId: "test-add-button",
        }}
      />,
    )

    const titleEl = await screen.findByRole("heading", {
      level: 2,
      name: "No items found",
    })
    expect(titleEl).toHaveAttribute("id", "test-title-id")
    expect(
      await screen.findByText("Add your first item to get started."),
    ).toBeInTheDocument()

    const button = await screen.findByTestId("test-add-button")
    expect(button).toHaveTextContent("Add Item")

    const user = userEvent.setup()
    await user.click(button)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it("renders extra content and sponsors section when provided", async () => {
    render(
      <PopupTabOnboarding
        icon={Bookmark}
        title="Title"
        description="Desc"
        action={{
          label: "Action",
          onClick: vi.fn(),
        }}
        extra={<div data-testid="extra-notice">Notice content</div>}
        sponsors={<div data-testid="sponsors-section">Sponsor items</div>}
      />,
    )

    expect(await screen.findByTestId("extra-notice")).toBeInTheDocument()
    expect(await screen.findByTestId("sponsors-section")).toBeInTheDocument()
  })

  it("supports omitting default container padding when padded=false", async () => {
    render(
      <PopupTabOnboarding
        icon={Bookmark}
        title="Title"
        description="Desc"
        action={{
          label: "Action",
          onClick: vi.fn(),
        }}
        data-testid="onboarding-root"
      />,
    )

    const paddedEl = await screen.findByTestId("onboarding-root")
    expect(paddedEl).toHaveClass("space-y-density-3", "py-density-3", "px-3")

    render(
      <PopupTabOnboarding
        icon={Bookmark}
        title="Title"
        description="Desc"
        action={{
          label: "Action",
          onClick: vi.fn(),
        }}
        padded={false}
        data-testid="unpadded-root"
      />,
    )

    const unpaddedEl = await screen.findByTestId("unpadded-root")
    expect(unpaddedEl).toHaveClass("space-y-density-3")
    expect(unpaddedEl).not.toHaveClass("py-density-3")
  })

  it("renders without action button when action is omitted", async () => {
    render(
      <PopupTabOnboarding
        icon={Bookmark}
        title="Title"
        description="Desc"
        data-testid="no-action-root"
      />,
    )

    expect(
      await screen.findByRole("heading", { level: 2, name: "Title" }),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
