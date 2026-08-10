import type {
  CheckInMethodId,
  PersistedCheckInMethodId,
} from "~/services/checkin/autoCheckin/providers/registry"
import type { CheckInConfig } from "~/types"

export const CHECK_IN_CONFIG_V7_VERSION = 7 as const

export const CHECK_IN_METHOD_UNKNOWN_REASON_CODES = {
  Network: "network",
  Timeout: "timeout",
  AuthenticationRequired: "authentication_required",
  PermissionDenied: "permission_denied",
  IdentityMismatch: "identity_mismatch",
  InvalidResponse: "invalid_response",
  CredentialPersistenceFailed: "credential_persistence_failed",
} as const

export const CHECK_IN_METHOD_UNKNOWN_REASONS = [
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Network,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Timeout,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.AuthenticationRequired,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.PermissionDenied,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.IdentityMismatch,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES.CredentialPersistenceFailed,
] as const

export type CheckInMethodUnknownReason =
  (typeof CHECK_IN_METHOD_UNKNOWN_REASONS)[number]

export const CHECK_IN_METHOD_DETECTION_OUTCOMES = {
  Matched: "matched",
  Unsupported: "unsupported",
  Unknown: "unknown",
} as const

export const CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES = {
  Probe: "probe",
  LegacyMigration: "legacy_migration",
  CompatibilityRegistration: "compatibility_registration",
} as const

export const CHECK_IN_METHOD_STATUS_OUTCOMES = {
  Known: "known",
  Unknown: "unknown",
} as const

export const CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES = {
  Probe: "probe",
  Execution: "execution",
  LegacyMigration: "legacy_migration",
} as const

export const CHECK_IN_METHOD_AVAILABILITIES = {
  Enabled: "enabled",
  Disabled: "disabled",
} as const

export const CHECK_IN_METHOD_TODAY_STATUSES = {
  Checked: "checked",
  NotChecked: "not_checked",
} as const

export const CHECK_IN_SELECTION_MODES = {
  Automatic: "automatic",
  Manual: "manual",
} as const

export const CHECK_IN_DISCOVERY_DECISION_OUTCOMES = {
  Resolved: "resolved",
  Ambiguous: "ambiguous",
  Unknown: "unknown",
  Unsupported: "unsupported",
} as const

export const CHECK_IN_SELECTION_STATUSES = {
  None: "none",
  Selected: "selected",
  Stale: "stale",
} as const

export const CHECK_IN_SELECTION_STALE_REASONS = {
  MethodUnavailable: "method_unavailable",
  MethodNotMatched: "method_not_matched",
  MethodUnsupported: "method_unsupported",
} as const

export const CHECK_IN_EXECUTION_SKIP_REASONS = {
  AccountDisabled: "account_disabled",
  GlobalAutomaticExecutionDisabled: "global_automatic_execution_disabled",
  AutomaticExecutionDisabled: "automatic_execution_disabled",
  NoSelectedMethod: "no_selected_method",
  MethodUnavailable: CHECK_IN_SELECTION_STALE_REASONS.MethodUnavailable,
  MethodNotMatched: CHECK_IN_SELECTION_STALE_REASONS.MethodNotMatched,
  MethodUnsupported: CHECK_IN_SELECTION_STALE_REASONS.MethodUnsupported,
  MethodDisabled: "method_disabled",
  AlreadyChecked: "already_checked",
} as const

export interface CheckInMethodUnknownAttempt {
  reason: CheckInMethodUnknownReason
  attemptedAt: number
}

export type CheckInMethodDetection =
  | {
      outcome: typeof CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched
      evidence:
        | {
            source: typeof CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe
            observedAt: number
          }
        | {
            source: typeof CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.LegacyMigration
          }
        | {
            source: typeof CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.CompatibilityRegistration
          }
      lastUnknownAttempt?: CheckInMethodUnknownAttempt
    }
  | {
      outcome: typeof CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported
      evidence: {
        source: typeof CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe
        observedAt: number
      }
      lastUnknownAttempt?: CheckInMethodUnknownAttempt
    }
  | {
      outcome: typeof CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown
      reason: CheckInMethodUnknownReason
      attemptedAt: number
    }

export type CheckInMethodStatus =
  | {
      outcome: typeof CHECK_IN_METHOD_STATUS_OUTCOMES.Known
      availability?: (typeof CHECK_IN_METHOD_AVAILABILITIES)[keyof typeof CHECK_IN_METHOD_AVAILABILITIES]
      today?: (typeof CHECK_IN_METHOD_TODAY_STATUSES)[keyof typeof CHECK_IN_METHOD_TODAY_STATUSES]
      evidence:
        | {
            source: typeof CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe
            observedAt: number
          }
        | {
            source: typeof CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Execution
            observedAt: number
          }
        | {
            source: typeof CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.LegacyMigration
            legacyObservedAt?: number
            legacyDayKey?: string
          }
    }
  | {
      outcome: typeof CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown
      reason: CheckInMethodUnknownReason
      attemptedAt: number
    }

