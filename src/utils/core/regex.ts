import safeRegex from "safe-regex2"

/**
 * Reject syntactically invalid or potentially exponential regular expressions.
 */
export function isSafeRegexPattern(pattern: string, flags = ""): boolean {
  try {
    return safeRegex(new RegExp(pattern, flags))
  } catch {
    return false
  }
}
