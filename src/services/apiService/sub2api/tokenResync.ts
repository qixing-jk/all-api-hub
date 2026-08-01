import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  resolveAccountBrowserSession,
  type AccountBrowserSession,
} from "~/services/accountBrowserSession"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

type Sub2ApiResyncedToken = {
  accessToken: string
  refreshToken?: string
  tokenExpiresAt?: number
  source:
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW
}

const hasUsableAccessToken = (session: AccountBrowserSession): boolean =>
  typeof session.accessToken === "string" &&
  session.accessToken.trim().length > 0

const SUB2API_RESYNC_SOURCE_BY_BROWSER_SESSION_SOURCE = {
  [ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB]:
    ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
  [ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB]:
    ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
  [ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW]:
    ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
} as const satisfies Record<
  AccountBrowserSession["source"],
  Sub2ApiResyncedToken["source"]
>

const mapResyncSource = (
  source: AccountBrowserSession["source"],
): Sub2ApiResyncedToken["source"] =>
  SUB2API_RESYNC_SOURCE_BY_BROWSER_SESSION_SOURCE[source]

/**
 * Re-sync Sub2API JWT from browser-session state.
 *
 * Strategy:
 * 1) Prefer an already-open same-origin tab through the browser-session reader.
 * 2) Fall back to the temp-window auto-detect context.
 *
 * The refresh token is carried back alongside the access token: Sub2API rotates
 * refresh tokens single-use, so a rotation performed by the site's own dashboard
 * leaves the stored one dead. Returning only the access token would restore at
 * most one token lifetime and never the ability to renew headlessly again.
 */
export async function resyncSub2ApiAuthToken(
  baseUrl: string,
  tempWindowRequestSource?: TempWindowRequestSource,
  protectionBypassExecution?: ProtectionBypassExecution,
): Promise<Sub2ApiResyncedToken | null> {
  const session = await resolveAccountBrowserSession({
    baseUrl,
    siteType: SITE_TYPES.SUB2API,
    useExistingTabs: true,
    useTempWindow: true,
    requestIdPrefix: "sub2api-token-resync",
    ...(tempWindowRequestSource ? { tempWindowRequestSource } : {}),
    ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
    isUsableSession: hasUsableAccessToken,
  })

  const accessToken = session?.accessToken?.trim()
  if (!session || !accessToken) return null

  const refreshToken = session.sub2apiAuth?.refreshToken?.trim()
  const tokenExpiresAt = session.sub2apiAuth?.tokenExpiresAt

  return {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    ...(typeof tokenExpiresAt === "number" && Number.isFinite(tokenExpiresAt)
      ? { tokenExpiresAt }
      : {}),
    source: mapResyncSource(session.source),
  }
}
