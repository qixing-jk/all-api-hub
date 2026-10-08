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
  createBrowserFocusObservation,
  readBrowserFocusState,
} from "~/utils/browser/browserFocus"
import { applyTempWindowDownloadBlockRule } from "~/utils/browser/dnrCookieInjector"
import { applyFirefoxTempWindowDownloadBlockRule } from "~/utils/browser/firefoxTempWindowDownloadBlocker"
import { removeTabOwningWindow } from "~/utils/browser/ownedTabRemoval"
import {
  getTab,
  onTabRemoved,
  removeTab,
  updateTab,
} from "~/utils/browser/tabs"
import { onWindowRemoved } from "~/utils/browser/windows"
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
  createTempContextPool,
  type DestroyContextOptions,
} from "./contextPool"
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

const contextPool = createTempContextPool({
  cleanup: cleanupContext,
  isAlive: isContextAlive,
})
const {
  withOriginLock,
  destroyOriginPool,
  releaseTempContext,
  getReusableContext,
  registerContext,
  attachRequestToContext,
  destroyContext,
  clearStaleTempRequestMappings,
} = contextPool

/** Runs one complete temp-page handler operation under its origin key. */
async function runTempPageHandler(
  url: string,
  options: { incognito?: boolean },
  task: () => Promise<void>,
): Promise<void> {
  const originKey = buildTempContextOriginKey(normalizeOrigin(url), options)
  await tempPageTaskScheduler.run(originKey, task)
}

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
  const trackedContexts = contextPool.contexts
  const initialTrackedRequestCount = contextPool.requestCount

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
          await destroyOriginPool(origin, pool, "runtimeSuspend")
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
    remainingContextCount: contextPool.contextCount,
    remainingRequestCount: contextPool.requestCount,
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

  const context = contextPool.getById(windowId)
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

  const context = contextPool.getByTabId(tabId)
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
      hasRequestContext: requestId ? contextPool.hasRequest(requestId) : false,
    })

    if (requestId && contextPool.hasRequest(requestId)) {
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
      if (contextPool.isDestroying(origin)) {
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
          contextPool.isDestroying(origin) ||
          !contextPool.hasContext(acquiredContext.id)
        ) {
          throw new Error("Acquired temp context is no longer valid")
        }

        attachRequestToContext(requestId, acquiredContext)
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

/** Performs best-effort external cleanup after pool ownership has been retired. */
async function cleanupContext(
  context: TempContext,
  options: DestroyContextOptions,
) {
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
