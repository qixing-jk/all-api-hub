import type { VerificationGenerationMetrics } from "~/services/verification/aiApiVerification/generationMetrics"
import type { VerificationGenerationProgress } from "~/services/verification/aiApiVerification/generationProgress"
import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationRequestProfile,
} from "~/services/verification/aiApiVerification/types"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { normalizeVerificationConcurrency } from "~/services/verification/concurrency"
import { mapWithConcurrency } from "~/utils/core/mapWithConcurrency"

import { CONTEXT_ATTEMPT_OUTCOMES } from "./contextCapacityConstants"
import { classifyContextError } from "./contextErrors"
import { runContextGeneration } from "./contextGeneration"
import { exceedsContextBudget } from "./contextLimits"
import { type ContextCounterInfo } from "./contextTokens"
import {
  NEEDLE_DEFAULTS as defaults,
  NEEDLE_EXECUTION_PHASES,
  NEEDLE_OUTCOMES,
  NEEDLE_RUN_REASONS,
} from "./needleConstants"
import {
  isSameNeedleCoordinate,
  selectNeedleCells,
  type NeedleCapacityEvidence,
  type NeedleCoordinate,
  type NeedlePlan,
  type NeedleSelection,
} from "./needlePlan"
import { prepareNeedlePrompt } from "./needlePrompt"
import { prepareNeedleRun } from "./needleRunPreparation"

export type NeedleCell = {
  targetTokens: number
  depth: number
  actualDepth: number
  localInputTokens: number
  outcome: (typeof NEEDLE_OUTCOMES)[keyof typeof NEEDLE_OUTCOMES]
  inputTokens?: number
  outputTokens?: number
  response?: string
  expected?: string
  message?: string
  latencyMs?: number
  metrics?: VerificationGenerationMetrics[]
}
export type NeedleResult = {
  outputs?: (NeedleCoordinate & {
    progress: VerificationGenerationProgress
    startedAt: number
  })[]
  version: number
  seed: number
  plan: NeedlePlan
  counter: ContextCounterInfo
  reason: (typeof NEEDLE_RUN_REASONS)[keyof typeof NEEDLE_RUN_REASONS]
  cells: NeedleCell[]
  /** Live progress only; completed results and persisted measurements omit this. */
  inFlight?: Pick<NeedleCell, "targetTokens" | "depth">
  pending?: NeedleCoordinate[]
  preparing?: NeedleCoordinate
  inFlightCells?: NeedleCoordinate[]
  preparingCells?: NeedleCoordinate[]
  /** Preserve the last run's scope independently of accumulated measurements. */
  scheduled?: NeedleCoordinate[]
  processed?: number
  /** Cells cancelled in this run; an in-flight cancellation may also have an unknown measurement. */
  cancelled?: NeedleCoordinate[]
}
export type NeedleRunControls = {
  stopSelection: (selection: NeedleSelection) => Promise<boolean>
}
export type RunNeedleParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
  mode?: ApiVerificationMode
  requestProfile?: ApiVerificationRequestProfile
  requestProfileEnhanced?: boolean
  requestHeaders?: Record<string, string>
  maxInputTokens?: number
  quick?: boolean
  concurrency?: number
  selection?: NeedleSelection
  resumeFrom?: NeedleResult
  seed: number
  capacity?: NeedleCapacityEvidence | null
  /** Freeze the preview the user started, even if metadata/history changes meanwhile. */
  approvedPlan?: NeedlePlan
  approvedCounter?: ContextCounterInfo
  abortSignal: AbortSignal
  onControls?: (controls: NeedleRunControls) => void
  /** Cancellations accepted by the UI before the background controls became available. */
  cancelledCells?: NeedleCoordinate[]
  onProgress?: (result: NeedleResult) => void
  onCheckpoint?: (
    result: NeedleResult,
    inFlight?: NeedleCoordinate[],
  ) => Promise<void>
}

