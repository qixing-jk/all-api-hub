import type { SiteAnnouncementsCapability } from "~/services/apiAdapters/contracts/siteAnnouncements"
import { fetchKrillAnnouncementItems } from "~/services/apiService/krill"

/** Public notices only; the console has no per-account inbox to acknowledge. */
export const krillAnnouncements: SiteAnnouncementsCapability = {
  fetch: async (request) => fetchKrillAnnouncementItems(request),
}
