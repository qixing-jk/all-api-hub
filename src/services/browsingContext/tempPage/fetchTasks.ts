import { RuntimeActionIds } from "~/constants/runtimeActions"
import { TURNSTILE_DEFAULT_QUERY_PARAM_NAME } from "~/constants/turnstile"
import { type ApiErrorCode } from "~/services/apiTransport/errors"
import { applyLocalRemoteFetchResultEvidence } from "~/services/apiTransport/remoteLifecycle"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { type TEMP_CONTEXT_TASK_KINDS } from "~/services/protectionBypass/contracts"
import {
  TEMP_WINDOW_TURNSTILE_STATUSES,
  type TempWindowFetch,
  type TempWindowTurnstileFetch,
  type TempWindowTurnstileMeta,
} from "~/types/tempWindowFetch"
import { removeTempWindowCookieRule } from "~/utils/browser/dnrCookieInjector"
import { normalizeRequestInitForMessage } from "~/utils/browser/requestInitMessage"
import { isAllowedIncognitoAccess } from "~/utils/browser/runtime"
import { sendTabMessageWithRetry } from "~/utils/browser/runtimeMessages"
import { resolveAuthTypeEnum } from "~/utils/core/authType"
import { safeRandomUUID } from "~/utils/core/identifier"
import { sanitizeUrlForLog } from "~/utils/core/sanitizeUrlForLog"
import { appendQueryParam } from "~/utils/core/url"
import { t } from "~/utils/i18n/core"

import {
  type AuthorizeTempContextAtAcquire,
  type TaskParams,
} from "./contracts"
import { logTempWindow, normalizeOrigin } from "./diagnostics"
import {
  getTempWindowAnalyticsResult,
  getTempWindowErrorCategory,
  reportAuthorizedTempContextOutcome,
  TEMP_WINDOW_ANALYTICS_FAILURE_REASONS,
  TEMP_WINDOW_FETCH_NO_RESPONSE_ERROR,
  toTempWindowFailureResponse,
  trackTempWindowFetchCompleted,
  TURNSTILE_TOKEN_UNAVAILABLE_ERROR,
} from "./failures"
import { tempWindowBackgroundRuntime } from "./runtime"

/**
 * 在临时上下文中执行跨域 fetch 请求，用于绕过需要真实浏览器环境的接口访问。
 */
