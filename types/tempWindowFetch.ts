import { ApiErrorCode } from "~/services/apiService/common/errors"
import type { AuthTypeEnum } from "~/types"
import type { TurnstilePreTrigger } from "~/types/turnstile"

export type TempWindowResponseType = "json" | "text" | "arrayBuffer" | "blob"

export interface TempWindowFetchParams {
  originUrl: string
  fetchUrl: string
  fetchOptions?: RequestInit
  requestId?: string
  responseType?: TempWindowResponseType
  suppressMinimize?: boolean
  /** Account ID for per-request cookie isolation */
  accountId?: string
  /** Auth type for cookie auth handling */
  authType?: AuthTypeEnum
  /** Per-account session cookie header to merge with WAF cookies */
  cookieAuthSessionCookie?: string
}

export type TempWindowTurnstileStatus =
  | "not_present"
  | "token_obtained"
  | "timeout"
  | "error"

export interface TempWindowTurnstileMeta {
  status: TempWindowTurnstileStatus
  hasTurnstile: boolean
}

export interface TempWindowTurnstileFetchParams extends TempWindowFetchParams {
  /** Page URL used to render Turnstile in the temporary context. */
  pageUrl: string
  /**
   * When true, open the temporary context in an incognito/private window.
   *
   * This is useful for sites whose login state is stored in local/session
   * storage, where a normal temp tab may inherit the currently logged-in user
   * and fail to render Turnstile (multi-account scenarios).
   */
  useIncognito?: boolean
  /** Timeout (ms) for Turnstile token wait in the content script. */
  turnstileTimeoutMs?: number
  /** Query parameter name used for token attachment (default: `turnstile`). */
  turnstileParamName?: string
  /** Optional pre-trigger used to render the Turnstile widget (best-effort). */
  turnstilePreTrigger?: TurnstilePreTrigger
}

export interface TempWindowFetch {
  success: boolean
  status?: number
  headers?: Record<string, string>
  data?: any
  error?: string
}

export interface TempWindowTurnstileFetch extends TempWindowFetch {
  turnstile: TempWindowTurnstileMeta
}

export interface TempWindowRenderedTitleResponse {
  success: boolean
  title?: string
  error?: string
}

export interface TempWindowFallbackAllowlist {
  statusCodes?: number[]
  codes?: ApiErrorCode[]
}

export interface TempWindowFallbackContext {
  baseUrl: string
  url: string
  endpoint: string
  fetchOptions: RequestInit
  onlyData: boolean
  responseType: TempWindowResponseType
  /**
   * Allowlist controlling which `ApiError.statusCode` and/or `ApiError.code` values can trigger temp-window fallback.
   * When provided, this fully overrides the default allowlist: omitted fields default to empty lists.
   */
  tempWindowFallback?: TempWindowFallbackAllowlist
  /** Account ID for per-request cookie isolation */
  accountId?: string
  /** Auth type for cookie auth handling */
  authType: AuthTypeEnum
  /** Per-account session cookie header to merge with WAF cookies */
  cookieAuthSessionCookie?: string
}
