import { MODELFLARE_USER_ID_HEADER_NAME } from "~/services/accountSiteDefinitions/identifiers"

/**
 * Compatibility headers for One-API/New-API family deployments.
 *
 * Different downstream forks read different user-id header names, so we fan-out
 * the same `userId` value across multiple known keys.
 */

const COMPAT_USER_ID_HEADER_NAMES = [
  // New API account endpoints: https://github.com/QuantumNous/new-api
  "New-API-User",
  // ModelFlare's New API-derived account endpoints: https://modelflare.dev/
  MODELFLARE_USER_ID_HEADER_NAME,
  // Veloera account endpoints: https://github.com/Veloera/Veloera
  "Veloera-User",
  // V-API account endpoints: https://github.com/popjane/v-api
  "X-Api-User",
  // Legacy VoAPI compatibility. Verify the target deployment before changing.
  "voapi-user",
  // Added in commit cb7527d2b15a2c99bc39827fe3ae1d7590622428 for Super-API
  // compatibility. Keep sending it as a broad fallback header, but do not
  // treat it as a site-specific detection signal from error messages because
  // the name itself is too generic.
  "User-id",
  // Existing Rix-Api and Neo-API compatibility contracts; no canonical
  // public protocol source is currently recorded in this repository.
  "Rix-Api-User",
  "neo-api-user",
] as const

type CompatUserIdHeaderName = (typeof COMPAT_USER_ID_HEADER_NAMES)[number]

/**
 * Compatibility headers whose deployments validate the value as the numeric
 * account id instead of treating it as an inert compatibility key.
 *
 * Rix API answers a non-numeric `Rix-Api-User` with a format error and a
 * mismatched integer with another user's-id error on token-authenticated
 * requests, so an identity that is only a username must not be sent under this
 * name. Observed 2026-09-26 on Rix API 6.x; other compatibility headers keep
 * fanning out every identity because their deployments ignore the value.
 */
const NUMERIC_USER_ID_ONLY_HEADER_NAMES: ReadonlySet<string> = new Set([
  "Rix-Api-User",
])

const NUMERIC_USER_ID_PATTERN = /^\d+$/

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
    if (
      NUMERIC_USER_ID_ONLY_HEADER_NAMES.has(name) &&
      !NUMERIC_USER_ID_PATTERN.test(value)
    ) {
      continue
    }

    headers[name] = value
  }

  return headers
}
