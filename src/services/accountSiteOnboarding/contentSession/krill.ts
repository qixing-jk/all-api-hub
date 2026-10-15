import {
  KRILL_WEB_ORIGIN,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import { KRILL_ENDPOINTS } from "~/services/apiService/krill/constants"
import { parseKrillIdentity } from "~/services/apiService/krill/identity"

import type { ContentSessionExtractor } from "../contracts"

export const krillContentSessionExtractor: ContentSessionExtractor = {
  id: "krill",
  canExtract({ siteTypeHint, url }) {
    if (siteTypeHint !== SITE_TYPES.KRILL || !url) return false
    try {
      return new URL(url).origin === KRILL_WEB_ORIGIN
    } catch {
      return false
    }
  },
  async extract() {
    try {
      const response = await fetch(
        `${KRILL_WEB_ORIGIN}${KRILL_ENDPOINTS.Identity}`,
        { credentials: "include", cache: "no-store" },
      )
      if (!response.ok) return null
      const user = parseKrillIdentity(await response.json())
      return user
        ? {
            userId: String(user.id),
            user: { id: String(user.id), username: user.email },
            siteTypeHint: SITE_TYPES.KRILL,
          }
        : null
    } catch {
      return null
    }
  },
}
