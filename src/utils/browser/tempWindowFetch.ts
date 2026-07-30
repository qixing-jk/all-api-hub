import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  API_ERROR_CODES,
  ApiError,
  type ApiErrorCode,
} from "~/services/apiTransport/errors"
import {
  extractDataFromApiResponseBody,
  isHttpUrl,
} from "~/services/apiTransport/response"
import type { ApiResponse } from "~/services/apiTransport/type"
import {
  COOKIE_INTERCEPTOR_PERMISSIONS,
  hasCookieInterceptorPermissions,
} from "~/services/permissions/permissionManager"
import type { TempWindowFallbackPreferences } from "~/services/preferences/userPreferences"
import {
  PROTECTION_BYPASS_AUTOMATIC_FEATURES,
  TEMP_CONTEXT_TASK_KINDS,
  type ProtectionBypassExecuteRequest,
  type TempContextTask,
  type TempContextTaskResult,
  type TempWindowNewApiSessionReadParams,
} from "~/services/protectionBypass/contracts"
import { isAutomaticProtectionBypassEnabled } from "~/services/protectionBypass/policy"
import { normalizeProtectionBypassPreferences } from "~/services/protectionBypass/preferencePolicy"
import { AuthTypeEnum } from "~/types"
import {
  TEMP_WINDOW_HEALTH_STATUS_CODES,
  type TempWindowHealthStatusCode,
} from "~/types/tempWindow"
import {
  type TempWindowCheckinPageAction,
  type TempWindowCheckinPageActionParams,
  type TempWindowFallbackAllowlist,
  type TempWindowFallbackContext,
  type TempWindowFetch,
  type TempWindowFetchParams,
  type TempWindowRenderedTitleParams,
  type TempWindowRenderedTitleResponse,
  type TempWindowTurnstileFetch,
  type TempWindowTurnstileFetchParams,
} from "~/types/tempWindowFetch"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { isExtensionBackground } from "~/utils/browser/index"
import { isProtectionBypassFirefoxEnv } from "~/utils/browser/protectionBypass"
import { normalizeRequestInitForMessage } from "~/utils/browser/requestInitMessage"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to temp window fetch helpers and fallback behavior.
 */
const logger = createLogger("TempWindowFetch")
const TEMP_WINDOW_POLICY_BLOCK_CODES = new Set<ApiErrorCode>([
  API_ERROR_CODES.TEMP_WINDOW_DISABLED,
  API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED,
  API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
])

/** Sends one canonical protected-task envelope through the active context. */
export async function executeProtectionBypassTask<
  TTask extends TempContextTask,
>(
  request: ProtectionBypassExecuteRequest<TTask>,
): Promise<TempContextTaskResult<TTask>> {
  if (isExtensionBackground()) {
    const { protectionBypassCoordinator } = await import(
      "~/entrypoints/background/protectionBypassCoordinator"
    )
    return await protectionBypassCoordinator.execute(request)
  }
  return await sendRuntimeMessage({
    action: RuntimeActionIds.ProtectionBypassExecuteTask,
    ...request,
  })
}

/**
 * Type guard to validate the shape of a temp window rendered title response.
 */
function isTempWindowRenderedTitleResponse(
  value: unknown,
): value is TempWindowRenderedTitleResponse {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>

  if (typeof record.success !== "boolean") return false
  if (record.title !== undefined && typeof record.title !== "string")
    return false
  if (record.error !== undefined && typeof record.error !== "string")
    return false

  return true
}

/**
 * Checks whether the temp window fetch flow can be used in the current browser.
 * Firefox requires cookie interceptor permissions; other browsers always allow.
 */
export async function canUseTempWindowFetch() {
  if (isProtectionBypassFirefoxEnv()) {
    return await hasCookieInterceptorPermissions()
  } else {
    return true
  }
}

type TempWindowFallbackBlockedReason =
  | "master_disabled"
  | "automatic_account_refresh_disabled"
  | "permission_required"

type TempWindowFallbackBlockStatus =
  | {
      kind: "available"
      code: null
      reason: null
    }
  | {
      kind: "not_applicable"
      code: null
      reason: "firefox_popup_unsupported"
    }
  | {
      kind: "blocked"
      code: TempWindowHealthStatusCode
      reason: TempWindowFallbackBlockedReason
    }

/**
 * Evaluates the known automatic account-refresh fallback, used by its health reminder.
 */
