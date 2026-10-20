import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { EMRANK_ENDPOINTS } from "./constants"
import { fetchEmRankIdentity } from "./identity"
import {
  emRankCount,
  invalidEmRankResponse,
  readEmRank,
  withEmRankSession,
} from "./transport"

/**
 * Redeem one native code. The console answers `{delta}` in Token credit; an
 * invalid code surfaces as an upstream 4xx business error and is never
 * converted into a fabricated credit.
 */
export async function redeemCode(
  request: ApiServiceRequest,
  code: string,
): Promise<number> {
  const trimmed = code.trim()
  if (!trimmed) invalidEmRankResponse(EMRANK_ENDPOINTS.Redeem)
  return withEmRankSession(request, async (scoped) => {
    await fetchEmRankIdentity(scoped)
    const body = await readEmRank(scoped, EMRANK_ENDPOINTS.Redeem, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: trimmed }),
    })
    if (body.delta === undefined || body.delta === null)
      invalidEmRankResponse(EMRANK_ENDPOINTS.Redeem)
    return emRankCount(body.delta, EMRANK_ENDPOINTS.Redeem)
  })
}

/** Whether this deployment reports check-in as enabled for the account. */
export async function fetchCheckInSupport(
  request: ApiServiceRequest,
): Promise<boolean> {
  return withEmRankSession(request, async (scoped) => {
    await fetchEmRankIdentity(scoped)
    const body = await readEmRank(scoped, EMRANK_ENDPOINTS.Account)
    if (!isRecord(body.capabilities))
      invalidEmRankResponse(EMRANK_ENDPOINTS.Account)
    if (typeof body.capabilities.check_in_available !== "boolean")
      invalidEmRankResponse(EMRANK_ENDPOINTS.Account)
    return body.capabilities.check_in_available
  })
}
