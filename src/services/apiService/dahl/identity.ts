import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import { isRecord } from "~/utils/core/object"

/** The signed-in UI flag and inference token never establish console identity. */
export function parseDahlIdentity(body: unknown): UserInfo | null {
  if (
    !isRecord(body) ||
    !isRecord(body.user) ||
    typeof body.user.user_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      body.user.user_id,
    )
  )
    return null
  return {
    id: body.user.user_id,
    username: typeof body.user.username === "string" ? body.user.username : "",
    access_token: null,
  }
}
