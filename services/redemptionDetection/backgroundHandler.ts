/**
 * Background Handler for Redemption Assist
 * Orchestrates code detection, account matching, and redemption flow
 */

import { t } from "i18next"

import {
  accountStorage,
  getAccountsByCheckInUrl
} from "~/services/accountStorage"
import { redeemCodeForAccount } from "~/services/redeemService"
import { redemptionDedupCache } from "~/services/redemptionDetection/dedupCache"
import { userPreferences } from "~/services/userPreferences"
import type {
  RedemptionAccountCandidate,
  RedemptionCodeDetectedMessage,
  RedemptionDecisionMessage,
  RedemptionPromptMessage,
  RedemptionResultMessage,
  RedemptionSuppressMessage
} from "~/types/messages"

/**
 * Handle redemption-related messages from content scripts
 */
export async function handleRedemptionMessage(
  request: any,
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    switch (request.type) {
      case "REDEMPTION_CHECK_ENABLED":
        await handleCheckEnabled(sendResponse)
        break

      case "REDEMPTION_CODE_DETECTED":
        await handleCodeDetected(request, sendResponse)
        break

      case "REDEMPTION_DECISION":
        await handleDecision(request as RedemptionDecisionMessage, sendResponse)
        break

      case "REDEMPTION_SUPPRESS":
        await handleSuppress(request, sendResponse)
        break

      default:
        sendResponse({ success: false, error: "Unknown message type" })
    }
  } catch (error) {
    console.error("[RedemptionBackground] Error handling message:", error)
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
}

/**
 * Check if redemption assist is enabled
 */
async function handleCheckEnabled(
  sendResponse: (response: any) => void
): Promise<void> {
  const prefs = await userPreferences.getPreferences()
  const enabled = prefs.redemptionAssist?.enabled ?? true

  sendResponse({ success: true, enabled })
}

/**
 * Handle suppress message from content script
 */
async function handleSuppress(
  request: RedemptionSuppressMessage,
  sendResponse: (response: any) => void
): Promise<void> {
  const { url, code } = request
  redemptionDedupCache.markSuppressed(url, code)
  console.log("[RedemptionBackground] Code suppressed:", { url, code })
  sendResponse({ success: true })
}

/**
 * Handle code detection from content script
 */
async function handleCodeDetected(
  request: RedemptionCodeDetectedMessage,
  sendResponse: (response: any) => void
): Promise<void> {
  const { url, code } = request

  console.log("[RedemptionBackground] Code detected:", { url, code })

  // Check if feature is enabled
  const prefs = await userPreferences.getPreferences()
  if (!prefs.redemptionAssist?.enabled) {
    console.log("[RedemptionBackground] Feature disabled, ignoring")
    sendResponse({ success: true, shouldPrompt: false, reason: "disabled" })
    return
  }

  // Check dedup cache
  if (redemptionDedupCache.shouldSkip(url, code)) {
    console.log("[RedemptionBackground] Code already seen, skipping")
    sendResponse({ success: true, shouldPrompt: false, reason: "duplicate" })
    return
  }

  // Check cooldown
  if (redemptionDedupCache.isInCooldown()) {
    console.log("[RedemptionBackground] In cooldown, skipping")
    sendResponse({ success: true, shouldPrompt: false, reason: "cooldown" })
    return
  }

  // Find matching accounts
  const matchingAccounts = await getAccountsByCheckInUrl(url)

  if (matchingAccounts.length === 0) {
    console.log("[RedemptionBackground] No matching accounts")
    sendResponse({ success: true, shouldPrompt: false, reason: "no_accounts" })
    return
  }

  // Build account candidates
  const accountCandidates: RedemptionAccountCandidate[] = matchingAccounts.map(
    (account: any) => ({
      accountId: account.id,
      name: account.site_name,
      siteName: account.site_name,
      baseUrl: account.site_url
    })
  )

  // Mark as seen
  redemptionDedupCache.markSeen(url, code)

  // Generate prompt ID
  const promptId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // Store prompt for later decision handling
  pendingPrompts.set(promptId, { url, code, accountCandidates })

  // Send prompt to content script
  const promptMessage: RedemptionPromptMessage = {
    type: "REDEMPTION_PROMPT",
    payload: {
      promptId,
      code,
      accountCandidates
    }
  }

  sendResponse({
    success: true,
    shouldPrompt: true,
    prompt: promptMessage.payload
  })
}