export async function getTempWindowFallbackBlockStatus(params: {
  preferences: TempWindowFallbackPreferences
  isBackground?: boolean
  inPopup?: boolean
  inSidePanel?: boolean
  inOptions?: boolean
  tempWindowRequestSource?: unknown
}): Promise<TempWindowFallbackBlockStatus> {
  const { preferences } = params
  const policy = normalizeProtectionBypassPreferences(preferences)
  if (!policy.automaticMasterEnabled) {
    return {
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      reason: "master_disabled",
    }
  }
  if (
    !isAutomaticProtectionBypassEnabled(
      policy,
      PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh,
    )
  ) {
    return {
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      reason: "automatic_account_refresh_disabled",
    }
  }

  if (!(await canUseTempWindowFetch())) {
    return {
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED,
      reason: "permission_required",
    }
  }

  return {
    kind: "available",
    code: null,
    reason: null,
  }
}

/**
 * Performs a network request via the background "temp window" channel.
 * - In background context: delegates to a handler that executes the request.
 * - In other contexts: sends a runtime message to the background to perform it.
 * @param params Request configuration forwarded to the temp window handler.
 */
export async function tempWindowFetch(
  params: TempWindowFetchParams,
): Promise<TempWindowFetch> {
  const payload: TempWindowFetchParams = {
    ...params,
    ...(params.fetchOptions
      ? { fetchOptions: normalizeRequestInitForMessage(params.fetchOptions) }
      : {}),
  }
  const {
    protectionBypassExecution: execution,
    tempWindowRequestSource: _ignoredSource,
    ...taskParams
  } = payload
  if (
    payload.tempContextTaskKind === TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch
  ) {
    return await executeProtectionBypassTask({
      execution,
      task: {
        kind: TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch,
        params: taskParams,
      },
    })
  }
  return await executeProtectionBypassTask({
    execution,
    task: {
      kind: TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
      params: taskParams,
    },
  })
}

/** Executes the closed New API cookie-session read through the Coordinator. */
export async function tempWindowNewApiSessionRead(
  params: TempWindowNewApiSessionReadParams,
): Promise<TempWindowFetch> {
  const {
    protectionBypassExecution: execution,
    tempWindowRequestSource: _ignoredSource,
    ...taskParams
  } = params
  return await executeProtectionBypassTask({
    execution,
    task: {
      kind: TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead,
      params: taskParams,
    },
  })
}

/**
 * Performs a Turnstile-assisted network request via the background "temp window" channel.
 */
export async function tempWindowTurnstileFetch(
  params: TempWindowTurnstileFetchParams,
): Promise<TempWindowTurnstileFetch> {
  const payload: TempWindowTurnstileFetchParams = {
    ...params,
    ...(params.fetchOptions
      ? { fetchOptions: normalizeRequestInitForMessage(params.fetchOptions) }
      : {}),
  }
  const {
    protectionBypassExecution: execution,
    tempWindowRequestSource: _ignoredSource,
    ...taskParams
  } = payload
  return await executeProtectionBypassTask({
    execution,
    task: { kind: TEMP_CONTEXT_TASK_KINDS.TurnstileFetch, params: taskParams },
  })
}

/**
 * Triggers the site page's native check-in action in a temporary browser context.
 * @param params Native page action trigger configuration forwarded to the background handler.
 */
export async function tempWindowTriggerCheckinPageAction(
  params: TempWindowCheckinPageActionParams,
): Promise<TempWindowCheckinPageAction> {
  const {
    protectionBypassExecution: execution,
    tempWindowRequestSource: _ignoredSource,
    ...taskParams
  } = params
  return await executeProtectionBypassTask({
    execution,
    task: {
      kind: TEMP_CONTEXT_TASK_KINDS.NativePageAction,
      params: taskParams,
    },
  })
}

/**
 * Reads the rendered document.title via the temp window flow.
 */
export async function tempWindowGetRenderedTitle(
  params: TempWindowRenderedTitleParams,
): Promise<TempWindowRenderedTitleResponse> {
  const {
    protectionBypassExecution: execution,
    tempWindowRequestSource: _ignoredSource,
    ...taskParams
  } = params
  const response = await executeProtectionBypassTask({
    execution,
    task: { kind: TEMP_CONTEXT_TASK_KINDS.RenderedTitle, params: taskParams },
  })
  return isTempWindowRenderedTitleResponse(response)
    ? response
    : { success: false, error: "Invalid tempWindowGetRenderedTitle response" }
}

