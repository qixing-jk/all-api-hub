import { queryTabs, removeTab, removeWindow } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to closing extension-owned temporary pages.
 */
const logger = createLogger("OwnedTabRemoval")

/**
 * Removes a tab that owns its window, falling back to removing the tab when the
 * window cannot be closed.
 *
 * A popup whose window refuses to close would otherwise stay on screen with
 * nothing left to close it: the in-memory handle is already gone by then, so the
 * tab is the only part this extension can still remove.
 */
export async function removeTabOwningWindow(
  tabId: number,
  windowId: number | null | undefined,
): Promise<"window" | "tab"> {
  if (typeof windowId !== "number") {
    await removeTab(tabId)
    return "tab"
  }

  // The user may have opened another tab in this popup since we created it.
  // Closing the whole window would close that unrelated page as well.
  let tabs: browser.tabs.Tab[]
  try {
    tabs = await queryTabs({ windowId })
  } catch (error) {
    logger.warn(
      "Unable to inspect temp window tabs; removing its tab instead",
      {
        windowId,
        tabId,
        error: getErrorMessage(error),
      },
    )
    await removeTab(tabId)
    return "tab"
  }

  if (tabs.length > 1 || (tabs.length === 1 && tabs[0]?.id !== tabId)) {
    await removeTab(tabId)
    return "tab"
  }

  try {
    await removeWindow(windowId)
    return "window"
  } catch (error) {
    logger.warn("Failed to close temp window; removing its tab instead", {
      windowId,
      tabId,
      error: getErrorMessage(error),
    })
    await removeTab(tabId)
    return "tab"
  }
}
