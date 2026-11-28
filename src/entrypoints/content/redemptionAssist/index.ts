import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  getClipboardEventText,
  getSelectedText,
  registerSelectionEndTextDetection,
} from "~/entrypoints/content/shared/contentTextDetection"
import { isEventFromAllApiHubContentUi } from "~/entrypoints/content/shared/contentUi"
import { isLikelyCopyActionTarget } from "~/entrypoints/content/shared/copyActionTarget"
import {
  handleContextMenuRedemption,
  scanForRedemptionCodes,
} from "~/features/RedemptionAssist/contentFlow"
import { checkPermissionViaMessage } from "~/utils/browser/permissions"
import { onRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to redemption assist content-script flows.
 */
const logger = createLogger("RedemptionAssistContent")

/**
 * Initializes redemption assist in content scripts (event listeners, toasts, etc.).
 */
export function setupRedemptionAssistContent(options?: {
  enableDetection?: boolean
  enableContextMenu?: boolean
}) {
  const cleanups: Array<() => void> = []

  if (options?.enableDetection ?? true) {
    cleanups.push(setupRedemptionAssistDetection())
  }

  if (options?.enableContextMenu ?? true) {
    cleanups.push(registerContextMenuTriggerListener())
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup()
    }
  }
}

/**
 * Wires DOM events (click/copy/cut) to scan for redemption codes, with throttling.
 * Skips interactions originating from the redemption assist UI itself.
 */
function setupRedemptionAssistDetection() {
  const CLICK_SCAN_INTERVAL_MS = 2000
  let lastClickScan = 0

  const handleClick = async (event: MouseEvent) => {
    setTimeout(async () => {
      // Ignore clicks that originate from inside our own redemption assist UI
      if (isEventFromAllApiHubContentUi(event.target)) {
        return
      }

      const now = Date.now()
      if (now - lastClickScan < CLICK_SCAN_INTERVAL_MS) return
      lastClickScan = now

      // Try to get selected text first
      let text = getSelectedText()

      // Fallback: try to read clipboard content if the click target looks like a copy action
      if (
        !text &&
        isLikelyCopyActionTarget(event.target) &&
        navigator.clipboard &&
        navigator.clipboard.readText
      ) {
        // Only read clipboard on click when the target looks like a copy action.
        const hasPermission = await checkPermissionViaMessage({
          permissions: ["clipboardRead"],
        })
        if (hasPermission) {
          try {
            const clipText = await navigator.clipboard.readText()
            if (clipText) {
              text = clipText.trim()
            }
          } catch (error) {
            logger.warn("Clipboard read failed", error)
          }
        }
      }

      // Fallback: extract text from the clicked element (limited length)
      if (!text) {
        const target = event.target as HTMLElement | null
        if (target) {
          text = (target.innerText || target.textContent || "").slice(0, 50)
        }
      }

      if (text) {
        void scheduleRedemptionScan(text)
      }
    }, 500)
  }

  const handleClipboardEvent = (event: ClipboardEvent) => {
    // Ignore clipboard events that originate from inside our own redemption assist UI
    if (isEventFromAllApiHubContentUi(event.target)) {
      return
    }
    const text = getClipboardEventText(event)

    if (text) {
      void scheduleRedemptionScan(text)
    }
  }

  const cleanupSelectionEndDetection = registerSelectionEndTextDetection(
    (sourceText) => {
      void scheduleRedemptionScan(sourceText)
    },
  )

  document.addEventListener("click", handleClick, true)
  document.addEventListener("copy", handleClipboardEvent, true)
  document.addEventListener("cut", handleClipboardEvent, true)

  return () => {
    document.removeEventListener("click", handleClick, true)
    document.removeEventListener("copy", handleClipboardEvent, true)
    document.removeEventListener("cut", handleClipboardEvent, true)
    cleanupSelectionEndDetection()
  }
}

/**
 * Listens for right-click context menu triggers from the background page.
 * This entry point bypasses whitelist and code format filters: it sends the raw
 * selection to the background auto-redeem flow directly.
 */
function registerContextMenuTriggerListener() {
  const listener = (
    request:
      | {
          action?: string
          selectionText?: string
          pageUrl?: string
        }
      | null
      | undefined,
  ) => {
    if (request?.action !== RuntimeActionIds.RedemptionAssistContextMenuTrigger)
      return

    const selectionText = (request.selectionText ?? "").trim()
    const pageUrl = request.pageUrl || window.location.href

    if (!selectionText) {
      logger.warn("Context menu trigger missing selection")
      return
    }

    void handleContextMenuRedemption(selectionText, pageUrl)
  }

  return onRuntimeMessage(listener)
}

const SCAN_DEDUP_INTERVAL_MS = 1000
let lastScanText = ""
let lastScanAt = 0

/**
 * Deduplicates scan requests before invoking the expensive scan routine.
 * @param sourceText Selected or clipboard text to inspect.
 */
async function scheduleRedemptionScan(sourceText: string) {
  const text = (sourceText ?? "").trim()
  if (!text) return

  const now = Date.now()
  if (text === lastScanText && now - lastScanAt < SCAN_DEDUP_INTERVAL_MS) {
    return
  }

  lastScanText = text
  lastScanAt = now

  await scanForRedemptionCodes(text)
}
