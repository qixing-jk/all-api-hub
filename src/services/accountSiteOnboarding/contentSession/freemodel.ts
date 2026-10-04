import { SITE_TYPES } from "~/constants/siteType"
import { FREEMODEL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { FREEMODEL_ME_ENDPOINT } from "~/services/apiService/freemodel/constants"
import { isRecord } from "~/utils/core/object"

import type { ContentSessionExtractor } from "../contracts"

/** Read the authenticated endpoint; bm_user is only a stale UI cache. */
export const freeModelContentSessionExtractor: ContentSessionExtractor = {
  id: "freemodel",
  canExtract(context) {
    if (context.siteTypeHint !== SITE_TYPES.FREEMODEL || !context.url)
      return false
    try {
      return new URL(context.url).origin === FREEMODEL_WEB_ORIGIN
    } catch {
      return false
    }
  },
  async extract() {
    try {
      const response = await fetch(FREEMODEL_ME_ENDPOINT, {
        credentials: "include",
        cache: "no-store",
      })
      if (!response.ok) return null
      const body: unknown = await response.json()
      if (
        !isRecord(body) ||
        !isRecord(body.user) ||
        typeof body.user.id !== "number" ||
        !Number.isSafeInteger(body.user.id) ||
        body.user.id <= 0
      )
        return null
      return {
        userId: body.user.id,
        user: body.user,
        siteTypeHint: SITE_TYPES.FREEMODEL,
      }
    } catch {
      return null
    }
  },
}
