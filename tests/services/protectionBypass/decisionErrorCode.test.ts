import { describe, expect, it } from "vitest"

import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import {
  PROTECTION_BYPASS_DECISION_RESULTS,
  PROTECTION_BYPASS_DENIED_REASONS,
} from "~/services/protectionBypass/contracts"
import { getProtectionBypassDecisionErrorCode } from "~/services/protectionBypass/decisionErrorCode"

describe("protection bypass decision error codes", () => {
  const invalidContextDecisions = [
    {
      kind: PROTECTION_BYPASS_DECISION_RESULTS.Denied,
      reason: PROTECTION_BYPASS_DENIED_REASONS.MissingExecution,
    },
    {
      kind: PROTECTION_BYPASS_DECISION_RESULTS.Denied,
      reason: PROTECTION_BYPASS_DENIED_REASONS.InvalidExecution,
    },
    {
      kind: PROTECTION_BYPASS_DECISION_RESULTS.Denied,
      reason: PROTECTION_BYPASS_DENIED_REASONS.TaskNotPermitted,
      feature: "account_refresh",
      operation: "native_page_action",
      cause: "verification_required",
      surface: "options",
    },
  ] as const satisfies readonly Parameters<
    typeof getProtectionBypassDecisionErrorCode
  >[0][]

  it.each(invalidContextDecisions)(
    "maps $reason to the stable invalid-context error",
    (decision) => {
      expect(getProtectionBypassDecisionErrorCode(decision)).toBe(
        API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
      )
    },
  )

  it("exports the v2 execution denial vocabulary", () => {
    expect(PROTECTION_BYPASS_DENIED_REASONS).toMatchObject({
      MissingExecution: "missing_execution",
      InvalidExecution: "invalid_execution",
      TaskNotPermitted: "task_not_permitted",
    })
  })
})
