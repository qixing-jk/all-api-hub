import {
  TEMP_CONTEXT_TYPES,
  type TempContext,
  type TempContextReleaseOptions,
} from "./contracts"
import { logger, logTempWindow } from "./diagnostics"

const TEMP_CONTEXT_IDLE_TIMEOUT = 5000
const QUIET_WINDOW_IDLE_TIMEOUT = 3000
export type DestroyContextOptions = {
  skipBrowserRemoval?: boolean
  reason?: string
}
/** Owns pool indexes, request leases, origin serialization and idle retirement. */
export function createTempContextPool({
  cleanup,
  isAlive,
}: {
  cleanup: (
    context: TempContext,
    options: DestroyContextOptions,
  ) => Promise<void>
  isAlive: (context: TempContext) => Promise<boolean>
}) {
  const tempRequestContextMap = new Map<string, TempContext>()

  const tempContextById = new Map<number, TempContext>()

  const tempContextByTabId = new Map<number, TempContext>()

  const tempContextsByOrigin = new Map<string, TempContext[]>()

  const originLocks = new Map<string, Promise<void>>()

  // 正在销毁上下文池的 origin，用于防止获取/复用与销毁操作并发冲突
  const destroyingOrigins = new Set<string>()

  /**
   * 为相同 origin 串行执行异步任务，避免并发读写同一上下文池导致竞态。
   */
  async function withOriginLock<T>(
    origin: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = originLocks.get(origin) ?? Promise.resolve()
    let release: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    originLocks.set(origin, pending)
    await previous.catch(() => {})

    try {
      return await task()
    } finally {
      release!()
      if (originLocks.get(origin) === pending) {
        originLocks.delete(origin)
      }
    }
  }

  /**
   * 销毁指定 origin 的所有上下文（窗口/标签页），用于池整体回收。
   */
  async function destroyOriginPool(
    origin: string,
    pool?: TempContext[],
    reason?: string,
  ) {
    const contexts = pool ?? tempContextsByOrigin.get(origin)
    if (!contexts || contexts.length === 0) {
      return
    }

    logTempWindow("destroyOriginPool", {
      origin,
      poolSize: contexts.length,
      reason: reason ?? null,
    })

    destroyingOrigins.add(origin)
    try {
      await Promise.all(
        contexts.map((ctx) =>
          destroyContext(ctx, { reason: reason ?? "destroyOriginPool" }).catch(
            (error) => {
              logger.error("Failed to destroy context from pool", {
                contextId: ctx.id,
                tabId: ctx.tabId,
                error,
              })
            },
          ),
        ),
      )
    } finally {
      destroyingOrigins.delete(origin)
    }
  }

  /** Releases a request-owned context using the caller-selected timing policy. */
  async function releaseTempContext(
    requestId: string,
    options: TempContextReleaseOptions = {},
  ) {
    if (options.forceClose) {
      await executeTempContextRelease(requestId, options)
      return
    }

    logTempWindow("releaseTempContextScheduled", {
      requestId,
      forceClose: false,
      reason: options.reason ?? null,
    })
    // 延迟释放，提高并发时的复用率
    setTimeout(() => {
      void executeTempContextRelease(requestId, options).catch((error) => {
        logger.error("Delayed temp context release failed", error)
      })
    }, 2000)
  }

  /** Executes the shared release operation after its timing policy is chosen. */
  async function executeTempContextRelease(
    requestId: string,
    options: TempContextReleaseOptions,
  ): Promise<void> {
    const context = tempRequestContextMap.get(requestId)
    tempRequestContextMap.delete(requestId)

    if (!context) {
      logTempWindow("releaseTempContextNoContext", {
        requestId,
        forceClose: Boolean(options.forceClose),
        reason: options.reason ?? null,
      })
      return
    }

    await withOriginLock(context.origin, async () => {
      context.activeRequestIds.delete(requestId)

      if (!isTrackedContext(context)) {
        logTempWindow("releaseTempContextAlreadyDestroyed", {
          requestId,
          origin: context.origin,
          contextId: context.id,
          tabId: context.tabId,
          type: context.type,
          reason: options.reason ?? null,
        })
        return
      }

      if (options.forceClose) {
        logTempWindow("releaseTempContextForceClose", {
          requestId,
          origin: context.origin,
          contextId: context.id,
          tabId: context.tabId,
          type: context.type,
          reason: options.reason ?? null,
        })
        destroyingOrigins.add(context.origin)
        try {
          await destroyContext(context, {
            reason: options.reason ?? "forceClose",
          })
        } finally {
          destroyingOrigins.delete(context.origin)
        }
        return
      }

      if (hasActiveRequests(context)) {
        logTempWindow("releaseTempContextStillInUse", {
          requestId,
          origin: context.origin,
          contextId: context.id,
          tabId: context.tabId,
          type: context.type,
          reason: options.reason ?? null,
          activeRequestCount: context.activeRequestIds.size,
        })
        return
      }

      context.lastUsed = Date.now()

      const pool = tempContextsByOrigin.get(context.origin)
      if (pool && pool.every(isContextIdle)) {
        logTempWindow("releaseTempContextDestroyOriginPool", {
          requestId,
          origin: context.origin,
          poolSize: pool.length,
        })
        // Mark this origin as destroying while we tear down the pool. Any
        // concurrent acquire attempts for this origin will be rejected by
        // acquireTempContext until destruction finishes.
        destroyingOrigins.add(context.origin)
        try {
          await destroyOriginPool(context.origin, pool, "originPoolIdle")
        } finally {
          destroyingOrigins.delete(context.origin)
        }
      } else {
        logTempWindow("releaseTempContextScheduleIdleCleanup", {
          requestId,
          origin: context.origin,
          contextId: context.id,
          tabId: context.tabId,
          type: context.type,
          idleTimeoutMs: TEMP_CONTEXT_IDLE_TIMEOUT,
        })
        scheduleContextCleanup(context)
      }
    })
  }

  /**
   * 从指定 origin 的上下文池中获取一个仍然存活的上下文：
   * - 不根据 activeRequestIds 过滤，依赖 withOriginLock 保证同一 origin 串行
   * - 对已失效的上下文进行销毁并从池中移除。
   */
  async function getReusableContext(origin: string) {
    const pool = tempContextsByOrigin.get(origin)
    if (!pool || pool.length === 0) {
      return null
    }

    // 注意：这里不检查 context.activeRequestIds。
    // 同一 origin 的并发通过 withOriginLock 串行化：
    // - 后续请求会排队进入 acquireTempContext
    // - 然后复用同一个上下文，而不是因为已有持有者就额外创建新的窗口/标签页
    for (const context of pool) {
      if (await isAlive(context)) {
        return context
      }

      await destroyContext(context, {
        skipBrowserRemoval: true,
        reason: "contextNotAlive",
      })
    }

    return null
  }

  /**
   * 将新创建的上下文注册到各种索引映射与 origin 池中。
   */
  function registerContext(origin: string, context: TempContext) {
    tempContextById.set(context.id, context)
    tempContextByTabId.set(context.tabId, context)

    const pool = tempContextsByOrigin.get(origin) ?? []
    pool.push(context)
    tempContextsByOrigin.set(origin, pool)
  }

  /**
   * Attach a request to the tracked temp context and move the ownership record if
   * the request was previously bound elsewhere.
   */
  function attachRequestToContext(requestId: string, context: TempContext) {
    const previousContext = tempRequestContextMap.get(requestId)
    if (previousContext && previousContext !== context) {
      previousContext.activeRequestIds.delete(requestId)
    }

    tempRequestContextMap.set(requestId, context)
    context.activeRequestIds.add(requestId)
    context.lastUsed = Date.now()
    clearContextReleaseTimer(context)
  }

  /**
   * Returns whether the temp context is still held by any active request.
   */
  function hasActiveRequests(context: TempContext) {
    return context.activeRequestIds.size > 0
  }

  /**
   * Returns whether the temp context has no remaining active request holders.
   */
  function isContextIdle(context: TempContext) {
    return !hasActiveRequests(context)
  }

  /**
   * Clears any pending idle-release timer attached to the temp context.
   */
  function clearContextReleaseTimer(context: TempContext) {
    if (context.releaseTimer) {
      clearTimeout(context.releaseTimer)
      context.releaseTimer = undefined
    }
  }

  /**
   * Checks whether the exact temp-context object is still the one tracked by id.
   */
  function isTrackedContext(context: TempContext) {
    return tempContextById.get(context.id) === context
  }

  /**
   * 为上下文安排空闲销毁定时器，长时间未使用的窗口/标签页会被自动关闭。
   */
  function scheduleContextCleanup(context: TempContext) {
    clearContextReleaseTimer(context)

    const idleTimeoutMs =
      context.type === TEMP_CONTEXT_TYPES.Window
        ? QUIET_WINDOW_IDLE_TIMEOUT
        : TEMP_CONTEXT_IDLE_TIMEOUT

    logTempWindow("scheduleContextCleanup", {
      origin: context.origin,
      contextId: context.id,
      tabId: context.tabId,
      type: context.type,
      idleTimeoutMs,
    })

    context.releaseTimer = setTimeout(() => {
      context.releaseTimer = undefined
      withOriginLock(context.origin, async () => {
        if (!isTrackedContext(context)) {
          return
        }

        if (!isContextIdle(context)) {
          logTempWindow("idleContextCleanupSkippedActiveContext", {
            origin: context.origin,
            contextId: context.id,
            tabId: context.tabId,
            type: context.type,
            activeRequestCount: context.activeRequestIds.size,
          })
          return
        }

        logTempWindow("idleContextCleanupTriggered", {
          origin: context.origin,
          contextId: context.id,
          tabId: context.tabId,
          type: context.type,
        })
        await destroyContext(context, { reason: "idleTimeout" })
      }).catch((error) => {
        logger.error("Failed to destroy idle temp context", error)
      })
    }, idleTimeoutMs)
  }

  /**
   * 销毁单个上下文：
   * - 从各种索引与池中移除
   * - 可选地关闭对应的窗口/标签页。
   */

  /** Finalizes one tracked context before running best-effort external cleanup. */
  async function destroyContext(
    context: TempContext,
    options: DestroyContextOptions = {},
  ) {
    if (!isTrackedContext(context)) {
      return
    }

    logTempWindow("destroyContext", {
      origin: context.origin,
      contextId: context.id,
      tabId: context.tabId,
      type: context.type,
      mode: context.mode,
      ownerWindowId: context.ownerWindowId ?? null,
      skipBrowserRemoval: Boolean(options.skipBrowserRemoval),
      reason: options.reason ?? null,
    })

    clearContextReleaseTimer(context)

    tempContextById.delete(context.id)
    tempContextByTabId.delete(context.tabId)

    const pool = tempContextsByOrigin.get(context.origin)
    if (pool) {
      const remaining = pool.filter((item) => item !== context)
      if (remaining.length === 0) {
        tempContextsByOrigin.delete(context.origin)
      } else {
        tempContextsByOrigin.set(context.origin, remaining)
      }
    }

    for (const [requestId, ctx] of tempRequestContextMap.entries()) {
      if (ctx === context) {
        tempRequestContextMap.delete(requestId)
      }
    }
    context.activeRequestIds.clear()

    await cleanup(context, options)
  }

  /**
   * Remove request-to-context entries that still point at contexts already
   * destroyed from the active in-memory pool.
   */
  function clearStaleTempRequestMappings() {
    let cleared = 0

    for (const [requestId, context] of tempRequestContextMap.entries()) {
      if (!isTrackedContext(context)) {
        tempRequestContextMap.delete(requestId)
        context.activeRequestIds.delete(requestId)
        cleared += 1
      }
    }

    return cleared
  }

  return {
    withOriginLock,
    destroyOriginPool,
    releaseTempContext,
    getReusableContext,
    registerContext,
    attachRequestToContext,
    destroyContext,
    clearStaleTempRequestMappings,
    isDestroying: (origin: string) => destroyingOrigins.has(origin),
    hasContext: (id: number) => tempContextById.has(id),
    getById: (id: number) => tempContextById.get(id),
    getByTabId: (id: number) => tempContextByTabId.get(id),
    hasRequest: (id: string) => tempRequestContextMap.has(id),
    get contexts() {
      return Array.from(tempContextById.values())
    },
    get contextCount() {
      return tempContextById.size
    },
    get requestCount() {
      return tempRequestContextMap.size
    },
  }
}
