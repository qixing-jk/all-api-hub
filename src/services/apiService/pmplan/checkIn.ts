import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { PMPLAN_ENDPOINTS } from "./constants"
import { fetchPmplan } from "./index"

/** Native /api/me owns the server day; the slider captcha is required before each claim. */
export async function fetchPmplanCheckInStatus(request: ApiServiceRequest) {
  const body = await fetchPmplan(request, PMPLAN_ENDPOINTS.Identity)
  const status = isRecord(body) ? body.checkin : undefined
  if (
    !isRecord(status) ||
    typeof status.checked_in_today !== "boolean" ||
    typeof status.can_checkin !== "boolean" ||
    typeof status.today !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(status.today) ||
    typeof status.streak !== "number" ||
    !Number.isSafeInteger(status.streak) ||
    status.streak < 0
  )
    throw new ApiError(
      "Invalid PM-Plan check-in status",
      undefined,
      PMPLAN_ENDPOINTS.Identity,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  return {
    checkedInToday: status.checked_in_today,
    canCheckIn: status.can_checkin,
    today: status.today,
    streak: status.streak,
    requiresManualVerification: true,
  }
}
