import { t } from "i18next"

import { getSiteType } from "~/services/detectSiteType"
import {
  createTab,
  createWindow,
  hasWindowsAPI,
  onTabRemoved,
  onWindowRemoved,
  removeTabOrWindow,
} from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { sanitizeUrlForLog } from "~/utils/sanitizeUrlForLog"

const TEMP_CONTEXT_IDLE_TIMEOUT = 5000
const TEMP_WINDOW_LOG_PREFIX = "[Background][TempWindow]"

/**
 * Log temporary window events to console.
 */
function logTempWindow(event: string, details?: Record<string, unknown>) {
  try {
    if (details && Object.keys(details).length > 0) {
      console.log(`${TEMP_WINDOW_LOG_PREFIX} ${event}`, details)
    } else {
      console.log(`${TEMP_WINDOW_LOG_PREFIX} ${event}`)
    }
  } catch {
    // ignore sanitizeUrlForLog errors
  }
}

export type TempContext = {
  id: number
  tabId: number
  origin: string
  type: "window" | "tab"
  busy: boolean
  lastUsed: number
  releaseTimer?: ReturnType<typeof setTimeout>
}

// 手动打开的临时窗口/标签页
const tempWindows = new Map<string, number>()

const tempRequestContextMap = new Map<string, TempContext>()
const tempContextById = new Map<number, TempContext>()
const tempContextByTabId = new Map<number, TempContext>()
const tempContextsByOrigin = new Map<string, TempContext[]>()
const originLocks = new Map<string, Promise<void>>()
// 正在销毁上下文池的 origin，用于防止获取/复用与销毁操作并发冲突
const destroyingOrigins = new Set<string>()

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
 * 处理临时窗口关闭事件，移除 tempWindows 记录并销毁对应的 window 上下文。
 */
function handleTempWindowRemoved(windowId: number) {
  let removedRequestId: string | undefined
  for (const [requestId, storedId] of tempWindows.entries()) {
    if (storedId === windowId) {
      tempWindows.delete(requestId)
      removedRequestId = requestId
      break
    }
  }

  logTempWindow("windowRemoved", {
    windowId,
    requestId: removedRequestId ?? null,
  })

  const context = tempContextById.get(windowId)
  if (context && context.type === "window") {
    withOriginLock(context.origin, () =>
      destroyContext(context, {
        skipBrowserRemoval: true,
        reason: "windowRemoved",
      }),
    ).catch((error) => {
      console.error(
        "[Background] Failed to cleanup removed window context",
        error,
      )
    })
  }
}

/**
 * 处理临时标签页关闭事件，移除 tempWindows 记录并销毁对应的 tab 上下文。
 */
function handleTempTabRemoved(tabId: number) {
  let removedRequestId: string | undefined
  for (const [requestId, storedId] of tempWindows.entries()) {
    if (storedId === tabId) {
      tempWindows.delete(requestId)
      removedRequestId = requestId
      break
    }
  }

  logTempWindow("tabRemoved", {
    tabId,
    requestId: removedRequestId ?? null,
  })

  const context = tempContextByTabId.get(tabId)
  if (context && context.type === "tab") {
    withOriginLock(context.origin, () =>
      destroyContext(context, {
        skipBrowserRemoval: true,
        reason: "tabRemoved",
      }),
    ).catch((error) => {
      console.error("[Background] Failed to cleanup removed tab context", error)
    })
  }
}

/**
 * 根据请求参数打开临时窗口或标签页，并记录 requestId 与 window/tabId 的映射。
 */
