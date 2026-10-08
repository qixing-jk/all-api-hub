import { createTab, queryTabs, removeTab } from "~/utils/browser/tabs"
import {
  createWindow,
  getWindow,
  hasWindowsAPI,
  removeWindow,
  updateWindow,
  WINDOW_CREATION_FAILURE_REASONS,
} from "~/utils/browser/windows"
import { getErrorMessage } from "~/utils/core/error"

import { resolveTempWindowSize } from "./browserAdapter"
import { logger, logTempWindow } from "./diagnostics"
import {
  classifyWindowCreationFailure,
  createRecoverableWindowCreationError,
} from "./failures"

type CompositeWindowCreationResult = { windowId: number; tabId: number }

let compositeWindowId: number | null = null

let compositeWindowOperationQueue: Promise<void> = Promise.resolve()

/**
 * Serialize composite temp-window open and close operations.
 */
async function withCompositeWindowLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = compositeWindowOperationQueue.then(operation, operation)
  const nextQueue = result.then(
    () => undefined,
    () => undefined,
  )
  compositeWindowOperationQueue = nextQueue
  return await result
}

/** Checks whether the remembered shared window can still accept a tab. */
export async function hasLiveCompositeWindow(): Promise<boolean> {
  return await withCompositeWindowLock(async () => {
    if (compositeWindowId == null) return false

    try {
      const existingWindow = await getWindow(compositeWindowId)
      if (existingWindow?.id === compositeWindowId) return true
    } catch {
      // A closed or inaccessible remembered window is not reusable.
    }

    compositeWindowId = null
    return false
  })
}

/**
 * Remove a composite tab while closing the shared owner window when it is the
 * final remaining tab.
 */
export async function removeCompositeTab(windowId: number, tabId: number) {
  await withCompositeWindowLock(() => removeCompositeTabLocked(windowId, tabId))
}

/**
 * Remove a composite tab after the composite operation lock is held.
 */
async function removeCompositeTabLocked(windowId: number, tabId: number) {
  let tabs: browser.tabs.Tab[]

  try {
    tabs = await queryTabs({ windowId })
  } catch (error) {
    logger.warn("Failed to inspect composite temp window; removing tab only", {
      windowId,
      tabId,
      error,
    })
    await removeTab(tabId)
    return
  }

  const isOnlyTab = tabs.length === 1 && tabs[0]?.id === tabId
  if (!isOnlyTab) {
    await removeTab(tabId)
    return
  }

  if (compositeWindowId === windowId) {
    compositeWindowId = null
  }

  try {
    await removeWindow(windowId)
  } catch (error) {
    logger.warn(
      "Failed to remove final composite temp window; falling back to tab",
      { windowId, tabId, error },
    )
    await removeTab(tabId)
  }
}

/**
 * Opens a temporary tab inside a single shared window (composite mode).
 * Reuses the shared window when possible and falls back to recreating it when closed.
 */
export async function openTabInCompositeWindow(params: {
  initialUrl?: string
  origin: string
  requestId: string
  suppressMinimize?: boolean
}): Promise<{ windowId: number; tabId: number }> {
  return await withCompositeWindowLock(() =>
    openTabInCompositeWindowLocked(params),
  )
}

/**
 * Open a composite temp tab after the composite operation lock is held.
 */
async function openTabInCompositeWindowLocked(params: {
  initialUrl?: string
  origin: string
  requestId: string
  suppressMinimize?: boolean
}): Promise<CompositeWindowCreationResult> {
  const initialUrl = params.initialUrl ?? TEMP_CONTEXT_INITIAL_URL
  if (!hasWindowsAPI()) {
    throw createRecoverableWindowCreationError(
      WINDOW_CREATION_FAILURE_REASONS.WINDOWS_API_UNAVAILABLE,
    )
  }

  if (compositeWindowId != null) {
    const previousCompositeWindowId = compositeWindowId
    let existingCompositeWindowConfirmed = false

    try {
      const existingCompositeWindow = await getWindow(previousCompositeWindowId)
      if (!existingCompositeWindow) {
        throw createRecoverableWindowCreationError(
          WINDOW_CREATION_FAILURE_REASONS.WINDOW_HANDLE_UNAVAILABLE,
        )
      }
      existingCompositeWindowConfirmed = true
      const tab = await createTab(initialUrl, false, {
        windowId: previousCompositeWindowId,
      })
      const tabId = tab?.id
      const missingTabReason = classifyWindowCreationFailure({
        missingHandle: !tabId,
      })
      if (missingTabReason || tabId == null) {
        throw createRecoverableWindowCreationError(
          missingTabReason ??
            WINDOW_CREATION_FAILURE_REASONS.WINDOW_HANDLE_UNAVAILABLE,
        )
      }

      return { windowId: previousCompositeWindowId, tabId }
    } catch (error) {
      logTempWindow("compositeWindowNotAlive", {
        requestId: params.requestId,
        origin: params.origin,
        windowId: previousCompositeWindowId,
        error: getErrorMessage(error),
      })

      if (existingCompositeWindowConfirmed) {
        throw error
      }

      compositeWindowId = null
    }
  }

  let windowId: number | null = null

  try {
    let compositeWindow: browser.windows.Window | null = null

    try {
      compositeWindow = await createWindow({
        url: initialUrl,
        type: "normal",
        ...(await resolveTempWindowSize()),
        focused: false,
      })
    } catch (error) {
      const reason = classifyWindowCreationFailure({ error })
      if (reason) {
        throw createRecoverableWindowCreationError(reason, error)
      }
      throw error
    }

    const compositeWindowHandle = compositeWindow?.id
    if (compositeWindowHandle == null) {
      throw createRecoverableWindowCreationError(
        WINDOW_CREATION_FAILURE_REASONS.WINDOW_HANDLE_UNAVAILABLE,
      )
    }

    windowId = compositeWindowHandle
    compositeWindowId = windowId

    if (!params.suppressMinimize) {
      try {
        await updateWindow(windowId, { state: "minimized" })
        logTempWindow("compositeWindowMinimized", {
          requestId: params.requestId,
          origin: params.origin,
          windowId,
        })
      } catch (minErr) {
        logTempWindow("compositeWindowMinimizeFailed", {
          requestId: params.requestId,
          origin: params.origin,
          windowId,
          error: getErrorMessage(minErr),
        })
      }
    }

    const tabs = await queryTabs({
      windowId,
      active: true,
    })
    const tabId = tabs[0]?.id

    if (tabId == null) {
      throw createRecoverableWindowCreationError(
        WINDOW_CREATION_FAILURE_REASONS.WINDOW_HANDLE_UNAVAILABLE,
      )
    }

    return { windowId, tabId }
  } catch (error) {
    if (windowId != null) {
      compositeWindowId = null

      try {
        await removeWindow(windowId)
      } catch (cleanupError) {
        logger.warn(
          "Failed to cleanup composite temp context after creation error",
          cleanupError,
        )
      }
    }

    throw error
  }
}

export const TEMP_CONTEXT_INITIAL_URL = "about:blank"

/** Forgets a browser-removed composite window before another task opens it. */
export function forgetCompositeWindow(windowId: number) {
  if (compositeWindowId === windowId) {
    compositeWindowId = null
    logTempWindow("compositeWindowRemoved", { windowId })
  }
}
