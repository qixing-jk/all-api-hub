import { SITE_TYPES } from "~/constants/siteType"
import { SHAREDCHAT_GETME_ENDPOINT } from "~/services/apiService/sharedchat/constants"

import type { ContentSessionExtractor } from "../contracts"

type SharedChatGetMeEnvelope = {
  code?: unknown
  data?: {
    id?: unknown
    name?: unknown
    email?: unknown
    userToken?: unknown
  }
}

const getString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

/**
 * Reads SharedChat's logged-in web session from the page origin.
 */
export const sharedChatContentSessionExtractor: ContentSessionExtractor = {
  id: "sharedchat",
  canExtract: (context) => context.siteTypeHint === SITE_TYPES.SHAREDCHAT,
  async extract() {
    let body: SharedChatGetMeEnvelope

    try {
      const response = await fetch(SHAREDCHAT_GETME_ENDPOINT, {
        cache: "no-store",
        credentials: "include",
      })
      if (!response.ok) return null

      body = (await response.json()) as SharedChatGetMeEnvelope
    } catch {
      return null
    }

    if (body.code !== 1 || !body.data || typeof body.data !== "object") {
      return null
    }

    const userId = getString(body.data.id)
    if (!userId) return null

    const accessToken = getString(body.data.userToken)

    return {
      userId,
      user: body.data,
      ...(accessToken ? { accessToken } : {}),
      siteTypeHint: SITE_TYPES.SHAREDCHAT,
    }
  },
}
