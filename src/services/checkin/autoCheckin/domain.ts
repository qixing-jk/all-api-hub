import {
  CHECK_IN_DISCOVERY_DECISION_OUTCOMES,
  CHECK_IN_EXECUTION_SKIP_REASONS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
  CHECK_IN_SELECTION_MODES,
  CHECK_IN_SELECTION_STALE_REASONS,
  CHECK_IN_SELECTION_STATUSES,
} from "~/constants/checkIn"
import { getDayKeyFromUnixSeconds } from "~/services/history/usageHistory/core"
import type {
  CheckInAccountState,
  CheckInConfig,
  CheckInDiscoveryDecision,
  CheckInExecutionEligibility,
  CheckInInspectionInput,
  CheckInMethodChoice,
  CheckInMethodDetection,
  CheckInMethodId,
  CheckInMethodSelection,
  CheckInSelectionState,
  PersistedCheckInMethodId,
} from "~/types/checkIn"

const uniqueCandidateMethodIds = (
  candidateMethodIds: readonly CheckInMethodId[],
): CheckInMethodId[] => [...new Set(candidateMethodIds)]

const getEffectiveDetectionOutcome = (
  detection: CheckInMethodDetection | undefined,
): CheckInMethodDetection["outcome"] => {
  // A failed rediscovery attempt must not erase established positive or
  // negative evidence, but it does keep the overall decision non-definitive.
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
  config: CheckInConfig,
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
  config: CheckInConfig,
  candidateMethodIds: readonly CheckInMethodId[],
): CheckInSelectionState => {
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
  selectionState: CheckInSelectionState,
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
  // Legacy accounts never used cached siteStatus as an execution gate. Preserve
  // that contract until a strict probe or execution supplies current Status.
  const knownStatus =
    status?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known
      ? status
      : undefined
  const statusObservedAt =
    knownStatus &&
    (knownStatus.evidence.source ===
      CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe ||
      knownStatus.evidence.source ===
        CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Execution)
      ? knownStatus.evidence.observedAt
      : undefined
  const statusControlsExecution = statusObservedAt !== undefined
  const checkedStatusIsCurrent =
    statusControlsExecution &&
    knownStatus?.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked &&
    getDayKeyFromUnixSeconds(
      Math.floor(statusObservedAt / 1000),
      input.timeZone,
    ) ===
      getDayKeyFromUnixSeconds(
        Math.floor((input.now ?? Date.now()) / 1000),
        input.timeZone,
      )
  if (
    statusControlsExecution &&
    knownStatus?.availability === CHECK_IN_METHOD_AVAILABILITIES.Disabled
  ) {
    return {
      eligible: false,
      skipReason: CHECK_IN_EXECUTION_SKIP_REASONS.MethodDisabled,
    }
  }
  if (checkedStatusIsCurrent) {
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

type CheckInSelectionTransition =
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
  config: CheckInConfig
  candidateMethodIds: readonly CheckInMethodId[]
  selection: CheckInSelectionTransition
}): CheckInConfig {
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
  config: CheckInConfig
  candidateMethodIds: readonly CheckInMethodId[]
  detections: Partial<Record<CheckInMethodId, CheckInMethodDetection>>
  completedAt: number
}): CheckInConfig {
  const candidateMethodIds = uniqueCandidateMethodIds(input.candidateMethodIds)
  const methods = Object.assign(
    Object.create(null),
    input.config.methodKnowledge.methods,
  ) as CheckInConfig["methodKnowledge"]["methods"]

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

  const merged: CheckInConfig = {
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

  const selectedMethodIsCandidate = isCandidateMethodId(
    selectedMethodId,
    candidateMethodIds,
  )
  const selectedDetection = selectedMethodIsCandidate
    ? methods[selectedMethodId]?.detection
    : undefined
  if (
    (!selectedMethodIsCandidate ||
      selectedDetection?.outcome ===
        CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported) &&
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
