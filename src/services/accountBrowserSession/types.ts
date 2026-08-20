import type { AccountSiteType } from "~/constants/siteType"
import type { ContentSessionTransientAuth } from "~/services/accountSiteOnboarding/contracts"
import type { ApiServiceFetchContext } from "~/services/apiTransport/type"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { Sub2ApiAuthConfig } from "~/types"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

export const ACCOUNT_BROWSER_SESSION_SOURCES = {
  CURRENT_TAB: "current_tab",
  EXISTING_TAB: "existing_tab",
  TEMP_WINDOW: "temp_window",
} as const

export type AccountBrowserSessionSource =
  (typeof ACCOUNT_BROWSER_SESSION_SOURCES)[keyof typeof ACCOUNT_BROWSER_SESSION_SOURCES]

export type AccountBrowserSessionFetchContext = ApiServiceFetchContext

export type AccountBrowserSession = {
  source: AccountBrowserSessionSource
  siteType: AccountSiteType
  siteTypeHint?: AccountSiteType
  userId: string
  user: Record<string, unknown>
  accessToken?: string
  transientAuth?: ContentSessionTransientAuth
  sub2apiAuth?: Sub2ApiAuthConfig
  fetchContext?: AccountBrowserSessionFetchContext
}

export type AccountBrowserSessionPredicate = (
  session: AccountBrowserSession,
) => boolean

export type AccountBrowserSessionErrorContext = {
  source: AccountBrowserSessionSource
}

export type AccountBrowserSessionErrorHandler = (
  error: unknown,
  context: AccountBrowserSessionErrorContext,
) => void

export type ReadAccountBrowserSessionFromTabOptions = {
  tabId: number
  baseUrl: string
  siteType: AccountSiteType
  source: Extract<
    AccountBrowserSessionSource,
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB
    | typeof ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB
  >
  fetchContext?: AccountBrowserSessionFetchContext
  /** Enables the one-shot modern New API refresh probe for explicit current-tab detection. */
  allowNewApiAuthProbe?: boolean
  /** Carries caller intent for downstream temp-context workflows; tab reads do not consume it. */
  protectionBypassExecution?: ProtectionBypassExecution
  onError?: AccountBrowserSessionErrorHandler
}

export type ReadAccountBrowserSessionFromExistingTabsOptions = {
  baseUrl: string
  siteType: AccountSiteType
  browserContext?: {
    incognito?: boolean
    cookieStoreId?: string
  }
  isUsableSession?: AccountBrowserSessionPredicate
  protectionBypassExecution?: ProtectionBypassExecution
  onError?: AccountBrowserSessionErrorHandler
}

export type ResolveAccountBrowserSessionOptions = {
  baseUrl: string
  siteType: AccountSiteType
  currentTab?: {
    tabId: number
    incognito?: boolean
    cookieStoreId?: string
  }
  useExistingTabs?: boolean
  useTempWindow?: boolean
  tempWindowRequestSource?: TempWindowRequestSource
  protectionBypassExecution?: ProtectionBypassExecution
  suppressMinimize?: boolean
  requestIdPrefix?: string
  isUsableSession?: AccountBrowserSessionPredicate
  onError?: AccountBrowserSessionErrorHandler
}
