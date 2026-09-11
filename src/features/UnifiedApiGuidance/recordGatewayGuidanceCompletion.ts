import { featureGuidanceState } from "~/services/featureGuidance/featureGuidanceState"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("GatewayGuidanceCompletion")

/** Records observed gateway setup without making guidance storage block the operation. */
export function recordGatewayGuidanceCompletion() {
  void featureGuidanceState
    .getStateStrict()
    .then((state) => {
      if (!state.gatewayGuidance.onboardingCompletedAt) {
        return featureGuidanceState.markGatewayGuidanceOnboardingCompleted()
      }
    })
    .catch((error) => {
      logger.warn("Failed to record gateway guidance completion", error)
    })
}
