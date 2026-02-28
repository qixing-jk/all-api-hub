import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  hasRuntimeActionPrefix,
  RuntimeActionIds,
  RuntimeActionPrefixes,
} from "~/constants/runtimeActions"
import { applyActionClickBehavior } from "~/entrypoints/background/actionClickBehavior"
import { handleAccountKeyRepairMessage } from "~/services/accounts/accountKeyAutoProvisioning"
import { handleAutoRefreshMessage } from "~/services/accounts/autoRefreshService"
import { handleChannelConfigMessage } from "~/services/channelConfigStorage"
import { handleAutoCheckinMessage } from "~/services/checkin/autoCheckin/scheduler"
import { handleExternalCheckInMessage } from "~/services/checkin/externalCheckInService"
import { handleDailyBalanceHistoryMessage } from "~/services/dailyBalanceHistory/scheduler"
import { handleLdohSiteLookupMessage } from "~/services/integrations/ldohSiteLookup/background"
import { handleManagedSiteModelSyncMessage } from "~/services/models/modelSync"
import { handleRedemptionAssistMessage } from "~/services/redemptionAssist"
import { handleUsageHistoryMessage } from "~/services/usageHistory/scheduler"
import { handleWebAiApiCheckMessage } from "~/services/webAiApiCheck/background"
import { handleWebdavAutoSyncMessage } from "~/services/webdav/webdavAutoSyncService"
import { onRuntimeMessage } from "~/utils/browserApi"
import { getCookieHeaderForUrl } from "~/utils/cookieHelper"
import { extractSessionCookieHeader } from "~/utils/cookieString"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"
import { openOrFocusOptionsMenuItem } from "~/utils/navigation"

import { setupContextMenus } from "./contextMenus"
import { trackCookieInterceptorUrl } from "./cookieInterceptor"
import {
  handleAutoDetectSite,
  handleCloseTempWindow,
  handleOpenTempWindow,
  handleTempWindowFetch,
  handleTempWindowGetRenderedTitle,
  handleTempWindowTurnstileFetch,
} from "./tempWindowPool"

/**
 * Unified logger scoped to background runtime message routing.
 */
const logger = createLogger("RuntimeMessages")

/**
 * Registers runtime message handlers for background scripts.
 * Routes browser.runtime messages to feature-specific handlers based on action prefixes.
 */
