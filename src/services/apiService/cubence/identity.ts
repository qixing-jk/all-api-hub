import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { withCubenceSession } from "./session"
import { invalidCubenceResponse, readCubenceResponse } from "./transport"

export const CUBENCE_ME_ENDPOINT = "/api/v1/auth/me"

/** Validate the live endpoint; cached auth-user is not proof of the current session. */
function parseCubenceUser(
  body: unknown,
): Record<string, unknown> & { id: number; username: string } {
  const user = isRecord(body) ? body.user : undefined
  if (
    !isRecord(user) ||
    typeof user.id !== "number" ||
    !Number.isSafeInteger(user.id) ||
    user.id <= 0 ||
    typeof user.username !== "string" ||
    user.active !== true
  )
    return invalidCubenceResponse(CUBENCE_ME_ENDPOINT)
  return { ...user, id: user.id, username: user.username }
}

/** Verify origin and the saved identity before any account read or mutation. */
async function readUncachedCubenceUser(request: ApiServiceRequest) {
  const user = parseCubenceUser(
    await readCubenceResponse(request, CUBENCE_ME_ENDPOINT),
  )
  if (
    request.auth.userId !== undefined &&
    String(request.auth.userId) !== String(user.id)
  ) {
    throw new ApiError(
      "Cubence account identity mismatch",
      undefined,
      CUBENCE_ME_ENDPOINT,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  }
  return user
}

const userReads = new WeakMap<
  ApiServiceRequest,
  ReturnType<typeof readUncachedCubenceUser>
>()

/** Share only within a prepared operation; later refreshes always read fresh balance/identity. */
export async function readCubenceUser(request: ApiServiceRequest) {
  if (import.meta.env.BROWSER === "firefox")
    return readUncachedCubenceUser(request)
  return withCubenceSession(request, async (scoped) => {
    let user = userReads.get(scoped)
    if (!user) {
      user = readUncachedCubenceUser(scoped)
      userReads.set(scoped, user)
    }
    return user
  })
}

/** Normalize only verified live identity into the onboarding contract. */
export async function fetchUserInfo(
  request: ApiServiceRequest,
): Promise<UserInfo> {
  const user = await readCubenceUser(request)
  return { id: String(user.id), username: user.username, access_token: null }
}
