import { isProtectionBypassFirefoxEnv } from "~/utils/browser/protectionBypass"
import { isTempWindowBlockedDownloadUrl } from "~/utils/browser/tempWindowDownloadRules"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("FirefoxTempWindowDownloadBlocker")

const TEMP_WINDOW_DOWNLOAD_BLOCK_RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "object",
  "xmlhttprequest",
  "other",
] as const

const activeBlockedTabIds = new Set<number>()
let isListenerRegistered = false

/**
 * Returns whether the Firefox webRequest blocking API can be used in this runtime.
 */
function hasFirefoxWebRequestBlockingApi(): boolean {
  try {
    return Boolean(
      isProtectionBypassFirefoxEnv() &&
        (globalThis as any).browser?.webRequest?.onBeforeRequest?.addListener &&
        (globalThis as any).browser?.webRequest?.onBeforeRequest
          ?.removeListener,
    )
  } catch {
    return false
  }
}

/**
 * Cancels obvious executable requests only when they originate from tracked temp tabs.
 */
function handleBeforeRequest(
  details: browser.webRequest._OnBeforeRequestDetails,
) {
  if (!activeBlockedTabIds.has(details.tabId)) {
    return {}
  }

  if (!isTempWindowBlockedDownloadUrl(details.url)) {
    return {}
  }

  return { cancel: true }
}

/**
 * Registers the shared Firefox request blocker listener on demand.
 */
function registerFirefoxDownloadBlockListener(): boolean {
  if (isListenerRegistered) {
    return true
  }

  if (!hasFirefoxWebRequestBlockingApi()) {
    return false
  }

  try {
    ;(globalThis as any).browser.webRequest.onBeforeRequest.addListener(
      handleBeforeRequest,
      {
        urls: ["<all_urls>"],
        types: [...TEMP_WINDOW_DOWNLOAD_BLOCK_RESOURCE_TYPES],
      },
      ["blocking"],
    )
    isListenerRegistered = true
    return true
  } catch (error) {
    logger.warn(
      "Failed to install Firefox temp-window download block listener",
      error,
    )
    isListenerRegistered = false
    return false
  }
}

/**
 * Enables Firefox webRequest blocking for obvious executable requests in a temp tab.
 */
export async function applyFirefoxTempWindowDownloadBlockRule(
  tabId: number,
): Promise<number | null> {
  if (!Number.isFinite(tabId) || tabId < 0) {
    return null
  }

  if (!registerFirefoxDownloadBlockListener()) {
    return null
  }

  const normalizedTabId = Math.floor(tabId)
  activeBlockedTabIds.add(normalizedTabId)
  return normalizedTabId
}

/**
 * Disables Firefox webRequest blocking for a temp tab and unregisters the listener when idle.
 */
export async function removeFirefoxTempWindowDownloadBlockRule(
  tabId: number,
): Promise<void> {
  if (!Number.isFinite(tabId)) {
    return
  }

  activeBlockedTabIds.delete(Math.floor(tabId))

  if (activeBlockedTabIds.size > 0 || !isListenerRegistered) {
    return
  }

  try {
    ;(globalThis as any).browser?.webRequest?.onBeforeRequest?.removeListener(
      handleBeforeRequest,
    )
  } catch (error) {
    logger.warn(
      "Failed to remove Firefox temp-window download block listener",
      error,
    )
  } finally {
    isListenerRegistered = false
  }
}
