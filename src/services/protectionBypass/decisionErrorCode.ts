import {
  API_ERROR_CODES,
  type ApiErrorCode,
} from "~/services/apiTransport/errors"

import {
  PROTECTION_BYPASS_DECISION_RESULTS,
  PROTECTION_BYPASS_DENIED_REASONS,
  type ProtectionBypassDeniedReason,
} from "./contracts"
import type { ProtectionBypassPolicyDecision } from "./policy"

const DISABLED_REASONS = new Set<ProtectionBypassDeniedReason>([
  PROTECTION_BYPASS_DENIED_REASONS.AutomaticDisabled,
  PROTECTION_BYPASS_DENIED_REASONS.FeatureDisabled,
])

/** Maps controlled policy denials to the stable runtime error contract. */
export function getProtectionBypassDecisionErrorCode(
  decision: Extract<
    ProtectionBypassPolicyDecision,
    { kind: typeof PROTECTION_BYPASS_DECISION_RESULTS.Denied }
  >,
): ApiErrorCode {
  if (decision.reason === PROTECTION_BYPASS_DENIED_REASONS.PermissionRequired) {
    return API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED
  }
  if (DISABLED_REASONS.has(decision.reason)) {
    return API_ERROR_CODES.TEMP_WINDOW_DISABLED
  }
  return API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID
}
