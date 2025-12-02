import { handleTempWindowFetch } from "~/entrypoints/background/tempWindowPool.ts"
import { ApiError } from "~/services/apiService/common/errors.ts"
import type { ApiResponse } from "~/services/apiService/common/type.ts"
import {
  extractDataFromApiResponseBody,
  isHttpUrl
} from "~/services/apiService/common/utils.ts"
import {
  COOKIE_INTERCEPTOR_PERMISSIONS,
  hasCookieInterceptorPermissions
} from "~/services/permissions/permissionManager.ts"
import {
  DEFAULT_PREFERENCES,
  TempWindowFallbackPreferences,
  userPreferences
} from "~/services/userPreferences.ts"
import {
  isExtensionBackground,
  isExtensionPopup,
  isExtensionSidePanel,
  isFirefox,
  OPTIONS_PAGE_URL
} from "~/utils/browser.ts"
import { sendRuntimeMessage } from "~/utils/browserApi.ts"

export type TempWindowResponseType = "json" | "text" | "arrayBuffer" | "blob"

export interface TempWindowFetchParams {
  originUrl: string
  fetchUrl: string
  fetchOptions?: Record<string, any>
  responseType?: TempWindowResponseType
  requestId?: string
}

export interface TempWindowFetch {
  success: boolean
  status?: number
  headers?: Record<string, string>
  data?: any
  error?: string
}

export async function canUseTempWindowFetch() {
  if (isFirefox()) {
    return await hasCookieInterceptorPermissions()
  } else {
    return true
  }
}

export async function tempWindowFetch(
  params: TempWindowFetchParams
): Promise<TempWindowFetch> {
  if (isExtensionBackground()) {
    return await new Promise<TempWindowFetch>((resolve) => {
      void handleTempWindowFetch(params, (response) => {
        resolve(
          (response ?? {
            success: false,
            error: "Empty tempWindowFetch response"
          }) as TempWindowFetch
        )
      })
    })
  }
  return await sendRuntimeMessage({
    action: "tempWindowFetch",
    ...params
  })
}
const TEMP_WINDOW_FALLBACK_STATUS = new Set([401, 403, 429])

export interface TempWindowFallbackContext {
  baseUrl: string
  url: string
  endpoint?: string
  fetchOptions: RequestInit
  onlyData: boolean
  responseType: TempWindowResponseType
}

function logSkipTempWindowFallback(
  message: string,
  context: TempWindowFallbackContext,
  extra?: Record<string, unknown>
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

export async function executeWithTempWindowFallback<T>(
  context: TempWindowFallbackContext,
  primaryRequest: () => Promise<T | ApiResponse<T>>
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

async function shouldUseTempWindowFallback(
  error: unknown,
  context: TempWindowFallbackContext
): Promise<boolean> {
  if (!(error instanceof ApiError)) {
    logSkipTempWindowFallback(
      "Error is not an ApiError instance; treating as normal network/other error.",
      context,
      { error }
    )
    return false
  }

  if (!error.statusCode || !TEMP_WINDOW_FALLBACK_STATUS.has(error.statusCode)) {
    logSkipTempWindowFallback(
      "HTTP status is not in the fallback set (only 401/403/429 trigger shield).",
      context,
      {
        statusCode: error.statusCode
      }
    )
    return false
  }

  if (!isHttpUrl(context.baseUrl)) {
    logSkipTempWindowFallback(
      "Base URL is not HTTP/HTTPS; temp window fallback only supports http(s).",
      context,
      {
        baseUrl: context.baseUrl
      }
    )
    return false
  }

  if (!context.fetchOptions) {
    logSkipTempWindowFallback(
      "Missing fetch options; cannot safely re-issue request via temp window.",
      context
    )
    return false
  }

  try {
    if (typeof window !== "undefined" && isFirefox() && isExtensionPopup()) {
      logSkipTempWindowFallback(
        "Running in Firefox popup; temp window fallback is forcibly disabled to avoid closing the popup.",
        context
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
    logSkipTempWindowFallback(
      "Temp window shield is disabled or preferences are missing.",
      context,
      {
        enabled: prefsFallback?.enabled ?? null
      }
    )
    return false
  }

  const hasCookiePermissions = await hasCookieInterceptorPermissions()
  if (!hasCookiePermissions && isFirefox()) {
    logSkipTempWindowFallback(
      "Cookie interceptor permissions not granted; skipping temp window fallback.",
      context,
      {
        permissions: COOKIE_INTERCEPTOR_PERMISSIONS
      }
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
        const href = window.location?.href || ""
        if (href && href.startsWith(OPTIONS_PAGE_URL)) {
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
    logSkipTempWindowFallback(
      "Popup context is disabled by user shield preferences.",
      context
    )
    return false
  }
  if (inSidePanel && !prefsFallback.useInSidePanel) {
    logSkipTempWindowFallback(
      "Side panel context is disabled by user shield preferences.",
      context
    )
    return false
  }
  if (inOptions && !prefsFallback.useInOptions) {
    logSkipTempWindowFallback(
      "Options page context is disabled by user shield preferences.",
      context
    )
    return false
  }

  if (isAutoRefreshContext && !prefsFallback.useForAutoRefresh) {
    logSkipTempWindowFallback(
      "Auto-refresh context is disabled by user shield preferences.",
      context
    )
    return false
  }
  if (isManualRefreshContext && !prefsFallback.useForManualRefresh) {
    logSkipTempWindowFallback(
      "Manual refresh context is disabled by user shield preferences.",
      context
    )
    return false
  }

  return true
}

async function fetchViaTempWindow<T>(
  context: TempWindowFallbackContext
): Promise<T | ApiResponse<T>> {
  const { fetchOptions, responseType } = context

  if (!fetchOptions) {
    throw new ApiError(
      "Temp window fetch fallback is not supported for current request",
      undefined,
      context.endpoint
    )
  }

  const requestPayload: TempWindowFetchParams = {
    originUrl: context.baseUrl,
    fetchUrl: context.url,
    fetchOptions,
    responseType,
    requestId: `temp-fetch-${Date.now()}`
  }

  console.log("[API Service] Using temp window fetch fallback for", context.url)

  const response = await tempWindowFetch(requestPayload)

  console.log("[API Service] Temp window fetch response:", response)

  if (!response.success) {
    throw new ApiError(
      response.error || "Temp window fetch failed",
      response.status,
      context.endpoint
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
