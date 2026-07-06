import { AuthTypeEnum } from "~/types"
import type {
  TempWindowFallbackAllowlist,
  TempWindowResponseType,
} from "~/types/tempWindowFetch"

export interface ApiResponse<T = any> {
  success: boolean
  data: T
  message: string
}

export interface AuthConfig {
  /** 认证类型: cookie | access_token | none */
  authType: AuthTypeEnum
  /** Cookie string used as a fallback when browser cookie injection is unavailable. */
  cookie?: string
  /** Access token used by token/access-token authentication. */
  accessToken?: string
  /** User ID used by cookie auth and compatible site headers. */
  userId?: number | string
  /** Sub2API refresh token, used by extension-managed sessions. */
  refreshToken?: string
  /** Sub2API access-token expiry timestamp in milliseconds since epoch. */
  tokenExpiresAt?: number
}

export const API_TRANSPORT_FETCH_CONTEXT_KINDS = {
  CURRENT_TAB: "current-tab",
  BROWSER_CONTEXT: "browser-context",
} as const

export const API_SERVICE_FETCH_CONTEXT_KINDS = API_TRANSPORT_FETCH_CONTEXT_KINDS

export type ApiTransportFetchContextKind =
  (typeof API_TRANSPORT_FETCH_CONTEXT_KINDS)[keyof typeof API_TRANSPORT_FETCH_CONTEXT_KINDS]

type ApiTransportBrowserFetchContext = {
  incognito?: boolean
  cookieStoreId?: string
}

export type ApiTransportFetchContext =
  | (ApiTransportBrowserFetchContext & {
      kind: typeof API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB
      tabId: number
      origin: string
    })
  | (ApiTransportBrowserFetchContext & {
      kind: typeof API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT
    })

// Legacy apiService aliases kept for downstream imports during the transport
// boundary migration. New code should use the ApiTransport* names directly.
// Remove these once src/ and tests/ no longer import the apiService aliases.
export type ApiServiceFetchContextKind = ApiTransportFetchContextKind
export type ApiServiceFetchContext = ApiTransportFetchContext

export const API_AUTH_TOKEN_MODES = {
  Bearer: "bearer",
  Raw: "raw",
} as const

export type ApiAuthTokenMode =
  (typeof API_AUTH_TOKEN_MODES)[keyof typeof API_AUTH_TOKEN_MODES]

/**
 * Builds a log-safe summary of a fetch context without exposing cookie-store values.
 */
export function summarizeApiTransportFetchContext(
  fetchContext: ApiTransportFetchContext | undefined,
) {
  if (!fetchContext) return undefined

  return {
    kind: fetchContext.kind,
    incognito: fetchContext.incognito === true,
    hasCookieStoreId: Boolean(fetchContext.cookieStoreId),
    ...(fetchContext.kind === API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB
      ? {
          tabId: fetchContext.tabId,
          origin: fetchContext.origin,
        }
      : {}),
  }
}

export const summarizeApiServiceFetchContext = summarizeApiTransportFetchContext

export interface ApiTransportRequest {
  auth: AuthConfig
  baseUrl: string
  data?: Record<string, any>
  accountId?: string
  abortSignal?: AbortSignal
  cookieAuthSessionCookie?: string
  fetchContext?: ApiTransportFetchContext
  /** Skip the generic per-site limiter when the caller already applies a narrower limiter. */
  bypassSiteRequestLimit?: boolean
}

export type ApiServiceRequest = ApiTransportRequest

export interface FetchApiOptions {
  endpoint: string
  options?: RequestInit
  responseType?: TempWindowResponseType
  tempWindowFallback?: TempWindowFallbackAllowlist
  currentTabTransport?: "prefer" | "disabled"
  authTokenMode?: ApiAuthTokenMode
}

export interface OpenAIAuthParams {
  baseUrl: string
  apiKey: string
  abortSignal?: AbortSignal
}

export type UpstreamModelItem = {
  id: string
  object: "model"
  created: number
  owned_by: string
}

export type UpstreamModelList = UpstreamModelItem[]
