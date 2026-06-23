import {
  triggerCheckinPageAction,
  waitForTurnstileToken,
} from "~/entrypoints/content/messageHandlers/utils/turnstileGuard"
import type {
  CheckinPageActionTriggerResult,
  TurnstilePreTrigger,
  TurnstileTokenWaitResult,
} from "~/types/turnstile"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

interface WaitForTurnstileTokenRequest {
  requestId?: string
  timeoutMs?: number
  preTrigger?: TurnstilePreTrigger
}

interface WaitForTurnstileTokenSuccessResponse
  extends TurnstileTokenWaitResult {
  success: true
}

interface WaitForTurnstileTokenErrorResponse {
  success: false
  error: string
}

type WaitForTurnstileTokenResponse =
  | WaitForTurnstileTokenSuccessResponse
  | WaitForTurnstileTokenErrorResponse

interface TriggerCheckinPageActionRequest {
  requestId?: string
  trigger?: TurnstilePreTrigger
}

interface TriggerCheckinPageActionSuccessResponse
  extends CheckinPageActionTriggerResult {
  success: true
}

interface TriggerCheckinPageActionErrorResponse {
  success: false
  error: string
}

type TriggerCheckinPageActionResponse =
  | TriggerCheckinPageActionSuccessResponse
  | TriggerCheckinPageActionErrorResponse

/**
 * Unified logger scoped to Turnstile token waits in the content script.
 */
const logger = createLogger("TurnstileGuardHandler")

/**
 * Handle Turnstile token wait requests.
 *
 * This handler is designed for temporary contexts: it performs a bounded wait
 * for a `cf-turnstile-response` token without attempting to solve Turnstile.
 */
export function handleWaitForTurnstileToken(
  request: WaitForTurnstileTokenRequest,
  sendResponse: (res: WaitForTurnstileTokenResponse) => void,
) {
  const perform = async () => {
    try {
      const result = await waitForTurnstileToken({
        requestId: request.requestId,
        timeoutMs: request.timeoutMs,
        preTrigger: request.preTrigger,
      })

      logger.debug("Turnstile token wait completed", {
        requestId: request.requestId ?? null,
        status: result.status,
        hasTurnstile: result.detection.hasTurnstile,
        score: result.detection.score,
        reasons: result.detection.reasons,
      })

      sendResponse({ success: true, ...result })
    } catch (error) {
      logger.warn("Turnstile token wait failed", {
        requestId: request.requestId ?? null,
        error: getErrorMessage(error),
      })
      sendResponse({ success: false, error: getErrorMessage(error) })
    }
  }

  void perform()
  return true
}

/**
 * Handle native page check-in action trigger requests.
 *
 * This only clicks the page action. It deliberately does not decide whether the
 * account is checked in.
 */
export function handleTriggerCheckinPageAction(
  request: TriggerCheckinPageActionRequest,
  sendResponse: (res: TriggerCheckinPageActionResponse) => void,
) {
  try {
    const result = triggerCheckinPageAction({
      requestId: request.requestId,
      trigger: request.trigger,
    })

    logger.debug("Check-in page action trigger completed", {
      requestId: request.requestId ?? null,
      status: result.status,
      reason: result.reason,
      clicked: result.clicked,
    })

    sendResponse({ success: true, ...result })
  } catch (error) {
    logger.warn("Check-in page action trigger failed", {
      requestId: request.requestId ?? null,
      error: getErrorMessage(error),
    })
    sendResponse({ success: false, error: getErrorMessage(error) })
  }

  return true
}
