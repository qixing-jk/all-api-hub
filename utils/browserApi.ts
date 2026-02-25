/**
 * Browser API 工具函数
 * 提供跨浏览器兼容的 API 封装和常用 fallback 逻辑
 */

import { APP_SHORT_NAME } from "~/constants/branding"
import {
  RuntimeActionIds,
  type RuntimeActionId,
} from "~/constants/runtimeActions"
import { isNotEmptyArray } from "~/utils/index"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to cross-browser WebExtension API helpers.
 */
const logger = createLogger("BrowserApi")

// 确保 browser 全局对象可用
if (typeof (globalThis as any).browser === "undefined") {
  // Prefer chrome if present; otherwise leave undefined to fail fast where appropriate
  if (typeof (globalThis as any).chrome !== "undefined") {
    ;(globalThis as any).browser = (globalThis as any).chrome
  } else {
    // Optional: provide a minimal stub or log for non-extension environments
    logger.warn("browser API unavailable: running outside extension context?")
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
 * 查询标签页
 * @param queryInfo 标签查询条件对象。
 */
export async function queryTabs(
  queryInfo: browser.tabs._QueryQueryInfo,
): Promise<browser.tabs.Tab[]> {
  return await browser.tabs.query(queryInfo)
}

/**
 * 移除标签页或窗口
 * 自动检测平台能力并选择合适的 API
 * @param id 目标窗口或标签页的 ID。
 */
export async function removeTabOrWindow(id: number): Promise<void> {
  if (hasWindowsAPI()) {
    try {
      await browser.windows.remove(id)
      return
    } catch (error) {
      // 如果不是窗口 ID，尝试作为标签页 ID
      logger.debug(
        "removeTabOrWindow: Failed to remove as window, trying as tab",
        {
          id,
          error,
        },
      )
    }
  }

  // Firefox Android 或窗口 API 失败：使用标签页 API
  await browser.tabs.remove(id)
}

/**
 * 创建新窗口（如果支持）
 * 返回窗口对象，如果不支持则返回 null
 * @param createData 用于创建窗口的配置数据。
 */
export async function createWindow(
  createData: browser.windows._CreateCreateData,
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
 * 发送消息到 runtime
 * 统一的消息发送接口
 * @param message 要发送到 runtime 的消息负载。
 * @param options 可选的重试和延迟配置。
 */
export async function sendRuntimeMessage(
  message: any,
  options?: SendMessageRetryOptions,
): Promise<any> {
  return await sendMessageWithRetry(message, options)
}

/**
 * Sends a runtime message whose `action` is a canonical {@link RuntimeActionId}.
 *
 * This is a thin wrapper over {@link sendRuntimeMessage} that preserves payload
 * and options unchanged while providing better type-safety for runtime action IDs.
 */
export async function sendRuntimeActionMessage(
  message: { action: RuntimeActionId } & Record<string, unknown>,
  options?: SendMessageRetryOptions,
): Promise<any> {
  return await sendRuntimeMessage(message, options)
}

export interface SendMessageRetryOptions {
  maxAttempts?: number
  delayMs?: number
}

const RECOVERABLE_MESSAGE_SNIPPETS = [
  "Receiving end does not exist",
  "Could not establish connection",
]

/**
 * Determines whether a WebExtension messaging error is transient and worth retrying.
 *
 * Applies to both `browser.runtime.sendMessage` and `browser.tabs.sendMessage`,
 * where content scripts may not be ready yet.
 */
function isRecoverableMessageError(error: any): boolean {
  const message = (error?.message || String(error || "")).toLowerCase()
  return RECOVERABLE_MESSAGE_SNIPPETS.some((snippet) =>
    message.includes(snippet.toLowerCase()),
  )
}

type MessageRetryDefaults = {
  maxAttempts: number
  delayMs: number
}

/**
 * Internal helper to retry WebExtension messaging work with exponential backoff.
 */
async function withMessageRetry<T>(
  work: () => Promise<T>,
  options: SendMessageRetryOptions | undefined,
  defaults: MessageRetryDefaults,
): Promise<T> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? defaults.maxAttempts)
  const delayMs = options?.delayMs ?? defaults.delayMs

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await work()
    } catch (error) {
      const shouldRetry =
        attempt < maxAttempts - 1 && isRecoverableMessageError(error)

      if (!shouldRetry) {
        throw error
      }

      await new Promise((resolve) =>
        setTimeout(resolve, delayMs * Math.pow(2, attempt)),
      )
    }
  }

  // `work()` either returns or throws; this is just to satisfy TypeScript.
  throw new Error("withMessageRetry: exhausted retries")
}

