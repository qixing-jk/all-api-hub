import { describe, expect, it } from "vitest"

import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import {
  PROTECTION_BYPASS_DECISION_RESULTS,
  PROTECTION_BYPASS_DENIED_REASONS,
} from "~/services/protectionBypass/contracts"
import { getProtectionBypassDecisionErrorCode } from "~/services/protectionBypass/decisionErrorCode"

describe("protection bypass decision error codes", () => {
  it.each([
    "missing_execution",
    "invalid_execution",
    "task_not_permitted",
  ] as const)("maps %s to the stable invalid-context error", (reason) => {
    expect(
      getProtectionBypassDecisionErrorCode({
        kind: PROTECTION_BYPASS_DECISION_RESULTS.Denied,
        reason,
      } as never),
    ).toBe(API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID)
  })

  it("exports the v2 execution denial vocabulary", () => {
    expect(PROTECTION_BYPASS_DENIED_REASONS).toMatchObject({
      MissingExecution: "missing_execution",
      InvalidExecution: "invalid_execution",
      TaskNotPermitted: "task_not_permitted",
    })
  })
})
