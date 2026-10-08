import { APP_SHORT_NAME } from "~/constants/branding"
import { browserApiLogger as logger } from "~/utils/browser/browserEnvironment"
import { getErrorMessage } from "~/utils/core/error"

/**
 * 获取扩展资源 URL
 * @param path 扩展内资源的相对路径。
 */
export function getExtensionURL(path: string): string {
  return browser.runtime.getURL(path)
}

/**
 * Returns the current extension runtime id when available.
 */
export function getRuntimeId(): string | undefined {
  const runtimeId = (globalThis as any).browser?.runtime?.id
  return typeof runtimeId === "string" ? runtimeId : undefined
}

export interface BrowserApiCapabilities {
  hasWindows: boolean
  hasTabs: boolean
  hasBackgroundMessaging: boolean
}

/**
 * Detects the currently exposed high-level WebExtension APIs.
 */
export function getBrowserApiCapabilities(): BrowserApiCapabilities {
  const runtimeBrowser = (globalThis as any).browser
  return {
    hasWindows: typeof runtimeBrowser?.windows?.create === "function",
    hasTabs: typeof runtimeBrowser?.tabs?.query === "function",
    hasBackgroundMessaging:
      typeof runtimeBrowser?.runtime?.sendMessage === "function",
  }
}

export interface BrowserManagementSelfInfo {
  installType?: string
}

/**
 * Reads extension installation metadata when the management API is available.
 */
export async function getManagementSelf(): Promise<BrowserManagementSelfInfo | null> {
  const getSelf = (globalThis as any).browser?.management?.getSelf as
    | (() => Promise<BrowserManagementSelfInfo>)
    | undefined

  if (typeof getSelf !== "function") {
    return null
  }

  return await getSelf()
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

/**
 * 监听扩展即将挂起事件（如果支持）
 * 返回清理函数
 * @param callback 扩展即将挂起时调用的处理函数。
 */
export function onSuspend(callback: () => void | Promise<void>): () => void {
  const onSuspendEvent = (globalThis as any).browser?.runtime?.onSuspend as
    | {
        addListener?: (listener: typeof callback) => void
        removeListener?: (listener: typeof callback) => void
      }
    | undefined

  if (
    typeof onSuspendEvent?.addListener !== "function" ||
    typeof onSuspendEvent?.removeListener !== "function"
  ) {
    logger.warn("runtime.onSuspend not supported")
    return () => {}
  }

  onSuspendEvent.addListener(callback)
  return () => {
    onSuspendEvent.removeListener?.(callback)
  }
}

/**
 * Reads a localized browser message from the extension manifest locale bundle.
 */
export function getBrowserI18nMessage(
  messageName: string,
  substitutions?: string | Array<string | number>,
): string {
  const getMessage = (globalThis as any).browser?.i18n?.getMessage
  if (typeof getMessage !== "function") {
    return ""
  }

  return getMessage(messageName, substitutions)
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
 * Returns the current packaged extension version from the runtime manifest.
 */
export function getExtensionVersion(fallback = "0.0.0"): string {
  return getManifest().version?.trim() || fallback
}

/**
 * Reloads the extension runtime when the current browser exposes the API.
 */
export function reloadRuntime(): void {
  try {
    browser.runtime.reload?.()
  } catch (error) {
    logger.warn("Failed to reload extension runtime", error)
  }
}

/**
 * Sets the URL opened after the user uninstalls the extension.
 *
 * Only Chromium browsers and Firefox expose `runtime.setUninstallURL`
 * (Safari does not); returns false instead of throwing when it is missing.
 * The browser rejects URLs longer than its own limit (Chromium: 255
 * characters).
 */
export async function setUninstallUrl(url: string): Promise<boolean> {
  try {
    // Optional at runtime, required in the shared browser typings.
    const runtime = browser.runtime as {
      setUninstallURL?: (targetUrl: string) => Promise<void>
    }
    if (typeof runtime.setUninstallURL !== "function") return false
    await runtime.setUninstallURL(url)
    return true
  } catch (error) {
    logger.warn("Failed to set uninstall URL", error)
    return false
  }
}

/**
 * Opens the extension's standard options page through the browser runtime API.
 */
export async function openRuntimeOptionsPage(): Promise<void> {
  await browser.runtime.openOptionsPage()
}

/**
 * Returns whether the extension is allowed to run in incognito/private windows.
 *
 * Chrome/Edge require the user to explicitly allow an extension to run in
 * Incognito mode. Firefox has a similar "Run in Private Windows" toggle.
 *
 * - `true`: allowed
 * - `false`: explicitly disallowed
 * - `null`: unknown/unsupported in the current environment
 */
export async function isAllowedIncognitoAccess(): Promise<boolean | null> {
  try {
    return await browser.extension.isAllowedIncognitoAccess()
  } catch (error) {
    logger.debug(
      "extension.isAllowedIncognitoAccess failed",
      getErrorMessage(error),
    )
    return null
  }
}
