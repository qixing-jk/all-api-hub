import { t } from "i18next"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  CONTENT_UI_HOST_TAG,
  isEventFromAllApiHubContentUi,
} from "~/entrypoints/content/shared/contentUi"
import { isLikelyCopyActionTarget } from "~/entrypoints/content/shared/copyActionTarget"
import type {
  RedemptionAssistShouldPromptRequest,
  RedemptionAssistShouldPromptResponse,
} from "~/services/redemption/redemptionAssist"
import {
  checkPermissionViaMessage,
  sendRuntimeMessage,
} from "~/utils/browserApi"
import { createLogger } from "~/utils/logger"
import { extractRedemptionCodesFromText } from "~/utils/redemptionAssist"

import {
  dismissToast,
  showAccountSelectToast,
  showRedeemBatchResultToast,
  showRedeemLoadingToast,
  showRedeemResultToast,
  showRedemptionPromptToast,
} from "./utils/redemptionToasts"

export const REDEMPTION_TOAST_HOST_TAG = CONTENT_UI_HOST_TAG

/**
 * Unified logger scoped to redemption assist content-script flows.
 */
const logger = createLogger("RedemptionAssistContent")

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
      if (isEventFromAllApiHubContentUi(event.target)) {
        return
      }

      const now = Date.now()
      if (now - lastClickScan < CLICK_SCAN_INTERVAL_MS) return
      lastClickScan = now

      // Try to get selected text first
      const selection = window.getSelection()
      let text = selection?.toString().trim() || ""

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
    if (request?.action !== RuntimeActionIds.RedemptionAssistContextMenuTrigger)
      return

    const selectionText = (request.selectionText ?? "").trim()
    const pageUrl = request.pageUrl || window.location.href

    if (!selectionText) {
      logger.warn("Context menu trigger missing selection")
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
    logger.error("Context menu flow failed", error)
  }
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
 * Requests prompt-eligible codes from the background runtime handler.
 */
async function requestPromptableCodes(url: string, codes: string[]) {
  if (codes.length === 0) return []

  const response = (await sendRuntimeMessage({
    action: RuntimeActionIds.RedemptionAssistShouldPrompt,
    url,
    codes,
  } as RedemptionAssistShouldPromptRequest)) as RedemptionAssistShouldPromptResponse

  if (!response?.success) {
    return []
  }

  return response.promptableCodes ?? []
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

    logger.debug("Detected redemption codes", {
      url,
      codeCount: codes.length,
      maskedCodes: codes.map(maskCode),
    })
    const promptableCodes = await requestPromptableCodes(url, codes)
    if (promptableCodes.length === 0) {
      return
    }

    const confirmMessage =
      promptableCodes.length > 1
        ? t("redemptionAssist:messages.promptConfirmBatch", {
            count: promptableCodes.length,
          })
        : t("redemptionAssist:messages.promptConfirm", {
            code: maskCode(promptableCodes[0] || ""),
          })

    const prompt = await showRedemptionPromptToast(
      confirmMessage,
      promptableCodes.map((code) => ({ code, preview: maskCode(code) })),
    )
    if (prompt.action !== "auto") return
    if (prompt.selectedCodes.length === 0) return

    const { selectedCodes } = prompt

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
    logger.error("Redemption scan failed", error)
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
    action: RuntimeActionIds.RedemptionAssistAutoRedeem,
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
      action: RuntimeActionIds.RedemptionAssistAutoRedeemByUrl,
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