/** Run the approved retrieval sweep and retain distinct provider and retrieval outcomes. */
export async function runNeedleTest(
  params: RunNeedleParams,
): Promise<NeedleResult> {
  const { counter, plan, result, targets } = await prepareNeedleRun(params)
  // Every explicit run has its own budget; retained observations are not new requests.
  let totalInputTokens = 0
  let requests = 0
  const snapshot = () => ({ ...result, cells: [...result.cells] })
  const remaining = new Set(targets)
  if (params.cancelledCells?.length) {
    if (
      params.cancelledCells.some(
        (cell) => !targets.some((item) => isSameNeedleCoordinate(item, cell)),
      )
    )
      throw new Error("Invalid cancelled needle cell")
    result.cancelled = targets.filter((cell) =>
      params.cancelledCells!.some((item) => isSameNeedleCoordinate(item, cell)),
    )
    for (const cell of result.cancelled) remaining.delete(cell)
  }
  type ActiveCell = {
    coordinate: NeedleCoordinate
    controller: AbortController
    phase: (typeof NEEDLE_EXECUTION_PHASES)[keyof typeof NEEDLE_EXECUTION_PHASES]
    dispatched: boolean
  }
  const active = new Map<NeedleCoordinate, ActiveCell>()
  let closed = false
  let failed = false
  let writes = Promise.resolve()
  const coordinates = (phase: ActiveCell["phase"]) =>
    [...active.values()]
      .filter((cell) => cell.phase === phase)
      .map((cell) => cell.coordinate)
  const progress = () => {
    const inFlightCells = coordinates(NEEDLE_EXECUTION_PHASES.InFlight)
    const preparingCells = coordinates(NEEDLE_EXECUTION_PHASES.Preparing)
    params.onProgress?.({
      ...snapshot(),
      ...(result.reason === NEEDLE_RUN_REASONS.Running || active.size
        ? {
            pending: [...remaining].filter((cell) => !active.has(cell)),
            inFlight: inFlightCells[0],
            preparing: preparingCells[0],
            inFlightCells,
            preparingCells,
          }
        : {}),
    })
  }
  const abortCurrent = () => active.forEach((cell) => cell.controller.abort())
  params.abortSignal.addEventListener("abort", abortCurrent, { once: true })
  // Serialize snapshots at write time, so completing one cell cannot erase a
  // sibling's dispatch marker or replace a newer completed measurement.
  const checkpoint = () => {
    const write = writes.then(async () => {
      if (failed) return
      const inFlight = coordinates(NEEDLE_EXECUTION_PHASES.InFlight)
      await params.onCheckpoint?.(
        snapshot(),
        inFlight.length ? inFlight : undefined,
      )
    })
    writes = write.catch(() => {
      failed = true
      abortCurrent()
    })
    return write
  }
  const publish = async () => {
    await checkpoint()
    progress()
  }
  try {
    params.onControls?.({
      stopSelection: async (selection) => {
        if (
          closed ||
          (result.reason !== NEEDLE_RUN_REASONS.Running && !active.size) ||
          params.abortSignal.aborted ||
          !selection
        )
          return false
        let selected: NeedleCoordinate[]
        try {
          selected = selectNeedleCells(plan, selection).cells
        } catch {
          return false
        }
        const cancelled = [...remaining].filter((cell) =>
          selected.some((item) => isSameNeedleCoordinate(item, cell)),
        )
        if (!cancelled.length) return false
        result.cancelled = [...(result.cancelled ?? []), ...cancelled]
        for (const cell of cancelled) remaining.delete(cell)
        for (const cell of cancelled) active.get(cell)?.controller.abort()
        progress()
        return true
      },
    })
    await mapWithConcurrency(
      targets,
      normalizeVerificationConcurrency(params.concurrency),
      async (coordinate) => {
        if (failed || result.reason !== NEEDLE_RUN_REASONS.Running) return
        const { targetTokens, depth } = coordinate
        if (params.abortSignal.aborted) {
          result.reason = NEEDLE_RUN_REASONS.Stopped
          return
        }
        if (!remaining.has(coordinate)) return
        if (
          exceedsContextBudget({
            requests,
            inputTokens: totalInputTokens,
            nextInputTokens: targetTokens,
            maxRequests: defaults.maxRequests,
            maxInputTokens: defaults.maxTotalInputTokens,
          })
        ) {
          result.reason = NEEDLE_RUN_REASONS.Budget
          return
        }
        // Reserve the plan budget before preparation yields to another worker.
        requests++
        totalInputTokens += targetTokens
        const current: ActiveCell = {
          coordinate,
          controller: new AbortController(),
          phase: NEEDLE_EXECUTION_PHASES.Preparing,
          dispatched: false,
        }
        active.set(coordinate, current)
        try {
          const signal = current.controller.signal
          let fixture: Awaited<ReturnType<typeof prepareNeedlePrompt>>
          progress()
          try {
            fixture = await prepareNeedlePrompt(
              counter,
              targetTokens,
              depth,
              params.seed,
              signal,
            )
          } catch (error) {
            if (!signal.aborted) throw error
            if (params.abortSignal.aborted) {
              result.reason = NEEDLE_RUN_REASONS.Stopped
              return
            }
            return
          }
          if (params.abortSignal.aborted) {
            result.reason = NEEDLE_RUN_REASONS.Stopped
            return
          }
          if (signal.aborted) {
            return
          }
          current.phase = NEEDLE_EXECUTION_PHASES.InFlight
          await checkpoint()
          if (params.abortSignal.aborted) {
            result.reason = NEEDLE_RUN_REASONS.Stopped
            return
          }
          if (signal.aborted) {
            await publish()
            return
          }
          const started = performance.now()
          const outputStartedAt = Date.now()
          const cell: NeedleCell = {
            targetTokens,
            depth,
            actualDepth: fixture.actualDepth,
            localInputTokens: fixture.localInputTokens,
            expected: fixture.expected,
            outcome: NEEDLE_OUTCOMES.Interrupted,
          }
          current.dispatched = true
          progress()
          const secrets = [
            params.apiKey,
            ...Object.values(params.requestHeaders ?? {}),
          ]
          try {
            const generated = await runContextGeneration(
              params,
              {
                prompt: fixture.prompt,
                onProgress: (output) => {
                  result.outputs = [
                    ...(result.outputs ?? []).filter(
                      (entry) => !isSameNeedleCoordinate(entry, coordinate),
                    ),
                    {
                      ...coordinate,
                      progress: output,
                      startedAt: outputStartedAt,
                    },
                  ]
                  progress()
                },
                maxOutputTokens: defaults.maxOutputTokens,
                abortSignal: signal,
              },
              params.mode,
            )
            // An accepted stop wins even when the generation aggregate settles concurrently.
            signal.throwIfAborted()
            cell.response = toSanitizedErrorSummary(
              generated.text,
              secrets,
            ).slice(0, 2048)
            cell.outcome =
              generated.finishReason !== "stop" || !generated.text.trim()
                ? NEEDLE_OUTCOMES.Incomplete
                : generated.text.trim() === fixture.expected
                  ? NEEDLE_OUTCOMES.Hit
                  : NEEDLE_OUTCOMES.Miss
            cell.inputTokens = generated.usage?.inputTokens
            cell.outputTokens = generated.usage?.outputTokens
            cell.metrics = generated.metrics
          } catch (error) {
            if (params.abortSignal.aborted)
              result.reason = NEEDLE_RUN_REASONS.Stopped
            else if (!signal.aborted) {
              cell.outcome =
                classifyContextError(error) ===
                CONTEXT_ATTEMPT_OUTCOMES.ContextLimit
                  ? NEEDLE_OUTCOMES.ContextLimit
                  : NEEDLE_OUTCOMES.Error
              cell.message = toSanitizedErrorSummary(error, secrets).slice(
                0,
                1024,
              )
              result.reason = NEEDLE_RUN_REASONS.Error
            }
          }
          cell.latencyMs = performance.now() - started
          const previousIndex = result.cells.findIndex((item) =>
            isSameNeedleCoordinate(item, coordinate),
          )
          if (previousIndex === -1) result.cells.push(cell)
          else result.cells[previousIndex] = cell
          result.processed!++
          totalInputTokens += Math.max(
            0,
            (cell.inputTokens ?? 0) - targetTokens,
          )
        } catch (error) {
          failed = true
          abortCurrent()
          throw error
        } finally {
          active.delete(coordinate)
          remaining.delete(coordinate)
          if (!current.dispatched) {
            requests--
            totalInputTokens -= targetTokens
          }
          if (!failed) await publish()
        }
      },
    )
    if (params.abortSignal.aborted) result.reason = NEEDLE_RUN_REASONS.Stopped
    if (result.reason === NEEDLE_RUN_REASONS.Running)
      result.reason = result.cancelled?.length
        ? NEEDLE_RUN_REASONS.Stopped
        : NEEDLE_RUN_REASONS.Complete
    await publish()
    return result
  } finally {
    closed = true
    params.abortSignal.removeEventListener("abort", abortCurrent)
  }
}
