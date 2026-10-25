import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  TURNSTILE_AUTO_ASSIST_MS,
  TURNSTILE_MANUAL_WAIT_MS,
  TURNSTILE_PAGE_API_POLL_MS,
} from "~/constants/turnstile"
import {
  triggerCheckinPageAction,
  waitForCheckinPageActionTarget,
  waitForTurnstileToken,
  type TurnstileUserAssist,
} from "~/entrypoints/content/messageHandlers/utils/turnstileGuard"
import {
  capturePageVerificationWidgets,
  waitForPageVerification,
} from "~/services/checkin/pageVerification"
import type {
  CheckinPageActionTriggerResult,
  TurnstilePreTrigger,
  TurnstileTokenWaitResult,
} from "~/types/turnstile"
import { TURNSTILE_PRE_TRIGGER_KINDS } from "~/types/turnstile"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"
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
 * Builds the in-page assist hooks for a Turnstile wait.
 * The page API read stays in the background so only an owned temp tab is probed.
 */
function createTurnstileUserAssist(requestId?: string): TurnstileUserAssist {
  return {
    autoAttemptMs: TURNSTILE_AUTO_ASSIST_MS,
    manualTimeoutMs: TURNSTILE_MANUAL_WAIT_MS,
    pageTokenIntervalMs: TURNSTILE_PAGE_API_POLL_MS,
    requestAssist: async () => {
      let presented = false
      try {
        const response = await sendRuntimeMessage<{ presented?: boolean }>({
          action: RuntimeActionIds.TurnstileRequestUserAssist,
          requestId,
        })
        presented = response?.presented === true
      } catch {
        presented = false
      }
      if (!presented) return false
      // Loaded lazily so content-script UI setup is not pulled into node tests.
      const { showTurnstileManualAssistToast } = await import(
        "~/entrypoints/content/shieldBypassAssist/utils/shieldBypassToasts"
      )
      await showTurnstileManualAssistToast()
      return true
    },
    readPageToken: async ({ allowExecute }) => {
      try {
        const response = await sendRuntimeMessage<{
          success?: boolean
          token?: unknown
        }>({
          action: RuntimeActionIds.TurnstileReadPageApi,
          allowExecute,
        })
        if (!response?.success || typeof response.token !== "string")
          return null
        const token = response.token.trim()
        return token || null
      } catch {
        return null
      }
    },
  }
}

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
        userAssist: createTurnstileUserAssist(request.requestId),
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
 * Clicks the page action and observes any verification it opens. Server-side
 * status readback remains the caller's responsibility.
 */
export function handleTriggerCheckinPageAction(
  request: TriggerCheckinPageActionRequest,
  sendResponse: (res: TriggerCheckinPageActionResponse) => void,
) {
  const perform = async () => {
    try {
      if (request.trigger?.kind === TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector) {
        await waitForCheckinPageActionTarget(request.trigger)
      }
      const existingWidgets = capturePageVerificationWidgets()
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

      const verification = result.clicked
        ? await waitForPageVerification({
            requestId: request.requestId,
            existingWidgets,
            requestAssist: createTurnstileUserAssist(request.requestId)
              .requestAssist,
          })
        : undefined
      sendResponse({
        success: true,
        ...result,
        ...(verification ? { verification } : {}),
      })
    } catch (error) {
      logger.warn("Check-in page action trigger failed", {
        requestId: request.requestId ?? null,
        error: getErrorMessage(error),
      })
      sendResponse({ success: false, error: getErrorMessage(error) })
    }
  }
  void perform()

  return true
}