const TEMP_WINDOW_FALLBACK_STATUS = new Set([403])
const TEMP_WINDOW_FALLBACK_CODES = new Set<ApiErrorCode>([
  API_ERROR_CODES.HTTP_403,
  API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
])

/**
 * Determines whether a given error matches the status codes or error codes that should trigger temp window fallback.
 * @param error The error thrown by the primary request, which may contain a `statusCode` and/or `code` property.
 * @param error.statusCode Optional HTTP status code from the failed request, if available.
 * @param error.code Optional API error code from the failed request, if available.
 * @param allowlist Optional allowlist of status codes and error codes that should trigger temp window fallback. When omitted, defaults to HTTP 403 and `CONTENT_TYPE_MISMATCH` (plus `HTTP_403`) allowlisting. When provided, it fully overrides defaults: omitted fields (e.g. `statusCodes` or `codes`) are treated as empty lists.
 */
export function matchesTempWindowFallbackAllowlist(
  error: { statusCode?: number; code?: ApiErrorCode },
  allowlist?: TempWindowFallbackAllowlist,
): boolean {
  const statusAllowlist = allowlist
    ? new Set(allowlist.statusCodes ?? [])
    : TEMP_WINDOW_FALLBACK_STATUS
  const codeAllowlist = allowlist
    ? new Set(allowlist.codes ?? [])
    : TEMP_WINDOW_FALLBACK_CODES

  const hasCodeFallback = !!error.code && codeAllowlist.has(error.code)
  const hasStatusFallback =
    !!error.statusCode && statusAllowlist.has(error.statusCode)

  return hasCodeFallback || hasStatusFallback
}

/**
 * Matches the default 401 fallback for cookie-auth requests that can replay a
 * stored account cookie. Explicit request allowlists are handled separately.
 */
function isCookieAuthUnauthorizedFallback(
  error: ApiError,
  context: TempWindowFallbackContext,
): boolean {
  if (context.authType !== AuthTypeEnum.Cookie) return false
  if (!context.cookieAuthSessionCookie?.trim()) return false

  return error.statusCode === 401 || error.code === API_ERROR_CODES.HTTP_401
}

/**
 * Mutates an {@link ApiError} to preserve its original code and attach a more
 * specific failure reason.
 *
 * This is used when temp-window fallback would have been applicable, but is
 * blocked by user configuration or insufficient permissions.
 */
function tagTempWindowFallbackBlocked(
  error: ApiError,
  code: ApiErrorCode,
): void {
  if (!error.originalCode) {
    error.originalCode = error.code
  }
  error.code = code
}

/**
 * Logs why temp-window fallback is skipped; errors inside logger are ignored.
 * @param message Human-friendly skip reason.
 * @param context Request context for diagnostics.
 * @param extra Optional extra metadata.
 */
function logSkipTempWindowFallback(
  message: string,
  context: TempWindowFallbackContext,
  extra?: Record<string, unknown>,
): void {
  try {
    logger.debug("Temp window fallback skipped", {
      reason: message,
      endpoint: context.endpoint,
      url: context.url,
      baseUrl: context.baseUrl,
      responseType: context.responseType,
      onlyData: context.onlyData,
      authType: context.authType,
      ...(extra && Object.keys(extra).length > 0 ? { extra } : null),
    })
  } catch {
    // ignore logging errors
  }
}

/**
 * Tries a primary API request and transparently falls back to the temp-window flow when needed.
 * @param context Metadata describing the request and fallback behavior.
 * @param primaryRequest Function executing the original request.
 */
export async function executeWithTempWindowFallback<T>(
  context: TempWindowFallbackContext,
  primaryRequest: () => Promise<T | ApiResponse<T>>,
): Promise<T | ApiResponse<T>> {
  if (context.forceTempWindow) {
    return await fetchViaTempWindow<T>(context)
  }

  try {
    return await primaryRequest()
  } catch (primaryError) {
    if (!(await shouldUseTempWindowFallback(primaryError, context))) {
      throw primaryError
    }

    try {
      return await fetchViaTempWindow<T>(context)
    } catch (fallbackError) {
      if (
        primaryError instanceof ApiError &&
        fallbackError instanceof ApiError &&
        fallbackError.code &&
        TEMP_WINDOW_POLICY_BLOCK_CODES.has(fallbackError.code)
      ) {
        tagTempWindowFallbackBlocked(primaryError, fallbackError.code)
        throw primaryError
      }
      throw fallbackError
    }
  }
}

