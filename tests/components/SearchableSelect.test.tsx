import { describe, expect, it, vi } from "vitest"

import { SearchableSelect } from "~/components/ui"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

describe("SearchableSelect", () => {
  it("shows pending feedback instead of an empty result before options arrive", async () => {
    const props = { options: [], value: "", onChange: vi.fn(), open: true }
    const { rerender } = render(<SearchableSelect {...props} loading />)

    expect(
      await screen.findByRole("status", { name: "common:status.loading" }),
    ).toBeVisible()
    expect(
      screen.queryByText("ui:searchableSelect.noOptions"),
    ).not.toBeInTheDocument()

    rerender(<SearchableSelect {...props} loading={false} />)
    expect(screen.getByText("ui:searchableSelect.noOptions")).toBeVisible()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("keeps the selected label and custom entry available while options load", async () => {
    const onChange = vi.fn()
    const props = {
      options: [{ value: "saved", label: "Saved model" }],
      value: "saved",
      onChange,
      allowCustomValue: true,
      placeholder: "Choose a model",
    }
    const { rerender } = render(<SearchableSelect {...props} loading />)
    const trigger = await screen.findByRole("combobox")

    expect(trigger).toHaveAttribute("aria-busy", "true")
    expect(trigger).toHaveTextContent("Saved model")
    expect(trigger).not.toHaveTextContent("common:status.loading")
    expect(trigger).toBeEnabled()
    fireEvent.click(trigger)
    expect(
      screen.queryByText("ui:searchableSelect.empty"),
    ).not.toBeInTheDocument()
    fireEvent.change(
      screen.getByPlaceholderText("ui:searchableSelect.searchPlaceholder"),
      {
        target: { value: "custom-model" },
      },
    )
    fireEvent.click(
      screen.getByRole("option", { name: "ui:searchableSelect.useValue" }),
    )
    expect(onChange).toHaveBeenCalledWith("custom-model")

    rerender(<SearchableSelect {...props} loading={false} />)
    expect(trigger).not.toHaveAttribute("aria-busy", "true")
    expect(trigger).toHaveTextContent("Saved model")
  })

  it("shows a custom-entry hint when options are empty and allowCustomValue is enabled", async () => {
    render(
      <SearchableSelect
        options={[]}
        value=""
        onChange={() => {}}
        allowCustomValue
      />,
    )

    const combo = await screen.findByRole("combobox")
    fireEvent.click(combo)

    expect(
      await screen.findByText("ui:searchableSelect.noOptionsAllowCustom"),
    ).toBeInTheDocument()
  })

  it("shows a no-options message when options are empty and allowCustomValue is disabled", async () => {
    render(<SearchableSelect options={[]} value="" onChange={() => {}} />)

    const combo = await screen.findByRole("combobox")
    fireEvent.click(combo)

    expect(
      await screen.findByText("ui:searchableSelect.noOptions"),
    ).toBeInTheDocument()
  })

  it("supports controlled open state", async () => {
    render(
      <SearchableSelect
        options={[
          {
            value: "account-1",
            label: "Account 1",
          },
        ]}
        value=""
        onChange={() => {}}
        open={true}
        onOpenChange={() => {}}
      />,
    )

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="searchable-select-trigger"]'),
      ).toHaveAttribute("aria-expanded", "true"),
    )
    expect(
      await screen.findByRole("option", { name: "Account 1" }),
    ).toBeVisible()
  })

  it("searches labels with selector-sensitive characters and returns the stable option value", async () => {
    const onChange = vi.fn()
    const selectorSensitiveOption = {
      value: "example-option-id",
      label: 'Example "quoted" \\label + alias (weight: 0.13)',
    }

    render(
      <SearchableSelect
        options={[
          selectorSensitiveOption,
          { value: "other-option-id", label: "Other option" },
        ]}
        value=""
        onChange={onChange}
        open={true}
        onOpenChange={() => {}}
      />,
    )

    const searchInput = await waitFor(() => {
      const input = document.querySelector('[data-slot="command-input"]')
      expect(input).toBeInTheDocument()
      return input as HTMLInputElement
    })
    fireEvent.change(searchInput, {
      target: { value: "quoted + alias" },
    })

    const option = await screen.findByRole("option", {
      name: selectorSensitiveOption.label,
    })
    expect(option).toBeVisible()
    expect(
      screen.queryByRole("option", { name: "Other option" }),
    ).not.toBeInTheDocument()

    fireEvent.click(option)
    expect(onChange).toHaveBeenCalledWith(selectorSensitiveOption.value)
  })

  it("uses default viewport-aware height constraints and supports option suffix content", async () => {
    render(
      <SearchableSelect
        options={[
          {
            value: "site-1",
            label: "Site 1",
            suffix: <span data-testid="site-1-count">3</span>,
          },
        ]}
        value=""
        onChange={() => {}}
        open={true}
        onOpenChange={() => {}}
      />,
    )

    expect(await screen.findByText("Site 1")).toBeInTheDocument()
    const commandItem = document.querySelector(
      '[data-slot="command-item"]',
    ) as HTMLElement
    expect(within(commandItem).getByTestId("site-1-count")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
    expect(document.querySelector('[data-slot="popover-content"]')).toHaveClass(
      "max-h-(--radix-popover-content-available-height)",
      "flex",
      "flex-col",
      "overflow-hidden",
    )
    expect(document.querySelector('[data-slot="command"]')).toHaveClass(
      "min-h-0",
      "flex-1",
      "[&>[data-slot=command-input-wrapper]]:shrink-0",
    )
    expect(document.querySelector('[data-slot="command-list"]')).toHaveClass(
      "max-h-none",
      "min-h-0",
      "flex-1",
    )
  })
})
