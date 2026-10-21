import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { DAYA_ENDPOINTS } from "./constants"
import { fetchDayaData, invalidDayaResponse } from "./transport"

export type DayaIdentity = {
  id: number
  username: string
  /** Stored USD credit; `null` when the read did not include it. */
  balanceUsd: number | null
  status: string
}

/**
 * The console identifies an account by its numeric user id plus username.
 * `balance` is stored USD credit; subscription allowance is reported
 * separately and never merged into it. Accepts either the envelope or its
 * unwrapped `data` object; the passive identity check may omit balance.
 */
export function parseDayaIdentity(body: unknown): DayaIdentity {
  const endpoint = DAYA_ENDPOINTS.Identity
  const user = isRecord(body) && isRecord(body.data) ? body.data : body
  if (!isRecord(user)) return invalidDayaResponse(endpoint)
  if (
    typeof user.id !== "number" ||
    !Number.isSafeInteger(user.id) ||
    user.id <= 0 ||
    typeof user.username !== "string" ||
    !user.username.trim() ||
    (user.status !== undefined && typeof user.status !== "string") ||
    (user.balance !== undefined && typeof user.balance !== "number")
  )
    return invalidDayaResponse(endpoint)
  return {
    id: user.id,
    username: user.username.trim(),
    balanceUsd: typeof user.balance === "number" ? user.balance : null,
    status: typeof user.status === "string" ? user.status : "active",
  }
}

/** Verify the live endpoint before any account read or mutation. */
export async function fetchDayaIdentity(
  request: ApiServiceRequest,
): Promise<DayaIdentity> {
  const user = parseDayaIdentity(
    await fetchDayaData(request, DAYA_ENDPOINTS.Identity),
  )
  if (
    request.auth.userId !== undefined &&
    String(request.auth.userId) !== String(user.id)
  )
    throw new ApiError(
      "Daya API account identity mismatch",
      undefined,
      DAYA_ENDPOINTS.Identity,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  return user
}

/** Normalize only verified live identity into the onboarding contract. */
export async function fetchDayaUserInfo(
  request: ApiServiceRequest,
): Promise<UserInfo> {
  const user = await fetchDayaIdentity(request)
  return { id: String(user.id), username: user.username, access_token: null }
}