/**
 * Determines whether the temp-window fallback should be invoked for a failed request.
 * @param error Error thrown by the primary request.
 * @param context Network context describing endpoint, URL, and fetch options.
 */
async function shouldUseTempWindowFallback(
  error: unknown,
  context: TempWindowFallbackContext,
): Promise<boolean> {
  if (!(error instanceof ApiError)) {
    logSkipTempWindowFallback(
      "Error is not an ApiError instance; treating as normal network/other error.",
      context,
      { error },
    )
    return false
  }

  if (error.code === API_ERROR_CODES.BUSINESS_ERROR) {
    logSkipTempWindowFallback(
      "Error is a backend business error; temp window fallback cannot recover it.",
      context,
      {
        statusCode: error.statusCode,
        code: error.code,
      },
    )
    return false
  }

  const matchesAllowlist = matchesTempWindowFallbackAllowlist(
    error,
    context.tempWindowFallback,
  )
  const matchesDefaultCookieAuthFallback =
    typeof context.tempWindowFallback === "undefined" &&
    isCookieAuthUnauthorizedFallback(error, context)

  if (!matchesAllowlist && !matchesDefaultCookieAuthFallback) {
    logSkipTempWindowFallback(
      "Error does not match any temp window fallback codes or statuses.",
      context,
      {
        statusCode: error.statusCode,
        code: error.code ?? null,
        allowlist: context.tempWindowFallback ?? null,
      },
    )
    return false
  }

  if (!isHttpUrl(context.baseUrl)) {
    logSkipTempWindowFallback(
      "Base URL is not HTTP/HTTPS; temp window fallback only supports http(s).",
      context,
      {
        baseUrl: context.baseUrl,
      },
    )
    return false
  }

  if (!context.fetchOptions) {
    logSkipTempWindowFallback(
      "Missing fetch options; cannot safely re-issue request via temp window.",
      context,
    )
    return false
  }

  if (!(await canUseTempWindowFetch())) {
    tagTempWindowFallbackBlocked(
      error,
      API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED,
    )
    logSkipTempWindowFallback(
      "Cookie interceptor permissions not granted; skipping temp window fallback.",
      context,
      {
        permissions: COOKIE_INTERCEPTOR_PERMISSIONS,
      },
    )
    return false
  }

  return true
}

/**
 * Issues the network request via the temp-window channel once fallback is approved.
 * @param context Context describing the original request configuration.
 */
async function fetchViaTempWindow<T>(
  context: TempWindowFallbackContext,
): Promise<T | ApiResponse<T>> {
  const { fetchOptions, responseType } = context

  if (!fetchOptions) {
    throw new ApiError(
      "Temp window fetch fallback is not supported for current request",
      undefined,
      context.endpoint,
    )
  }

  const requestId = safeRandomUUID(`temp-fetch-${context.url}`)
  const payload: TempWindowFetchParams = {
    originUrl: context.baseUrl,
    fetchUrl: context.url,
    fetchOptions,
    requestId,
    responseType,
    tempWindowRequestSource: context.tempWindowRequestSource,
    protectionBypassExecution: context.protectionBypassExecution,
    tempContextTaskKind: context.forceTempWindow
      ? TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch
      : TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
    accountId: context.accountId,
    authType: context.authType,
    cookieAuthSessionCookie: context.cookieAuthSessionCookie,
    useIncognito: context.useIncognito,
    cookieStoreId: context.cookieStoreId,
  }

  logger.debug("Using temp window fetch fallback", {
    endpoint: context.endpoint,
    url: context.url,
  })

  const response = await tempWindowFetch(payload)

  logger.debug("Temp window fetch response received", {
    endpoint: context.endpoint,
    url: context.url,
    success: response.success,
    status: response.status,
  })

  if (!response.success) {
    throw new ApiError(
      response.error || "Temp window fetch failed",
      response.status,
      context.endpoint,
      response.code,
    )
  }

  const responseBody = response.data

  if (responseType === "json") {
    if (context.onlyData) {
      return extractDataFromApiResponseBody<T>(responseBody, context.endpoint)
    }
    return responseBody as ApiResponse<T>
  }

  return responseBody as T
}
