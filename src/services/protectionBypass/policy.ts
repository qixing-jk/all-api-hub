import type { TempContextPreferenceMode } from "~/constants/tempContextMode"

import {
  getTempContextTaskMetadata,
  isProtectionBypassTaskPermitted,
  PROTECTION_BYPASS_CAPABILITY_KINDS,
  PROTECTION_BYPASS_DECISION_RESULTS,
  PROTECTION_BYPASS_DENIED_REASONS,
  PROTECTION_BYPASS_EXECUTION_KINDS,
  type ProtectionBypassAutomaticFeature,
  type ProtectionBypassCause,
  type ProtectionBypassDecisionKind,
  type ProtectionBypassDeniedReason,
  type ProtectionBypassExecutionResolutionFailure,
  type ProtectionBypassFeature,
  type ProtectionBypassOperation,
  type ProtectionBypassSurface,
  type ResolvedProtectionBypassExecution,
  type TempContextTask,
} from "./contracts"

export interface ProtectionBypassPolicy {
  automaticMasterEnabled: boolean
  automaticFeatureBypass: Record<ProtectionBypassAutomaticFeature, boolean>
  preferredMode: TempContextPreferenceMode
}

export type ProtectionBypassPolicyState =
  | ProtectionBypassPolicy
  | { kind: typeof PROTECTION_BYPASS_DECISION_RESULTS.Unavailable }

export type ProtectionBypassCapability =
  | {
      kind: typeof PROTECTION_BYPASS_CAPABILITY_KINDS.Available
      adapter: TempContextPreferenceMode
    }
  | { kind: typeof PROTECTION_BYPASS_CAPABILITY_KINDS.PermissionRequired }
  | {
      kind: typeof PROTECTION_BYPASS_CAPABILITY_KINDS.UnsupportedEnvironment
    }
  | { kind: typeof PROTECTION_BYPASS_CAPABILITY_KINDS.AdapterUnavailable }

export type { ProtectionBypassDeniedReason } from "./contracts"

export interface ProtectionBypassDecisionContext {
  feature: ProtectionBypassFeature
  operation: ProtectionBypassOperation
  cause: ProtectionBypassCause
  surface: ProtectionBypassSurface
}

export type ProtectionBypassContextlessDeniedReason =
  | typeof PROTECTION_BYPASS_DENIED_REASONS.MissingExecution
  | typeof PROTECTION_BYPASS_DENIED_REASONS.InvalidExecution

export type ProtectionBypassEvaluatedDeniedReason = Exclude<
  ProtectionBypassDeniedReason,
  ProtectionBypassContextlessDeniedReason
>

export type ProtectionBypassContextlessDeniedDecision =
  | {
      kind: typeof PROTECTION_BYPASS_DECISION_RESULTS.Denied
      reason: typeof PROTECTION_BYPASS_DENIED_REASONS.MissingExecution
    }
  | {
      kind: typeof PROTECTION_BYPASS_DECISION_RESULTS.Denied
      reason: typeof PROTECTION_BYPASS_DENIED_REASONS.InvalidExecution
    }

export type ProtectionBypassEvaluatedDeniedDecision = {
  kind: typeof PROTECTION_BYPASS_DECISION_RESULTS.Denied
  reason: ProtectionBypassEvaluatedDeniedReason
} & ProtectionBypassDecisionContext

export type ProtectionBypassPolicyDecision =
  | ({
      kind: Extract<
        ProtectionBypassDecisionKind,
        typeof PROTECTION_BYPASS_DECISION_RESULTS.Allowed
      >
      adapter: TempContextPreferenceMode
    } & ProtectionBypassDecisionContext)
  | ProtectionBypassContextlessDeniedDecision
  | ProtectionBypassEvaluatedDeniedDecision

interface EvaluateProtectionBypassPolicyInput {
  execution:
    | ResolvedProtectionBypassExecution
    | ProtectionBypassExecutionResolutionFailure
    | undefined
  task: TempContextTask
  policy: ProtectionBypassPolicyState
  capability: ProtectionBypassCapability
  resourceIsCurrent?: boolean
}

