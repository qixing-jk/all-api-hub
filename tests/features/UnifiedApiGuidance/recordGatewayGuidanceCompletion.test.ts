import { afterEach, describe, expect, it, vi } from "vitest"

import { recordGatewayGuidanceCompletion } from "~/features/UnifiedApiGuidance/recordGatewayGuidanceCompletion"
import {
  createEmptyFeatureGuidanceState,
  featureGuidanceState,
  type FeatureGuidanceState,
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
    await recordGatewayGuidanceCompletion()
    expect(mark).toHaveBeenCalledOnce()
    await recordGatewayGuidanceCompletion()
    expect(mark).toHaveBeenCalledOnce()
    expect(state.gatewayGuidance.onboardingCompletedAt).toBe(123)
  })

  it("coalesces concurrent observations through the completion write", async () => {
    const state = createEmptyFeatureGuidanceState()
    let resolveRead!: (state: FeatureGuidanceState) => void
    let resolveWrite!: (state: FeatureGuidanceState) => void
    const read = vi
      .spyOn(featureGuidanceState, "getStateStrict")
      .mockReturnValue(
        new Promise((resolve) => {
          resolveRead = resolve
        }),
      )
    const mark = vi
      .spyOn(featureGuidanceState, "markGatewayGuidanceOnboardingCompleted")
      .mockReturnValue(
        new Promise((resolve) => {
          resolveWrite = resolve
        }),
      )
    const first = recordGatewayGuidanceCompletion()
    const second = recordGatewayGuidanceCompletion()
    expect(read).toHaveBeenCalledOnce()
    resolveRead(state)
    await vi.waitFor(() => expect(mark).toHaveBeenCalledOnce())
    const duringWrite = recordGatewayGuidanceCompletion()
    expect(read).toHaveBeenCalledOnce()
    resolveWrite(state)
    await Promise.all([first, second, duringWrite])
    expect(mark).toHaveBeenCalledOnce()
  })

  it("allows a later observation to retry after a failed completion write", async () => {
    const state = createEmptyFeatureGuidanceState()
    vi.spyOn(featureGuidanceState, "getStateStrict").mockResolvedValue(state)
    const mark = vi
      .spyOn(featureGuidanceState, "markGatewayGuidanceOnboardingCompleted")
      .mockRejectedValueOnce(new Error("write unavailable"))
      .mockResolvedValueOnce(state)
    await recordGatewayGuidanceCompletion()
    await recordGatewayGuidanceCompletion()
    expect(mark).toHaveBeenCalledTimes(2)
  })

  it("does not overwrite history when storage cannot be read", async () => {
    vi.spyOn(featureGuidanceState, "getStateStrict").mockRejectedValue(
      new Error("unavailable"),
    )
    const mark = vi.spyOn(
      featureGuidanceState,
      "markGatewayGuidanceOnboardingCompleted",
    )
    await recordGatewayGuidanceCompletion()
    expect(mark).not.toHaveBeenCalled()
  })
})
