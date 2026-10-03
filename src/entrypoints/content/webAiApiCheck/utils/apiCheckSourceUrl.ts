import { isHttpUrl } from "~/utils/core/urlParsing"

/**
 * Normalizes the "source page" input shown when saving detected credentials.
 *
 * Keeps the full HTTP(S) URL (path, query, and hash included) because the user
 * revisits the recorded page; anything else is treated as "no source".
 */
export function normalizeApiCheckSourceUrl(
  value: string | null | undefined,
): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return isHttpUrl(trimmed) ? trimmed : undefined
}
