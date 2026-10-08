import { RuntimeActionIds } from "~/constants/runtimeActions"
import { ApiError, type ApiErrorCode } from "~/services/apiTransport/errors"
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
import type { TempWindowResponseType } from "~/types/tempWindowFetch"
import { normalizeRequestInitForMessage } from "~/utils/browser/requestInitMessage"
import {
  isMessageReceiverUnavailableError,
  sendTabMessageWithRetry,
} from "~/utils/browser/runtimeMessages"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"

type AcquiredTransportResponse<T> = ApiTransportResponse<T>
type TransportResponseMapper<T, TResult> = (
  response: AcquiredTransportResponse<T>,
) => TResult | Promise<TResult>
const logger = createLogger("ApiTransportRequest")

interface ContentFetchResponse<T> {
  success?: boolean
  status?: number
  headers?: Record<string, string>
  data?: T
  error?: string
  code?: ApiErrorCode
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

/**
 * Checks whether a request can safely prefer the matched current tab transport.
 */
function isCurrentTabContentFetchEligible(params: {
  request: ApiTransportRequest
  url: string
  options: FetchApiOptions
}): boolean {
  if (params.options.currentTabTransport === "disabled") return false
  const responseType = params.options.responseType ?? "json"
  if (responseType !== "json" && responseType !== "text") return false

  const fetchContext = params.request.fetchContext
  if (fetchContext?.kind !== API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB)
    return false
  if (typeof fetchContext.tabId !== "number") return false

  try {
    const requestOrigin = new URL(params.url).origin
    const contextOrigin = new URL(fetchContext.origin).origin
    return requestOrigin === contextOrigin
  } catch {
    return false
  }
}

/**
 * Sends the prepared request through the matched tab's content script.
 */
async function fetchViaCurrentTabContent<T>(context: {
  fetchContext: Extract<
    ApiTransportFetchContext,
    { kind: typeof API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB }
  >
  url: string
  endpoint: string
  fetchOptions: RequestInit
  responseType: TempWindowResponseType
  onDispatch: () => void
  onResponse: () => void
  onResponseInspectionError: () => void
}): Promise<AcquiredTransportResponse<T>> {
  const requestId = safeRandomUUID("current-tab-fetch")
  const lifecycle = observeRemoteFetchLifecycle(requestId, {
    onDispatch: context.onDispatch,
    onResponse: context.onResponse,
  })
  const replaySafe = isReplaySafeRemoteFetch(context.fetchOptions)
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
      response = await sendTabMessageWithRetry(context.fetchContext.tabId, {
        action: RuntimeActionIds.ContentPerformTempWindowFetch,
        requestId,
        expectedOrigin: new URL(context.fetchContext.origin).origin,
        fetchUrl: context.url,
        fetchOptions: normalizeRequestInitForMessage(context.fetchOptions),
        responseType: context.responseType,
      })
    } catch (error) {
      if (!replaySafe && !isMessageReceiverUnavailableError(error)) {
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
    if (typeof success !== "boolean") {
      throw new ApiError(
        responseSnapshot.error || "Current-tab content fetch failed",
        responseSnapshot.status,
        context.endpoint,
        responseSnapshot.code,
      )
    }

    const status = responseSnapshot.status ?? (success ? 200 : undefined)
    if (status === undefined) {
      throw new ApiError(
        responseSnapshot.error || "Current-tab content fetch failed",
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
  if (
    !isCurrentTabContentFetchEligible({
      request: context.request,
      url: context.url,
      options: context.options,
    })
  ) {
    return await fallback()
  }

  const fetchContext = context.request.fetchContext as Extract<
    ApiTransportFetchContext,
    { kind: typeof API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB }
  >

  let response: AcquiredTransportResponse<T>
  let responseInspectionFailed = false
  let dispatched = false
  try {
    response = await fetchViaCurrentTabContent<T>({
      fetchContext,
      url: context.url,
      endpoint: context.endpoint,
      fetchOptions: context.fetchOptions,
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
    const replaySafe = isReplaySafeRemoteFetch(context.fetchOptions)
    const mustNotFallback =
      context.request.currentTabFallback ===
        API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES.Forbid ||
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
