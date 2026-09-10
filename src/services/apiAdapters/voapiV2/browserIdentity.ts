import { SITE_TYPES } from "~/constants/siteType"
import { readIdentityJwtExpiry } from "~/services/accountBrowserSession/localIdentityState"
import { readVoApiV2BrowserToken } from "~/services/accountSiteOnboarding/contentSession/voapiV2"
import {
  VOAPI_V2_ENDPOINTS,
  VOAPI_V2_PROTOCOL_CODES,
} from "~/services/apiService/voapiV2/type"
import { isRecord } from "~/utils/core/object"

import type { AccountBrowserIdentityCapability } from "../contracts/accountBrowserIdentity"

export const voApiV2BrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType }) => siteType === SITE_TYPES.VO_API_V2,
  observe({ origin }) {
    const token = readVoApiV2BrowserToken()
    if (!token) return null
    return {
      sessionKey: token,
      expiresAt: readIdentityJwtExpiry(token),
      async verify(read) {
        // https://github.com/VoAPI/VoAPI: raw dashboard JWT, code 0, data.id.
        const body = await read({
          url: `${origin}${VOAPI_V2_ENDPOINTS.UserInfo}`,
          headers: { Authorization: token },
        })
        return body?.code === VOAPI_V2_PROTOCOL_CODES.Success &&
          isRecord(body.data)
          ? body.data.id
          : null
      },
    }
  },
}
