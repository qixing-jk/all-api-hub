import type { NativeCheckInPageProbe } from "~/services/checkin/discovery/nativePageDiscovery"
import {
  inspectCheckinPage,
  triggerCheckinPageAction,
  waitForCheckinPageActionTarget,
} from "~/services/checkin/pageAction"
import {
  capturePageVerificationWidgets,
  waitForPageVerification,
} from "~/services/checkin/pageVerification"
import {
  TURNSTILE_PRE_TRIGGER_KINDS,
  type CheckinPageActionTriggerResult,
  type TurnstilePreTrigger,
} from "~/types/turnstile"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { createTurnstileUserAssist } from "../utils/turnstileUserAssist"

const HYDRATION_WAIT_MS = 1_500
const HYDRATION_POLL_INTERVAL_MS = 100

const logger = createLogger("CheckinPageHandler")

interface TriggerCheckinPageActionRequest {
  requestId?: string
  trigger?: TurnstilePreTrigger
  prepareOnly?: boolean
}

interface TriggerCheckinPageActionSuccessResponse extends CheckinPageActionTriggerResult {
  success: true
}

interface TriggerCheckinPageActionErrorResponse {
  success: false
  error: string
}

interface TriggerCheckinPageActionPreparedResponse {
  success: true
  clicked: false
}

type TriggerCheckinPageActionResponse =
  | TriggerCheckinPageActionSuccessResponse
  | TriggerCheckinPageActionErrorResponse
  | TriggerCheckinPageActionPreparedResponse

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
      if (request.prepareOnly === true) {
        sendResponse({ success: true, clicked: false })
        return
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

/** Dedicated read-only action: older content scripts must not interpret it as a click. */
export function handleInspectCheckinPage(
  request: {
    trigger?: TurnstilePreTrigger
    acceptVerificationWidget?: boolean
  },
  sendResponse: (response: NativeCheckInPageProbe) => void,
) {
  void (async () => {
    try {
      if (request.trigger?.kind === TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector)
        await waitForCheckinPageActionTarget(request.trigger)
      const observe = () =>
        inspectCheckinPage(
          request.trigger ?? {
            kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton,
          },
          request.acceptVerificationWidget === true,
        )
      // Document readiness precedes SPA hydration. Give the default action a
      // short bounded chance to render before considering alternative pages.
      const deadline = Date.now() + HYDRATION_WAIT_MS
      let probe = observe()
      while (
        !probe.hasTarget &&
        !probe.hasAmbiguousTarget &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(HYDRATION_POLL_INTERVAL_MS, deadline - Date.now()),
          ),
        )
        probe = observe()
      }
      sendResponse(probe)
    } catch {
      sendResponse({ success: false, hasTarget: false, candidates: [] })
    }
  })()
  return true
}
