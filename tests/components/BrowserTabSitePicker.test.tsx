import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { beforeEach, expect, it, vi } from "vitest"

import { BrowserTabSitePicker } from "~/components/BrowserTabSitePicker"
import { getAllTabs } from "~/utils/browser/tabs"

vi.mock("~/utils/browser/tabs", () => ({ getAllTabs: vi.fn() }))

function Picker({ disabled }: { disabled?: boolean }) {
  const [selected, setSelected] = useState<string[]>([])
  return (
    <BrowserTabSitePicker
      label="Choose from open tabs"
      emptyMessage="No matching tabs"
      disabled={disabled}
      isSiteSelected={(site) => selected.includes(site.value)}
      onSelect={(sites) => setSelected(sites.map((site) => site.value))}
    />
  )
}

beforeEach(() => {
  vi.mocked(getAllTabs).mockReset()
})

it("shows decorative favicons while searching, selecting, and deselecting origins", async () => {
  vi.mocked(getAllTabs).mockResolvedValue([
    {
      url: "https://docs.example/guide",
      title: "Docs",
      favIconUrl: "https://docs.example/icon.png",
    },
    { url: "https://portal.example/", title: "Portal" },
  ] as browser.tabs.Tab[])
  const user = userEvent.setup()
  render(<Picker />)

  const input = screen.getByRole("combobox")
  await user.type(input, "Docs")
  const docs = await screen.findByRole("option", {
    name: "Docs — https://docs.example",
  })
  expect(docs.querySelector("img")).toHaveAttribute(
    "src",
    "https://docs.example/icon.png",
  )
  expect(within(docs).queryByRole("img")).toBeNull()
  expect(screen.queryByRole("option", { name: /Portal/ })).toBeNull()
  await user.click(docs)

  await user.type(input, "Portal")
  await user.click(await screen.findByRole("option", { name: /Portal/ }))
  await user.type(input, "Docs")
  const selectedDocs = await screen.findByRole("option", {
    name: /Docs/,
    selected: true,
  })
  await user.click(selectedDocs)
  await user.type(input, "Portal")
  expect(
    await screen.findByRole("option", { name: /Portal/, selected: true }),
  ).toBeVisible()
  await user.clear(input)
  expect(
    await screen.findByRole("option", { name: /Docs/, selected: false }),
  ).toBeVisible()
})

it("keeps the search usable when tabs cannot be loaded", async () => {
  vi.mocked(getAllTabs).mockRejectedValue(new Error("Tabs unavailable"))
  const user = userEvent.setup()
  render(<Picker />)
  await user.type(screen.getByRole("combobox"), "example")
  expect(await screen.findByText("No matching tabs")).toBeVisible()
})
