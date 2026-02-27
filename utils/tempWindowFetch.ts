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
} from "~/services/userPreferences"
import type {
  TempWindowFallbackAllowlist,
  TempWindowFallbackContext,
  TempWindowFetch,
  TempWindowFetchParams,
  TempWindowRenderedTitleResponse,
  TempWindowTurnstileFetch,
  TempWindowTurnstileFetchParams,
} from "~/types/tempWindowFetch"
import {
  isExtensionBackground,
  isExtensionPopup,
  isExtensionSidePanel,
  OPTIONS_PAGE_URL,
} from "~/utils/browser"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { safeRandomUUID } from "~/utils/identifier"
import { createLogger } from "~/utils/logger"
import { isProtectionBypassFirefoxEnv } from "~/utils/protectionBypass"

/**
 * Unified logger scoped to temp window fetch helpers and fallback behavior.
 */
const logger = createLogger("TempWindowFetch")

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
          await handleTempWindowGetRenderedTitle(payload, (response: any) => {
            finalize(response as TempWindowRenderedTitleResponse)
          })
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

  if (!prefsFallback || !prefsFallback.enabled) {
    tagTempWindowFallbackBlocked(error, API_ERROR_CODES.TEMP_WINDOW_DISABLED)
    logSkipTempWindowFallback(
      "Temp window shield is disabled or preferences are missing.",
      context,
      {
        enabled: prefsFallback?.enabled ?? null,
      },
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

  const isBackground = isExtensionBackground()

  let inPopup = false
  let inSidePanel = false
  let inOptions = false

  if (!isBackground) {
    try {
      if (isExtensionPopup()) {
        inPopup = true
      } else if (isExtensionSidePanel()) {
        inSidePanel = true
      } else if (typeof window !== "undefined") {
        const currentUrl = new URL(window.location.href)
        if (currentUrl && currentUrl.href.startsWith(OPTIONS_PAGE_URL)) {
          inOptions = true
        }
      }
    } catch {
      // ignore environment detection errors
    }
  }

  const isAutoRefreshContext = isBackground
  const isManualRefreshContext = !isBackground

  if (inPopup && !prefsFallback.useInPopup) {
    tagTempWindowFallbackBlocked(error, API_ERROR_CODES.TEMP_WINDOW_DISABLED)
    logSkipTempWindowFallback(
      "Popup context is disabled by user shield preferences.",
      context,
    )
    return false
  }
  if (inSidePanel && !prefsFallback.useInSidePanel) {
    tagTempWindowFallbackBlocked(error, API_ERROR_CODES.TEMP_WINDOW_DISABLED)
    logSkipTempWindowFallback(
      "Side panel context is disabled by user shield preferences.",
      context,
    )
    return false
  }
  if (inOptions && !prefsFallback.useInOptions) {
    tagTempWindowFallbackBlocked(error, API_ERROR_CODES.TEMP_WINDOW_DISABLED)
    logSkipTempWindowFallback(
      "Options page context is disabled by user shield preferences.",
      context,
    )
    return false
  }

  if (isAutoRefreshContext && !prefsFallback.useForAutoRefresh) {
    tagTempWindowFallbackBlocked(error, API_ERROR_CODES.TEMP_WINDOW_DISABLED)
    logSkipTempWindowFallback(
      "Auto-refresh context is disabled by user shield preferences.",
      context,
    )
    return false
  }
  if (isManualRefreshContext && !prefsFallback.useForManualRefresh) {
    tagTempWindowFallbackBlocked(error, API_ERROR_CODES.TEMP_WINDOW_DISABLED)
    logSkipTempWindowFallback(
      "Manual refresh context is disabled by user shield preferences.",
      context,
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
