import { SITE_TYPES } from "~/constants/siteType"
import { readIdentityCookieState } from "~/services/accountBrowserSession/localIdentityState"
import { NANOGPT_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import type { AccountBrowserIdentityCapability } from "~/services/apiAdapters/contracts/accountBrowserIdentity"
import { NANOGPT_ENDPOINTS } from "~/services/apiService/nanogpt/constants"
import { isRecord } from "~/utils/core/object"

/**
 * Matches a saved NanoGPT account to the console session in the current tab.
 *
 * The account id is the Nano deposit address, so the local session — the same
 * source the content-session extractor reads — answers this check without
 * touching the saved key.
 */
export const nanoGptBrowserIdentity: AccountBrowserIdentityCapability = {
  canObserve: ({ siteType, origin }) =>
    siteType === SITE_TYPES.NANOGPT && origin === NANOGPT_WEB_ORIGIN,
  observe: ({ origin }) => ({
    sessionKey: readIdentityCookieState(),
    // The Auth.js session cookie is HttpOnly, so page storage cannot invalidate
    // an identity result this module derived from it.
    cacheResult: false,
    async verify(read) {
      const body = await read({
        url: `${origin}${NANOGPT_ENDPOINTS.localSession}`,
      })
      const local = isRecord(body) ? body.data : undefined
      const depositAddress = isRecord(local)
        ? local.nanoDepositAddress
        : undefined
      return typeof depositAddress === "string" && depositAddress.trim()
        ? depositAddress.trim()
        : null
    },
  }),
}
