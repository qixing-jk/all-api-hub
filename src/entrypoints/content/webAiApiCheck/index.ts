import { RuntimeActionIds } from "~/constants/runtimeActions"
import { extractApiCheckCredentialsFromText } from "~/services/verification/webAiApiCheck/extractCredentials"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import {
  checkPermissionViaMessage,
  onRuntimeMessage,
} from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { isHttpUrl } from "~/utils/core/urlParsing"

import {
  getClipboardEventText,
  getSelectedText,
  registerSelectionEndTextDetection,
} from "../shared/contentTextDetection"
import { isEventFromAllApiHubContentUi } from "../shared/contentUi"
import { isLikelyCopyActionTarget } from "../shared/copyActionTarget"
import { ensureRedemptionToastUi } from "../shared/uiRoot"
import {
  API_CHECK_MODAL_CLOSED_EVENT,
  dispatchOpenApiCheckModal,
  waitForApiCheckModalHostReady,
  type ApiCheckModalClosedDetail,
  type ApiCheckOpenModalDetail,
} from "./events"
import { showApiCheckConfirmToast } from "./utils/apiCheckToasts"

/**
 * Unified logger scoped to Web AI API Check content-script flows.
 */
const logger = createLogger("WebAiApiCheckContent")

const AUTO_DETECT_COOLDOWN_MS = 2000
const SCAN_DEDUP_INTERVAL_MS = 1000

/**
 * Initializes Web AI API Check in content scripts (context menu listener + optional auto-detect).
 */
export function setupWebAiApiCheckContent(options?: {
  enableDetection?: boolean
  enableContextMenu?: boolean
  apiKeyCleanupPatterns?: string[]
}) {
  const cleanups: Array<() => void> = []
  const apiKeyCleanupPatterns = options?.apiKeyCleanupPatterns ?? []

  if (options?.enableDetection ?? true) {
    cleanups.push(setupWebAiApiCheckDetection({ apiKeyCleanupPatterns }))
  }

  if (options?.enableContextMenu ?? true) {
    cleanups.push(registerContextMenuTriggerListener({ apiKeyCleanupPatterns }))
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup()
    }
  }
}

/**
 * Listens for right-click context menu triggers from the background page.
 * This entry point always opens the modal even if extraction yields no credentials.
 */
function registerContextMenuTriggerListener(options: {
  apiKeyCleanupPatterns: string[]
}) {
  const listener = (request: any) => {
    if (request?.action !== RuntimeActionIds.ApiCheckContextMenuTrigger) return

    const sourceText = (request.selectionText ?? "").toString()
    const pageUrl = request.pageUrl || window.location.href

    void openModal({
      sourceText,
      pageUrl,
      trigger: "contextMenu",
      apiKeyCleanupPatterns: options.apiKeyCleanupPatterns,
    })
  }

  const cleanup = onRuntimeMessage(listener)
  return () => {
    try {
      cleanup()
    } catch (error) {
      logger.debug("Failed to remove ApiCheck context menu listener", error)
    }
  }
}

/**
 * Wires DOM events (click/copy/cut) to scan for API credentials, with throttling.
 * Skips interactions originating from the extension content-script UI itself.
 */
