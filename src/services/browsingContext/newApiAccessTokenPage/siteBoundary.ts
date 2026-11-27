import { getRegistrableDomain } from "~/utils/core/domain"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

/**
 * Allows canonical-host redirects for the visual cue. Session recovery and
 * script injection retain their own origin checks.
 */
export function matchesAccessTokenCueSite(
  openedSite: unknown,
  currentUrl: unknown,
) {
  const opened = tryParseHttpUrl(openedSite)
  const current = tryParseHttpUrl(currentUrl)
  if (!opened || !current) return false
  const openedHost = opened.hostname.replace(/\.$/u, "")
  const currentHost = current.hostname.replace(/\.$/u, "")
  if (openedHost === currentHost) return true
  const openedDomain = getRegistrableDomain(openedHost)
  return (
    openedDomain !== null && openedDomain === getRegistrableDomain(currentHost)
  )
}
