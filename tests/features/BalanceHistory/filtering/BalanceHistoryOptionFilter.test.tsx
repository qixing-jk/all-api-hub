import userEvent from "@testing-library/user-event"
import React from "react"
import { describe, expect, it } from "vitest"

import type { TagFilterOption } from "~/components/ui"
import { BalanceHistoryOptionFilter } from "~/features/BalanceHistory/filtering/BalanceHistoryOptionFilter"
import { render, screen } from "~~/tests/test-utils/render"

const options: TagFilterOption[] = [
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "development", label: "Development" },
  { value: "preview", label: "Preview" },
]

const manyOptions: TagFilterOption[] = Array.from(
  { length: 8 },
  (_, index) => ({ value: `alpha-${index}`, label: `Alpha ${index + 1}` }),
)

const filterProps = {
  title: "Tags",
  hint: "Choose tags",
  searchLabel: "Search tags",
  allLabel: "All tags",
  options,
  maxVisibleLines: 1,
}

const renderOptions = {
  withUserPreferencesProvider: false,
  withThemeProvider: false,
}

function renderFilter(initialValue: string[] = []) {
  function Harness() {
    const [value, setValue] = React.useState(initialValue)

    return (
      <>
        <BalanceHistoryOptionFilter
          {...filterProps}
          value={value}
          onChange={setValue}
        />
        <output aria-label="Selected values">{value.join(",")}</output>
      </>
    )
  }

  return render(<Harness />, renderOptions)
}

describe("BalanceHistoryOptionFilter", () => {
  it("filters with trimmed, case-insensitive text without losing hidden selections", async () => {
    const user = userEvent.setup()
    renderFilter(["staging"])

    const search = screen.getByRole("searchbox", { name: "Search tags" })
    expect(search).toHaveAttribute("placeholder", "Search tags")
    expect(screen.getByRole("button", { name: "All tags" })).toBeInTheDocument()

    await user.type(search, "  PROD")
    expect(screen.getByRole("button", { name: "Production" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "Staging" })).toBeNull()
    expect(screen.queryByRole("button", { name: "All tags" })).toBeNull()
    expect(screen.getByLabelText("Selected values")).toHaveTextContent(
      "staging",
    )

    await user.click(screen.getByRole("button", { name: "Production" }))
    expect(screen.getByLabelText("Selected values")).toHaveTextContent(
      "staging,production",
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.clear" }),
    )
    expect(search).toHaveValue("")
    expect(screen.getByRole("button", { name: "All tags" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Staging" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: "Production" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })

  it("shows every matching candidate while searching, beyond the default collapsed limit", async () => {
    const user = userEvent.setup()
    render(
      <BalanceHistoryOptionFilter
        {...filterProps}
        options={manyOptions}
        value={[]}
        onChange={() => undefined}
      />,
      renderOptions,
    )

    await user.type(
      screen.getByRole("searchbox", { name: "Search tags" }),
      "alpha",
    )

    for (let index = 1; index <= 8; index += 1) {
      expect(
        screen.getByRole("button", { name: `Alpha ${index}` }),
      ).toBeVisible()
    }
    expect(screen.queryByRole("button", { name: /more/i })).toBeNull()
    expect(screen.queryByRole("button", { name: "All tags" })).toBeNull()
  })

  it("shows the no-results message without changing the selected value", async () => {
    const user = userEvent.setup()
    renderFilter(["staging"])
    const search = screen.getByRole("searchbox", { name: "Search tags" })

    await user.type(search, "missing")

    expect(
      screen.getByText("balanceHistory:filters.noResults"),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Selected values")).toHaveTextContent(
      "staging",
    )
  })

  it("disables search when there are no options", () => {
    render(
      <BalanceHistoryOptionFilter
        {...filterProps}
        options={[]}
        value={[]}
        onChange={() => undefined}
      />,
      renderOptions,
    )

    expect(
      screen.getByRole("searchbox", { name: "Search tags" }),
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: "All tags" })).toBeDisabled()
  })

  it("resets search after unmount while preserving the parent selection", async () => {
    const user = userEvent.setup()

    function DrawerHarness() {
      const [isOpen, setIsOpen] = React.useState(true)
      const [value, setValue] = React.useState<string[]>(["staging"])

      return (
        <>
          <button type="button" onClick={() => setIsOpen((open) => !open)}>
            {isOpen ? "Close filters" : "Open filters"}
          </button>
          {isOpen && (
            <BalanceHistoryOptionFilter
              {...filterProps}
              value={value}
              onChange={setValue}
            />
          )}
          <output aria-label="Selected values">{value.join(",")}</output>
        </>
      )
    }

    render(<DrawerHarness />, renderOptions)
    await user.type(
      screen.getByRole("searchbox", { name: "Search tags" }),
      "prod",
    )
    await user.click(screen.getByRole("button", { name: "Close filters" }))
    expect(screen.getByLabelText("Selected values")).toHaveTextContent(
      "staging",
    )

    await user.click(screen.getByRole("button", { name: "Open filters" }))
    expect(screen.getByRole("searchbox", { name: "Search tags" })).toHaveValue(
      "",
    )
    expect(screen.getByRole("button", { name: "Staging" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  })
})
