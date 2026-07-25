type AbortableTaskOptions = {
  signals?: readonly (AbortSignal | undefined)[]
  timeoutMs?: number
}

const getAbortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("The operation was aborted", "AbortError")

const isPositiveFiniteTimeout = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0

const createTimeoutError = (timeoutMs: number): DOMException =>
  new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError")

/**
 * Runs work with composed cancellation and an optional timeout that starts at
 * invocation time. The abort race also settles when the work ignores signals.
 */
export async function runAbortableTask<T>(
  task: (signal?: AbortSignal) => Promise<T>,
  options: AbortableTaskOptions = {},
): Promise<T> {
  const sourceSignals = Array.from(
    new Set(
      (options.signals ?? []).filter(
        (signal): signal is AbortSignal => signal !== undefined,
      ),
    ),
  )

  for (const signal of sourceSignals) {
    if (signal.aborted) throw getAbortReason(signal)
  }

  const timeoutMs = isPositiveFiniteTimeout(options.timeoutMs)
    ? options.timeoutMs
    : undefined

  if (sourceSignals.length === 0 && timeoutMs === undefined) {
    return await task(undefined)
  }

  const controller =
    timeoutMs !== undefined || sourceSignals.length > 1
      ? new AbortController()
      : undefined
  const effectiveSignal = controller?.signal ?? sourceSignals[0]
  const cleanups: Array<() => void> = []

  if (controller) {
    for (const sourceSignal of sourceSignals) {
      const relayAbort = () => {
        if (!controller.signal.aborted) {
          controller.abort(getAbortReason(sourceSignal))
        }
      }

      sourceSignal.addEventListener("abort", relayAbort, { once: true })
      cleanups.push(() => {
        sourceSignal.removeEventListener("abort", relayAbort)
      })

      if (sourceSignal.aborted) {
        relayAbort()
        break
      }
    }
  }

  const timeoutId =
    timeoutMs !== undefined
      ? setTimeout(() => {
          controller?.abort(createTimeoutError(timeoutMs))
        }, timeoutMs)
      : undefined

  let rejectOnAbort!: () => void
  const abortPromise = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = () => reject(getAbortReason(effectiveSignal))
    effectiveSignal.addEventListener("abort", rejectOnAbort, { once: true })
    if (effectiveSignal.aborted) rejectOnAbort()
  })
  const taskPromise = Promise.resolve().then(() => {
    if (effectiveSignal.aborted) throw getAbortReason(effectiveSignal)
    return task(effectiveSignal)
  })

  try {
    return await Promise.race([taskPromise, abortPromise])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    effectiveSignal.removeEventListener("abort", rejectOnAbort)
    cleanups.forEach((cleanup) => cleanup())
  }
}
