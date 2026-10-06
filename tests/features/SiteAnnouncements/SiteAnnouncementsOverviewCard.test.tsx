import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SiteAnnouncementsOverviewCard } from "~/features/SiteAnnouncements/components/SiteAnnouncementsOverviewCard"
import type { SiteAnnouncementSiteOption } from "~/features/SiteAnnouncements/utils"
import { render, screen } from "~~/tests/test-utils/render"

const siteOptions: SiteAnnouncementSiteOption[] = [
  { value: "site-1", label: "Alpha API", announcementCount: 4 },
  { value: "site-2", label: "Beta API", announcementCount: 0 },
]

function renderCard(
  overrides: Partial<
    React.ComponentProps<typeof SiteAnnouncementsOverviewCard>
  > = {},
) {
  const props = {
    siteKey: "all",
    unreadFilter: "all" as const,
    siteOptions,
    totalCount: 4,
    unreadCount: 2,
    onSiteKeyChange: vi.fn(),
    onUnreadFilterChange: vi.fn(),
    ...overrides,
  }
  render(<SiteAnnouncementsOverviewCard {...props} />)
  return props
}

describe("SiteAnnouncementsOverviewCard", () => {
  // The shared render wrapper defers its children until the app providers
  // settle, so every query has to await the first render.
  it("renders the overview heading and both announcement counters", async () => {
    renderCard()

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "siteAnnouncements:overview.title",
      }),
    ).toBeInTheDocument()
    expect(screen.getByText("siteAnnouncements:summary.total")).toBeVisible()
    expect(screen.getByText("siteAnnouncements:summary.unread")).toBeVisible()
    expect(screen.getByText("4")).toBeVisible()
    expect(screen.getByText("2")).toBeVisible()
  })

  it("marks the active counter and reports the other one on click", async () => {
    const user = userEvent.setup()
    const props = renderCard()

    const totalCounter = await screen.findByRole("button", {
      name: /siteAnnouncements:summary\.total/,
    })
    const unreadCounter = screen.getByRole("button", {
      name: /siteAnnouncements:summary\.unread/,
    })

    expect(totalCounter).toHaveAttribute("aria-pressed", "true")
    expect(unreadCounter).toHaveAttribute("aria-pressed", "false")
    expect(totalCounter).toHaveClass("bg-primary-soft")
    expect(unreadCounter).not.toHaveClass("bg-primary-soft")

    await user.click(unreadCounter)

    expect(props.onUnreadFilterChange).toHaveBeenCalledWith("unread")
  })

  it("shows the selected site name on the site trigger", async () => {
    renderCard({ siteKey: "site-1" })

    expect(
      await screen.findByRole("combobox", {
        name: "siteAnnouncements:filters.site",
      }),
    ).toHaveTextContent("Alpha API")
  })

  it("offers every site with its announcement count and reports the selection", async () => {
    const user = userEvent.setup()
    const props = renderCard()

    await user.click(
      await screen.findByRole("combobox", {
        name: "siteAnnouncements:filters.site",
      }),
    )

    expect(screen.getByRole("option", { name: /Alpha API/ })).toHaveTextContent(
      "4",
    )
    expect(screen.getByRole("option", { name: /Beta API/ })).toHaveTextContent(
      "0",
    )

    await user.click(screen.getByRole("option", { name: /Beta API/ }))

    expect(props.onSiteKeyChange).toHaveBeenCalledWith("site-2")
  })
})
