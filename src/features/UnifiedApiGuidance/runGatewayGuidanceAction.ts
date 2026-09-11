import { featureGuidanceState } from "~/services/featureGuidance/featureGuidanceState"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("GatewayGuidanceStart")

/** Records explicit setup intent before navigating, without blocking useful work on storage failure. */
export async function runGatewayGuidanceAction(action: () => void) {
  try {
    await featureGuidanceState.markGatewayGuidanceOnboardingStarted()
  } catch (error) {
    logger.warn("Failed to record gateway guidance start", error)
  }
  action()
}
