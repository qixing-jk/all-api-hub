import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  openSidePanel as _openSidePanel,
  getSidePanelSupport,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { openOrFocusOptionsMenuItem } from "~/utils/navigation/optionsPage"
import { withPopupClose } from "~/utils/navigation/popup"

const logger = createLogger("Navigation")

/**
 * Opens the side panel when available, otherwise continuing in Options.
 * Account workflows can supply a fallback that preserves their creation intent.
 * When invoked from a toolbar action click, callers can forward the clicked tab
 * so Chromium receives the sidePanel.open request before user-gesture context is
 * lost to async tab lookup.
 */
export const openSidePanelWithFallback = async (
  targetTab?: browser.tabs.Tab | null,
  openFallback: () => Promise<void> = () =>
    openOrFocusOptionsMenuItem(MENU_ITEM_IDS.ACCOUNT),
): Promise<"sidepanel" | "options"> => {
  if (getSidePanelSupport().supported) {
    try {
      await _openSidePanel(targetTab)
      return "sidepanel"
    } catch (error) {
      logger.warn(
        `Failed to open side panel, continuing in Options:\n${getErrorMessage(error)}`,
      )
    }
  }
  await openFallback()
  return "options"
}

/**
 * Open the extension side panel (if supported) and close the popup afterward to
 * avoid overlapping surfaces.
 */
export const openSidePanelPage = withPopupClose(openSidePanelWithFallback)
