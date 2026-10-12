import type { SiteAnnouncementsCapability } from "~/services/apiAdapters/contracts/siteAnnouncements"
import { fetchDashboard } from "~/services/apiService/foxcode"
import { FOXCODE_ENDPOINTS } from "~/services/apiService/foxcode/constants"
import { invalidFoxCodeResponse } from "~/services/apiService/foxcode/transport"
import { isRecord } from "~/utils/core/object"

/** Upstream popup settings do not own announcement identity or the extension's read state. */
export const foxCodeAnnouncements: SiteAnnouncementsCapability = {
  async fetch(request) {
    const data = await fetchDashboard(request)
    if (!Array.isArray(data.announcements))
      throw invalidFoxCodeResponse(FOXCODE_ENDPOINTS.Dashboard)
    return data.announcements.map((item) => {
      if (
        !isRecord(item) ||
        typeof item.id !== "string" ||
        !item.id ||
        typeof item.title !== "string" ||
        typeof item.content !== "string" ||
        typeof item.createdAt !== "string" ||
        !Number.isFinite(Date.parse(item.createdAt))
      )
        throw invalidFoxCodeResponse(FOXCODE_ENDPOINTS.Dashboard)
      return {
        id: item.id,
        title: item.title,
        content: item.content,
        createdAt: Date.parse(item.createdAt),
      }
    })
  },
}
