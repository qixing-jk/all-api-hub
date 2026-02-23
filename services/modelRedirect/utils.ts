/**
 * Helpers shared across model redirect UI + services.
 */

/**
 * Treat empty strings and the literal empty object (`{}`) as "no model mapping".
 */
export function isEmptyModelMapping(
  modelMapping: string | null | undefined,
): boolean {
  const trimmed = (modelMapping ?? "").trim()
  return !trimmed || trimmed === "{}"
}