export interface CheckInMethodKnowledge {
  detection: CheckInMethodDetection
  status?: CheckInMethodStatus
}

export type CheckInMethodSelection =
  | {
      mode: typeof CHECK_IN_SELECTION_MODES.Automatic
      methodId?: PersistedCheckInMethodId
    }
  | {
      mode: typeof CHECK_IN_SELECTION_MODES.Manual
      methodId: PersistedCheckInMethodId
    }

export interface CheckInConfigV7 {
  automaticExecutionEnabled: boolean
  methodKnowledge: {
    methods: Partial<Record<CheckInMethodId, CheckInMethodKnowledge>>
    lastFullDiscoveryAt?: number
  }
  selection: CheckInMethodSelection
  customCheckIn?: NonNullable<CheckInConfig["customCheckIn"]>
}

export type CheckInDiscoveryDecision =
  | {
      outcome: typeof CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Resolved
      methodId: CheckInMethodId
    }
  | {
      outcome: typeof CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Ambiguous
      methodIds: CheckInMethodId[]
    }
  | {
      outcome: typeof CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unknown
      matchedMethodIds: CheckInMethodId[]
      unknownMethodIds: CheckInMethodId[]
    }
  | { outcome: typeof CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unsupported }

export interface CheckInInspectionInput {
  config: CheckInConfigV7
  candidateMethodIds: readonly CheckInMethodId[]
  accountDisabled?: boolean
  globalAutomaticExecutionEnabled?: boolean
}

export type CheckInSelectionStaleReason =
  (typeof CHECK_IN_SELECTION_STALE_REASONS)[keyof typeof CHECK_IN_SELECTION_STALE_REASONS]

export type CheckInSelectionState =
  | {
      mode: CheckInMethodSelection["mode"]
      status: typeof CHECK_IN_SELECTION_STATUSES.None
    }
  | {
      mode: CheckInMethodSelection["mode"]
      status: typeof CHECK_IN_SELECTION_STATUSES.Selected
      methodId: PersistedCheckInMethodId
    }
  | {
      mode: CheckInMethodSelection["mode"]
      status: typeof CHECK_IN_SELECTION_STATUSES.Stale
      methodId: PersistedCheckInMethodId
      reason: CheckInSelectionStaleReason
    }

type DerivedCheckInSelectionState =
  | Exclude<
      CheckInSelectionState,
      { status: typeof CHECK_IN_SELECTION_STATUSES.Selected }
    >
  | {
      mode: CheckInMethodSelection["mode"]
      status: typeof CHECK_IN_SELECTION_STATUSES.Selected
      methodId: CheckInMethodId
    }

export type CheckInExecutionSkipReason =
  (typeof CHECK_IN_EXECUTION_SKIP_REASONS)[keyof typeof CHECK_IN_EXECUTION_SKIP_REASONS]

export type CheckInExecutionEligibility =
  | { eligible: true; methodId: CheckInMethodId }
  | { eligible: false; skipReason: CheckInExecutionSkipReason }

export interface CheckInMethodChoice {
  methodId: CheckInMethodId
  detectionOutcome: CheckInMethodDetection["outcome"]
  selected: boolean
}

export interface CheckInAccountState {
  decision: CheckInDiscoveryDecision
  selectionState: CheckInSelectionState
  choices: CheckInMethodChoice[]
  executionEligibility: CheckInExecutionEligibility
  rediscoveryRecommended: boolean
}

const uniqueCandidateMethodIds = (
  candidateMethodIds: readonly CheckInMethodId[],
): CheckInMethodId[] => [...new Set(candidateMethodIds)]

const getEffectiveDetectionOutcome = (
  detection: CheckInMethodDetection | undefined,
): CheckInMethodDetection["outcome"] => {
  if (
    !detection ||
    detection.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown ||
    detection.lastUnknownAttempt
  ) {
    return CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown
  }
  return detection.outcome
}

const deriveMethodChoices = (
  config: CheckInConfigV7,
  candidateMethodIds: readonly CheckInMethodId[],
): CheckInMethodChoice[] =>
  candidateMethodIds.map((methodId) => ({
    methodId,
    detectionOutcome: getEffectiveDetectionOutcome(
      config.methodKnowledge.methods[methodId]?.detection,
    ),
    selected: config.selection.methodId === methodId,
  }))

