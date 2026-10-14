import type { SiteAnnouncementsCapability } from "~/services/apiAdapters/contracts/siteAnnouncements"
import { XIAOEN_ENDPOINTS } from "~/services/apiService/xiaoen/constants"
import { fetchPublicEnvelope } from "~/services/apiService/xiaoen/public"
import { invalidXiaoenResponse } from "~/services/apiService/xiaoen/transport"
import { isRecord } from "~/utils/core/object"

export const xiaoenAnnouncements: SiteAnnouncementsCapability = {
  async fetch(request) {
    const body = await fetchPublicEnvelope(
      request,
      XIAOEN_ENDPOINTS.Announcements,
    )
    if (!Array.isArray(body.data))
      throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Announcements)
    return body.data.flatMap((value) => {
      if (
        !isRecord(value) ||
        typeof value.id !== "string" ||
        !value.id.trim() ||
        typeof value.content !== "string" ||
        typeof value.isActive !== "boolean" ||
        typeof value.createdAt !== "string" ||
        !Number.isFinite(Date.parse(value.createdAt))
      )
        throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Announcements)
      return value.isActive
        ? [
            {
              id: value.id,
              content: value.content,
              createdAt: Date.parse(value.createdAt),
            },
          ]
        : []
    })
  },
}
