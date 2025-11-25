import { t } from "i18next"

import { initBackgroundI18n } from "~/utils/background-i18n.ts"

import { accountStorage } from "../services/accountStorage"
import {
  autoCheckinScheduler,
  handleAutoCheckinMessage
} from "../services/autoCheckin/scheduler"
import {
  autoRefreshService,
  handleAutoRefreshMessage
} from "../services/autoRefreshService"
import { handleChannelConfigMessage } from "../services/channelConfigStorage"
import { migrateAccountsConfig } from "../services/configMigration/account/accountDataMigration.ts"
import { getSiteType } from "../services/detectSiteType"
import { modelMetadataService } from "../services/modelMetadata"
import {
  handleNewApiModelSyncMessage,
  newApiModelSyncScheduler
} from "../services/newApiModelSync"
import { userPreferences } from "../services/userPreferences"
import {
  handleWebdavAutoSyncMessage,
  webdavAutoSyncService
} from "../services/webdav/webdavAutoSyncService.ts"
import {
  createTab,
  createWindow,
  hasWindowsAPI,
  onInstalled,
  onRuntimeMessage,
  onTabRemoved,
  onWindowRemoved,
  removeTabOrWindow
} from "../utils/browserApi"
import { getErrorMessage } from "../utils/error"

export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id })
  main()
})

