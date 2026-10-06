import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SiteAnnouncementsSearchBar } from "~/features/SiteAnnouncements/components/SiteAnnouncementsSearchBar"
import { testI18n } from "~~/tests/test-utils/i18n"
import { render, screen } from "~~/tests/test-utils/render"

describe("SiteAnnouncementsSearchBar", () => {
  testI18n.addResource(
    "en",
    "siteAnnouncements",
    "search.resultCount",
    "{{count}} results",
  )

  // The shared render wrapper defers its children until the app providers
  // settle, so every query has to await the first render.
  it("reports every keystroke and shows the current result count", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <SiteAnnouncementsSearchBar
        value=""
        resultCount={225}
        onChange={onChange}
      />,
    )

    const searchInput = await screen.findByRole("searchbox", {
      name: "siteAnnouncements:search.placeholder",
    })
    expect(screen.getByText("225 results")).toBeVisible()

    await user.type(searchInput, "a")

    expect(onChange).toHaveBeenCalledWith("a")
  })

  it("clears the query from the trailing clear button", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <SiteAnnouncementsSearchBar
        value="maintenance"
        resultCount={1}
        onChange={onChange}
      />,
    )

    await user.click(
      await screen.findByRole("button", {
        name: "siteAnnouncements:search.clear",
      }),
    )

    expect(onChange).toHaveBeenCalledWith("")
  })

  it("hides the clear button while the query is empty", async () => {
    render(
      <SiteAnnouncementsSearchBar
        value=""
        resultCount={2}
        onChange={vi.fn()}
      />,
    )

    await screen.findByRole("searchbox")
    expect(
      screen.queryByRole("button", {
        name: "siteAnnouncements:search.clear",
      }),
    ).not.toBeInTheDocument()
  })
})
