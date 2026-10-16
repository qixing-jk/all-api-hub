import { useCallback } from "react"

import {
  useUiHandoffReceiver,
  type UiHandoffFailureReason,
  type UiHandoffReceiveResult,
} from "~/hooks/useUiHandoffReceiver"
import { createLogger } from "~/utils/core/logger"

import {
  sponsorWorkflowChannel,
  type SponsorWorkflowIntent,
} from "./sponsorWorkflowIntent"

const logger = createLogger("SponsorWorkflowReceiver")
/** Receives creation hints without clearing data refused by a busy destination. */
export function useSponsorWorkflowReceiver(
  enabled: boolean,
  onReceive: (intent: SponsorWorkflowIntent) => UiHandoffReceiveResult,
) {
  const onFailure = useCallback(
    (reason: UiHandoffFailureReason) =>
      logger.warn("Sponsor workflow could not be received", reason),
    [],
  )
  useUiHandoffReceiver({
    enabled,
    channel: sponsorWorkflowChannel,
    onReceive,
    onFailure,
  })
}
