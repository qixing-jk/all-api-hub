import { SITE_TYPES } from "~/constants/siteType"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"

// Facai's custom frontend only exposes inference keys in its token UI.
const deploymentsWithoutTokenCreationPage = new Set([
  "ai.facai.cloudns.org",
  "api.facai.cloudns.org",
])

/** Provide a route target unless the deployment is known to lack a creation page. */
export function getNewApiWebsiteTokenCreationTarget(siteUrl: string) {
  const url = tryParseHttpUrl(siteUrl)
  if (!url || deploymentsWithoutTokenCreationPage.has(url.hostname)) return
  return { baseUrl: siteUrl, siteType: SITE_TYPES.NEW_API }
}
