import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { isRecord } from "~/utils/core/object"

import { PMAPI_ENDPOINTS } from "./constants"
import { fetchPmApiIdentity } from "./identity"
import { fetchPmApiData, invalidPmApiResponse } from "./transport"

export type PmApiCheckInOverview = {
  /** `false` means today's grant was already taken. */
  checkedInToday: boolean
  /** Consecutive days currently reported by the console calendar. */
  streak: number
  /** Cumulative reward total in the console quota unit. */
  total: number
}

/**
 * Today's authoritative check-in state lives on the account identity
 * (`checked_in_today` from `/api/me`); the calendar route only reports the
 * streak history. `false` never means "no check-in feature": per-deployment
 * support comes from `/api/status` (`checkin_enabled`).
 */
export async function fetchPmApiCheckInOverview(
  request: ApiServiceRequest,
): Promise<PmApiCheckInOverview> {
  const identity = await fetchPmApiIdentity(request)
  const data = await fetchPmApiData(request, PMAPI_ENDPOINTS.CheckIn)
  if (
    !isRecord(data) ||
    typeof data.streak !== "number" ||
    !Number.isFinite(data.streak) ||
    data.streak < 0 ||
    typeof data.total !== "number" ||
    !Number.isFinite(data.total) ||
    data.total < 0
  )
    return invalidPmApiResponse(PMAPI_ENDPOINTS.CheckIn)
  return {
    checkedInToday: identity.checkedInToday,
    streak: data.streak,
    total: data.total,
  }
}

/**
 * Check once, send once. The mutation decision reads only the identity's
 * `checked_in_today`; the calendar route serves status display, not the
 * gate. The console's own check-in button POSTs without a captcha token; a
 * deployment that enforces its slider scene answers a business failure that
 * is surfaced unchanged.
 */
export async function performPmApiCheckIn(request: ApiServiceRequest) {
  const identity = await fetchPmApiIdentity(request)
  if (identity.checkedInToday) return { alreadyChecked: true as const }
  const granted = await fetchPmApiData(request, PMAPI_ENDPOINTS.CheckIn, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
  if (!isRecord(granted) || typeof granted.quota !== "number")
    return invalidPmApiResponse(PMAPI_ENDPOINTS.CheckIn)
  return {
    alreadyChecked: false as const,
    status: CHECKIN_RESULT_STATUS.SUCCESS,
    quotaGranted: granted.quota,
    raw: granted,
  }
}
