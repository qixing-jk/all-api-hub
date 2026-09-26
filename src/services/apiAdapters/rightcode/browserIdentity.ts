import { SITE_TYPES } from "~/constants/siteType"
import { readRightCodeBrowserToken } from "~/services/accountSiteOnboarding/contentSession/rightcode"
import { RIGHTCODE_ENDPOINTS } from "~/services/apiService/rightcode/constants"
import { isRightCodeUserInfo } from "~/services/apiService/rightcode/parsing"

import type { AccountBrowserIdentityCapability } from "../contracts/accountBrowserIdentity"

export const rightCodeBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType }) => siteType === SITE_TYPES.RIGHT_CODE,
  observe({ origin }) {
    const token = readRightCodeBrowserToken()
    if (!token) return null
    return {
      sessionKey: token,
      async verify(read) {
        // The console's bearer token is the account's own `user_token`, so the
        // same endpoint that authenticates the API proves the page session.
        // Verified 2026-09-24: 200 with the account record, 401 otherwise.
        const body = await read({
          url: `${origin}${RIGHTCODE_ENDPOINTS.me}`,
          headers: { Authorization: `Bearer ${token}` },
        })
        return isRightCodeUserInfo(body) ? body.username : null
      },
    }
  },
}
