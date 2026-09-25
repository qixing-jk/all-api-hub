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

type RightCodeResyncedToken = {
  accessToken: string
  userId: string
  username?: string
  source:
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW
}

const RIGHTCODE_RESYNC_SOURCE_BY_BROWSER_SESSION_SOURCE = {
  [ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB]:
    ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
  [ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB]:
    ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
  [ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW]:
    ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
} as const satisfies Record<
  AccountBrowserSession["source"],
  RightCodeResyncedToken["source"]
>

const isRightCodeSession = (session: AccountBrowserSession): boolean =>
  session.siteType === SITE_TYPES.RIGHT_CODE ||
  session.siteTypeHint === SITE_TYPES.RIGHT_CODE

const hasUsableToken = (
  session: AccountBrowserSession,
  expectedUserId?: string | number,
): boolean =>
  isRightCodeSession(session) &&
  normalizeString(session.accessToken).length > 0 &&
  (!expectedUserId ||
    normalizeString(session.userId) === normalizeString(expectedUserId))

const resolveUsername = (session: AccountBrowserSession): string | undefined =>
  normalizeString(session.user?.username) ||
  normalizeString(session.user?.display_name) ||
  normalizeString(session.user?.email) ||
  undefined

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
): Promise<RightCodeResyncedToken | null> {
  const session = await resolveAccountBrowserSession({
    baseUrl,
    siteType: SITE_TYPES.RIGHT_CODE,
    useExistingTabs: true,
    useTempWindow: true,
    requestIdPrefix: "rightcode-token-resync",
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
    source: RIGHTCODE_RESYNC_SOURCE_BY_BROWSER_SESSION_SOURCE[session.source],
  }
}
