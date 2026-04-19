import { tryParseUrlPrefix } from "~/utils/core/urlParsing"

/**
 * Formats a URL for logging by removing query parameters and fragments.
 * @param url The full URL to format.
 * @returns The formatted URL.
 */
export function sanitizeUrlForLog(url: string) {
  return tryParseUrlPrefix(url) ?? url.replace(/[?#].*$/, "")
}
