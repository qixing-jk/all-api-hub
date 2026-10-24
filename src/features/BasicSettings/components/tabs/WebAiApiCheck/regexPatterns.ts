import { isSafeRegexPattern } from "~/utils/core/regex"

/**
 * Parse a newline-separated list of RegExp pattern strings and report invalid items.
 *
 * This mirrors runtime behavior: patterns are compiled with the `i` flag and invalid
 * patterns are treated as non-matching.
 */
function validateRegexPatterns(lines: string[]): {
  patterns: string[]
  invalid: string[]
} {
  const patterns = lines.map((line) => (line ?? "").trim()).filter(Boolean)

  const invalid: string[] = []
  for (const pattern of patterns) {
    try {
      // Match runtime behavior: compile with case-insensitive flag.
      // Invalid patterns are treated as non-matching in runtime gating logic.
      new RegExp(pattern, "i")
    } catch {
      invalid.push(pattern)
    }
  }

  return { patterns, invalid }
}

/**
 * Separate cleanup patterns that are safe to persist from invalid entries.
 */
export function validateSafeRegexPatterns(lines: string[]): {
  patterns: string[]
  invalid: string[]
} {
  const result = validateRegexPatterns(lines)
  const unsafe = result.patterns.filter(
    (pattern) =>
      !result.invalid.includes(pattern) && !isSafeRegexPattern(pattern, "i"),
  )
  const invalid = [...result.invalid, ...unsafe]
  const invalidPatterns = new Set(invalid)
  return {
    patterns: result.patterns.filter(
      (pattern) => !invalidPatterns.has(pattern),
    ),
    invalid,
  }
}
