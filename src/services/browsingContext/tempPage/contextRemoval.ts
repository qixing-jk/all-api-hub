import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import { removeTabOwningWindow } from "~/utils/browser/ownedTabRemoval"
import { removeTab } from "~/utils/browser/tabs"

import { removeCompositeTab } from "./compositeWindow"
import {
  type TempContext,
  type TempContextOpenResult,
  type TempWindowHandle,
} from "./contracts"

/**
 * Remove a known temp-window handle through the typed browser adapter that
 * matches the handle owner.
 */
export async function removeTempWindowHandle(handle: TempWindowHandle) {
  switch (handle.kind) {
    case TEMP_CONTEXT_MODES.Window:
      // A window-owned popup that cannot be closed still loses its tab, so the
      // leftover is never left to the next reclamation sweep by default.
      await removeTabOwningWindow(handle.tabId, handle.windowId)
      return
    case TEMP_CONTEXT_MODES.Composite:
      await removeCompositeTab(handle.windowId, handle.tabId)
      return
    case TEMP_CONTEXT_MODES.Tab:
      await removeTab(handle.tabId)
  }
}

type TempContextHandleSource = TempContext | TempContextOpenResult

/**
 * Builds the browser-removal handle for a registered or partially opened temp context.
 */
export function getTempContextHandle(
  source: TempContextHandleSource,
): TempWindowHandle {
  switch (source.mode) {
    case TEMP_CONTEXT_MODES.Window:
      return {
        kind: TEMP_CONTEXT_MODES.Window,
        windowId: source.ownerWindowId,
        tabId: source.tabId,
      }
    case TEMP_CONTEXT_MODES.Composite:
      return {
        kind: TEMP_CONTEXT_MODES.Composite,
        windowId: source.ownerWindowId,
        tabId: source.tabId,
      }
    case TEMP_CONTEXT_MODES.Tab:
      return { kind: TEMP_CONTEXT_MODES.Tab, tabId: source.tabId }
  }
}
