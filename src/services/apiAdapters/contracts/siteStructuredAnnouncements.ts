import type { ApiServiceRequest } from "~/services/apiTransport/type"

export type SiteStructuredAnnouncementType =
  | "default"
  | "ongoing"
  | "success"
  | "warning"
  | "error"

export type SiteStructuredAnnouncement = {
  id?: string | number
  content: string
  publishDate?: string
  type?: SiteStructuredAnnouncementType
  extra?: string
}

export type SiteStructuredAnnouncementsCapability = {
  fetch(request: ApiServiceRequest): Promise<SiteStructuredAnnouncement[]>
}
