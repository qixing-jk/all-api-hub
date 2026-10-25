import { safeRandomUUID } from "~/utils/core/identifier"

/** Unknown organization identity stays local; a key ID is never a user ID. */
export function resolveRequestyAccountUserId(
  orgId: string | undefined,
  localUserId?: unknown,
): string {
  if (orgId) return orgId
  const local = typeof localUserId === "string" ? localUserId.trim() : undefined
  return local?.startsWith("requesty:") ? local : `requesty:${safeRandomUUID()}`
}
