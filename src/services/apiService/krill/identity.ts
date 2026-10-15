import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { KRILL_ENDPOINTS } from "./constants"
import {
  invalidKrillResponse,
  readKrill,
  readKrillEnvelope,
  usdAmount,
  withKrillSession,
} from "./transport"

export type KrillIdentity = {
  id: number
  email: string
  creditBalanceUsd: number
  enterpriseMemberships: readonly unknown[]
}

/**
 * The console identifies an account by its numeric user id plus email.
 * `credit_balance_usd` is USD cash, not plan allowance or welfare credit.
 * Accepts either the full envelope or its unwrapped `data` object.
 */
export function parseKrillIdentity(
  body: unknown,
  endpoint: string = KRILL_ENDPOINTS.Identity,
): KrillIdentity {
  const user = isRecord(body) && isRecord(body.data) ? body.data : body
  if (!isRecord(user)) invalidKrillResponse(endpoint)
  if (
    typeof user.id !== "number" ||
    !Number.isSafeInteger(user.id) ||
    user.id <= 0 ||
    typeof user.email !== "string" ||
    !user.email.trim() ||
    !Array.isArray(user.enterprise_memberships)
  )
    invalidKrillResponse(endpoint)
  return {
    id: user.id,
    email: user.email.trim(),
    creditBalanceUsd: usdAmount(user.credit_balance_usd, endpoint),
    enterpriseMemberships: user.enterprise_memberships,
  }
}

/** Verify the live endpoint before any account read or mutation. */
export async function fetchKrillIdentity(
  request: ApiServiceRequest,
): Promise<KrillIdentity> {
  const user = parseKrillIdentity(
    await readKrill(request, KRILL_ENDPOINTS.Identity),
  )
  if (
    request.auth.userId !== undefined &&
    String(request.auth.userId) !== String(user.id)
  )
    throw new ApiError(
      "Krill AI account identity mismatch",
      undefined,
      KRILL_ENDPOINTS.Identity,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  return user
}

/** Normalize only verified live identity into the onboarding contract. */
export async function fetchKrillUserInfo(
  request: ApiServiceRequest,
): Promise<UserInfo> {
  const user = await fetchKrillIdentity(request)
  return { id: String(user.id), username: user.email, access_token: null }
}

/** Account-scoped reads and grants must use the same verified Cookie snapshot. */
export function readKrillAccountEnvelope(
  request: ApiServiceRequest,
  endpoint: string,
  options?: RequestInit,
) {
  return withKrillSession(request, async (scoped) => {
    await fetchKrillIdentity(scoped)
    return readKrillEnvelope(scoped, endpoint, options)
  })
}
