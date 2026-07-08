import type { ApiServiceRequest } from "~/services/apiTransport/type"

export const SITE_STRUCTURED_ANNOUNCEMENT_TYPES = [
  "default",
  "ongoing",
  "success",
  "warning",
  "error",
] as const

export type SiteStructuredAnnouncementType =
  (typeof SITE_STRUCTURED_ANNOUNCEMENT_TYPES)[number]

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
