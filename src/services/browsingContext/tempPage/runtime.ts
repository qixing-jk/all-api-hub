import { RuntimeActionIds } from "~/constants/runtimeActions"
import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import { scheduleTempPageReclaimRetry } from "~/services/browsingContext/internalTabReclamation"
import {
  INTERNAL_TAB_WINDOW_SCOPES,
  registerInternalTab,
  unregisterInternalTab,
} from "~/services/browsingContext/internalTabsBackground"
import { resolveTempContextOpenMode } from "~/services/browsingContext/tempPage/tempContextModeResolver"
import { tempPageTaskScheduler } from "~/services/browsingContext/tempPage/tempPageTaskScheduler"
import { recordShieldBypassFocusObservation } from "~/services/productAnalytics/shieldBypassSummary"
import { PROTECTION_BYPASS_DECISION_RESULTS } from "~/services/protectionBypass/contracts"
import { type ProtectionBypassPolicyDecision } from "~/services/protectionBypass/policy"
import {
  getTab,
  onTabRemoved,
  onWindowRemoved,
  removeTab,
  updateTab,
} from "~/utils/browser/browserApi"
import {
  createBrowserFocusObservation,
  readBrowserFocusState,
} from "~/utils/browser/browserFocus"
import { applyTempWindowDownloadBlockRule } from "~/utils/browser/dnrCookieInjector"
import { applyFirefoxTempWindowDownloadBlockRule } from "~/utils/browser/firefoxTempWindowDownloadBlocker"
import { removeTabOwningWindow } from "~/utils/browser/ownedTabRemoval"
import { getErrorMessage } from "~/utils/core/error"
import { sanitizeUrlForLog } from "~/utils/core/sanitizeUrlForLog"
import { t } from "~/utils/i18n/core"

import {
  getTempContextTabSnapshot,
  navigateTempContextToPage,
  prepareTempContextFetchOptions,
  removeInstalledDownloadBlockRules,
  resolveTempContextPreferenceMode,
  showShieldBypassUiInTab,
  waitForTabComplete,
} from "./browserAdapter"
import {
  forgetCompositeWindow,
  hasLiveCompositeWindow,
  removeCompositeTab,
} from "./compositeWindow"
import {
  TEMP_CONTEXT_TYPES,
  type AuthorizeTempContextAtAcquire,
  type TempContext,
  type TempContextOpenMode,
  type TempContextOpenResult,
  type TempContextReleaseOptions,
  type TempWindowHandle,
} from "./contracts"
import { logger, logTempWindow, normalizeOrigin } from "./diagnostics"
import {
  createProtectionBypassDecisionError,
  reportAuthorizedTempContextOutcome,
} from "./failures"
import { openFallbackAwareTempContext } from "./openingAdapter"

const TEMP_CONTEXT_IDLE_TIMEOUT = 5000

const QUIET_WINDOW_IDLE_TIMEOUT = 3000

/** Runs one complete temp-page handler operation under its origin key. */
async function runTempPageHandler(
  url: string,
  options: { incognito?: boolean },
  task: () => Promise<void>,
): Promise<void> {
  const originKey = buildTempContextOriginKey(normalizeOrigin(url), options)
  await tempPageTaskScheduler.run(originKey, task)
}

const tempRequestContextMap = new Map<string, TempContext>()

const tempContextById = new Map<number, TempContext>()

const tempContextByTabId = new Map<number, TempContext>()

const tempContextsByOrigin = new Map<string, TempContext[]>()

const originLocks = new Map<string, Promise<void>>()

// 正在销毁上下文池的 origin，用于防止获取/复用与销毁操作并发冲突
const destroyingOrigins = new Set<string>()

/**
 * Remove a known temp-window handle through the typed browser adapter that
 * matches the handle owner.
 */
async function removeTempWindowHandle(handle: TempWindowHandle) {
  switch (handle.kind) {
    case TEMP_CONTEXT_MODES.Window:
      // A window-owned popup that cannot be closed still loses its tab, so the
      // leftover is never left to the next reclamation sweep by default.
      await removeTabOwningWindow(handle.tabId, handle.windowId)
      return
    case TEMP_CONTEXT_MODES.Composite:
      await removeCompositeTab(handle.windowId, handle.tabId)
      return
    case TEMP_CONTEXT_MODES.Tab:
      await removeTab(handle.tabId)
  }
}

type TempContextHandleSource = TempContext | TempContextOpenResult

/**
 * Builds the browser-removal handle for a registered or partially opened temp context.
 */
