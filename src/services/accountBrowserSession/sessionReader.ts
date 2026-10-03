import { RuntimeActionIds } from "~/constants/runtimeActions"
import { isAccountSiteType, type AccountSiteType } from "~/constants/siteType"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import {
  createAccountDetectionDiagnostics,
  type AccountDetectionDiagnostics,
} from "~/services/accountSiteOnboarding/diagnostics"
import { normalizeContentSessionTransientAuth } from "~/services/accountSiteOnboarding/transientAuth"
import { API_SERVICE_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"
import { normalizeKimiOpenPlatformAuth } from "~/services/kimiOpenPlatform/auth"
import {
  getAllTabs,
  getBrowserApiCapabilities,
  sendTabMessageWithRetry,
} from "~/utils/browser/browserApi"
import { executeProtectionBypassTask } from "~/utils/browser/tempWindowFetch"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { isRecord } from "~/utils/core/object"
import { trimToNull } from "~/utils/core/string"
import { tryParseOrigin } from "~/utils/core/urlParsing"

import type {
  AccountBrowserSession,
  AccountBrowserSessionFetchContext,
  AccountBrowserSessionSource,
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
    baseUrl: string
    siteType: AccountBrowserSession["siteType"]
    allowNewApiAuthProbe?: boolean
    fetchContext?: AccountBrowserSessionFetchContext
    diagnostics?: AccountDetectionDiagnostics
  },
): AccountBrowserSession | null => {
  if (!data || typeof data !== "object") {
    options.diagnostics?.record("session_invalid", {
      source: options.source,
      reason: "invalid_payload",
    })
    return null
  }

  const payload = data as {
    userId?: unknown
    user?: unknown
    accessToken?: unknown
    siteTypeHint?: unknown
    siteType?: unknown
    transientAuth?: unknown
    sub2apiAuth?: unknown
    kimiOpenPlatformAuth?: unknown
    fetchContext?: unknown
  }

  const userId = normalizeAccountIdentity(payload.userId)
  if (!userId) {
    options.diagnostics?.record("session_invalid", {
      source: options.source,
      reason: "user_id_missing",
    })
    return null
  }

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
  const kimiOpenPlatformAuth = normalizeKimiOpenPlatformAuth(
    payload.kimiOpenPlatformAuth,
  )
  const transientAuth = normalizeContentSessionTransientAuth(
    payload.transientAuth,
    {
      baseUrl: options.baseUrl,
      siteType: options.siteType,
      siteTypeHint,
      allowNewApiAuthProbe: options.allowNewApiAuthProbe,
    },
  )
  const fetchContext =
    options.fetchContext ?? normalizeFetchContext(payload.fetchContext)
  if (payload.transientAuth && !transientAuth) {
    options.diagnostics?.record("session_auth_rejected", {
      source: options.source,
      reason: "invalid_transient_auth",
    })
  }
  options.diagnostics?.record("session_normalized", {
    source: options.source,
    hasAccessToken: Boolean(accessToken),
    hasTransientAuth: Boolean(transientAuth),
  })

  return {
    source: options.source,
    siteType: options.siteType,
    ...(siteTypeHint ? { siteTypeHint } : {}),
    userId,
    user,
    ...(accessToken ? { accessToken } : {}),
    ...(transientAuth ? { transientAuth } : {}),
    ...(sub2apiAuth ? { sub2apiAuth } : {}),
    ...(kimiOpenPlatformAuth ? { kimiOpenPlatformAuth } : {}),
    ...(fetchContext ? { fetchContext } : {}),
  }
}

/**
 * Reads the reason a content script reported for a failed session extraction.
 *
 * The content-script handler answers `{success: false, error}` for every
 * extraction failure, including the ones it classifies itself: a refused New
 * API refresh carries the deployment's own code (`AUTH_REFRESH_RACE`,
 * `AUTH_SESSION_ISSUANCE_LIMIT`, ...). Only a non-empty string counts as a
 * reason, so a bare `{success: false}` stays "no reason reported".
 */
function readContentSessionFailureReason(response: unknown): string | null {
  if (!isRecord(response)) return null

  return trimToNull(response.error)
}

/**
 * Records why a content script could not produce a session, when it said why.
 *
 * Deliberately a log rather than an `onError` notification: the reported text
 * is a diagnostic, and some extractors report an i18n key that callers must not
 * surface verbatim. Callers keep using `onError` for control flow, and this
 * only makes the cause recoverable from a log.
 */
function logContentSessionFailure(
  response: unknown,
  context: {
    siteType: AccountSiteType
    source: AccountBrowserSessionSource
    tabId?: number
  },
) {
  const reason = readContentSessionFailureReason(response)
  if (!reason) return

  logger.warn("Content script reported no account session", {
    ...context,
    reason,
  })
}

/**
 * Reads and normalizes an account browser session from a specific tab.
 */
