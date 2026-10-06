import type { AccountSiteType } from "~/constants/siteType"
import {
  ACCOUNT_BROWSER_SESSION_SOURCES,
  resolveAccountBrowserSession,
  type AccountBrowserSession,
} from "~/services/accountBrowserSession"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

export type BrowserResyncedToken = {
  accessToken: string
  userId: string
  username?: string
  source:
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW
}

const sources = {
  [ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB]:
    ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
  [ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB]:
    ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
  [ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW]:
    ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
} as const satisfies Record<
  AccountBrowserSession["source"],
  BrowserResyncedToken["source"]
>

const normalizeString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

/** Provider policies bind identity and username vocabulary to the shared session recovery flow. */
export function createBrowserTokenResync(policy: {
  readonly siteType: AccountSiteType
  readonly requestIdPrefix: string
  readonly usernameFields: readonly string[]
}) {
  return async (options: {
    baseUrl: string
    expectedUserId?: string | number
    tempWindowRequestSource?: TempWindowRequestSource
    protectionBypassExecution?: ProtectionBypassExecution
  }): Promise<BrowserResyncedToken | null> => {
    const expectedUserId =
      typeof options.expectedUserId === "number"
        ? Number.isFinite(options.expectedUserId)
          ? String(options.expectedUserId)
          : null
        : options.expectedUserId
    const matchesUser = (session: AccountBrowserSession) =>
      expectedUserId === undefined ||
      expectedUserId === "" ||
      (expectedUserId !== null &&
        normalizeString(session.userId) === normalizeString(expectedUserId))
    const session = await resolveAccountBrowserSession({
      baseUrl: options.baseUrl,
      siteType: policy.siteType,
      useExistingTabs: true,
      useTempWindow: true,
      requestIdPrefix: policy.requestIdPrefix,
      ...(options.tempWindowRequestSource
        ? { tempWindowRequestSource: options.tempWindowRequestSource }
        : {}),
      ...(options.protectionBypassExecution
        ? { protectionBypassExecution: options.protectionBypassExecution }
        : {}),
      isUsableSession: (candidate) =>
        (candidate.siteType === policy.siteType ||
          candidate.siteTypeHint === policy.siteType) &&
        normalizeString(candidate.accessToken).length > 0 &&
        matchesUser(candidate),
    })
    const accessToken = normalizeString(session?.accessToken)
    if (!session || !accessToken || !matchesUser(session)) return null
    let username: string | undefined
    for (const field of policy.usernameFields) {
      const candidate = normalizeString(session.user?.[field])
      if (candidate) {
        username = candidate
        break
      }
    }
    return {
      accessToken,
      userId: session.userId,
      ...(username ? { username } : {}),
      source: sources[session.source],
    }
  }
}
