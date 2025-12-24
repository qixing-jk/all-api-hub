import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { handleAutoCheckinMessage } from "~/services/autoCheckin/scheduler"
import { handleAutoRefreshMessage } from "~/services/autoRefreshService"
import { handleChannelConfigMessage } from "~/services/channelConfigStorage"
import { handleManagedSiteModelSyncMessage } from "~/services/modelSync"
import { handleRedemptionAssistMessage } from "~/services/redemptionAssist"
import { handleWebdavAutoSyncMessage } from "~/services/webdav/webdavAutoSyncService"
import { onRuntimeMessage } from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { openOrFocusOptionsMenuItem } from "~/utils/navigation"

import { trackCookieInterceptorUrl } from "./cookieInterceptor"
import {
  handleAutoDetectSite,
  handleCloseTempWindow,
  handleOpenTempWindow,
  handleTempWindowFetch,
  handleTempWindowGetRenderedTitle,
} from "./tempWindowPool"

/**
 * Registers runtime message handlers for background scripts.
 * Routes browser.runtime messages to feature-specific handlers based on action prefixes.
 */
export function setupRuntimeMessageListeners() {
  // 处理来自 popup 的消息
  onRuntimeMessage((request, sender, sendResponse) => {
    if (request.action === "cloudflareGuardLog") {
      try {
        console.log("[Background][CFGuardRelay]", {
          event: request.event ?? null,
          requestId: request?.details?.requestId ?? null,
          details: request.details ?? null,
          sender: {
            tabId: sender?.tab?.id ?? null,
            frameId: sender?.frameId ?? null,
            url: sender?.url ?? null,
          },
        })
      } catch {
        // ignore logging errors
      }

      sendResponse({ success: true })
      return true
    }

    if (request.action === "openTempWindow") {
      void handleOpenTempWindow(request, sendResponse)
      return true // 保持异步响应通道
    }

    if (request.action === "closeTempWindow") {
      void handleCloseTempWindow(request, sendResponse)
      return true
    }

    if (request.action === "autoDetectSite") {
      void handleAutoDetectSite(request, sendResponse)
      return true
    }

    if (request.action === "tempWindowFetch") {
      void handleTempWindowFetch(request, sendResponse)
      return true
    }

    if (request.action === "tempWindowGetRenderedTitle") {
      void handleTempWindowGetRenderedTitle(request, sendResponse)
      return true
    }

    if (request.action === "cookieInterceptor:trackUrl") {
      console.log("[Background] Runtime action cookieInterceptor:trackUrl", {
        url: request.url,
        ttlMs: request.ttlMs,
      })
      void trackCookieInterceptorUrl(request.url, request.ttlMs)
        .then(() => {
          sendResponse({ success: true })
        })
        .catch((error) => {
          sendResponse({ success: false, error: getErrorMessage(error) })
        })
      return true
    }

    if (request.action === "openSettings:checkinRedeem") {
      openOrFocusOptionsMenuItem(MENU_ITEM_IDS.BASIC, { tab: "checkinRedeem" })
      sendResponse({ success: true })
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
        "getAutoRefreshStatus",
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

    // 处理模型同步相关消息
    if (request.action && request.action.startsWith("modelSync:")) {
      handleManagedSiteModelSyncMessage(request, sendResponse)
      return true
    }

    // 处理Auto Check-in相关消息
    if (request.action && request.action.startsWith("autoCheckin:")) {
      handleAutoCheckinMessage(request, sendResponse)
      return true
    }

    // 处理 Redemption Assist 相关消息
    if (request.action && request.action.startsWith("redemptionAssist:")) {
      void handleRedemptionAssistMessage(request, sender, sendResponse)
      return true
    }

    // 处理Channel Config相关消息
    if (request.action && request.action.startsWith("channelConfig:")) {
      handleChannelConfigMessage(request, sendResponse)
      return true
    }

    return undefined
  })
}
