import { COOKIE_IMPORT_FAILURE_REASONS } from "~/constants/cookieImport"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { WEB_AI_API_CHECK_TARGET_IDS } from "~/features/BasicSettings/components/tabs/WebAiApiCheck/searchTargets"
import { setupAccountKeyRepairMessagingListeners } from "~/services/accounts/accountKeyAutoProvisioning"
import { setupAutoRefreshMessagingListeners } from "~/services/accounts/autoRefreshService"
import { setupAutoCheckinMessagingListeners } from "~/services/checkin/autoCheckin/scheduler"
import { setupExternalCheckInMessagingListeners } from "~/services/checkin/externalCheckInService"
import {
  handleDailyBalanceHistoryMessage,
  setupDailyBalanceHistoryMessagingListeners,
} from "~/services/history/dailyBalanceHistory/scheduler"
import { setupUsageHistoryMessagingListeners } from "~/services/history/usageHistory/scheduler"
import { setupLdohSiteLookupMessagingListeners } from "~/services/integrations/ldohSiteLookup/background"
import { setupChannelConfigMessagingListeners } from "~/services/managedSites/channelConfigStorage"
import { setupManagedSiteModelSyncMessagingListeners } from "~/services/models/modelSync"
import { setupTaskNotificationMessagingListeners } from "~/services/notifications/taskNotificationService"
import { setupPreferencesMessagingListeners } from "~/services/preferences/runtimePreferencesService"
import { setupProductAnalyticsMessagingListeners } from "~/services/productAnalytics/runtime"
import { setupProductAnnouncementMessagingListeners } from "~/services/productAnnouncements/service"
import { setupRedemptionAssistMessagingListeners } from "~/services/redemption/redemptionAssist"
import { setupSiteAnnouncementsMessagingListeners } from "~/services/siteAnnouncements/scheduler"
import { setupReleaseUpdateMessagingListeners } from "~/services/updates/releaseUpdateService"
import { setupWebAiApiCheckMessagingListeners } from "~/services/verification/webAiApiCheck/background"
import { setupWebdavAutoSyncMessagingListeners } from "~/services/webdav/webdavAutoSyncService"
import {
  containsPermissions,
  getAllCookieStores,
  hasCookieStoresAPI,
  onRuntimeMessage,
} from "~/utils/browser/browserApi"
import {
  getCookieHeaderForUrlResult,
  hasCookieReadPermissionForUrl,
} from "~/utils/browser/cookieHelper"
import { extractSessionCookieHeader } from "~/utils/browser/cookieString"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import {
  openBugReportPage,
  openOrFocusOptionsMenuItem,
} from "~/utils/navigation"

import { trackCookieInterceptorUrl } from "./cookieInterceptor"
import {
  handleAutoDetectSite,
  handleCloseTempWindow,
  handleOpenTempWindow,
  handleTempWindowCheckinPageAction,
  handleTempWindowFetch,
  handleTempWindowGetRenderedTitle,
  handleTempWindowTurnstileFetch,
} from "./tempWindowPool"

/**
 * Unified logger scoped to background runtime message routing.
 */
const logger = createLogger("RuntimeMessages")

/**
 * Resolves the browser cookie store that should be used for a cookie import request.
 */
async function resolveCookieStoreIdFromImportRequest(
  request: Record<string, unknown>,
): Promise<string | undefined> {
  if (
    typeof request.cookieStoreId === "string" &&
    request.cookieStoreId.trim()
  ) {
    return request.cookieStoreId.trim()
  }

  if (
    typeof request.sourceTabId !== "number" ||
    request.sourceTabIncognito !== true ||
    !hasCookieStoresAPI()
  ) {
    return undefined
  }

  try {
    const cookieStores = await getAllCookieStores()
    return cookieStores.find((store) =>
      store.tabIds?.includes(request.sourceTabId as number),
    )?.id
  } catch (error) {
    logger.warn("Failed to resolve source tab cookie store", {
      error: getErrorMessage(error),
      sourceTabId: request.sourceTabId,
    })
    return undefined
  }
}

/**
 * Registers runtime message handlers for background scripts.
 * Routes browser.runtime messages to feature-specific handlers based on action prefixes.
 */
export function setupRuntimeMessageListeners() {
  setupReleaseUpdateMessagingListeners()
  setupLdohSiteLookupMessagingListeners()
  setupTaskNotificationMessagingListeners()
  setupChannelConfigMessagingListeners()
  setupExternalCheckInMessagingListeners()
  setupAutoRefreshMessagingListeners()
  setupWebdavAutoSyncMessagingListeners()
  setupUsageHistoryMessagingListeners()
  setupDailyBalanceHistoryMessagingListeners()
  setupSiteAnnouncementsMessagingListeners()
  setupProductAnnouncementMessagingListeners()
  setupPreferencesMessagingListeners()
  setupManagedSiteModelSyncMessagingListeners()
  setupAccountKeyRepairMessagingListeners()
  setupAutoCheckinMessagingListeners()
  setupWebAiApiCheckMessagingListeners()
  setupRedemptionAssistMessagingListeners()
  setupProductAnalyticsMessagingListeners()

  // 处理来自 popup 的消息
  onRuntimeMessage((request, sender, sendResponse) => {
    try {
      if (request.action === RuntimeActionIds.PermissionsCheck) {
        void containsPermissions(request.permissions)
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

      if (request.action === RuntimeActionIds.TempWindowCheckinPageAction) {
        void handleTempWindowCheckinPageAction(request, sendResponse)
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

      if (
        request.action ===
        RuntimeActionIds.AccountDialogImportCookieAuthSessionCookie
      ) {
        void (async () => {
          try {
            const hasCookiePermission = await hasCookieReadPermissionForUrl(
              request.url,
            )

            if (!hasCookiePermission) {
              sendResponse({
                success: false,
                errorCode: COOKIE_IMPORT_FAILURE_REASONS.PermissionDenied,
              })
              return
            }

            const cookieStoreId =
              await resolveCookieStoreIdFromImportRequest(request)
            const result = await getCookieHeaderForUrlResult(request.url, {
              includeSession: true,
              ...(cookieStoreId ? { storeId: cookieStoreId } : {}),
            })
            const sessionOnly = extractSessionCookieHeader(result.header)
            if (sessionOnly) {
              sendResponse({ success: true, data: sessionOnly })
            } else {
              sendResponse({
                success: false,
                errorCode:
                  result.failureReason ??
                  COOKIE_IMPORT_FAILURE_REASONS.NoCookiesFound,
                ...(result.errorMessage ? { error: result.errorMessage } : {}),
              })
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
        request.action === RuntimeActionIds.OpenSettingsApiCredentialProfiles
      ) {
        openOrFocusOptionsMenuItem(MENU_ITEM_IDS.API_CREDENTIAL_PROFILES)
        sendResponse({ success: true })
        return true
      }

      if (request.action === RuntimeActionIds.OpenSettingsWebAiApiCheck) {
        openOrFocusOptionsMenuItem(MENU_ITEM_IDS.BASIC, {
          tab: "webAiApiCheck",
          anchor: WEB_AI_API_CHECK_TARGET_IDS.enhancedAutoDetect,
        })
        sendResponse({ success: true })
        return true
      }

      if (request.action === RuntimeActionIds.OpenFeedbackBugReport) {
        void openBugReportPage()
          .then(() => {
            sendResponse({ success: true })
          })
          .catch((error) => {
            sendResponse({ success: false, error: getErrorMessage(error) })
          })
        return true
      }

      if (
        request.action ===
        RuntimeActionIds.BalanceHistoryDebugSeedEstimateSnapshots
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
