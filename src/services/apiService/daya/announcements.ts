import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { DAYA_ENDPOINTS } from "./constants"
import {
  fetchDayaData,
  invalidDayaResponse,
  withDayaSession,
} from "./transport"

export type DayaAnnouncementItem = {
  id: string
  title: string
  content: string
  createdAt: number
}

/** Account-session notices; rows without a readable identity are not shown. */
export async function fetchDayaAnnouncementItems(
  request: ApiServiceRequest,
): Promise<DayaAnnouncementItem[]> {
  return withDayaSession(request, async (scoped) => {
    const endpoint = DAYA_ENDPOINTS.Announcements
    const data = await fetchDayaData(scoped, endpoint)
    if (!Array.isArray(data)) return invalidDayaResponse(endpoint)
    return data.flatMap((value) => {
      if (
        !isRecord(value) ||
        (typeof value.id !== "number" && typeof value.id !== "string") ||
        String(value.id).trim() === "" ||
        typeof value.title !== "string" ||
        !value.title.trim() ||
        typeof value.content !== "string" ||
        typeof value.created_at !== "string" ||
        !Number.isFinite(Date.parse(value.created_at))
      )
        return []
      return [
        {
          id: String(value.id),
          title: value.title.trim(),
          content: value.content,
          createdAt: Date.parse(value.created_at),
        },
      ]
    })
  })
}
