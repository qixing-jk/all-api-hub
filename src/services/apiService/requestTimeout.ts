export interface TimedRequestSignalOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

interface TimedRequestSignalHandle {
  signal?: AbortSignal
  isTimedOut: () => boolean
  cleanup: () => void
}

/**
 * Builds a fetch signal only when a caller signal or explicit timeout is
 * provided. UI-owned cancellation should stay in the same extension context.
 */
export function buildTimedRequestSignal(
  options?: TimedRequestSignalOptions,
): TimedRequestSignalHandle {
  if (!options?.signal && options?.timeoutMs == null) {
    return {
      signal: undefined,
      isTimedOut: () => false,
      cleanup: () => {},
    }
  }

  const controller = new AbortController()
  const timeoutMs =
    options.timeoutMs == null
      ? null
      : Math.max(1, Math.floor(options.timeoutMs))
  let timedOut = false

  const relayCallerAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(options?.signal?.reason)
    }
  }

  const timeoutId =
    timeoutMs == null
      ? null
      : setTimeout(() => {
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
      if (timeoutId != null) {
        clearTimeout(timeoutId)
      }
      options?.signal?.removeEventListener("abort", relayCallerAbort)
    },
  }
}
