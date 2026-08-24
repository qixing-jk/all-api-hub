import {
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import type {
  CheckInConfig,
  CheckInMethodId,
  CheckInMethodKnowledge,
  CheckInMethodSelection,
  CheckInMethodStatus,
} from "~/types/checkIn"

export const replaceCheckInMethodStatus = (input: {
  config: CheckInConfig
  methodId: CheckInMethodId
  status: CheckInMethodStatus
}): CheckInConfig => {
  const previous = input.config.methodKnowledge.methods[input.methodId]
  if (!previous) return input.config

  return {
    ...input.config,
    methodKnowledge: {
      ...input.config.methodKnowledge,
      methods: {
        ...input.config.methodKnowledge.methods,
        [input.methodId]: { ...previous, status: input.status },
      },
    },
  }
}

/** Replaces only one method's Detection during selected-only reconciliation. */
export function replaceCheckInMethodDetection(input: {
  config: CheckInConfig
  methodId: CheckInMethodId
  detection: CheckInMethodKnowledge["detection"]
}): CheckInConfig {
  const previous = input.config.methodKnowledge.methods[input.methodId]
  if (!previous) return input.config

  return {
    ...input.config,
    methodKnowledge: {
      ...input.config.methodKnowledge,
      methods: {
        ...input.config.methodKnowledge.methods,
        [input.methodId]: { ...previous, detection: input.detection },
      },
    },
  }
}

const getCheckInMethodStatusTimestamp = (
  status: CheckInMethodStatus | undefined,
): number | undefined => {
  if (!status) return undefined
  if (status.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown) {
    return status.attemptedAt
  }
  return status.evidence.source ===
    CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.LegacyMigration
    ? status.evidence.legacyObservedAt
    : status.evidence.observedAt
}

/** Merges a provider's boolean daily-status result into method knowledge. */
export function mergeCompatibilityCheckInStatus(input: {
  config: CheckInConfig
  methodId: CheckInMethodId
  isCheckedInToday: boolean
  observedAt: number
}): CheckInConfig {
  const previousStatus =
    input.config.methodKnowledge.methods[input.methodId]?.status
  const availability =
    previousStatus?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known
      ? previousStatus.availability
      : undefined

  return replaceCheckInMethodStatus({
    config: input.config,
    methodId: input.methodId,
    status: {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      ...(availability ? { availability } : {}),
      today: input.isCheckedInToday
        ? CHECK_IN_METHOD_TODAY_STATUSES.Checked
        : CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      evidence: {
        source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe,
        observedAt: input.observedAt,
      },
    },
  })
}

/** Marks one registered method checked using execution evidence. */
export function markCheckInMethodExecuted(input: {
  config: CheckInConfig
  methodId: CheckInMethodId
  observedAt: number
}): CheckInConfig {
  return replaceCheckInMethodStatus({
    config: input.config,
    methodId: input.methodId,
    status: {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
      evidence: {
        source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Execution,
        observedAt: input.observedAt,
      },
    },
  })
}

/** Applies AccountDialog-owned fields without replacing system-owned facts. */
export function mergeUserOwnedCheckInDraft(input: {
  latest: CheckInConfig
  draft: CheckInConfig
  selectionChanged?: boolean
}): CheckInConfig {
  const latestCustom = input.latest.customCheckIn
  const draftCustom = input.draft.customCheckIn
  const customCheckIn = draftCustom
    ? {
        ...(latestCustom ?? {}),
        url: draftCustom.url,
        redeemUrl: draftCustom.redeemUrl,
        openRedeemWithCheckIn: draftCustom.openRedeemWithCheckIn,
        turnstilePreTrigger: draftCustom.turnstilePreTrigger,
      }
    : undefined

  return {
    ...input.latest,
    automaticExecutionEnabled: input.draft.automaticExecutionEnabled,
    selection: input.selectionChanged
      ? input.draft.selection
      : input.latest.selection,
    ...(customCheckIn ? { customCheckIn } : { customCheckIn: undefined }),
  }
}

const selectionsEqual = (
  left: CheckInMethodSelection,
  right: CheckInMethodSelection,
) => left.mode === right.mode && left.methodId === right.methodId

/**
 * Commits one trusted redetection round without letting a stale form replace a
 * concurrent manual selection or a newer selected-method status observation.
 */
export function mergeDiscoveredCheckInDraft(input: {
  latest: CheckInConfig
  draft: CheckInConfig
  candidateMethodIds: readonly CheckInMethodId[]
  discoveryBaseSelection: CheckInMethodSelection
  selectionChanged?: boolean
}): CheckInConfig {
  const userMerged = mergeUserOwnedCheckInDraft(input)
  const latestDiscoveryAt =
    input.latest.methodKnowledge.lastFullDiscoveryAt ?? 0
  const draftDiscoveryAt = input.draft.methodKnowledge.lastFullDiscoveryAt ?? 0
  const discoveryWasApplied = draftDiscoveryAt >= latestDiscoveryAt
  const methods = { ...input.latest.methodKnowledge.methods }
  if (discoveryWasApplied) {
    for (const methodId of input.candidateMethodIds) {
      const discoveredKnowledge = input.draft.methodKnowledge.methods[methodId]
      if (discoveredKnowledge) methods[methodId] = discoveredKnowledge
    }
  }
  const discoveredKnowledge: CheckInConfig = {
    ...input.draft,
    methodKnowledge: discoveryWasApplied
      ? {
          methods,
          lastFullDiscoveryAt: input.draft.methodKnowledge.lastFullDiscoveryAt,
        }
      : input.latest.methodKnowledge,
  }
  const discoveryWithLatestStatus = mergeRefreshedCheckInStatus({
    latest: discoveredKnowledge,
    refreshed: input.latest,
  })
  const currentSelectionUnchanged = selectionsEqual(
    input.latest.selection,
    input.discoveryBaseSelection,
  )
  const canApplyAutomaticDiscoverySelection =
    !input.selectionChanged &&
    discoveryWasApplied &&
    currentSelectionUnchanged &&
    input.latest.selection.mode === CHECK_IN_SELECTION_MODES.Automatic

  return {
    ...userMerged,
    methodKnowledge: discoveryWithLatestStatus.methodKnowledge,
    selection: input.selectionChanged
      ? input.draft.selection
      : canApplyAutomaticDiscoverySelection
        ? input.draft.selection
        : input.latest.selection,
  }
}

/** Applies refreshed Status facts without rolling back user or discovery state. */
export function mergeRefreshedCheckInStatus(input: {
  latest: CheckInConfig
  refreshed: CheckInConfig
}): CheckInConfig {
  let changed = false
  const methods = { ...input.latest.methodKnowledge.methods }

  for (const [methodId, refreshedKnowledge] of Object.entries(
    input.refreshed.methodKnowledge.methods,
  ) as Array<[CheckInMethodId, CheckInMethodKnowledge]>) {
    const latestKnowledge = methods[methodId]
    if (!latestKnowledge || !refreshedKnowledge.status) continue
    const latestTimestamp = getCheckInMethodStatusTimestamp(
      latestKnowledge.status,
    )
    const refreshedTimestamp = getCheckInMethodStatusTimestamp(
      refreshedKnowledge.status,
    )
    if (
      latestTimestamp !== undefined &&
      (refreshedTimestamp === undefined ||
        refreshedTimestamp <= latestTimestamp)
    ) {
      continue
    }
    methods[methodId] = {
      ...latestKnowledge,
      status: refreshedKnowledge.status,
    }
    changed = true
  }

  return changed
    ? {
        ...input.latest,
        methodKnowledge: {
          ...input.latest.methodKnowledge,
          methods,
        },
      }
    : input.latest
}
