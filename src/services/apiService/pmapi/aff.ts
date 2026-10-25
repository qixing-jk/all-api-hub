import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { PMAPI_ENDPOINTS } from "./constants"
import { fetchPmApiIdentity } from "./identity"
import { fetchPmApiData, invalidPmApiResponse } from "./transport"

export type PmApiAff = {
  code: string
  /** Shareable invite URL on the account's own deployment origin. */
  inviteUrl: string
  invitedCount: number
  /** Referral reward granted to the inviter, in the console quota unit. */
  reward: number
  raw: unknown
}

/** Read the account's referral code and build the console's invite URL. */
export async function fetchPmApiAff(
  request: ApiServiceRequest,
): Promise<PmApiAff> {
  await fetchPmApiIdentity(request)
  const data = await fetchPmApiData(request, PMAPI_ENDPOINTS.Aff)
  if (
    !isRecord(data) ||
    typeof data.code !== "string" ||
    !data.code.trim() ||
    (data.count !== undefined &&
      (typeof data.count !== "number" || !Number.isFinite(data.count)))
  )
    return invalidPmApiResponse(PMAPI_ENDPOINTS.Aff)
  const origin = new URL(request.baseUrl).origin
  return {
    code: data.code.trim(),
    inviteUrl: `${origin}/register?aff=${encodeURIComponent(data.code.trim())}`,
    invitedCount: typeof data.count === "number" ? data.count : 0,
    reward:
      typeof data.reward === "number" && Number.isFinite(data.reward)
        ? data.reward
        : 0,
    raw: data,
  }
}
