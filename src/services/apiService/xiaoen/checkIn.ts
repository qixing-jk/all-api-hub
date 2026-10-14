import type { ApiServiceRequest } from "~/services/apiTransport/type"

import { XIAOEN_ENDPOINTS } from "./constants"
import { fetchIdentity } from "./index"
import {
  fetchXiaoenEnvelope,
  invalidXiaoenResponse,
  withXiaoenSession,
} from "./transport"

/** Read today's authoritative check-in flag from the authenticated console. */
export async function fetchCheckInStatus(request: ApiServiceRequest) {
  const { data } = await fetchIdentity(request)
  if (typeof data.hasSignedInToday !== "boolean")
    throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Identity)
  return data.hasSignedInToday
}

/** Check once, send once. Uncertain responses are reconciled by the shared status policy. */
export async function performCheckIn(request: ApiServiceRequest) {
  return withXiaoenSession(request, async (request) => {
    if (await fetchCheckInStatus(request))
      return { alreadyChecked: true as const }
    const envelope = await fetchXiaoenEnvelope(
      request,
      XIAOEN_ENDPOINTS.SignIn,
      { method: "POST" },
    )
    // Daily points have no verified cash value. Preserve the site's message/data, not a quota reward.
    return {
      alreadyChecked: false as const,
      data: envelope.data,
      message:
        typeof envelope.message === "string" ? envelope.message : undefined,
    }
  })
}
