import { SITE_TYPES } from "~/constants/siteType"
import {
  createBrowserTokenResync,
  type BrowserResyncedToken,
} from "~/services/accountBrowserSession/resyncToken"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

const resyncToken = createBrowserTokenResync({
  siteType: SITE_TYPES.VO_API_V2,
  requestIdPrefix: "voapi-v2-token-resync",
  usernameFields: ["username", "display_name", "email"],
})

/**
 * Re-sync a VoAPI v2 dashboard JWT from logged-in browser-session state.
 *
 * VoAPI v2 has no verified refresh-token contract; this only re-reads the
 * page-session JWT that the content-session extractor already knows how to
 * collect from `userStore.auth.token`.
 */
export async function resyncVoApiV2AuthToken(
  baseUrl: string,
  tempWindowRequestSource?: TempWindowRequestSource,
  protectionBypassExecution?: ProtectionBypassExecution,
): Promise<BrowserResyncedToken | null> {
  return resyncToken({
    baseUrl,
    tempWindowRequestSource,
    protectionBypassExecution,
  })
}
