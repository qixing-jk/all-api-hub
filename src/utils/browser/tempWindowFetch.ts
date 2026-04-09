import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  handleTempWindowFetch,
  handleTempWindowGetRenderedTitle,
  handleTempWindowTurnstileFetch,
} from "~/entrypoints/background/tempWindowPool"
import {
  API_ERROR_CODES,
  ApiError,
  type ApiErrorCode,
} from "~/services/apiService/common/errors"
import type { ApiResponse } from "~/services/apiService/common/type"
import {
  extractDataFromApiResponseBody,
  isHttpUrl,
} from "~/services/apiService/common/utils"
import {
  COOKIE_INTERCEPTOR_PERMISSIONS,
  hasCookieInterceptorPermissions,
} from "~/services/permissions/permissionManager"
import {
  DEFAULT_PREFERENCES,
  TempWindowFallbackPreferences,
  userPreferences,
} from "~/services/preferences/userPreferences"
import {
  TEMP_WINDOW_HEALTH_STATUS_CODES,
  type TempWindowHealthStatusCode,
} from "~/types/tempWindow"
import type {
  TempWindowFallbackAllowlist,
  TempWindowFallbackContext,
  TempWindowFetch,
  TempWindowFetchParams,
  TempWindowRenderedTitleResponse,
  TempWindowTurnstileFetch,
  TempWindowTurnstileFetchParams,
} from "~/types/tempWindowFetch"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import {
  isExtensionBackground,
  isExtensionPopup,
  isExtensionSidePanel,
  OPTIONS_PAGE_URL,
} from "~/utils/browser/index"
import { isProtectionBypassFirefoxEnv } from "~/utils/browser/protectionBypass"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to temp window fetch helpers and fallback behavior.
 */
const logger = createLogger("TempWindowFetch")

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
  | "permission_required"
  | "popup_disabled"
  | "sidepanel_disabled"
  | "options_disabled"
  | "auto_refresh_disabled"
  | "manual_refresh_disabled"

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
 * Evaluates whether temp-window fallback is currently blocked for the active UI/runtime context.
 *
 * This is shared by the actual fallback path and reminder UIs so they stay aligned
 * on the same enablement, context, and permission gates.
 */
