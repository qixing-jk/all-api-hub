/**
 * Browser API 工具函数
 * 提供跨浏览器兼容的 API 封装和常用 fallback 逻辑
 */

import { isNotEmptyArray } from "~/utils/index"

// 确保 browser 全局对象可用
if (typeof (globalThis as any).browser === "undefined") {
  // Prefer chrome if present; otherwise leave undefined to fail fast where appropriate
  if (typeof (globalThis as any).chrome !== "undefined") {
    ;(globalThis as any).browser = (globalThis as any).chrome
  } else {
    // Optional: provide a minimal stub or log for non-extension environments
    console.warn("browser API unavailable: running outside extension context?")
  }
}

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
    console.debug(
      "getActiveTabs: currentWindow not supported, falling back to active-only",
      error
    )
  }

  // Fallback: 只使用 active
  try {
    return await queryTabs({ active: true })
  } catch (error) {
    console.warn(
      "getActiveTabs: active query failed, returning empty array",
      error
    )
    return []
  }
}

/**
 * 获取当前活动标签页（单个）
 */
export async function getActiveTab(): Promise<browser.tabs.Tab | null> {
  const tabs = await getActiveTabs()
  return tabs.length > 0 ? tabs[0] : null
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
 * Retrieves all browser tabs.
 * @returns {Promise<browser.tabs.Tab[]>} A promise resolved with an array of browser tabs or an empty array if no tabs are found.
 */
export async function getAllTabs(): Promise<browser.tabs.Tab[]> {
  return (await queryTabs({})) || []
}

/**
 * 创建新标签页
 * 统一接口，自动设置 active: true
 */
export async function createTab(
  url: string,
  active = true
): Promise<browser.tabs.Tab | undefined> {
  return await browser.tabs.create({ url, active })
}

/**
 * 更新标签页
 */
export async function updateTab(
  tabId: number,
  updateInfo: browser.tabs._UpdateUpdateProperties
): Promise<browser.tabs.Tab | undefined> {
  return await browser.tabs.update(tabId, updateInfo)
}

/**
 * 查询标签页
 */
export async function queryTabs(
  queryInfo: browser.tabs._QueryQueryInfo
): Promise<browser.tabs.Tab[]> {
  return await browser.tabs.query(queryInfo)
}

/**
 * 移除标签页或窗口
 * 自动检测平台能力并选择合适的 API
 */
export async function removeTabOrWindow(id: number): Promise<void> {
  if (hasWindowsAPI()) {
    try {
      await browser.windows.remove(id)
      return
    } catch (error) {
      // 如果不是窗口 ID，尝试作为标签页 ID
      console.debug(
        `removeTabOrWindow: Failed to remove as window (id=${id}), trying as tab`,
        error
      )
    }
  }

  // Firefox Android 或窗口 API 失败：使用标签页 API
  await browser.tabs.remove(id)
}

/**
 * 创建新窗口（如果支持）
 * 返回窗口对象，如果不支持则返回 null
 */
export async function createWindow(
  createData: browser.windows._CreateCreateData
): Promise<browser.windows.Window | null> {
  if (hasWindowsAPI()) {
    return await browser.windows.create(createData)
  }
  return null
}

/**
 * 检查是否支持 windows API
 */
export function hasWindowsAPI(): boolean {
  return !!browser.windows
}

/**
 * 聚焦标签页
 * 同时聚焦窗口（如果支持）和激活标签页
 */
export async function focusTab(tab: browser.tabs.Tab): Promise<void> {
  // 先聚焦窗口（如果支持）
  if (hasWindowsAPI() && tab.windowId != null) {
    try {
      await browser.windows.update(tab.windowId, { focused: true })
    } catch (error) {
      // Firefox Android 不支持，忽略错误
      console.error(error)
    }
  }

  // 再激活标签页
  if (tab.id != null) {
    await browser.tabs.update(tab.id, { active: true })
  }
}

/**
 * 发送消息到 runtime
 * 统一的消息发送接口
 */
export async function sendRuntimeMessage(
  message: any,
  options?: SendMessageRetryOptions
): Promise<any> {
  return await sendMessageWithRetry(message, options)
}

export type TempWindowResponseType = "json" | "text" | "arrayBuffer" | "blob"

export interface TempWindowFetchParams {
  originUrl: string
  fetchUrl: string
  fetchOptions?: Record<string, any>
  responseType?: TempWindowResponseType
  requestId?: string
}

export interface TempWindowFetchResult {
  success: boolean
  status?: number
  headers?: Record<string, string>
  data?: any
  error?: string
}

export async function tempWindowFetch(
  params: TempWindowFetchParams
): Promise<TempWindowFetchResult> {
  return await sendRuntimeMessage({
    action: "tempWindowFetch",
    ...params
  })
}

export interface SendMessageRetryOptions {
  maxAttempts?: number
  delayMs?: number
}

const RECOVERABLE_MESSAGE_SNIPPETS = [
  "Receiving end does not exist",
  "Could not establish connection"
]

function isRecoverableSendMessageError(error: any): boolean {
  const message = (error?.message || String(error || "")).toLowerCase()
  return RECOVERABLE_MESSAGE_SNIPPETS.some((snippet) =>
    message.includes(snippet.toLowerCase())
  )
}

export async function sendMessageWithRetry(
  message: any,
  options?: SendMessageRetryOptions
) {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 3)
  const delayMs = options?.delayMs ?? 500

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await browser.runtime.sendMessage(message)
    } catch (error) {
      const shouldRetry =
        attempt < maxAttempts - 1 && isRecoverableSendMessageError(error)

      if (!shouldRetry) {
        throw error
      }

      await new Promise((resolve) =>
        setTimeout(resolve, delayMs * Math.pow(2, attempt))
      )
    }
  }
}

