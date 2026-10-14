import {
  SITE_TYPES,
  XIAOEN_WEB_ORIGIN,
} from "~/services/accountSiteDefinitions/identifiers"
import { XIAOEN_ENDPOINTS } from "~/services/apiService/xiaoen/constants"
import { parseXiaoenIdentity } from "~/services/apiService/xiaoen/identity"

import type { ContentSessionExtractor } from "../contracts"

export const xiaoenContentSessionExtractor: ContentSessionExtractor = {
  id: "xiaoen",
  canExtract({ siteTypeHint, url }) {
    if (siteTypeHint !== SITE_TYPES.XIAOEN || !url) return false
    try {
      return new URL(url).origin === XIAOEN_WEB_ORIGIN
    } catch {
      return false
    }
  },
  async extract() {
    try {
      const response = await fetch(
        `${XIAOEN_WEB_ORIGIN}${XIAOEN_ENDPOINTS.Identity}`,
        {
          credentials: "include",
          cache: "no-store",
        },
      )
      if (!response.ok) return null
      const user = parseXiaoenIdentity(await response.json())
      return user
        ? {
            userId: user.id,
            user: { id: user.id, username: user.username },
            siteTypeHint: SITE_TYPES.XIAOEN,
          }
        : null
    } catch {
      return null
    }
  },
}
