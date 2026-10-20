import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { EMRANK_ENDPOINTS } from "./constants"
import { readEmRank } from "./transport"

export type EmRankIdentity = {
  id: number
  username: string
  displayName: string
}

/**
 * The console identifies an account by its numeric site id plus a stable
 * username. `/api/auth/session` is the same session the site itself uses for
 * every authenticated page.
 */
export function parseEmRankIdentity(body: unknown): EmRankIdentity | null {
  if (!isRecord(body) || body.authenticated !== true) return null
  const user = body.user
  if (
    !isRecord(user) ||
    typeof user.id !== "number" ||
    !Number.isSafeInteger(user.id) ||
    user.id <= 0 ||
    typeof user.username !== "string" ||
    !user.username.trim()
  )
    return null
  return {
    id: user.id,
    username: user.username.trim(),
    displayName:
      typeof user.display_name === "string" && user.display_name.trim()
        ? user.display_name.trim()
        : user.username.trim(),
  }
}

/** Verify the live session before any account read or mutation. */
export async function fetchEmRankIdentity(
  request: ApiServiceRequest,
): Promise<EmRankIdentity> {
  const user = parseEmRankIdentity(
    await readEmRank(request, EMRANK_ENDPOINTS.Identity),
  )
  if (!user) {
    throw new ApiError(
      "EMRank console session unavailable",
      401,
      EMRANK_ENDPOINTS.Identity,
      API_ERROR_CODES.HTTP_401,
    )
  }
  if (
    request.auth.userId !== undefined &&
    String(request.auth.userId) !== String(user.id)
  )
    throw new ApiError(
      "EMRank account identity mismatch",
      undefined,
      EMRANK_ENDPOINTS.Identity,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  return user
}

/** Normalize only verified live identity into the onboarding contract. */
export async function fetchEmRankUserInfo(
  request: ApiServiceRequest,
): Promise<UserInfo> {
  const user = await fetchEmRankIdentity(request)
  return {
    id: String(user.id),
    username: user.username,
    access_token: null,
  }
}
