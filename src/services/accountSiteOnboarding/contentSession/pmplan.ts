import { SITE_TYPES } from "~/services/accountSiteDefinitions/identifiers"
import { PMPLAN_ENDPOINTS } from "~/services/apiService/pmplan/constants"
import { getPmplanOrigin } from "~/services/apiService/pmplan/deployment"
import { parsePmplanIdentity } from "~/services/apiService/pmplan/identity"

import type {
  ContentSessionExtractionContext,
  ContentSessionExtractor,
} from "../contracts"

/** Resolve eligibility and the request origin together before reading a session. */
function getSessionOrigin({
  siteTypeHint,
  url,
}: ContentSessionExtractionContext) {
  if (siteTypeHint !== SITE_TYPES.PMPLAN || !url) return null
  try {
    return getPmplanOrigin(url)
  } catch {
    return null
  }
}

export const pmplanContentSessionExtractor: ContentSessionExtractor = {
  id: SITE_TYPES.PMPLAN,
  canExtract: (context) => getSessionOrigin(context) !== null,
  async extract(context) {
    const origin = getSessionOrigin(context)
    if (!origin) return null
    try {
      const response = await fetch(`${origin}${PMPLAN_ENDPOINTS.Identity}`, {
        credentials: "include",
        cache: "no-store",
        redirect: "error",
        signal: context.abortSignal,
      })
      if (!response.ok) return null
      const user = parsePmplanIdentity(await response.json())
      return user
        ? {
            userId: user.id,
            user: { id: user.id, username: user.username },
            siteTypeHint: SITE_TYPES.PMPLAN,
          }
        : null
    } catch {
      return null
    }
  },
}
