import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  userPreferences,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsErrorCategory,
  type ProductAnalyticsResult,
} from "~/services/productAnalytics/events"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to background context menu wiring.
 */
const logger = createLogger("ContextMenus")

const REDEMPTION_MENU_ID = "redemption-assist-context-menu"
const API_CHECK_MENU_ID = "ai-api-check-context-menu"

let clickListenerInstalled = false

const handleContextMenuClick = async (info: any, tab: any) => {
  if (!tab?.id) return

  const selectionText = (info.selectionText || "").trim()
  const pageUrl = info.pageUrl || tab.url || ""
  const isRedemptionMenu = info.menuItemId === REDEMPTION_MENU_ID
  const isApiCheckMenu = info.menuItemId === API_CHECK_MENU_ID
  const tracker = isRedemptionMenu
    ? startProductAnalyticsAction({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
        actionId:
          PRODUCT_ANALYTICS_ACTION_IDS.TriggerRedemptionAssistFromContextMenu,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundContextMenu,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      })
    : isApiCheckMenu
      ? startProductAnalyticsAction({
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.TriggerApiCredentialCheckFromContextMenu,
          surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundContextMenu,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        })
      : undefined
  const completeTracker = async (
    result?: ProductAnalyticsResult,
    options?: { errorCategory?: ProductAnalyticsErrorCategory },
  ) => {
    try {
      if (!tracker) return
      if (options) {
        await tracker.complete(result, options)
        return
      }

      if (result) {
        await tracker.complete(result)
        return
      }

      await tracker.complete()
    } catch (error) {
      logger.warn("Failed to complete product analytics action", error)
    }
  }

  try {
    if (isRedemptionMenu) {
      if (!selectionText) {
        logger.warn("No selection text for redemption assist trigger")
        await completeTracker(PRODUCT_ANALYTICS_RESULTS.Skipped)
        return
      }

      await browser.tabs.sendMessage(tab.id, {
        action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
        selectionText,
        pageUrl,
      })
      await completeTracker()
    }

    if (isApiCheckMenu) {
      await browser.tabs.sendMessage(tab.id, {
        action: RuntimeActionIds.ApiCheckContextMenuTrigger,
        selectionText,
        pageUrl,
      })
      await completeTracker()
    }
  } catch (error) {
    logger.error("Failed to forward context menu trigger", error)
    await completeTracker(PRODUCT_ANALYTICS_RESULTS.Failure, {
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    })
  }
}

/**
 * Ensures the context menu click listener is installed, with best-effort error handling.
 */
function ensureContextMenuClickListener() {
  if (!browser?.contextMenus) {
    return
  }

  if (clickListenerInstalled) {
    return
  }

  try {
    browser.contextMenus.onClicked.addListener(handleContextMenuClick)
    clickListenerInstalled = true
  } catch (error) {
    logger.error("Failed to install context menu click listener", error)
  }
}

/**
 * Refreshes the right-click context menu entries based on the latest user preferences.
 */
export async function refreshContextMenus(preferences: UserPreferences) {
  if (!browser?.contextMenus) {
    logger.warn("contextMenus API unavailable")
    return
  }

  ensureContextMenuClickListener()

  try {
    const redemptionTitle =
      browser.i18n?.getMessage("context_menu_redeem_selection") ||
      "使用兑换助手兑换选中文本"

    const apiCheckTitle =
      browser.i18n?.getMessage("context_menu_ai_api_check") ||
      "快速测试 AI API 的功能可用性"

    const shouldShowRedemptionAssistMenu =
      (preferences.redemptionAssist?.enabled ?? true) &&
      (preferences.redemptionAssist?.contextMenu?.enabled ?? true)

    const shouldShowApiCheckMenu =
      (preferences.webAiApiCheck?.enabled ?? true) &&
      (preferences.webAiApiCheck?.contextMenu?.enabled ?? true)

    // Best-effort cleanup: remove only the menus we own to avoid breaking other features.
    await browser.contextMenus.remove(REDEMPTION_MENU_ID).catch(() => {})
    await browser.contextMenus.remove(API_CHECK_MENU_ID).catch(() => {})

    if (shouldShowRedemptionAssistMenu) {
      browser.contextMenus.create({
        id: REDEMPTION_MENU_ID,
        title: redemptionTitle,
        contexts: ["selection"],
      })
    }

    if (shouldShowApiCheckMenu) {
      browser.contextMenus.create({
        id: API_CHECK_MENU_ID,
        title: apiCheckTitle,
        contexts: ["page", "selection"],
      })
    }
  } catch (error) {
    logger.error("Failed to refresh context menus", error)
  }
}

/**
 * Registers the right-click context menu entry used to trigger redemption assist.
 * The handler forwards selection text to the active tab's content script, which
 * will bypass whitelist and code-format filters.
 */
export async function setupContextMenus() {
  try {
    const preferences = await userPreferences.getPreferences()
    await refreshContextMenus(preferences)
  } catch (error) {
    logger.error("Failed to setup context menus", error)
  }
}
