/**
 * Promise timeout utilities.
 *
 * Browser extension APIs (especially in MV3 service workers) can occasionally
 * return Promises that never settle (neither resolve nor reject), typically
 * around permission changes or early startup race conditions.
 *
 * These helpers keep the app responsive by turning "hung" Promises into
 * deterministic failures that callers can handle and retry.
 */

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TimeoutError"
  }
}

/**
 * Returns a Promise that resolves after the specified delay in milliseconds.
 * @param ms Number of milliseconds to sleep.
 */
export function sleep(ms: number): Promise<void> {
  const delay = Number.isFinite(ms) ? Math.max(0, ms) : 0
  return new Promise((resolve) => setTimeout(resolve, delay))
}

/**
 * Resolves/rejects with the supplied promise, but rejects with {@link TimeoutError}
 * if it does not settle within `timeoutMs`.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  options: { timeoutMs: number; label?: string },
): Promise<T> {
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(0, options.timeoutMs)
    : 0
  const label = options.label ?? "Operation"

  if (timeoutMs <= 0) {
    return promise
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}
