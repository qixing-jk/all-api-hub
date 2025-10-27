import { describe, it, expect } from "vitest"
import { render, screen } from "~/tests/test-utils/render"
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline"
import LinkCard from "../LinkCard"

describe("LinkCard", () => {
  const defaultProps = {
    Icon: ExclamationTriangleIcon,
    title: "Test Title",
    description: "Test description text",
    href: "https://example.com",
    buttonText: "Click Me"
  }

  it("should render correctly with required props", async () => {
    render(<LinkCard {...defaultProps} />)

    expect(await screen.findByText("Test Title")).toBeInTheDocument()
    expect(
      await screen.findByText("Test description text")
    ).toBeInTheDocument()
    expect(await screen.findByText("Click Me")).toBeInTheDocument()
  })

  it("should render the icon", async () => {
    const { container } = render(<LinkCard {...defaultProps} />)

    await screen.findByText("Test Title")
    const icon = container.querySelector("svg")
    expect(icon).toBeInTheDocument()
  })

  it("should render a link with correct href", async () => {
    render(<LinkCard {...defaultProps} />)

    const link = await screen.findByRole("link", { name: "Click Me" })
    expect(link).toHaveAttribute("href", "https://example.com")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("should apply custom button variant", async () => {
    render(<LinkCard {...defaultProps} buttonVariant="secondary" />)

    const button = await screen.findByRole("button", { name: "Click Me" })
    expect(button.className).toContain("bg-gray-200")
  })

  it("should apply custom icon class", async () => {
    const { container } = render(
      <LinkCard {...defaultProps} iconClass="text-red-500" />
    )

    await screen.findByText("Test Title")
    const icon = container.querySelector("svg")
    expect(icon).toHaveClass("text-red-500")
  })

  it("should have correct layout structure", async () => {
    const { container } = render(<LinkCard {...defaultProps} />)

    await screen.findByText("Test Title")
    const flexContainer = container.querySelector(".flex.items-start")
    expect(flexContainer).toBeInTheDocument()
  })
})
