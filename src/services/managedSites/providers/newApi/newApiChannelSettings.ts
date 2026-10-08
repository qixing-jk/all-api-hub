/** Decodes an optional native JSON object without replacing malformed settings. */
export function readNewApiSettings(
  value?: string | null,
): Record<string, unknown> | undefined {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}
