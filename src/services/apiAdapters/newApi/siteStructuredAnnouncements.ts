import { fetchSiteAnnouncements } from "~/services/apiService/newApiFamily/default/siteAnnouncements"

import type { SiteStructuredAnnouncementsCapability } from "../contracts/siteStructuredAnnouncements"

export const newApiSiteStructuredAnnouncements: SiteStructuredAnnouncementsCapability =
  {
    fetch: fetchSiteAnnouncements,
  }
