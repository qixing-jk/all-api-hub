import { SITE_TYPES } from "~/constants/siteType"
import { WINDHUB_ORIGIN } from "~/constants/windhub"
import { readIdentityCookieState } from "~/services/accountBrowserSession/localIdentityState"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { readCompatibleStoredUser } from "~/services/accountSiteOnboarding/contentSession/compatibleUser"
import { buildCompatUserIdHeaders } from "~/services/apiTransport/compatHeaders"
import { isRecord } from "~/utils/core/object"

import type { AccountBrowserIdentityCapability } from "../contracts/accountBrowserIdentity"

/** Windhub uses the current Chrome session and a New-Api-User identity header. */
export const windhubBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ origin, siteType }) =>
    siteType === SITE_TYPES.WINDHUB && origin === WINDHUB_ORIGIN,
  observe({ origin, candidateUserIds }) {
    const hint =
      normalizeAccountIdentity(readCompatibleStoredUser()?.id) ??
      (candidateUserIds.length === 1 ? candidateUserIds[0] : null)
    return {
      sessionKey: JSON.stringify([hint, readIdentityCookieState()]),
      async verify(read) {
        const body = await read({
          url: `${origin}/api/user/self`,
          headers: buildCompatUserIdHeaders(hint),
        })
        return body?.success === true && isRecord(body.data)
          ? body.data.id
          : null
      },
    }
  },
}