/**
 * Sends a runtime message with retry logic for recoverable failures.
 * Applies exponential backoff based on `maxAttempts` and `delayMs`.
 * @param message Payload forwarded to the background/page runtime.
 * @param options Optional retry configuration.
 */
export async function sendMessageWithRetry(
  message: any,
  options?: SendMessageRetryOptions,
) {
  return await withMessageRetry(
    () => browser.runtime.sendMessage(message),
    options,
    { maxAttempts: 3, delayMs: 500 },
  )
}

/**
 * Sends a message to a tab content script with retry logic for recoverable failures.
 *
 * This is useful when a tab has just been created and the content script might
 * not be ready to receive messages yet.
 *
 * Applies exponential backoff based on `maxAttempts` and `delayMs`.
 */
export async function sendTabMessageWithRetry(
  tabId: number,
  message: any,
  options?: SendMessageRetryOptions,
): Promise<any> {
  return await withMessageRetry(
    () => browser.tabs.sendMessage(tabId, message),
    options,
    { maxAttempts: 5, delayMs: 400 },
  )
}

/**
 * 获取扩展资源 URL
 * @param path 扩展内资源的相对路径。
 */
export function getExtensionURL(path: string): string {
  return browser.runtime.getURL(path)
}

/**
 * 监听 runtime 消息
 * 返回清理函数
 *
 * 注意：callback 可以返回 true 来保持异步响应通道
 * @param callback 收到消息时触发的处理函数。
 */
