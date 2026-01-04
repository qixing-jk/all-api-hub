import { t } from "i18next"

import {
  checkPermissionViaMessage,
  sendRuntimeMessage,
} from "~/utils/browserApi"
import { extractRedemptionCodesFromText } from "~/utils/redemptionAssist"

import {
  dismissToast,
  showAccountSelectToast,
  showRedeemBatchResultToast,
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
        // check clipboardRead permission first to avoid prompting needs to access clipboard in any website
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
            console.warn(
              "[RedemptionAssist][Content] Clipboard read failed:",
              error,
            )
          }
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
    const trimmedSelection = (selectionText ?? "").trim()
    if (!trimmedSelection) return

    const extracted = extractRedemptionCodesFromText(trimmedSelection, {
      relaxedCharset: true,
    })
    const codes = extracted.length > 0 ? extracted : [trimmedSelection]

    const selectedCodes =
      codes.length > 1
        ? await (async () => {
            const promptMessage = t(
              "redemptionAssist:messages.promptConfirmBatch",
              {
                count: codes.length,
              },
            )
            const prompt = await showRedemptionPromptToast(
              promptMessage,
              codes.map((code) => ({ code, preview: maskCode(code) })),
            )
            if (prompt.action !== "auto") return []
            return prompt.selectedCodes
          })()
        : codes

    if (selectedCodes.length === 0) return

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

      const { results, retry } = await redeemCodesSequential({
        url: pageUrl,
        codes: selectedCodes,
        dismissOuterLoading: dismissLoadingToast,
      })

      if (results.length === 1 && results[0]?.success) {
        await showRedeemResultToast(true, results[0].message)
        return
      }

      await showRedeemBatchResultToast(results, retry)
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

    const codes = extractRedemptionCodesFromText(text, {
      relaxedCharset: true,
    })
    if (codes.length === 0) return

    const url = window.location.href

    // Skip non-http(s) pages to avoid unnecessary background traffic.
    // (e.g. chrome://, about:, file://, extension pages)
    if (!/^https?:/i.test(url)) {
      return
    }

    console.log("[RedemptionAssist][Content] Detected codes:", codes, url)
    const shouldResp: any = await sendRuntimeMessage({
      action: "redemptionAssist:shouldPrompt",
      url,
      code: codes[0],
    })

    if (!shouldResp?.success || !shouldResp.shouldPrompt) {
      return
    }

    const confirmMessage =
      codes.length > 1
        ? t("redemptionAssist:messages.promptConfirmBatch", {
            count: codes.length,
          })
        : t("redemptionAssist:messages.promptConfirm", {
            code: maskCode(codes[0] || ""),
          })

    const prompt = await showRedemptionPromptToast(
      confirmMessage,
      codes.map((code) => ({ code, preview: maskCode(code) })),
    )
    if (prompt.action !== "auto") return
    if (prompt.selectedCodes.length === 0) return

    const selectedCodes = prompt.selectedCodes

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

      const { results, retry } = await redeemCodesSequential({
        url,
        codes: selectedCodes,
        dismissOuterLoading: dismissLoadingToast,
      })

      if (results.length === 1 && results[0]?.success) {
        await showRedeemResultToast(true, results[0].message)
        return
      }

      await showRedeemBatchResultToast(results, retry)
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
 * Redeems a code for a specific account, via background runtime messaging.
 * @param accountId Selected account id.
 * @param code Redemption code.
 * @returns Redeem result payload from background.
 */
async function redeemForAccount(accountId: string, code: string) {
  const manualResp: any = await sendRuntimeMessage({
    action: "redemptionAssist:autoRedeem",
    accountId,
    code,
  })
  return manualResp?.data
}

type RedeemBatchItem = {
  code: string
  preview: string
  success: boolean
  message: string
}

/**
 * Redeems multiple codes sequentially (no concurrent requests) and returns the
 * result list plus a retry handler for a single code.
 * @param params Sequential redeem parameters.
 * @param params.url Page URL to infer account candidates.
 * @param params.codes Selected redemption codes to redeem.
 * @param params.dismissOuterLoading Dismiss outer loading toast before user prompts.
 * @returns Results list and per-code retry handler.
 */
async function redeemCodesSequential(params: {
  url: string
  codes: string[]
  dismissOuterLoading: () => void
}) {
  let forcedAccountId: string | null = null

  const redeemOne = async (code: string): Promise<RedeemBatchItem> => {
    if (forcedAccountId) {
      const manual = await redeemForAccount(forcedAccountId, code)
      const message =
        manual?.message || t("redemptionAssist:messages.redeemFailed")
      return {
        code,
        preview: maskCode(code),
        success: !!manual?.success,
        message,
      }
    }

    const redeemResp: any = await sendRuntimeMessage({
      action: "redemptionAssist:autoRedeemByUrl",
      url: params.url,
      code,
    })

    const result = redeemResp?.data

    if (result?.success) {
      return {
        code,
        preview: maskCode(code),
        success: true,
        message: result.message || "",
      }
    }

    if (result?.code === "MULTIPLE_ACCOUNTS" && result.candidates?.length) {
      params.dismissOuterLoading()
      const selected = await showAccountSelectToast(result.candidates, {
        title: t("redemptionAssist:accountSelect.titleMultiple"),
      })

      if (!selected) {
        return {
          code,
          preview: maskCode(code),
          success: false,
          message: t("redemptionAssist:messages.cancelled"),
        }
      }

      forcedAccountId = selected.id
      return redeemOne(code)
    }

    if (result?.code === "NO_ACCOUNTS" && result.allAccounts?.length) {
      params.dismissOuterLoading()
      const selected = await showAccountSelectToast(result.allAccounts, {
        title: t("redemptionAssist:accountSelect.titleFallback"),
      })

      if (!selected) {
        return {
          code,
          preview: maskCode(code),
          success: false,
          message: t("redemptionAssist:messages.cancelled"),
        }
      }

      forcedAccountId = selected.id
      return redeemOne(code)
    }

    const fallbackMessage = t("redemptionAssist:messages.redeemFailed")
    const msg = redeemResp?.error || result?.message || fallbackMessage
    return {
      code,
      preview: maskCode(code),
      success: false,
      message: msg,
    }
  }

  const results: RedeemBatchItem[] = []
  for (const code of params.codes) {
    results.push(await redeemOne(code))
  }

  return {
    results,
    retry: redeemOne,
  }
}