/**
 * 获取扩展资源 URL
 */
export function getExtensionURL(path: string): string {
  return browser.runtime.getURL(path)
}

/**
 * 监听 runtime 消息
 * 返回清理函数
 *
 * 注意：callback 可以返回 true 来保持异步响应通道
 */
export function onRuntimeMessage(
  callback: (
    message: any,
    sender: browser.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) => void
): () => void {
  browser.runtime.onMessage.addListener(callback)
  return () => {
    browser.runtime.onMessage.removeListener(callback)
  }
}

/**
 * 监听标签页激活事件
 * 返回清理函数
 */
export function onTabActivated(
  callback: (activeInfo: browser.tabs._OnActivatedActiveInfo) => void
): () => void {
  browser.tabs.onActivated.addListener(callback)
  return () => {
    browser.tabs.onActivated.removeListener(callback)
  }
}

/**
 * 监听标签页更新事件
 * 返回清理函数
 */
export function onTabUpdated(
  callback: (
    tabId: number,
    changeInfo: browser.tabs._OnUpdatedChangeInfo,
    tab: browser.tabs.Tab
  ) => void
): () => void {
  browser.tabs.onUpdated.addListener(callback)
  return () => {
    browser.tabs.onUpdated.removeListener(callback)
  }
}

/**
 * 监听标签页移除事件
 * 返回清理函数
 */
export function onTabRemoved(
  callback: (
    tabId: number,
    removeInfo: browser.tabs._OnRemovedRemoveInfo
  ) => void
): () => void {
  browser.tabs.onRemoved.addListener(callback)
  return () => {
    browser.tabs.onRemoved.removeListener(callback)
  }
}

/**
 * 监听窗口移除事件（如果支持）
 * 返回清理函数
 */
export function onWindowRemoved(
  callback: (windowId: number) => void
): () => void {
  if (hasWindowsAPI()) {
    browser.windows.onRemoved.addListener(callback)
    return () => {
      browser.windows.onRemoved.removeListener(callback)
    }
  }
  return () => {} // 不支持时返回空函数
}

/**
 * 监听扩展启动事件
 */
