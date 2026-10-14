import { isRecord } from "~/utils/core/object"

/** CharityAPI identities are opaque strings; never use the inference key as a console token. */
export function parseXiaoenIdentity(body: unknown) {
  if (!isRecord(body) || body.success !== true || !isRecord(body.data))
    return null
  const user = body.data
  if (
    typeof user.id !== "string" ||
    !user.id.trim() ||
    typeof user.username !== "string"
  )
    return null
  return { id: user.id, username: user.username, access_token: null }
}