export async function readAccountBrowserSessionFromTab(
  options: ReadAccountBrowserSessionFromTabOptions,
): Promise<AccountBrowserSession | null> {
  const diagnostics = options.diagnostics ?? createAccountDetectionDiagnostics()
  diagnostics.record("session_read_started", {
    source: options.source,
    tabId: options.tabId,
    siteType: options.siteType,
  })
  try {
    const allowNewApiAuthProbe =
      options.source === ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB &&
      options.allowNewApiAuthProbe === true
    const response = await sendTabMessageWithRetry(options.tabId, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: options.baseUrl,
      siteType: options.siteType,
      diagnosticId: diagnostics.requestId,
      ...(allowNewApiAuthProbe ? { allowNewApiAuthProbe: true } : {}),
    })

    if (!response?.success || !response.data) {
      diagnostics.record("session_read_failed", {
        source: options.source,
        reason:
          readContentSessionFailureReason(response) ??
          (response ? "no_session_data" : "no_response"),
      })
      // The content script reports why it could not extract a session (a
      // refused New API refresh, a signed-out site, ...) inside the response
      // envelope. Recording it here is what keeps a transient site refusal
      // distinguishable from a site that simply has no session; the reported
      // text stays out of `onError`, which callers use as control flow.
      logContentSessionFailure(response, {
        tabId: options.tabId,
        siteType: options.siteType,
        source: options.source,
      })

      return null
    }

    return normalizeSessionData(response.data, {
      source: options.source,
      baseUrl: options.baseUrl,
      siteType: options.siteType,
      allowNewApiAuthProbe,
      fetchContext: options.fetchContext,
      diagnostics,
    })
  } catch (error) {
    diagnostics.record("session_read_failed", {
      source: options.source,
      reason: "message_error",
      error: getErrorMessage(error),
    })
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
  diagnostics?: AccountDetectionDiagnostics,
) => {
  const origin = tryParseOrigin(baseUrl)
  if (!origin || !getBrowserApiCapabilities().hasTabs) {
    diagnostics?.record("source_skipped", {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      reason: !origin ? "invalid_origin" : "tabs_unavailable",
    })
    return []
  }

  const tabs = await getAllTabs().catch((error) => {
    diagnostics?.record("source_failed", {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      reason: "tab_query_failed",
      error: getErrorMessage(error),
    })
    return []
  })
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
  const diagnostics = options.diagnostics ?? createAccountDetectionDiagnostics()
  const tabs = await getSameOriginTabs(
    options.baseUrl,
    options.browserContext,
    diagnostics,
  )
  diagnostics.record("existing_tabs_selected", {
    source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    count: tabs.length,
  })

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
      protectionBypassExecution: options.protectionBypassExecution,
      onError: options.onError,
      diagnostics,
    })

    if (
      session &&
      (!options.isUsableSession || options.isUsableSession(session))
    ) {
      return session
    }
    if (session)
      diagnostics.record("source_rejected", {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
        tabId,
        reason: "unusable_session",
      })
  }

  return null
}

const readAccountBrowserSessionFromTempWindow = async (
  options: ResolveAccountBrowserSessionOptions,
): Promise<AccountBrowserSession | null> => {
  const diagnostics = options.diagnostics ?? createAccountDetectionDiagnostics()
  try {
    if (!options.protectionBypassExecution) {
      diagnostics.record("source_skipped", {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
        reason: "execution_missing",
      })
      return null
    }
    diagnostics.record("session_read_started", {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
    })
    const params = {
      url: options.baseUrl,
      requestId: `${options.requestIdPrefix ?? "account-browser-session"}-${Date.now()}`,
      diagnosticId: diagnostics.requestId,
      siteType: options.siteType,
      ...(typeof options.suppressMinimize === "boolean"
        ? { suppressMinimize: options.suppressMinimize }
        : {}),
      ...(options.currentTab?.incognito === true ? { useIncognito: true } : {}),
    }
    const response = await executeProtectionBypassTask({
      task: { kind: "session_read", params },
      execution: options.protectionBypassExecution,
    })

    if (!response?.success || !response.data) {
      diagnostics.record("session_read_failed", {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
        reason: readContentSessionFailureReason(response) ?? "no_session_data",
        code: response?.code,
      })
      // Same reason-recording rule as the tab path: this is the source the
      // background temp-context strategy uses, so a dropped reason here is what
      // turns a site refusal into an unattributed detection failure.
      logContentSessionFailure(response, {
        siteType: options.siteType,
        source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
      })

      return null
    }

    return normalizeSessionData(response.data, {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
      baseUrl: options.baseUrl,
      siteType: options.siteType,
      diagnostics,
    })
  } catch (error) {
    diagnostics.record("session_read_failed", {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
      reason: "message_error",
      error: getErrorMessage(error),
    })
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
  const diagnostics = options.diagnostics ?? createAccountDetectionDiagnostics()
  const isUsable = options.isUsableSession ?? (() => true)
  const succeed = (session: AccountBrowserSession) => {
    diagnostics.finish("success", { source: session.source })
    return session
  }

  if (options.currentTab) {
    const session = await readAccountBrowserSessionFromTab({
      tabId: options.currentTab.tabId,
      baseUrl: options.baseUrl,
      siteType: options.siteType,
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      fetchContext: createCurrentTabFetchContext(options),
      protectionBypassExecution: options.protectionBypassExecution,
      onError: options.onError,
      diagnostics,
    })
    if (session && isUsable(session)) return succeed(session)
    if (session)
      diagnostics.record("source_rejected", {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
        reason: "unusable_session",
      })
  } else {
    diagnostics.record("source_skipped", {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.CURRENT_TAB,
      reason: "tab_missing",
    })
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
      protectionBypassExecution: options.protectionBypassExecution,
      onError: options.onError,
      diagnostics,
    })
    if (session) return succeed(session)
  } else {
    diagnostics.record("source_skipped", {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      reason: "disabled",
    })
  }

  if (options.useTempWindow) {
    const session = await readAccountBrowserSessionFromTempWindow({
      ...options,
      diagnostics,
    })
    if (session && isUsable(session)) return succeed(session)
    if (session)
      diagnostics.record("source_rejected", {
        source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
        reason: "unusable_session",
      })
  } else {
    diagnostics.record("source_skipped", {
      source: ACCOUNT_BROWSER_SESSION_SOURCES.TEMP_WINDOW,
      reason: "disabled",
    })
  }

  diagnostics.finish("failed", { reason: "no_usable_session" })
  return null
}