async function main() {
  // 手动打开的临时窗口/标签页
  const tempWindows = new Map<string, number>()

  type TempContext = {
    id: number
    tabId: number
    origin: string
    type: "window" | "tab"
    busy: boolean
    lastUsed: number
    releaseTimer?: ReturnType<typeof setTimeout>
  }

  const tempRequestContextMap = new Map<string, TempContext>()
  const tempContextById = new Map<number, TempContext>()
  const tempContextByTabId = new Map<number, TempContext>()
  const tempContextsByOrigin = new Map<string, TempContext[]>()
  const originLocks = new Map<string, Promise<void>>()

  const TEMP_CONTEXT_IDLE_TIMEOUT = 5000

  let servicesInitialized = false

  async function initializeServices() {
    if (servicesInitialized) {
      console.log("[Background] 服务已初始化，跳过")
      return
    }

    console.log("[Background] 初始化服务...")
    await initBackgroundI18n()
    await modelMetadataService.initialize().catch((error) => {
      console.warn("[Background] Model metadata initialization failed:", error)
    })
    await autoRefreshService.initialize()
    await webdavAutoSyncService.initialize()
    await newApiModelSyncScheduler.initialize()
    await autoCheckinScheduler.initialize()

    servicesInitialized = true
  }

  await initializeServices()

  // 插件安装时初始化自动刷新服务和WebDAV自动同步服务
  onInstalled(async (details) => {
    console.log(
      "[Background] 插件安装/更新，初始化自动刷新服务和WebDAV自动同步服务"
    )
    await initializeServices()

    if (details.reason === "install" || details.reason === "update") {
      console.log(`Extension ${details.reason}: triggering config migration`)

      // Migrate user preferences
      await userPreferences.getPreferences()
      console.log("[Background] User preferences migration completed")

      // Load all accounts and migrate
      const accounts = await accountStorage.getAllAccounts()
      const { accounts: migrated, migratedCount } =
        migrateAccountsConfig(accounts)

      if (migratedCount > 0) {
        // Save migrated accounts back
        const config = await accountStorage.exportData()
        await accountStorage.importData({ ...config, accounts: migrated })
        console.log(`Migration complete: ${migratedCount} accounts updated`)
      }
    }
  })

  // 处理来自 popup 的消息
  onRuntimeMessage((request, _sender, sendResponse) => {
    if (request.action === "openTempWindow") {
      handleOpenTempWindow(request, sendResponse)
      return true // 保持异步响应通道
    }

    if (request.action === "closeTempWindow") {
      handleCloseTempWindow(request, sendResponse)
      return true
    }

    if (request.action === "autoDetectSite") {
      handleAutoDetectSite(request, sendResponse)
      return true
    }

    if (request.action === "tempWindowFetch") {
      handleTempWindowFetch(request, sendResponse)
      return true
    }

    // 处理自动刷新相关消息
    if (
      (request.action && request.action.startsWith("autoRefresh")) ||
      [
        "setupAutoRefresh",
        "refreshNow",
        "stopAutoRefresh",
        "updateAutoRefreshSettings",
        "getAutoRefreshStatus"
      ].includes(request.action)
    ) {
      handleAutoRefreshMessage(request, sendResponse)
      return true
    }

    // 处理WebDAV自动同步相关消息
    if (request.action && request.action.startsWith("webdavAutoSync:")) {
      handleWebdavAutoSyncMessage(request, sendResponse)
      return true
    }

    // 处理New API模型同步相关消息
    if (request.action && request.action.startsWith("newApiModelSync:")) {
      handleNewApiModelSyncMessage(request, sendResponse)
      return true
    }

    // 处理Auto Check-in相关消息
    if (request.action && request.action.startsWith("autoCheckin:")) {
      handleAutoCheckinMessage(request, sendResponse)
      return true
    }

    // 处理Channel Config相关消息
    if (request.action && request.action.startsWith("channelConfig:")) {
      handleChannelConfigMessage(request, sendResponse)
      return true
    }
  })

  // 监听窗口/标签页关闭事件，清理记录
  onWindowRemoved((windowId) => {
    for (const [requestId, storedId] of tempWindows.entries()) {
      if (storedId === windowId) {
        tempWindows.delete(requestId)
        break
      }
    }

    const context = tempContextById.get(windowId)
    if (context && context.type === "window") {
      withOriginLock(context.origin, () =>
        destroyContext(context, { skipBrowserRemoval: true })
      ).catch((error) => {
        console.error(
          "[Background] Failed to cleanup removed window context",
          error
        )
      })
    }
  })

  // 手机: 监听标签页关闭
  onTabRemoved((tabId) => {
    for (const [requestId, storedId] of tempWindows.entries()) {
      if (storedId === tabId) {
        tempWindows.delete(requestId)
        break
      }
    }

    const context = tempContextByTabId.get(tabId)
    if (context && context.type === "tab") {
      withOriginLock(context.origin, () =>
        destroyContext(context, { skipBrowserRemoval: true })
      ).catch((error) => {
        console.error(
          "[Background] Failed to cleanup removed tab context",
          error
        )
      })
    }
  })

  // 打开临时窗口访问指定站点
  async function handleOpenTempWindow(
    request: any,
    sendResponse: (response?: any) => void
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
          focused: false
        })

        if (window?.id) {
          // 记录窗口ID
          tempWindows.set(requestId, window.id)
          sendResponse({ success: true, windowId: window.id })
        } else {
          sendResponse({
            success: false,
            error: t("messages:background.cannotCreateWindow")
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
            error: t("messages:background.cannotCreateWindow")
          })
        }
      }
    } catch (error) {
      sendResponse({ success: false, error: getErrorMessage(error) })
    }
  }

  async function withOriginLock<T>(
    origin: string,
    task: () => Promise<T>
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

  async function destroyOriginPool(origin: string, pool?: TempContext[]) {
    const contexts = pool ?? tempContextsByOrigin.get(origin)
    if (!contexts || contexts.length === 0) {
      return
    }

    await Promise.all(
      contexts.map((ctx) =>
        destroyContext(ctx).catch((error) => {
          console.error(
            "[Background] Failed to destroy context from pool",
            error
          )
        })
      )
    )
  }

  // 关闭临时窗口
  async function handleCloseTempWindow(
    request: any,
    sendResponse: (response?: any) => void
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
        error: t("messages:background.windowNotFound")
      })
    } catch (error) {
      sendResponse({ success: false, error: getErrorMessage(error) })
    }
  }

  // 自动检测站点信息
  async function handleAutoDetectSite(
    request: any,
    sendResponse: (response?: any) => void
  ) {
    const { url, requestId } = request

    try {
      const [userData, siteType] = await Promise.all([
        getSiteDataFromTab(url, requestId),
        getSiteType(url)
      ])

      let result = null
      if (siteType && userData) {
        result = {
          siteType,
          ...(userData ?? {})
        }
      }
      console.log("自动检测结果:", result)

      // 5. 返回结果
      sendResponse({
        success: true,
        data: result
      })
    } catch (error) {
      sendResponse({ success: false, error: getErrorMessage(error) })
    }
  }

  async function handleTempWindowFetch(
    request: any,
    sendResponse: (response?: any) => void
  ) {
    const {
      originUrl,
      fetchUrl,
      fetchOptions,
      responseType = "json",
      requestId
    } = request

    if (!originUrl || !fetchUrl) {
      sendResponse({
        success: false,
        error:
          t(
            "messages:background.invalidFetchRequest",
            "Invalid fetch request"
          ) || "Invalid fetch request"
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
        responseType
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

      // 3. 通过 content script 获取用户信息
      const userResponse = await browser.tabs.sendMessage(tabId, {
        action: "getUserFromLocalStorage",
        url: url
      })

      await releaseTempContext(requestId)

      // 5. 检查响应并返回结果
      if (!userResponse || !userResponse.success) {
        console.log("获取用户信息失败:", userResponse?.error)
        return null
      }

      return {
        userId: userResponse.data?.userId,
        user: userResponse.data?.user
      }
    } catch (error) {
      console.error(error)
      await releaseTempContext(requestId, { forceClose: true })
      return null
    }
  }

  async function acquireTempContext(url: string, requestId: string) {
    const origin = normalizeOrigin(url)

    return await withOriginLock(origin, async () => {
      let context = await getReusableContext(origin)
      if (!context) {
        context = await createTempContextInstance(url, origin)
        registerContext(origin, context)
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

  async function releaseTempContext(
    requestId: string,
    options: { forceClose?: boolean } = {}
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
          await destroyOriginPool(context.origin, pool)
        } else {
          scheduleContextCleanup(context)
        }
      })
    }, 2000)
  }

  async function getReusableContext(origin: string) {
    const pool = tempContextsByOrigin.get(origin)
    if (!pool || pool.length === 0) {
      return null
    }

    for (const context of pool) {
      if (await isContextAlive(context)) {
        return context
      }

      await destroyContext(context, { skipBrowserRemoval: true })
    }

    return null
  }

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
          focused: false
        })

        if (!window?.id) {
          throw new Error(t("messages:background.cannotCreateWindowOrTab"))
        }

        contextId = window.id
        const tabs = await browser.tabs.query({
          windowId: window.id,
          active: true
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
        lastUsed: Date.now()
      }
    } catch (error) {
      if (contextId) {
        try {
          await removeTabOrWindow(contextId)
        } catch (cleanupError) {
          console.warn(
            "[Background] Failed to cleanup temp context after creation error",
            cleanupError
          )
        }
      }
      throw error
    }
  }

  function registerContext(origin: string, context: TempContext) {
    tempContextById.set(context.id, context)
    tempContextByTabId.set(context.tabId, context)

    const pool = tempContextsByOrigin.get(origin) ?? []
    pool.push(context)
    tempContextsByOrigin.set(origin, pool)
  }

  function scheduleContextCleanup(context: TempContext) {
    if (context.releaseTimer) {
      clearTimeout(context.releaseTimer)
    }

    context.releaseTimer = setTimeout(() => {
      if (!context.busy) {
        destroyContext(context).catch((error) => {
          console.error(
            "[Background] Failed to destroy idle temp context",
            error
          )
        })
      }
    }, TEMP_CONTEXT_IDLE_TIMEOUT)
  }

  async function destroyContext(
    context: TempContext,
    options: { skipBrowserRemoval?: boolean } = {}
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
        pool.filter((item) => item !== context)
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

  async function isContextAlive(context: TempContext) {
    try {
      await browser.tabs.get(context.tabId)
      return true
    } catch {
      return false
    }
  }

  function normalizeOrigin(url: string) {
    try {
      return new URL(url).origin
    } catch {
      return url
    }
  }
}

// 等待标签页加载完成
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
              action: "checkCloudflareGuard"
            })
            passed = Boolean(response?.success && response.passed)
          } catch (error) {
            console.warn(
              "[Background] CF check via content script failed",
              error
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
