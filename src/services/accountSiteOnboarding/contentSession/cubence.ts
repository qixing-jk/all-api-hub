import { SITE_TYPES } from "~/constants/siteType"
import { CUBENCE_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { isRecord } from "~/utils/core/object"

import type { ContentSessionExtractor } from "../contracts"

/** Cached auth-user only drives native UI; the cookie-authenticated endpoint proves identity. */
export const cubenceContentSessionExtractor: ContentSessionExtractor = {
  id: "cubence",
  canExtract(context) {
    if (context.siteTypeHint !== SITE_TYPES.CUBENCE || !context.url)
      return false
    try {
      return new URL(context.url).origin === CUBENCE_WEB_ORIGIN
    } catch {
      return false
    }
  },
  async extract() {
    try {
      const response = await fetch("/api/v1/auth/me", {
        credentials: "include",
        cache: "no-store",
      })
      if (!response.ok) return null
      const body: unknown = await response.json()
      const user = isRecord(body) ? body.user : undefined
      if (
        !isRecord(user) ||
        typeof user.id !== "number" ||
        !Number.isSafeInteger(user.id) ||
        user.id <= 0 ||
        user.active !== true ||
        typeof user.username !== "string"
      )
        return null
      return { userId: user.id, user, siteTypeHint: SITE_TYPES.CUBENCE }
    } catch {
      return null
    }
  },
}
