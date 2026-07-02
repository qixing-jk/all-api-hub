import { SITE_TYPES } from "~/constants/siteType"

import type { ContentSessionExtractor } from "../contracts"

const SHAREDCHAT_GETME_ENDPOINT = "/frontend-api/getme"

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
    const response = await fetch(SHAREDCHAT_GETME_ENDPOINT, {
      cache: "no-store",
      credentials: "include",
    })
    if (!response.ok) return null

    const body = (await response.json()) as SharedChatGetMeEnvelope
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
