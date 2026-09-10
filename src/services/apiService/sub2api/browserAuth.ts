import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  resolveAccountBrowserSession,
  type AccountBrowserSession,
} from "~/services/accountBrowserSession"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

export const SUB2API_SESSION_BINDING_MISMATCH_CODE = "SESSION_BINDING_MISMATCH"

export type Sub2ApiBrowserAuth = {
  accessToken: string
  userId?: string
  sub2apiAuth?: AccountBrowserSession["sub2apiAuth"]
  fetchContext?: AccountBrowserSession["fetchContext"]
  source:
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW
}

type Sub2ApiBrowserAuthOptions = {
  baseUrl: string
  expectedUserId?: string
  tempWindowRequestSource?: TempWindowRequestSource
  protectionBypassExecution?: ProtectionBypassExecution
}

const hasUsableAccessToken = (session: AccountBrowserSession): boolean =>
  typeof session.accessToken === "string" &&
  session.accessToken.trim().length > 0

const SUB2API_AUTH_SOURCE_BY_BROWSER_SESSION_SOURCE = {
  [ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB]:
    ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
  [ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB]:
    ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
  [ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW]:
    ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
} as const satisfies Record<
  AccountBrowserSession["source"],
  Sub2ApiBrowserAuth["source"]
>

export class Sub2ApiAuthIdentityMismatchError extends Error {
  constructor() {
    super("Sub2API browser session identity mismatch")
    this.name = "Sub2ApiAuthIdentityMismatchError"
  }
}

/** Recovers Sub2API auth through the shared TempContext policy. */
export async function recoverSub2ApiBrowserAuth(
  options: Sub2ApiBrowserAuthOptions,
): Promise<Sub2ApiBrowserAuth | null> {
  const normalizedExpectedUserId = normalizeAccountIdentity(
    options.expectedUserId,
  )
  let foundMismatchedCredential = false
  const session = await resolveAccountBrowserSession({
    baseUrl: options.baseUrl,
    siteType: SITE_TYPES.SUB2API,
    useExistingTabs: true,
    useTempWindow: true,
    requestIdPrefix: "sub2api-auth-recovery",
    ...(options.tempWindowRequestSource
      ? { tempWindowRequestSource: options.tempWindowRequestSource }
      : {}),
    ...(options.protectionBypassExecution
      ? { protectionBypassExecution: options.protectionBypassExecution }
      : {}),
    isUsableSession: (candidate) => {
      if (!hasUsableAccessToken(candidate)) {
        return false
      }

      const identityMatches =
        !normalizedExpectedUserId ||
        normalizeAccountIdentity(candidate.userId) === normalizedExpectedUserId
      if (!identityMatches) foundMismatchedCredential = true
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
  if (!session || !accessToken || returnedIdentityMismatch) {
    return null
  }

  const userId = normalizeAccountIdentity(session.userId)
  return {
    accessToken,
    ...(userId ? { userId } : {}),
    ...(session.sub2apiAuth ? { sub2apiAuth: session.sub2apiAuth } : {}),
    ...(session.fetchContext ? { fetchContext: session.fetchContext } : {}),
    source: SUB2API_AUTH_SOURCE_BY_BROWSER_SESSION_SOURCE[session.source],
  }
}
