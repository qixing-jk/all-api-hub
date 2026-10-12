import {
  FOXCODE_WEB_ORIGIN,
  SITE_TYPES,
} from "~/services/accountSiteDefinitions/identifiers"
import { FOXCODE_ENDPOINTS } from "~/services/apiService/foxcode/constants"
import { parseFoxCodeIdentity } from "~/services/apiService/foxcode/identity"

import type { ContentSessionExtractor } from "../contracts"

export const foxCodeContentSessionExtractor: ContentSessionExtractor = {
  id: "foxcode",
  canExtract({ siteTypeHint, url }) {
    if (siteTypeHint !== SITE_TYPES.FOXCODE || !url) return false
    try {
      return new URL(url).origin === FOXCODE_WEB_ORIGIN
    } catch {
      return false
    }
  },
  async extract() {
    try {
      const response = await fetch(
        `${FOXCODE_WEB_ORIGIN}${FOXCODE_ENDPOINTS.Identity}`,
        {
          credentials: "include",
          cache: "no-store",
        },
      )
      if (!response.ok) return null
      const user = parseFoxCodeIdentity(await response.json())
      return user
        ? {
            userId: user.id,
            user: { id: user.id, username: user.username },
            siteTypeHint: SITE_TYPES.FOXCODE,
          }
        : null
    } catch {
      return null
    }
  },
}
