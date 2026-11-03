import {
  getSiteRequestBudget,
  type SiteRequestBudget,
} from "~/services/accountSiteDefinitions/requestLimits"
import { REQUEST_SCHEDULING_PRIORITIES } from "~/services/apiTransport/requestScheduling"
import type { RequestScheduling } from "~/services/apiTransport/requestScheduling"
import { isTestMode } from "~/utils/core/environment"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

type SiteRequestLimiterConfig = {
  enabled?: boolean
  resolveBudget?: (siteType?: string) => SiteRequestBudget
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
  hasExplicitBudget: boolean
  pausedUntil: number
  backoffAttempts: number
  budget: SiteRequestBudget
  foregroundStreak: number
  activeCount: number
  activeBackgroundCount: number
  tokens: number
  lastRefillAt: number
  queue: QueueItem[]
  timer: ReturnType<typeof setTimeout> | undefined
  cleanupTimer: ReturnType<typeof setTimeout> | undefined
}

// Reserve one dispatch for waiting background work after five foreground requests.
const MAX_FOREGROUND_STREAK = 5

// Keep one token and one concurrency slot out of reach of queued background work
// whenever foreground work is waiting, so user actions never lose a dispatch to
// an automatic scan. Both reserves fall away once no foreground work is queued.
const FOREGROUND_RESERVED_TOKENS = 1

