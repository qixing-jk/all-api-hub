import { POPUP_PAGE_PATH } from "~/constants/extensionPages"
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
import {
  addActionClickListener,
  getSidePanelSupport,
  removeActionClickListener,
  setActionPopup,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { openSidePanelWithFallback } from "~/utils/navigation"

type ActionClickBehavior = "popup" | "sidepanel"

/**
 * Unified logger scoped to toolbar action click behavior wiring.
 */
const logger = createLogger("ActionClickBehavior")

/**
 * Singleton click handler used when the action is configured to open the side panel.
 * Uses the shared open-or-fallback path so toolbar clicks never dead-end.
 * Forwarding the clicked tab lets Chromium keep the sidePanel.open call inside
 * the original user gesture.
 */
const handleActionClick = async (tab: browser.tabs.Tab) => {
  const tracker = startProductAnalyticsAction({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.SidepanelNavigation,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenSidepanelFromToolbarAction,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundToolbarAction,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
  })
  const completeTracker = async (
    result?: ProductAnalyticsResult,
    options?: { errorCategory?: ProductAnalyticsErrorCategory },
  ) => {
    try {
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
    await openSidePanelWithFallback(tab)
    await completeTracker()
  } catch (error) {
    await completeTracker(PRODUCT_ANALYTICS_RESULTS.Failure, {
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    })
    throw error
  }
}

/**
 * Apply toolbar click behavior at runtime.
 * - "popup": restores the popup.html UI and removes side-panel click listeners.
 * - "sidepanel": disables the popup so onClicked fires and opens the shared
 *   side-panel-or-settings fallback path.
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

  // Keep Chromium on the extension-managed click path so runtime fallback always runs.
  if (typeof (chrome as any)?.sidePanel?.setPanelBehavior === "function") {
    try {
      await chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: false,
      })
    } catch (error) {
      logger.warn(
        `sidePanel.setPanelBehavior not available:\n${getErrorMessage(error)}`,
      )
    }
  }

  try {
    await setActionPopup(isSidePanel ? "" : POPUP_PAGE_PATH)
  } catch (error) {
    logger.warn(`action.setPopup not available:\n${getErrorMessage(error)}`)
  }

  if (isSidePanel) {
    addActionClickListener(handleActionClick)
  }
}
