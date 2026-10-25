import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { PMAPI_ENDPOINTS } from "./constants"
import { fetchPmApiData, invalidPmApiResponse } from "./transport"

export type PmApiIdentity = {
  id: number
  username: string
  /** Console display name; falls back to the username when unset. */
  displayName: string
  /** Stored balance in the console's New API quota unit. */
  quota: number
  usedQuota: number
  requestCount: number
  checkedInToday: boolean
  affCode: string
  email: string
  group: string
  status: number
  createdAt: number
}

/**
 * The console identifies an account by its numeric user id plus username.
 * `quota` is the site's own internal unit (`quota_per_unit: 500000` per USD,
 * `display_unit: "USD"` from `/api/status`), so it passes through without
 * conversion. Accepts either the envelope or its unwrapped `data` object.
 */
export function parsePmApiIdentity(body: unknown): PmApiIdentity {
  const endpoint = PMAPI_ENDPOINTS.Identity
  const user = isRecord(body) && isRecord(body.data) ? body.data : body
  if (!isRecord(user)) return invalidPmApiResponse(endpoint)
  if (
    typeof user.id !== "number" ||
    !Number.isSafeInteger(user.id) ||
    user.id <= 0 ||
    typeof user.username !== "string" ||
    !user.username.trim() ||
    (user.display_name !== undefined &&
      typeof user.display_name !== "string") ||
    (user.quota !== undefined &&
      (typeof user.quota !== "number" || !Number.isFinite(user.quota))) ||
    (user.used_quota !== undefined &&
      (typeof user.used_quota !== "number" ||
        !Number.isFinite(user.used_quota)))
  )
    return invalidPmApiResponse(endpoint)
  return {
    id: user.id,
    username: user.username.trim(),
    displayName:
      typeof user.display_name === "string" && user.display_name.trim()
        ? user.display_name.trim()
        : user.username.trim(),
    quota: typeof user.quota === "number" ? user.quota : 0,
    usedQuota: typeof user.used_quota === "number" ? user.used_quota : 0,
    requestCount:
      typeof user.request_count === "number" ? user.request_count : 0,
    checkedInToday: user.checked_in_today === true,
    affCode: typeof user.aff_code === "string" ? user.aff_code : "",
    email: typeof user.email === "string" ? user.email : "",
    group: typeof user.group === "string" ? user.group : "",
    status: typeof user.status === "number" ? user.status : 1,
    createdAt: typeof user.created_at === "number" ? user.created_at : 0,
  }
}

/** Verify the live endpoint before any account read or mutation. */
export async function fetchPmApiIdentity(
  request: ApiServiceRequest,
): Promise<PmApiIdentity> {
  const user = parsePmApiIdentity(
    await fetchPmApiData(request, PMAPI_ENDPOINTS.Identity),
  )
  if (
    request.auth.userId !== undefined &&
    String(request.auth.userId) !== String(user.id)
  )
    throw new ApiError(
      "PM-API account identity mismatch",
      undefined,
      PMAPI_ENDPOINTS.Identity,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  return user
}

/** Normalize only verified live identity into the onboarding contract. */
export async function fetchPmApiUserInfo(
  request: ApiServiceRequest,
): Promise<UserInfo> {
  const user = await fetchPmApiIdentity(request)
  return { id: String(user.id), username: user.username, access_token: null }
}
