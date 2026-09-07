import { SITE_TYPES } from "~/constants/siteType"
import {
  readIdentityCookie,
  readIdentityCookieState,
  readIdentityJwtExpiry,
} from "~/services/accountBrowserSession/localIdentityState"
import { isCanonicalOpenRouterUrl } from "~/services/accountSiteDefinitions/identifiers"
import { isRecord } from "~/utils/core/object"

import type { AccountBrowserIdentityCapability } from "../contracts/accountBrowserIdentity"

export const openRouterBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType }) => siteType === SITE_TYPES.OPENROUTER,
  observe({ origin }) {
    if (!isCanonicalOpenRouterUrl(origin)) return null
    const token = readIdentityCookie("__session")
    return {
      sessionKey: token ?? readIdentityCookieState(),
      expiresAt: token ? readIdentityJwtExpiry(token) : undefined,
      async verify(read) {
        // Authenticated browser verification on 2026-09-07:
        // https://openrouter.ai/api/frontend/v1/private/users/current returns
        // data.clerk_user_id. A changed private contract stays inconclusive.
        const body = await read({
          url: `${origin}/api/frontend/v1/private/users/current`,
        })
        return isRecord(body?.data) ? body.data.clerk_user_id : null
      },
    }
  },
}
