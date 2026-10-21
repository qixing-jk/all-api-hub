import {
  DAYA_WEB_ORIGIN,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import { DAYA_ENDPOINTS } from "~/services/apiService/daya/constants"
import { parseDayaIdentity } from "~/services/apiService/daya/identity"

import type { ContentSessionExtractor } from "../contracts"

export const dayaContentSessionExtractor: ContentSessionExtractor = {
  id: SITE_TYPES.DAYA,
  canExtract({ siteTypeHint, url }) {
    if (siteTypeHint !== SITE_TYPES.DAYA || !url) return false
    try {
      return new URL(url).origin === DAYA_WEB_ORIGIN
    } catch {
      return false
    }
  },
  async extract() {
    try {
      const response = await fetch(
        `${DAYA_WEB_ORIGIN}${DAYA_ENDPOINTS.Identity}`,
        { credentials: "include", cache: "no-store" },
      )
      if (!response.ok) return null
      const user = parseDayaIdentity(await response.json())
      return {
        userId: String(user.id),
        user: { id: String(user.id), username: user.username },
        siteTypeHint: SITE_TYPES.DAYA,
      }
    } catch {
      return null
    }
  },
}
