import { modelMetadataService } from "~/services/models/modelMetadata"

import { createContextTokens } from "./contextTokens"
import {
  NEEDLE_DEFAULTS as defaults,
  NEEDLE_PLAN_SOURCES,
  NEEDLE_RUN_REASONS,
} from "./needleConstants"
import {
  createNeedlePlan,
  getNeedleCoordinateKey,
  selectNeedleCells,
} from "./needlePlan"
import { coerceNeedleResult } from "./needleResultCodec"
import type { NeedleResult, RunNeedleParams } from "./needleRun"

/** Validate the approved plan and retained measurements before scheduling requests. */
export async function prepareNeedleRun(params: RunNeedleParams) {
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
  return { counter, plan, result, targets }
}
