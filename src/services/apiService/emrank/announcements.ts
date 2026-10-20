import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { SiteAnnouncement } from "~/types/siteAnnouncements"
import { isRecord } from "~/utils/core/object"

import { EMRANK_ENDPOINTS } from "./constants"
import { invalidEmRankResponse, readEmRank } from "./transport"

/**
 * Site announcements page from 0 (verified 2026-10-16); rows carry markdown
 * bodies and epoch-second publication times.
 */
export async function fetchAnnouncements(
  request: ApiServiceRequest,
): Promise<SiteAnnouncement[]> {
  const endpoint = `${EMRANK_ENDPOINTS.Announcements}?page=0`
  const body = await readEmRank(request, endpoint)
  if (!Array.isArray(body.data)) invalidEmRankResponse(endpoint)
  return body.data.flatMap((value) => {
    if (
      !isRecord(value) ||
      (typeof value.id !== "string" && typeof value.id !== "number") ||
      typeof value.title !== "string" ||
      typeof value.markdown !== "string" ||
      typeof value.published_at !== "number"
    )
      return []
    return [
      {
        id: String(value.id),
        title: value.title,
        content: value.markdown,
        createdAt: value.published_at * 1000,
      },
    ]
  })
}
