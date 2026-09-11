import { afterEach, describe, expect, it, vi } from "vitest"

import { recordGatewayGuidanceCompletion } from "~/features/UnifiedApiGuidance/recordGatewayGuidanceCompletion"
import {
  createEmptyFeatureGuidanceState,
  featureGuidanceState,
} from "~/services/featureGuidance/featureGuidanceState"

describe("recordGatewayGuidanceCompletion", () => {
  afterEach(() => vi.restoreAllMocks())

  it("persists completion once and preserves existing history on later observations", async () => {
    const state = createEmptyFeatureGuidanceState()
    vi.spyOn(featureGuidanceState, "getStateStrict").mockResolvedValue(state)
    const mark = vi
      .spyOn(featureGuidanceState, "markGatewayGuidanceOnboardingCompleted")
      .mockImplementation(async () => {
        state.gatewayGuidance.onboardingCompletedAt = 123
        return state
      })
    recordGatewayGuidanceCompletion()
    await vi.waitFor(() => expect(mark).toHaveBeenCalledOnce())
    recordGatewayGuidanceCompletion()
    await Promise.resolve()
    expect(mark).toHaveBeenCalledOnce()
    expect(state.gatewayGuidance.onboardingCompletedAt).toBe(123)
  })

  it("does not overwrite history when storage cannot be read", async () => {
    vi.spyOn(featureGuidanceState, "getStateStrict").mockRejectedValue(
      new Error("unavailable"),
    )
    const mark = vi.spyOn(
      featureGuidanceState,
      "markGatewayGuidanceOnboardingCompleted",
    )
    recordGatewayGuidanceCompletion()
    await Promise.resolve()
    await Promise.resolve()
    expect(mark).not.toHaveBeenCalled()
  })
})