const deriveDiscoveryDecision = (
  choices: readonly CheckInMethodChoice[],
): CheckInDiscoveryDecision => {
  const matchedMethodIds = choices
    .filter(
      (choice) =>
        choice.detectionOutcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
    )
    .map((choice) => choice.methodId)
  const unknownMethodIds = choices
    .filter(
      (choice) =>
        choice.detectionOutcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
    )
    .map((choice) => choice.methodId)

  if (matchedMethodIds.length > 1) {
    return {
      outcome: CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Ambiguous,
      methodIds: matchedMethodIds,
    }
  }
  if (matchedMethodIds.length === 1 && unknownMethodIds.length === 0) {
    return {
      outcome: CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Resolved,
      methodId: matchedMethodIds[0],
    }
  }
  if (unknownMethodIds.length > 0) {
    return {
      outcome: CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unknown,
      matchedMethodIds,
      unknownMethodIds,
    }
  }
  return { outcome: CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Unsupported }
}

const isCandidateMethodId = (
  methodId: PersistedCheckInMethodId,
  candidateMethodIds: readonly CheckInMethodId[],
): methodId is CheckInMethodId =>
  candidateMethodIds.some((candidateMethodId) => candidateMethodId === methodId)

const deriveSelectionState = (
  config: CheckInConfigV7,
  candidateMethodIds: readonly CheckInMethodId[],
): DerivedCheckInSelectionState => {
  const selectedMethodId = config.selection.methodId
  if (!selectedMethodId) {
    return {
      mode: config.selection.mode,
      status: CHECK_IN_SELECTION_STATUSES.None,
    }
  }
  if (!isCandidateMethodId(selectedMethodId, candidateMethodIds)) {
    return {
      mode: config.selection.mode,
      status: CHECK_IN_SELECTION_STATUSES.Stale,
      methodId: selectedMethodId,
      reason: CHECK_IN_SELECTION_STALE_REASONS.MethodUnavailable,
    }
  }

  const detection = config.methodKnowledge.methods[selectedMethodId]?.detection
  if (detection?.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched) {
    return {
      mode: config.selection.mode,
      status: CHECK_IN_SELECTION_STATUSES.Selected,
      methodId: selectedMethodId,
    }
  }
  return {
    mode: config.selection.mode,
    status: CHECK_IN_SELECTION_STATUSES.Stale,
    methodId: selectedMethodId,
    reason:
      detection?.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported
        ? CHECK_IN_SELECTION_STALE_REASONS.MethodUnsupported
        : CHECK_IN_SELECTION_STALE_REASONS.MethodNotMatched,
  }
}

const deriveExecutionEligibility = (
  input: CheckInInspectionInput,
  selectionState: DerivedCheckInSelectionState,
): CheckInExecutionEligibility => {
  if (input.accountDisabled) {
    return {
      eligible: false,
      skipReason: CHECK_IN_EXECUTION_SKIP_REASONS.AccountDisabled,
    }
  }
  if (input.globalAutomaticExecutionEnabled === false) {
    return {
      eligible: false,
      skipReason:
        CHECK_IN_EXECUTION_SKIP_REASONS.GlobalAutomaticExecutionDisabled,
    }
  }
  if (!input.config.automaticExecutionEnabled) {
    return {
      eligible: false,
      skipReason: CHECK_IN_EXECUTION_SKIP_REASONS.AutomaticExecutionDisabled,
    }
  }
  if (selectionState.status === CHECK_IN_SELECTION_STATUSES.None) {
    return {
      eligible: false,
      skipReason: CHECK_IN_EXECUTION_SKIP_REASONS.NoSelectedMethod,
    }
  }
  if (selectionState.status === CHECK_IN_SELECTION_STATUSES.Stale) {
    return {
      eligible: false,
      skipReason: selectionState.reason,
    }
  }

  const methodId = selectionState.methodId
  const status = input.config.methodKnowledge.methods[methodId]?.status
  if (
    status?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
    status.availability === CHECK_IN_METHOD_AVAILABILITIES.Disabled
  ) {
    return {
      eligible: false,
      skipReason: CHECK_IN_EXECUTION_SKIP_REASONS.MethodDisabled,
    }
  }
  if (
    status?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
    status.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked
  ) {
    return {
      eligible: false,
      skipReason: CHECK_IN_EXECUTION_SKIP_REASONS.AlreadyChecked,
    }
  }
  return { eligible: true, methodId }
}

/**
 * Derives the current discovery Decision without persisting a second source of truth.
 */
export function inspectCheckInMethods(
  input: CheckInInspectionInput,
): CheckInAccountState {
  const candidateMethodIds = uniqueCandidateMethodIds(input.candidateMethodIds)
  const choices = deriveMethodChoices(input.config, candidateMethodIds)
  const decision = deriveDiscoveryDecision(choices)
  const selectionState = deriveSelectionState(input.config, candidateMethodIds)
  const executionEligibility = deriveExecutionEligibility(input, selectionState)

  return {
    decision,
    selectionState,
    choices,
    executionEligibility,
    rediscoveryRecommended:
      selectionState.status === CHECK_IN_SELECTION_STATUSES.Stale ||
      (candidateMethodIds.length > 0 &&
        input.config.methodKnowledge.lastFullDiscoveryAt === undefined) ||
      choices.some(
        (choice) =>
          choice.detectionOutcome ===
          CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
      ),
  }
}

