import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  addActionClickListener,
  getSidePanelSupport,
  openSidePanel,
  removeActionClickListener,
  setActionPopup,
} from "~/utils/browserApi"
import { createLogger } from "~/utils/logger"
import { openOrFocusOptionsMenuItem } from "~/utils/navigation"

export type ActionClickBehavior = "popup" | "sidepanel"

/**
 * Unified logger scoped to toolbar action click behavior wiring.
 */
const logger = createLogger("ActionClickBehavior")

const POPUP_PAGE = "popup.html"

/**
 * Singleton click handler used when the action is configured to open the side panel.
 * Falls back to options settings when side panel is unavailable.
 */
const handleActionClick = async () => {
  try {
    await openSidePanel()
  } catch (error) {
    logger.warn("Side panel unavailable, opening settings instead", error)
    openOrFocusOptionsMenuItem(MENU_ITEM_IDS.BASIC)
  }
}

/**
 * Apply toolbar click behavior at runtime.
 * - "popup": restores the popup.html UI and removes side-panel click listeners.
 * - "sidepanel": disables the popup so onClicked fires and opens the side panel.
 */
export async function applyActionClickBehavior(
  behavior: ActionClickBehavior,
): Promise<void> {
  const sidePanelSupport = getSidePanelSupport()
  const effectiveBehavior: ActionClickBehavior =
    behavior === "sidepanel" && sidePanelSupport.supported
      ? "sidepanel"
      : "popup"
  const isSidePanel = effectiveBehavior === "sidepanel"

  // 清理旧的点击监听
  removeActionClickListener(handleActionClick)

  // 设置 sidePanel 行为 (chrome only)
  if (typeof (chrome as any)?.sidePanel?.setPanelBehavior === "function") {
    try {
      await chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: isSidePanel,
      })
    } catch (error) {
      logger.warn("sidePanel.setPanelBehavior not available", error)
    }
  }

  // 当选择 sidepanel 时清空 popup；选择 popup 时恢复 popup.html
  try {
    await setActionPopup(isSidePanel ? "" : POPUP_PAGE)
  } catch (error) {
    logger.warn("action.setPopup not available", error)
  }

  if (isSidePanel) {
    addActionClickListener(handleActionClick)
  }
}
