import { withStoppedProbe } from "~/features/Verification/api/probeState"
import type { ProbeItemState } from "~/features/Verification/api/types"
import {
  API_VERIFICATION_PROBE_IDS,
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationMode,
  type ApiVerificationProbeId,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  buildSafeProbeFailureDiagnostics,
  isAbortError,
  toSanitizedErrorSummary,
} from "~/services/verification/aiApiVerification/utils"

type ProbeExecution = {
  probeId: ApiVerificationProbeId
  mode: ApiVerificationMode
  signal?: AbortSignal
  isStopped: () => boolean
  isCurrent: () => boolean
  isAbortFailure?: (error: unknown) => boolean
  readProbes: () => ProbeItemState[]
  replaceProbes: (probes: ProbeItemState[]) => void
  execute: () => Promise<ApiVerificationProbeResult>
  acceptResult: (
    probes: ProbeItemState[],
    result: ApiVerificationProbeResult,
  ) => Promise<unknown>
  failure: {
    secrets: () => string[]
    summary: string
    report: (sanitizedMessage: string) => void
  }
  stoppedMode?: () => ApiVerificationMode | undefined
}

/** Own attempts, stop acceptance, safe failure results and their persistence ordering. */
export async function executeDialogProbe({
  probeId,
  mode,
  signal,
  isStopped,
  isCurrent,
  isAbortFailure = (error) => isAbortError(error, signal),
  readProbes,
  replaceProbes,
  execute,
  acceptResult,
  failure,
  stoppedMode = () => mode,
}: ProbeExecution): Promise<{
  result: ApiVerificationProbeResult | null
  error?: unknown
}> {
  if (!isCurrent()) return { result: null }
  replaceProbes(
    readProbes().map((probe) =>
      probe.definition.id === probeId
        ? { ...probe, isRunning: true, attempts: probe.attempts + 1 }
        : probe,
    ),
  )

  const settleStopped = () => {
    replaceProbes(withStoppedProbe(readProbes(), probeId, stoppedMode()))
    return { result: null }
  }
  const accept = async (result: ApiVerificationProbeResult) => {
    const probes = readProbes().map((probe) =>
      probe.definition.id === probeId
        ? { ...probe, isRunning: false, result }
        : probe,
    )
    replaceProbes(probes)
    await acceptResult(probes, result)
    return isCurrent() ? result : null
  }

  try {
    const result = await execute()
    if (!isCurrent()) return { result: null }
    // An aborted request can still resolve successfully; acceptance follows intent.
    if (isStopped()) return settleStopped()
    return { result: await accept(result) }
  } catch (error) {
    if (!isCurrent()) return { result: null }
    if (isAbortFailure(error) || isStopped()) return settleStopped()

    const sanitizedMessage = toSanitizedErrorSummary(error, failure.secrets())
    failure.report(sanitizedMessage)
    const result: ApiVerificationProbeResult = {
      id: probeId,
      mode: probeId === API_VERIFICATION_PROBE_IDS.Models ? undefined : mode,
      status: API_VERIFICATION_PROBE_STATUSES.Fail,
      latencyMs: 0,
      summary: failure.summary,
      ...buildSafeProbeFailureDiagnostics(error, sanitizedMessage),
    }
    return { result: await accept(result), error }
  }
}
