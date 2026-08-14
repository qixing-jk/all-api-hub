import { describe, expect, it } from "vitest"

import { throwScenarioError } from "~~/e2e/utils/scenarioErrors"

describe("throwScenarioError", () => {
  it("preserves both the primary failure and a later cleanup failure", () => {
    const primaryError = new Error("request observation timed out")
    const cleanupError = new Error("temporary key cleanup failed")

    expect(() =>
      throwScenarioError({
        primaryError,
        cleanupError,
        message: "Managed-site token channel status scenario failed",
      }),
    ).toThrow(
      expect.objectContaining({
        errors: [primaryError, cleanupError],
        message:
          "Managed-site token channel status scenario failed: primary=request observation timed out; cleanup=temporary key cleanup failed",
      }),
    )
  })
})
