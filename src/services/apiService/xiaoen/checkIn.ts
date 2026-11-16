import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { readDayStableCheckInObservation } from "~/services/checkin/statusObservation"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"

import { XIAOEN_ENDPOINTS } from "./constants"
import { fetchIdentity } from "./index"
import {
  fetchXiaoenEnvelope,
  invalidXiaoenResponse,
  withXiaoenSession,
} from "./transport"

type XiaoenCheckInIdentity = Record<string, unknown> & {
  hasSignedInToday: boolean
}

/** Validate the live identity and retain its native status payload. */
async function fetchCheckInIdentity(
  request: ApiServiceRequest,
  options: RequestInit = {},
): Promise<XiaoenCheckInIdentity> {
  const { data } = await fetchIdentity(request, options)
  if (typeof data.hasSignedInToday !== "boolean")
    throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Identity)
  return { ...data, hasSignedInToday: data.hasSignedInToday }
}

/** Read today's authoritative check-in flag from the authenticated console. */
export async function fetchCheckInStatus(request: ApiServiceRequest) {
  return (await fetchCheckInIdentity(request)).hasSignedInToday
}

/** Read a day-stable identity with one Cookie capture, then send once. */
export async function performCheckIn(request: ApiServiceRequest) {
  return withXiaoenSession(request, async (request) => {
    const statusObservation = await readDayStableCheckInObservation(() =>
      fetchCheckInIdentity(request, { cache: "no-store" }),
    )
    if (!statusObservation)
      return {
        alreadyChecked: false as const,
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      }
    if (statusObservation.observation.hasSignedInToday)
      return {
        alreadyChecked: true as const,
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        statusObservation,
      }
    const envelope = await fetchXiaoenEnvelope(
      request,
      XIAOEN_ENDPOINTS.SignIn,
      { method: "POST" },
    )
    // Daily points have no verified cash value. Preserve the site's message/data, not a quota reward.
    return {
      alreadyChecked: false as const,
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      data: envelope.data,
      message:
        typeof envelope.message === "string" ? envelope.message : undefined,
    }
  })
}
