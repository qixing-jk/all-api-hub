import { SITE_TYPES } from "~/constants/siteType"
import { DAHL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { DAHL_ACCOUNT_ENDPOINT } from "~/services/apiService/dahl/constants"
import { parseDahlIdentity } from "~/services/apiService/dahl/identity"

import type { ContentSessionExtractor } from "../contracts"

export const dahlContentSessionExtractor: ContentSessionExtractor = {
  id: "dahl",
  canExtract({ siteTypeHint, url }) {
    if (siteTypeHint !== SITE_TYPES.DAHL || !url) return false
    try {
      return new URL(url).origin === DAHL_WEB_ORIGIN
    } catch {
      return false
    }
  },
  async extract() {
    try {
      const response = await fetch(
        `${DAHL_WEB_ORIGIN}${DAHL_ACCOUNT_ENDPOINT}`,
        { credentials: "include", cache: "no-store" },
      )
      if (!response.ok) return null
      const user = parseDahlIdentity(await response.json())
      return user
        ? {
            userId: user.id,
            user: { id: user.id, username: user.username },
            siteTypeHint: SITE_TYPES.DAHL,
          }
        : null
    } catch {
      return null
    }
  },
}
