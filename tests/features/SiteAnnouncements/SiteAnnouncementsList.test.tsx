import { VirtuosoMockContext } from "react-virtuoso"
import { describe, expect, it, vi } from "vitest"

import { SiteAnnouncementsList } from "~/features/SiteAnnouncements/components/SiteAnnouncementsList"
import type { SiteAnnouncementRecord } from "~/types/siteAnnouncements"
import { render, screen } from "~~/tests/test-utils/render"

/** Builds cached announcements that only differ by their display title. */
function createRecords(count: number): SiteAnnouncementRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `record-${index}`,
    siteKey: "site-1",
    siteName: "Example Site",
    siteType: "new-api",
    baseUrl: "https://example.com",
    accountId: "account-1",
    providerId: "common",
    title: `Announcement ${index}`,
    content: `Body ${index}`,
    fingerprint: `fingerprint-${index}`,
    firstSeenAt: Date.UTC(2026, 4, 8),
    lastSeenAt: Date.UTC(2026, 4, 8),
    read: true,
  }))
}

/** Builds the list view inside a fixed virtual viewport so mounted rows are countable. */
function createListView({
  navigationTargetId,
  records,
}: {
  navigationTargetId?: string
  records: SiteAnnouncementRecord[]
}) {
  return (
    <VirtuosoMockContext.Provider
      value={{ viewportHeight: 600, itemHeight: 140 }}
    >
      <SiteAnnouncementsList
        records={records}
        expandedIds={new Set()}
        navigationTargetId={navigationTargetId}
        onToggleExpanded={vi.fn()}
        onMarkRead={vi.fn()}
      />
    </VirtuosoMockContext.Provider>
  )
}

describe("SiteAnnouncementsList", () => {
  it("bounds the mounted cards for a long cached announcement history", async () => {
    const records = createRecords(120)
    const { rerender } = render(createListView({ records }))

    expect(
      await screen.findByRole("heading", { level: 3, name: "Announcement 0" }),
    ).toBeVisible()
    expect(screen.getAllByRole("heading", { level: 3 }).length).toBeLessThan(20)
    expect(
      screen.queryByRole("heading", { level: 3, name: "Announcement 119" }),
    ).toBeNull()

    rerender(createListView({ records: records.slice(1) }))

    expect(
      await screen.findByRole("heading", { level: 3, name: "Announcement 1" }),
    ).toBeVisible()
    expect(
      screen.queryByRole("heading", { level: 3, name: "Announcement 0" }),
    ).toBeNull()
  })

  it("keeps short announcement lists fully mounted", async () => {
    render(createListView({ records: createRecords(20) }))

    expect(
      await screen.findByRole("heading", { level: 3, name: "Announcement 0" }),
    ).toBeVisible()
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(20)
  })

  it("keeps a deep-linked announcement mounted in a long list", async () => {
    render(
      createListView({
        records: createRecords(120),
        navigationTargetId: "record-119",
      }),
    )

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "Announcement 119",
      }),
    ).toBeVisible()
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(120)
  })
})
