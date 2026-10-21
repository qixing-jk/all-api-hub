import type { SiteAnnouncementsCapability } from "~/services/apiAdapters/contracts/siteAnnouncements"
import { fetchDayaAnnouncementItems } from "~/services/apiService/daya/announcements"

/** Account-session notices; the console marks read state in its own UI only. */
export const dayaAnnouncements: SiteAnnouncementsCapability = {
  fetch: async (request) => fetchDayaAnnouncementItems(request),
}
