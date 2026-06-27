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

  it("renders labels with selector-sensitive characters without crashing", async () => {
    const onChange = vi.fn()

    render(
      <SearchableSelect
        options={[
          {
            value: "model-1",
            label:
              'gpt-"稳定通道" - 目前是plus+pro池目前断断续续 (倍率： 0.13)',
          },
        ]}
        value=""
        onChange={onChange}
        open={true}
        onOpenChange={() => {}}
      />,
    )

    const option = await screen.findByRole("option", {
      name: /gpt-"稳定通道" - 目前是plus\+pro池目前断断续续/,
    })
    expect(option).toBeVisible()

    fireEvent.click(option)
    expect(onChange).toHaveBeenCalledWith("model-1")
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
      "overflow-hidden",
    )
    expect(document.querySelector('[data-slot="command-list"]')).toHaveClass(
      "max-h-[calc(var(--radix-popover-content-available-height)-2.25rem)]",
    )
  })
})
