import { RuntimeActionIds } from "~/constants/runtimeActions"
import { isAccountSiteType } from "~/constants/siteType"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import {
  getAllTabs,
  getBrowserApiCapabilities,
  sendRuntimeMessage,
  sendTabMessageWithRetry,
} from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { tryParseOrigin } from "~/utils/core/urlParsing"

import type {
  AccountBrowserSession,
  AccountBrowserSessionFetchContext,
  ReadAccountBrowserSessionFromExistingTabsOptions,
  ReadAccountBrowserSessionFromTabOptions,
  ResolveAccountBrowserSessionOptions,
} from "./types"
import { ACCOUNT_BROWSER_SESSION_SOURCES } from "./types"

const logger = createLogger("AccountBrowserSession")

const hasNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const normalizeOptionalString = (value: unknown): string | undefined =>
  hasNonEmptyString(value) ? value.trim() : undefined

const normalizeSub2ApiAuth = (
  value: unknown,
): AccountBrowserSession["sub2apiAuth"] => {
  if (!value || typeof value !== "object") return undefined

  const refreshToken = normalizeOptionalString(
    (value as { refreshToken?: unknown }).refreshToken,
  )
  if (!refreshToken) return undefined

  const tokenExpiresAt = (value as { tokenExpiresAt?: unknown }).tokenExpiresAt

  return {
    refreshToken,
    ...(typeof tokenExpiresAt === "number" && Number.isFinite(tokenExpiresAt)
      ? { tokenExpiresAt }
      : {}),
  }
}

const normalizeFetchContext = (
  value: unknown,
): AccountBrowserSessionFetchContext | undefined => {
  if (!value || typeof value !== "object") return undefined

  const context = value as {
    kind?: unknown
    tabId?: unknown
    origin?: unknown
    incognito?: unknown
    cookieStoreId?: unknown
  }
  const browserContext = {
    ...(context.incognito === true ? { incognito: true } : {}),
    ...(hasNonEmptyString(context.cookieStoreId)
      ? { cookieStoreId: context.cookieStoreId.trim() }
      : {}),
  }

  if (context.kind === API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT) {
    return {
      kind: API_SERVICE_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
      ...browserContext,
    }
  }

  if (
    context.kind === API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB &&
    typeof context.tabId === "number" &&
    Number.isFinite(context.tabId) &&
    hasNonEmptyString(context.origin)
  ) {
    return {
      kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
      tabId: context.tabId,
      origin: context.origin.trim(),
      ...browserContext,
    }
  }

  return undefined
}

const normalizeSessionData = (
  data: unknown,
  options: {
    source: AccountBrowserSession["source"]
    siteType: AccountBrowserSession["siteType"]
    fetchContext?: AccountBrowserSessionFetchContext
  },
): AccountBrowserSession | null => {
  if (!data || typeof data !== "object") return null

  const payload = data as {
    userId?: unknown
    user?: unknown
    accessToken?: unknown
    siteTypeHint?: unknown
    siteType?: unknown
    sub2apiAuth?: unknown
    fetchContext?: unknown
  }

  const userId = normalizeAccountIdentity(payload.userId)
  if (!userId) return null

  const user =
    payload.user &&
    typeof payload.user === "object" &&
    !Array.isArray(payload.user)
      ? (payload.user as Record<string, unknown>)
      : { id: userId, username: userId }
  const accessToken = normalizeOptionalString(payload.accessToken)
  const siteTypeHint = isAccountSiteType(payload.siteTypeHint)
    ? payload.siteTypeHint
    : isAccountSiteType(payload.siteType)
      ? payload.siteType
      : undefined
  const sub2apiAuth = normalizeSub2ApiAuth(payload.sub2apiAuth)
  const fetchContext =
    options.fetchContext ?? normalizeFetchContext(payload.fetchContext)

  return {
    source: options.source,
    siteType: options.siteType,
    ...(siteTypeHint ? { siteTypeHint } : {}),
    userId,
    user,
    ...(accessToken ? { accessToken } : {}),
    ...(sub2apiAuth ? { sub2apiAuth } : {}),
    ...(fetchContext ? { fetchContext } : {}),
  }
}

/**
 * Reads and normalizes an account browser session from a specific tab.
 */
export async function readAccountBrowserSessionFromTab(
  options: ReadAccountBrowserSessionFromTabOptions,
): Promise<AccountBrowserSession | null> {
  try {
    const response = await sendTabMessageWithRetry(options.tabId, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: options.baseUrl,
      siteType: options.siteType,
    })

    if (!response?.success || !response.data) return null

    return normalizeSessionData(response.data, {
      source: options.source,
      siteType: options.siteType,
      fetchContext: options.fetchContext,
    })
  } catch (error) {
    logger.debug("Failed to read account browser session from tab", {
      tabId: options.tabId,
      siteType: options.siteType,
      error,
    })
    options.onError?.(error, { source: options.source })
    return null
  }
}

