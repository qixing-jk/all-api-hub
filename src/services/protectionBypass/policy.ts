import type { TempContextMode } from "~/constants/tempContextMode"

import {
  getTempContextTaskMetadata,
  PROTECTION_BYPASS_CAPABILITY_KINDS,
  PROTECTION_BYPASS_DECISION_RESULTS,
  PROTECTION_BYPASS_DENIED_REASONS,
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_FEATURE_OPERATIONS,
  PROTECTION_BYPASS_FEATURES,
  type ProtectionBypassCause,
  type ProtectionBypassDecisionKind,
  type ProtectionBypassDeniedReason,
  type ProtectionBypassFeature,
  type ProtectionBypassIntentResolutionFailure,
  type ProtectionBypassOperation,
  type ProtectionBypassSurface,
  type ResolvedProtectionBypassExecution,
  type TempContextTask,
} from "./contracts"

export interface ProtectionBypassPolicy {
  automaticMasterEnabled: boolean
  automaticAccountRefreshEnabled: boolean
  manualAccountRefreshEnabled: boolean
  allowedSurfaces: Record<ProtectionBypassSurface, boolean>
  preferredMode: TempContextMode
}

export type ProtectionBypassPolicyState =
  | ProtectionBypassPolicy
  | { kind: typeof PROTECTION_BYPASS_DECISION_RESULTS.Unavailable }

export type ProtectionBypassCapability =
  | {
      kind: typeof PROTECTION_BYPASS_CAPABILITY_KINDS.Available
      adapter: TempContextMode
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
  | typeof PROTECTION_BYPASS_DENIED_REASONS.MissingIntent
  | typeof PROTECTION_BYPASS_DENIED_REASONS.InvalidIntent

export type ProtectionBypassEvaluatedDeniedReason = Exclude<
  ProtectionBypassDeniedReason,
  ProtectionBypassContextlessDeniedReason
>

export type ProtectionBypassContextlessDeniedDecision =
  | {
      kind: typeof PROTECTION_BYPASS_DECISION_RESULTS.Denied
      reason: typeof PROTECTION_BYPASS_DENIED_REASONS.MissingIntent
    }
  | {
      kind: typeof PROTECTION_BYPASS_DECISION_RESULTS.Denied
      reason: typeof PROTECTION_BYPASS_DENIED_REASONS.InvalidIntent
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
      adapter: TempContextMode
    } & ProtectionBypassDecisionContext)
  | ProtectionBypassContextlessDeniedDecision
  | ProtectionBypassEvaluatedDeniedDecision

interface EvaluateProtectionBypassPolicyInput {
  execution:
    | ResolvedProtectionBypassExecution
    | ProtectionBypassIntentResolutionFailure
    | undefined
  task: TempContextTask
  policy: ProtectionBypassPolicyState
  capability: ProtectionBypassCapability
  resourceIsCurrent?: boolean
}

/** Checks a policy operation set without weakening its canonical union. */
function includesOperation(
  operations: readonly ProtectionBypassOperation[],
  operation: ProtectionBypassOperation,
): boolean {
  return operations.includes(operation)
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

/** Evaluates resolved invocation intent against policy and capability facts. */
export function evaluateProtectionBypassPolicy({
  execution,
  task,
  policy,
  capability,
  resourceIsCurrent = true,
}: EvaluateProtectionBypassPolicyInput): ProtectionBypassPolicyDecision {
  if (execution === undefined) {
    return denied(PROTECTION_BYPASS_DENIED_REASONS.MissingIntent)
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
  const registeredOperations =
    PROTECTION_BYPASS_FEATURE_OPERATIONS[execution.feature]

  if (!includesOperation(registeredOperations, metadata.operation)) {
    return denied(
      PROTECTION_BYPASS_DENIED_REASONS.OperationNotPermitted,
      context,
    )
  }
  if (isUnavailablePolicy(policy)) {
    return denied(PROTECTION_BYPASS_DENIED_REASONS.PolicyUnavailable, context)
  }

  if (execution.kind === PROTECTION_BYPASS_EXECUTION_KINDS.Automatic) {
    if (!policy.automaticMasterEnabled) {
      return denied(PROTECTION_BYPASS_DENIED_REASONS.AutomaticDisabled, context)
    }
    if (
      execution.feature === PROTECTION_BYPASS_FEATURES.AccountRefresh &&
      !policy.automaticAccountRefreshEnabled
    ) {
      return denied(PROTECTION_BYPASS_DENIED_REASONS.FeatureDisabled, context)
    }
  } else if (
    execution.feature === PROTECTION_BYPASS_FEATURES.AccountRefresh &&
    !policy.manualAccountRefreshEnabled
  ) {
    return denied(
      PROTECTION_BYPASS_DENIED_REASONS.ManualFeatureDisabled,
      context,
    )
  }

  if (!policy.allowedSurfaces[execution.surface]) {
    return denied(PROTECTION_BYPASS_DENIED_REASONS.SurfaceDisabled, context)
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
