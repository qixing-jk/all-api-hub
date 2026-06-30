import { POPUP_PAGE_PATH } from "~/constants/extensionPages"
import {
  TOOLBAR_ACTION_CLICK_BEHAVIORS,
  type ToolbarActionClickBehavior,
} from "~/services/preferences/userPreferences"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  addActionClickListener,
  disableNativeSidePanelActionClick,
  getSidePanelSupport,
  removeActionClickListener,
  setActionPopup,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { openOptionsPage, openSidePanelWithFallback } from "~/utils/navigation"

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
const handleOpenSidePanelActionClick = async (tab: browser.tabs.Tab) => {
  const tracker = startProductAnalyticsAction({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.SidepanelNavigation,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenSidepanelFromToolbarAction,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundToolbarAction,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
  })

  try {
    await openSidePanelWithFallback(tab)
    tracker.complete()
  } catch (error) {
    tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    })
    throw error
  }
}

const handleOpenOptionsActionClick = async () => {
  await openOptionsPage()
}

const resolveToolbarActionClickBehavior = (
  behavior: ToolbarActionClickBehavior,
  sidePanelSupported: boolean,
): ToolbarActionClickBehavior => {
  if (behavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.Options) {
    return TOOLBAR_ACTION_CLICK_BEHAVIORS.Options
  }

  if (
    behavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel &&
    sidePanelSupported
  ) {
    return TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel
  }

  return TOOLBAR_ACTION_CLICK_BEHAVIORS.Popup
}

/**
 * Apply toolbar click behavior at runtime.
 * - "popup": restores the popup.html UI and removes side-panel click listeners.
 * - "sidepanel": disables the popup so onClicked fires and opens the shared
 *   side-panel-or-settings fallback path.
 * - "options": disables the popup so onClicked opens the standard options page.
 */
export async function applyActionClickBehavior(
  behavior: ToolbarActionClickBehavior,
): Promise<void> {
  const sidePanelSupport = getSidePanelSupport()
  const effectiveBehavior = resolveToolbarActionClickBehavior(
    behavior,
    sidePanelSupport.supported,
  )
  const isSidePanel =
    effectiveBehavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel
  const isOptions = effectiveBehavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.Options

  // 清理旧的点击监听
  removeActionClickListener(handleOpenSidePanelActionClick)
  removeActionClickListener(handleOpenOptionsActionClick)

  await disableNativeSidePanelActionClick()

  try {
    await setActionPopup(isSidePanel || isOptions ? "" : POPUP_PAGE_PATH)
  } catch (error) {
    logger.warn(`action.setPopup not available:\n${getErrorMessage(error)}`)
  }

  if (isSidePanel) {
    addActionClickListener(handleOpenSidePanelActionClick)
  }

  if (isOptions) {
    addActionClickListener(handleOpenOptionsActionClick)
  }
}
