import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_ROUTE_OVERRIDE_SOURCES,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import type {
  CheckInConfig,
  CheckInMethodDetection,
  CheckInMethodId,
  CheckInMethodKnowledge,
  CheckInMethodSelection,
  CheckInMethodStatus,
} from "~/types/checkIn"

/** A first saved record must be a definitive match or an authoritative negative. */
export const isPersistableInitialCheckInDetection = (
  detection: CheckInMethodDetection,
): boolean =>
  detection.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched ||
  detection.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported

/** Keeps a single confirmed snapshot when a later query cannot establish status. */
function retainLastKnownStatus(
  status: CheckInMethodStatus,
  previous?: CheckInMethodStatus,
): CheckInMethodStatus {
  if (status.outcome !== CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown) return status
  const previousKnown =
    previous?.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known
      ? previous
      : previous?.lastKnown
  const lastKnown =
    previousKnown &&
    (getCheckInMethodStatusTimestamp(previousKnown) ?? 0) >
      (getCheckInMethodStatusTimestamp(status.lastKnown) ?? 0)
      ? previousKnown
      : status.lastKnown ?? previousKnown
  return lastKnown ? { ...status, lastKnown } : status
}

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
        [input.methodId]: {
          ...previous,
          status: retainLastKnownStatus(input.status, previous.status),
        },
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
  const retainedFacts = getRetainedKnownStatusFacts(
    input.config.methodKnowledge.methods[input.methodId]?.status,
  )

  return replaceCheckInMethodStatus({
    config: input.config,
    methodId: input.methodId,
    status: {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      ...retainedFacts,
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

/** Fields of the last known status that describe the deployment rather than today. */
const getRetainedKnownStatusFacts = (
  status: CheckInMethodStatus | undefined,
): Pick<
  Extract<
    CheckInMethodStatus,
    { outcome: typeof CHECK_IN_METHOD_STATUS_OUTCOMES.Known }
  >,
  "availability" | "requiresManualVerification"
> => {
  if (status?.outcome !== CHECK_IN_METHOD_STATUS_OUTCOMES.Known) return {}
  return {
    ...(status.availability ? { availability: status.availability } : {}),
    ...(status.requiresManualVerification
      ? { requiresManualVerification: status.requiresManualVerification }
      : {}),
  }
}

/** Marks one registered method checked using execution evidence. */
export function markCheckInMethodExecuted(input: {
  config: CheckInConfig
  methodId: CheckInMethodId
  observedAt: number
}): CheckInConfig {
  const retainedFacts = getRetainedKnownStatusFacts(
    input.config.methodKnowledge.methods[input.methodId]?.status,
  )
  return replaceCheckInMethodStatus({
    config: input.config,
    methodId: input.methodId,
    status: {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      ...retainedFacts,
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
  /**
   * Routes a redetection round just verified. Without a discovery snapshot,
   * explicit draft entries take precedence. With one, concurrent edits and
   * deletions take precedence over newly learned paths.
   */
  learnedRouteOverrides?: CheckInConfig["routeOverrides"]
  /** Snapshot before discovery, used to distinguish concurrent edits from stale paths. */
  routeDiscoveryBase?: Pick<CheckInConfig, "routeOverrides">
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
  // Route paths are edited in this dialog and learned into it by redetection, so
  // the dialog is authoritative and a cleared field stays cleared.
  const routeOverrides = mergeCheckInRouteOverrides(
    input.draft.routeOverrides,
    input.learnedRouteOverrides,
    input.routeDiscoveryBase,
  )

  return {
    ...input.latest,
    automaticExecutionEnabled: input.draft.automaticExecutionEnabled,
    ...(typeof input.draft.continueWhenVerificationRequired === "boolean"
      ? {
          continueWhenVerificationRequired:
            input.draft.continueWhenVerificationRequired,
        }
      : { continueWhenVerificationRequired: undefined }),
    selection: input.selectionChanged
      ? input.draft.selection
      : input.latest.selection,
    routeOverrides,
    ...(customCheckIn ? { customCheckIn } : { customCheckIn: undefined }),
  }
}

/** Accepts learned paths while preserving edits made since a discovery snapshot. */
export function mergeCheckInRouteOverrides(
  user: CheckInConfig["routeOverrides"],
  learned: CheckInConfig["routeOverrides"],
  base?: Pick<CheckInConfig, "routeOverrides">,
): CheckInConfig["routeOverrides"] {
  if (!user && !learned) return undefined
  if (!base) return { ...learned, ...user }
  const routes = { ...learned }
  const methodIds = Object.keys({
    ...base.routeOverrides,
    ...user,
  }) as CheckInMethodId[]
  for (const methodId of methodIds) {
    const before = base.routeOverrides?.[methodId]
    const current = user?.[methodId]
    if (
      before?.path === current?.path &&
      before?.source === current?.source &&
      before?.observedAt === current?.observedAt
    )
      continue
    // A deletion is an edit too; never resurrect a path cleared during discovery.
    if (current) routes[methodId] = current
    else delete routes[methodId]
  }
  return Object.keys(routes).length ? routes : undefined
}
const selectionsEqual = (
  left: CheckInMethodSelection,
  right: CheckInMethodSelection,
) => left.mode === right.mode && left.methodId === right.methodId

/** Keeps established facts while requiring discovery for a new credential scope. */
export function invalidateCheckInDiscovery(
  config: CheckInConfig,
  options: { siteUrlChanged?: boolean } = {},
): CheckInConfig {
  const manualRoutes = Object.fromEntries(
    Object.entries(config.routeOverrides ?? {}).filter(
      ([, override]) =>
        override?.source === CHECK_IN_ROUTE_OVERRIDE_SOURCES.Manual,
    ),
  )
  return {
    ...config,
    // Manual paths belong to the deployment; learned paths require fresh evidence.
    routeOverrides:
      !options.siteUrlChanged && Object.keys(manualRoutes).length
        ? manualRoutes
        : undefined,
    methodKnowledge: {
      ...config.methodKnowledge,
      lastFullDiscoveryAt: undefined,
      lastAutomaticDiscoveryAttemptAt: undefined,
    },
  }
}

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
  const discoveryWasApplied = draftDiscoveryAt > latestDiscoveryAt
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
          ...input.latest.methodKnowledge,
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

/** Applies status and authoritative capability loss without rolling back user choices or newer discovery. */
export function mergeRefreshedCheckInStatus(input: {
  latest: CheckInConfig
  refreshed: CheckInConfig
}): CheckInConfig {
  let changed = false
  const methods = { ...input.latest.methodKnowledge.methods }

  for (const [methodId, refreshedKnowledge] of Object.entries(
    input.refreshed.methodKnowledge.methods,
  ) as Array<[CheckInMethodId, CheckInMethodKnowledge]>) {
    const detection = refreshedKnowledge.detection
    const latestKnowledge = methods[methodId]
    // A manual selection can name a method before any detection exists.
    // Only that selected method may gain its first matched or unsupported probe.
    if (!latestKnowledge) {
      if (
        methodId === input.latest.selection.methodId &&
        isPersistableInitialCheckInDetection(detection)
      ) {
        methods[methodId] = refreshedKnowledge
        changed = true
      }
      continue
    }
    const latestDetection = latestKnowledge.detection
    const latestDetectionTimestamp =
      latestDetection.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown
        ? latestDetection.attemptedAt
        : latestDetection.evidence.source ===
            CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe
          ? latestDetection.evidence.observedAt
          : undefined
    if (
      detection.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported &&
      (latestDetectionTimestamp === undefined ||
        detection.evidence.observedAt > latestDetectionTimestamp)
    ) {
      methods[methodId] = { ...latestKnowledge, detection }
      changed = true
    }
    if (!refreshedKnowledge.status) continue
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
      ...methods[methodId]!,
      status: retainLastKnownStatus(
        refreshedKnowledge.status,
        latestKnowledge.status,
      ),
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
