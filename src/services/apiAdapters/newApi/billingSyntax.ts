import { BILLING_EXPRESSION_LIMITS } from "./billingLimits"

/** Split only outside strings and parentheses; never evaluate wire text. */
export function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = []
  let start = 0,
    depth = 0,
    quoted = false,
    escaped = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === "(") depth++
    else if (char === ")") depth--
    else if (depth === 0 && text.startsWith(separator, i)) {
      parts.push(text.slice(start, i).trim())
      start = i + separator.length
      i += separator.length - 1
    }
    if (depth < 0 || depth > BILLING_EXPRESSION_LIMITS.PARENTHESIS_DEPTH)
      return []
  }
  return depth || quoted ? [] : [...parts, text.slice(start).trim()]
}

/** Remove balanced enclosing parentheses without changing expression grouping. */
export function unwrap(text: string): string {
  let result = text.trim()
  while (
    result.startsWith("(") &&
    result.endsWith(")") &&
    splitTopLevel(result.slice(1, -1), "\0").length === 1
  )
    result = result.slice(1, -1).trim()
  return result
}

/** Parse bounded boolean groups with a caller-owned, non-executable leaf grammar. */
export function parseBooleanConditions<T>(
  text: string,
  leaf: (text: string) => T[][] | undefined,
): T[][] | undefined {
  const value = unwrap(text)
  const alternatives = splitTopLevel(value, "||")
  if (!alternatives.length) return undefined
  if (alternatives.length > 1) {
    const result: T[][] = []
    for (const alternative of alternatives) {
      const next = parseBooleanConditions(alternative, leaf)
      if (
        !next ||
        result.length + next.length > BILLING_EXPRESSION_LIMITS.ALTERNATIVES
      )
        return undefined
      result.push(...next)
    }
    return result
  }
  const terms = splitTopLevel(value, "&&")
  if (terms.length > 1) {
    let result: T[][] = [[]]
    for (const term of terms) {
      const next = parseBooleanConditions(term, leaf)
      if (
        !next ||
        result.length * next.length > BILLING_EXPRESSION_LIMITS.ALTERNATIVES
      )
        return undefined
      result = result.flatMap((previous) =>
        next.map((group) => [...previous, ...group]),
      )
      if (
        result.some(
          (group) =>
            group.length > BILLING_EXPRESSION_LIMITS.CONDITIONS_PER_GROUP,
        )
      )
        return undefined
    }
    return result
  }
  return leaf(value)
}
