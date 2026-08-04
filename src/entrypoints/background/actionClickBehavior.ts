import { POPUP_PAGE_PATH } from "~/constants/extensionPages"
import {
  TOOLBAR_ACTION_CLICK_BEHAVIORS,
  userPreferences,
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
  getSidePanelSupport,
  NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS,
  setActionPopup,
  setNativeSidePanelActionClick,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { openOptionsPage, openSidePanelWithFallback } from "~/utils/navigation"

/**
 * Unified logger scoped to toolbar action click behavior wiring.
 */
const logger = createLogger("ActionClickBehavior")

let appliedBehavior: ToolbarActionClickBehavior | null = null
let shouldManuallyOpenSidePanel = false
let actionBehaviorQueue: Promise<void> = Promise.resolve()

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
 * Resolves the current behavior from memory or durable preferences.
 */
async function getEffectiveClickBehavior(): Promise<ToolbarActionClickBehavior> {
  if (appliedBehavior) {
    return appliedBehavior
  }

  const preferences = await userPreferences.getPreferencesStrict()
  return resolveToolbarActionClickBehavior(
    preferences.actionClickBehavior ?? TOOLBAR_ACTION_CLICK_BEHAVIORS.Popup,
    getSidePanelSupport().supported,
  )
}

/**
 * Routes toolbar clicks through the last reconciled behavior, or the durable
 * preference when an MV3 worker receives a click before reconciliation.
 */
const handleToolbarActionClick = async (tab: browser.tabs.Tab) => {
  const support = getSidePanelSupport()
  if (
    appliedBehavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel &&
    support.supported &&
    support.kind === "firefox-sidebar-action"
  ) {
    return handleOpenSidePanelActionClick(tab)
  }

  const wasUnreconciled = appliedBehavior === null
  let behavior: ToolbarActionClickBehavior
  try {
    behavior = await getEffectiveClickBehavior()
  } catch (error) {
    logger.warn("Failed to resolve toolbar action click behavior", error)
    return
  }

  if (behavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.Options) {
    await openOptionsPage()
    return
  }

  if (behavior !== TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel) {
    return
  }

  if (
    shouldManuallyOpenSidePanel ||
    (support.supported &&
      (support.kind === "firefox-sidebar-action" || wasUnreconciled))
  ) {
    await handleOpenSidePanelActionClick(tab)
  }
}

/**
 * Registers the stable dispatcher used for every toolbar behavior.
 */
export function setupActionClickBehaviorListener(): () => void {
  return addActionClickListener(handleToolbarActionClick)
}

/**
 * Projects one requested behavior into the browser action APIs.
 */
async function reconcileActionClickBehavior(
  behavior: ToolbarActionClickBehavior,
): Promise<void> {
  const support = getSidePanelSupport()
  const effectiveBehavior = resolveToolbarActionClickBehavior(
    behavior,
    support.supported,
  )
  const isSidePanel =
    effectiveBehavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel
  const isChromiumSidePanel =
    isSidePanel && support.supported && support.kind === "chromium-side-panel"
  const requiresNativeSidePanelDisable =
    appliedBehavior === null &&
    !isChromiumSidePanel &&
    support.kind === "chromium-side-panel"
  const wasUsingNativeSidePanel =
    appliedBehavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.SidePanel &&
    !shouldManuallyOpenSidePanel
  const previousAppliedBehavior = appliedBehavior
  const previousShouldManuallyOpenSidePanel = shouldManuallyOpenSidePanel

  if (!isChromiumSidePanel) {
    const nativeSidePanelDisabled = await setNativeSidePanelActionClick(false)
    if (
      (wasUsingNativeSidePanel &&
        nativeSidePanelDisabled !==
          NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Applied) ||
      (requiresNativeSidePanelDisable &&
        nativeSidePanelDisabled ===
          NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Rejected)
    ) {
      throw new Error("Failed to disable native side-panel action click")
    }

    if (wasUsingNativeSidePanel) {
      // Keep the old side-panel route manual between native disable and popup
      // commit so clicks remain viable during, or after failure of, this swap.
      shouldManuallyOpenSidePanel = true
    }
  }

  if (isChromiumSidePanel) {
    // Once the popup clears, clicks reach the stable listener. Publish a manual
    // side-panel route before native enable, then finalize it from that result.
    appliedBehavior = effectiveBehavior
    shouldManuallyOpenSidePanel = true
  }

  try {
    await setActionPopup(
      isSidePanel ||
        effectiveBehavior === TOOLBAR_ACTION_CLICK_BEHAVIORS.Options
        ? ""
        : POPUP_PAGE_PATH,
    )
  } catch (error) {
    if (isChromiumSidePanel) {
      appliedBehavior = previousAppliedBehavior
      shouldManuallyOpenSidePanel = previousShouldManuallyOpenSidePanel
    }
    logger.warn(`action.setPopup not available:\n${getErrorMessage(error)}`)
    throw error
  }

  let manuallyOpenSidePanel = isSidePanel
  if (isChromiumSidePanel) {
    manuallyOpenSidePanel =
      (await setNativeSidePanelActionClick(true)) !==
      NATIVE_SIDE_PANEL_ACTION_CLICK_RESULTS.Applied
  }

  appliedBehavior = effectiveBehavior
  shouldManuallyOpenSidePanel = manuallyOpenSidePanel
}

/**
 * Apply toolbar click behavior at runtime.
 * Browser action projections are serialized so rapid preference changes cannot
 * leave popup and native side-panel behavior out of sync.
 */
export function applyActionClickBehavior(
  behavior: ToolbarActionClickBehavior,
): Promise<void> {
  const operation = actionBehaviorQueue.then(() =>
    reconcileActionClickBehavior(behavior),
  )
  actionBehaviorQueue = operation.catch(() => undefined)
  return operation
}