function setupWebAiApiCheckDetection(config: {
  apiKeyCleanupPatterns: string[]
}) {
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

  const requestShouldPrompt = async (
    pageUrl: string,
  ): Promise<{
    shouldPrompt: boolean
    enhancedShouldPrompt: boolean
    apiKeyCleanupPatterns: string[]
  }> => {
    try {
      const response = await sendWebAiApiCheckMessage(
        WebAiApiCheckMessageTypes.ShouldPrompt,
        { pageUrl },
      )
      return {
        shouldPrompt: !!response?.success && !!response?.shouldPrompt,
        enhancedShouldPrompt:
          !!response?.success && !!response?.enhancedShouldPrompt,
        apiKeyCleanupPatterns:
          response?.success && response.apiKeyCleanupPatterns
            ? response.apiKeyCleanupPatterns
            : config.apiKeyCleanupPatterns,
      }
    } catch (error) {
      logger.warn("Failed to read ApiCheck shouldPrompt state", error)
      return {
        shouldPrompt: false,
        enhancedShouldPrompt: false,
        apiKeyCleanupPatterns: config.apiKeyCleanupPatterns,
      }
    }
  }

  const scanForApiCheckCredentials = async (
    sourceText: string,
    options?: {
      pageUrl?: string
      shouldPrompt?: boolean
      enhancedShouldPrompt?: boolean
      apiKeyCleanupPatterns?: string[]
    },
  ) => {
    const text = (sourceText ?? "").trim()
    if (!text) return

    const pageUrl = options?.pageUrl || window.location.href
    if (!isHttpUrl(pageUrl)) return

    const now = Date.now()
    if (toastInFlight) return
    if (now - lastPromptAt < AUTO_DETECT_COOLDOWN_MS) return

    const apiKeyCleanupPatterns =
      options?.apiKeyCleanupPatterns ?? config.apiKeyCleanupPatterns

    const extracted = extractApiCheckCredentialsFromText(text, {
      apiKeyCleanupPatterns,
    })
    if (!extracted.baseUrl || !extracted.apiKey) return
    if (
      extracted.summary.usesEnhancedResult &&
      !extracted.summary.enhancedAutoPromptEligible
    ) {
      return
    }

    toastInFlight = true

    try {
      const promptState =
        typeof options?.shouldPrompt === "boolean"
          ? {
              shouldPrompt: options.shouldPrompt,
              enhancedShouldPrompt: !!options.enhancedShouldPrompt,
              apiKeyCleanupPatterns,
            }
          : await requestShouldPrompt(pageUrl)

      const canPrompt = extracted.summary.usesEnhancedResult
        ? promptState.enhancedShouldPrompt
        : promptState.shouldPrompt

      if (!canPrompt) {
        return
      }

      lastPromptAt = Date.now()
      const confirmed = await showApiCheckConfirmToast({
        usesEnhancedResult: extracted.summary.usesEnhancedResult,
      })
      if (!confirmed) {
        return
      }

      await openModal({
        sourceText: text,
        pageUrl,
        trigger: "autoDetect",
        apiKeyCleanupPatterns,
        extraction: {
          candidates: extracted.candidates,
          summary: extracted.summary,
        },
      })
    } catch (error) {
      logger.warn("Auto-detect flow failed", error)
    } finally {
      toastInFlight = false
    }
  }

  const scheduleApiCheckScan = async (
    sourceText: string,
    options?: {
      pageUrl?: string
      shouldPrompt?: boolean
      enhancedShouldPrompt?: boolean
      apiKeyCleanupPatterns?: string[]
    },
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
      if (!isHttpUrl(pageUrl)) return

      const selectionText = getSelectedText()
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
        const promptState = await requestShouldPrompt(pageUrl)
        if (!promptState.shouldPrompt && !promptState.enhancedShouldPrompt) {
          return
        }

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
              shouldPrompt: promptState.shouldPrompt,
              enhancedShouldPrompt: promptState.enhancedShouldPrompt,
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
    if (!isHttpUrl(pageUrl)) return

    const sourceText = getClipboardEventText(event)

    if (sourceText) {
      void scheduleApiCheckScan(sourceText, { pageUrl })
    }
  }

  const cleanupSelectionEndDetection = registerSelectionEndTextDetection(
    (sourceText) => {
      void scheduleApiCheckScan(sourceText, { pageUrl: window.location.href })
    },
  )

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
    cleanupSelectionEndDetection()
  }
}

/**
 * Ensure the Shadow DOM UI root is mounted, then open the centered modal.
 */
async function openModal(params: {
  sourceText: string
  pageUrl: string
  trigger: "contextMenu" | "autoDetect"
  apiKeyCleanupPatterns?: string[]
  extraction?: ApiCheckOpenModalDetail["extraction"]
}) {
  await ensureRedemptionToastUi()
  await waitForApiCheckModalHostReady()
  dispatchOpenApiCheckModal(params)
}
