import { handleAutoCheckinMessage } from "~/services/autoCheckin/scheduler"
import { handleAutoRefreshMessage } from "~/services/autoRefreshService"
import { handleChannelConfigMessage } from "~/services/channelConfigStorage"
import { handleNewApiModelSyncMessage } from "~/services/newApiModelSync"
import { handleRedemptionAssistMessage } from "~/services/redemptionAssist"
import { handleWebdavAutoSyncMessage } from "~/services/webdav/webdavAutoSyncService"
import { onRuntimeMessage } from "~/utils/browserApi"
import { openOrFocusOptionsPage } from "~/utils/navigation"

import {
  handleAutoDetectSite,
  handleCloseTempWindow,
  handleOpenTempWindow,
  handleTempWindowFetch,
} from "./tempWindowPool"

export function setupRuntimeMessageListeners() {
  // 处理来自 popup 的消息
  onRuntimeMessage((request, sender, sendResponse) => {
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

    if (request.action === "openSettings:checkinRedeem") {
      openOrFocusOptionsPage("?tab=checkinRedeem#basic")
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

    // 处理New API模型同步相关消息
    if (request.action && request.action.startsWith("newApiModelSync:")) {
      handleNewApiModelSyncMessage(request, sendResponse)
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
