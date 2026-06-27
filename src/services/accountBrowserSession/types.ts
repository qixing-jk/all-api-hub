import type { AccountSiteType } from "~/constants/siteType"
import type { ApiServiceFetchContext } from "~/services/apiService/common/type"
import type { Sub2ApiAuthConfig } from "~/types"

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
  onError?: AccountBrowserSessionErrorHandler
}

export type ReadAccountBrowserSessionFromExistingTabsOptions = {
  baseUrl: string
  siteType: AccountSiteType
  isUsableSession?: AccountBrowserSessionPredicate
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
  suppressMinimize?: boolean
  requestIdPrefix?: string
  isUsableSession?: AccountBrowserSessionPredicate
  onError?: AccountBrowserSessionErrorHandler
}
