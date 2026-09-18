import type { RequestScheduling } from "~/services/apiTransport/requestScheduling"
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
  scheduling?: RequestScheduling
}

type SiteRequestLease<T> = {
  /** Caller-facing result, which may settle before the underlying work. */
  result: Promise<T>
  /** Underlying completion that owns the acquired concurrency slot. */
  completion: Promise<unknown>
}

type SiteLimiterState = {
  foregroundStreak: number
  activeCount: number
  activeBackgroundCount: number
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

// Reserve one dispatch for waiting background work after five foreground requests.
const MAX_FOREGROUND_STREAK = 5

// Keep one token and one concurrency slot out of reach of queued background work
// whenever foreground work is waiting, so user actions never lose a dispatch to
// an automatic scan. Both reserves fall away once no foreground work is queued.
const FOREGROUND_RESERVED_TOKENS = 1

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
 * Creates a per-site priority token-bucket limiter with FIFO within each lane. Each lease retains its
 * concurrency slot until completion, even if its caller result settles first.
 *
 * Queued foreground work keeps one token and one concurrency slot out of reach of background work for
 * as long as it waits, so an automatic scan cannot make a user action wait for a later dispatch.
 *
 * Defaults are chosen to stay below New API's dashboard/web default of
 * 60 requests / 180 seconds while still allowing a small local burst.
 */
export function createSiteRequestLeaseLimiter(
  config: SiteRequestLimiterConfig,
) {
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
  // A bucket that holds a single token has no spare capacity to reserve.
  const foregroundTokenReserve = capacity > 1 ? FOREGROUND_RESERVED_TOKENS : 0
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
      _scheduling?: RequestScheduling,
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
        foregroundStreak: 0,
        activeCount: 0,
        activeBackgroundCount: 0,
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

      // Waiting foreground work jumps the declared queue order, and keeps one
      // token and one concurrency slot out of reach of a background turn, so an
      // automatic scan can never turn a user action into a delayed request.
      const foregroundIndex = state.queue.findIndex(
        (item) => item.scheduling?.priority !== "background",
      )
      const hasForegroundWork = foregroundIndex >= 0
      if (foregroundIndex > 0) {
        state.queue.unshift(state.queue.splice(foregroundIndex, 1)[0])
      }

      const backgroundIndex = state.queue.findIndex(
        (item) => item.scheduling?.priority === "background",
      )
      const backgroundTakesTurn =
        hasForegroundWork &&
        backgroundIndex >= 0 &&
        state.foregroundStreak >= MAX_FOREGROUND_STREAK &&
        state.activeBackgroundCount < Math.max(1, maxConcurrentPerSite - 1)
      // A background turn spends reserve capacity, so waiting foreground work
      // takes the turn instead whenever that reserve is not actually available.
      const requiredTokens = backgroundTakesTurn
        ? foregroundTokenReserve + 1
        : 1
      const index =
        backgroundTakesTurn && state.tokens >= requiredTokens
          ? backgroundIndex
          : 0

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
      const [item] = state.queue.splice(index, 1)
      const isBackground = item.scheduling?.priority === "background"
      state.foregroundStreak =
        isBackground || backgroundIndex < 0 ? 0 : state.foregroundStreak + 1
      detachAbortListener(item)

      state.tokens -= 1
      state.activeCount += 1
      if (isBackground) state.activeBackgroundCount += 1
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
          if (isBackground) state.activeBackgroundCount -= 1
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
    scheduling?: RequestScheduling,
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
        scheduling,
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

const productionSiteRequestLeaseLimiter = createSiteRequestLeaseLimiter({
  ...SITE_API_REQUEST_LIMITS,
  enabled: !isTestMode(),
})

/**
 * Runs a request through the limiter while retaining its slot until the
 * supplied underlying completion settles.
 */
export async function withSiteApiRequestLease<T>(
  key: string,
  task: () => SiteRequestLease<T>,
  signal?: AbortSignal,
  scheduling?: RequestScheduling,
): Promise<T> {
  return await productionSiteRequestLeaseLimiter(key, task, signal, scheduling)
}
