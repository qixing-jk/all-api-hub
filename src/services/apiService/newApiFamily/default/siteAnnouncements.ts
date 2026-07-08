import {
  SITE_STRUCTURED_ANNOUNCEMENT_TYPES,
  type SiteStructuredAnnouncement,
  type SiteStructuredAnnouncementType,
} from "~/services/apiAdapters/contracts/siteStructuredAnnouncements"
import { fetchApiData } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("NewApiFamilySiteAnnouncements")

type NewApiStatusAnnouncementsResponse = {
  announcements_enabled?: boolean
  announcements?: unknown
}

const VALID_ANNOUNCEMENT_TYPES = new Set(SITE_STRUCTURED_ANNOUNCEMENT_TYPES)

/**
 * Checks whether an upstream announcement type is supported locally.
 */
function isSiteStructuredAnnouncementType(
  value: string,
): value is SiteStructuredAnnouncementType {
  return VALID_ANNOUNCEMENT_TYPES.has(value as SiteStructuredAnnouncementType)
}

/**
 * Keep only New API announcement fields the extension can safely display.
 */
function normalizeStructuredAnnouncement(
  value: unknown,
): SiteStructuredAnnouncement | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const item = value as Record<string, unknown>
  const content = typeof item.content === "string" ? item.content : ""
  if (!content.trim()) {
    return null
  }

  const id =
    typeof item.id === "string" || typeof item.id === "number"
      ? item.id
      : undefined
  const publishDate =
    typeof item.publishDate === "string" && item.publishDate.trim()
      ? item.publishDate
      : undefined
  const type =
    typeof item.type === "string" && isSiteStructuredAnnouncementType(item.type)
      ? item.type
      : undefined
  const extra =
    typeof item.extra === "string" && item.extra.trim() ? item.extra : undefined

  return {
    ...(id === undefined ? {} : { id }),
    content,
    ...(publishDate ? { publishDate } : {}),
    ...(type ? { type } : {}),
    ...(extra ? { extra } : {}),
  }
}

/**
 * Fetch New API structured system announcements from /api/status.
 * Upstream contract: QuantumNous/new-api GetStatus injects
 * console_setting.announcements when announcements_enabled is true.
 */
export async function fetchSiteAnnouncements(
  request: ApiServiceRequest,
): Promise<SiteStructuredAnnouncement[]> {
  try {
    const response = await fetchApiData<NewApiStatusAnnouncementsResponse>(
      {
        ...request,
        auth: { authType: AuthTypeEnum.None },
      },
      { endpoint: "/api/status" },
    )

    if (response?.announcements_enabled === false) {
      return []
    }

    if (!Array.isArray(response?.announcements)) {
      return []
    }

    return response.announcements
      .map(normalizeStructuredAnnouncement)
      .filter((item): item is SiteStructuredAnnouncement => Boolean(item))
  } catch (error) {
    logger.warn("获取站点系统公告失败", error)
    return []
  }
}