export async function getTempWindowFallbackBlockStatus(
  params: {
    preferences?: TempWindowFallbackPreferences
    isBackground?: boolean
    inPopup?: boolean
    inSidePanel?: boolean
    inOptions?: boolean
  } = {},
): Promise<TempWindowFallbackBlockStatus> {
  const isBackground = params.isBackground ?? isExtensionBackground()
  let inPopup = params.inPopup ?? false
  let inSidePanel = params.inSidePanel ?? false
  let inOptions = params.inOptions ?? false

  if (!isBackground) {
    try {
      if (params.inPopup === undefined && isExtensionPopup()) {
        inPopup = true
      } else if (params.inSidePanel === undefined && isExtensionSidePanel()) {
        inSidePanel = true
      } else if (
        params.inOptions === undefined &&
        typeof window !== "undefined"
      ) {
        const currentUrl = new URL(window.location.href)
        if (currentUrl && currentUrl.href.startsWith(OPTIONS_PAGE_URL)) {
          inOptions = true
        }
      }
    } catch {
      // ignore environment detection errors
    }
  }

  if (!isBackground && inPopup && isProtectionBypassFirefoxEnv()) {
    return {
      kind: "not_applicable",
      code: null,
      reason: "firefox_popup_unsupported",
    }
  }

  if (!params.preferences || !params.preferences.enabled) {
    return {
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      reason: "master_disabled",
    }
  }

  const isAutoRefreshContext = isBackground
  const isManualRefreshContext = !isBackground

  if (inPopup && !params.preferences.useInPopup) {
    return {
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      reason: "popup_disabled",
    }
  }

  if (inSidePanel && !params.preferences.useInSidePanel) {
    return {
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      reason: "sidepanel_disabled",
    }
  }

  if (inOptions && !params.preferences.useInOptions) {
    return {
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      reason: "options_disabled",
    }
  }

  if (isAutoRefreshContext && !params.preferences.useForAutoRefresh) {
    return {
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      reason: "auto_refresh_disabled",
    }
  }

  if (isManualRefreshContext && !params.preferences.useForManualRefresh) {
    return {
      kind: "blocked",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      reason: "manual_refresh_disabled",
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
  const suppressMinimize =
    params.suppressMinimize ??
    (typeof window !== "undefined" && isExtensionPopup())

  const payload: TempWindowFetchParams = {
    ...params,
    suppressMinimize,
  }

  // Make sure works normally in all contexts, including background
  if (isExtensionBackground()) {
    return await new Promise<TempWindowFetch>((resolve) => {
      let responded = false

      const finalize = (response?: TempWindowFetch) => {
        if (responded) return
        responded = true
        resolve(
          response ?? {
            success: false,
            error: "Empty tempWindowFetch response",
          },
        )
      }

      void (async () => {
        try {
          await handleTempWindowFetch(payload, (response) => {
            finalize(response as TempWindowFetch)
          })
        } finally {
          finalize()
        }
      })()
    })
  }
  return await sendRuntimeMessage({
    action: RuntimeActionIds.TempWindowFetch,
    ...payload,
  })
}

/**
 * Performs a Turnstile-assisted network request via the background "temp window" channel.
 */
export async function tempWindowTurnstileFetch(
  params: TempWindowTurnstileFetchParams,
): Promise<TempWindowTurnstileFetch> {
  const suppressMinimize =
    params.suppressMinimize ??
    (typeof window !== "undefined" && isExtensionPopup())

  const payload: TempWindowTurnstileFetchParams = {
    ...params,
    suppressMinimize,
  }

  // Make sure works normally in all contexts, including background
  if (isExtensionBackground()) {
    return await new Promise<TempWindowTurnstileFetch>((resolve) => {
      let responded = false

      const finalize = (response?: TempWindowTurnstileFetch) => {
        if (responded) return
        responded = true
        resolve(
          response ?? {
            success: false,
            error: "Empty tempWindowTurnstileFetch response",
            turnstile: { status: "error", hasTurnstile: false },
          },
        )
      }

      void (async () => {
        try {
          await handleTempWindowTurnstileFetch(payload, (response) => {
            finalize(response as TempWindowTurnstileFetch)
          })
        } finally {
          finalize()
        }
      })()
    })
  }

  return await sendRuntimeMessage({
    action: RuntimeActionIds.TempWindowTurnstileFetch,
    ...payload,
  })
}

/**
 * Reads the rendered document.title via the temp window flow.
 */
export async function tempWindowGetRenderedTitle(params: {
  originUrl: string
  requestId?: string
  suppressMinimize?: boolean
}): Promise<TempWindowRenderedTitleResponse> {
  const payload = {
    action: RuntimeActionIds.TempWindowGetRenderedTitle,
    ...params,
    suppressMinimize:
      params.suppressMinimize ??
      (typeof window !== "undefined" && isExtensionPopup()),
  }

  // Make sure works normally in all contexts, including background
  if (isExtensionBackground()) {
    return await new Promise<TempWindowRenderedTitleResponse>((resolve) => {
      // reuse background handler directly for synchronous contexts
      let responded = false

      const finalize = (response?: TempWindowRenderedTitleResponse) => {
        if (responded) return
        responded = true
        resolve(
          response ?? {
            success: false,
            error: "Empty tempWindowGetRenderedTitle response",
          },
        )
      }

      void (async () => {
        try {
          await handleTempWindowGetRenderedTitle(
            payload,
            (response: unknown) => {
              if (isTempWindowRenderedTitleResponse(response)) {
                finalize(response)
                return
              }

              finalize({
                success: false,
                error: "Invalid tempWindowGetRenderedTitle response",
              })
            },
          )
        } finally {
          finalize()
        }
      })()
    })
  }

  return await sendRuntimeMessage(payload)
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
  try {
    return await primaryRequest()
  } catch (error) {
    if (!(await shouldUseTempWindowFallback(error, context))) {
      throw error
    }

    return await fetchViaTempWindow<T>(context)
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

  if (!matchesTempWindowFallbackAllowlist(error, context.tempWindowFallback)) {
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

  try {
    if (
      typeof window !== "undefined" &&
      isProtectionBypassFirefoxEnv() &&
      isExtensionPopup()
    ) {
      logSkipTempWindowFallback(
        "Running in Firefox popup; temp window fallback is forcibly disabled to avoid closing the popup.",
        context,
      )
      return false
    }
  } catch {
    // ignore environment detection errors
  }

  let prefsFallback: TempWindowFallbackPreferences | undefined
  try {
    const prefs = await userPreferences.getPreferences()
    prefsFallback =
      (prefs.tempWindowFallback as TempWindowFallbackPreferences | undefined) ??
      (DEFAULT_PREFERENCES.tempWindowFallback as TempWindowFallbackPreferences)
  } catch {
    prefsFallback =
      DEFAULT_PREFERENCES.tempWindowFallback as TempWindowFallbackPreferences
  }

  const blockStatus = await getTempWindowFallbackBlockStatus({
    preferences: prefsFallback,
  })

  if (blockStatus.kind === "available") {
    return true
  }

  if (blockStatus.kind === "not_applicable") {
    logSkipTempWindowFallback(
      "Running in Firefox popup; temp window fallback is forcibly disabled to avoid closing the popup.",
      context,
    )
    return false
  }

  tagTempWindowFallbackBlocked(
    error,
    blockStatus.code === TEMP_WINDOW_HEALTH_STATUS_CODES.PERMISSION_REQUIRED
      ? API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED
      : API_ERROR_CODES.TEMP_WINDOW_DISABLED,
  )

  switch (blockStatus.reason) {
    case "master_disabled":
      logSkipTempWindowFallback(
        "Temp window shield is disabled or preferences are missing.",
        context,
        {
          enabled: prefsFallback?.enabled ?? null,
        },
      )
      return false
    case "permission_required":
      logSkipTempWindowFallback(
        "Cookie interceptor permissions not granted; skipping temp window fallback.",
        context,
        {
          permissions: COOKIE_INTERCEPTOR_PERMISSIONS,
        },
      )
      return false
    case "popup_disabled":
      logSkipTempWindowFallback(
        "Popup context is disabled by user shield preferences.",
        context,
      )
      return false
    case "sidepanel_disabled":
      logSkipTempWindowFallback(
        "Side panel context is disabled by user shield preferences.",
        context,
      )
      return false
    case "options_disabled":
      logSkipTempWindowFallback(
        "Options page context is disabled by user shield preferences.",
        context,
      )
      return false
    case "auto_refresh_disabled":
      logSkipTempWindowFallback(
        "Auto-refresh context is disabled by user shield preferences.",
        context,
      )
      return false
    case "manual_refresh_disabled":
      logSkipTempWindowFallback(
        "Manual refresh context is disabled by user shield preferences.",
        context,
      )
      return false
  }
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
  const suppressMinimize = true
  const payload: TempWindowFetchParams = {
    originUrl: context.baseUrl,
    fetchUrl: context.url,
    fetchOptions,
    requestId,
    responseType,
    suppressMinimize,
    accountId: context.accountId,
    authType: context.authType,
    cookieAuthSessionCookie: context.cookieAuthSessionCookie,
  }

  logger.info("Using temp window fetch fallback", {
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