function getTempContextHandle(
  source: TempContextHandleSource,
): TempWindowHandle {
  switch (source.mode) {
    case TEMP_CONTEXT_MODES.Window:
      return {
        kind: TEMP_CONTEXT_MODES.Window,
        windowId: source.ownerWindowId,
        tabId: source.tabId,
      }
    case TEMP_CONTEXT_MODES.Composite:
      return {
        kind: TEMP_CONTEXT_MODES.Composite,
        windowId: source.ownerWindowId,
        tabId: source.tabId,
      }
    case TEMP_CONTEXT_MODES.Tab:
      return { kind: TEMP_CONTEXT_MODES.Tab, tabId: source.tabId }
  }
}

/**
 * 设置临时窗口/标签页相关的浏览器事件监听器。
 *
 * - 监听 window/tab 关闭事件
 * - 清理对应的临时上下文和映射
 */
export function setupTempWindowListeners() {
  // 监听窗口/标签页关闭事件，清理记录
  onWindowRemoved(handleTempWindowRemoved)

  // 手机: 监听标签页关闭
  onTabRemoved(handleTempTabRemoved)
}

/**
 * Best-effort cleanup for tracked temp contexts when the background is about to
 * suspend. This supplements the normal delayed release flow rather than
 * replacing it.
 */
export async function cleanupTempContextsOnSuspend() {
  const trackedContexts = Array.from(tempContextById.values())
  const initialTrackedRequestCount = tempRequestContextMap.size

  if (trackedContexts.length === 0) {
    const clearedRequestMappings = clearStaleTempRequestMappings()
    logTempWindow("suspendCleanupNoTrackedContexts", {
      trackedContextCount: 0,
      trackedRequestCount: initialTrackedRequestCount,
      clearedRequestMappings,
    })
    return
  }

  const contextsByOrigin = new Map<string, TempContext[]>()
  for (const context of trackedContexts) {
    const pool = contextsByOrigin.get(context.origin) ?? []
    pool.push(context)
    contextsByOrigin.set(context.origin, pool)
  }

  logTempWindow("suspendCleanupStart", {
    trackedContextCount: trackedContexts.length,
    trackedRequestCount: initialTrackedRequestCount,
    originCount: contextsByOrigin.size,
  })

  const results = await Promise.all(
    Array.from(contextsByOrigin.entries()).map(async ([origin, pool]) => {
      try {
        await withOriginLock(origin, async () => {
          destroyingOrigins.add(origin)
          try {
            await destroyOriginPool(origin, pool, "runtimeSuspend")
          } finally {
            destroyingOrigins.delete(origin)
          }
        })
        return { origin, poolSize: pool.length, ok: true }
      } catch (error) {
        logTempWindow("suspendCleanupOriginError", {
          origin,
          poolSize: pool.length,
          error: getErrorMessage(error),
        })
        return { origin, poolSize: pool.length, ok: false }
      }
    }),
  )

  const clearedRequestMappings = clearStaleTempRequestMappings()
  logTempWindow("suspendCleanupComplete", {
    trackedContextCount: trackedContexts.length,
    trackedRequestCount: initialTrackedRequestCount,
    cleanedOriginCount: results.filter((result) => result.ok).length,
    failedOriginCount: results.filter((result) => !result.ok).length,
    remainingContextCount: tempContextById.size,
    remainingRequestCount: tempRequestContextMap.size,
    clearedRequestMappings,
  })
}

/**
 * Handles browser window removal and destroys the matching tracked context.
 */
function handleTempWindowRemoved(windowId: number) {
  forgetCompositeWindow(windowId)

  logTempWindow("windowRemoved", {
    windowId,
  })

  const context = tempContextById.get(windowId)
  if (context && context.type === TEMP_CONTEXT_TYPES.Window) {
    withOriginLock(context.origin, () =>
      destroyContext(context, {
        skipBrowserRemoval: true,
        reason: "windowRemoved",
      }),
    ).catch((error) => {
      logger.error("Failed to cleanup removed window context", error)
    })
  }
}

/**
 * Handles browser tab removal and destroys the matching tracked context.
 */
function handleTempTabRemoved(tabId: number) {
  void unregisterInternalTab(tabId)
  logTempWindow("tabRemoved", {
    tabId,
  })

  const context = tempContextByTabId.get(tabId)
  if (context && context.type === TEMP_CONTEXT_TYPES.Tab) {
    withOriginLock(context.origin, () =>
      destroyContext(context, {
        skipBrowserRemoval: true,
        reason: "tabRemoved",
      }),
    ).catch((error) => {
      logger.error("Failed to cleanup removed tab context", error)
    })
  }
}

