import { RuntimeActionIds } from "~/constants/runtimeActions"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to background context menu wiring.
 */
const logger = createLogger("ContextMenus")

const REDEMPTION_MENU_ID = "redemption-assist-context-menu"

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
    const title =
      browser.i18n?.getMessage("context_menu_redeem_selection") ||
      "使用兑换助手兑换选中文本"
    // Remove any existing menus to prevent duplicates
    await browser.contextMenus.removeAll()

    // Create the redemption assist context menu
    browser.contextMenus.create({
      id: REDEMPTION_MENU_ID,
      title,
      contexts: ["selection"],
    })
  } catch (error) {
    logger.error("Failed to create menu", error)
  }

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== REDEMPTION_MENU_ID) return
    if (!tab?.id) return

    const selectionText = (info.selectionText || "").trim()
    const pageUrl = info.pageUrl || tab.url || ""

    if (!selectionText) {
      logger.warn("No selection text for redemption assist trigger")
      return
    }

    try {
      await browser.tabs.sendMessage(tab.id, {
        action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
        selectionText,
        pageUrl,
      })
    } catch (error) {
      logger.error("Failed to forward redemption assist trigger", error)
    }
  })
}