const doesTabMatchBrowserContext = (
  tab: browser.tabs.Tab,
  browserContext: ReadAccountBrowserSessionFromExistingTabsOptions["browserContext"],
) => {
  if (!browserContext) return true

  if (
    typeof browserContext.incognito === "boolean" &&
    (tab.incognito === true) !== browserContext.incognito
  ) {
    return false
  }

  if (
    browserContext.cookieStoreId &&
    tab.cookieStoreId !== browserContext.cookieStoreId
  ) {
    return false
  }

  return true
}

const getSameOriginTabs = async (
  baseUrl: string,
  browserContext?: ReadAccountBrowserSessionFromExistingTabsOptions["browserContext"],
) => {
  const origin = tryParseOrigin(baseUrl)
  if (!origin) return []
  if (!getBrowserApiCapabilities().hasTabs) return []

  const tabs = await getAllTabs().catch(() => [])
  return tabs
    .filter((tab) => {
      if (!tab?.id || !tab.url) return false
      return (
        tryParseOrigin(tab.url) === origin &&
        doesTabMatchBrowserContext(tab, browserContext)
      )
    })
    .sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)))
}

const createCurrentTabFetchContext = (
  options: ResolveAccountBrowserSessionOptions,
): AccountBrowserSessionFetchContext | undefined => {
  if (!options.currentTab) return undefined

  const origin = tryParseOrigin(options.baseUrl)
  if (!origin) return undefined

  return {
    kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
    tabId: options.currentTab.tabId,
    origin,
    ...(options.currentTab.incognito === true ? { incognito: true } : {}),
    ...(options.currentTab.cookieStoreId
      ? { cookieStoreId: options.currentTab.cookieStoreId }
      : {}),
  }
}

/**
 * Reads account browser sessions from same-origin tabs, preferring active tabs first.
 */
export async function readAccountBrowserSessionFromExistingTabs(
  options: ReadAccountBrowserSessionFromExistingTabsOptions,
): Promise<AccountBrowserSession | null> {
  const tabs = await getSameOriginTabs(options.baseUrl, options.browserContext)

  for (const tab of tabs) {
    const tabId = tab.id
    if (typeof tabId !== "number") continue

    const session = await readAccountBrowserSessionFromTab({
      tabId,
      baseUrl: options.baseUrl,
      siteType: options.siteType,
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      fetchContext: normalizeFetchContext({
        kind: API_SERVICE_FETCH_CONTEXT_KINDS.CURRENT_TAB,
        tabId,
        origin: tryParseOrigin(options.baseUrl),
        ...(tab.incognito === true ? { incognito: true } : {}),
        ...(tab.cookieStoreId ? { cookieStoreId: tab.cookieStoreId } : {}),
      }),
      onError: options.onError,
    })

    if (
      session &&
      (!options.isUsableSession || options.isUsableSession(session))
    ) {
      return session
    }
  }

  return null
}

const readAccountBrowserSessionFromTempWindow = async (
  options: ResolveAccountBrowserSessionOptions,
): Promise<AccountBrowserSession | null> => {
  try {
    const response = await sendRuntimeMessage({
      action: RuntimeActionIds.AutoDetectSite,
      url: options.baseUrl,
      requestId: `${options.requestIdPrefix ?? "account-browser-session"}-${Date.now()}`,
      ...(options.tempWindowRequestSource
        ? { tempWindowRequestSource: options.tempWindowRequestSource }
        : {}),
      ...(typeof options.suppressMinimize === "boolean"
        ? { suppressMinimize: options.suppressMinimize }
        : {}),
      ...(options.currentTab?.incognito === true ? { useIncognito: true } : {}),
    })

    if (!response?.success || !response.data) return null

    return normalizeSessionData(response.data, {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
      siteType: options.siteType,
    })
  } catch (error) {
    logger.debug("Failed to read account browser session from temp window", {
      siteType: options.siteType,
      error,
    })
    options.onError?.(error, {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
    })
    return null
  }
}

/**
 * Resolves an account browser session across current-tab, existing-tab, and temp-window sources.
 */
export async function resolveAccountBrowserSession(
  options: ResolveAccountBrowserSessionOptions,
): Promise<AccountBrowserSession | null> {
  const isUsable = options.isUsableSession ?? (() => true)

  if (options.currentTab) {
    const session = await readAccountBrowserSessionFromTab({
      tabId: options.currentTab.tabId,
      baseUrl: options.baseUrl,
      siteType: options.siteType,
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      fetchContext: createCurrentTabFetchContext(options),
      onError: options.onError,
    })
    if (session && isUsable(session)) return session
  }

  if (options.useExistingTabs) {
    const session = await readAccountBrowserSessionFromExistingTabs({
      baseUrl: options.baseUrl,
      siteType: options.siteType,
      browserContext: options.currentTab
        ? {
            incognito: options.currentTab.incognito === true,
            ...(options.currentTab.cookieStoreId
              ? { cookieStoreId: options.currentTab.cookieStoreId }
              : {}),
          }
        : undefined,
      isUsableSession: isUsable,
      onError: options.onError,
    })
    if (session) return session
  }

  if (options.useTempWindow) {
    const session = await readAccountBrowserSessionFromTempWindow(options)
    if (session && isUsable(session)) return session
  }

  return null
}
