import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import FeatureList from "~/components/FeatureList"

describe("FeatureList", () => {
  it("renders nothing when no items are provided", () => {
    const { container } = render(
      <FeatureList title="Highlights" items={[]} variant="success" />,
    )

    expect(container.firstChild).toBeNull()
  })

  it("renders the success tone when requested", () => {
    const { container } = render(
      <FeatureList
        title="Highlights"
        items={["Fast", "Safe"]}
        variant="success"
      />,
    )

    const heading = screen.getByRole("heading", { name: "Highlights" })
    const panel = heading.parentElement?.querySelector("div.rounded-lg")
    const items = screen.getAllByRole("listitem")

    expect(heading.querySelector("div")).toHaveClass("bg-success")
    expect(panel).toHaveClass("bg-success-soft", "border-success-border")
    expect(items).toHaveLength(2)
    items.forEach((item) => {
      expect(item).toHaveClass("text-success-soft-foreground")
      expect(item.querySelector("div")).toHaveClass("bg-success")
    })
    expect(container).toHaveTextContent("Fast")
    expect(container).toHaveTextContent("Safe")
  })

  it("renders the primary tone when requested", () => {
    render(
      <FeatureList
        title="Roadmap"
        items={["Sync", "Export"]}
        variant="primary"
      />,
    )

    const heading = screen.getByRole("heading", { name: "Roadmap" })
    const panel = heading.parentElement?.querySelector("div.rounded-lg")
    const items = screen.getAllByRole("listitem")

    expect(heading.querySelector("div")).toHaveClass("bg-primary")
    expect(panel).toHaveClass("bg-primary-soft", "border-primary-soft-border")
    items.forEach((item) => {
      expect(item).toHaveClass("text-primary-soft-foreground")
      expect(item.querySelector("div")).toHaveClass("bg-primary")
    })
  })
})
