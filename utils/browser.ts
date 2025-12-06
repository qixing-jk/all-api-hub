import { getExtensionURL } from "~/utils/browserApi"

export const OPTIONS_PAGE_URL = getExtensionURL("options.html")

/**
 * Detects Firefox-like user agents using UA string heuristics.
 * Useful in early bootstrapping before browser APIs are available.
 */
export function isFirefoxByUA(): boolean {
  return (
    navigator.userAgent.indexOf(" Firefox/") !== -1 ||
    navigator.userAgent.indexOf(" Gecko/") !== -1
  )
}

/**
 * Checks whether the current extension runtime is Firefox.
 * Relies on the moz-extension protocol prefix exposed by WebExtensions.
 */
export function isFirefox(): boolean {
  return browser.runtime.getURL("").startsWith("moz-extension://")
}

/**
 * Determines if the current device is a mobile device.
 *
 * This function checks the user agent string against a set of known mobile device keywords.
 * If the user agent string contains any of these keywords, it is considered a mobile device.
 * Otherwise, it is considered a desktop device.
 *
 * @returns {boolean} true if the device is a mobile device, false otherwise.
 */
export function isMobileByUA(): boolean {
  // 检测是否为移动设备，如果不是移动设备则认为是桌面设备
  const userAgent = navigator.userAgent.toLowerCase()
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
    userAgent,
  )
}

/**
 * Determines if the current device is a desktop device.
 * Returns true if the device is not identified as a mobile device.
 *
 * Returns a boolean indicating whether the device is a desktop.
 */
export function isDesktopByUA(): boolean {
  return !isMobileByUA()
}

/**
 * Checks if the given URL is an extension page.
 *
 * Extension pages have a protocol that includes "-extension:", such as
 * "chrome-extension:" or "moz-extension:".
 *
 * @param url - The URL to check.
 * @returns {boolean} true if the URL is an extension page, false otherwise.
 */
export function isExtensionPage(url: URL) {
  return url.protocol.includes("-extension:")
}

/**
 * Determines if current window is the browser action popup.
 * @returns True when running inside popup.html.
 */
export function isExtensionPopup() {
  try {
    const url = new URL(window.location.href)
    return isExtensionPage(url) && /popup.html/i.test(url.pathname)
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
    return isExtensionPage(url) && /sidepanel.html/i.test(url.pathname)
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