/** Builds an expected policy denial with any already-resolved context. */
function denied(
  reason: ProtectionBypassContextlessDeniedReason,
): ProtectionBypassContextlessDeniedDecision
function denied(
  reason: ProtectionBypassEvaluatedDeniedReason,
  context: ProtectionBypassDecisionContext,
): ProtectionBypassEvaluatedDeniedDecision
function denied(
  reason: ProtectionBypassDeniedReason,
  context?: ProtectionBypassDecisionContext,
): ProtectionBypassPolicyDecision {
  if (context) {
    return {
      kind: PROTECTION_BYPASS_DECISION_RESULTS.Denied,
      reason,
      ...context,
    } as ProtectionBypassEvaluatedDeniedDecision
  }
  return {
    kind: PROTECTION_BYPASS_DECISION_RESULTS.Denied,
    reason,
  } as ProtectionBypassContextlessDeniedDecision
}

/** Narrows the explicit preference-read failure state. */
function isUnavailablePolicy(
  policy: ProtectionBypassPolicyState,
): policy is { kind: typeof PROTECTION_BYPASS_DECISION_RESULTS.Unavailable } {
  return (
    "kind" in policy &&
    policy.kind === PROTECTION_BYPASS_DECISION_RESULTS.Unavailable
  )
}

/** Evaluates the persisted automatic gates for policy and health checks. */
export function isAutomaticProtectionBypassEnabled(
  policy: Pick<
    ProtectionBypassPolicy,
    "automaticMasterEnabled" | "automaticFeatureBypass"
  >,
  feature: ProtectionBypassAutomaticFeature,
): boolean {
  return policy.automaticMasterEnabled && policy.automaticFeatureBypass[feature]
}

/** Evaluates resolved invocation intent against policy and capability facts. */
export function evaluateProtectionBypassPolicy({
  execution,
  task,
  policy,
  capability,
  resourceIsCurrent = true,
}: EvaluateProtectionBypassPolicyInput): ProtectionBypassPolicyDecision {
  if (execution === undefined) {
    return denied(PROTECTION_BYPASS_DENIED_REASONS.MissingExecution)
  }
  if (execution.kind === "invalid") {
    return denied(execution.reason)
  }

  const metadata = getTempContextTaskMetadata(task)
  const context: ProtectionBypassDecisionContext = {
    feature: execution.feature,
    operation: metadata.operation,
    cause: metadata.cause,
    surface: execution.surface,
  }
  if (!isProtectionBypassTaskPermitted(execution.feature, task.kind)) {
    return denied(PROTECTION_BYPASS_DENIED_REASONS.TaskNotPermitted, context)
  }
  if (isUnavailablePolicy(policy)) {
    return denied(PROTECTION_BYPASS_DENIED_REASONS.PolicyUnavailable, context)
  }

  if (execution.kind === PROTECTION_BYPASS_EXECUTION_KINDS.Automatic) {
    if (!policy.automaticMasterEnabled) {
      return denied(PROTECTION_BYPASS_DENIED_REASONS.AutomaticDisabled, context)
    }
    if (!isAutomaticProtectionBypassEnabled(policy, execution.feature)) {
      return denied(PROTECTION_BYPASS_DENIED_REASONS.FeatureDisabled, context)
    }
  }
  if (
    capability.kind === PROTECTION_BYPASS_CAPABILITY_KINDS.PermissionRequired
  ) {
    return denied(PROTECTION_BYPASS_DENIED_REASONS.PermissionRequired, context)
  }
  if (
    capability.kind ===
    PROTECTION_BYPASS_CAPABILITY_KINDS.UnsupportedEnvironment
  ) {
    return denied(
      PROTECTION_BYPASS_DENIED_REASONS.UnsupportedEnvironment,
      context,
    )
  }
  if (
    capability.kind === PROTECTION_BYPASS_CAPABILITY_KINDS.AdapterUnavailable
  ) {
    return denied(
      PROTECTION_BYPASS_DENIED_REASONS.UnsupportedEnvironment,
      context,
    )
  }
  if (!resourceIsCurrent) {
    return denied(PROTECTION_BYPASS_DENIED_REASONS.ResourceStale, context)
  }

  return {
    kind: PROTECTION_BYPASS_DECISION_RESULTS.Allowed,
    ...context,
    adapter: capability.adapter,
  }
}
