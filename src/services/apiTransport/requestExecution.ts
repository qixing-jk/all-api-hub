import {
  composeAbortSignals,
  startAbortableTask,
} from "~/services/apiTransport/abortableTask"
import {
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
  | "baseUrl"
  | "abortSignal"
  | "abortDeadline"
  | "requestTimeoutMs"
  | "requestScheduling"
  | "bypassSiteRequestLimit"
  | "observer"
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
  wasDispatched: () => boolean
}

const logger = createLogger("ApiTransportRequest")

/** Keeps optional lifecycle evidence isolated from transport results. */
export function notifyApiTransportObserver(
  observer: ApiTransportRequestObserver | undefined,
  event: keyof ApiTransportRequestObserver,
): void {
  try {
    observer?.[event]?.()
  } catch {
    logger.warn("API transport observer callback failed", { event })
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
          const options = { ...prepared.options, signal }

          return await run({
            options,
            dispatch: async () => {
              onDispatch()
              const response = await fetch(prepared.url, options)
              onResponse()
              return response
            },
            onDispatch,
            onResponse,
            wasDispatched: () => dispatchObserved,
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
      resolveSiteRequestLimitKey(request.baseUrl),
      startRequest,
      admissionAbort.signal,
      request.requestScheduling,
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
      let body: unknown = null
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