/**
 * 关闭指定 requestId 关联的临时窗口/标签页，或释放临时上下文。
 */
export async function handleCloseTempWindow(
  request: any,
  sendResponse: (response?: any) => void,
) {
  try {
    const { requestId } = request
    logTempWindow(RuntimeActionIds.CloseTempWindow, {
      requestId,
      hasRequestContext: requestId
        ? tempRequestContextMap.has(requestId)
        : false,
    })

    if (requestId && tempRequestContextMap.has(requestId)) {
      await releaseTempContext(requestId, {
        forceClose: true,
        reason: "manualClose",
      })
      sendResponse({ success: true })
      return
    }

    logTempWindow("closeTempWindowNotFound", {
      requestId,
    })
    sendResponse({
      success: false,
      error: t("messages:background.windowNotFound"),
    })
  } catch (error) {
    logTempWindow("closeTempWindowError", {
      requestId: request?.requestId ?? null,
      error: getErrorMessage(error),
    })
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}

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
}

/**
 * 获取或创建某个 origin 的临时上下文：
 * - 在 withOriginLock 下保证同一 origin 串行
 * - 如有可复用上下文则复用，否则创建新的窗口/标签页
 * - 使用 destroyingOrigins 防止与销毁流程并发冲突
 */
async function acquireTempContext(
  url: string,
  requestId: string,
  suppressMinimize?: boolean,
  options: { incognito?: boolean; signal?: AbortSignal } = {},
  authorizeAtAcquire?: AuthorizeTempContextAtAcquire,
) {
  const origin = buildTempContextOriginKey(normalizeOrigin(url), options)
  let finalDecision: ProtectionBypassPolicyDecision | undefined
  let reused = false

  logTempWindow("acquireTempContextStart", {
    requestId,
    origin,
  })

  try {
    const context = await withOriginLock(origin, async () => {
      // If this origin's pool is in the middle of being destroyed, do not
      // attempt to reuse or create a new context for it.
      if (destroyingOrigins.has(origin)) {
        throw new Error("Temp context pool is being destroyed for this origin")
      }

      // Snapshot mode inputs first; authorization must remain the final policy
      // and resource-currentness await before context reuse or opening.
      const [storedPreference, sharedWindowAvailable] = await Promise.all([
        resolveTempContextPreferenceMode(),
        hasLiveCompositeWindow(),
      ])
      const focusState = await readBrowserFocusState()
      const decision = authorizeAtAcquire
        ? await authorizeAtAcquire()
        : undefined
      options.signal?.throwIfAborted()
      finalDecision = decision
      if (decision?.kind === PROTECTION_BYPASS_DECISION_RESULTS.Denied) {
        throw createProtectionBypassDecisionError(decision)
      }
      const preferredMode =
        decision?.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed
          ? decision.adapter
          : storedPreference
      const requestedMode = resolveTempContextOpenMode({
        preferredMode,
        incognito: Boolean(options.incognito),
        sharedWindowAvailable,
        focusState,
      })

      const focusObservation = createBrowserFocusObservation(focusState)
      let acquiredContext: TempContext | null = null

      try {
        acquiredContext = await getReusableContext(origin)
        reused = acquiredContext !== null
        if (!acquiredContext) {
          logTempWindow("acquireTempContextCreate", {
            requestId,
            origin,
            url: sanitizeUrlForLog(url),
            preferredMode,
            requestedMode,
          })
          acquiredContext = await createTempContextInstance(
            url,
            origin,
            requestId,
            requestedMode,
            suppressMinimize,
            options,
          )
          registerContext(origin, acquiredContext)
          logTempWindow("acquireTempContextCreated", {
            requestId,
            origin,
            contextId: acquiredContext.id,
            tabId: acquiredContext.tabId,
            type: acquiredContext.type,
            preferredMode,
            requestedMode,
          })
        } else {
          logTempWindow("acquireTempContextReuse", {
            requestId,
            origin,
            contextId: acquiredContext.id,
            tabId: acquiredContext.tabId,
            type: acquiredContext.type,
            preferredMode,
            requestedMode,
          })
        }

        // It's possible that during async operations the context or its pool was
        // marked for destruction. Perform a final validity check before using it.
        if (
          destroyingOrigins.has(origin) ||
          !tempContextById.has(acquiredContext.id)
        ) {
          throw new Error("Acquired temp context is no longer valid")
        }

        attachRequestToContext(requestId, acquiredContext)
        acquiredContext.lastUsed = Date.now()
        clearContextReleaseTimer(acquiredContext)
        logTempWindow("acquireTempContextSuccess", {
          requestId,
          origin,
          contextId: acquiredContext.id,
          tabId: acquiredContext.tabId,
          type: acquiredContext.type,
          activeRequestCount: acquiredContext.activeRequestIds.size,
        })
        return acquiredContext
      } finally {
        const completedObservation = await focusObservation.finish()
        if (acquiredContext) {
          try {
            void recordShieldBypassFocusObservation({
              observation: completedObservation,
              adapter: acquiredContext.mode,
            }).catch(() => undefined)
          } catch {
            // Product analytics is best effort and cannot change pool behavior.
          }
        }
      }
    })

    // The context is about to be used and its close will be timer-based, so
    // make sure a worker that dies before that close still gets replaced by one
    // that sweeps. Armed before the risk, which is what makes it survive the
    // death it insures against.
    void scheduleTempPageReclaimRetry()

    if (finalDecision?.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed) {
      reportAuthorizedTempContextOutcome(authorizeAtAcquire, {
        kind: PROTECTION_BYPASS_DECISION_RESULTS.Allowed,
        adapter: context.mode,
        reused,
      })
    }
    return context
  } catch (error) {
    if (finalDecision?.kind === PROTECTION_BYPASS_DECISION_RESULTS.Denied) {
      reportAuthorizedTempContextOutcome(authorizeAtAcquire, {
        kind: PROTECTION_BYPASS_DECISION_RESULTS.Denied,
      })
    } else if (
      finalDecision?.kind === PROTECTION_BYPASS_DECISION_RESULTS.Allowed
    ) {
      reportAuthorizedTempContextOutcome(authorizeAtAcquire, {
        kind: PROTECTION_BYPASS_DECISION_RESULTS.Unavailable,
      })
    }
    throw error
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
    if (await isContextAlive(context)) {
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
 * Creates a ready-to-use temp context, including load/guard readiness checks.
 */
async function createTempContextInstance(
  url: string,
  origin: string,
  requestId: string,
  requestedMode: TempContextOpenMode,
  suppressMinimize = false,
  options: { incognito?: boolean; signal?: AbortSignal } = {},
): Promise<TempContext> {
  let opened: TempContextOpenResult | undefined
  let downloadBlockRuleId: number | null = null
  let firefoxDownloadBlockTabId: number | null = null
  const useIncognito = Boolean(options.incognito)
  // Incognito/private temp contexts must stay window-backed so storage/session
  // isolation does not silently collapse back into the regular profile.
  const allowWindowRollback =
    !useIncognito && requestedMode !== TEMP_CONTEXT_MODES.Tab

  try {
    opened = await openFallbackAwareTempContext({
      url,
      origin,
      requestId,
      requestedMode,
      allowWindowRollback,
      suppressMinimize,
      incognito: useIncognito,
    })
    ;[downloadBlockRuleId, firefoxDownloadBlockTabId] = await Promise.all([
      applyTempWindowDownloadBlockRule(opened.tabId),
      applyFirefoxTempWindowDownloadBlockRule(opened.tabId),
    ])
    if (downloadBlockRuleId == null && firefoxDownloadBlockTabId == null) {
      logger.warn(
        "No temp-window download block rule could be installed before navigation",
        { requestId, origin, tabId: opened.tabId },
      )
    }
    if (
      !(await registerInternalTab(opened.tabId, {
        // A window-backed temp context owns its window; composite and plain tab
        // contexts only borrow one, so reclamation must never close that window.
        windowScope:
          opened.mode === TEMP_CONTEXT_MODES.Window
            ? INTERNAL_TAB_WINDOW_SCOPES.Owned
            : INTERNAL_TAB_WINDOW_SCOPES.Shared,
        createdAt: Date.now(),
      }))
    ) {
      throw new Error("Unable to persist internal tab ownership")
    }
    // The worker may stop while navigation or readiness is pending, before a
    // request receives this context and arms its delayed-close retry.
    await scheduleTempPageReclaimRetry()
    await updateTab(opened.tabId, { url })

    logTempWindow("createTempContextInstance", {
      requestId,
      origin,
      contextId: opened.id,
      tabId: opened.tabId,
      type: opened.type,
      mode: opened.mode,
      ownerWindowId: opened.ownerWindowId ?? null,
      downloadBlockRuleInstalled: downloadBlockRuleId != null,
      firefoxDownloadBlockRuleInstalled: firefoxDownloadBlockTabId != null,
      requestedMode,
      url: sanitizeUrlForLog(url),
    })

    // Best-effort: annotate the temporary window/tab so users understand why it opened.
    void showShieldBypassUiInTab({ tabId: opened.tabId, origin, requestId })

    await waitForTabComplete(opened.tabId, {
      requestId,
      origin,
      signal: options.signal,
    })
    const readyTab = await getTempContextTabSnapshot(opened.tabId)

    logTempWindow("createTempContextInstanceReady", {
      requestId,
      origin,
      contextId: opened.id,
      tabId: opened.tabId,
      type: opened.type,
      mode: opened.mode,
      ownerWindowId: opened.ownerWindowId ?? null,
      requestedMode,
    })

    return {
      ...opened,
      origin,
      currentUrl: readyTab?.url ?? url,
      activeRequestIds: new Set<string>(),
      lastUsed: Date.now(),
      ...(downloadBlockRuleId != null ? { downloadBlockRuleId } : {}),
      ...(firefoxDownloadBlockTabId != null
        ? { firefoxDownloadBlockTabId }
        : {}),
    }
  } catch (error) {
    logTempWindow("createTempContextInstanceError", {
      requestId,
      origin,
      contextId: opened?.id ?? null,
      tabId: opened?.tabId ?? null,
      type: opened?.type ?? TEMP_CONTEXT_TYPES.Window,
      mode: opened?.mode ?? TEMP_CONTEXT_MODES.Window,
      ownerWindowId: opened?.ownerWindowId ?? null,
      error: getErrorMessage(error),
      requestedMode,
    })
    if (opened) {
      try {
        await removeTempWindowHandle(getTempContextHandle(opened))
      } catch (cleanupError) {
        logger.warn(
          "Failed to cleanup temp context after creation error",
          cleanupError,
        )
        void scheduleTempPageReclaimRetry()
      }
    }
    await removeInstalledDownloadBlockRules(
      downloadBlockRuleId,
      firefoxDownloadBlockTabId,
    )
    throw error
  }
}

/**
 * Build a temp-context pool key.
 *
 * The temp-window pool is keyed by origin. When `incognito` is enabled we must
 * keep a separate pool so the temporary context does not inherit normal-mode
 * storage (local/session storage) which can affect Turnstile rendering in
 * multi-account scenarios.
 */
function buildTempContextOriginKey(
  origin: string,
  options: { incognito?: boolean } = {},
): string {
  if (options.incognito) {
    return `incognito:${origin}`
  }

  return origin
}

/** Generic runtime port for background features that need a temporary page. */
export const tempWindowBackgroundRuntime = {
  release: releaseTempContext,
  prepareFetchOptions: prepareTempContextFetchOptions,
  run(
    url: string,
    options: { incognito?: boolean },
    task: () => Promise<void>,
  ): Promise<void> {
    return runTempPageHandler(url, options, task)
  },

  async acquire(
    url: string,
    requestId: string,
    suppressMinimize?: boolean,
    options: { incognito?: boolean; signal?: AbortSignal } = {},
    authorizeAtAcquire?: AuthorizeTempContextAtAcquire,
  ) {
    const context = await acquireTempContext(
      url,
      requestId,
      suppressMinimize,
      options,
      authorizeAtAcquire,
    )
    return {
      tabId: context.tabId,
      ownerWindowId: context.ownerWindowId,
      navigate: (
        targetUrl: string,
        meta: { requestId: string; origin: string; signal?: AbortSignal },
      ) => navigateTempContextToPage(context, targetUrl, meta),
      inspect: () => getTempContextTabSnapshot(context.tabId),
      release: (releaseOptions: TempContextReleaseOptions = {}) =>
        releaseTempContext(requestId, releaseOptions),
    }
  },
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
type DestroyContextOptions = {
  skipBrowserRemoval?: boolean
  reason?: string
}

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

  await removeInstalledDownloadBlockRules(
    context.downloadBlockRuleId,
    context.firefoxDownloadBlockTabId,
  )
  context.downloadBlockRuleId = null
  context.firefoxDownloadBlockTabId = null

  if (!options.skipBrowserRemoval) {
    try {
      await removeTempWindowHandle(getTempContextHandle(context))
    } catch (error) {
      logger.warn("Failed to remove temp context", error)
      // The handle is already gone, so nothing else will retry this close.
      void scheduleTempPageReclaimRetry()
    }
  }
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

/**
 * 检查上下文对应的标签页是否仍然存在，用于过滤已失效的上下文。
 */
async function isContextAlive(context: TempContext) {
  try {
    await getTab(context.tabId)
    return true
  } catch {
    return false
  }
}
