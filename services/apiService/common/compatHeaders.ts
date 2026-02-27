/**
 * Compatibility headers for One-API/New-API family deployments.
 *
 * Different downstream forks read different user-id header names, so we fan-out
 * the same `userId` value across multiple known keys.
 */

export const COMPAT_USER_ID_HEADER_NAMES = [
  "New-API-User",
  "Veloera-User",
  "voapi-user",
  "User-id",
  "Rix-Api-User",
  "neo-api-user",
] as const

export type CompatUserIdHeaderName =
  (typeof COMPAT_USER_ID_HEADER_NAMES)[number]

/**
 * Build compatibility headers that fan-out the same `userId` across all known
 * One-API/New-API downstream header names.
 *
 * Returns an empty object when `userId` is missing/invalid.
 */
export function buildCompatUserIdHeaders(
  userId: number | string | null | undefined,
): Partial<Record<CompatUserIdHeaderName, string>> {
  if (!userId) return {}

  const value = String(userId)
  const headers: Partial<Record<CompatUserIdHeaderName, string>> = {}

  for (const name of COMPAT_USER_ID_HEADER_NAMES) {
    headers[name] = value
  }

  return headers
}
