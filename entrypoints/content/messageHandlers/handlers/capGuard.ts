import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"

import {
  clearCapAutoStartState,
  detectCapChallengePage,
  maybeAutoStartCapChallenge,
} from "../utils/capGuard"

/**
 * Unified logger scoped to CAP checkpoint detection in the content script.
 */
const logger = createLogger("CapGuardHandler")

/**
 * Handle CAP (cap.js) checkpoint guard check requests.
 *
 * The response is used by the background temp-context readiness gate to avoid
 * replaying requests before the CAP clearance cookie is set.
 */
export function handleCheckCapGuard(
  request: any,
  sendResponse: (res: any) => void,
) {
  try {
    const detection = detectCapChallengePage()
    const passed = !detection.isChallenge

    if (!passed) {
      const attempt = maybeAutoStartCapChallenge({
        requestId: request?.requestId,
        detection,
      })
      logger.debug("CAP guard auto-start attempt", {
        requestId: request?.requestId ?? null,
        attempted: attempt.attempted,
        method: attempt.method,
        reason: attempt.reason,
        detection: {
          score: detection.score,
          reasons: detection.reasons,
        },
      })
    } else {
      clearCapAutoStartState(request?.requestId)
    }

    sendResponse({ success: true, passed, detection })
  } catch (error) {
    logger.warn("CAP guard check failed", { error: getErrorMessage(error) })
    sendResponse({ success: false, error: getErrorMessage(error) })
  }

  return true
}
