import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { SiteAnnouncement } from "~/types/siteAnnouncements"
import { isRecord } from "~/utils/core/object"

import { PMPLAN_ENDPOINTS } from "./constants"
import { fetchPmplan } from "./index"

/** Personal notices must remain account-scoped; reading here does not acknowledge them upstream. */
export async function fetchPmplanAnnouncements(
  request: ApiServiceRequest,
): Promise<SiteAnnouncement[]> {
  const body = await fetchPmplan(request, PMPLAN_ENDPOINTS.Notices)
  if (!isRecord(body) || !Array.isArray(body.notices))
    throw new ApiError(
      "Invalid PM-Plan notices",
      undefined,
      PMPLAN_ENDPOINTS.Notices,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  // Reject cross-account batches before discarding individually malformed notices.
  if (
    !request.auth.userId ||
    body.notices.some(
      (notice) =>
        isRecord(notice) &&
        String(notice.user_id) !== String(request.auth.userId),
    )
  )
    throw new ApiError(
      "PM-Plan notice identity mismatch",
      undefined,
      PMPLAN_ENDPOINTS.Notices,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  return body.notices.flatMap((notice) => {
    if (
      !isRecord(notice) ||
      !Number.isSafeInteger(notice.id) ||
      Number(notice.id) <= 0 ||
      typeof notice.title !== "string" ||
      typeof notice.body !== "string" ||
      typeof notice.is_read !== "boolean" ||
      typeof notice.created_at !== "string" ||
      !Number.isFinite(Date.parse(notice.created_at))
    )
      return []
    return [
      {
        id: String(notice.id),
        title: notice.title,
        content: notice.body,
        createdAt: Date.parse(notice.created_at),
        read: notice.is_read,
      },
    ]
  })
}
