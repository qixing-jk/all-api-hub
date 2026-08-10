import {
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import type {
  CheckInConfig,
  CheckInMethodId,
  CheckInMethodKnowledge,
  CheckInMethodStatus,
} from "~/types/checkIn"

const replaceCheckInMethodStatus = (input: {
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
  return replaceCheckInMethodStatus({
    config: input.config,
    methodId: input.methodId,
    status: {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
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
