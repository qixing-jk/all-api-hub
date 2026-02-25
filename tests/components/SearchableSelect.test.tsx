import { describe, expect, it } from "vitest"

import { SearchableSelect } from "~/components/ui"
import { fireEvent, render, screen } from "~/tests/test-utils/render"

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
})