export async function executeTempWindowFetch(
  request: TaskParams<
    | typeof TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch
    | typeof TEMP_CONTEXT_TASK_KINDS.ExplicitPageFetch
    | typeof TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch
    | typeof TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch
  >,
  suppressMinimize: boolean,
  sendResponse: (response?: any) => void,
  authorizeAtAcquire?: AuthorizeTempContextAtAcquire,
  executionOptions: { contextPageUrl?: string } = {},
) {
  const {
    originUrl,
    fetchUrl,
    fetchOptions,
    responseType = "json",
    requestId,
  } = request
  const accountId = "accountId" in request ? request.accountId : undefined
  const authType = "authType" in request ? request.authType : undefined
  const cookieAuthSessionCookie =
    "cookieAuthSessionCookie" in request
      ? request.cookieAuthSessionCookie
      : undefined
  const useIncognito =
    "useIncognito" in request ? request.useIncognito : undefined
  const cookieStoreId =
    "cookieStoreId" in request ? request.cookieStoreId : undefined
  if (!originUrl || !fetchUrl) {
    const error = t("messages:background.invalidFetchRequest")
    sendResponse({
      success: false,
      error,
    })
    trackTempWindowFetchCompleted({
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunTempWindowFetch,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: getTempWindowErrorCategory({
        reason: TEMP_WINDOW_ANALYTICS_FAILURE_REASONS.InvalidFetchRequest,
      }),
    })
    return
  }

  const tempRequestId = requestId || safeRandomUUID(`temp-fetch-${fetchUrl}`)

  logTempWindow("tempWindowFetchStart", {
    requestId: tempRequestId,
    origin: originUrl ? normalizeOrigin(originUrl) : null,
    fetchUrl: fetchUrl ? sanitizeUrlForLog(fetchUrl) : null,
    responseType,
  })

  const ruleIds = new Set<number>()

  const rawOptions = (fetchOptions ?? {}) as RequestInit
  let effectiveFetchOptions: RequestInit = rawOptions

  const resolvedAuthType = resolveAuthTypeEnum(authType)

  try {
    if (useIncognito) {
      const allowed = await isAllowedIncognitoAccess()
      if (allowed === false) {
        const error = t("messages:background.incognitoAccessRequired")
        reportAuthorizedTempContextOutcome(authorizeAtAcquire, {
          kind: "unavailable",
          reason: "incognito_access_required",
        })
        sendResponse({
          success: false,
          error,
        })
        trackTempWindowFetchCompleted({
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunTempWindowFetch,
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          errorCategory: getTempWindowErrorCategory({
            reason:
              TEMP_WINDOW_ANALYTICS_FAILURE_REASONS.IncognitoAccessRequired,
          }),
        })
        return
      }
    }

    const contextPageUrl = executionOptions.contextPageUrl ?? originUrl
    const context = await tempWindowBackgroundRuntime.acquire(
      contextPageUrl,
      tempRequestId,
      suppressMinimize,
      { incognito: Boolean(useIncognito) },
      authorizeAtAcquire,
    )
    const { tabId } = context

    if (executionOptions.contextPageUrl) {
      await context.navigate(contextPageUrl, {
        requestId: tempRequestId,
        origin: normalizeOrigin(originUrl),
      })
      const contextTab = await context.inspect()
      if (
        !contextTab?.url ||
        normalizeOrigin(contextTab.url) !== normalizeOrigin(originUrl)
      ) {
        throw new Error(
          "Temporary context redirected outside the requested origin",
        )
      }
    }

    const prepared = await tempWindowBackgroundRuntime.prepareFetchOptions({
      tabId,
      url: fetchUrl,
      rawOptions,
      resolvedAuthType,
      accountId,
      cookieAuthSessionCookie,
      cookieStoreId,
    })
    for (const ruleId of prepared.ruleIds) {
      ruleIds.add(ruleId)
    }
    effectiveFetchOptions = prepared.effectiveFetchOptions

    const response = await sendTabMessageWithRetry(tabId, {
      action: RuntimeActionIds.ContentPerformTempWindowFetch,
      requestId: tempRequestId,
      expectedOrigin: normalizeOrigin(originUrl),
      fetchUrl,
      fetchOptions: normalizeRequestInitForMessage(effectiveFetchOptions),
      responseType,
    })

    if (!response) {
      throw new Error(TEMP_WINDOW_FETCH_NO_RESPONSE_ERROR)
    }

    applyLocalRemoteFetchResultEvidence(tempRequestId, response)
    sendResponse(response)
    const result = getTempWindowAnalyticsResult(response)
    trackTempWindowFetchCompleted({
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunTempWindowFetch,
      result,
      ...(result === PRODUCT_ANALYTICS_RESULTS.Failure
        ? {
            errorCategory: getTempWindowErrorCategory({
              code: (response as { code?: ApiErrorCode })?.code,
              status: (response as { status?: number })?.status,
            }),
          }
        : {}),
    })
  } catch (error) {
    const failure = toTempWindowFailureResponse(error)

    logTempWindow("tempWindowFetchError", {
      requestId: tempRequestId,
      error: failure.error,
      code: failure.code ?? null,
    })
    await tempWindowBackgroundRuntime.release(tempRequestId, {
      forceClose: true,
      reason: "tempWindowFetchError",
    })
    sendResponse({
      success: false,
      error: failure.error,
      code: failure.code,
    })
    trackTempWindowFetchCompleted({
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunTempWindowFetch,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: getTempWindowErrorCategory(failure),
    })
  } finally {
    for (const ruleId of ruleIds) {
      await removeTempWindowCookieRule(ruleId)
    }

    await tempWindowBackgroundRuntime.release(tempRequestId)
  }
}

