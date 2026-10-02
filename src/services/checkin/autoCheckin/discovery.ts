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
import { readProviderDetectResult } from "~/services/checkin/autoCheckin/providers/detection"
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

const DEFAULT_PER_ADAPTER_TIMEOUT_MS = 5_000
const DEFAULT_DISCOVERY_DEADLINE_MS = 15_000

interface CheckInDiscoveryInput {
  account: SiteAccount
  config: CheckInConfig
  /** Optional runtime request context for browser-profile and protection bypass. */
  request?: ApiServiceRequest
  registry?: AutoCheckinMethodRegistry
  observedAt?: number
  perAdapterTimeoutMs?: number
  deadlineMs?: number
  signal?: AbortSignal
}

interface CheckInDiscoveryResult {
  config: CheckInConfig
  decision: CheckInDiscoveryDecision
  detections: Partial<Record<CheckInMethodId, CheckInMethodDetection>>
  statuses?: Partial<Record<CheckInMethodId, CheckInMethodStatus>>
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
    ...readProviderDetectResult(result.value),
    timedOut: false,
  }
}

/**
 * Runs bounded, concurrent, read-only detection for the current site's candidates.
 * Adapter objects remain private to this Module; callers receive only V7 data.
 */
export async function discoverCheckInMethods(
  input: CheckInDiscoveryInput,
): Promise<CheckInDiscoveryResult> {
  const registry = input.registry ?? autoCheckinMethodRegistry
  const registrations = [
    ...registry.getCandidates(input.account.site_type, input.account.site_url),
  ]
  const observedAt = input.observedAt ?? Date.now()
  const perAdapterTimeoutMs =
    input.perAdapterTimeoutMs ?? DEFAULT_PER_ADAPTER_TIMEOUT_MS
  const deadlineMs = input.deadlineMs ?? DEFAULT_DISCOVERY_DEADLINE_MS
  const deadlineAt = Date.now() + Math.max(0, deadlineMs)
  const detections: Partial<Record<CheckInMethodId, CheckInMethodDetection>> =
    {}
  const statuses: Partial<Record<CheckInMethodId, CheckInMethodStatus>> = {}
  const timedOutMethodIds: CheckInMethodId[] = []

  const results = await Promise.all(
    registrations.map(async (registration) => {
      const now = Date.now()
      if (now >= deadlineAt || input.signal?.aborted) {
        return {
          id: registration.id,
          detection: unknownDetection(
            CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Timeout,
            observedAt,
          ),
          timedOut: true,
        }
      }
      const abortController = new AbortController()
      const onAbort = () => abortController.abort()
      if (input.signal) {
        input.signal.addEventListener("abort", onAbort, { once: true })
      }
      const context: AutoCheckinProviderReadContext = {
        account: input.account,
        ...(input.request ? { request: input.request } : {}),
        observedAt,
        signal: abortController.signal,
      }
      const remaining = Math.max(1, deadlineAt - now)
      try {
        const result = await runDetection(
          registration,
          context,
          Math.min(perAdapterTimeoutMs, remaining),
        )
        if (result.timedOut || input.signal?.aborted) {
          // The signal belongs to this one adapter invocation.
          abortController.abort()
        }
        if (input.signal?.aborted) {
          return {
            id: registration.id,
            detection: unknownDetection(
              CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Timeout,
              observedAt,
            ),
            timedOut: true,
          }
        }
        return {
          id: registration.id,
          detection: result.detection,
          status: result.status,
          timedOut: result.timedOut,
        }
      } finally {
        if (input.signal) {
          input.signal.removeEventListener("abort", onAbort)
        }
      }
    }),
  )

  for (const item of results) {
    detections[item.id] = item.detection
    if (item.status) statuses[item.id] = item.status
    if (item.timedOut) timedOutMethodIds.push(item.id)
  }

  const config = mergeCheckInDiscoveryResults({
    config: input.config,
    candidateMethodIds: registrations.map(({ id }) => id),
    detections,
    statuses,
    completedAt: observedAt,
  })
  const decision: CheckInDiscoveryDecision = inspectCheckInMethods({
    config,
    candidateMethodIds: registrations.map(({ id }) => id),
  }).decision

  return { config, decision, detections, statuses, timedOutMethodIds }
}

/** Applies a user-owned manual choice or restores automatic selection. */
export function setCheckInSelection(input: {
  config: CheckInConfig
  siteType: SiteAccount["site_type"]
  siteUrl?: string
  mode: (typeof CHECK_IN_SELECTION_MODES)[keyof typeof CHECK_IN_SELECTION_MODES]
  methodId?: CheckInConfig["selection"]["methodId"]
  registry?: AutoCheckinMethodRegistry
}): CheckInConfig {
  const registry = input.registry ?? autoCheckinMethodRegistry
  const candidateMethodIds = registry
    .getCandidates(input.siteType, input.siteUrl)
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
