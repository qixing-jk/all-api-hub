import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { SiteAnnouncement } from "~/types/siteAnnouncements"
import { isRecord } from "~/utils/core/object"

import { fetchPmApiStatus } from "./status"

/**
 * The console publishes its standing notice and an announcement list on the
 * public status route; rows without a readable title are not shown, matching
 * the console's own notice bar.
 */
export async function fetchPmApiAnnouncements(
  request: ApiServiceRequest,
): Promise<SiteAnnouncement[]> {
  const status = await fetchPmApiStatus(request)
  const items: SiteAnnouncement[] = []
  let index = 0
  for (const value of status.announcements) {
    index += 1
    if (
      !isRecord(value) ||
      typeof value.title !== "string" ||
      !value.title.trim()
    )
      continue
    items.push({
      id: `announcement-${index}`,
      title: value.title.trim(),
      content: typeof value.content === "string" ? value.content : "",
    })
  }
  if (status.notice.trim())
    items.push({
      id: "notice",
      title: status.notice.trim(),
      content: "",
    })
  return items
}
