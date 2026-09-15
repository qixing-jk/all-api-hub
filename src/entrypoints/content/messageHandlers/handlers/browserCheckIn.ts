import type {
  BrowserCheckInAction,
  BrowserCheckInIdentityCondition,
  BrowserCheckInStepResult,
  BrowserCheckInSuccessCondition,
} from "~/types/checkinAutomation"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { runBrowserCheckInStep } from "../utils/browserCheckIn"

interface BrowserCheckInRequest {
  requestId?: string
  browserAction: BrowserCheckInAction
  success: BrowserCheckInSuccessCondition
  identity?: BrowserCheckInIdentityCondition
  executeAction?: boolean
}

const logger = createLogger("BrowserCheckInHandler")

/** Handles one observation/click step; bounded polling is owned by background. */
export function handleRunBrowserCheckIn(
  request: BrowserCheckInRequest,
  sendResponse: (response: BrowserCheckInStepResult) => void,
) {
  try {
    const result = runBrowserCheckInStep({
      requestId: request.requestId,
      action: request.browserAction,
      success: request.success,
      identity: request.identity,
      executeAction: request.executeAction === true,
    })
    logger.debug("Browser check-in step completed", {
      requestId: request.requestId ?? null,
      success: result.success,
      reason: result.reason,
      actionTriggered: result.actionTriggered,
      matchedCondition: result.matchedCondition ?? null,
    })
    sendResponse(result)
  } catch (error) {
    logger.warn("Browser check-in step failed", {
      requestId: request.requestId ?? null,
      error: getErrorMessage(error),
    })
    sendResponse({
      success: false,
      reason: "invalid_request",
      actionTriggered: false,
    })
  }

  return true
}
