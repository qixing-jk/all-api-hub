import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  resolveAccountBrowserSession,
  type AccountBrowserSession,
} from "~/services/accountBrowserSession"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

type VoApiV2ResyncedToken = {
  accessToken: string
  userId: string
  username?: string
  source:
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW
}

const VOAPI_V2_RESYNC_SOURCE_BY_BROWSER_SESSION_SOURCE = {
  [ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB]:
    ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
  [ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB]:
    ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
  [ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW]:
    ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
} as const satisfies Record<
  AccountBrowserSession["source"],
  VoApiV2ResyncedToken["source"]
>

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

const isVoApiV2Session = (session: AccountBrowserSession): boolean =>
  session.siteType === SITE_TYPES.VO_API_V2 ||
  session.siteTypeHint === SITE_TYPES.VO_API_V2

const hasUsableDashboardJwt = (session: AccountBrowserSession): boolean =>
  isVoApiV2Session(session) && normalizeString(session.accessToken).length > 0

const resolveUsername = (session: AccountBrowserSession): string | undefined =>
  normalizeString(session.user?.username) ||
  normalizeString(session.user?.display_name) ||
  normalizeString(session.user?.email) ||
  undefined

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
): Promise<VoApiV2ResyncedToken | null> {
  const session = await resolveAccountBrowserSession({
    baseUrl,
    siteType: SITE_TYPES.VO_API_V2,
    useExistingTabs: true,
    useTempWindow: true,
    requestIdPrefix: "voapi-v2-token-resync",
    ...(tempWindowRequestSource ? { tempWindowRequestSource } : {}),
    isUsableSession: hasUsableDashboardJwt,
  })

  const accessToken = normalizeString(session?.accessToken)
  if (!session || !accessToken) return null

  const username = resolveUsername(session)

  return {
    accessToken,
    userId: session.userId,
    ...(username ? { username } : {}),
    source: VOAPI_V2_RESYNC_SOURCE_BY_BROWSER_SESSION_SOURCE[session.source],
  }
}