export type CheckInSelectionTransition =
  | { mode: typeof CHECK_IN_SELECTION_MODES.Automatic }
  | {
      mode: typeof CHECK_IN_SELECTION_MODES.Manual
      methodId: PersistedCheckInMethodId
    }

const automaticSelectionFromDecision = (
  decision: CheckInDiscoveryDecision,
): Extract<
  CheckInMethodSelection,
  { mode: typeof CHECK_IN_SELECTION_MODES.Automatic }
> =>
  decision.outcome === CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Resolved
    ? {
        mode: CHECK_IN_SELECTION_MODES.Automatic,
        methodId: decision.methodId,
      }
    : { mode: CHECK_IN_SELECTION_MODES.Automatic }

/**
 * Applies an explicit manual choice or restores automatic selection from current facts.
 */
export function setCheckInSelection(input: {
  config: CheckInConfigV7
  candidateMethodIds: readonly CheckInMethodId[]
  selection: CheckInSelectionTransition
}): CheckInConfigV7 {
  if (input.selection.mode === CHECK_IN_SELECTION_MODES.Manual) {
    return {
      ...input.config,
      selection: {
        mode: CHECK_IN_SELECTION_MODES.Manual,
        methodId: input.selection.methodId,
      },
    }
  }

  const decision = inspectCheckInMethods({
    config: input.config,
    candidateMethodIds: input.candidateMethodIds,
  }).decision
  return {
    ...input.config,
    selection: automaticSelectionFromDecision(decision),
  }
}

const mergeDiscoveryDetection = (
  previous: CheckInMethodDetection | undefined,
  incoming: CheckInMethodDetection,
): CheckInMethodDetection => {
  if (
    incoming.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown &&
    previous &&
    previous.outcome !== CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown
  ) {
    return {
      ...previous,
      lastUnknownAttempt: {
        reason: incoming.reason,
        attemptedAt: incoming.attemptedAt,
      },
    }
  }
  if (incoming.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched) {
    return {
      outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
      evidence: incoming.evidence,
    }
  }
  if (incoming.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported) {
    return {
      outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
      evidence: incoming.evidence,
    }
  }
  return incoming
}

/**
 * Atomically merges one complete discovery round into persisted method facts.
 * Missing candidate results are recorded as bounded invalid-response attempts.
 */
export function mergeCheckInDiscoveryResults(input: {
  config: CheckInConfigV7
  candidateMethodIds: readonly CheckInMethodId[]
  detections: Partial<Record<CheckInMethodId, CheckInMethodDetection>>
  completedAt: number
}): CheckInConfigV7 {
  const candidateMethodIds = uniqueCandidateMethodIds(input.candidateMethodIds)
  const methods = Object.assign(
    Object.create(null),
    input.config.methodKnowledge.methods,
  ) as CheckInConfigV7["methodKnowledge"]["methods"]

  for (const methodId of candidateMethodIds) {
    const previous = methods[methodId]
    const incoming = input.detections[methodId] ?? {
      outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
      reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse,
      attemptedAt: input.completedAt,
    }

    methods[methodId] = {
      detection: mergeDiscoveryDetection(previous?.detection, incoming),
      ...(previous?.status ? { status: previous.status } : {}),
    }
  }

  const merged: CheckInConfigV7 = {
    ...input.config,
    methodKnowledge: {
      methods,
      lastFullDiscoveryAt: input.completedAt,
    },
  }
  if (merged.selection.mode === CHECK_IN_SELECTION_MODES.Manual) return merged

  const decision = inspectCheckInMethods({
    config: merged,
    candidateMethodIds,
  }).decision
  const selectedMethodId = merged.selection.methodId
  if (!selectedMethodId) {
    return {
      ...merged,
      selection: automaticSelectionFromDecision(decision),
    }
  }

  const selectedDetection = isCandidateMethodId(
    selectedMethodId,
    candidateMethodIds,
  )
    ? methods[selectedMethodId]?.detection
    : undefined
  if (
    selectedDetection?.outcome ===
      CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported &&
    decision.outcome === CHECK_IN_DISCOVERY_DECISION_OUTCOMES.Resolved
  ) {
    return {
      ...merged,
      selection: {
        mode: CHECK_IN_SELECTION_MODES.Automatic,
        methodId: decision.methodId,
      },
    }
  }

  return merged
}
