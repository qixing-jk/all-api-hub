import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  checkPermissionViaMessage,
  sendRuntimeMessage,
} from "~/utils/browserApi"
import { createLogger } from "~/utils/logger"
import { extractApiCheckCredentialsFromText } from "~/utils/webAiApiCheck"

import { isEventFromAllApiHubContentUi } from "../shared/contentUi"
import { isLikelyCopyActionTarget } from "../shared/copyActionTarget"
import { ensureRedemptionToastUi } from "../shared/uiRoot"
import {
  API_CHECK_MODAL_CLOSED_EVENT,
  dispatchOpenApiCheckModal,
  waitForApiCheckModalHostReady,
  type ApiCheckModalClosedDetail,
} from "./events"
import { showApiCheckConfirmToast } from "./utils/apiCheckToasts"

/**
 * Unified logger scoped to Web AI API Check content-script flows.
 */
const logger = createLogger("WebAiApiCheckContent")

const AUTO_DETECT_COOLDOWN_MS = 30_000
const SCAN_DEDUP_INTERVAL_MS = 1000

/**
 * Initializes Web AI API Check in content scripts (context menu listener + optional auto-detect).
 */
export function setupWebAiApiCheckContent() {
  const cleanupDetection = setupWebAiApiCheckDetection()
  const cleanupContextMenu = registerContextMenuTriggerListener()

  return () => {
    cleanupDetection()
    cleanupContextMenu()
  }
}

/**
 * Listens for right-click context menu triggers from the background page.
 * This entry point always opens the modal even if extraction yields no credentials.
 */
function registerContextMenuTriggerListener() {
  const listener = (request: any) => {
    if (request?.action !== RuntimeActionIds.ApiCheckContextMenuTrigger) return

    const sourceText = (request.selectionText ?? "").toString()
    const pageUrl = request.pageUrl || window.location.href

    void openModal({
      sourceText,
      pageUrl,
      trigger: "contextMenu",
    })
  }

  browser.runtime.onMessage.addListener(listener)
  return () => {
    try {
      browser.runtime.onMessage.removeListener(listener)
    } catch (error) {
      logger.debug("Failed to remove ApiCheck context menu listener", error)
    }
  }
}

/**
 * Wires DOM events (click/copy/cut) to scan for API credentials, with throttling.
 * Skips interactions originating from the extension content-script UI itself.
 */
