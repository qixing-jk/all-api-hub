import { SITE_TYPES } from "~/constants/siteType"
import { readIdentityCookieState } from "~/services/accountBrowserSession/localIdentityState"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  getAccountSiteDefinition,
} from "~/services/accountSiteDefinitions"
import { readCompatibleStoredUser } from "~/services/accountSiteOnboarding/contentSession/compatibleUser"
import { readVApiStoredUser } from "~/services/accountSiteOnboarding/contentSession/vApi"
import { buildCompatUserIdHeaders } from "~/services/apiTransport/compatHeaders"
import { isRecord } from "~/utils/core/object"

import type { AccountBrowserIdentityCapability } from "../contracts/accountBrowserIdentity"

export const newApiBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType }) =>
    getAccountSiteDefinition(siteType)?.adapterFamily ===
    ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
  observe({ origin, siteType, candidateUserIds }) {
    const user =
      (siteType === SITE_TYPES.V_API ? readVApiStoredUser() : null) ??
      readCompatibleStoredUser()
    // Legacy New API checks the user header against its Cookie session:
    // https://github.com/QuantumNous/new-api/blob/v0.9.0/middleware/auth.go#L72-L99
    // A unique saved candidate can supply a missing hint, but passive detection
    // never enumerates accounts or refreshes modern dashboard sessions after 401.
    const hint =
      normalizeAccountIdentity(user?.id) ??
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
