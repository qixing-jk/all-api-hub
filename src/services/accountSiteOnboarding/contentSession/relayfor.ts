import { SITE_TYPES } from "~/constants/siteType"
import { RELAYFOR_HOSTNAMES } from "~/services/accountSiteDefinitions/identifiers"
import { readRelayForBrowserToken } from "~/services/apiService/relayfor/browserSession"
import { RELAYFOR_ENDPOINTS } from "~/services/apiService/relayfor/constants"
import { isRelayForUser } from "~/services/apiService/relayfor/parsing"

import type { ContentSessionExtractor } from "../contracts"

const isRelayForOrigin = (url?: string): boolean => {
  if (!url) return false
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return RELAYFOR_HOSTNAMES.some(
      (allowedHostname) => allowedHostname === hostname,
    )
  } catch {
    return false
  }
}

export const relayForContentSessionExtractor: ContentSessionExtractor = {
  id: "relayfor",
  canExtract: (context) =>
    isRelayForOrigin(context?.url) && readRelayForBrowserToken() !== null,
  async extract(context) {
    const accessToken = readRelayForBrowserToken()
    if (!accessToken || !context?.url) return null

    try {
      const origin = new URL(context.url).origin
      const response = await fetch(`${origin}${RELAYFOR_ENDPOINTS.self}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      })

      if (!response.ok) return null

      const data = (await response.json()) as unknown
      if (!isRelayForUser(data)) return null

      return {
        userId: data.id,
        user: {
          id: data.id,
          username: data.username,
        },
        accessToken,
        siteTypeHint: SITE_TYPES.RELAYFOR,
      }
    } catch {
      return null
    }
  },
}
