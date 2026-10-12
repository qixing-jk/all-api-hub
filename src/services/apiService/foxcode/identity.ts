import { isRecord } from "~/utils/core/object"

/** The Nuxt console uses string account IDs, not New API numeric identities. */
export function parseFoxCodeIdentity(body: unknown) {
  if (!isRecord(body) || body.success !== true || !isRecord(body.data))
    return null
  const user = body.data.user
  if (!isRecord(user) || typeof user.id !== "string" || !user.id.trim())
    return null
  return {
    id: user.id,
    username: typeof user.name === "string" ? user.name : "",
    access_token: null,
  }
}
