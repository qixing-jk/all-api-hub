import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  resolveAccountBrowserSession,
  type AccountBrowserSession,
} from "~/services/accountBrowserSession"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

type Sub2ApiResyncedAuth = {
  accessToken: string
  userId?: string
  sub2apiAuth?: AccountBrowserSession["sub2apiAuth"]
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
  Sub2ApiResyncedAuth["source"]
>

const mapResyncSource = (
  source: AccountBrowserSession["source"],
): Sub2ApiResyncedAuth["source"] =>
  SUB2API_RESYNC_SOURCE_BY_BROWSER_SESSION_SOURCE[source]

export class Sub2ApiAuthIdentityMismatchError extends Error {
  constructor() {
    super("Sub2API browser session identity mismatch")
    this.name = "Sub2ApiAuthIdentityMismatchError"
  }
}

/**
 * Re-sync Sub2API JWT from browser-session state.
 *
 * Strategy:
 * 1) Prefer an already-open same-origin tab through the browser-session reader.
 * 2) Fall back to the temp-window auto-detect context.
 */
export async function resyncSub2ApiAuthToken(
  baseUrl: string,
  tempWindowRequestSource?: TempWindowRequestSource,
  protectionBypassExecution?: ProtectionBypassExecution,
  expectedUserId?: string,
): Promise<Sub2ApiResyncedAuth | null> {
  const normalizedExpectedUserId = normalizeAccountIdentity(expectedUserId)
  let foundMismatchedCredential = false
  const session = await resolveAccountBrowserSession({
    baseUrl,
    siteType: SITE_TYPES.SUB2API,
    useExistingTabs: true,
    useTempWindow: true,
    requestIdPrefix: "sub2api-token-resync",
    ...(tempWindowRequestSource ? { tempWindowRequestSource } : {}),
    ...(protectionBypassExecution ? { protectionBypassExecution } : {}),
    isUsableSession: (candidate) => {
      if (!hasUsableAccessToken(candidate)) {
        return false
      }

      const identityMatches =
        !normalizedExpectedUserId ||
        normalizeAccountIdentity(candidate.userId) === normalizedExpectedUserId
      if (!identityMatches) {
        foundMismatchedCredential = true
      }
      return identityMatches
    },
  })

  const accessToken = session?.accessToken?.trim()
  const returnedIdentityMismatch = Boolean(
    session &&
      normalizedExpectedUserId &&
      normalizeAccountIdentity(session.userId) !== normalizedExpectedUserId,
  )
  if ((foundMismatchedCredential && !session) || returnedIdentityMismatch) {
    throw new Sub2ApiAuthIdentityMismatchError()
  }

  if (!session || !accessToken) {
    return null
  }

  const userId = normalizeAccountIdentity(session.userId)
  return {
    accessToken,
    ...(userId ? { userId } : {}),
    ...(session.sub2apiAuth ? { sub2apiAuth: session.sub2apiAuth } : {}),
    source: mapResyncSource(session.source),
  }
}
