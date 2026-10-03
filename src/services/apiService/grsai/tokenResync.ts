import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  resolveAccountBrowserSession,
  type AccountBrowserSession,
} from "~/services/accountBrowserSession"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

type GrsaiResyncedToken = {
  accessToken: string
  userId: string
  username?: string
  source:
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW
}

const GRSAI_RESYNC_SOURCE_BY_BROWSER_SESSION_SOURCE = {
  [ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB]:
    ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
  [ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB]:
    ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
  [ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW]:
    ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
} as const satisfies Record<
  AccountBrowserSession["source"],
  GrsaiResyncedToken["source"]
>

const isGrsaiSession = (session: AccountBrowserSession): boolean =>
  session.siteType === SITE_TYPES.GRSAI ||
  session.siteTypeHint === SITE_TYPES.GRSAI

/**
 * A resolvable session already proves itself: the content-session extractor
 * only reports one after the console API answered `/client/grsai/getUserInfo`
 * with `code: 0`, so an unauthenticated page state never reaches this point.
 */
const hasUsableToken = (
  session: AccountBrowserSession,
  expectedUserId?: string | number,
): boolean =>
  isGrsaiSession(session) &&
  normalizeString(session.accessToken).length > 0 &&
  (!expectedUserId ||
    normalizeString(session.userId) === normalizeString(expectedUserId))

const resolveUsername = (session: AccountBrowserSession): string | undefined =>
  normalizeString(session.user?.username) ||
  normalizeString(session.user?.display_name) ||
  normalizeString(session.user?.mail) ||
  undefined

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
): Promise<GrsaiResyncedToken | null> {
  const session = await resolveAccountBrowserSession({
    baseUrl,
    siteType: SITE_TYPES.GRSAI,
    useExistingTabs: true,
    useTempWindow: true,
    requestIdPrefix: "grsai-token-resync",
    ...(tempWindowRequestSource ? { tempWindowRequestSource } : {}),
    ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
    isUsableSession: (candidate) => hasUsableToken(candidate, expectedUserId),
  })

  const accessToken = normalizeString(session?.accessToken)
  if (!session || !accessToken) return null

  if (
    expectedUserId &&
    normalizeString(session.userId) !== normalizeString(expectedUserId)
  ) {
    return null
  }

  const username = resolveUsername(session)

  return {
    accessToken,
    userId: session.userId,
    ...(username ? { username } : {}),
    source: GRSAI_RESYNC_SOURCE_BY_BROWSER_SESSION_SOURCE[session.source],
  }
}
