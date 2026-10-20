import { SITE_TYPES } from "~/constants/siteType"
import { EMRANK_HOSTNAMES } from "~/services/accountSiteDefinitions/identifiers"
import { EMRANK_ENDPOINTS } from "~/services/apiService/emrank/constants"
import { parseEmRankIdentity } from "~/services/apiService/emrank/identity"

import type { ContentSessionExtractor } from "../contracts"

/**
 * Cached UI state never establishes identity; only the session endpoint does.
 * The HttpOnly `__Host-gateway_session` cookie authenticates every console
 * route, so the extractor re-reads the live session on each extraction.
 */
export const emRankContentSessionExtractor: ContentSessionExtractor = {
  id: SITE_TYPES.EMRANK,
  canExtract({ siteTypeHint, url }) {
    if (siteTypeHint !== SITE_TYPES.EMRANK || !url) return false
    try {
      const parsed = new URL(url)
      return (
        parsed.protocol === "https:" &&
        EMRANK_HOSTNAMES.some(
          (hostname) => parsed.hostname.toLowerCase() === hostname,
        )
      )
    } catch {
      return false
    }
  },
  async extract() {
    try {
      const response = await fetch(EMRANK_ENDPOINTS.Identity, {
        credentials: "include",
        cache: "no-store",
      })
      if (!response.ok) return null
      const user = parseEmRankIdentity(await response.json())
      return user
        ? {
            userId: user.id,
            user: { id: user.id, username: user.username },
            siteTypeHint: SITE_TYPES.EMRANK,
          }
        : null
    } catch {
      return null
    }
  },
}
