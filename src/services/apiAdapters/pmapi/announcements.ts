import type { SiteAnnouncementsCapability } from "~/services/apiAdapters/contracts/siteAnnouncements"
import { fetchPmApiAnnouncements } from "~/services/apiService/pmapi/announcements"

/** Public site notices; the console marks read state in its own UI only. */
export const pmApiAnnouncements: SiteAnnouncementsCapability = {
  fetch: async (request) => fetchPmApiAnnouncements(request),
}