export function onStartup(callback: () => void): () => void {
  browser.runtime.onStartup.addListener(callback)
  return () => {
    browser.runtime.onStartup.removeListener(callback)
  }
}

/**
 * 监听扩展安装/更新事件
 */
export function onInstalled(callback: (details: any) => void): () => void {
  browser.runtime.onInstalled.addListener(callback)
  return () => {
    browser.runtime.onInstalled.removeListener(callback)
  }
}

export const openSidePanel = async () => {
  // Firefox
  if (typeof browser !== "undefined" && browser.sidebarAction) {
    return browser.sidebarAction.open()
  }

  // Chrome
  if (typeof chrome !== "undefined" && chrome.sidePanel) {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    })
    return chrome.sidePanel.open({ windowId: tab.windowId })
  }

  throw new Error("Sidebar not supported")
}

/**
 * 检查是否支持 alarms API
 */
export function hasAlarmsAPI(): boolean {
  return !!browser.alarms
}

/**
 * 创建定时任务
 */
export async function createAlarm(
  name: string,
  alarmInfo: {
    periodInMinutes?: number
    delayInMinutes?: number
    when?: number
  }
): Promise<void> {
  if (!hasAlarmsAPI()) {
    console.warn("Alarms API not supported")
    return
  }
  return browser.alarms.create(name, alarmInfo)
}

/**
 * 清除定时任务
 */
export async function clearAlarm(name: string): Promise<boolean> {
  if (!hasAlarmsAPI()) {
    console.warn("Alarms API not supported")
    return false
  }
  return (await browser.alarms.clear(name)) || false
}

/**
 * 获取定时任务
 */
export async function getAlarm(
  name: string
): Promise<browser.alarms.Alarm | undefined> {
  if (!hasAlarmsAPI()) {
    console.warn("Alarms API not supported")
    return undefined
  }
  return await browser.alarms.get(name)
}

/**
 * 获取所有定时任务
 */
export async function getAllAlarms(): Promise<browser.alarms.Alarm[]> {
  if (!hasAlarmsAPI()) {
    console.warn("Alarms API not supported")
    return []
  }
  return (await browser.alarms.getAll()) || []
}

/**
 * 监听定时任务触发事件
 * 返回清理函数
 */
export function onAlarm(
  callback: (alarm: browser.alarms.Alarm) => void
): () => void {
  if (!hasAlarmsAPI()) {
    console.warn("Alarms API not supported")
    return () => {}
  }
  browser.alarms.onAlarm.addListener(callback)
  return () => {
    browser.alarms.onAlarm.removeListener(callback)
  }
}

/**
 * 获取当前扩展的 manifest 版本
 */
export function getManifestVersion(): number {
  return browser.runtime.getManifest().manifest_version
}

export function getManifest(): browser._manifest.WebExtensionManifest {
  return browser.runtime.getManifest()
}

// Permissions helpers
export async function containsPermissions(
  permissions: browser.permissions.Permissions
): Promise<boolean> {
  try {
    return await browser.permissions.contains(permissions)
  } catch (error) {
    console.error("permissions.contains failed", permissions, error)
    return false
  }
}

export async function requestPermissions(
  permissions: browser.permissions.Permissions
): Promise<boolean> {
  try {
    return await browser.permissions.request(permissions)
  } catch (error) {
    console.error("permissions.request failed", permissions, error)
    return false
  }
}

export async function removePermissions(
  permissions: browser.permissions.Permissions
): Promise<boolean> {
  try {
    return await browser.permissions.remove(permissions)
  } catch (error) {
    console.error("permissions.remove failed", permissions, error)
    return false
  }
}

export function onPermissionsAdded(
  callback: (permissions: browser.permissions.Permissions) => void
): () => void {
  browser.permissions.onAdded.addListener(callback)
  return () => browser.permissions.onAdded.removeListener(callback)
}

export function onPermissionsRemoved(
  callback: (permissions: browser.permissions.Permissions) => void
): () => void {
  browser.permissions.onRemoved.addListener(callback)
  return () => browser.permissions.onRemoved.removeListener(callback)
}
