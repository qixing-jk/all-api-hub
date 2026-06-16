import {
  fetchSub2ApiAnnouncements,
  markSub2ApiAnnouncementRead,
} from "~/services/apiService/sub2api"

import type { SiteAnnouncementsCapability } from "../contracts/siteAnnouncements"

export const sub2ApiSiteAnnouncements: SiteAnnouncementsCapability = {
  fetch: fetchSub2ApiAnnouncements,
  markRead: ({ request, id }) => markSub2ApiAnnouncementRead(request, id),
}
