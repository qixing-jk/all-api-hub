import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
  CHECK_IN_METHOD_UNKNOWN_REASONS,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import {
  decodePersistedCheckInMethodId,
  isCheckInMethodId,
} from "~/services/checkin/autoCheckin/providers/registry"
import type {
  CheckInConfig,
  CheckInMethodDetection,
  CheckInMethodSelection,
  CheckInMethodStatus,
  CheckInMethodUnknownAttempt,
  CheckInMethodUnknownReason,
} from "~/types/checkIn"
import {
  TURNSTILE_PRE_TRIGGER_KINDS,
  type TurnstilePreTrigger,
  type TurnstilePreTriggerThrottle,
} from "~/types/turnstile"

const UNKNOWN_REASON_SET = new Set<string>(CHECK_IN_METHOD_UNKNOWN_REASONS)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

const coerceTimestamp = (value: unknown): number | undefined => {
  const timestamp =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : undefined
}

const normalizeDayKey = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : undefined
}

const normalizeTurnstileThrottle = (
  value: unknown,
): TurnstilePreTriggerThrottle | undefined => {
  if (!isRecord(value)) return undefined
  const maxAttempts =
    typeof value.maxAttempts === "number" &&
    Number.isInteger(value.maxAttempts) &&
    value.maxAttempts >= 0
      ? value.maxAttempts
      : undefined
  const minIntervalMs =
    typeof value.minIntervalMs === "number" &&
    Number.isFinite(value.minIntervalMs) &&
    value.minIntervalMs >= 0
      ? value.minIntervalMs
      : undefined
  return maxAttempts === undefined && minIntervalMs === undefined
    ? undefined
    : {
        ...(maxAttempts !== undefined ? { maxAttempts } : {}),
        ...(minIntervalMs !== undefined ? { minIntervalMs } : {}),
      }
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined

const normalizeTurnstilePreTrigger = (
  value: unknown,
): TurnstilePreTrigger | undefined => {
  if (!isRecord(value)) return undefined
  const throttle = normalizeTurnstileThrottle(value.throttle)

  if (value.kind === TURNSTILE_PRE_TRIGGER_KINDS.None) {
    return { kind: TURNSTILE_PRE_TRIGGER_KINDS.None }
  }
  if (value.kind === TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton) {
    const positivePattern = optionalString(value.positivePattern)
    const negativePattern = optionalString(value.negativePattern)
    const candidateSelector = optionalString(value.candidateSelector)
    return {
      kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton,
      ...(positivePattern !== undefined ? { positivePattern } : {}),
      ...(negativePattern !== undefined ? { negativePattern } : {}),
      ...(candidateSelector !== undefined ? { candidateSelector } : {}),
      ...(throttle ? { throttle } : {}),
    }
  }
  if (
    value.kind === TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector &&
    typeof value.selector === "string" &&
    value.selector.length > 0
  ) {
    const label = optionalString(value.label)
    return {
      kind: TURNSTILE_PRE_TRIGGER_KINDS.ClickSelector,
      selector: value.selector,
      ...(label !== undefined ? { label } : {}),
      ...(throttle ? { throttle } : {}),
    }
  }
  if (
    value.kind === TURNSTILE_PRE_TRIGGER_KINDS.ClickText &&
    typeof value.positivePattern === "string" &&
    value.positivePattern.length > 0
  ) {
    const negativePattern = optionalString(value.negativePattern)
    const candidateSelector = optionalString(value.candidateSelector)
    const label = optionalString(value.label)
    return {
      kind: TURNSTILE_PRE_TRIGGER_KINDS.ClickText,
      positivePattern: value.positivePattern,
      ...(negativePattern !== undefined ? { negativePattern } : {}),
      ...(candidateSelector !== undefined ? { candidateSelector } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(throttle ? { throttle } : {}),
    }
  }
  return undefined
}

const normalizeUnknownReason = (value: unknown): CheckInMethodUnknownReason =>
  typeof value === "string" && UNKNOWN_REASON_SET.has(value)
    ? (value as CheckInMethodUnknownReason)
    : CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse

const normalizeUnknownAttempt = (
  value: unknown,
): CheckInMethodUnknownAttempt | undefined => {
  if (!isRecord(value)) return undefined
  const attemptedAt = coerceTimestamp(value.attemptedAt)
  if (attemptedAt === undefined) return undefined
  return {
    reason: normalizeUnknownReason(value.reason),
    attemptedAt,
  }
}

const normalizeDetection = (
  value: unknown,
): CheckInMethodDetection | undefined => {
  if (!isRecord(value)) return undefined

  if (value.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown) {
    const attemptedAt = coerceTimestamp(value.attemptedAt)
    if (attemptedAt === undefined) return undefined
    return {
      outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
      reason: normalizeUnknownReason(value.reason),
      attemptedAt,
    }
  }

  if (
    (value.outcome !== CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched &&
      value.outcome !== CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported) ||
    !isRecord(value.evidence)
  ) {
    return undefined
  }

  const lastUnknownAttempt = normalizeUnknownAttempt(value.lastUnknownAttempt)
  if (value.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported) {
    if (
      value.evidence.source !== CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe
    ) {
      return undefined
    }
    const observedAt = coerceTimestamp(value.evidence.observedAt)
    if (observedAt === undefined) return undefined
    return {
      outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
      evidence: {
        source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
        observedAt,
      },
      ...(lastUnknownAttempt ? { lastUnknownAttempt } : {}),
    }
  }

  if (
    value.evidence.source === CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe
  ) {
    const observedAt = coerceTimestamp(value.evidence.observedAt)
    if (observedAt === undefined) return undefined
    return {
      outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
      evidence: {
        source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
        observedAt,
      },
      ...(lastUnknownAttempt ? { lastUnknownAttempt } : {}),
    }
  }
  if (
    value.evidence.source !==
      CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.LegacyMigration &&
    value.evidence.source !==
      CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.CompatibilityRegistration
  ) {
    return undefined
  }
  return {
    outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
    evidence: { source: value.evidence.source },
    ...(lastUnknownAttempt ? { lastUnknownAttempt } : {}),
  }
}

const normalizeStatus = (value: unknown): CheckInMethodStatus | undefined => {
  if (!isRecord(value)) return undefined
  if (value.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown) {
    const attemptedAt = coerceTimestamp(value.attemptedAt)
    if (attemptedAt === undefined) return undefined
    return {
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown,
      reason: normalizeUnknownReason(value.reason),
      attemptedAt,
    }
  }
  if (
    value.outcome !== CHECK_IN_METHOD_STATUS_OUTCOMES.Known ||
    !isRecord(value.evidence)
  ) {
    return undefined
  }

  const availability =
    value.availability === CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
    value.availability === CHECK_IN_METHOD_AVAILABILITIES.Disabled
      ? value.availability
      : undefined
  const today =
    value.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked ||
    value.today === CHECK_IN_METHOD_TODAY_STATUSES.NotChecked
      ? value.today
      : undefined
  if (!availability && !today) return undefined

  let evidence: Extract<
    CheckInMethodStatus,
    { outcome: typeof CHECK_IN_METHOD_STATUS_OUTCOMES.Known }
  >["evidence"]
  if (
    value.evidence.source === CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe ||
    value.evidence.source === CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Execution
  ) {
    const observedAt = coerceTimestamp(value.evidence.observedAt)
    if (observedAt === undefined) return undefined
    evidence = { source: value.evidence.source, observedAt }
  } else if (
    value.evidence.source ===
    CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.LegacyMigration
  ) {
    const legacyObservedAt = coerceTimestamp(value.evidence.legacyObservedAt)
    const legacyDayKey = normalizeDayKey(value.evidence.legacyDayKey)
    evidence = {
      source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.LegacyMigration,
      ...(legacyObservedAt !== undefined ? { legacyObservedAt } : {}),
      ...(legacyDayKey ? { legacyDayKey } : {}),
    }
  } else {
    return undefined
  }

  return {
    outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
    ...(availability ? { availability } : {}),
    ...(today ? { today } : {}),
    evidence,
  }
}

const normalizeCustomCheckIn = (
  value: unknown,
): CheckInConfig["customCheckIn"] => {
  if (!isRecord(value)) return undefined
  const turnstilePreTrigger = normalizeTurnstilePreTrigger(
    value.turnstilePreTrigger,
  )
  return {
    ...(typeof value.url === "string" ? { url: value.url } : {}),
    ...(turnstilePreTrigger ? { turnstilePreTrigger } : {}),
    ...(typeof value.redeemUrl === "string"
      ? { redeemUrl: value.redeemUrl }
      : {}),
    ...(typeof value.openRedeemWithCheckIn === "boolean"
      ? { openRedeemWithCheckIn: value.openRedeemWithCheckIn }
      : {}),
    ...(typeof value.isCheckedInToday === "boolean"
      ? { isCheckedInToday: value.isCheckedInToday }
      : {}),
    ...(typeof value.lastCheckInDate === "string"
      ? { lastCheckInDate: value.lastCheckInDate }
      : {}),
  }
}

/**
 * Strictly normalizes persisted V7 check-in state without making any method executable.
 */
export function normalizeCheckInConfigV7(value: unknown): CheckInConfig {
  const raw = isRecord(value) ? value : {}
  const rawMethodKnowledge = isRecord(raw.methodKnowledge)
    ? raw.methodKnowledge
    : {}
  const rawMethods = isRecord(rawMethodKnowledge.methods)
    ? rawMethodKnowledge.methods
    : {}
  const methods = Object.create(
    null,
  ) as CheckInConfig["methodKnowledge"]["methods"]

  for (const [rawMethodId, rawKnowledge] of Object.entries(rawMethods)) {
    const methodId = decodePersistedCheckInMethodId(rawMethodId)
    if (!methodId || !isCheckInMethodId(methodId) || !isRecord(rawKnowledge)) {
      continue
    }
    const detection = normalizeDetection(rawKnowledge.detection)
    if (!detection) continue
    const status = normalizeStatus(rawKnowledge.status)
    methods[methodId] = {
      detection,
      ...(status ? { status } : {}),
    }
  }

  const rawSelection = isRecord(raw.selection) ? raw.selection : {}
  const selectionMethodId = decodePersistedCheckInMethodId(
    rawSelection.methodId,
  )
  let selection: CheckInMethodSelection = {
    mode: CHECK_IN_SELECTION_MODES.Automatic,
  }
  if (
    rawSelection.mode === CHECK_IN_SELECTION_MODES.Manual &&
    selectionMethodId
  ) {
    selection = {
      mode: CHECK_IN_SELECTION_MODES.Manual,
      methodId: selectionMethodId,
    }
  } else if (rawSelection.mode === CHECK_IN_SELECTION_MODES.Automatic) {
    selection = {
      mode: CHECK_IN_SELECTION_MODES.Automatic,
      ...(selectionMethodId ? { methodId: selectionMethodId } : {}),
    }
  }
  const lastFullDiscoveryAt = coerceTimestamp(
    rawMethodKnowledge.lastFullDiscoveryAt,
  )
  const customCheckIn = normalizeCustomCheckIn(raw.customCheckIn)

  return {
    automaticExecutionEnabled: raw.automaticExecutionEnabled !== false,
    methodKnowledge: {
      methods,
      ...(lastFullDiscoveryAt !== undefined ? { lastFullDiscoveryAt } : {}),
    },
    selection,
    ...(customCheckIn ? { customCheckIn } : {}),
  }
}