export function onRuntimeMessage(
  callback: (
    message: any,
    sender: browser.runtime.MessageSender,
    sendResponse: (response?: any) => void,
  ) => void,
): () => void {
  browser.runtime.onMessage.addListener(callback)
  return () => {
    browser.runtime.onMessage.removeListener(callback)
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

/**
 * 监听窗口移除事件（如果支持）
 * 返回清理函数
 * @param callback 窗口被移除时调用的处理函数。
 */
export function onWindowRemoved(
  callback: (windowId: number) => void,
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
 * @param callback 扩展启动时执行的回调函数。
 */
export function onStartup(callback: () => void | Promise<void>): () => void {
  browser.runtime.onStartup.addListener(callback)
  return () => {
    browser.runtime.onStartup.removeListener(callback)
  }
}

/**
 * 监听扩展安装/更新事件
 * @param callback 安装或更新时触发的处理函数。
 */
export function onInstalled(
  callback: (
    details: browser.runtime._OnInstalledDetails,
  ) => void | Promise<void>,
): () => void {
  browser.runtime.onInstalled.addListener(callback)
  return () => {
    browser.runtime.onInstalled.removeListener(callback)
  }
}

export type SidePanelSupport =
  | { supported: true; kind: "firefox-sidebar-action" }
  | { supported: true; kind: "chromium-side-panel" }
  | { supported: false; kind: "unsupported"; reason: string }

/**
 * Side panel capability is cached at module load time to avoid repeatedly touching globals.
 */
const CACHED_SIDE_PANEL_SUPPORT: SidePanelSupport = (() => {
  const runtimeBrowser = (globalThis as any).browser
  if (typeof runtimeBrowser?.sidebarAction?.open === "function") {
    return { supported: true, kind: "firefox-sidebar-action" }
  }

  const runtimeChrome = (globalThis as any).chrome
  if (typeof runtimeChrome?.sidePanel?.open === "function") {
    return { supported: true, kind: "chromium-side-panel" }
  }

  const reasons: string[] = []
  if (typeof runtimeBrowser?.sidebarAction?.open !== "function") {
    reasons.push("browser.sidebarAction.open missing")
  }
  if (typeof runtimeChrome?.sidePanel?.open !== "function") {
    reasons.push("chrome.sidePanel.open missing")
  }

  return {
    supported: false,
    kind: "unsupported",
    reason: reasons.join("; ") || "Side panel APIs not available",
  }
})()

/**
 * Detects whether the current runtime can open a side panel/sidebar.
 */
export function getSidePanelSupport(): SidePanelSupport {
  return CACHED_SIDE_PANEL_SUPPORT
}

/**
 * Open the extension side panel using the host browser's native APIs.
 * Automatically chooses the appropriate Chromium or Firefox pathway.
 * @throws {Error} When the current browser does not expose side panel support.
 */
export const openSidePanel = async () => {
  const support = getSidePanelSupport()

  if (!support.supported) {
    throw new Error(`Side panel is not supported: ${support.reason}`)
  }

  if (support.kind === "firefox-sidebar-action") {
    return await (browser as any).sidebarAction.open()
  }

  const tab = await getActiveTab()
  const windowId = tab?.windowId
  const tabId = tab?.id

  const sidePanel = (globalThis as any).chrome?.sidePanel

  if (typeof windowId === "number") {
    try {
      return await sidePanel.open({ windowId })
    } catch (error) {
      if (typeof tabId === "number") {
        return await sidePanel.open({ tabId })
      }
      throw error
    }
  }

  if (typeof tabId === "number") {
    return await sidePanel.open({ tabId })
  }

  throw new Error("Side panel open failed: active tab/window not found")
}

/**
 * 检查是否支持 alarms API
 */
export function hasAlarmsAPI(): boolean {
  return !!browser.alarms
}

/**
 * 创建定时任务
 * @param name 定时任务名称，用于标识和后续查找。
 * @param alarmInfo 定时任务配置对象。
 * @param alarmInfo.periodInMinutes 任务执行的时间间隔（分钟）。
 * @param alarmInfo.delayInMinutes 任务首次执行前的延迟时间（分钟）。
 * @param alarmInfo.when 指定首次触发时间的时间戳（毫秒）。
 */
export async function createAlarm(
  name: string,
  alarmInfo: {
    periodInMinutes?: number
    delayInMinutes?: number
    when?: number
  },
): Promise<void> {
  if (!hasAlarmsAPI()) {
    logger.warn("Alarms API not supported")
    return
  }
  return browser.alarms.create(name, alarmInfo)
}

/**
 * 清除定时任务
 * @param name 要清除的定时任务名称。
 */
export async function clearAlarm(name: string): Promise<boolean> {
  if (!hasAlarmsAPI()) {
    logger.warn("Alarms API not supported")
    return false
  }
  return (await browser.alarms.clear(name)) || false
}

/**
 * 获取定时任务
 * @param name 需要获取的定时任务名称。
 */
export async function getAlarm(
  name: string,
): Promise<browser.alarms.Alarm | undefined> {
  if (!hasAlarmsAPI()) {
    logger.warn("Alarms API not supported")
    return undefined
  }
  return await browser.alarms.get(name)
}

/**
 * 获取所有定时任务
 */
export async function getAllAlarms(): Promise<browser.alarms.Alarm[]> {
  if (!hasAlarmsAPI()) {
    logger.warn("Alarms API not supported")
    return []
  }
  return (await browser.alarms.getAll()) || []
}

/**
 * 监听定时任务触发事件
 * 返回清理函数
 * @param callback 定时任务触发时调用的处理函数。
 */
export function onAlarm(
  callback: (alarm: browser.alarms.Alarm) => void | Promise<void>,
): () => void {
  if (!hasAlarmsAPI()) {
    logger.warn("Alarms API not supported")
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
export function getManifest(): browser._manifest.WebExtensionManifest {
  try {
    return browser.runtime.getManifest()
  } catch (error) {
    logger.warn(
      "[browserApi] Failed to read manifest, falling back to minimal manifest",
      error,
    )

    return {
      manifest_version: 3,
      name: APP_SHORT_NAME,
      version: "0.0.0",
      optional_permissions: [],
    }
  }
}

/**
 * Convenience helper returning the manifest_version number from runtime manifest.
 * Falls back to {@link getManifest} when the runtime manifest cannot be read.
 */
export function getManifestVersion(): number {
  return getManifest().manifest_version
}

type ActionClickListener = (tab: browser.tabs.Tab, info?: any) => void

type ActionAPI = {
  setPopup: (details: { popup?: string }) => Promise<void> | void
  onClicked: {
    addListener: (listener: ActionClickListener) => void
    removeListener: (listener: ActionClickListener) => void
    hasListener: (listener: ActionClickListener) => boolean
  }
}

/**
 * 返回跨 MV2/MV3 的 action API 引用。
 * 优先使用 browser.action (MV3)，回退到 browser.browserAction (MV2)。
 */
export function getActionApi(): ActionAPI {
  const action = (browser as any).action || (browser as any).browserAction
  if (!action) {
    throw new Error("Action API is not available in this environment")
  }
  return action as ActionAPI
}

/**
 * 设置工具栏按钮的 popup，兼容 MV2 与 MV3。
 * @param popup 要显示的 popup 页面路径，传空字符串可清除。
 */
export async function setActionPopup(popup: string): Promise<void> {
  const action = getActionApi()
  await Promise.resolve(action.setPopup({ popup }))
}

/**
 * 为工具栏按钮添加点击监听（兼容 MV2/MV3）。
 * 返回用于移除的清理函数。
 */
export function addActionClickListener(
  listener: ActionClickListener,
): () => void {
  const action = getActionApi()
  if (!action.onClicked.hasListener(listener)) {
    action.onClicked.addListener(listener)
  }
  return () => {
    if (action.onClicked.hasListener(listener)) {
      action.onClicked.removeListener(listener)
    }
  }
}

/**
 * 移除工具栏按钮点击监听（兼容 MV2/MV3）。
 */
export function removeActionClickListener(
  listener: (tab: browser.tabs.Tab, info?: any) => void,
): void {
  const action = getActionApi()
  if (action.onClicked.hasListener(listener)) {
    action.onClicked.removeListener(listener)
  }
}

/**
 * Check permissions via background script message (for content scripts).
 * @param permissions Permission descriptor to check.
 * @returns Resolves true when the permission is granted, false otherwise.
 */
export async function checkPermissionViaMessage(
  permissions: browser.permissions.Permissions,
): Promise<boolean> {
  try {
    const response = await sendRuntimeActionMessage({
      action: RuntimeActionIds.PermissionsCheck,
      permissions,
    })
    return response?.hasPermission ?? false
  } catch (error) {
    logger.error("checkPermissionViaMessage failed", { permissions, error })
    return false
  }
}

// Permissions helpers
/**
 * Check whether the extension already holds the requested permissions.
 * @param permissions Permission descriptor passed directly to the browser API.
 * @returns Resolves true when the set is already granted, false otherwise.
 */
export async function containsPermissions(
  permissions: browser.permissions.Permissions,
): Promise<boolean> {
  try {
    return await browser.permissions.contains(permissions)
  } catch (error) {
    logger.error("permissions.contains failed", { permissions, error })
    return false
  }
}

/**
 * Request additional permissions from the user, logging failures for debugging.
 * @param permissions Permission descriptor to be requested from the browser.
 * @returns Resolves true when the user grants the request, false when denied.
 */
export async function requestPermissions(
  permissions: browser.permissions.Permissions,
): Promise<boolean> {
  try {
    return await browser.permissions.request(permissions)
  } catch (error) {
    logger.error("permissions.request failed", { permissions, error })
    return false
  }
}

/**
 * Remove previously granted permissions to minimize the extension's footprint.
 * @param permissions Permission descriptor indicating entries to revoke.
 * @returns Resolves true when the removal succeeds, false when it fails.
 */
export async function removePermissions(
  permissions: browser.permissions.Permissions,
): Promise<boolean> {
  try {
    return await browser.permissions.remove(permissions)
  } catch (error) {
    logger.error("permissions.remove failed", { permissions, error })
    return false
  }
}

/**
 * Subscribe to permission-added events and return an unsubscribe callback.
 * @param callback Handler receiving the granted permission set.
 */
export function onPermissionsAdded(
  callback: (permissions: browser.permissions.Permissions) => void,
): () => void {
  browser.permissions.onAdded.addListener(callback)
  return () => browser.permissions.onAdded.removeListener(callback)
}

/**
 * Subscribe to permission-removed events and return an unsubscribe callback.
 * @param callback Handler receiving the revoked permission set.
 */
export function onPermissionsRemoved(
  callback: (permissions: browser.permissions.Permissions) => void,
): () => void {
  browser.permissions.onRemoved.addListener(callback)
  return () => browser.permissions.onRemoved.removeListener(callback)
}
