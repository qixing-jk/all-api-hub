import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState, type ComponentProps } from "react"
import { beforeEach, expect, it, vi } from "vitest"

import { BrowserTabUrlInput } from "~/components/BrowserTabUrlInput"
import { BROWSER_TAB_SITE_URL_MODES } from "~/utils/browser/recentTabSites"
import { getAllTabs } from "~/utils/browser/tabs"
import { createDeferred } from "~~/tests/test-utils/deferred"

vi.mock("~/utils/browser/tabs", () => ({ getAllTabs: vi.fn() }))

const tabs = [
  {
    title: "Project Console",
    url: "https://project.test/security",
    favIconUrl: "https://project.test/favicon.ico",
    lastAccessed: 20,
  },
  {
    title: "Project Home",
    url: "https://project.test/home",
    lastAccessed: 10,
  },
  { title: "Other Site", url: "https://other.test/path", lastAccessed: 5 },
] as Awaited<ReturnType<typeof getAllTabs>>

function Field({
  initialUrl = "",
  clear = false,
  ...props
}: Partial<ComponentProps<typeof BrowserTabUrlInput>> & {
  initialUrl?: string
  clear?: boolean
}) {
  const [url, setUrl] = useState(initialUrl)
  return (
    <BrowserTabUrlInput
      inputProps={{ "aria-label": "Site URL" }}
      url={url}
      onUrlChange={setUrl}
      enableRecentTabs
      recentTabsLabel="Use an open tab"
      urlMode={BROWSER_TAB_SITE_URL_MODES.ORIGIN}
      clearAction={
        clear ? { label: "Clear URL", onClear: () => setUrl("") } : undefined
      }
      {...props}
    />
  )
}

beforeEach(() => {
  vi.mocked(getAllTabs).mockReset().mockResolvedValue(tabs)
})

it("matches open tab titles and selects one origin per site", async () => {
  const user = userEvent.setup()
  const selected = vi.fn()
  render(<Field onSelectSite={selected} />)
  await screen.findByRole("button", { name: "Use an open tab" })
  const input = screen.getByRole("combobox", { name: "Site URL" })
  await user.type(input, "PROJECT")
  const choice = await screen.findByRole("option", { name: /Project Console/ })
  expect(screen.getAllByRole("option")).toEqual([choice])
  expect(choice.querySelector("img")).toHaveAttribute(
    "src",
    "https://project.test/favicon.ico",
  )
  await user.click(choice)
  expect(input).toHaveValue("https://project.test")
  expect(selected).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ url: "https://project.test/security" }),
  )
  expect(input).toHaveAttribute("aria-expanded", "false")
})

it("browses full pages from the trigger even when the text matches no tab", async () => {
  const user = userEvent.setup()
  render(
    <Field
      initialUrl="https://manual.test"
      urlMode={BROWSER_TAB_SITE_URL_MODES.PAGE}
      clear
    />,
  )
  const input = screen.getByRole("combobox", { name: "Site URL" })
  const trigger = await screen.findByRole("button", { name: "Use an open tab" })
  expect(screen.queryByRole("listbox")).toBeNull()
  await user.click(trigger)
  expect(await screen.findAllByRole("option")).toHaveLength(3)
  await user.click(screen.getByRole("option", { name: /Project Home/ }))
  expect(input).toHaveValue("https://project.test/home")
  await user.click(screen.getByRole("button", { name: "Clear URL" }))
  expect(input).toHaveValue("")
  expect(input).toHaveFocus()
})

it("keeps manual entry usable when enumerating open tabs fails", async () => {
  vi.mocked(getAllTabs).mockRejectedValueOnce(new Error("Tab access denied"))
  const user = userEvent.setup()
  render(<Field />)
  await waitFor(() => expect(getAllTabs).toHaveBeenCalledOnce())
  const input = screen.getByRole("combobox", { name: "Site URL" })
  await user.type(input, "https://manual.test")
  expect(input).toHaveValue("https://manual.test")
  expect(screen.queryByRole("button", { name: "Use an open tab" })).toBeNull()
})

it.each([false, true])(
  "keeps manual entry available with the tab picker disabled (clear: %s)",
  async (clear) => {
    const user = userEvent.setup()
    render(<Field enableRecentTabs={false} clear={clear} />)
    const input = screen.getByRole("textbox", { name: "Site URL" })
    await user.type(input, "https://manual.test")
    expect(input).toHaveValue("https://manual.test")
    expect(getAllTabs).not.toHaveBeenCalled()
    if (clear) {
      await user.click(screen.getByRole("button", { name: "Clear URL" }))
      expect(input).toHaveValue("")
      expect(input).toHaveFocus()
    }
  },
)

it("ignores an outdated tab response when the field changes URL mode", async () => {
  const pending = createDeferred<typeof tabs>()
  vi.mocked(getAllTabs).mockReturnValueOnce(pending.promise)
  const user = userEvent.setup()
  const view = render(<Field urlMode={BROWSER_TAB_SITE_URL_MODES.ORIGIN} />)
  view.rerender(<Field urlMode={BROWSER_TAB_SITE_URL_MODES.PAGE} />)
  const trigger = await screen.findByRole("button", { name: "Use an open tab" })
  await act(() => {
    pending.resolve([])
  })
  await user.click(trigger)
  expect(await screen.findAllByRole("option")).toHaveLength(3)
})