export function setupRuntimeMessageListeners() {
  // 处理来自 popup 的消息
  onRuntimeMessage((request, sender, sendResponse) => {
    try {
      if (request.action === RuntimeActionIds.PermissionsCheck) {
        void browser.permissions
          .contains(request.permissions)
          .then((hasPermission) => {
            sendResponse({ hasPermission })
          })
          .catch((error) => {
            sendResponse({
              hasPermission: false,
              error: getErrorMessage(error),
            })
          })
        return true
      }

      if (request.action === RuntimeActionIds.CloudflareGuardLog) {
        try {
          logger.debug("CFGuardRelay", {
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

      if (request.action === RuntimeActionIds.OpenTempWindow) {
        void handleOpenTempWindow(request, sendResponse)
        return true // 保持异步响应通道
      }

      if (request.action === RuntimeActionIds.CloseTempWindow) {
        void handleCloseTempWindow(request, sendResponse)
        return true
      }

      if (request.action === RuntimeActionIds.AutoDetectSite) {
        void handleAutoDetectSite(request, sendResponse)
        return true
      }

      if (request.action === RuntimeActionIds.TempWindowFetch) {
        void handleTempWindowFetch(request, sendResponse)
        return true
      }

      if (request.action === RuntimeActionIds.TempWindowTurnstileFetch) {
        void handleTempWindowTurnstileFetch(request, sendResponse)
        return true
      }

      if (request.action === RuntimeActionIds.TempWindowGetRenderedTitle) {
        void handleTempWindowGetRenderedTitle(request, sendResponse)
        return true
      }

      if (request.action === RuntimeActionIds.CookieInterceptorTrackUrl) {
        logger.debug("Runtime action", {
          action: RuntimeActionIds.CookieInterceptorTrackUrl,
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

      // Bulk external check-in must run in background so it isn't interrupted by popup teardown.
      if (
        hasRuntimeActionPrefix(
          request.action,
          RuntimeActionPrefixes.ExternalCheckIn,
        )
      ) {
        void handleExternalCheckInMessage(request, sendResponse)
        return true
      }

      if (
        hasRuntimeActionPrefix(
          request.action,
          RuntimeActionPrefixes.LdohSiteLookup,
        )
      ) {
        void handleLdohSiteLookupMessage(request, sendResponse)
        return true
      }

      if (
        request.action ===
        RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie
      ) {
        void (async () => {
          try {
            const cookieHeader = await getCookieHeaderForUrl(request.url, {
              includeSession: true,
            })
            const sessionOnly = extractSessionCookieHeader(cookieHeader)
            if (sessionOnly) {
              sendResponse({ success: true, data: sessionOnly })
            } else {
              sendResponse({ success: false, error: "No cookies found" })
            }
          } catch (error) {
            sendResponse({ success: false, error: getErrorMessage(error) })
          }
        })()
        return true
      }

      if (request.action === RuntimeActionIds.OpenSettingsCheckinRedeem) {
        openOrFocusOptionsMenuItem(MENU_ITEM_IDS.BASIC, {
          tab: "checkinRedeem",
          anchor: "redemption-assist",
        })
        sendResponse({ success: true })
        return true
      }

      if (request.action === RuntimeActionIds.OpenSettingsShieldBypass) {
        openOrFocusOptionsMenuItem(MENU_ITEM_IDS.BASIC, {
          tab: "refresh",
          anchor: "shield-settings",
        })
        sendResponse({ success: true })
        return true
      }

      if (
        request.action === RuntimeActionIds.PreferencesUpdateActionClickBehavior
      ) {
        applyActionClickBehavior(request.behavior)
        sendResponse({ success: true })
        return true
      }

      if (request.action === RuntimeActionIds.PreferencesRefreshContextMenus) {
        void setupContextMenus()
          .then(() => {
            sendResponse({ success: true })
          })
          .catch((error) => {
            sendResponse({ success: false, error: getErrorMessage(error) })
          })
        return true
      }

      // 处理自动刷新相关消息
      if (
        hasRuntimeActionPrefix(
          request.action,
          RuntimeActionPrefixes.AutoRefresh,
        )
      ) {
        handleAutoRefreshMessage(request, sendResponse)
        return true
      }

      // 处理WebDAV自动同步相关消息
      if (
        hasRuntimeActionPrefix(
          request.action,
          RuntimeActionPrefixes.WebdavAutoSync,
        )
      ) {
        handleWebdavAutoSyncMessage(request, sendResponse)
        return true
      }

      // 处理模型同步相关消息
      if (
        hasRuntimeActionPrefix(request.action, RuntimeActionPrefixes.ModelSync)
      ) {
        handleManagedSiteModelSyncMessage(request, sendResponse)
        return true
      }

      // Bulk "Repair missing keys" must run in background so it isn't interrupted by options page teardown.
      if (
        hasRuntimeActionPrefix(
          request.action,
          RuntimeActionPrefixes.AccountKeyRepair,
        )
      ) {
        void handleAccountKeyRepairMessage(request, sendResponse)
        return true
      }

      // 处理Auto Check-in相关消息
      if (
        hasRuntimeActionPrefix(
          request.action,
          RuntimeActionPrefixes.AutoCheckin,
        )
      ) {
        handleAutoCheckinMessage(request, sendResponse)
        return true
      }

      // Web AI API Check runtime actions
      if (
        hasRuntimeActionPrefix(request.action, RuntimeActionPrefixes.ApiCheck)
      ) {
        void handleWebAiApiCheckMessage(request as any, sendResponse)
        return true
      }

      // 处理 Redemption Assist 相关消息
      if (
        hasRuntimeActionPrefix(
          request.action,
          RuntimeActionPrefixes.RedemptionAssist,
        )
      ) {
        void handleRedemptionAssistMessage(request, sender, sendResponse)
        return true
      }

      // 处理Channel Config相关消息
      if (
        hasRuntimeActionPrefix(
          request.action,
          RuntimeActionPrefixes.ChannelConfig,
        )
      ) {
        handleChannelConfigMessage(request, sendResponse)
        return true
      }

      // 处理 usage-history 相关消息
      if (
        hasRuntimeActionPrefix(
          request.action,
          RuntimeActionPrefixes.UsageHistory,
        )
      ) {
        handleUsageHistoryMessage(request, sendResponse)
        return true
      }

      // 处理 balance-history 相关消息
      if (
        hasRuntimeActionPrefix(
          request.action,
          RuntimeActionPrefixes.BalanceHistory,
        )
      ) {
        handleDailyBalanceHistoryMessage(request, sendResponse)
        return true
      }

      return undefined
    } catch (error) {
      logger.error("Error handling runtime message", error)
      sendResponse({ success: false, error: getErrorMessage(error) })
      return true
    }
  })
}
