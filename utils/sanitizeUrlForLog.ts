/**
 * Formats a URL for logging by removing query parameters and fragments.
 * @param url The full URL to format.
 * @returns The formatted URL.
 */
export function sanitizeUrlForLog(url: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return url
  }
}
