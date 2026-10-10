import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { SiteAnnouncement } from "~/types/siteAnnouncements"
import { isRecord } from "~/utils/core/object"
import i18n from "~/utils/i18n/core"

import { withCubenceSession } from "./session"
import { invalidCubenceResponse, readCubenceResponse } from "./transport"

/** Site announcements have stable ids; native popup revisions/read acknowledgements stay upstream. */
export async function fetchAnnouncements(
  request: ApiServiceRequest,
): Promise<SiteAnnouncement[]> {
  return withCubenceSession(request, async (request) => {
    const items: SiteAnnouncement[] = []
    const seen = new Set<string>()
    const language = (
      i18n.resolvedLanguage ??
      i18n.language ??
      "en"
    ).startsWith("zh")
      ? "zh"
      : "en"
    for (let page = 1; page <= 100; page++) {
      const endpoint = `/api/v1/announcements?page=${page}&page_size=50&sort=latest&lang=${language}`
      const body = await readCubenceResponse(request, endpoint)
      const data = body.data
      if (
        body.success !== true ||
        !isRecord(data) ||
        !Array.isArray(data.announcements) ||
        typeof data.total !== "number" ||
        data.total < 0 ||
        !Number.isSafeInteger(data.total)
      )
        return invalidCubenceResponse(endpoint)
      for (const item of data.announcements) {
        if (
          !isRecord(item) ||
          !Number.isSafeInteger(item.id) ||
          typeof item.title !== "string" ||
          typeof item.content !== "string"
        )
          return invalidCubenceResponse(endpoint)
        const id = String(item.id)
        if (seen.has(id)) return invalidCubenceResponse(endpoint)
        seen.add(id)
        const published =
          typeof item.published_at === "string"
            ? Date.parse(item.published_at)
            : NaN
        const updated =
          typeof item.updated_at === "string"
            ? Date.parse(item.updated_at)
            : NaN
        items.push({
          id,
          title: item.title,
          content: item.content,
          ...(Number.isFinite(published) ? { createdAt: published } : {}),
          ...(Number.isFinite(updated) ? { updatedAt: updated } : {}),
        })
      }
      if (seen.size >= data.total) return items
      if (data.announcements.length === 0)
        return invalidCubenceResponse(endpoint)
    }
    return invalidCubenceResponse("/api/v1/announcements")
  })
}
