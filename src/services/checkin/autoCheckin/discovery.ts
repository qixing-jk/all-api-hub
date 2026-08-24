import {
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  setCheckInSelection as applySelection,
  inspectCheckInMethods,
  mergeCheckInDiscoveryResults,
} from "~/services/checkin/autoCheckin/domain"
import { getCheckInMethodUnknownReason } from "~/services/checkin/autoCheckin/errors"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import type {
  AutoCheckinProviderDetectResult,
  AutoCheckinProviderReadContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import type {
  AutoCheckinMethodRegistration,
  AutoCheckinMethodRegistry,
} from "~/services/checkin/autoCheckin/providers/registry"
import type { SiteAccount } from "~/types"
import type {
  CheckInConfig,
  CheckInDiscoveryDecision,
  CheckInMethodDetection,
  CheckInMethodId,
  CheckInMethodStatus,
} from "~/types/checkIn"

const DEFAULT_PER_ADAPTER_TIMEOUT_MS = 3_000
const DEFAULT_DISCOVERY_DEADLINE_MS = 10_000

interface CheckInDiscoveryInput {
  account: SiteAccount
  config: CheckInConfig
  /** Optional runtime request context for browser-profile and protection bypass. */
  request?: ApiServiceRequest
  registry?: AutoCheckinMethodRegistry
  observedAt?: number
  perAdapterTimeoutMs?: number
  deadlineMs?: number
}

interface CheckInDiscoveryResult {
  config: CheckInConfig
  decision: CheckInDiscoveryDecision
  detections: Partial<Record<CheckInMethodId, CheckInMethodDetection>>
  timedOutMethodIds: CheckInMethodId[]
}

const unknownDetection = (
  reason: (typeof CHECK_IN_METHOD_UNKNOWN_REASON_CODES)[keyof typeof CHECK_IN_METHOD_UNKNOWN_REASON_CODES],
  attemptedAt: number,
): CheckInMethodDetection => ({
  outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
  reason,
  attemptedAt,
})

const withTimeout = async <T>(
  task: Promise<T>,
  timeoutMs: number,
): Promise<{ timedOut: boolean; value?: T }> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return { timedOut: true }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const taskResult = task.then(
      (value) => ({ timedOut: false as const, value }),
      (error) => ({ timedOut: false as const, error }),
    )
    const result = await Promise.race([
      taskResult,
      new Promise<{ timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs)
      }),
    ])
    if (!result.timedOut && "error" in result) throw result.error
    return result
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const resolveCompatibilityDetection = (
  registration: AutoCheckinMethodRegistration,
): CheckInMethodDetection | undefined =>
  registration.compatibilityRegistration
    ? {
        outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
        evidence: {
          source:
            CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.CompatibilityRegistration,
        },
      }
    : undefined

const runDetection = async (
  registration: AutoCheckinMethodRegistration,
  context: AutoCheckinProviderReadContext,
  timeoutMs: number,
): Promise<{
  detection: CheckInMethodDetection
  status?: CheckInMethodStatus
  timedOut: boolean
}> => {
  const compatibility = resolveCompatibilityDetection(registration)
  if (!registration.provider.detect && compatibility) {
    return { detection: compatibility, timedOut: false }
  }
  if (!registration.provider.detect) {
    return {
      detection: unknownDetection(
        CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse,
        context.observedAt,
      ),
      timedOut: false,
    }
  }

  let result: { timedOut: boolean; value?: AutoCheckinProviderDetectResult }
  try {
    result = await withTimeout(
      Promise.resolve().then(() => registration.provider.detect!(context)),
      timeoutMs,
    )
  } catch (error) {
    return {
      detection: unknownDetection(
        getCheckInMethodUnknownReason(error),
        context.observedAt,
      ),
      timedOut: false,
    }
  }
  if (result.timedOut || !result.value) {
    return {
      detection: unknownDetection(
        CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Timeout,
        context.observedAt,
      ),
      timedOut: true,
    }
  }
  return {
    detection:
      "detection" in result.value ? result.value.detection : result.value,
    ...(typeof result.value === "object" &&
    "status" in result.value &&
    result.value.status
      ? { status: result.value.status }
      : {}),
    timedOut: false,
  }
}

