/**
 * Length of the generic redemption codes used by existing providers.
 */
export const REDEMPTION_CODE_LENGTH = 32

export const REDEMPTION_CODE_KINDS = {
  Generic: "generic",
  PmplanResetCard: "pmplan-reset-card",
} as const

export type RedemptionCodeKind =
  (typeof REDEMPTION_CODE_KINDS)[keyof typeof REDEMPTION_CODE_KINDS]

const PMPLAN_RESET_CODE_PATTERN =
  "PMRC-(?:[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-){3}[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}"

/** A known prefix constrains routing even when the supplied code is malformed. */
export function getRedemptionCodeKind(code: string): RedemptionCodeKind {
  return /^PMRC-/i.test(code.trim())
    ? REDEMPTION_CODE_KINDS.PmplanResetCard
    : REDEMPTION_CODE_KINDS.Generic
}

interface RedemptionCodeValidationOptions {
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

  if (
    getRedemptionCodeKind(normalized) === REDEMPTION_CODE_KINDS.PmplanResetCard
  )
    return new RegExp(`^${PMPLAN_RESET_CODE_PATTERN}$`, "i").test(normalized)

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

  const resetCodes = text.matchAll(
    new RegExp(
      `(?<![A-Za-z0-9_-])${PMPLAN_RESET_CODE_PATTERN}(?![A-Za-z0-9_-])`,
      "gi",
    ),
  )
  for (const [code] of resetCodes) unique.add(code.toUpperCase())

  // Even malformed native tokens retain their routing boundary: never salvage
  // a generic code from their tail and offer it to another provider.
  const nativeTokens = Array.from(text.matchAll(/PMRC-[A-Za-z0-9_-]+/gi))
  const strictMatches = text.matchAll(/[a-fA-F0-9]{32}/g)
  for (const match of strictMatches) {
    if (
      nativeTokens.some(
        (token) =>
          match.index >= token.index &&
          match.index < token.index + token[0].length,
      )
    )
      continue
    const [raw] = match
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

      if (getRedemptionCodeKind(cleaned) !== REDEMPTION_CODE_KINDS.Generic)
        continue

      const candidates = cleaned === token ? [token] : [token, cleaned]

      for (const candidate of candidates) {
        const normalized = candidate.trim()
        // Native codes were already extracted and case-normalized above.
        if (getRedemptionCodeKind(normalized) !== REDEMPTION_CODE_KINDS.Generic)
          continue
        if (isPossibleRedemptionCode(normalized, options)) {
          unique.add(normalized)
        }
      }
    }
  }

  return Array.from(unique)
}
