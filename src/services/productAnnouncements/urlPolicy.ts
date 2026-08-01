import { PRODUCT_ANNOUNCEMENT_CTA_KINDS } from "./constants"
import type { ProductAnnouncementCta, RawProductAnnouncementCta } from "./types"

/**
 * Hosts that product announcement CTA links may target.
 */
const GITHUB_HOST = "github.com"
const DOCS_HOST = "all-api-hub.qixing1217.top"
const GITHUB_REPO_PATH_PREFIX = "/qixing-jk/all-api-hub/"
const ALLOWED_CTA_HOSTS = new Set([GITHUB_HOST, DOCS_HOST])
const EXTENSION_URL_VALIDATION_BASE = new URL("https://extension.invalid/")

/**
 * Allows links that stay inside the project repository namespace.
 */
function isAllowedGithubPath(url: URL): boolean {
  return (
    url.hostname === GITHUB_HOST &&
    url.pathname.startsWith(GITHUB_REPO_PATH_PREFIX)
  )
}

/**
 * Allows links to the project documentation site.
 */
function isAllowedDocsPath(url: URL): boolean {
  return url.hostname === DOCS_HOST
}

/**
 * Normalizes a relative extension resource path without binding feed data to a runtime ID.
 */
function normalizeExtensionUrl(value: string): string | null {
  if (
    /^[a-z][a-z\d+.-]*:/i.test(value) ||
    value.startsWith("//") ||
    value.startsWith("\\\\")
  ) {
    return null
  }

  let url: URL
  try {
    url = new URL(value, EXTENSION_URL_VALIDATION_BASE)
  } catch {
    return null
  }

  if (url.origin !== EXTENSION_URL_VALIDATION_BASE.origin) {
    return null
  }

  return `${url.pathname.replace(/^\/+/, "")}${url.search}${url.hash}`
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

  const kind =
    value?.kind === undefined
      ? PRODUCT_ANNOUNCEMENT_CTA_KINDS.External
      : value.kind

  if (kind === PRODUCT_ANNOUNCEMENT_CTA_KINDS.Extension) {
    const url = normalizeExtensionUrl(urlValue)
    return url
      ? { kind: PRODUCT_ANNOUNCEMENT_CTA_KINDS.Extension, label, url }
      : null
  }

  if (kind !== PRODUCT_ANNOUNCEMENT_CTA_KINDS.External) {
    return null
  }

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

  return {
    kind: PRODUCT_ANNOUNCEMENT_CTA_KINDS.External,
    label,
    url: url.toString(),
  }
}
