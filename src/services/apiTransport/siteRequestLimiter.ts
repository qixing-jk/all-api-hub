type SiteRequestLimiterConfig = {
  enabled?: boolean
  maxConcurrentPerSite: number
  requestsPerMinute: number
  burst: number
}

type QueueItem = {
  task: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

type SiteLimiterState = {
  activeCount: number
  tokens: number
  lastRefillAt: number
  queue: QueueItem[]
  timer: ReturnType<typeof setTimeout> | undefined
  cleanupTimer: ReturnType<typeof setTimeout> | undefined
}

const SITE_API_REQUEST_LIMITS = {
  maxConcurrentPerSite: 2,
  requestsPerMinute: 18,
  burst: 4,
} as const satisfies SiteRequestLimiterConfig

const IDLE_STATE_TTL_MS = 5 * 60 * 1000

/**
 * Resolve a numeric limiter config field and reject NaN/Infinity early.
 */
function resolveFiniteNumber(
  config: SiteRequestLimiterConfig,
  field: keyof Pick<
    SiteRequestLimiterConfig,
    "maxConcurrentPerSite" | "requestsPerMinute" | "burst"
  >,
): number {
  const value = Number(config[field])
  if (!Number.isFinite(value)) {
    throw new TypeError(`Site request limiter ${field} must be a finite number`)
  }
  return value
}

/**
 * Resolve a limiter field that must create at least one slot/token.
 */
function resolvePositiveInteger(
  config: SiteRequestLimiterConfig,
  field: keyof Pick<SiteRequestLimiterConfig, "maxConcurrentPerSite" | "burst">,
): number {
  const value = resolveFiniteNumber(config, field)
  if (value < 1) {
    throw new TypeError(`Site request limiter ${field} must be >= 1`)
  }
  return Math.floor(value)
}

/**
 * Resolve a limiter rate field where zero disables queued throttling.
 */
function resolveNonNegativeNumber(
  config: SiteRequestLimiterConfig,
  field: keyof Pick<SiteRequestLimiterConfig, "requestsPerMinute">,
): number {
  const value = resolveFiniteNumber(config, field)
  if (value < 0) {
    throw new TypeError(`Site request limiter ${field} must be >= 0`)
  }
  return value
}

/**
 * Creates a per-site FIFO token-bucket limiter.
 *
 * Defaults are chosen to stay below New API's dashboard/web default of
 * 60 requests / 180 seconds while still allowing a small local burst.
 */
export function createSiteRequestLimiter(config: SiteRequestLimiterConfig) {
  const enabled = config.enabled !== false
  const maxConcurrentPerSite = resolvePositiveInteger(
    config,
    "maxConcurrentPerSite",
  )
  const capacity = resolvePositiveInteger(config, "burst")
  const requestsPerMinute = resolveNonNegativeNumber(
    config,
    "requestsPerMinute",
  )
  const refillRatePerMs = requestsPerMinute / 60_000
  const states = new Map<string, SiteLimiterState>()

  if (!enabled || requestsPerMinute <= 0) {
    return async <T>(_key: string, task: () => Promise<T>): Promise<T> =>
      await task()
  }

  const refillTokens = (state: SiteLimiterState) => {
    const now = Date.now()
    const elapsedMs = Math.max(0, now - state.lastRefillAt)
    if (elapsedMs <= 0) return

    state.tokens = Math.min(
      capacity,
      state.tokens + elapsedMs * refillRatePerMs,
    )
    state.lastRefillAt = now
  }

  const getState = (key: string) => {
    let state = states.get(key)
    if (!state) {
      state = {
        activeCount: 0,
        tokens: capacity,
        lastRefillAt: Date.now(),
        queue: [],
        timer: undefined,
        cleanupTimer: undefined,
      }
      states.set(key, state)
      return state
    }

    if (state.cleanupTimer) {
      clearTimeout(state.cleanupTimer)
      state.cleanupTimer = undefined
    }

    return state
  }

  const scheduleCleanup = (key: string, state: SiteLimiterState) => {
    if (state.activeCount > 0 || state.queue.length > 0 || state.timer) return
    if (state.cleanupTimer) return

    state.cleanupTimer = setTimeout(() => {
      if (
        state.activeCount === 0 &&
        state.queue.length === 0 &&
        !state.timer &&
        states.get(key) === state
      ) {
        states.delete(key)
      }
    }, IDLE_STATE_TTL_MS)
  }

  const schedule = (key: string, state: SiteLimiterState): void => {
    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = undefined
    }

    while (state.activeCount < maxConcurrentPerSite && state.queue.length > 0) {
      refillTokens(state)

      if (state.tokens < 1) {
        const waitMs = Math.max(
          1,
          Math.ceil((1 - state.tokens) / refillRatePerMs),
        )
        state.timer = setTimeout(() => {
          state.timer = undefined
          schedule(key, state)
        }, waitMs)
        return
      }

      state.tokens -= 1
      const item = state.queue.shift()
      if (!item) continue

      state.activeCount += 1
      void Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          state.activeCount -= 1
          schedule(key, state)
          scheduleCleanup(key, state)
        })
    }

    scheduleCleanup(key, state)
  }

  return async <T>(key: string, task: () => Promise<T>): Promise<T> => {
    if (!key) return await task()

    const state = getState(key)

    return await new Promise<T>((resolve, reject) => {
      state.queue.push({
        task: async () => await task(),
        resolve: (value) => resolve(value as T),
        reject,
      })
      schedule(key, state)
    })
  }
}

const productionSiteRequestLimiter = createSiteRequestLimiter({
  ...SITE_API_REQUEST_LIMITS,
  enabled: import.meta.env.MODE !== "test",
})

/**
 * Runs a site API request through the process-local per-site limiter.
 */
export async function withSiteApiRequestLimit<T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  return await productionSiteRequestLimiter(key, task)
}
