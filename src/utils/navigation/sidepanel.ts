import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  openSidePanel as _openSidePanel,
  getSidePanelSupport,
} from "~/utils/browser/sidePanel"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import {
  SIDE_PANEL_NAVIGATION_DESTINATIONS,
  type SidePanelNavigationDestination,
} from "~/utils/navigation/destinations"
import { openOrFocusOptionsMenuItem } from "~/utils/navigation/optionsPage"
import { withPopupClose } from "~/utils/navigation/popup"

const logger = createLogger("Navigation")

interface SidePanelNavigationOptions {
  enabled?: boolean
  handoff?: {
    publish: () => Promise<boolean>
    /** True if fallback still owns the data; false if the panel accepted it. */
    retract: () => Promise<boolean>
  }
}

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
  options: SidePanelNavigationOptions = {},
): Promise<SidePanelNavigationDestination> => {
  if (options.enabled !== false && getSidePanelSupport().supported) {
    // Publishing may touch asynchronous storage. Start native opening in the
    // same click turn, before awaiting it, to preserve browser user activation.
    const published = options.handoff?.publish() ?? Promise.resolve(true)
    const opened = (async () => {
      try {
        await _openSidePanel(targetTab)
        return true
      } catch (error) {
        logger.warn(
          `Failed to open side panel, continuing in Options:\n${getErrorMessage(error)}`,
        )
        return false
      }
    })()
    if (await published) {
      if (await opened) return SIDE_PANEL_NAVIGATION_DESTINATIONS.SidePanel
      // A mounted receiver can accept the handoff even when native open rejects.
      // Its acknowledgement prevents opening the same workflow a second time.
      if (options.handoff && !(await options.handoff.retract()))
        return SIDE_PANEL_NAVIGATION_DESTINATIONS.SidePanel
    }
  }
  await openFallback()
  return SIDE_PANEL_NAVIGATION_DESTINATIONS.Options
}

/**
 * Open the extension side panel (if supported) and close the popup afterward to
 * avoid overlapping surfaces.
 */
export const openSidePanelPage = withPopupClose(openSidePanelWithFallback)
