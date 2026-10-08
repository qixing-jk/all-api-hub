import type { SiteAnnouncementsCapability } from "~/services/apiAdapters/contracts/siteAnnouncements"
import {
  fetchSub2ApiAnnouncements,
  markSub2ApiAnnouncementRead,
} from "~/services/apiService/sub2api/account/announcements"
import type { Sub2ApiAnnouncementData } from "~/services/apiService/sub2api/type"
import { parseAnnouncementTimestamp } from "~/services/siteAnnouncements/timestamp"
import type { SiteAnnouncement } from "~/types/siteAnnouncements"

/**
 * Projects Sub2API body aliases and timestamps into the shared model.
 */
function normalizeAnnouncement(
  item: Sub2ApiAnnouncementData,
): SiteAnnouncement {
  return {
    id: item.id == null ? undefined : String(item.id),
    title: item.title ?? undefined,
    content: item.content?.trim()
      ? item.content
      : item.message?.trim()
        ? item.message
        : item.body ?? undefined,
    createdAt: parseAnnouncementTimestamp(item.created_at),
    updatedAt: parseAnnouncementTimestamp(item.updated_at),
    readAt: parseAnnouncementTimestamp(item.read_at),
  }
}

export const sub2ApiSiteAnnouncements = {
  fetch: async (request, options = { unreadOnly: true }) =>
    (await fetchSub2ApiAnnouncements(request, options)).map(
      normalizeAnnouncement,
    ),
  markRead: ({ request, id }) => markSub2ApiAnnouncementRead(request, id),
} satisfies SiteAnnouncementsCapability
