import { RuntimeActionIds } from "~/constants/runtimeActions"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { createLogger } from "~/utils/logger"
import { extractApiCheckCredentialsFromText } from "~/utils/webAiApiCheck"

import { REDEMPTION_TOAST_HOST_TAG } from "../redemptionAssist"
import { ensureRedemptionToastUi } from "../redemptionAssist/uiRoot"
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

/**
 * Initializes Web AI API Check in content scripts (context menu listener + optional auto-detect).
 */
export function setupWebAiApiCheckContent() {
  registerContextMenuTriggerListener()
  setupAutoDetectFromCopyEvents()
}

/**
 * Guards against handling events triggered from inside our own Shadow DOM UI.
 * @param target Event origin node.
 */
function isEventFromAllApiHubContentUi(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return !!target.closest(REDEMPTION_TOAST_HOST_TAG)
}

/**
 * Listens for right-click context menu triggers from the background page.
 * This entry point always opens the modal even if extraction yields no credentials.
 */
function registerContextMenuTriggerListener() {
  browser.runtime.onMessage.addListener((request) => {
    if (request?.action !== RuntimeActionIds.ApiCheckContextMenuTrigger) return

    const sourceText = (request.selectionText ?? "").toString()
    const pageUrl = request.pageUrl || window.location.href

    void openModal({
      sourceText,
      pageUrl,
      trigger: "contextMenu",
    })
  })
}

/**
 * Auto-detect entrypoint: listen for copy events, extract credentials from the copied text,
 * gate via background preferences + whitelist, and show a confirmation toast.
 */
function setupAutoDetectFromCopyEvents() {
  let lastPromptAt = 0
  let toastInFlight = false

  const handleModalClosed = (event: Event) => {
    const custom = event as CustomEvent<ApiCheckModalClosedDetail>
    if (!custom.detail) return
    lastPromptAt = Date.now()
  }

  window.addEventListener(
    API_CHECK_MODAL_CLOSED_EVENT,
    handleModalClosed as any,
  )

  const handleCopy = (event: ClipboardEvent) => {
    // Ignore copy events that originate from inside our own UI.
    if (isEventFromAllApiHubContentUi(event.target)) return

    const pageUrl = window.location.href
    if (!/^https?:/i.test(pageUrl)) return

    const now = Date.now()
    if (toastInFlight) return
    if (now - lastPromptAt < AUTO_DETECT_COOLDOWN_MS) return

    const selectionText = window.getSelection()?.toString().trim() || ""
    const clipboardText = event.clipboardData?.getData("text") || ""
    const sourceText = selectionText || clipboardText

    if (!sourceText) return

    const extracted = extractApiCheckCredentialsFromText(sourceText)
    if (!extracted.baseUrl || !extracted.apiKey) return

    toastInFlight = true

    void (async () => {
      try {
        const shouldPromptResp: any = await sendRuntimeMessage({
          action: RuntimeActionIds.ApiCheckShouldPrompt,
          pageUrl,
        })

        if (!shouldPromptResp?.success || !shouldPromptResp?.shouldPrompt) {
          return
        }

        lastPromptAt = Date.now()
        const confirmed = await showApiCheckConfirmToast()
        if (!confirmed) {
          return
        }

        await openModal({
          sourceText,
          pageUrl,
          trigger: "autoDetect",
        })
      } catch (error) {
        logger.warn("Auto-detect flow failed", error)
      } finally {
        toastInFlight = false
      }
    })()
  }

  document.addEventListener("copy", handleCopy, true)
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