function setupWebAiApiCheckDetection() {
  const CLICK_SCAN_INTERVAL_MS = 2000
  let lastClickScan = 0

  let lastPromptAt = 0
  let toastInFlight = false

  let lastScanFingerprint = ""
  let lastScanAt = 0

  const handleModalClosed = (event: Event) => {
    const custom = event as CustomEvent<ApiCheckModalClosedDetail>
    if (!custom.detail) return
    lastPromptAt = Date.now()
  }

  window.addEventListener(
    API_CHECK_MODAL_CLOSED_EVENT,
    handleModalClosed as any,
  )

  const fingerprintText = (text: string): string => {
    // Avoid keeping raw clipboard content in memory: use a lightweight rolling hash.
    let hash = 0
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) | 0
    }
    return `${hash}:${text.length}`
  }

  const requestShouldPrompt = async (pageUrl: string): Promise<boolean> => {
    try {
      const response: any = await sendRuntimeMessage({
        action: RuntimeActionIds.ApiCheckShouldPrompt,
        pageUrl,
      })
      return !!response?.success && !!response?.shouldPrompt
    } catch (error) {
      logger.warn("Failed to read ApiCheck shouldPrompt state", error)
      return false
    }
  }

  const scanForApiCheckCredentials = async (
    sourceText: string,
    options?: { pageUrl?: string; shouldPrompt?: boolean },
  ) => {
    const text = (sourceText ?? "").trim()
    if (!text) return

    const pageUrl = options?.pageUrl || window.location.href
    if (!/^https?:/i.test(pageUrl)) return

    const now = Date.now()
    if (toastInFlight) return
    if (now - lastPromptAt < AUTO_DETECT_COOLDOWN_MS) return

    const extracted = extractApiCheckCredentialsFromText(text)
    if (!extracted.baseUrl || !extracted.apiKey) return

    toastInFlight = true

    try {
      const shouldPrompt =
        typeof options?.shouldPrompt === "boolean"
          ? options.shouldPrompt
          : await requestShouldPrompt(pageUrl)

      if (!shouldPrompt) {
        return
      }

      lastPromptAt = Date.now()
      const confirmed = await showApiCheckConfirmToast()
      if (!confirmed) {
        return
      }

      await openModal({
        sourceText: text,
        pageUrl,
        trigger: "autoDetect",
      })
    } catch (error) {
      logger.warn("Auto-detect flow failed", error)
    } finally {
      toastInFlight = false
    }
  }

  const scheduleApiCheckScan = async (
    sourceText: string,
    options?: { pageUrl?: string; shouldPrompt?: boolean },
  ) => {
    const text = (sourceText ?? "").trim()
    if (!text) return

    const now = Date.now()
    const fingerprint = fingerprintText(text)
    if (
      fingerprint === lastScanFingerprint &&
      now - lastScanAt < SCAN_DEDUP_INTERVAL_MS
    ) {
      return
    }

    lastScanFingerprint = fingerprint
    lastScanAt = now

    await scanForApiCheckCredentials(text, options)
  }

  const handleClick = (event: MouseEvent) => {
    setTimeout(() => {
      if (isEventFromAllApiHubContentUi(event.target)) {
        return
      }

      const now = Date.now()
      if (toastInFlight) return
      if (now - lastPromptAt < AUTO_DETECT_COOLDOWN_MS) return
      if (now - lastClickScan < CLICK_SCAN_INTERVAL_MS) return
      lastClickScan = now

      const pageUrl = window.location.href
      if (!/^https?:/i.test(pageUrl)) return

      const selectionText = window.getSelection()?.toString().trim() || ""
      if (selectionText) {
        void scheduleApiCheckScan(selectionText, { pageUrl })
        return
      }

      if (
        !isLikelyCopyActionTarget(event.target) ||
        !navigator.clipboard ||
        !navigator.clipboard.readText
      ) {
        return
      }

      void (async () => {
        const shouldPrompt = await requestShouldPrompt(pageUrl)
        if (!shouldPrompt) return

        const hasPermission = await checkPermissionViaMessage({
          permissions: ["clipboardRead"],
        })
        if (!hasPermission) {
          return
        }

        try {
          const clipboardText = await navigator.clipboard.readText()
          if (clipboardText) {
            await scheduleApiCheckScan(clipboardText, {
              pageUrl,
              shouldPrompt: true,
            })
          }
        } catch (error) {
          logger.warn("Clipboard read failed", error)
        }
      })()
    }, 500)
  }

  const handleClipboardEvent = (event: ClipboardEvent) => {
    if (isEventFromAllApiHubContentUi(event.target)) {
      return
    }

    const pageUrl = window.location.href
    if (!/^https?:/i.test(pageUrl)) return

    const selectionText = window.getSelection()?.toString().trim() || ""
    const clipboardText = event.clipboardData?.getData("text") || ""
    const sourceText = selectionText || clipboardText

    if (sourceText) {
      void scheduleApiCheckScan(sourceText, { pageUrl })
    }
  }

  document.addEventListener("click", handleClick, true)
  document.addEventListener("copy", handleClipboardEvent, true)
  document.addEventListener("cut", handleClipboardEvent, true)

  return () => {
    window.removeEventListener(
      API_CHECK_MODAL_CLOSED_EVENT,
      handleModalClosed as any,
    )
    document.removeEventListener("click", handleClick, true)
    document.removeEventListener("copy", handleClipboardEvent, true)
    document.removeEventListener("cut", handleClipboardEvent, true)
  }
}

/**
 * Ensure the Shadow DOM UI root is mounted, then open the centered modal.
 */
async function openModal(params: {
  sourceText: string
  pageUrl: string
  trigger: "contextMenu" | "autoDetect"
}) {
  await ensureRedemptionToastUi()
  await waitForApiCheckModalHostReady()
  dispatchOpenApiCheckModal(params)
}
