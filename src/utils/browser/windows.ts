import "~/utils/browser/browserEnvironment"

import { getErrorMessage } from "~/utils/core/error"

/**
 * Removes a known browser window when the windows API is available.
 */
export async function removeWindow(windowId: number): Promise<void> {
  if (!hasWindowsAPI()) {
    throw new Error("browser.windows.remove is unavailable")
  }

  await browser.windows.remove(windowId)
}

/**
 * Retrieves every browser window when the windows API is available.
 */
export async function getAllWindows(): Promise<browser.windows.Window[]> {
  if (!hasWindowsAPI()) return []
  return (await browser.windows.getAll()) ?? []
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
 * Retrieves a browser window by id when the windows API is available.
 */
export async function getWindow(
  windowId: number,
): Promise<browser.windows.Window | null> {
  if (hasWindowsAPI()) {
    return await browser.windows.get(windowId)
  }
  return null
}

/**
 * Updates a browser window when the windows API is available.
 */
export async function updateWindow(
  windowId: number,
  updateInfo: browser.windows._UpdateUpdateInfo,
): Promise<browser.windows.Window | null> {
  if (hasWindowsAPI()) {
    return await browser.windows.update(windowId, updateInfo)
  }
  return null
}

/**
 * 检查是否支持 windows API
 */
export function hasWindowsAPI(): boolean {
  return !!browser.windows
}

export const WINDOW_CREATION_FAILURE_REASONS = {
  WINDOWS_API_UNAVAILABLE: "windows-api-unavailable",
  WINDOW_CREATION_UNAVAILABLE: "window-creation-unavailable",
  WINDOW_HANDLE_UNAVAILABLE: "window-handle-unavailable",
} as const

export type WindowCreationFailureReason =
  (typeof WINDOW_CREATION_FAILURE_REASONS)[keyof typeof WINDOW_CREATION_FAILURE_REASONS]

const WINDOW_CREATION_CONTEXT_PATTERNS = [/popup/i, /\bwindows?\b/i]

const WINDOW_CREATION_UNAVAILABLE_PATTERNS = [
  /not allowed/i,
  /not permitted/i,
  /not supported/i,
  /unsupported/i,
  /permission denied/i,
  /\bdenied\b/i,
  /\bforbidden\b/i,
  /\bblocked\b/i,
  /popup blocked/i,
  /\bblocked by\b/i,
  /\bunavailable\b/i,
  /failed to create/i,
  /cannot create/i,
]

/**
 * Classifies window-creation failures that can safely fall back to a plain tab.
 *
 * This centralizes browser-specific wording and missing-handle checks so
 * background callers do not have to duplicate popup/window failure heuristics.
 */
export function classifyRecoverableWindowCreationFailure(params: {
  error?: unknown
  windowsApiAvailable?: boolean
  missingHandle?: boolean
}): WindowCreationFailureReason | null {
  if (params.windowsApiAvailable === false) {
    return WINDOW_CREATION_FAILURE_REASONS.WINDOWS_API_UNAVAILABLE
  }

  if (params.missingHandle) {
    return WINDOW_CREATION_FAILURE_REASONS.WINDOW_HANDLE_UNAVAILABLE
  }

  const message = getErrorMessage(params.error).trim()
  if (!message) {
    return null
  }

  const hasWindowContext = WINDOW_CREATION_CONTEXT_PATTERNS.some((pattern) =>
    pattern.test(message),
  )
  const hasUnavailableSignal = WINDOW_CREATION_UNAVAILABLE_PATTERNS.some(
    (pattern) => pattern.test(message),
  )

  if (!hasWindowContext || !hasUnavailableSignal) {
    return null
  }

  return WINDOW_CREATION_FAILURE_REASONS.WINDOW_CREATION_UNAVAILABLE
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
