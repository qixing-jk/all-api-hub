import { SITE_TYPES } from "~/constants/siteType"
import {
  readIdentityCookie,
  readIdentityCookieState,
  readIdentityJwtExpiry,
} from "~/services/accountBrowserSession/localIdentityState"
import {
  AIHUBMIX_API_ORIGIN,
  AIHUBMIX_HOSTNAMES,
} from "~/services/accountSiteDefinitions/identifiers"
import { isRecord } from "~/utils/core/object"

import type { AccountBrowserIdentityCapability } from "../contracts/accountBrowserIdentity"

export const aihubmixBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType }) => siteType === SITE_TYPES.AIHUBMIX,
  observe({ origin }) {
    if (!AIHUBMIX_HOSTNAMES.some((host) => new URL(origin).hostname === host))
      return null
    const token = readIdentityCookie("__session")
    return {
      sessionKey: token ?? readIdentityCookieState(),
      expiresAt: token ? readIdentityJwtExpiry(token) : undefined,
      async verify(read) {
        // Live-verified 2026-09-07: Clerk Bearer JWT, data.username is the saved
        // identity; Cookie alone returns 401 on the current console. Older login
        // sessions may still use Cookie auth. No Clerk token refresh is requested.
        // https://console.aihubmix.com/static/js/main-4f064d56.0a0202bf.js
        const body = await read({
          url: `${AIHUBMIX_API_ORIGIN}/call/usr/self`,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        return body?.success === true && isRecord(body.data)
          ? body.data.username
          : null
      },
    }
  },
}
