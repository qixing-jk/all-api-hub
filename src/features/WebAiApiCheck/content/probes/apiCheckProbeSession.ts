import type { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import { PRODUCT_ANALYTICS_RESULTS } from "~/services/productAnalytics/contracts"
import {
  getApiVerificationProbeDefinitions,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"

type Tracker = ReturnType<typeof startProductAnalyticsAction>
type CancellationDetails = Parameters<Tracker["complete"]>[1]
type ProbeContext = {
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  modelId: string
}
const contextKey = (context: ProbeContext) =>
  [
    context.apiType,
    context.baseUrl.trim(),
    context.apiKey.trim(),
    context.modelId.trim(),
  ].join("\n")

/** Owns task identity, cancellation, batch admission and credential-scoped result acceptance. */
export function createApiCheckProbeSession({
  cancelRun,
}: {
  cancelRun: (runId: string) => Promise<unknown>
}) {
  let generation = 0
  const active = new Map<
    ApiVerificationProbeId,
    {
      runId: string
      tracker: Tracker | null
      cancelled: boolean
      generation: number
    }
  >()
  const results = new Map<
    ApiVerificationProbeId,
    { context: string; result: ApiVerificationProbeResult }
  >()
  let batch: {
    generation: number
    stopped: boolean
    activeProbeId: ApiVerificationProbeId | null
  } | null = null
  const requestCancellation = (runId: string) => {
    void cancelRun(runId).catch(() => {})
  }

  return {
    beginProbe(
      probeId: ApiVerificationProbeId,
      runId: string,
      tracker: Tracker | null,
      context: ProbeContext,
    ) {
      const previous = active.get(probeId)
      if (previous) {
        requestCancellation(previous.runId)
        previous.cancelled = true
        previous.tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        previous.tracker = null
      }
      const resultContext = contextKey(context)
      const run = { runId, tracker, cancelled: false, generation }
      active.set(probeId, run)
      return {
        isCurrent: () =>
          active.get(probeId) === run && run.generation === generation,
        shouldIgnoreResult: () =>
          run.cancelled ||
          active.get(probeId) !== run ||
          run.generation !== generation,
        acceptResult(result: ApiVerificationProbeResult) {
          if (
            run.cancelled ||
            active.get(probeId) !== run ||
            run.generation !== generation
          )
            return false
          results.set(probeId, { context: resultContext, result })
          return true
        },
        finish() {
          if (active.get(probeId) === run) active.delete(probeId)
        },
      }
    },
    resultsForContext(context: ProbeContext): ApiVerificationProbeResult[] {
      const key = contextKey(context)
      return getApiVerificationProbeDefinitions(context.apiType)
        .map((definition) => results.get(definition.id))
        .filter(
          (entry): entry is NonNullable<typeof entry> =>
            entry !== undefined && entry.context === key,
        )
        .map((entry) => entry.result)
    },
    stopProbe(probeId: ApiVerificationProbeId, details: CancellationDetails) {
      const run = active.get(probeId)
      if (!run) return false
      requestCancellation(run.runId)
      run.cancelled = true
      run.tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled, details)
      run.tracker = null
      return true
    },
    beginBatch() {
      const current = {
        generation,
        stopped: false,
        activeProbeId: null as ApiVerificationProbeId | null,
      }
      batch = current
      return {
        isCurrent: () => batch === current && current.generation === generation,
        isStopped: () =>
          current.stopped ||
          batch !== current ||
          current.generation !== generation,
        selectProbe(probeId: ApiVerificationProbeId) {
          current.activeProbeId = probeId
        },
        finish() {
          if (batch !== current || current.generation !== generation)
            return false
          batch = null
          return true
        },
      }
    },
    stopBatch() {
      if (!batch || batch.stopped) return false
      batch.stopped = true
      const run = batch.activeProbeId
        ? active.get(batch.activeProbeId)
        : undefined
      if (run) requestCancellation(run.runId)
      return true
    },
    reset() {
      generation += 1
      for (const run of active.values()) {
        requestCancellation(run.runId)
        run.tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
      }
      active.clear()
      results.clear()
      batch = null
    },
  }
}
