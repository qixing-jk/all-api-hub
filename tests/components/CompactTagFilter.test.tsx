import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { I18nextProvider } from "react-i18next"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { CompactTagFilter } from "~/components/ui/CompactTagFilter"
import common from "~/locales/en/common.json"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

let translator: Awaited<ReturnType<typeof createResourceTestI18n>>

const options = Array.from({ length: 100 }, (_, index) => ({
  value: `tag-${index}`,
  label: `Team ${index}`,
  count: index,
}))

/** Exercises the controlled selection contract without mocking the panel. */
function Example() {
  const [value, setValue] = useState<string[]>([])
  return (
    <CompactTagFilter
      options={options}
      value={value}
      onChange={setValue}
      allLabel="All"
    />
  )
}

describe("CompactTagFilter", () => {
  beforeAll(async () => {
    translator = await createResourceTestI18n({ en: { common } })
  })
  it("keeps all tags searchable and preserves hidden selections across searches", async () => {
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={translator}>
        <Example />
      </I18nextProvider>,
    )
    await user.click(
      await screen.findByRole("button", { name: "All tags 100" }),
    )
    const panel = screen.getByRole("dialog", { name: "All tags" })
    const search = within(panel).getByRole("textbox", { name: "Search tags" })
    await user.type(search, "Team 99")
    await user.click(within(panel).getByRole("checkbox", { name: "Team 99" }))
    await user.clear(search)
    await user.type(search, "Team 42")
    await user.click(within(panel).getByRole("checkbox", { name: "Team 42" }))
    await user.clear(search)
    const checkboxes = within(panel).getAllByRole("checkbox")
    expect(checkboxes).toHaveLength(100)
    expect(checkboxes[42]).toBeChecked()
    expect(checkboxes[99]).toBeChecked()
    expect(checkboxes[0]).toHaveAccessibleName("Team 0")
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Selected 2" })).toHaveFocus()
    await user.click(screen.getByRole("button", { name: "Selected 2" }))
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Clear" }),
    )
    expect(
      screen.getByRole("button", { name: "All tags 100" }),
    ).toBeInTheDocument()
  })

  it("reports unmatched searches without losing selection and clears search on close", async () => {
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={translator}>
        <Example />
      </I18nextProvider>,
    )
    await user.click(
      await screen.findByRole("button", { name: "All tags 100" }),
    )
    await user.type(
      screen.getByRole("textbox", { name: "Search tags" }),
      "no matching team",
    )
    expect(screen.getByText("No matching tags")).toBeInTheDocument()
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Close" }))
    await user.click(
      await screen.findByRole("button", { name: "All tags 100" }),
    )
    expect(screen.getByRole("textbox", { name: "Search tags" })).toHaveValue("")
  })

  it("does not render an empty tag region", () => {
    render(
      <CompactTagFilter
        options={[]}
        value={[]}
        onChange={vi.fn()}
        allLabel="All"
      />,
    )
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("preserves focus on an outside action when dismissing the panel", async () => {
    const user = userEvent.setup()
    render(
      <I18nextProvider i18n={translator}>
        <Example />
        <button>Outside action</button>
      </I18nextProvider>,
    )
    await user.click(screen.getByRole("button", { name: "All tags 100" }))
    await user.click(screen.getByRole("button", { name: "Outside action" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Outside action" })).toHaveFocus()
  })
})
