import { Fragment } from "react"
import { Virtuoso } from "react-virtuoso"

import type { SiteAnnouncementRecord } from "~/types/siteAnnouncements"

import { SiteAnnouncementCard } from "./SiteAnnouncementCard"

interface SiteAnnouncementsListProps {
  records: SiteAnnouncementRecord[]
  expandedIds: Set<string>
  navigationTargetId?: string
  onToggleExpanded: (record: SiteAnnouncementRecord) => void
  onMarkRead: (recordId: string) => void | Promise<void>
}

/** Longest history that still renders as plain DOM, mirroring bounded key lists. */
export const SITE_ANNOUNCEMENTS_VIRTUALIZATION_THRESHOLD = 20

/** Initial card estimate; expanded cards are re-measured by the virtualizer. */
const ESTIMATED_CARD_HEIGHT = 140

/**
 * Maps filtered records into individual announcement cards.
 *
 * Cached history grows to a hundred records per site, so long lists mount
 * through a windowed viewport instead of the whole archive.
 */
export function SiteAnnouncementsList({
  records,
  expandedIds,
  navigationTargetId,
  onToggleExpanded,
  onMarkRead,
}: SiteAnnouncementsListProps) {
  const renderCard = (record: SiteAnnouncementRecord) => (
    <SiteAnnouncementCard
      record={record}
      expanded={expandedIds.has(record.id)}
      onToggleExpanded={onToggleExpanded}
      onMarkRead={onMarkRead}
    />
  )

  // A routed announcement has to stay mounted for its deep link, which the
  // bounded window cannot guarantee.
  const hasNavigationTarget =
    navigationTargetId !== undefined &&
    records.some((record) => record.id === navigationTargetId)

  if (
    records.length <= SITE_ANNOUNCEMENTS_VIRTUALIZATION_THRESHOLD ||
    hasNavigationTarget
  ) {
    return (
      <div className="space-y-density-4">
        {records.map((record) => (
          <Fragment key={record.id}>{renderCard(record)}</Fragment>
        ))}
      </div>
    )
  }

  return (
    <Virtuoso
      data={records}
      computeItemKey={(_, record) => record.id}
      defaultItemHeight={ESTIMATED_CARD_HEIGHT}
      increaseViewportBy={240}
      useWindowScroll
      itemContent={(_, record) => (
        <div className="pb-density-4">{renderCard(record)}</div>
      )}
    />
  )
}
