import { featureGuidanceState } from "~/services/featureGuidance/featureGuidanceState"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("GatewayGuidanceCompletion")
let pendingCompletion: Promise<void> | undefined

/** Records observed gateway setup without making guidance storage block the operation. */
export function recordGatewayGuidanceCompletion() {
  if (pendingCompletion) return pendingCompletion
  pendingCompletion = featureGuidanceState
    .getStateStrict()
    .then(async (state) => {
      if (!state.gatewayGuidance.onboardingCompletedAt) {
        await featureGuidanceState.markGatewayGuidanceOnboardingCompleted()
      }
    })
    .catch((error) => {
      logger.warn("Failed to record gateway guidance completion", error)
    })
    .finally(() => {
      pendingCompletion = undefined
    })
  return pendingCompletion
}
