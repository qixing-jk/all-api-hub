import type { SiteAnnouncementRecord } from "~/types/siteAnnouncements"

import { SiteAnnouncementCard } from "./SiteAnnouncementCard"

interface SiteAnnouncementsListProps {
  records: SiteAnnouncementRecord[]
  expandedIds: Set<string>
  onToggleExpanded: (record: SiteAnnouncementRecord) => void
  onMarkRead: (recordId: string) => void | Promise<void>
}

/**
 * Maps filtered records into individual announcement cards.
 */
export function SiteAnnouncementsList({
  records,
  expandedIds,
  onToggleExpanded,
  onMarkRead,
}: SiteAnnouncementsListProps) {
  return (
    <div className="space-y-4">
      {records.map((record) => (
        <SiteAnnouncementCard
          key={record.id}
          record={record}
          expanded={expandedIds.has(record.id)}
          onToggleExpanded={onToggleExpanded}
          onMarkRead={onMarkRead}
        />
      ))}
    </div>
  )
}
