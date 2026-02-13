/**
 * Min-interval rate limiter (per key).
 *
 * Guarantees that calls using the same key are spaced by at least `minIntervalMs`
 * (based on wall-clock time at acquisition), while allowing different keys to
 * proceed independently.
 *
 * This is used to avoid burst traffic on upstream endpoints that may have strict
 * rate limits (e.g. log/usage pagination).
 */

/**
 *
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Create a limiter that enforces a minimum interval between acquisitions.
 * @param options.minIntervalMs Minimum interval in milliseconds (<= 0 disables).
 * @returns A function that resolves when the caller is allowed to proceed.
 */
export function createMinIntervalLimiter(options: {
  minIntervalMs: number
}): (key: string) => Promise<void> {
  const minIntervalMs = Math.max(0, Math.floor(options.minIntervalMs))

  const tailByKey = new Map<string, Promise<void>>()
  const nextAllowedAtByKey = new Map<string, number>()

  return async (key: string): Promise<void> => {
    if (!key || minIntervalMs <= 0) return

    const previous = tailByKey.get(key) ?? Promise.resolve()

    const current = previous
      .catch(() => {
        // Keep the queue alive even if a prior waiter somehow rejected.
      })
      .then(async () => {
        const now = Date.now()
        const nextAllowedAt = nextAllowedAtByKey.get(key) ?? 0
        const waitMs = nextAllowedAt - now

        if (waitMs > 0) {
          await sleep(waitMs)
        }

        nextAllowedAtByKey.set(key, Date.now() + minIntervalMs)
      })

    tailByKey.set(key, current)

    void current.finally(() => {
      if (tailByKey.get(key) === current) {
        tailByKey.delete(key)
      }
    })

    await current
  }
}
