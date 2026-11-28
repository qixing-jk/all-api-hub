import {
  RedemptionAssistMessageTypes,
  sendRedemptionAssistMessage,
} from "~/services/redemption/redemptionAssistMessaging"
import {
  extractRedemptionCodesFromText,
  getRedemptionCodeKind,
  REDEMPTION_CODE_KINDS,
} from "~/services/redemption/utils/redemptionCode"
import { createLogger } from "~/utils/core/logger"
import { isHttpUrl } from "~/utils/core/urlParsing"
import { t } from "~/utils/i18n/core"

import { REDEMPTION_PROMPT_ACTIONS } from "./contracts"
import { maskCode, runRedemptionBatch } from "./redemptionBatch"
import { showRedemptionPromptToast } from "./redemptionToasts"

const logger = createLogger("RedemptionAssistContent")

/**
 * Context-menu-triggered redemption flow that skips whitelist/format gating.
 * @param selectionText Raw user-selected text passed from background menu click.
 * @param pageUrl Page URL where the selection was made.
 */
export async function handleContextMenuRedemption(
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
    let confirmedPrompt = false

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
            if (prompt.action !== REDEMPTION_PROMPT_ACTIONS.Auto) return []
            confirmedPrompt = true
            return prompt.selectedCodes
          })()
        : codes

    if (selectedCodes.length === 0) return

    await runRedemptionBatch({
      url: pageUrl,
      codes: selectedCodes,
      confirmedPrompt,
    })
  } catch (error) {
    logger.error("Context menu flow failed", error)
  }
}

/**
 * Requests prompt-eligible codes from the background runtime handler.
 */
async function requestPromptableCodes(url: string, codes: string[]) {
  if (codes.length === 0) return []

  const response = await sendRedemptionAssistMessage(
    RedemptionAssistMessageTypes.ShouldPrompt,
    {
      url,
      codes,
    },
  )

  if (!response?.success) {
    return []
  }

  return response.promptableCodes ?? []
}

/**
 * Attempts to auto-redeem a detected code by coordinating with the background page.
 * @param sourceText Text possibly containing redemption codes.
 */
export async function scanForRedemptionCodes(sourceText?: string) {
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
    if (!isHttpUrl(url)) {
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
        : t(
            getRedemptionCodeKind(promptableCodes[0] || "") ===
              REDEMPTION_CODE_KINDS.PmplanResetCard
              ? "redemptionAssist:messages.pmplanPromptConfirm"
              : "redemptionAssist:messages.promptConfirm",
            {
              code: maskCode(promptableCodes[0] || ""),
            },
          )

    const prompt = await showRedemptionPromptToast(
      confirmMessage,
      promptableCodes.map((code) => ({ code, preview: maskCode(code) })),
    )
    if (prompt.action !== REDEMPTION_PROMPT_ACTIONS.Auto) return
    if (prompt.selectedCodes.length === 0) return

    const { selectedCodes } = prompt

    await runRedemptionBatch({
      url,
      codes: selectedCodes,
      confirmedPrompt: true,
    })
  } catch (error) {
    logger.error("Redemption scan failed", error)
  }
}
