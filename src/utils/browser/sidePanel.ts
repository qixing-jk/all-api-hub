import { browserApiLogger as logger } from "~/utils/browser/browserEnvironment"
import { getDeviceTypeInfo } from "~/utils/browser/device"
import { getActiveTab } from "~/utils/browser/tabs"
import { getErrorMessage } from "~/utils/core/error"

export type SidePanelSupport =
  | { supported: true; kind: "firefox-sidebar-action" }
  | { supported: true; kind: "chromium-side-panel" }
  | { supported: false; kind: "unsupported"; reason: string }

/**
 * Mobile and touch-tablet extension shells may expose side panel APIs without
 * being able to render a usable panel surface.
 */
function isKnownUnsupportedMobileSidePanelRuntime(): boolean {
  const deviceType = getDeviceTypeInfo()
  return deviceType.isMobile || deviceType.isTablet
}

/**
 * Detects side panel capability from the current browser APIs and form factor.
 * Individual invocation failures do not change this capability.
 */
export function getSidePanelSupport(): SidePanelSupport {
  const runtimeBrowser = (globalThis as any).browser
  const hasFirefoxSidebarAction =
    typeof runtimeBrowser?.sidebarAction?.open === "function"

  const runtimeChrome = (globalThis as any).chrome
  const hasChromiumSidePanel =
    typeof runtimeChrome?.sidePanel?.open === "function"

  if (
    (hasFirefoxSidebarAction || hasChromiumSidePanel) &&
    isKnownUnsupportedMobileSidePanelRuntime()
  ) {
    return {
      supported: false,
      kind: "unsupported",
      reason:
        "Side panel API exposed, but current mobile runtime cannot present a usable side panel",
    }
  }

  if (hasFirefoxSidebarAction) {
    return { supported: true, kind: "firefox-sidebar-action" }
  }

  if (hasChromiumSidePanel) {
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
}

/**
 * Open the extension side panel using the host browser's native APIs.
 * Automatically chooses the appropriate Chromium or Firefox pathway.
 * Prefers Chromium's window-scoped open call before falling back to tab-scoped
 * open requests when a runtime rejects the first variant.
 * When a clicked tab is provided, uses it before any async active-tab lookup so
 * Chromium keeps treating the open request as user initiated.
 * @throws {Error} When the current browser does not expose side panel support.
 */
export const openSidePanel = async (targetTab?: browser.tabs.Tab | null) => {
  const support = getSidePanelSupport()

  if (!support.supported) {
    throw new Error(`Side panel is not supported: ${support.reason}`)
  }

  if (support.kind === "firefox-sidebar-action") {
    return await (browser as any).sidebarAction.open()
  }

  const sidePanel = (globalThis as any).chrome?.sidePanel
  let windowId = targetTab?.windowId
  let tabId = targetTab?.id

  if (typeof windowId !== "number" && typeof tabId !== "number") {
    const activeTab = await getActiveTab()
    windowId = activeTab?.windowId
    tabId = activeTab?.id
  }

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

export const NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS = {
  Applied: "applied",
  Unavailable: "unavailable",
  Rejected: "rejected",
} as const

export type NativeSidePanelActionClickResult =
  (typeof NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS)[keyof typeof NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS]

/**
 * Projects toolbar clicks into Chromium's browser-owned side-panel behavior.
 * Distinguishes a missing control from a rejected attempt so callers can retain
 * compatible manual routing without acknowledging failed projections.
 */
export async function setNativeSidePanelActionClick(
  enabled: boolean,
): Promise<NativeSidePanelActionClickResult> {
  const setPanelBehavior = (globalThis as any).chrome?.sidePanel
    ?.setPanelBehavior

  if (typeof setPanelBehavior !== "function") {
    return NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Unavailable
  }

  try {
    await setPanelBehavior({ openPanelOnActionClick: enabled })
    return NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Applied
  } catch (error) {
    logger.warn(
      `sidePanel.setPanelBehavior not available:\n${getErrorMessage(error)}`,
    )
    return NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Rejected
  }
}
