import { afterEach, describe, expect, it, vi } from "vitest"

import { runGatewayGuidanceAction } from "~/features/UnifiedApiGuidance/runGatewayGuidanceAction"
import { featureGuidanceState } from "~/services/featureGuidance/featureGuidanceState"

describe("runGatewayGuidanceAction", () => {
  afterEach(() => vi.restoreAllMocks())

  it("still performs the requested setup action when progress cannot be saved", async () => {
    vi.spyOn(
      featureGuidanceState,
      "markGatewayGuidanceOnboardingStarted",
    ).mockRejectedValue(new Error("storage unavailable"))
    const action = vi.fn()
    await runGatewayGuidanceAction(action)
    expect(action).toHaveBeenCalledOnce()
  })
})