/**
 * Handle user decision from content script
 */
async function handleDecision(
  message: RedemptionDecisionMessage,
  sendResponse: (response: any) => void
): Promise<void> {
  const { promptId, action, accountId } = message.payload

  console.log("[RedemptionBackground] Decision received:", {
    promptId,
    action,
    accountId
  })

  // Get pending prompt
  const prompt = pendingPrompts.get(promptId)
  if (!prompt) {
    console.error("[RedemptionBackground] Prompt not found:", promptId)
    sendResponse({ success: false, error: "Prompt not found" })
    return
  }

  const { code } = prompt

  // Handle cancel
  if (action === "cancel") {
    pendingPrompts.delete(promptId)
    sendResponse({ success: true })
    return
  }

  // Validate account ID
  if (!accountId) {
    console.error("[RedemptionBackground] No account ID provided")
    sendResponse({ success: false, error: "No account ID provided" })
    return
  }

  // Handle manual redeem
  if (action === "manual") {
    await handleManualRedeem(accountId, code, sendResponse)
    pendingPrompts.delete(promptId)
    return
  }

  // Handle auto redeem
  if (action === "auto") {
    await handleAutoRedeem(promptId, accountId, code, sendResponse)
    pendingPrompts.delete(promptId)
    return
  }

  sendResponse({ success: false, error: "Unknown action" })
}

/**
 * Handle manual redemption (open redeem page + copy code)
 */
async function handleManualRedeem(
  accountId: string,
  _code: string,
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    const account = await accountStorage.getAccountById(accountId)
    if (!account) {
      sendResponse({ success: false, error: "Account not found" })
      return
    }

    // Open redeem page
    const redeemUrl =
      account.checkIn?.customRedeemUrl || `${account.site_url}/topup/redemption`

    await browser.tabs.create({ url: redeemUrl, active: true })

    sendResponse({
      success: true,
      result: {
        status: "success",
        message: t("redemptionAssist:messages.redeemSuccess", {
          siteName: account.site_name
        })
      }
    })
  } catch (error) {
    console.error("[RedemptionBackground] Manual redeem error:", error)
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
}

/**
 * Handle auto redemption (call API)
 */
async function handleAutoRedeem(
  promptId: string,
  accountId: string,
  code: string,
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    console.log("[RedemptionBackground] Starting auto redeem:", {
      accountId,
      code
    })

    const result = await redeemCodeForAccount(accountId, code)

    console.log("[RedemptionBackground] Redeem result:", result)

    const resultMessage: RedemptionResultMessage = {
      type: "REDEMPTION_RESULT",
      payload: {
        promptId,
        result
      }
    }

    sendResponse({
      success: true,
      result: resultMessage.payload.result
    })
  } catch (error) {
    console.error("[RedemptionBackground] Auto redeem error:", error)

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error"

    sendResponse({
      success: true,
      result: {
        status: "error",
        message: t("redemptionAssist:errors.redeemFailed"),
        siteError: errorMessage
      }
    })
  }
}

/**
 * Store pending prompts for decision handling
 */
interface PendingPrompt {
  url: string
  code: string
  accountCandidates: RedemptionAccountCandidate[]
}

const pendingPrompts = new Map<string, PendingPrompt>()

/**
 * Initialize redemption assist background service
 */
export function initializeRedemptionAssist(): void {
  console.log("[RedemptionBackground] Initialized")
}

/**
 * Cleanup on extension unload
 */
export function cleanupRedemptionAssist(): void {
  pendingPrompts.clear()
  redemptionDedupCache.destroy()
  console.log("[RedemptionBackground] Cleaned up")
}
