import {
  handleTempWindowFetch,
  handleTempWindowGetRenderedTitle,
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
import {
  isExtensionBackground,
  isExtensionPopup,
  isExtensionSidePanel,
  OPTIONS_PAGE_URL,
} from "~/utils/browser"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { isProtectionBypassFirefoxEnv } from "~/utils/protectionBypass"

export type TempWindowResponseType = "json" | "text" | "arrayBuffer" | "blob"

export interface TempWindowFetchParams {
  originUrl: string
  fetchUrl: string
  fetchOptions?: Record<string, any>
  requestId?: string
  responseType?: TempWindowResponseType
  suppressMinimize?: boolean
}

export interface TempWindowFetch {
  success: boolean
  status?: number
  headers?: Record<string, string>
  data?: any
  error?: string
}

export interface TempWindowRenderedTitleResponse {
  success: boolean
  title?: string
  error?: string
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

  if (isExtensionBackground()) {
    return await new Promise<TempWindowFetch>((resolve) => {
      void handleTempWindowFetch(payload, (response) => {
        resolve(
          (response ?? {
            success: false,
            error: "Empty tempWindowFetch response",
          }) as TempWindowFetch,
        )
      })
    })
  }
  return await sendRuntimeMessage({
    action: "tempWindowFetch",
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
    action: "tempWindowGetRenderedTitle",
    ...params,
    suppressMinimize:
      params.suppressMinimize ??
      (typeof window !== "undefined" && isExtensionPopup()),
  }

  if (isExtensionBackground()) {
    return await new Promise<TempWindowRenderedTitleResponse>((resolve) => {
      // reuse background handler directly for synchronous contexts
      void handleTempWindowGetRenderedTitle(payload, (response: any) => {
        resolve(
          (response ?? {
            success: false,
            error: "Empty tempWindowGetRenderedTitle response",
          }) as TempWindowRenderedTitleResponse,
        )
      })
    })
  }

  return await sendRuntimeMessage(payload)
}
const TEMP_WINDOW_FALLBACK_STATUS = new Set([401, 403, 429])
const TEMP_WINDOW_FALLBACK_CODES = new Set<ApiErrorCode>([
  API_ERROR_CODES.HTTP_401,
  API_ERROR_CODES.HTTP_403,
  API_ERROR_CODES.HTTP_429,
  API_ERROR_CODES.CONTENT_TYPE_MISMATCH,
])

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

export interface TempWindowFallbackContext {
  baseUrl: string
  url: string
  endpoint?: string
  fetchOptions: RequestInit
  onlyData: boolean
  responseType: TempWindowResponseType
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
    const location = context.endpoint
      ? `endpoint "${context.endpoint}"`
      : `url ${context.url}`

    const base = `[API Service] Temp window fallback skipped for ${location}: ${message}`

    if (extra && Object.keys(extra).length > 0) {
      console.log(base, extra)
    } else {
      console.log(base)
    }
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
  const hasCodeFallback =
    !!error.code && TEMP_WINDOW_FALLBACK_CODES.has(error.code)
  const hasStatusFallback =
    !!error.statusCode && TEMP_WINDOW_FALLBACK_STATUS.has(error.statusCode)

  if (!hasCodeFallback && !hasStatusFallback) {
    logSkipTempWindowFallback(
      "Error does not match any temp window fallback codes or statuses.",
      context,
      {
        statusCode: error.statusCode,
        code: error.code ?? null,
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

  const requestId = `temp-fetch-${Date.now()}`
  const suppressMinimize = true
  const payload: TempWindowFetchParams = {
    originUrl: context.baseUrl,
    fetchUrl: context.url,
    fetchOptions,
    requestId,
    responseType,
    suppressMinimize,
  }

  console.log("[API Service] Using temp window fetch fallback for", context.url)

  const response = await tempWindowFetch(payload)

  console.log("[API Service] Temp window fetch response:", response)

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
