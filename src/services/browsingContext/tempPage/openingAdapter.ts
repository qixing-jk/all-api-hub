import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import {
  createTab,
  createWindow,
  queryTabs,
  removeWindow,
  updateWindow,
  WINDOW_CREATION_FAILURE_REASONS,
} from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

import { resolveTempWindowSize } from "./browserAdapter"
import {
  openTabInCompositeWindow,
  TEMP_CONTEXT_INITIAL_URL,
} from "./compositeWindow"
import {
  TEMP_CONTEXT_TYPES,
  type TempContextOpenMode,
  type TempContextOpenResult,
} from "./contracts"
import { logger, logTempWindow } from "./diagnostics"
import {
  classifyWindowCreationFailure,
  createRecoverableWindowCreationError,
  createUnsupportedTempContextError,
  isRecoverableWindowCreationError,
} from "./failures"

/**
 * Opens a standard tab-backed temp context.
 */
async function openPlainTabTempContext(
  options: { windowId?: number } = {},
): Promise<TempContextOpenResult> {
  const tab =
    options.windowId == null
      ? await createTab(TEMP_CONTEXT_INITIAL_URL, false)
      : await createTab(TEMP_CONTEXT_INITIAL_URL, false, options)

  if (!tab?.id) {
    throw new Error(t("messages:background.cannotCreateWindowOrTab"))
  }

  return {
    id: tab.id,
    tabId: tab.id,
    type: TEMP_CONTEXT_TYPES.Tab,
    mode: TEMP_CONTEXT_MODES.Tab,
  }
}

/**
 * Opens a popup-backed temp context and cleans up partial windows on failure.
 */
async function openPopupWindowTempContext(params: {
  origin: string
  requestId: string
  suppressMinimize?: boolean
  incognito?: boolean
}): Promise<TempContextOpenResult> {
  let windowId: number | null = null

  try {
    let popupWindow: browser.windows.Window | null = null

    try {
      popupWindow = await createWindow({
        url: TEMP_CONTEXT_INITIAL_URL,
        type: "popup",
        ...(await resolveTempWindowSize()),
        focused: false,
        incognito: Boolean(params.incognito),
      })
    } catch (error) {
      const reason = classifyWindowCreationFailure({ error })
      if (reason) {
        throw createRecoverableWindowCreationError(reason, error)
      }
      throw error
    }

    const missingWindowReason = classifyWindowCreationFailure({
      missingHandle: !popupWindow?.id,
    })
    const popupWindowId = popupWindow?.id
    if (missingWindowReason || popupWindowId == null) {
      throw createRecoverableWindowCreationError(
        missingWindowReason ??
          WINDOW_CREATION_FAILURE_REASONS.WINDOW_HANDLE_UNAVAILABLE,
      )
    }

    windowId = popupWindowId

    const tabs = await queryTabs({
      windowId,
      active: true,
    })
    const tabId = tabs[0]?.id

    const missingTabReason = classifyWindowCreationFailure({
      missingHandle: !tabId,
    })
    if (missingTabReason || tabId == null) {
      throw createRecoverableWindowCreationError(
        missingTabReason ??
          WINDOW_CREATION_FAILURE_REASONS.WINDOW_HANDLE_UNAVAILABLE,
      )
    }

    // Best-effort minimize to reduce disturbance unless suppressed (e.g., popup context).
    if (!params.suppressMinimize) {
      try {
        await updateWindow(windowId, { state: "minimized" })
        logTempWindow("quietWindowMinimized", {
          requestId: params.requestId,
          origin: params.origin,
          windowId,
        })
      } catch (minErr) {
        logTempWindow("quietWindowMinimizeFailed", {
          requestId: params.requestId,
          origin: params.origin,
          windowId,
          error: getErrorMessage(minErr),
        })
      }
    }

    return {
      id: windowId,
      tabId,
      type: TEMP_CONTEXT_TYPES.Window,
      mode: TEMP_CONTEXT_MODES.Window,
      ownerWindowId: windowId,
    }
  } catch (error) {
    if (windowId != null) {
      try {
        await removeWindow(windowId)
      } catch (cleanupError) {
        logger.warn(
          "Failed to cleanup temp context after popup creation error",
          cleanupError,
        )
      }
    }

    throw error
  }
}

/**
 * Runs the preferred temp-context mode first, then retries once as a plain tab
 * when the failure is recoverable and the flow allows rollback.
 */
export async function openFallbackAwareTempContext(params: {
  url: string
  origin: string
  requestId: string
  requestedMode: TempContextOpenMode
  allowWindowRollback: boolean
  suppressMinimize?: boolean
  incognito?: boolean
}): Promise<TempContextOpenResult> {
  if (params.requestedMode === TEMP_CONTEXT_MODES.Tab) {
    return await openPlainTabTempContext()
  }

  try {
    if (params.requestedMode === TEMP_CONTEXT_MODES.Composite) {
      const opened = await openTabInCompositeWindow({
        origin: params.origin,
        requestId: params.requestId,
        suppressMinimize: params.suppressMinimize,
      })

      return {
        id: opened.tabId,
        tabId: opened.tabId,
        type: TEMP_CONTEXT_TYPES.Tab,
        mode: TEMP_CONTEXT_MODES.Composite,
        ownerWindowId: opened.windowId,
      }
    }

    return await openPopupWindowTempContext({
      origin: params.origin,
      requestId: params.requestId,
      suppressMinimize: params.suppressMinimize,
      incognito: params.incognito,
    })
  } catch (error) {
    if (!isRecoverableWindowCreationError(error)) {
      throw error
    }

    logTempWindow("tempContextWindowCreationRecoverable", {
      requestId: params.requestId,
      origin: params.origin,
      requestedMode: params.requestedMode,
      allowWindowRollback: params.allowWindowRollback,
      reason: error.reason,
      error: error.message,
    })

    if (!params.allowWindowRollback) {
      throw createUnsupportedTempContextError(error.reason)
    }

    const fallbackContext = await openPlainTabTempContext()

    logTempWindow("tempContextWindowCreationRolledBackToTab", {
      requestId: params.requestId,
      origin: params.origin,
      requestedMode: params.requestedMode,
      fallbackType: fallbackContext.type,
      reason: error.reason,
    })

    return fallbackContext
  }
}
