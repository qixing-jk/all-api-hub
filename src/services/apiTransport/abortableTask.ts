type AbortableTaskOptions = {
  signals?: readonly (AbortSignal | undefined)[]
  timeoutMs?: number
}

type AbortableTaskExecution<T> = {
  /** Settles when the caller should observe success, cancellation, or timeout. */
  result: Promise<T>
  /** Settles only after the original task promise has actually finished. */
  completion: Promise<void>
}

export type DeferredAbortDeadline = {
  signal: AbortSignal
  start: () => void
  dispose: () => void
}

type ComposedAbortSignal = {
  signal?: AbortSignal
  dispose: () => void
}

const getAbortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("The operation was aborted", "AbortError")

const isPositiveFiniteTimeout = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0

const createTimeoutError = (timeoutMs: number): DOMException =>
  new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError")

/**
 * Combines cancellation sources for queue admission without starting any
 * deferred deadline. Call dispose once admission has settled.
 */
export function composeAbortSignals(
  signals: readonly (AbortSignal | undefined)[],
): ComposedAbortSignal {
  const sourceSignals = Array.from(
    new Set(
      signals.filter((signal): signal is AbortSignal => signal !== undefined),
    ),
  )

  if (sourceSignals.length === 0) {
    return { signal: undefined, dispose: () => {} }
  }

  if (sourceSignals.length === 1) {
    return { signal: sourceSignals[0], dispose: () => {} }
  }

  const controller = new AbortController()
  const cleanups: Array<() => void> = []

  for (const sourceSignal of sourceSignals) {
    const relayAbort = () => {
      if (!controller.signal.aborted) {
        controller.abort(getAbortReason(sourceSignal))
      }
    }

    if (sourceSignal.aborted) {
      relayAbort()
      break
    }

    sourceSignal.addEventListener("abort", relayAbort, { once: true })
    cleanups.push(() => {
      sourceSignal.removeEventListener("abort", relayAbort)
    })
  }

  return {
    signal: controller.signal,
    dispose: () => {
      cleanups.forEach((cleanup) => cleanup())
    },
  }
}

/**
 * Creates a timeout signal whose clock starts on the first dispatch.
 */
export function createDeferredAbortDeadline(
  timeoutMs: number | undefined,
): DeferredAbortDeadline {
  const controller = new AbortController()
  const resolvedTimeoutMs = isPositiveFiniteTimeout(timeoutMs)
    ? timeoutMs
    : undefined
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let started = false
  let disposed = false

  return {
    signal: controller.signal,
    start: () => {
      if (started || disposed) return
      started = true
      if (resolvedTimeoutMs === undefined) return

      timeoutId = setTimeout(() => {
        timeoutId = undefined
        controller.abort(createTimeoutError(resolvedTimeoutMs))
      }, resolvedTimeoutMs)
    },
    dispose: () => {
      disposed = true
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }
    },
  }
}

/**
 * Runs work with composed cancellation and an optional timeout that starts at
 * invocation time. The abort race also settles when the work ignores signals.
 */
export function startAbortableTask<T>(
  task: (signal?: AbortSignal) => Promise<T>,
  options: AbortableTaskOptions = {},
): AbortableTaskExecution<T> {
  const sourceSignals = Array.from(
    new Set(
      (options.signals ?? []).filter(
        (signal): signal is AbortSignal => signal !== undefined,
      ),
    ),
  )

  for (const signal of sourceSignals) {
    if (signal.aborted) {
      const result = Promise.reject<T>(getAbortReason(signal))
      return {
        result,
        completion: result.then(
          () => undefined,
          () => undefined,
        ),
      }
    }
  }

  const timeoutMs = isPositiveFiniteTimeout(options.timeoutMs)
    ? options.timeoutMs
    : undefined

  if (sourceSignals.length === 0 && timeoutMs === undefined) {
    let result: Promise<T>
    try {
      result = Promise.resolve(task(undefined))
    } catch (error) {
      result = Promise.reject(error)
    }
    return {
      result,
      completion: result.then(
        () => undefined,
        () => undefined,
      ),
    }
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

  const result = Promise.race([taskPromise, abortPromise]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    effectiveSignal.removeEventListener("abort", rejectOnAbort)
    cleanups.forEach((cleanup) => cleanup())
  })

  return {
    result,
    completion: taskPromise.then(
      () => undefined,
      () => undefined,
    ),
  }
}

/**
 * Runs work with composed cancellation and an optional timeout that starts at
 * invocation time. The abort race also settles when the work ignores signals.
 */
export async function runAbortableTask<T>(
  task: (signal?: AbortSignal) => Promise<T>,
  options: AbortableTaskOptions = {},
): Promise<T> {
  return await startAbortableTask(task, options).result
}
