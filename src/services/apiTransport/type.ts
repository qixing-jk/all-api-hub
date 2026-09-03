import type { DeferredAbortDeadline } from "~/services/apiTransport/abortableTask"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { type AuthTypeEnum } from "~/types"
import type {
  TempWindowFallbackAllowlist,
  TempWindowRequestSource,
  TempWindowResponseType,
} from "~/types/tempWindowFetch"

export interface ApiResponse<T = any> {
  success: boolean
  data: T
  message: string
}

/** Serializable HTTP result shared by every extension fetch context. */
export interface ApiTransportResponse<T = unknown> {
  ok: boolean
  status: number
  headers: Readonly<Record<string, string>>
  body: T
}

export type ApiResponseErrorKind = "business" | "http"

export interface DecodedApiResponseError {
  kind: ApiResponseErrorKind
  message?: string
  upstreamCode?: string
}

/**
 * Interprets one provider response without performing disclosure or redaction.
 * Implementations must be total for unknown bodies and return null when the
 * response does not match their protocol.
 */
export type ApiResponseErrorDecoder = (
  response: ApiTransportResponse<unknown>,
  context: { endpoint: string },
) => DecodedApiResponseError | null

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

export const API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES = {
  Allow: "allow",
  Forbid: "forbid",
} as const

export type ApiTransportCurrentTabFallbackMode =
  (typeof API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES)[keyof typeof API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES]

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

export interface ApiTransportRequestObserver {
  onDispatch(): void
  onResponse(): void
  /** Clears pre-handler evidence before a bounded recovered mutation attempt. */
  onPreHandlerUnauthorized?(): void
}

export interface ApiTransportRequest {
  auth: AuthConfig
  baseUrl: string
  data?: Record<string, any>
  accountId?: string
  abortSignal?: AbortSignal
  /** Maximum dispatched request duration; limiter queue time is excluded. */
  requestTimeoutMs?: number
  /** Shared process-local deadline for one higher-level account operation. */
  abortDeadline?: DeferredAbortDeadline
  cookieAuthSessionCookie?: string
  fetchContext?: ApiTransportFetchContext
  /** Controls whether a failed current-tab dispatch may fall back to extension fetch. */
  currentTabFallback?: ApiTransportCurrentTabFallbackMode
  /** Originating extension surface for temporary-window presentation policy. */
  tempWindowRequestSource?: TempWindowRequestSource
  /** Invocation intent for protected temporary-context work. */
  protectionBypassExecution?: ProtectionBypassExecution
  /** Force the request through the protected temporary context from the start. */
  forceTempWindow?: boolean
  /** Skip the generic per-site limiter when the caller already applies a narrower limiter. */
  bypassSiteRequestLimit?: boolean
  /** Process-local lifecycle evidence; callbacks must never cross extension messaging. */
  observer?: ApiTransportRequestObserver
}

export type ApiServiceRequest = ApiTransportRequest

export interface FetchApiOptions {
  endpoint: string
  options?: RequestInit
  responseType?: TempWindowResponseType
  tempWindowFallback?: TempWindowFallbackAllowlist
  currentTabTransport?: "prefer" | "disabled"
  authTokenMode?: ApiAuthTokenMode
  /** Process-local provider decoder; it never crosses extension messaging. */
  errorResponseDecoder?: ApiResponseErrorDecoder
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
