import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"

/**
 * Compatibility headers for One-API/New-API family deployments.
 *
 * Different downstream forks read different user-id header names, so we fan-out
 * the same `userId` value across multiple known keys.
 */

const COMPAT_USER_ID_HEADER_TO_SITE_TYPE = {
  "New-API-User": SITE_TYPES.NEW_API,
  "Veloera-User": SITE_TYPES.VELOERA,
  // V-API support follows the requested popjane/v-api contract: user id in X-Api-User.
  "X-Api-User": SITE_TYPES.V_API,
  "voapi-user": SITE_TYPES.VO_API,
  // Added in commit cb7527d2b15a2c99bc39827fe3ae1d7590622428 for Super-API
  // compatibility. Keep sending it as a broad fallback header, but do not
  // treat it as a site-specific detection signal from error messages because
  // the name itself is too generic.
  "User-id": SITE_TYPES.NEW_API,
  "Rix-Api-User": SITE_TYPES.RIX_API,
  "neo-api-user": SITE_TYPES.NEO_API,
} as const satisfies Record<string, AccountSiteType>

/**
 * Error-message detection should only use header names that carry an
 * unambiguous site-family signal. Generic compatibility headers like `User-id`
 * are intentionally excluded to avoid over-classifying unrelated deployments.
 */
export const COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE = {
  "New-API-User": SITE_TYPES.NEW_API,
  "Veloera-User": SITE_TYPES.VELOERA,
  "X-Api-User": SITE_TYPES.V_API,
  "voapi-user": SITE_TYPES.VO_API,
  "Rix-Api-User": SITE_TYPES.RIX_API,
  "neo-api-user": SITE_TYPES.NEO_API,
} as const satisfies Record<string, AccountSiteType>

const COMPAT_USER_ID_HEADER_NAMES = Object.keys(
  COMPAT_USER_ID_HEADER_TO_SITE_TYPE,
) as Array<keyof typeof COMPAT_USER_ID_HEADER_TO_SITE_TYPE>

type CompatUserIdHeaderName = (typeof COMPAT_USER_ID_HEADER_NAMES)[number]

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
