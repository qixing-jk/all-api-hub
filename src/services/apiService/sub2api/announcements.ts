import { fetchSub2ApiData } from "~/services/apiService/sub2api/dashboardRequest"
import { getSafeErrorMessage } from "~/services/apiService/sub2api/redaction"
import {
  SUB2API_ANNOUNCEMENTS_ENDPOINT,
  type Sub2ApiAnnouncementData,
  type Sub2ApiAnnouncementListData,
} from "~/services/apiService/sub2api/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to Sub2API site API overrides.
 */
const logger = createLogger("ApiService.Sub2API")

const extractSub2ApiAnnouncementItems = (
  data: Sub2ApiAnnouncementListData,
): Sub2ApiAnnouncementData[] => {
  if (Array.isArray(data)) {
    return data
  }

  if (Array.isArray(data?.items)) {
    return data.items
  }

  return []
}

/**
 * Fetch unread Sub2API announcements for the authenticated account.
 */
export async function fetchSub2ApiAnnouncements(
  request: ApiServiceRequest,
  options?: { unreadOnly?: boolean },
): Promise<Sub2ApiAnnouncementData[]> {
  const searchParams = new URLSearchParams()
  if (options?.unreadOnly) {
    searchParams.set("unread_only", "1")
  }

  const endpoint = searchParams.toString()
    ? `${SUB2API_ANNOUNCEMENTS_ENDPOINT}?${searchParams.toString()}`
    : SUB2API_ANNOUNCEMENTS_ENDPOINT

  try {
    const data = await fetchSub2ApiData<Sub2ApiAnnouncementListData>(
      request,
      endpoint,
      {
        method: "GET",
        cache: "no-store",
      },
    )

    return extractSub2ApiAnnouncementItems(data)
  } catch (error) {
    logger.error("Failed to fetch Sub2API announcements", {
      accountId: request.accountId,
      endpoint,
      error: getSafeErrorMessage(error),
    })
    throw error
  }
}

/**
 * Mark a Sub2API announcement as read after it has been delivered locally.
 */
export async function markSub2ApiAnnouncementRead(
  request: ApiServiceRequest,
  id: string | number,
): Promise<boolean> {
  const endpoint = `${SUB2API_ANNOUNCEMENTS_ENDPOINT}/${encodeURIComponent(
    String(id),
  )}/read`

  try {
    await fetchSub2ApiData<void>(
      request,
      endpoint,
      {
        method: "POST",
      },
      { allowMissingData: true },
    )

    return true
  } catch (error) {
    logger.warn("Failed to mark Sub2API announcement as read", {
      accountId: request.accountId,
      endpoint,
      error: getSafeErrorMessage(error),
    })
    return false
  }
}
