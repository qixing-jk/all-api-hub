import { fireEvent, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { SiteAnnouncementCard } from "~/features/SiteAnnouncements/components/SiteAnnouncementCard"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type { SiteAnnouncementRecord } from "~/types/siteAnnouncements"
import { render } from "~~/tests/test-utils/render"

vi.mock("~/features/SiteAnnouncements/AnnouncementMarkdown", () => ({
  AnnouncementMarkdown: ({ content }: { content: string }) => (
    <div>{content}</div>
  ),
}))

vi.mock("~/components/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/components/ui")>()

  return {
    ...actual,
    Button: ({
      analyticsAction,
      asChild,
      children,
      leftIcon,
      rightIcon,
      ...props
    }: any) => {
      const analyticsValue = analyticsAction
        ? typeof analyticsAction === "string"
          ? `${PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements}:${analyticsAction}:${PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementCard}:${PRODUCT_ANALYTICS_ENTRYPOINTS.Options}`
          : `${analyticsAction.featureId}:${analyticsAction.actionId}:${analyticsAction.surfaceId}:${analyticsAction.entrypoint}`
        : undefined

      if (asChild) {
        const child = Array.isArray(children) ? children[0] : children
        return (
          <span data-analytics-action={analyticsValue}>
            {leftIcon}
            {child}
            {rightIcon}
          </span>
        )
      }

      return (
        <button type="button" data-analytics-action={analyticsValue} {...props}>
          {leftIcon}
          {children}
          {rightIcon}
        </button>
      )
    },
  }
})

const record: SiteAnnouncementRecord = {
  id: "record-1",
  siteKey: "site-1",
  siteName: "Example",
  siteType: "new-api",
  baseUrl: "https://example.com",
  accountId: "account-1",
  providerId: "common",
  title: "Maintenance",
  content: "Full body",
  fingerprint: "fp-1",
  firstSeenAt: Date.UTC(2026, 4, 8, 0, 0, 0),
  lastSeenAt: Date.UTC(2026, 4, 8, 0, 0, 0),
  read: false,
}

describe("SiteAnnouncementCard", () => {
  it("declares controlled analytics metadata for card actions", () => {
    render(
      <SiteAnnouncementCard
        record={record}
        expanded={true}
        onToggleExpanded={vi.fn()}
        onMarkRead={vi.fn()}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const announcementAction = (actionId: string) =>
      `${PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements}:${actionId}:${PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementCard}:${PRODUCT_ANALYTICS_ENTRYPOINTS.Options}`

    expect(
      screen.getAllByText("siteAnnouncements:actions.viewSource")[0]
        ?.parentElement,
    ).toHaveAttribute(
      "data-analytics-action",
      announcementAction(PRODUCT_ANALYTICS_ACTION_IDS.OpenAnnouncementSource),
    )
    expect(
      screen.getByRole("button", {
        name: "siteAnnouncements:actions.markRead",
      }),
    ).not.toHaveAttribute("data-analytics-action")
    expect(
      screen.getByRole("button", {
        name: "siteAnnouncements:actions.collapse",
      }),
    ).toHaveAttribute(
      "data-analytics-action",
      announcementAction(PRODUCT_ANALYTICS_ACTION_IDS.CollapseAnnouncement),
    )
  })

  it("toggles from header keyboard shortcuts and keeps button clicks from bubbling", () => {
    const onToggleExpanded = vi.fn()
    const onMarkRead = vi.fn()

    render(
      <SiteAnnouncementCard
        record={record}
        expanded={false}
        onToggleExpanded={onToggleExpanded}
        onMarkRead={onMarkRead}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    const headerButton = screen
      .getByText("Maintenance")
      .closest('[role="button"]')
    expect(headerButton).not.toBeNull()
    fireEvent.keyDown(headerButton!, { key: "Enter" })
    fireEvent.keyDown(headerButton!, { key: " " })
    expect(onToggleExpanded).toHaveBeenCalledTimes(2)

    fireEvent.click(headerButton!)
    expect(onToggleExpanded).toHaveBeenCalledTimes(3)

    for (const sourceLink of screen.getAllByRole("link", {
      name: "siteAnnouncements:actions.viewSource",
    })) {
      fireEvent.click(sourceLink)
    }
    expect(onToggleExpanded).toHaveBeenCalledTimes(3)

    const markReadButtons = screen.getAllByRole("button", {
      name: /markRead/i,
    })
    expect(markReadButtons.length).toBeGreaterThan(0)
    fireEvent.click(markReadButtons[0]!)
    expect(onMarkRead).toHaveBeenCalledWith("record-1")
    expect(onToggleExpanded).toHaveBeenCalledTimes(3)
  })

  it("renders expanded actions and source links without toggling the card", () => {
    const onToggleExpanded = vi.fn()
    const onMarkRead = vi.fn()

    render(
      <SiteAnnouncementCard
        record={{
          ...record,
          siteType: "sub2api",
          providerId: "sub2api",
          notifiedAt: Date.UTC(2026, 4, 8, 1, 0, 0),
        }}
        expanded={true}
        onToggleExpanded={onToggleExpanded}
        onMarkRead={onMarkRead}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(screen.getByText("Full body")).toBeInTheDocument()
    expect(
      screen.getByText("siteAnnouncements:badges.notified"),
    ).toBeInTheDocument()

    const sourceLinks = screen.getAllByRole("link", {
      name: /siteAnnouncements:actions\.viewSource/,
    })
    expect(sourceLinks[0]).toHaveAttribute(
      "href",
      "https://example.com/dashboard",
    )
    expect(sourceLinks[1]).toHaveAttribute(
      "href",
      "https://example.com/dashboard",
    )

    fireEvent.click(sourceLinks[0]!)
    fireEvent.click(sourceLinks[1]!)
    expect(onToggleExpanded).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole("button", {
        name: "siteAnnouncements:actions.collapse",
      }),
    )
    expect(onToggleExpanded).toHaveBeenCalledWith(
      expect.objectContaining({ id: "record-1" }),
    )
  })

  it("hides unread-only actions for records that are already read", () => {
    render(
      <SiteAnnouncementCard
        record={{ ...record, read: true }}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onMarkRead={vi.fn()}
      />,
      {
        withReleaseUpdateStatusProvider: false,
        withThemeProvider: false,
        withUserPreferencesProvider: false,
      },
    )

    expect(
      screen.queryByText("siteAnnouncements:badges.unread"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /markRead/i }),
    ).not.toBeInTheDocument()
  })
})
