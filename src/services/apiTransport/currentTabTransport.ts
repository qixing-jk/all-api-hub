import { RuntimeActionIds } from "~/constants/runtimeActions"
import type { SiteType } from "~/constants/siteType"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  isReplaySafeRemoteFetch,
  observeRemoteFetchLifecycle,
} from "~/services/apiTransport/remoteLifecycle"
import type {
  ApiResponse,
  ApiTransportFetchContext,
  ApiTransportRequest,
  ApiTransportResponse,
  FetchApiOptions,
} from "~/services/apiTransport/type"
import {
  API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
} from "~/services/apiTransport/type"
import type {
  TempWindowFetch,
  TempWindowResponseType,
} from "~/types/tempWindowFetch"
import { normalizeRequestInitForMessage } from "~/utils/browser/requestInitMessage"
import {
  isMessageReceiverUnavailableError,
  sendTabMessageWithRetry,
} from "~/utils/browser/runtimeMessages"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { tryParseOrigin } from "~/utils/core/urlParsing"
import { t } from "~/utils/i18n/core"

type AcquiredTransportResponse<T> = ApiTransportResponse<T>
type TransportResponseMapper<T, TResult> = (
  response: AcquiredTransportResponse<T>,
) => TResult | Promise<TResult>
const logger = createLogger("ApiTransportRequest")

/** A reported local error belongs to the browser context that raised it. */
class CurrentTabLocalError extends ApiError {}

type ContentFetchResponse<T> = Partial<
  Pick<
    TempWindowFetch,
    "success" | "status" | "headers" | "error" | "code" | "localError"
  >
> & {
  data?: T
}

/** Copies the controlled message response fields before lifecycle disposal. */
function snapshotContentFetchResponse<T>(
  value: unknown,
): ContentFetchResponse<T> {
  if (!value || typeof value !== "object") return {}
  const response = value as ContentFetchResponse<T>
  return {
    success: response.success,
    status: response.status,
    headers: response.headers,
    data: response.data,
    error: response.error,
    code: response.code,
    localError: response.localError,
  }
}

/** Redacts the exact request credential before emitting transport diagnostics. */
function getSafeTransportErrorMessage(
  error: unknown,
  requestAccessToken: string | undefined,
): string {
  const message = getErrorMessage(error)
  if (!requestAccessToken?.trim()) return message
  return message.split(requestAccessToken).join("[REDACTED]")
}

type CurrentTabContext = Extract<
  ApiTransportFetchContext,
  { kind: typeof API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB }
>

/** Resolve the tab before any route can dispatch using a recovered browser credential. */
export function resolveCurrentTabFetchContext(params: {
  request: ApiTransportRequest
  url: string
  options: FetchApiOptions
}): CurrentTabContext | undefined {
  const fetchContext = params.request.fetchContext
  if (fetchContext?.kind !== API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB)
    return
  const responseType = params.options.responseType ?? "json"
  const tabOrigin = tryParseOrigin(fetchContext.origin)
  if (
    params.options.currentTabTransport !== "disabled" &&
    !params.request.cookieSession &&
    !Object.keys(params.request.requestHeaders ?? {}).length &&
    (responseType === "json" || responseType === "text") &&
    typeof fetchContext.tabId === "number" &&
    tabOrigin &&
    tabOrigin === tryParseOrigin(params.url)
  )
    return fetchContext
  if (
    params.request.currentTabFallback ===
    API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES.Forbid
  )
    throw new ApiError(
      t("messages:background.tempWindowPolicyContextInvalid"),
      undefined,
      params.options.endpoint,
      API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
    )
}

/**
 * Sends the prepared request through the matched tab's content script.
 */
