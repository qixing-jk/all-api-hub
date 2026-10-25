import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { PMAPI_ENDPOINTS } from "./constants"
import { fetchPmApiIdentity } from "./identity"
import { fetchPmApiData, invalidPmApiResponse } from "./transport"

/**
 * Applies one redemption code and reports the granted quota in the console's
 * New API unit. The extension never replays a code after a lost response.
 */
export async function redeemPmApiCode(
  request: ApiServiceRequest,
  code: string,
): Promise<{ quotaGranted: number }> {
  const trimmed = code.trim()
  if (!trimmed) return invalidPmApiResponse(PMAPI_ENDPOINTS.Redeem)
  await fetchPmApiIdentity(request)
  const granted = await fetchPmApiData(request, PMAPI_ENDPOINTS.Redeem, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: trimmed }),
  })
  if (!isRecord(granted) || typeof granted.quota !== "number")
    return invalidPmApiResponse(PMAPI_ENDPOINTS.Redeem)
  return { quotaGranted: granted.quota }
}
