import { t } from "i18next"

import { sendRuntimeMessage } from "~/utils/browserApi"
import { extractRedemptionCodesFromText } from "~/utils/redemptionAssist"

import {
  dismissToast,
  showAccountSelectToast,
  showRedeemLoadingToast,
  showRedeemResultToast,
  showRedemptionPromptToast,
} from "./utils/redemptionToasts"

export const REDEMPTION_TOAST_HOST_TAG = "all-api-hub-redemption-toast"

/**
 * Initializes redemption assist in content scripts (event listeners, toasts, etc.).
 */
export function setupRedemptionAssistContent() {
  setupRedemptionAssistDetection()
  registerContextMenuTriggerListener()
}

/**
 * Legacy clipboard read fallback using execCommand.
 * Note: this may not work in all browsers due to security restrictions.
 * @returns Clipboard text or empty string on failure.
 */
function readClipboardLegacy() {
  const textarea = document.createElement("textarea")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.focus()

  try {
    document.execCommand("paste")
    const text = textarea.value
    document.body.removeChild(textarea)
    return text
  } catch (err) {
    console.error("Failed to read clipboard:", err)
    document.body.removeChild(textarea)
    return ""
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
      if (isEventFromRedemptionAssistUI(event.target)) {
        return
      }

      const now = Date.now()
      if (now - lastClickScan < CLICK_SCAN_INTERVAL_MS) return
      lastClickScan = now

      const selection = window.getSelection()
      let text = selection?.toString().trim() || ""

      if (!text) {
        const target = event.target as HTMLElement | null
        if (target) {
          text = (target.innerText || target.textContent || "").slice(0, 50)
        }
      }

      if (!text && navigator.clipboard && navigator.clipboard.readText) {
        try {
          const clipText = await navigator.clipboard.readText()
          if (clipText) {
            text = clipText.trim()
          }
        } catch (error) {
          console.warn(
            "[RedemptionAssist][Content] Clipboard read failed:",
            error,
          )
          text = readClipboardLegacy()
        }
      }

      if (text) {
        void scheduleRedemptionScan(text)
      }
    }, 500)
  }

  const handleClipboardEvent = (event: ClipboardEvent) => {
    // Ignore clipboard events that originate from inside our own redemption assist UI
    if (isEventFromRedemptionAssistUI(event.target)) {
      return
    }
    const selection = window.getSelection()
    let text = selection?.toString().trim() || ""

    if (!text && event.clipboardData) {
      const clipText = event.clipboardData.getData("text")
      if (clipText) {
        text = clipText
      }
    }

    if (text) {
      void scheduleRedemptionScan(text)
    }
  }

  document.addEventListener("click", handleClick, true)
  document.addEventListener("copy", handleClipboardEvent, true)
  document.addEventListener("cut", handleClipboardEvent, true)
}

/**
 * Listens for right-click context menu triggers from the background page.
 * This entry point bypasses whitelist and code format filters: it sends the raw
 * selection to the background auto-redeem flow directly.
 */
function registerContextMenuTriggerListener() {
  browser.runtime.onMessage.addListener((request) => {
    if (request?.action !== "redemptionAssist:contextMenuTrigger") return

    const selectionText = (request.selectionText ?? "").trim()
    const pageUrl = request.pageUrl || window.location.href

    if (!selectionText) {
      console.warn(
        "[RedemptionAssist][Content] Context menu trigger missing selection",
      )
      return
    }

    void handleContextMenuRedemption(selectionText, pageUrl)
  })
}

/**
 * Context-menu-triggered redemption flow that skips whitelist/format gating.
 * @param selectionText Raw user-selected text passed from background menu click.
 * @param pageUrl Page URL where the selection was made.
 */
async function handleContextMenuRedemption(
  selectionText: string,
  pageUrl: string,
) {
  try {
    const code = selectionText.trim()
    if (!code) return

    const loadingMessage = t("redemptionAssist:messages.redeemLoading")
    let loadingToastId: string | undefined

    const dismissLoadingToast = () => {
      if (loadingToastId) {
        dismissToast(loadingToastId)
        loadingToastId = undefined
      }
    }

    try {
      loadingToastId = await showRedeemLoadingToast(loadingMessage)

      const redeemResp: any = await sendRuntimeMessage({
        action: "redemptionAssist:autoRedeemByUrl",
        url: pageUrl,
        code,
      })

      const result = redeemResp?.data

      if (result?.success) {
        if (result.message) {
          await showRedeemResultToast(true, result.message)
        }
        return
      }

      if (result?.code === "MULTIPLE_ACCOUNTS" && result.candidates?.length) {
        dismissLoadingToast()
        const selected = await showAccountSelectToast(result.candidates, {
          title: t("redemptionAssist:accountSelect.titleMultiple", {
            defaultValue: "检测到多个可用账号，请选择一个用于兑换",
          }),
        })

        if (!selected) {
          return
        }

        const manualResult = await performManualRedeem(
          selected.id,
          code,
          loadingMessage,
        )
        if (manualResult?.message) {
          await showRedeemResultToast(
            !!manualResult.success,
            manualResult.message,
          )
        }
        return
      }

      if (result?.code === "NO_ACCOUNTS" && result.allAccounts?.length) {
        dismissLoadingToast()
        const selected = await showAccountSelectToast(result.allAccounts, {
          title: t("redemptionAssist:accountSelect.titleFallback"),
        })

        if (!selected) {
          return
        }

        const manualResult = await performManualRedeem(
          selected.id,
          code,
          loadingMessage,
        )
        if (manualResult?.message) {
          await showRedeemResultToast(
            !!manualResult.success,
            manualResult.message,
          )
        }
        return
      }

      const fallbackMessage = t("redemptionAssist:messages.redeemFailed")
      const msg = redeemResp?.error || result?.message || fallbackMessage
      await showRedeemResultToast(false, msg)
    } finally {
      dismissLoadingToast()
    }
  } catch (error) {
    console.error(
      "[RedemptionAssist][Content] context menu flow failed:",
      error,
    )
  }
}

