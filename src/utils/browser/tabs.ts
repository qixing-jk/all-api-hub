import { isNotEmptyArray } from "~/utils"
import { browserApiLogger as logger } from "~/utils/browser/browserEnvironment"
import { hasWindowsAPI } from "~/utils/browser/windows"

/**
 * 获取当前活动标签页
 * 自动处理 Firefox Android 不支持 currentWindow 的情况
 */
export async function getActiveTabs(): Promise<browser.tabs.Tab[]> {
  try {
    // 优先尝试使用 currentWindow
    const tabs = await queryTabs({ active: true, currentWindow: true })
    if (tabs && tabs.length > 0) {
      return tabs
    }
  } catch (error) {
    // Firefox Android fallback
    logger.debug(
      "getActiveTabs: currentWindow not supported, falling back to active-only",
      error,
    )
  }

  // Fallback: 只使用 active
  try {
    return await queryTabs({ active: true })
  } catch (error) {
    logger.warn(
      "getActiveTabs: active query failed, returning empty array",
      error,
    )
    return []
  }
}

/**
 * 获取当前活动标签页（单个）
 */
export async function getActiveTab(): Promise<browser.tabs.Tab | null> {
  const tabs = await getActiveTabs()
  return tabs[0] ?? null
}

/**
 * 返回所有浏览器标签页，优先返回当前活动的标签页。
 * 如果未找到任何活动的标签页，则查询所有标签页作为备选方案。
 *
 * 返回一个浏览器标签页对象数组，如果未找到任何标签页，则返回一个空数组。
 */
export async function getActiveOrAllTabs() {
  let tabs
  tabs = await getActiveTabs()
  if (!isNotEmptyArray(tabs)) {
    tabs = await getAllTabs()
  }
  return tabs || []
}

/**
 * Retrieves all browser tabs and falls back to an empty array if the API returns nullish.
 */
export async function getAllTabs(): Promise<browser.tabs.Tab[]> {
  return (await queryTabs({})) || []
}

/**
 * 创建新标签页
 * 统一接口，自动设置 active: true
 * @param url 新标签页要打开的 URL。
 * @param active 是否在创建后立即激活该标签页。
 */
export async function createTab(
  url: string,
  active = true,
  options?: { windowId?: number },
): Promise<browser.tabs.Tab | undefined> {
  return await browser.tabs.create({
    url,
    active,
    windowId: options?.windowId,
  })
}

/**
 * 更新标签页
 * @param tabId 需要更新的标签页 ID。
 * @param updateInfo 浏览器标签页更新参数。
 */
export async function updateTab(
  tabId: number,
  updateInfo: browser.tabs._UpdateUpdateProperties,
): Promise<browser.tabs.Tab | undefined> {
  return await browser.tabs.update(tabId, updateInfo)
}

/**
 * Retrieves a tab by id.
 * @param tabId Target tab ID.
 */
export async function getTab(tabId: number): Promise<browser.tabs.Tab> {
  return await browser.tabs.get(tabId)
}

/**
 * Reloads a tab by id.
 * @param tabId Target tab ID.
 */
export async function reloadTab(tabId: number): Promise<void> {
  await browser.tabs.reload(tabId)
}

/**
 * 查询标签页
 * @param queryInfo 标签查询条件对象。
 */
export async function queryTabs(
  queryInfo: browser.tabs._QueryQueryInfo,
): Promise<browser.tabs.Tab[]> {
  return await browser.tabs.query(queryInfo)
}

/**
 * Removes a known browser tab without probing other removal APIs.
 */
export async function removeTab(tabId: number): Promise<void> {
  await browser.tabs.remove(tabId)
}

/**
 * 聚焦标签页
 * 同时聚焦窗口（如果支持）和激活标签页
 * @param tab 需要聚焦的浏览器标签页对象。
 */
export async function focusTab(tab: browser.tabs.Tab): Promise<void> {
  // 先聚焦窗口（如果支持）
  if (hasWindowsAPI() && tab.windowId != null) {
    try {
      await browser.windows.update(tab.windowId, { focused: true })
    } catch (error) {
      // Firefox Android 不支持，忽略错误
      logger.debug("focusTab: browser.windows.update failed", error)
    }
  }

  // 再激活标签页
  if (tab.id != null) {
    await browser.tabs.update(tab.id, { active: true })
  }
}

/**
 * 监听标签页激活事件
 * 返回清理函数
 * @param callback 激活信息发生变化时调用的回调函数。
 */
export function onTabActivated(
  callback: (activeInfo: browser.tabs._OnActivatedActiveInfo) => void,
): () => void {
  browser.tabs.onActivated.addListener(callback)
  return () => {
    browser.tabs.onActivated.removeListener(callback)
  }
}

/**
 * 监听标签页更新事件
 * 返回清理函数
 * @param callback 标签页更新时调用的处理函数。
 */
export function onTabUpdated(
  callback: (
    tabId: number,
    changeInfo: browser.tabs._OnUpdatedChangeInfo,
    tab: browser.tabs.Tab,
  ) => void,
): () => void {
  browser.tabs.onUpdated.addListener(callback)
  return () => {
    browser.tabs.onUpdated.removeListener(callback)
  }
}

/**
 * 监听标签页移除事件
 * 返回清理函数
 * @param callback 标签页被移除时调用的处理函数。
 */
export function onTabRemoved(
  callback: (
    tabId: number,
    removeInfo: browser.tabs._OnRemovedRemoveInfo,
  ) => void,
): () => void {
  browser.tabs.onRemoved.addListener(callback)
  return () => {
    browser.tabs.onRemoved.removeListener(callback)
  }
}
