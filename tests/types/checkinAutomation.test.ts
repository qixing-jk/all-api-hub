import { describe, expect, it } from "vitest"

import {
  BROWSER_CHECK_IN_EXECUTION_REASONS,
  isBrowserCheckInExecutionResult,
} from "~/types/checkinAutomation"

const createResult = (patch: Record<string, unknown> = {}) => ({
  success: false,
  reason: BROWSER_CHECK_IN_EXECUTION_REASONS.Timeout,
  ...patch,
})

describe("browser check-in execution results", () => {
  it("accepts completion as the only proof of success", () => {
    expect(
      isBrowserCheckInExecutionResult(
        createResult({
          success: true,
          reason: BROWSER_CHECK_IN_EXECUTION_REASONS.Completed,
          actionTriggered: true,
          matchedCondition: "text",
          currentUrl: "https://checkin.example.invalid/console",
        }),
      ),
    ).toBe(true)
    expect(isBrowserCheckInExecutionResult(createResult())).toBe(true)
  })

  it("rejects a success that disagrees with the reason", () => {
    // `mapExecutionResult` reads `success` before `reason`, so a contradictory
    // payload would otherwise be reported as a successful check-in.
    expect(
      isBrowserCheckInExecutionResult(
        createResult({
          success: true,
          reason: BROWSER_CHECK_IN_EXECUTION_REASONS.Timeout,
        }),
      ),
    ).toBe(false)
    expect(
      isBrowserCheckInExecutionResult(
        createResult({
          success: true,
          reason: BROWSER_CHECK_IN_EXECUTION_REASONS.IdentityMismatch,
        }),
      ),
    ).toBe(false)
    expect(
      isBrowserCheckInExecutionResult(
        createResult({
          success: false,
          reason: BROWSER_CHECK_IN_EXECUTION_REASONS.Completed,
        }),
      ),
    ).toBe(false)
  })

  it("rejects unknown reasons and unbounded fields", () => {
    expect(
      isBrowserCheckInExecutionResult(createResult({ reason: "pending" })),
    ).toBe(false)
    expect(
      isBrowserCheckInExecutionResult(createResult({ success: "yes" })),
    ).toBe(false)
    expect(
      isBrowserCheckInExecutionResult(createResult({ actionTriggered: "yes" })),
    ).toBe(false)
    expect(
      isBrowserCheckInExecutionResult(
        createResult({ matchedCondition: "unknown" }),
      ),
    ).toBe(false)
  })
})
