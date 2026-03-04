/**
 * Redemption code length used across supported providers.
 */
export const REDEMPTION_CODE_LENGTH = 32

export interface RedemptionCodeValidationOptions {
  /**
   * When enabled, accept any 32-character non-whitespace token instead of strict hex.
   */
  relaxedCharset?: boolean
}

/**
 * Quick heuristic to validate a candidate code before network calls.
 */
export function isPossibleRedemptionCode(
  code: string | undefined | null,
  options: RedemptionCodeValidationOptions = {},
): boolean {
  if (!code) return false

  const { relaxedCharset = false } = options
  const normalized = code.trim()

  if (normalized.length !== REDEMPTION_CODE_LENGTH) return false
  if (/\s/.test(normalized)) return false

  if (relaxedCharset) {
    return true
  }

  return /^[a-f0-9]{32}$/i.test(normalized)
}

/**
 * Extract unique redemption codes from arbitrary text blobs.
 * @param text Input such as modal content or multi-line clipboard strings.
 * @returns Deduplicated list of potential redemption codes.
 */
export function extractRedemptionCodesFromText(
  text: string,
  options: RedemptionCodeValidationOptions = {},
): string[] {
  if (!text) return []

  const unique = new Set<string>()

  const strictMatches = text.match(/[a-fA-F0-9]{32}/g) || []
  for (const raw of strictMatches) {
    const candidate = raw.trim()
    if (isPossibleRedemptionCode(candidate, { relaxedCharset: false })) {
      unique.add(candidate)
    }
  }

  if (options.relaxedCharset) {
    const tokens = text.split(/\s+/g).filter(Boolean)

    for (const token of tokens) {
      const cleaned = token
        .replace(/^[("'`([{<]+/g, "")
        .replace(/[)"'`\]}>.,;:!?]+$/g, "")

      const candidates = cleaned === token ? [token] : [token, cleaned]

      for (const candidate of candidates) {
        const normalized = candidate.trim()
        if (isPossibleRedemptionCode(normalized, options)) {
          unique.add(normalized)
        }
      }
    }
  }

  return Array.from(unique)
}
