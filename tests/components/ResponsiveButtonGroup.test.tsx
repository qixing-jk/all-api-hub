import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  ResponsiveButtonGroup,
  ResponsiveToggleGroup,
} from "~/components/ResponsiveButtonGroup"

describe("ResponsiveButtonGroup", () => {
  it("provides a wrapping segmented container for narrow settings cards", () => {
    render(
      <ResponsiveButtonGroup aria-label="Display mode">
        <button type="button">One</button>
        <button type="button">Two</button>
      </ResponsiveButtonGroup>,
    )

    expect(screen.getByRole("group", { name: "Display mode" })).toHaveClass(
      "flex",
      "w-full",
      "flex-wrap",
      "[@container(min-width:42rem)]:w-auto",
    )
  })

  it("can render a plain wrapping container for regular buttons", () => {
    render(
      <ResponsiveButtonGroup variant="plain" aria-label="Shield method">
        <button type="button">Composite</button>
      </ResponsiveButtonGroup>,
    )

    expect(screen.getByRole("group", { name: "Shield method" })).toHaveClass(
      "flex",
      "w-full",
      "flex-wrap",
      "gap-2",
      "[@container(min-width:42rem)]:w-auto",
    )
  })
})

describe("ResponsiveToggleGroup", () => {
  it("renders responsive toggle buttons and reports value changes", () => {
    const onValueChange = vi.fn()

    render(
      <ResponsiveToggleGroup
        aria-label="Currency"
        value="USD"
        onValueChange={onValueChange}
        options={[
          {
            value: "USD",
            label: "USD",
            ariaLabel: "US Dollar",
          },
          {
            value: "CNY",
            label: "CNY",
            ariaLabel: "Chinese Yuan",
          },
        ]}
      />,
    )

    const usdButton = screen.getByRole("button", { name: "US Dollar" })
    const cnyButton = screen.getByRole("button", { name: "Chinese Yuan" })

    expect(usdButton).toHaveClass(
      "min-w-fit",
      "flex-1",
      "[@container(min-width:42rem)]:flex-none",
    )
    expect(usdButton).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(cnyButton)

    expect(onValueChange).toHaveBeenCalledWith("CNY")
  })
})
