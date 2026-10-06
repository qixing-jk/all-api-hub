import { SITE_TYPES } from "~/constants/siteType"
import {
  createBrowserTokenResync,
  type BrowserResyncedToken,
} from "~/services/accountBrowserSession/resyncToken"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

const resyncToken = createBrowserTokenResync({
  siteType: SITE_TYPES.GRSAI,
  requestIdPrefix: "grsai-token-resync",
  usernameFields: ["username", "display_name", "mail"],
})

/**
 * Re-sync the account token from logged-in browser-session state.
 *
 * Grsai has no refresh-token contract: the console session token lives in the
 * page's `localStorage.Token`, the console renews it through the `getConfig`
 * exchange, and it stops working after roughly 30 days without one. When the
 * stored copy is dead — mostly because the account sat unrefreshed past that
 * window, but also when the deployment invalidates the session itself — the only
 * recovery is re-reading the token the browser is currently holding.
 */
export async function resyncGrsaiAuthToken(
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
