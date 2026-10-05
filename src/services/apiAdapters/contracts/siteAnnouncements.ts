import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { SiteAnnouncement } from "~/types/siteAnnouncements"

export type SiteAnnouncementsFetchOptions = {
  unreadOnly?: boolean
}

export type MarkSiteAnnouncementReadRequest = {
  request: ApiServiceRequest
  id: string | number
}

export type SiteAnnouncementsCapability = {
  fetch(
    request: ApiServiceRequest,
    options?: SiteAnnouncementsFetchOptions,
  ): Promise<SiteAnnouncement[]>
  markRead?(request: MarkSiteAnnouncementReadRequest): Promise<boolean>
}