export async function handleOpenTempWindow(
  request: any,
  sendResponse: (response?: any) => void,
) {
  try {
    const { url, requestId } = request

    logTempWindow("openTempWindow", {
      requestId,
      origin: normalizeOrigin(url),
      url: sanitizeUrlForLog(url),
    })

    // 手机 不支持 windows API，使用 tabs 替代
    if (hasWindowsAPI()) {
      // 创建新窗口
      const window = await createWindow({
        url: url,
        type: "popup",
        width: 800,
        height: 600,
        focused: false,
      })

      if (window?.id) {
        // 记录窗口ID
        tempWindows.set(requestId, window.id)
        logTempWindow("openTempWindowSuccess", {
          requestId,
          windowId: window.id,
        })
        sendResponse({ success: true, windowId: window.id })
      } else {
        logTempWindow("openTempWindowFailed", {
          requestId,
          reason: "noWindowId",
        })
        sendResponse({
          success: false,
          error: t("messages:background.cannotCreateWindow"),
        })
      }
    } else {
      // 手机: 使用标签页
      const tab = await createTab(url, false)
      if (tab?.id) {
        tempWindows.set(requestId, tab.id)
        logTempWindow("openTempTabSuccess", {
          requestId,
          tabId: tab.id,
        })
        sendResponse({ success: true, tabId: tab.id })
      } else {
        logTempWindow("openTempTabFailed", {
          requestId,
          reason: "noTabId",
        })
        sendResponse({
          success: false,
          error: t("messages:background.cannotCreateWindow"),
        })
      }
    }
  } catch (error) {
    logTempWindow("openTempWindowError", {
      requestId: request?.requestId ?? null,
      error: getErrorMessage(error),
    })
    sendResponse({ success: false, error: getErrorMessage(error) })
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
    const id = tempWindows.get(requestId)

    logTempWindow("closeTempWindow", {
      requestId,
      mappedId: id ?? null,
      hasRequestContext: requestId
        ? tempRequestContextMap.has(requestId)
        : false,
    })

    if (id) {
      await removeTabOrWindow(id)
      tempWindows.delete(requestId)
      logTempWindow("closeTempWindowSuccess", {
        requestId,
        removedId: id,
      })
      sendResponse({ success: true })
      return
    }

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
 * 自动检测站点类型与用户信息，通过临时上下文访问目标站点。
 */
export async function handleAutoDetectSite(
  request: any,
  sendResponse: (response?: any) => void,
) {
  const { url, requestId } = request

  try {
    const [userData, siteType] = await Promise.all([
      getSiteDataFromTab(url, requestId),
      getSiteType(url),
    ])

    let result = null
    if (siteType && userData) {
      result = {
        siteType,
        ...(userData ?? {}),
      }
    }
    console.log("自动检测结果:", result)

    // 返回结果
    sendResponse({
      success: true,
      data: result,
    })
  } catch (error) {
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}

/**
 * 在临时上下文中执行跨域 fetch 请求，用于绕过需要真实浏览器环境的接口访问。
 */
export async function handleTempWindowFetch(
  request: any,
  sendResponse: (response?: any) => void,
) {
  const {
    originUrl,
    fetchUrl,
    fetchOptions,
    responseType = "json",
    requestId,
  } = request

  if (!originUrl || !fetchUrl) {
    sendResponse({
      success: false,
      error: t("messages:background.invalidFetchRequest"),
    })
    return
  }

  const tempRequestId = requestId || `temp-fetch-${Date.now()}`

  logTempWindow("tempWindowFetchStart", {
    requestId: tempRequestId,
    origin: originUrl ? normalizeOrigin(originUrl) : null,
    fetchUrl: fetchUrl ? sanitizeUrlForLog(fetchUrl) : null,
    responseType,
  })

  try {
    const context = await acquireTempContext(originUrl, tempRequestId)
    const { tabId } = context
    const response = await browser.tabs.sendMessage(tabId, {
      action: "performTempWindowFetch",
      requestId: tempRequestId,
      fetchUrl,
      fetchOptions: fetchOptions ?? {},
      responseType,
    })
    await releaseTempContext(tempRequestId)

    if (!response) {
      throw new Error("No response from temp window fetch")
    }

    sendResponse(response)
  } catch (error) {
    logTempWindow("tempWindowFetchError", {
      requestId: tempRequestId,
      error: getErrorMessage(error),
    })
    await releaseTempContext(tempRequestId, {
      forceClose: true,
      reason: "tempWindowFetchError",
    })
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}

/**
 * 通过打开临时标签页获取站点用户信息
 * @param url 页面地址（含 origin），用于确定要打开的临时窗口
 * @param requestId 用于标识本次请求的唯一 ID，便于释放上下文
 */
async function getSiteDataFromTab(url: string, requestId: string) {
  try {
    const context = await acquireTempContext(url, requestId)
    const { tabId } = context

    // 通过 content script 获取用户信息
    const userResponse = await browser.tabs.sendMessage(tabId, {
      action: "getUserFromLocalStorage",
      url: url,
    })

    await releaseTempContext(requestId)

    // 检查响应并返回结果
    if (!userResponse || !userResponse.success) {
      console.log("获取用户信息失败:", userResponse?.error)
      return null
    }

    return {
      userId: userResponse.data?.userId,
      user: userResponse.data?.user,
    }
  } catch (error) {
    console.error(error)
    logTempWindow("getSiteDataFromTabError", {
      requestId,
      origin: normalizeOrigin(url),
      error: getErrorMessage(error),
    })
    await releaseTempContext(requestId, {
      forceClose: true,
      reason: "getSiteDataFromTabError",
    })
    return null
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
          console.error(
            "[Background] Failed to destroy context from pool",
            error,
          )
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
async function acquireTempContext(url: string, requestId: string) {
  const origin = normalizeOrigin(url)

  logTempWindow("acquireTempContextStart", {
    requestId,
    origin,
  })

  return await withOriginLock(origin, async () => {
    // If this origin's pool is in the middle of being destroyed, do not
    // attempt to reuse or create a new context for it.
    if (destroyingOrigins.has(origin)) {
      throw new Error("Temp context pool is being destroyed for this origin")
    }

    let context = await getReusableContext(origin)
    if (!context) {
      logTempWindow("acquireTempContextCreate", {
        requestId,
        origin,
        url: sanitizeUrlForLog(url),
      })
      context = await createTempContextInstance(url, origin, requestId)
      registerContext(origin, context)
      logTempWindow("acquireTempContextCreated", {
        requestId,
        origin,
        contextId: context.id,
        tabId: context.tabId,
        type: context.type,
      })
    } else {
      logTempWindow("acquireTempContextReuse", {
        requestId,
        origin,
        contextId: context.id,
        tabId: context.tabId,
        type: context.type,
      })
    }

    // It's possible that during async operations the context or its pool was
    // marked for destruction. Perform a final validity check before using it.
    if (destroyingOrigins.has(origin) || !tempContextById.has(context.id)) {
      throw new Error("Acquired temp context is no longer valid")
    }

    context.busy = true
    context.lastUsed = Date.now()
    if (context.releaseTimer) {
      clearTimeout(context.releaseTimer)
      context.releaseTimer = undefined
    }

    tempRequestContextMap.set(requestId, context)
    logTempWindow("acquireTempContextSuccess", {
      requestId,
      origin,
      contextId: context.id,
      tabId: context.tabId,
      type: context.type,
    })
    return context
  })
}

/**
 * 释放与 requestId 关联的临时上下文：
 * - 支持强制关闭（forceClose）直接销毁窗口/标签页
 * - 否则标记为非 busy，并在空闲一段时间后按池粒度销毁。
 */
async function releaseTempContext(
  requestId: string,
  options: { forceClose?: boolean; reason?: string } = {},
) {
  logTempWindow("releaseTempContextScheduled", {
    requestId,
    forceClose: Boolean(options.forceClose),
    reason: options.reason ?? null,
  })
  // 延迟释放，提高并发时的复用率
  setTimeout(async () => {
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
      if (!tempContextById.has(context.id)) {
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
        await destroyContext(context, {
          reason: options.reason ?? "forceClose",
        })
        return
      }

      context.busy = false
      context.lastUsed = Date.now()

      const pool = tempContextsByOrigin.get(context.origin)
      if (pool && pool.every((ctx) => !ctx.busy)) {
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
  }, 2000)
}

/**
 * 从指定 origin 的上下文池中获取一个仍然存活的上下文：
 * - 不根据 busy 过滤，依赖 withOriginLock 保证同一 origin 串行
 * - 对已失效的上下文进行销毁并从池中移除。
 */
async function getReusableContext(origin: string) {
  const pool = tempContextsByOrigin.get(origin)
  if (!pool || pool.length === 0) {
    return null
  }

  // 注意：这里不检查 context.busy。
  // 同一 origin 的并发通过 withOriginLock 串行化：
  // - 后续请求会等待上一个请求释放再进入 acquireTempContext
  // - 然后复用同一个上下文，而不是在 busy=true 时跳过并创建新的窗口/标签页
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
 * 创建新的临时窗口/标签页上下文，并等待页面加载及 Cloudflare 校验通过。
 */
async function createTempContextInstance(
  url: string,
  origin: string,
  requestId: string,
) {
  let contextId: number | undefined
  let tabId: number | undefined
  let type: "window" | "tab" = "window"

  try {
    if (hasWindowsAPI()) {
      const window = await createWindow({
        url,
        type: "popup",
        width: 800,
        height: 600,
        focused: false,
      })

      if (!window?.id) {
        throw new Error(t("messages:background.cannotCreateWindowOrTab"))
      }

      contextId = window.id
      const tabs = await browser.tabs.query({
        windowId: window.id,
        active: true,
      })
      tabId = tabs[0]?.id
    } else {
      const tab = await createTab(url, false)
      contextId = tab?.id
      tabId = tab?.id
      type = "tab"
    }

    if (!contextId || !tabId) {
      throw new Error(t("messages:background.cannotCreateWindowOrTab"))
    }

    logTempWindow("createTempContextInstance", {
      requestId,
      origin,
      contextId,
      tabId,
      type,
      url: sanitizeUrlForLog(url),
    })

    await waitForTabComplete(tabId, { requestId, origin })

    logTempWindow("createTempContextInstanceReady", {
      requestId,
      origin,
      contextId,
      tabId,
      type,
    })

    return {
      id: contextId,
      tabId,
      origin,
      type,
      busy: false,
      lastUsed: Date.now(),
    }
  } catch (error) {
    logTempWindow("createTempContextInstanceError", {
      requestId,
      origin,
      contextId: contextId ?? null,
      tabId: tabId ?? null,
      type,
      error: getErrorMessage(error),
    })
    if (contextId) {
      try {
        await removeTabOrWindow(contextId)
      } catch (cleanupError) {
        console.warn(
          "[Background] Failed to cleanup temp context after creation error",
          cleanupError,
        )
      }
    }
    throw error
  }
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
 * 为上下文安排空闲销毁定时器，长时间未使用的窗口/标签页会被自动关闭。
 */
function scheduleContextCleanup(context: TempContext) {
  if (context.releaseTimer) {
    clearTimeout(context.releaseTimer)
  }

  logTempWindow("scheduleContextCleanup", {
    origin: context.origin,
    contextId: context.id,
    tabId: context.tabId,
    type: context.type,
    idleTimeoutMs: TEMP_CONTEXT_IDLE_TIMEOUT,
  })

  context.releaseTimer = setTimeout(() => {
    if (!context.busy) {
      logTempWindow("idleContextCleanupTriggered", {
        origin: context.origin,
        contextId: context.id,
        tabId: context.tabId,
        type: context.type,
      })
      destroyContext(context).catch((error) => {
        console.error("[Background] Failed to destroy idle temp context", error)
      })
    }
  }, TEMP_CONTEXT_IDLE_TIMEOUT)
}

/**
 * 销毁单个上下文：
 * - 从各种索引与池中移除
 * - 可选地关闭对应的窗口/标签页。
 */
async function destroyContext(
  context: TempContext,
  options: { skipBrowserRemoval?: boolean; reason?: string } = {},
) {
  if (!tempContextById.has(context.id)) {
    return
  }

  logTempWindow("destroyContext", {
    origin: context.origin,
    contextId: context.id,
    tabId: context.tabId,
    type: context.type,
    skipBrowserRemoval: Boolean(options.skipBrowserRemoval),
    reason: options.reason ?? null,
  })

  if (context.releaseTimer) {
    clearTimeout(context.releaseTimer)
    context.releaseTimer = undefined
  }

  tempContextById.delete(context.id)
  tempContextByTabId.delete(context.tabId)

  const pool = tempContextsByOrigin.get(context.origin)
  if (pool) {
    tempContextsByOrigin.set(
      context.origin,
      pool.filter((item) => item !== context),
    )
  }

  for (const [requestId, ctx] of tempRequestContextMap.entries()) {
    if (ctx === context) {
      tempRequestContextMap.delete(requestId)
    }
  }

  if (!options.skipBrowserRemoval) {
    try {
      await removeTabOrWindow(context.id)
    } catch (error) {
      console.warn("[Background] Failed to remove temp context", error)
    }
  }
}

/**
 * 检查上下文对应的标签页是否仍然存在，用于过滤已失效的上下文。
 */
async function isContextAlive(context: TempContext) {
  try {
    await browser.tabs.get(context.tabId)
    return true
  } catch {
    return false
  }
}

/**
 * 规范化 URL，返回 origin（协议 + 域名 + 端口）。
 */
function normalizeOrigin(url: string) {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

/**
 * 等待标签页加载完成并通过 Cloudflare 盾校验，超时或错误时抛出异常。
 */
function waitForTabComplete(
  tabId: number,
  meta?: { requestId?: string; origin?: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      logTempWindow("waitForTabCompleteTimeout", {
        tabId,
        requestId: meta?.requestId ?? null,
        origin: meta?.origin ?? null,
      })
      reject(new Error(t("messages:background.pageLoadTimeout")))
    }, 20000) // 20秒超时

    let attempts = 0
    let lastPassed: boolean | null = null
    let lastTabStatus: string | undefined

    logTempWindow("waitForTabCompleteStart", {
      tabId,
      requestId: meta?.requestId ?? null,
      origin: meta?.origin ?? null,
    })

    const checkStatus = async () => {
      try {
        const tab = await browser.tabs.get(tabId)

        attempts += 1
        if (tab.status !== lastTabStatus) {
          lastTabStatus = tab.status
          logTempWindow("waitForTabStatus", {
            tabId,
            requestId: meta?.requestId ?? null,
            origin: meta?.origin ?? null,
            status: tab.status,
            attempt: attempts,
          })
        }

        if (tab.status === "complete") {
          let passed = false
          try {
            const response = await browser.tabs.sendMessage(tabId, {
              action: "checkCloudflareGuard",
              requestId: meta?.requestId,
            })
            passed = Boolean(response?.success && response.passed)
          } catch (error) {
            console.warn(
              "[Background] CF check via content script failed",
              error,
            )
          }

          if (lastPassed !== passed) {
            lastPassed = passed
            logTempWindow("cfGuardCheck", {
              tabId,
              requestId: meta?.requestId ?? null,
              origin: meta?.origin ?? null,
              passed,
              attempt: attempts,
            })
          }
          if (passed) {
            clearTimeout(timeout)
            setTimeout(resolve, 500) // 再等待半秒，确保页面 JS 执行完
          } else {
            // 盾页面未通过，继续轮询
            setTimeout(checkStatus, 500)
          }
        } else {
          // 页面未完全加载，继续轮询
          setTimeout(checkStatus, 100)
        }
      } catch (error) {
        clearTimeout(timeout)
        logTempWindow("waitForTabCompleteError", {
          tabId,
          requestId: meta?.requestId ?? null,
          origin: meta?.origin ?? null,
          error: getErrorMessage(error),
        })
        reject(error)
      }
    }

    checkStatus()
  })
}
