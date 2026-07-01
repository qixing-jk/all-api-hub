export interface TimedRequestSignalOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

interface TimedRequestSignalHandle {
  signal: AbortSignal
  isTimedOut: () => boolean
  cleanup: () => void
}

/**
 * Builds a fetch signal that always has a bounded timeout and can still relay a
 * caller-provided abort signal.
 */
export function buildTimedRequestSignal(
  options?: TimedRequestSignalOptions,
): TimedRequestSignalHandle {
  const controller = new AbortController()
  const timeoutMs = Math.max(
    1,
    Math.floor(options?.timeoutMs ?? DEFAULT_API_SERVICE_REQUEST_TIMEOUT_MS),
  )
  let timedOut = false

  const relayCallerAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(options?.signal?.reason)
    }
  }

  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort(
      new DOMException(
        `Request timed out after ${timeoutMs}ms`,
        "TimeoutError",
      ),
    )
  }, timeoutMs)

  if (options?.signal?.aborted) {
    relayCallerAbort()
  } else {
    options?.signal?.addEventListener("abort", relayCallerAbort, {
      once: true,
    })
  }

  return {
    signal: controller.signal,
    isTimedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timeoutId)
      options?.signal?.removeEventListener("abort", relayCallerAbort)
    },
  }
}