/**
 * Executes a Turnstile-assisted temp-context fetch.
 *
 * This flow navigates the temporary tab to a page that can render Turnstile,
 * waits for protection guards to clear, waits for a Turnstile token in the
 * content script, then replays the target request in the same tab.
 */
export async function executeTempWindowTurnstileFetch(
  request: TaskParams<typeof TEMP_CONTEXT_TASK_KINDS.TurnstileFetch>,
  suppressMinimize: boolean,
  sendResponse: (response?: any) => void,
  authorizeAtAcquire?: AuthorizeTempContextAtAcquire,
) {
  const {
    originUrl,
    pageUrl,
    useIncognito,
    fetchUrl,
    fetchOptions,
    responseType = "json",
    requestId,
    accountId,
    authType,
    cookieAuthSessionCookie,
    cookieStoreId,
    turnstileTimeoutMs,
    turnstileParamName,
    turnstilePreTrigger,
  } = request
  const turnstile: TempWindowTurnstileMeta = {
    status: TEMP_WINDOW_TURNSTILE_STATUSES.Error,
    hasTurnstile: false,
  }

  if (!originUrl || !pageUrl || !fetchUrl) {
    const error = t("messages:background.invalidFetchRequest")
    sendResponse({
      success: false,
      error,
      turnstile,
    })
    trackTempWindowFetchCompleted({
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunTempWindowTurnstileFetch,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: getTempWindowErrorCategory({
        reason: TEMP_WINDOW_ANALYTICS_FAILURE_REASONS.InvalidFetchRequest,
      }),
    })
    return
  }

  const tempRequestId =
    requestId || safeRandomUUID(`temp-turnstile-fetch-${fetchUrl}`)

  logTempWindow("tempWindowTurnstileFetchStart", {
    requestId: tempRequestId,
    origin: originUrl ? normalizeOrigin(originUrl) : null,
    pageUrl: pageUrl ? sanitizeUrlForLog(pageUrl) : null,
    fetchUrl: fetchUrl ? sanitizeUrlForLog(fetchUrl) : null,
    responseType,
  })

  const ruleIds = new Set<number>()

  const rawOptions = (fetchOptions ?? {}) as RequestInit
  let effectiveFetchOptions: RequestInit = rawOptions

  const resolvedAuthType = resolveAuthTypeEnum(authType)

  try {
    if (useIncognito) {
      const allowed = await isAllowedIncognitoAccess()
      if (allowed === false) {
        const error = t("messages:background.incognitoAccessRequired")
        reportAuthorizedTempContextOutcome(authorizeAtAcquire, {
          kind: "unavailable",
          reason: "incognito_access_required",
        })
        sendResponse({
          success: false,
          error,
          turnstile,
        })
        trackTempWindowFetchCompleted({
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunTempWindowTurnstileFetch,
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          errorCategory: getTempWindowErrorCategory({
            reason:
              TEMP_WINDOW_ANALYTICS_FAILURE_REASONS.IncognitoAccessRequired,
          }),
        })
        return
      }
    }

    const context = await tempWindowBackgroundRuntime.acquire(
      pageUrl,
      tempRequestId,
      suppressMinimize,
      { incognito: Boolean(useIncognito) },
      authorizeAtAcquire,
    )
    const { tabId } = context

    await context.navigate(pageUrl, {
      requestId: tempRequestId,
      origin: normalizeOrigin(originUrl),
    })

    const turnstileResponse = await sendTabMessageWithRetry(tabId, {
      action: RuntimeActionIds.ContentWaitForTurnstileToken,
      requestId: tempRequestId,
      timeoutMs: turnstileTimeoutMs,
      preTrigger: turnstilePreTrigger,
    })

    const token =
      turnstileResponse?.success &&
      typeof turnstileResponse?.token === "string" &&
      turnstileResponse.token.trim()
        ? turnstileResponse.token.trim()
        : null

    const status =
      turnstileResponse?.success &&
      typeof turnstileResponse?.status === "string"
        ? String(turnstileResponse.status)
        : TEMP_WINDOW_TURNSTILE_STATUSES.Error

    turnstile.status =
      status === TEMP_WINDOW_TURNSTILE_STATUSES.NotPresent ||
      status === TEMP_WINDOW_TURNSTILE_STATUSES.TokenObtained ||
      status === TEMP_WINDOW_TURNSTILE_STATUSES.Timeout
        ? status
        : TEMP_WINDOW_TURNSTILE_STATUSES.Error
    turnstile.hasTurnstile = Boolean(turnstileResponse?.detection?.hasTurnstile)

    if (!token) {
      sendResponse({
        success: false,
        error: TURNSTILE_TOKEN_UNAVAILABLE_ERROR,
        turnstile,
      })
      trackTempWindowFetchCompleted({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunTempWindowTurnstileFetch,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        errorCategory: getTempWindowErrorCategory({
          reason:
            TEMP_WINDOW_ANALYTICS_FAILURE_REASONS.TurnstileTokenUnavailable,
        }),
      })
      return
    }

    // Never log the token value. `sanitizeUrlForLog` strips the query string.
    const paramName =
      typeof turnstileParamName === "string" && turnstileParamName.trim()
        ? turnstileParamName.trim()
        : TURNSTILE_DEFAULT_QUERY_PARAM_NAME
    const fetchUrlWithToken = appendQueryParam(fetchUrl, paramName, token)

    const prepared = await tempWindowBackgroundRuntime.prepareFetchOptions({
      tabId,
      url: fetchUrlWithToken,
      rawOptions,
      resolvedAuthType,
      accountId,
      cookieAuthSessionCookie,
      cookieStoreId,
      addFirefoxAuthModeHeader: true,
    })
    for (const ruleId of prepared.ruleIds) {
      ruleIds.add(ruleId)
    }
    effectiveFetchOptions = prepared.effectiveFetchOptions

    const response = (await sendTabMessageWithRetry(tabId, {
      action: RuntimeActionIds.ContentPerformTempWindowFetch,
      requestId: tempRequestId,
      expectedOrigin: normalizeOrigin(originUrl),
      fetchUrl: fetchUrlWithToken,
      fetchOptions: normalizeRequestInitForMessage(effectiveFetchOptions),
      responseType,
    })) as TempWindowFetch | undefined

    if (!response) {
      throw new Error(TEMP_WINDOW_FETCH_NO_RESPONSE_ERROR)
    }

    const responseWithTurnstile = {
      ...response,
      turnstile,
    } satisfies TempWindowTurnstileFetch
    sendResponse(responseWithTurnstile)
    const result = getTempWindowAnalyticsResult(response)
    trackTempWindowFetchCompleted({
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunTempWindowTurnstileFetch,
      result,
      ...(result === PRODUCT_ANALYTICS_RESULTS.Failure
        ? {
            errorCategory: getTempWindowErrorCategory({
              code: response?.code,
              status: response?.status,
            }),
          }
        : {}),
    })
  } catch (error) {
    const failure = toTempWindowFailureResponse(error)

    logTempWindow("tempWindowTurnstileFetchError", {
      requestId: tempRequestId,
      error: failure.error,
      code: failure.code ?? null,
    })
    await tempWindowBackgroundRuntime.release(tempRequestId, {
      forceClose: true,
      reason: "tempWindowTurnstileFetchError",
    })
    sendResponse({
      success: false,
      error: failure.error,
      code: failure.code,
      turnstile,
    })
    trackTempWindowFetchCompleted({
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunTempWindowTurnstileFetch,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: getTempWindowErrorCategory(failure),
    })
  } finally {
    for (const ruleId of ruleIds) {
      await removeTempWindowCookieRule(ruleId)
    }

    await tempWindowBackgroundRuntime.release(tempRequestId)
  }
}
