import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { SegmentedControl } from "~/components/SegmentedControl"
import { render } from "~~/tests/test-utils/render"

describe("SegmentedControl", () => {
  it("changes the selected option without submitting its enclosing form", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const onSubmit = vi.fn((event) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <SegmentedControl
          aria-label="Chart type"
          value="pie"
          onValueChange={onValueChange}
          options={[
            { value: "pie", label: "Pie" },
            { value: "bar", label: "Bar" },
          ]}
        />
      </form>,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    await user.click(screen.getByRole("button", { name: "Bar" }))

    expect(onValueChange).toHaveBeenCalledWith("bar")
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("renders responsive toggle buttons and reports value changes", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()

    render(
      <SegmentedControl
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
            testId: "currency-cny-option",
          },
        ]}
      />,
      { withUserPreferencesProvider: false, withThemeProvider: false },
    )

    const usdButton = screen.getByRole("button", { name: "US Dollar" })
    const cnyButton = screen.getByRole("button", { name: "Chinese Yuan" })

    expect(usdButton).toHaveClass(
      "min-w-fit",
      "flex-1",
      "[@container(min-width:42rem)]:flex-none",
      "scale-100",
    )
    expect(usdButton).not.toHaveClass("scale-105")
    expect(usdButton).toHaveAttribute("aria-pressed", "true")
    expect(cnyButton).toHaveAttribute("data-testid", "currency-cny-option")

    await user.click(cnyButton)

    expect(onValueChange).toHaveBeenCalledWith("CNY")
  })

  it("supports keyboard selection, skips disabled options, and preserves help text", async () => {
    const user = userEvent.setup()
    function Example() {
      const [value, setValue] = useState("keep")
      return (
        <SegmentedControl
          aria-label="Import strategy"
          value={value}
          onValueChange={setValue}
          options={[
            { value: "keep", label: "Keep" },
            { value: "replace", label: "Replace", disabled: true },
            {
              value: "merge",
              label: "Merge",
              description: "Keep existing records and add new ones.",
            },
          ]}
        />
      )
    }
    render(<Example />, {
      withUserPreferencesProvider: false,
      withThemeProvider: false,
    })
    const keep = screen.getByRole("button", { name: "Keep" })
    const replace = screen.getByRole("button", { name: "Replace" })
    const merge = screen.getByRole("button", { name: "Merge" })
    await user.tab()
    expect(keep).toHaveFocus()
    await user.tab()
    expect(merge).toHaveFocus()
    expect(replace).toBeDisabled()
    expect(merge).toHaveAccessibleDescription(
      "Keep existing records and add new ones.",
    )
    await user.keyboard("{Enter}")
    expect(merge).toHaveAttribute("aria-pressed", "true")
    expect(keep).toHaveAttribute("aria-pressed", "false")
    await user.tab({ shift: true })
    await user.keyboard(" ")
    expect(keep).toHaveAttribute("aria-pressed", "true")
    await user.click(replace)
    expect(keep).toHaveAttribute("aria-pressed", "true")
  })
})
