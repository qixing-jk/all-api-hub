import type { AccountPasswordCredentials } from "~/types/accountLogin"
import { isRecord } from "~/utils/core/object"

/** Normalize the login identifier, but preserve every password character. */
export function normalizePasswordCredentials(
  value: unknown,
): AccountPasswordCredentials | undefined {
  if (
    !isRecord(value) ||
    typeof value.username !== "string" ||
    !value.username.trim() ||
    typeof value.password !== "string" ||
    !value.password
  )
    return undefined
  return { username: value.username.trim(), password: value.password }
}
