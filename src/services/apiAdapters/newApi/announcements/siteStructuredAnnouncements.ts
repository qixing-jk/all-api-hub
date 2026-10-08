import type { SiteAnnouncementsCapability } from "~/services/apiAdapters/contracts/siteAnnouncements"
import {
  fetchSiteAnnouncements,
  type NewApiStructuredAnnouncement,
} from "~/services/apiService/newApiFamily/default/siteAnnouncements"
import {
  fingerprintAnnouncement,
  normalizeAnnouncementText,
} from "~/services/siteAnnouncements/text"
import { parseAnnouncementTimestamp } from "~/services/siteAnnouncements/timestamp"
import type { SiteAnnouncement } from "~/types/siteAnnouncements"

/** Projects New API fields while retaining the existing product identity rule. */
function toAnnouncement(
  item: NewApiStructuredAnnouncement,
): SiteAnnouncement | null {
  const content = normalizeAnnouncementText(item.content)
  const extra = normalizeAnnouncementText(item.extra)
  if (!content) return null
  const id = item.id == null ? undefined : String(item.id)
  return {
    ...(id === undefined ? {} : { id }),
    content: extra ? `${content}\n\n${extra}` : content,
    createdAt: parseAnnouncementTimestamp(item.publishDate),
    fingerprint: fingerprintAnnouncement([
      id ?? "",
      item.type ?? "",
      item.publishDate ?? "",
      content,
      extra,
    ]),
  }
}

export const newApiSiteStructuredAnnouncements: SiteAnnouncementsCapability = {
  fetch: async (request) =>
    (await fetchSiteAnnouncements(request))
      .map(toAnnouncement)
      .filter((item): item is SiteAnnouncement => item !== null),
}
