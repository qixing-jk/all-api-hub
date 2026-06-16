import type { ApiServiceRequest } from "~/services/apiService/common/type"
import type { Sub2ApiAnnouncementData } from "~/services/apiService/sub2api/type"

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
  ): Promise<Sub2ApiAnnouncementData[]>
  markRead(request: MarkSiteAnnouncementReadRequest): Promise<boolean>
}
