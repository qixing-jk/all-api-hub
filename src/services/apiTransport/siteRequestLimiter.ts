import { isTestMode } from "~/utils/core/environment"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

type SiteRequestLimiterConfig = {
  enabled?: boolean
  maxConcurrentPerSite: number
  requestsPerMinute: number
  burst: number
}

type QueueItem = {
  task: () => SiteRequestLease<unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  signal?: AbortSignal
  abortListener?: () => void
}

type SiteRequestLease<T> = {
  /** Caller-facing result, which may settle before the underlying work. */
  result: Promise<T>
  /** Underlying completion that owns the acquired concurrency slot. */
  completion: Promise<unknown>
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

/** Resolves the canonical site origin used by process-local request limiting. */
export function resolveSiteRequestLimitKey(baseUrl: string): string {
  return normalizeUrlForOriginKey(baseUrl, {
    lowerCase: true,
    stripTrailingSlashes: true,
  })
}

const getAbortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException("The operation was aborted", "AbortError")

const detachAbortListener = (item: QueueItem): void => {
  if (!item.signal || !item.abortListener) return

  item.signal.removeEventListener("abort", item.abortListener)
  item.abortListener = undefined
}

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
function createSiteRequestLeaseLimiterCore(config: SiteRequestLimiterConfig) {
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

  const runWithoutLimit = async <T>(
    task: () => SiteRequestLease<T>,
  ): Promise<T> => {
    const lease = task()
    void Promise.resolve(lease.completion).catch(() => undefined)
    return await lease.result
  }

  if (!enabled || requestsPerMinute <= 0) {
    return async <T>(
      _key: string,
      task: () => SiteRequestLease<T>,
      signal?: AbortSignal,
    ): Promise<T> => {
      if (signal?.aborted) throw getAbortReason(signal)
      return await runWithoutLimit(task)
    }
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

      // Abort dispatch is synchronous: queued handlers remove their item before
      // this turn, and this turn detaches the handler before starting the task.
      const item = state.queue.shift()!
      detachAbortListener(item)

      state.tokens -= 1
      state.activeCount += 1
      void Promise.resolve()
        .then(item.task)
        .then((lease) => {
          void lease.result.then(item.resolve, item.reject)
          return Promise.resolve(lease.completion).then(
            () => undefined,
            () => undefined,
          )
        }, item.reject)
        .finally(() => {
          state.activeCount -= 1
          schedule(key, state)
          scheduleCleanup(key, state)
        })
    }

    scheduleCleanup(key, state)
  }

  return async <T>(
    key: string,
    task: () => SiteRequestLease<T>,
    signal?: AbortSignal,
  ): Promise<T> => {
    if (signal?.aborted) throw getAbortReason(signal)
    if (!key) return await runWithoutLimit(task)

    const state = getState(key)

    return await new Promise<T>((resolve, reject) => {
      const item: QueueItem = {
        task: () => task() as SiteRequestLease<unknown>,
        resolve: (value) => resolve(value as T),
        reject,
        signal,
      }

      if (signal) {
        item.abortListener = () => {
          const queueIndex = state.queue.indexOf(item)
          if (queueIndex < 0) return

          state.queue.splice(queueIndex, 1)
          detachAbortListener(item)
          reject(getAbortReason(signal))
          schedule(key, state)
        }
        signal.addEventListener("abort", item.abortListener, { once: true })
      }

      state.queue.push(item)
      schedule(key, state)
    })
  }
}

/**
 * Creates a limiter whose caller result and slot-owning completion may settle
 * independently.
 */
export function createSiteRequestLeaseLimiter(
  config: SiteRequestLimiterConfig,
) {
  return createSiteRequestLeaseLimiterCore(config)
}

const wrapLeaseLimiterForTasks =
  (limiter: ReturnType<typeof createSiteRequestLeaseLimiterCore>) =>
  async <T>(
    key: string,
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> =>
    await limiter(
      key,
      () => {
        let result: Promise<T>
        try {
          result = Promise.resolve(task())
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
      },
      signal,
    )

/** Creates a limiter that retains its slot until each task promise settles. */
export function createSiteRequestLimiter(config: SiteRequestLimiterConfig) {
  return wrapLeaseLimiterForTasks(createSiteRequestLeaseLimiterCore(config))
}

const productionSiteRequestLeaseLimiter = createSiteRequestLeaseLimiterCore({
  ...SITE_API_REQUEST_LIMITS,
  enabled: !isTestMode(),
})
const productionSiteRequestLimiter = wrapLeaseLimiterForTasks(
  productionSiteRequestLeaseLimiter,
)

/**
 * Runs a site API request through the process-local per-site limiter.
 */
export async function withSiteApiRequestLimit<T>(
  key: string,
  task: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return await productionSiteRequestLimiter(key, task, signal)
}

/**
 * Runs a request through the limiter while retaining its slot until the
 * supplied underlying completion settles.
 */
export async function withSiteApiRequestLease<T>(
  key: string,
  task: () => SiteRequestLease<T>,
  signal?: AbortSignal,
): Promise<T> {
  return await productionSiteRequestLeaseLimiter(key, task, signal)
}
