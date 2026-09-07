import { SITE_TYPES } from "~/constants/siteType"
import { readIdentityJwtExpiry } from "~/services/accountBrowserSession/localIdentityState"
import { readSub2ApiBrowserToken } from "~/services/accountSiteOnboarding/contentSession/sub2api"
import { SUB2API_AUTH_ME_ENDPOINT } from "~/services/apiService/sub2api/type"
import { isRecord } from "~/utils/core/object"

import type { AccountBrowserIdentityCapability } from "../contracts/accountBrowserIdentity"

export const sub2ApiBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType }) => siteType === SITE_TYPES.SUB2API,
  observe({ origin }) {
    const { token, expiresAt } = readSub2ApiBrowserToken()
    if (!token) return null
    const jwtExpiresAt = readIdentityJwtExpiry(token)
    return {
      sessionKey: token,
      expiresAt:
        expiresAt === undefined
          ? jwtExpiresAt
          : Math.min(expiresAt, jwtExpiresAt ?? expiresAt),
      async verify(read) {
        // https://github.com/Wei-Shaw/sub2api: auth/me is bearer-authenticated.
        // Expired sessions are left for the website to refresh itself.
        const body = await read({
          url: `${origin}${SUB2API_AUTH_ME_ENDPOINT}`,
          headers: { Authorization: `Bearer ${token}` },
        })
        return body?.code === 0 && isRecord(body.data) ? body.data.id : null
      },
    }
  },
}
