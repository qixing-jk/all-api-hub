import { SITE_TYPES } from "~/constants/siteType"
import { readIdentityCookieState } from "~/services/accountBrowserSession/localIdentityState"
import { SHAREDCHAT_GETME_ENDPOINT } from "~/services/apiService/sharedchat/constants"
import { isRecord } from "~/utils/core/object"

import type { AccountBrowserIdentityCapability } from "../contracts/accountBrowserIdentity"

export const sharedChatBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType }) => siteType === SITE_TYPES.SHAREDCHAT,
  observe({ origin }) {
    return {
      sessionKey: readIdentityCookieState(),
      async verify(read) {
        // https://new.sharedchat.cc/frontend-api/getme: code 1, data.id.
        const body = await read({
          url: `${origin}${SHAREDCHAT_GETME_ENDPOINT}`,
        })
        return body?.code === 1 && isRecord(body.data) ? body.data.id : null
      },
    }
  },
}