/**
 * Guards against handling events triggered from inside the redemption assist UI.
 * @param target Event origin node.
 * @returns True when the event originated from our toast host.
 */
function isEventFromRedemptionAssistUI(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  // Events from inside the Shadow DOM toaster are retargeted to the shadow host
  // <all-api-hub-redemption-toast data-wxt-shadow-root="">
  // so we only need to check whether the event target is inside this host element.
  return !!target.closest(REDEMPTION_TOAST_HOST_TAG)
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

/**
 * Attempts to auto-redeem a detected code by coordinating with the background page.
 * @param sourceText Text possibly containing redemption codes.
 */
async function scanForRedemptionCodes(sourceText?: string) {
  try {
    const text = (sourceText ?? "").trim()
    if (!text) return

    const code = extractRedemptionCodesFromText(text)[0]
    if (!code) return

    const url = window.location.href

    // Skip non-http(s) pages to avoid unnecessary background traffic.
    // (e.g. chrome://, about:, file://, extension pages)
    if (!/^https?:/i.test(url)) {
      return
    }

    console.log("[RedemptionAssist][Content] Detected code:", code, url)
    const shouldResp: any = await sendRuntimeMessage({
      action: "redemptionAssist:shouldPrompt",
      url,
      code,
    })

    if (!shouldResp?.success || !shouldResp.shouldPrompt) {
      return
    }

    console.log("[RedemptionAssist][Content] Prompting for code:", code)

    const codePreview = maskCode(code)
    const confirmMessage = t("redemptionAssist:messages.promptConfirm", {
      code: codePreview,
    })

    const action = await showRedemptionPromptToast(confirmMessage)
    if (action !== "auto") return

    const loadingMessage = t("redemptionAssist:messages.redeemLoading")
    let loadingToastId: string | undefined

    const dismissLoadingToast = () => {
      if (loadingToastId) {
        dismissToast(loadingToastId)
        loadingToastId = undefined
      }
    }

    try {
      loadingToastId = await showRedeemLoadingToast(loadingMessage)

      const redeemResp: any = await sendRuntimeMessage({
        action: "redemptionAssist:autoRedeemByUrl",
        url,
        code,
      })

      const result = redeemResp?.data

      if (result?.success) {
        if (result.message) {
          await showRedeemResultToast(true, result.message)
        }
        return
      }

      if (result?.code === "MULTIPLE_ACCOUNTS" && result.candidates?.length) {
        dismissLoadingToast()
        const selected = await showAccountSelectToast(result.candidates, {
          title: t("redemptionAssist:accountSelect.titleMultiple", {
            defaultValue: "检测到多个可用账号，请选择一个用于兑换",
          }),
        })

        if (!selected) {
          return
        }

        const manualResult = await performManualRedeem(
          selected.id,
          code,
          loadingMessage,
        )
        if (manualResult?.message) {
          await showRedeemResultToast(
            !!manualResult.success,
            manualResult.message,
          )
        }
        return
      }

      if (result?.code === "NO_ACCOUNTS" && result.allAccounts?.length) {
        dismissLoadingToast()
        const selected = await showAccountSelectToast(result.allAccounts, {
          title: t("redemptionAssist:accountSelect.titleFallback"),
        })

        if (!selected) {
          return
        }

        const manualResult = await performManualRedeem(
          selected.id,
          code,
          loadingMessage,
        )
        if (manualResult?.message) {
          await showRedeemResultToast(
            !!manualResult.success,
            manualResult.message,
          )
        }
        return
      }

      const fallbackMessage = t("redemptionAssist:messages.redeemFailed")
      const msg = redeemResp?.error || result?.message || fallbackMessage
      await showRedeemResultToast(false, msg)
    } finally {
      dismissLoadingToast()
    }
  } catch (error) {
    console.error("[RedemptionAssist][Content] scan failed:", error)
  }
}

/**
 * Masks sensitive redemption codes for UI prompts/logs.
 * @param code Raw redemption code.
 * @returns Masked code preview.
 */
function maskCode(code: string): string {
  const trimmed = code.trim()
  if (trimmed.length <= 8) return trimmed
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`
}

/**
 * Handles manual redemption flow when the user must choose an account.
 * @param accountId Selected account id.
 * @param code Redemption code.
 * @param loadingMessage Message displayed while awaiting backend result.
 * @returns Result payload from background message.
 */
async function performManualRedeem(
  accountId: string,
  code: string,
  loadingMessage: string,
) {
  const toastId = await showRedeemLoadingToast(loadingMessage)
  try {
    const manualResp: any = await sendRuntimeMessage({
      action: "redemptionAssist:autoRedeem",
      accountId,
      code,
    })
    return manualResp?.data
  } finally {
    dismissToast(toastId)
  }
}
