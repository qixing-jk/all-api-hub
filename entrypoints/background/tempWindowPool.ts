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

const TEMP_CONTEXT_IDLE_TIMEOUT = 5000

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
  for (const [requestId, storedId] of tempWindows.entries()) {
    if (storedId === windowId) {
      tempWindows.delete(requestId)
      break
    }
  }

  const context = tempContextById.get(windowId)
  if (context && context.type === "window") {
    withOriginLock(context.origin, () =>
      destroyContext(context, { skipBrowserRemoval: true }),
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
  for (const [requestId, storedId] of tempWindows.entries()) {
    if (storedId === tabId) {
      tempWindows.delete(requestId)
      break
    }
  }

  const context = tempContextByTabId.get(tabId)
  if (context && context.type === "tab") {
    withOriginLock(context.origin, () =>
      destroyContext(context, { skipBrowserRemoval: true }),
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
        sendResponse({ success: true, windowId: window.id })
      } else {
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
        sendResponse({ success: true, tabId: tab.id })
      } else {
        sendResponse({
          success: false,
          error: t("messages:background.cannotCreateWindow"),
        })
      }
    }
  } catch (error) {
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

    if (id) {
      await removeTabOrWindow(id)
      tempWindows.delete(requestId)
      sendResponse({ success: true })
      return
    }

    if (requestId && tempRequestContextMap.has(requestId)) {
      await releaseTempContext(requestId, { forceClose: true })
      sendResponse({ success: true })
      return
    }

    sendResponse({
      success: false,
      error: t("messages:background.windowNotFound"),
    })
  } catch (error) {
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
      error:
        t("messages:background.invalidFetchRequest", "Invalid fetch request") ||
        "Invalid fetch request",
    })
    return
  }

  const tempRequestId = requestId || `temp-fetch-${Date.now()}`

  try {
    const context = await acquireTempContext(originUrl, tempRequestId)
    const { tabId } = context
    const response = await browser.tabs.sendMessage(tabId, {
      action: "performTempWindowFetch",
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
    await releaseTempContext(tempRequestId, { forceClose: true })
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}

/**
 * 通过打开临时标签页获取站点用户信息
 * @param url
 * @param requestId
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
    await releaseTempContext(requestId, { forceClose: true })
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
async function destroyOriginPool(origin: string, pool?: TempContext[]) {
  const contexts = pool ?? tempContextsByOrigin.get(origin)
  if (!contexts || contexts.length === 0) {
    return
  }

  await Promise.all(
    contexts.map((ctx) =>
      destroyContext(ctx).catch((error) => {
        console.error("[Background] Failed to destroy context from pool", error)
      }),
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

  return await withOriginLock(origin, async () => {
    // If this origin's pool is in the middle of being destroyed, do not
    // attempt to reuse or create a new context for it.
    if (destroyingOrigins.has(origin)) {
      throw new Error("Temp context pool is being destroyed for this origin")
    }

    let context = await getReusableContext(origin)
    if (!context) {
      context = await createTempContextInstance(url, origin)
      registerContext(origin, context)
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
  options: { forceClose?: boolean } = {},
) {
  // 延迟释放，提高并发时的复用率
  setTimeout(async () => {
    const context = tempRequestContextMap.get(requestId)
    tempRequestContextMap.delete(requestId)

    if (!context) {
      return
    }

    await withOriginLock(context.origin, async () => {
      if (!tempContextById.has(context.id)) {
        return
      }

      if (options.forceClose) {
        await destroyContext(context)
        return
      }

      context.busy = false
      context.lastUsed = Date.now()

      const pool = tempContextsByOrigin.get(context.origin)
      if (pool && pool.every((ctx) => !ctx.busy)) {
        // Mark this origin as destroying while we tear down the pool. Any
        // concurrent acquire attempts for this origin will be rejected by
        // acquireTempContext until destruction finishes.
        destroyingOrigins.add(context.origin)
        try {
          await destroyOriginPool(context.origin, pool)
        } finally {
          destroyingOrigins.delete(context.origin)
        }
      } else {
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

    await destroyContext(context, { skipBrowserRemoval: true })
  }

  return null
}

/**
 * 创建新的临时窗口/标签页上下文，并等待页面加载及 Cloudflare 校验通过。
 */
async function createTempContextInstance(url: string, origin: string) {
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

    await waitForTabComplete(tabId)

    return {
      id: contextId,
      tabId,
      origin,
      type,
      busy: false,
      lastUsed: Date.now(),
    }
  } catch (error) {
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

  context.releaseTimer = setTimeout(() => {
    if (!context.busy) {
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
  options: { skipBrowserRemoval?: boolean } = {},
) {
  if (!tempContextById.has(context.id)) {
    return
  }

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
function waitForTabComplete(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(t("messages:background.pageLoadTimeout")))
    }, 20000) // 20秒超时

    const checkStatus = async () => {
      try {
        const tab = await browser.tabs.get(tabId)

        if (tab.status === "complete") {
          let passed = false
          try {
            const response = await browser.tabs.sendMessage(tabId, {
              action: "checkCloudflareGuard",
            })
            passed = Boolean(response?.success && response.passed)
          } catch (error) {
            console.warn(
              "[Background] CF check via content script failed",
              error,
            )
          }

          console.log(`[Background] Tab ${tabId} CF check result:`, passed)
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
        reject(error)
      }
    }

    checkStatus()
  })
}
