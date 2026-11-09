import { getDeclaredInputLimit } from "./contextLimits"
import type { ContextCounterInfo } from "./contextTokens"
import {
  NEEDLE_DEFAULTS as defaults,
  NEEDLE_PLAN_SOURCES,
} from "./needleConstants"

export type NeedleCapacityEvidence = {
  lowerBoundTokens: number
  counter: ContextCounterInfo
  requiresCredentialVerification?: boolean
}

export type NeedlePlanSource =
  (typeof NEEDLE_PLAN_SOURCES)[keyof typeof NEEDLE_PLAN_SOURCES]

/** Double the starting length, then include the exact limit once. */
function createLengthSweep(start: number, limit: number) {
  const lengths: number[] = []
  for (let length = start; length < limit; length *= 2) lengths.push(length)
  lengths.push(limit)
  return lengths
}

/** Suggest lengths from metadata; a previously accepted input is not a ceiling. */
export function getNeedleInputPresets(counter: ContextCounterInfo) {
  const limit = Math.min(
    getDeclaredInputLimit(counter, defaults.maxOutputTokens) ??
      defaults.maxInputTokens,
    defaults.maxInputTokens,
  )
  return limit >= defaults.minimumInputTokens
    ? createLengthSweep(defaults.fallbackInputTokens, limit)
    : []
}

/** Reference knowledge stays independent of a user's chosen test length. */
export function getNeedleInputReference(options: {
  counter: ContextCounterInfo
  capacity?: NeedleCapacityEvidence | null
}) {
  const { counter, capacity } = options
  const measured =
    capacity &&
    !capacity.requiresCredentialVerification &&
    capacity.counter.encoding === counter.encoding &&
    capacity.counter.estimated === counter.estimated &&
    Number.isSafeInteger(capacity.lowerBoundTokens) &&
    capacity.lowerBoundTokens >= defaults.minimumInputTokens
      ? capacity.lowerBoundTokens
      : undefined
  const declared = getDeclaredInputLimit(counter, defaults.maxOutputTokens)
  return {
    source:
      measured !== undefined
        ? NEEDLE_PLAN_SOURCES.Measured
        : declared !== undefined
          ? NEEDLE_PLAN_SOURCES.Declared
          : NEEDLE_PLAN_SOURCES.Fallback,
    inputTokens: measured ?? declared ?? defaults.fallbackInputTokens,
  } as const
}

/** Choose a bounded length sweep from request-scoped capacity or model metadata. */
export function createNeedlePlan(options: {
  counter: ContextCounterInfo
  capacity?: NeedleCapacityEvidence | null
  maxInputTokens?: number
  quick?: boolean
}) {
  const reference = getNeedleInputReference(options)
  const source: NeedlePlanSource =
    options.maxInputTokens !== undefined
      ? NEEDLE_PLAN_SOURCES.Custom
      : reference.source
  const requested = options.maxInputTokens ?? reference.inputTokens
  if (
    !Number.isSafeInteger(requested) ||
    requested < defaults.minimumInputTokens ||
    (source === NEEDLE_PLAN_SOURCES.Custom &&
      requested > defaults.maxInputTokens)
  )
    throw new Error("Input length must be between 1024 and 1048576 tokens")
  const limit = Math.min(requested, defaults.maxInputTokens)
  const lengths = options.quick
    ? [limit]
    : createLengthSweep(defaults.sweepStartTokens, limit)
  const depths = defaults.depths
  return {
    source,
    lengths,
    depths,
    limit,
    capped: limit < requested,
    requests: lengths.length * depths.length,
    totalInputTokens:
      lengths.reduce((sum, length) => sum + length, 0) * depths.length,
  }
}

export type NeedlePlan = ReturnType<typeof createNeedlePlan>

export type NeedleCoordinate = { targetTokens: number; depth: number }
export type NeedleSelection =
  | { targetTokens: number; depth?: number }
  | { targetTokens?: number; depth: number }

/** Cell identity always includes both length and insertion depth. */
export function isSameNeedleCoordinate(
  left: NeedleCoordinate,
  right: NeedleCoordinate | null | undefined,
) {
  return Boolean(
    right &&
      left.targetTokens === right.targetTokens &&
      left.depth === right.depth,
  )
}

/** An omitted axis selects a whole row or column; an absent selection selects all cells. */
export function matchesNeedleSelection(
  cell: NeedleCoordinate,
  selection?: NeedleSelection,
) {
  return (
    !selection ||
    ((selection.targetTokens === undefined ||
      selection.targetTokens === cell.targetTokens) &&
      (selection.depth === undefined || selection.depth === cell.depth))
  )
}

/** Stable identity for duplicate detection in restored measurements and run scopes. */
export function getNeedleCoordinateKey(cell: NeedleCoordinate) {
  return `${cell.targetTokens}:${cell.depth}`
}

/** Describe the requests actually selected, including partially completed rows/columns. */
export function summarizeNeedleCells(cells: NeedleCoordinate[]) {
  return {
    lengths: [...new Set(cells.map((cell) => cell.targetTokens))].sort(
      (a, b) => a - b,
    ),
    depths: [...new Set(cells.map((cell) => cell.depth))].sort((a, b) => a - b),
    requests: cells.length,
    totalInputTokens: cells.reduce((sum, cell) => sum + cell.targetTokens, 0),
  }
}

/** Expose the complete matrix even when the default run tests only its longest row. */
export function expandNeedlePlan(plan: NeedlePlan): NeedlePlan {
  const lengths = createLengthSweep(defaults.sweepStartTokens, plan.limit)
  return {
    ...plan,
    lengths,
    requests: lengths.length * plan.depths.length,
    totalInputTokens:
      lengths.reduce((sum, length) => sum + length, 0) * plan.depths.length,
  }
}

/** Run the entire selected scope, including cells with previous results. */
export function selectNeedleCells(
  plan: NeedlePlan,
  selection?: NeedleSelection,
  completed: NeedleCoordinate[] = [],
): { cells: NeedleCoordinate[]; retest: boolean } {
  if (
    selection &&
    ((selection.targetTokens === undefined && selection.depth === undefined) ||
      (selection.targetTokens !== undefined &&
        !plan.lengths.includes(selection.targetTokens)) ||
      (selection.depth !== undefined &&
        !plan.depths.some((depth) => depth === selection.depth)))
  )
    throw new Error("Invalid needle selection")
  const cells = plan.lengths
    .flatMap((targetTokens) =>
      plan.depths.map((depth) => ({ targetTokens, depth })),
    )
    .filter((cell) => matchesNeedleSelection(cell, selection))
  const retest = cells.some((cell) =>
    completed.some((item) => isSameNeedleCoordinate(item, cell)),
  )
  return {
    cells,
    retest,
  }
}