async function fetchViaCurrentTabContent<T>(context: {
  siteType?: SiteType
  fetchContext: CurrentTabContext
  url: string
  endpoint: string
  fetchOptions: RequestInit
  operationSemantics?: FetchApiOptions["operationSemantics"]
  responseType: TempWindowResponseType
  onDispatch: () => void
  onResponse: () => void
  onResponseInspectionError: () => void
}): Promise<AcquiredTransportResponse<T>> {
  context.fetchOptions.signal?.throwIfAborted()
  const requestId = safeRandomUUID("current-tab-fetch")
  const lifecycle = observeRemoteFetchLifecycle(requestId, {
    onDispatch: context.onDispatch,
    onResponse: context.onResponse,
  })
  const replaySafe = isReplaySafeRemoteFetch(
    context.fetchOptions,
    context.operationSemantics,
  )
  const abortSignal = context.fetchOptions.signal
  let hasAffirmativePreDispatchEvidence = false
  const disposeLifecycle = () => lifecycle.dispose()
  const disposeAfterAbort = () => {
    if (!replaySafe && !hasAffirmativePreDispatchEvidence) {
      lifecycle.markPossiblyDispatched()
    }
    disposeLifecycle()
  }
  abortSignal?.addEventListener("abort", disposeAfterAbort, { once: true })

  try {
    let response: unknown
    try {
      response = await sendTabMessageWithRetry(
        context.fetchContext.tabId,
        {
          action: RuntimeActionIds.ContentPerformTempWindowFetch,
          ...(context.siteType ? { siteType: context.siteType } : {}),
          requestId,
          expectedOrigin: new URL(context.fetchContext.origin).origin,
          fetchUrl: context.url,
          fetchOptions: normalizeRequestInitForMessage(context.fetchOptions),
          responseType: context.responseType,
        },
        {
          retrySignal: abortSignal ?? undefined,
          onReceiverRetryWait: (waiting) => {
            hasAffirmativePreDispatchEvidence = waiting
          },
        },
      )
    } catch (error) {
      if (
        !replaySafe &&
        !hasAffirmativePreDispatchEvidence &&
        !isMessageReceiverUnavailableError(error)
      ) {
        lifecycle.markPossiblyDispatched()
      }
      throw error
    }
    let responseSnapshot: ContentFetchResponse<ApiResponse<T> | T>
    try {
      hasAffirmativePreDispatchEvidence =
        lifecycle.applyResultEvidence(response).affirmativePreDispatch
      responseSnapshot = snapshotContentFetchResponse<ApiResponse<T> | T>(
        response,
      )
      if (
        !replaySafe &&
        !(
          responseSnapshot.success === false &&
          hasAffirmativePreDispatchEvidence
        )
      ) {
        lifecycle.markPossiblyDispatched()
      }
    } catch (error) {
      if (!replaySafe && !hasAffirmativePreDispatchEvidence) {
        lifecycle.markPossiblyDispatched()
      }
      context.onResponseInspectionError()
      throw error
    }

    const success = responseSnapshot.success
    const failureMessage =
      responseSnapshot.error || "Current-tab content fetch failed"
    if (success === false && responseSnapshot.localError)
      throw new CurrentTabLocalError(
        failureMessage,
        responseSnapshot.localError.statusCode,
        context.endpoint,
        responseSnapshot.code,
        responseSnapshot.localError.upstreamCode,
      )

    if (typeof success !== "boolean") {
      throw new ApiError(
        failureMessage,
        responseSnapshot.status,
        context.endpoint,
        responseSnapshot.code,
      )
    }

    const status = responseSnapshot.status ?? (success ? 200 : undefined)
    if (status === undefined) {
      throw new ApiError(
        failureMessage,
        undefined,
        context.endpoint,
        responseSnapshot.code,
      )
    }

    return {
      ok: success,
      status,
      headers: responseSnapshot.headers ?? {},
      body: responseSnapshot.data as T,
    }
  } finally {
    abortSignal?.removeEventListener("abort", disposeAfterAbort)
    disposeLifecycle()
  }
}

/**
 * Runs current-tab content fetch first when eligible, then falls back normally.
 */
export async function executeWithCurrentTabContentPreference<T, TResult>(
  context: {
    request: ApiTransportRequest
    fetchContext: CurrentTabContext | undefined
    url: string
    endpoint: string
    fetchOptions: RequestInit
    responseType: TempWindowResponseType
    options: FetchApiOptions
    onDispatch: () => void
    onResponse: () => void
  },
  mapResponse: TransportResponseMapper<T, TResult>,
  fallback: () => Promise<TResult>,
): Promise<TResult> {
  const fetchContext = context.fetchContext
  if (!fetchContext) return await fallback()

  let response: AcquiredTransportResponse<T>
  let responseInspectionFailed = false
  let dispatched = false
  try {
    response = await fetchViaCurrentTabContent<T>({
      siteType: context.request.siteType,
      fetchContext,
      url: context.url,
      endpoint: context.endpoint,
      fetchOptions: context.fetchOptions,
      operationSemantics: context.options.operationSemantics,
      responseType: context.responseType,
      onDispatch: () => {
        dispatched = true
        context.onDispatch()
      },
      onResponse: context.onResponse,
      onResponseInspectionError: () => {
        responseInspectionFailed = true
      },
    })
  } catch (error) {
    const replaySafe = isReplaySafeRemoteFetch(
      context.fetchOptions,
      context.options.operationSemantics,
    )
    const mustNotFallback =
      context.request.currentTabFallback ===
        API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES.Forbid ||
      context.fetchOptions.signal?.aborted ||
      error instanceof CurrentTabLocalError ||
      responseInspectionFailed ||
      (dispatched && !replaySafe)
    logger.debug(
      mustNotFallback
        ? "Current-tab content fetch failed without a safe fallback"
        : "Current-tab content fetch failed; falling back",
      {
        endpoint: context.endpoint,
        url: context.url,
        error: getSafeTransportErrorMessage(
          error,
          context.request.auth.accessToken,
        ),
      },
    )
    if (mustNotFallback) throw error
    return await fallback()
  }

  // Mapping happens after transport acquisition so an HTTP/application error
  // cannot replay a request that the current tab already dispatched.
  return await mapResponse(response)
}
