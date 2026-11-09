import {
  composeAbortSignals,
  startAbortableTask,
} from "~/services/apiTransport/abortableTask"
import { fetchWithHeaderOverrides } from "~/services/apiTransport/headerOverrides"
import {
  reportSiteRateLimit,
  resolveSiteRequestLimitKey,
  withSiteApiRequestLease,
} from "~/services/apiTransport/siteRequestLimiter"
import type {
  ApiTransportRequest,
  ApiTransportRequestObserver,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { createLogger } from "~/utils/core/logger"

/** Execution controls shared by protocol-specific request preparation. */
type RequestExecutionControls = Pick<
  ApiTransportRequest,
  | "siteType"
  | "baseUrl"
  | "abortSignal"
  | "abortDeadline"
  | "requestTimeoutMs"
  | "requestScheduling"
  | "bypassSiteRequestLimit"
  | "observer"
  | "requestHeaders"
  | "cookieSession"
>

interface PreparedHttpRequest {
  url: string
  options: RequestInit
}

interface PreparedRequestExecution {
  options: RequestInit
  dispatch: () => Promise<Response>
  onDispatch: () => void
  onResponse: () => void
  onRateLimit: (retryAfter?: string) => void
}

const logger = createLogger("ApiTransportRequest")

/** Keeps optional lifecycle evidence isolated from transport results. */
export function notifyApiTransportObserver(
  observer: ApiTransportRequestObserver | undefined,
  ...notification:
    | [event: Exclude<keyof ApiTransportRequestObserver, "onCookieRecovered">]
    | [event: "onCookieRecovered", cookie: string, generation: number]
): void {
  try {
    if (notification[0] === "onCookieRecovered")
      observer?.onCookieRecovered?.(notification[1], notification[2])
    else observer?.[notification[0]]?.()
  } catch {
    logger.warn("API transport observer callback failed", {
      event: notification[0],
    })
  }
}

/**
 * Executes prepared HTTP work under one cancellable site-limiter lease.
 * The runner owns response consumption and any explicitly selected browser
 * transport. Its completion retains the slot even after the caller times out.
 */
export async function executePreparedRequest<T>(
  request: RequestExecutionControls,
  prepared: PreparedHttpRequest,
  run: (execution: PreparedRequestExecution) => Promise<T>,
): Promise<T> {
  const abortSignal = prepared.options.signal ?? request.abortSignal
  const signals = [abortSignal, request.abortDeadline?.signal]
  const startRequest = () => {
    let taskFailure: { error: unknown } | undefined
    const execution = startAbortableTask(
      async (signal) => {
        try {
          request.abortDeadline?.start()
          let dispatchObserved = false
          const onDispatch = () => {
            if (dispatchObserved) return
            dispatchObserved = true
            notifyApiTransportObserver(request.observer, "onDispatch")
          }
          let responseObserved = false
          const onResponse = () => {
            if (responseObserved) return
            responseObserved = true
            notifyApiTransportObserver(request.observer, "onResponse")
          }
          let rateLimitObserved = false
          const onRateLimit = (retryAfter?: string) => {
            if (rateLimitObserved) return
            rateLimitObserved = true
            reportSiteRateLimit(
              resolveSiteRequestLimitKey(prepared.url),
              retryAfter,
            )
          }
          const options = { ...prepared.options, signal }

          return await run({
            options,
            dispatch: async () => {
              const response = await fetchWithHeaderOverrides(
                prepared.url,
                options,
                request.requestHeaders,
                { cookieSession: request.cookieSession, onDispatch },
              )
              onResponse()
              if (response.status === 429)
                onRateLimit(response.headers.get("retry-after") ?? undefined)
              return response
            },
            onDispatch,
            onResponse,
            onRateLimit,
          })
        } catch (error) {
          taskFailure = { error }
          throw error
        }
      },
      {
        signals,
        timeoutMs: request.abortDeadline ? undefined : request.requestTimeoutMs,
      },
    )

    return {
      ...execution,
      result: execution.result.catch((error) => {
        // A response getter can abort and then throw a more specific inspection
        // error before the abort race callback runs. Preserve that failure.
        if (taskFailure) throw taskFailure.error
        throw error
      }),
    }
  }

  if (request.bypassSiteRequestLimit) return await startRequest().result

  const admissionAbort = composeAbortSignals(signals)
  try {
    return await withSiteApiRequestLease(
      resolveSiteRequestLimitKey(prepared.url),
      startRequest,
      admissionAbort.signal,
      request.requestScheduling,
      request.siteType,
    )
  } finally {
    admissionAbort.dispose()
  }
}

/**
 * Reads a prepared direct request as JSON without adding headers or replaying
 * it in a browser context. Undecodable bodies become null so the adapter can
 * classify HTTP failures before validating its own successful response shape.
 */
export async function fetchPreparedJsonResponse(
  request: RequestExecutionControls,
  prepared: PreparedHttpRequest,
): Promise<ApiTransportResponse> {
  return await executePreparedRequest(
    request,
    prepared,
    async ({ dispatch }) => {
      const response = await dispatch()
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = null
      }

      return {
        ok: response.ok,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
      }
    },
  )
}