const IDLE_STATE_TTL_MS = 5 * 60 * 1000
const RATE_LIMIT_BACKOFF = {
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  maxExponent: 5,
  jitterRatio: 0.25,
} as const
const MAX_TIMER_DELAY_MS = 2_147_483_647

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
 * Optional site-type budgets share the same origin state, including when callers
 * supply conflicting types. Conflicts tighten the budget without refilling tokens.
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
  const states = new Map<string, SiteLimiterState>()

  const runWithoutLimit = async <T>(
    task: () => SiteRequestLease<T>,
  ): Promise<T> => {
    const lease = task()
    void Promise.resolve(lease.completion).catch(() => undefined)
    return await lease.result
  }

  if (!enabled || requestsPerMinute <= 0) {
    const unlimited = async <T>(
      _key: string,
      task: () => SiteRequestLease<T>,
      signal?: AbortSignal,
      _scheduling?: RequestScheduling,
    ): Promise<T> => {
      if (signal?.aborted) throw getAbortReason(signal)
      return await runWithoutLimit(task)
    }
    return Object.assign(unlimited, {
      pause: (_key: string, _retryAfter?: string) => {},
    })
  }

  const refillTokens = (state: SiteLimiterState) => {
    const now = Date.now()
    const elapsedMs = Math.max(0, now - state.lastRefillAt)
    if (elapsedMs <= 0) return

    state.tokens = Math.min(
      state.budget.burst,
      state.tokens + elapsedMs * (state.budget.requestsPerMinute / 60_000),
    )
    state.lastRefillAt = now
  }

  const getState = (key: string, siteType?: string) => {
    const budget = config.resolveBudget?.(siteType) ?? {
      maxConcurrentPerSite,
      requestsPerMinute,
      burst: capacity,
    }
    let state = states.get(key)
    if (!state) {
      state = {
        hasExplicitBudget: siteType !== undefined,
        pausedUntil: 0,
        backoffAttempts: 0,
        budget,
        foregroundStreak: 0,
        activeCount: 0,
        activeBackgroundCount: 0,
        tokens: budget.burst,
        lastRefillAt: Date.now(),
        queue: [],
        timer: undefined,
        cleanupTimer: undefined,
      }
      states.set(key, state)
      return state
    }

    if (siteType !== undefined && config.resolveBudget) {
      refillTokens(state)
      const previousCapacity = state.budget.burst
      state.budget = state.hasExplicitBudget
        ? {
            maxConcurrentPerSite: Math.min(
              state.budget.maxConcurrentPerSite,
              budget.maxConcurrentPerSite,
            ),
            requestsPerMinute: Math.min(
              state.budget.requestsPerMinute,
              budget.requestsPerMinute,
            ),
            burst: Math.min(state.budget.burst, budget.burst),
          }
        : budget
      state.hasExplicitBudget = true
      state.tokens = Math.min(
        state.tokens,
        state.tokens + state.budget.burst - previousCapacity,
      )
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

    const cleanup = () => {
      state.cleanupTimer = undefined
      if (
        state.activeCount > 0 ||
        state.queue.length > 0 ||
        state.timer ||
        states.get(key) !== state
      ) {
        return
      }
      const remainingPause = state.pausedUntil - Date.now()
      if (remainingPause > 0) {
        state.cleanupTimer = setTimeout(
          cleanup,
          Math.min(remainingPause, MAX_TIMER_DELAY_MS),
        )
        return
      }
      states.delete(key)
    }
    state.cleanupTimer = setTimeout(
      cleanup,
      Math.min(
        MAX_TIMER_DELAY_MS,
        Math.max(IDLE_STATE_TTL_MS, state.pausedUntil - Date.now()),
      ),
    )
  }

  const schedule = (key: string, state: SiteLimiterState): void => {
    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = undefined
    }

    const pauseMs = state.pausedUntil - Date.now()
    if (pauseMs > 0 && state.queue.length > 0) {
      state.timer = setTimeout(
        () => {
          state.timer = undefined
          schedule(key, state)
        },
        Math.min(pauseMs, MAX_TIMER_DELAY_MS),
      )
      return
    }

    const maxConcurrentPerSite = state.budget.maxConcurrentPerSite
    const refillRatePerMs = state.budget.requestsPerMinute / 60_000
    const foregroundTokenReserve =
      state.budget.burst > 1 ? FOREGROUND_RESERVED_TOKENS : 0

    while (state.activeCount < maxConcurrentPerSite && state.queue.length > 0) {
      refillTokens(state)

      // Waiting foreground work jumps the declared queue order, and keeps one
      // token and one concurrency slot out of reach of a background turn, so an
      // automatic scan can never turn a user action into a delayed request.
      const foregroundIndex = state.queue.findIndex(
        (item) =>
          item.scheduling?.priority !==
          REQUEST_SCHEDULING_PRIORITIES.Background,
      )
      const hasForegroundWork = foregroundIndex >= 0
      const foregroundItem = state.queue[foregroundIndex]
      if (foregroundIndex > 0 && foregroundItem) {
        state.queue.splice(foregroundIndex, 1)
        state.queue.unshift(foregroundItem)
      }

      const backgroundIndex = state.queue.findIndex(
        (item) =>
          item.scheduling?.priority ===
          REQUEST_SCHEDULING_PRIORITIES.Background,
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
      if (!item) {
        // Unreachable: the loop guard keeps `state.queue` non-empty, so the
        // spliced slot always yields an item.
        break
      }
      const isBackground =
        item.scheduling?.priority === REQUEST_SCHEDULING_PRIORITIES.Background
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

  const admit = async <T>(
    key: string,
    task: () => SiteRequestLease<T>,
    signal?: AbortSignal,
    scheduling?: RequestScheduling,
    siteType?: string,
  ): Promise<T> => {
    if (signal?.aborted) throw getAbortReason(signal)
    if (!key) return await runWithoutLimit(task)

    const state = getState(key, siteType)

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
  return Object.assign(admit, {
    /** Pauses future dispatches; the failed request is never replayed here. */
    pause(key: string, retryAfter?: string) {
      if (!key) return
      const state = getState(key)
      const seconds =
        retryAfter?.trim() && /^\d+(?:\.\d+)?$/.test(retryAfter.trim())
          ? Number(retryAfter)
          : NaN
      const date =
        retryAfter &&
        /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(retryAfter.trim())
          ? Date.parse(retryAfter)
          : NaN
      const serverDelay = Number.isFinite(seconds)
        ? seconds * 1000
        : date - Date.now()
      const backoff = Math.min(
        RATE_LIMIT_BACKOFF.maxDelayMs,
        RATE_LIMIT_BACKOFF.initialDelayMs *
          2 ** Math.min(state.backoffAttempts, RATE_LIMIT_BACKOFF.maxExponent),
      )
      const delay =
        Number.isFinite(serverDelay) && serverDelay >= 0
          ? serverDelay
          : backoff * (1 + Math.random() * RATE_LIMIT_BACKOFF.jitterRatio)
      state.backoffAttempts += 1
      state.pausedUntil = Math.max(state.pausedUntil, Date.now() + delay)
      schedule(key, state)
    },
  })
}

const productionSiteRequestLeaseLimiter = createSiteRequestLeaseLimiter({
  ...getSiteRequestBudget(),
  enabled: !isTestMode(),
  resolveBudget: getSiteRequestBudget,
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
  siteType?: string,
): Promise<T> {
  return await productionSiteRequestLeaseLimiter(
    key,
    task,
    signal,
    scheduling,
    siteType,
  )
}

/** Shares server throttling feedback across callers of the actual API origin. */
export function reportSiteRateLimit(key: string, retryAfter?: string): void {
  productionSiteRequestLeaseLimiter.pause(key, retryAfter)
}

/** Reports native HTTP throttling without reading or transforming the body. */
export function reportSiteRateLimitResponse(
  url: string,
  response: Pick<Response, "status" | "headers">,
): void {
  if (response.status === 429)
    reportSiteRateLimit(
      resolveSiteRequestLimitKey(url),
      response.headers.get("retry-after") ?? undefined,
    )
}

/** Runs a native provider's complete HTTP operation through the shared origin queue. */
export async function withSiteApiRequestTask<T>(
  url: string,
  task: () => Promise<T>,
  signal?: AbortSignal,
  scheduling?: RequestScheduling,
  siteType?: string,
): Promise<T> {
  return await withSiteApiRequestLease(
    resolveSiteRequestLimitKey(url),
    () => {
      signal?.throwIfAborted()
      const result = Promise.resolve(task())
      return {
        result,
        completion: result.then(
          () => undefined,
          () => undefined,
        ),
      }
    },
    signal,
    scheduling,
    siteType,
  )
}
