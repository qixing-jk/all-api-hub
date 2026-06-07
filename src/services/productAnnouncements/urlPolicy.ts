import type { ProductAnnouncementCta, RawProductAnnouncementCta } from "./types"

/**
 * Hosts that product announcement CTA links may target.
 */
const ALLOWED_CTA_HOSTS = new Set(["github.com", "all-api-hub.qixing1217.top"])

/**
 * Allows links that stay inside the project repository namespace.
 */
function isAllowedGithubPath(url: URL): boolean {
  return (
    url.hostname === "github.com" &&
    url.pathname.startsWith("/qixing-jk/all-api-hub/")
  )
}

/**
 * Allows links to the project documentation site.
 */
function isAllowedDocsPath(url: URL): boolean {
  return url.hostname === "all-api-hub.qixing1217.top"
}

/**
 * Normalizes announcement CTA data and drops links outside the product allowlist.
 */
export function sanitizeProductAnnouncementCta(
  value: RawProductAnnouncementCta | undefined,
): ProductAnnouncementCta | null {
  const label = typeof value?.label === "string" ? value.label.trim() : ""
  const urlValue = typeof value?.url === "string" ? value.url.trim() : ""
  if (!label || !urlValue) return null

  let url: URL
  try {
    url = new URL(urlValue)
  } catch {
    return null
  }

  if (url.protocol !== "https:" || !ALLOWED_CTA_HOSTS.has(url.hostname)) {
    return null
  }

  if (!isAllowedGithubPath(url) && !isAllowedDocsPath(url)) {
    return null
  }

  return { label, url: url.toString() }
}
