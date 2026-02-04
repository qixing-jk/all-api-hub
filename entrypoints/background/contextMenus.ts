import { RuntimeActionIds } from "~/constants/runtimeActions"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to background context menu wiring.
 */
const logger = createLogger("ContextMenus")

const REDEMPTION_MENU_ID = "redemption-assist-context-menu"
const API_CHECK_MENU_ID = "ai-api-check-context-menu"

/**
 * Registers the right-click context menu entry used to trigger redemption assist.
 * The handler forwards selection text to the active tab's content script, which
 * will bypass whitelist and code-format filters.
 */
export async function setupContextMenus() {
  if (!browser?.contextMenus) {
    logger.warn("contextMenus API unavailable")
    return
  }

  try {
    const redemptionTitle =
      browser.i18n?.getMessage("context_menu_redeem_selection") ||
      "使用兑换助手兑换选中文本"

    const apiCheckTitle =
      browser.i18n?.getMessage("context_menu_ai_api_check") ||
      "快速测试 AI API 的功能可用性"

    // Best-effort cleanup: remove only the menus we own to avoid breaking other features.
    await browser.contextMenus.remove(REDEMPTION_MENU_ID).catch(() => {})
    await browser.contextMenus.remove(API_CHECK_MENU_ID).catch(() => {})

    // Create the redemption assist context menu
    browser.contextMenus.create({
      id: REDEMPTION_MENU_ID,
      title: redemptionTitle,
      contexts: ["selection"],
    })

    // Create the AI API Check context menu (works with and without selection).
    browser.contextMenus.create({
      id: API_CHECK_MENU_ID,
      title: apiCheckTitle,
      contexts: ["page", "selection"],
    })
  } catch (error) {
    logger.error("Failed to create menu", error)
  }

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return

    const selectionText = (info.selectionText || "").trim()
    const pageUrl = info.pageUrl || tab.url || ""

    try {
      if (info.menuItemId === REDEMPTION_MENU_ID) {
        if (!selectionText) {
          logger.warn("No selection text for redemption assist trigger")
          return
        }

        await browser.tabs.sendMessage(tab.id, {
          action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
          selectionText,
          pageUrl,
        })
      }

      if (info.menuItemId === API_CHECK_MENU_ID) {
        await browser.tabs.sendMessage(tab.id, {
          action: RuntimeActionIds.ApiCheckContextMenuTrigger,
          selectionText,
          pageUrl,
        })
      }
    } catch (error) {
      logger.error("Failed to forward context menu trigger", error)
    }
  })
}
