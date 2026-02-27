import { waitForTurnstileToken } from "~/entrypoints/content/messageHandlers/utils/turnstileGuard"
import type {
  TurnstilePreTrigger,
  TurnstileTokenWaitResult,
} from "~/types/turnstile"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

type WaitForTurnstileTokenRequest = {
  requestId?: string
  timeoutMs?: number
  preTrigger?: TurnstilePreTrigger
}

type WaitForTurnstileTokenResponse =
  | ({ success: true } & TurnstileTokenWaitResult)
  | { success: false; error: string }

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
