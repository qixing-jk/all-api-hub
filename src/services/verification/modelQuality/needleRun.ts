import { modelMetadataService } from "~/services/models/modelMetadata"
import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationRequestProfile,
} from "~/services/verification/aiApiVerification/types"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"

import { CONTEXT_ATTEMPT_OUTCOMES } from "./contextCapacityConstants"
import { classifyContextError } from "./contextErrors"
import { runContextGeneration } from "./contextGeneration"
import { exceedsContextBudget } from "./contextLimits"
import { createContextTokens, type ContextCounterInfo } from "./contextTokens"
import {
  NEEDLE_DEFAULTS as defaults,
  NEEDLE_EXECUTION_PHASES,
  NEEDLE_OUTCOMES,
  NEEDLE_PLAN_SOURCES,
  NEEDLE_RUN_REASONS,
} from "./needleConstants"
import {
  createNeedlePlan,
  getNeedleCoordinateKey,
  isSameNeedleCoordinate,
  selectNeedleCells,
  type NeedleCapacityEvidence,
  type NeedleCoordinate,
  type NeedlePlan,
  type NeedleSelection,
} from "./needlePlan"
import { prepareNeedlePrompt } from "./needlePrompt"
import { coerceNeedleResult } from "./needleResultCodec"

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
}
export type NeedleResult = {
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
    inFlight?: Pick<NeedleCell, "targetTokens" | "depth">,
  ) => Promise<void>
}

