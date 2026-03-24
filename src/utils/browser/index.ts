import {
  OPTIONS_PAGE_PATH,
  POPUP_PAGE_PATH,
  SIDEPANEL_PAGE_PATH,
} from "~/constants/extensionPages"
import { getExtensionURL } from "~/utils/browser/browserApi"

import {
  getDeviceTypeInfo,
  isDesktopDevice,
  isMobileDevice,
  isTabletDevice,
} from "./device"

export const OPTIONS_PAGE_URL = getExtensionURL(OPTIONS_PAGE_PATH)

export type ExtensionStoreId = "chrome" | "edge" | "firefox"
export { getDeviceTypeInfo, isDesktopDevice, isMobileDevice, isTabletDevice }

/**
 * Checks whether the current extension runtime is Firefox.
 * Relies on the moz-extension protocol prefix exposed by WebExtensions.
 */
export function isFirefox(): boolean {
  return getRuntimeBaseUrl().startsWith("moz-extension://")
}

/**
 * Detects Microsoft Edge browsers by inspecting the user-agent string.
 * @param userAgent Optional user-agent string to check. Defaults to navigator.userAgent.
 * @returns True when the UA indicates Microsoft Edge.
 */
export function isEdgeByUA(userAgent?: string): boolean {
  const ua =
    userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")
  return /EdgA\//.test(ua) || /EdgiOS\//.test(ua) || /Edg\//.test(ua)
}

/**
 * Retrieves the base URL of the extension runtime.
 * @returns The runtime base URL or an empty string if unavailable.
 */
function getRuntimeBaseUrl(): string {
  try {
    return getExtensionURL("")
  } catch {
    return ""
  }
}

/**
 * Detects the extension store based on runtime URL and user-agent heuristics.
 * @param options Optional parameters for detection.
 * @param options.userAgent Optional user-agent string for Edge detection.
 * @param options.runtimeUrl Optional runtime URL for Firefox detection.
 * @returns The detected ExtensionStoreId: "firefox", "edge", or "chrome".
 */
export function detectExtensionStore(options?: {
  userAgent?: string
  runtimeUrl?: string
}): ExtensionStoreId {
  const runtimeUrl = options?.runtimeUrl ?? getRuntimeBaseUrl()
  if (runtimeUrl.startsWith("moz-extension://")) {
    return "firefox"
  }

  if (isEdgeByUA(options?.userAgent)) {
    return "edge"
  }

  return "chrome"
}

/**
 * Checks if the given URL is an extension page (chrome-extension:/moz-extension:).
 * @param url URL instance to check.
 * @returns True when the protocol contains "-extension:".
 */
function isExtensionPage(url: URL) {
  return url.protocol.includes("-extension:")
}

/**
 * Determines if current window is the browser action popup.
 * @returns True when running inside popup.html.
 */
export function isExtensionPopup() {
  try {
    const url = new URL(window.location.href)
    return isExtensionPage(url) && url.pathname.endsWith(`/${POPUP_PAGE_PATH}`)
  } catch {
    return false
  }
}

/**
 * Determines if the current page is loaded inside the extension side panel.
 * @returns True when sidepanel.html is detected in the URL path.
 */
export function isExtensionSidePanel() {
  try {
    const url = new URL(window.location.href)
    return (
      isExtensionPage(url) && url.pathname.endsWith(`/${SIDEPANEL_PAGE_PATH}`)
    )
  } catch {
    return false
  }
}

/**
 * Detects whether the code runs inside the extension background context.
 * Supports both Manifest V3 service workers and legacy background pages.
 */
export function isExtensionBackground() {
  // 1. Service Worker 环境检测 (V3)
  if (
    // @ts-expect-error 全局对象类型
    typeof ServiceWorkerGlobalScope !== "undefined" &&
    // @ts-expect-error 全局对象类型
    self instanceof ServiceWorkerGlobalScope
  ) {
    return true
  }

  // 2. 无 window 对象 且 存在 browser.runtime => Service Worker / background
  if (
    typeof window === "undefined" &&
    typeof browser !== "undefined" &&
    !!browser.runtime
  ) {
    return true
  }

  // 3. URL 路径检测 (V2)
  if (typeof location !== "undefined") {
    const pathname = location.pathname || ""
    if (
      pathname.includes("background.html") ||
      pathname.includes("_generated_background_page.html")
    ) {
      return true
    }
  }

  return false
}
