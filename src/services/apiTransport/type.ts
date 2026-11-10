import type { AccountSiteType } from "~/constants/siteType"
import type { DeferredAbortDeadline } from "~/services/apiTransport/abortableTask"
import type { CookieRequestSession } from "~/services/apiTransport/headerOverrides"
import type { RequestScheduling } from "~/services/apiTransport/requestScheduling"
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
  /** True for local HTTP fallback copy that cannot establish a site rejection. */
  unattributedMessage?: boolean
}

/**
 * Interprets one provider response without performing disclosure or redaction.
 * Implementations must be total for unknown bodies and return null when the
 * response does not match their protocol, or mark a local HTTP fallback message
 * as unattributed.
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

/** Browser session partition shared by tab reads and temporary contexts. */
export type ApiTransportBrowserFetchContext = {
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
// Legacy alias still imported by src/ and tests/ during the transport migration.
// New code should use ApiTransportFetchContext directly.
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
  /**
   * An admitted read succeeded with this recovered Cookie. Generation is the
   * process-local recovery order, assigned before the retry starts.
   */
  onCookieRecovered?(cookie: string, generation: number): void
  /** Provider protocol confirmed one mutating request succeeded, before any follow-up. */
  onMutationAccepted?(): void
  /** Clears pre-handler evidence before a bounded recovered mutation attempt. */
  onPreHandlerUnauthorized?(): void
}

export const API_DIRECT_REQUEST_REASONS = {
  Passive: "passive",
  CallerManaged: "caller_managed",
  CredentialIsolation: "credential_isolation",
  ProviderProtocol: "provider_protocol",
} as const

export type ApiDirectRequestReason =
  (typeof API_DIRECT_REQUEST_REASONS)[keyof typeof API_DIRECT_REQUEST_REASONS]

/** Absence of invocation intent must be an explicit choice, never an omitted field. */
export type ApiTransportRecovery =
  | {
      protectionBypassExecution: ProtectionBypassExecution
      directRequestReason?: never
    }
  | {
      protectionBypassExecution?: undefined
      directRequestReason: ApiDirectRequestReason
    }

export const API_OPERATION_SEMANTICS = {
  Read: "read",
  Mutation: "mutation",
} as const

export type ApiOperationSemantics =
  (typeof API_OPERATION_SEMANTICS)[keyof typeof API_OPERATION_SEMANTICS]

export type ApiTransportRequest = ApiTransportRequestFields &
  ApiTransportRecovery

export interface ApiTransportRequestFields {
  /** Known account/managed site type used to select a client request budget. */
  siteType?: AccountSiteType
  /**
   * Second static credential for providers whose console splits capabilities
   * across credential classes (for example key management vs. billing).
   * Never a substitute for `auth.accessToken`.
   */
  aimlApiKey?: string
  /** Explicit private credentials: direct transport only, with no ambient Cookie fallback. */
  cookieSession?: CookieRequestSession
  /** Credential-owned headers applied last by the extension transport. */
  requestHeaders?: Record<string, string>
  requestScheduling?: RequestScheduling
  auth: AuthConfig
  baseUrl: string
  /** Management API address; `baseUrl` remains the browser session address. */
  managementApiBaseUrl?: string
  data?: Record<string, any>
  accountId?: string
  /** Explicit account operation admission; passive probes leave this unset. */
  allowAccountCredentialRecovery?: boolean
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
  /** Actual operation semantics can prohibit replay even for a GET endpoint. */
  operationSemantics?: ApiOperationSemantics
  options?: RequestInit
  responseType?: TempWindowResponseType
  tempWindowFallback?: TempWindowFallbackAllowlist
  currentTabTransport?: "prefer" | "disabled"
  authTokenMode?: ApiAuthTokenMode
  /** Process-local provider decoder; it never crosses extension messaging. */
  errorResponseDecoder?: ApiResponseErrorDecoder
}

export interface OpenAIAuthParams {
  requestHeaders?: Record<string, string>
  requestScheduling?: RequestScheduling
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