/**
 * Runs bounded, serial, read-only detection for the current site's candidates.
 * Adapter objects remain private to this Module; callers receive only V7 data.
 */
export async function discoverCheckInMethods(
  input: CheckInDiscoveryInput,
): Promise<CheckInDiscoveryResult> {
  const registry = input.registry ?? autoCheckinMethodRegistry
  const registrations = [...registry.getCandidates(input.account.site_type)]
  const observedAt = input.observedAt ?? Date.now()
  const perAdapterTimeoutMs =
    input.perAdapterTimeoutMs ?? DEFAULT_PER_ADAPTER_TIMEOUT_MS
  const deadlineMs = input.deadlineMs ?? DEFAULT_DISCOVERY_DEADLINE_MS
  const deadlineAt = Date.now() + Math.max(0, deadlineMs)
  const detections: Partial<Record<CheckInMethodId, CheckInMethodDetection>> =
    {}
  const statuses: Partial<Record<CheckInMethodId, CheckInMethodStatus>> = {}
  const timedOutMethodIds: CheckInMethodId[] = []

  for (const registration of registrations) {
    const now = Date.now()
    if (now >= deadlineAt) {
      detections[registration.id] = unknownDetection(
        CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Timeout,
        observedAt,
      )
      timedOutMethodIds.push(registration.id)
      continue
    }
    const abortController = new AbortController()
    const context: AutoCheckinProviderReadContext = {
      account: input.account,
      ...(input.request ? { request: input.request } : {}),
      observedAt,
      signal: abortController.signal,
    }
    const remaining = Math.max(1, deadlineAt - now)
    const result = await runDetection(
      registration,
      context,
      Math.min(perAdapterTimeoutMs, remaining),
    )
    if (result.timedOut) {
      // The signal belongs to this one adapter invocation and cannot affect
      // later candidates in the serial discovery round.
      abortController.abort()
    }
    detections[registration.id] = result.detection
    if (result.status) statuses[registration.id] = result.status
    if (result.timedOut) timedOutMethodIds.push(registration.id)
  }

  let config = mergeCheckInDiscoveryResults({
    config: input.config,
    candidateMethodIds: registrations.map(({ id }) => id),
    detections,
    completedAt: observedAt,
  })
  if (Object.keys(statuses).length > 0) {
    config = {
      ...config,
      methodKnowledge: {
        ...config.methodKnowledge,
        methods: Object.fromEntries(
          Object.entries(config.methodKnowledge.methods).map(
            ([methodId, knowledge]) => [
              methodId,
              statuses[methodId as CheckInMethodId]
                ? {
                    ...knowledge,
                    status: statuses[methodId as CheckInMethodId],
                  }
                : knowledge,
            ],
          ),
        ),
      },
    }
  }
  const decision: CheckInDiscoveryDecision = inspectCheckInMethods({
    config,
    candidateMethodIds: registrations.map(({ id }) => id),
  }).decision

  return { config, decision, detections, timedOutMethodIds }
}

/** Applies a user-owned manual choice or restores automatic selection. */
export function setCheckInSelection(input: {
  config: CheckInConfig
  siteType: SiteAccount["site_type"]
  mode: (typeof CHECK_IN_SELECTION_MODES)[keyof typeof CHECK_IN_SELECTION_MODES]
  methodId?: CheckInConfig["selection"]["methodId"]
  registry?: AutoCheckinMethodRegistry
}): CheckInConfig {
  const registry = input.registry ?? autoCheckinMethodRegistry
  const candidateMethodIds = registry
    .getCandidates(input.siteType)
    .map(({ id }) => id)
  if (
    input.mode === CHECK_IN_SELECTION_MODES.Manual &&
    (!input.methodId ||
      !candidateMethodIds.includes(input.methodId as CheckInMethodId))
  ) {
    return input.config
  }
  return applySelection({
    config: input.config,
    candidateMethodIds,
    selection:
      input.mode === CHECK_IN_SELECTION_MODES.Manual
        ? { mode: CHECK_IN_SELECTION_MODES.Manual, methodId: input.methodId! }
        : { mode: CHECK_IN_SELECTION_MODES.Automatic },
  })
}
