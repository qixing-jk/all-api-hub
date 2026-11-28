import { isRecord } from "~/utils/core/object"

/** The OAuth console identity is distinct from a one-time inference key. */
export function parsePmplanIdentity(body: unknown) {
  if (!isRecord(body) || !isRecord(body.user)) return null
  const user = body.user
  if (
    typeof user.id !== "number" ||
    !Number.isSafeInteger(user.id) ||
    user.id <= 0 ||
    typeof user.username !== "string" ||
    !user.username.trim()
  )
    return null
  return { id: String(user.id), username: user.username, access_token: null }
}