/** Run the approved retrieval sweep and retain distinct provider and retrieval outcomes. */
export async function runNeedleTest(
  params: RunNeedleParams,
): Promise<NeedleResult> {
  if (
    !Number.isSafeInteger(params.seed) ||
    params.seed < 0 ||
    params.seed > defaults.maxSeed
  )
    throw new Error("Invalid test seed")
  params.abortSignal.throwIfAborted()
  await modelMetadataService.initialize()
  const counter = await createContextTokens(
    modelMetadataService.resolveModelIdentity(params.modelId),
  )
  const approved = params.approvedPlan
  const plan = createNeedlePlan({
    counter: counter.info,
    capacity: params.capacity,
    maxInputTokens: approved?.limit ?? params.maxInputTokens,
    quick: approved ? approved.lengths.length === 1 : params.quick,
  })
  if (approved) {
    if (
      JSON.stringify(plan.lengths) !== JSON.stringify(approved.lengths) ||
      plan.requests !== approved.requests ||
      plan.totalInputTokens !== approved.totalInputTokens ||
      !Object.values(NEEDLE_PLAN_SOURCES).includes(approved.source)
    )
      throw new Error("Invalid needle test plan")
    if (
      !params.approvedCounter ||
      params.approvedCounter.encoding !== counter.info.encoding ||
      params.approvedCounter.estimated !== counter.info.estimated
    )
      throw new Error("Model token counter changed; prepare a new test")
    plan.source = approved.source
    plan.capped = approved.capped
  }
  const previous = params.resumeFrom
    ? coerceNeedleResult(params.resumeFrom)
    : null
  if (
    params.resumeFrom &&
    (!previous ||
      previous.seed !== params.seed ||
      previous.plan.limit !== plan.limit ||
      previous.counter.encoding !== counter.info.encoding ||
      previous.counter.estimated !== counter.info.estimated ||
      previous.cells.some(
        (cell) =>
          !plan.lengths.includes(cell.targetTokens) ||
          !plan.depths.some((depth) => depth === cell.depth),
      ) ||
      new Set(previous.cells.map(getNeedleCoordinateKey)).size !==
        previous.cells.length)
  )
    throw new Error("Needle results do not match this test plan")
  const result: NeedleResult = {
    version: defaults.version,
    seed: params.seed,
    counter: counter.info,
    plan,
    reason: NEEDLE_RUN_REASONS.Running,
    cells: previous?.cells ?? [],
  }
  const targets = selectNeedleCells(plan, params.selection, result.cells).cells
  result.scheduled = targets
  result.processed = 0
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
  let current:
    | {
        coordinate: NeedleCoordinate
        controller: AbortController
        phase: (typeof NEEDLE_EXECUTION_PHASES)[keyof typeof NEEDLE_EXECUTION_PHASES]
      }
    | undefined
  let closed = false
  const progress = () =>
    params.onProgress?.({
      ...snapshot(),
      ...(result.reason === NEEDLE_RUN_REASONS.Running
        ? {
            pending: [...remaining].filter(
              (cell) => cell !== current?.coordinate,
            ),
            ...(current ? { [current.phase]: current.coordinate } : {}),
          }
        : {}),
    })
  const abortCurrent = () => current?.controller.abort()
  params.abortSignal.addEventListener("abort", abortCurrent, { once: true })
  const publish = async () => {
    await params.onCheckpoint?.(snapshot())
    progress()
  }
  try {
    params.onControls?.({
      stopSelection: async (selection) => {
        if (
          closed ||
          result.reason !== NEEDLE_RUN_REASONS.Running ||
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
        if (current && cancelled.includes(current.coordinate))
          current.controller.abort()
        progress()
        return true
      },
    })
    for (const coordinate of targets) {
      const { targetTokens, depth } = coordinate
      if (params.abortSignal.aborted) {
        result.reason = NEEDLE_RUN_REASONS.Stopped
        break
      }
      if (!remaining.has(coordinate)) continue
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
        break
      }
      current = {
        coordinate,
        controller: new AbortController(),
        phase: NEEDLE_EXECUTION_PHASES.Preparing,
      }
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
        current = undefined
        if (params.abortSignal.aborted) {
          result.reason = NEEDLE_RUN_REASONS.Stopped
          break
        }
        continue
      }
      if (params.abortSignal.aborted) {
        result.reason = NEEDLE_RUN_REASONS.Stopped
        break
      }
      if (signal.aborted) {
        current = undefined
        continue
      }
      await params.onCheckpoint?.(snapshot(), { targetTokens, depth })
      if (params.abortSignal.aborted) {
        result.reason = NEEDLE_RUN_REASONS.Stopped
        break
      }
      if (signal.aborted) {
        current = undefined
        await publish()
        continue
      }
      const started = performance.now()
      const cell: NeedleCell = {
        targetTokens,
        depth,
        actualDepth: fixture.actualDepth,
        localInputTokens: fixture.localInputTokens,
        expected: fixture.expected,
        outcome: NEEDLE_OUTCOMES.Interrupted,
      }
      current.phase = NEEDLE_EXECUTION_PHASES.InFlight
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
            maxOutputTokens: defaults.maxOutputTokens,
            abortSignal: signal,
          },
          params.mode,
        )
        // An accepted stop wins even when the generation aggregate settles concurrently.
        signal.throwIfAborted()
        cell.response = toSanitizedErrorSummary(generated.text, secrets).slice(
          0,
          2048,
        )
        cell.outcome =
          generated.finishReason !== "stop" || !generated.text.trim()
            ? NEEDLE_OUTCOMES.Incomplete
            : generated.text.trim() === fixture.expected
              ? NEEDLE_OUTCOMES.Hit
              : NEEDLE_OUTCOMES.Miss
        cell.inputTokens = generated.usage?.inputTokens
        cell.outputTokens = generated.usage?.outputTokens
      } catch (error) {
        if (params.abortSignal.aborted)
          result.reason = NEEDLE_RUN_REASONS.Stopped
        else if (!signal.aborted) {
          cell.outcome =
            classifyContextError(error) ===
            CONTEXT_ATTEMPT_OUTCOMES.ContextLimit
              ? NEEDLE_OUTCOMES.ContextLimit
              : NEEDLE_OUTCOMES.Error
          cell.message = toSanitizedErrorSummary(error, secrets).slice(0, 1024)
          result.reason = NEEDLE_RUN_REASONS.Error
        }
      }
      cell.latencyMs = performance.now() - started
      const previousIndex = result.cells.findIndex((item) =>
        isSameNeedleCoordinate(item, coordinate),
      )
      if (previousIndex === -1) result.cells.push(cell)
      else result.cells[previousIndex] = cell
      requests++
      result.processed++
      totalInputTokens += Math.max(targetTokens, cell.inputTokens ?? 0)
      remaining.delete(coordinate)
      current = undefined
      await publish()
      if (result.reason !== NEEDLE_RUN_REASONS.Running) break
    }
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
