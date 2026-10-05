import { SITE_TYPES } from "~/constants/siteType"
import {
  createBrowserTokenResync,
  type BrowserResyncedToken,
} from "~/services/accountBrowserSession/resyncToken"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

const resyncToken = createBrowserTokenResync({
  siteType: SITE_TYPES.RIGHT_CODE,
  requestIdPrefix: "rightcode-token-resync",
  usernameFields: ["username", "display_name", "email"],
})

/**
 * Re-sync the account token from logged-in browser-session state.
 *
 * Right Code has no refresh-token contract: the bearer token is the account's
 * own `user_token`, it lives in the page's `localStorage.userToken`, and the
 * deployment expires it on a configurable rotation schedule. When the stored
 * copy stops working, the only recovery is re-reading the token the browser is
 * currently holding — the content-session extractor already knows where it is.
 */
export async function resyncRightCodeAuthToken(
  baseUrl: string,
  expectedUserId?: string | number,
  tempWindowRequestSource?: TempWindowRequestSource,
  protectionBypassExecution?: ProtectionBypassExecution,
): Promise<BrowserResyncedToken | null> {
  return resyncToken({
    baseUrl,
    expectedUserId,
    tempWindowRequestSource,
    protectionBypassExecution,
  })
}
