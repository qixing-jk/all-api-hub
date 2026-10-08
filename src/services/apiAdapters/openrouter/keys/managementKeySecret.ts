export const OPENROUTER_MANAGEMENT_KEY_SECRET_MAX_LENGTH = 256

const OPENROUTER_MANAGEMENT_KEY_SECRET_PATTERN = /^sk-or-[A-Za-z0-9_-]+$/

/**
 * Normalizes the one-time OpenRouter Management Key secret shared across
 * page, background, and runtime-message trust boundaries.
 *
 * OpenRouter's published SDK example is a 73-character `sk-or-v1-...` key,
 * while management keys use the `sk-or-mgmt-...` prefix. The larger local
 * protocol limit preserves compatibility headroom while bounding untrusted
 * page and runtime payloads.
 * @see https://github.com/OpenRouterTeam/typescript-sdk/blob/main/docs/models/operations/exchangeauthcodeforapikeyresponse.mdx
 * @see https://github.com/OpenRouterTeam/terraform-provider-openrouter/blob/main/README.md
 */
export function normalizeOpenRouterManagementKeySecret(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  if (
    normalized.length > OPENROUTER_MANAGEMENT_KEY_SECRET_MAX_LENGTH ||
    !OPENROUTER_MANAGEMENT_KEY_SECRET_PATTERN.test(normalized)
  ) {
    return undefined
  }
  return normalized
}
