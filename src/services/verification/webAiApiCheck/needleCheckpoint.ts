import {
  toProtocolRoot,
  toVersionedProtocolMount,
} from "~/services/aiApi/protocolAddress"
import { WEB_AI_API_CHECK_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  NEEDLE_OUTCOMES,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import {
  expandNeedlePlan,
  isSameNeedleCoordinate,
  selectNeedleCells,
} from "~/services/verification/modelQuality/needlePlan"
import { coerceNeedleResult } from "~/services/verification/modelQuality/needleResultCodec"
import {
  runNeedleTest,
  type NeedleResult,
  type RunNeedleParams,
} from "~/services/verification/modelQuality/needleRun"
import { contextCapacityHistory } from "~/services/verification/verificationResultHistory/contextCapacityHistory"
import {
  getNeedleScopeKey,
  needleHistory,
} from "~/services/verification/verificationResultHistory/needleHistory"
import type { ApiVerificationHistoryTarget } from "~/services/verification/verificationResultHistory/types"
import { LONG_CONTEXT_ERROR_NAMES } from "~/services/verification/webAiApiCheck/longContextConstants"

import { createLongContextCheckpoints } from "./longContextCheckpoints"

type Checkpoint = {
  result: NeedleResult
  inFlight?: { targetTokens: number; depth: number }
  inFlightCells?: { targetTokens: number; depth: number }[]
}
/** Read legacy single-request markers and the complete concurrent dispatch set. */
function outstanding(checkpoint: Checkpoint, result: NeedleResult) {
  const cells =
    checkpoint.inFlightCells ??
    (checkpoint.inFlight ? [checkpoint.inFlight] : [])
  if (
    !Array.isArray(cells) ||
    cells.length > result.plan.requests ||
    cells.some(
      (cell) =>
        !cell ||
        !result.plan.lengths.includes(cell.targetTokens) ||
        !result.plan.depths.some((depth) => depth === cell.depth),
    )
  )
    throw Object.assign(new Error("Invalid needle checkpoint"), {
      name: LONG_CONTEXT_ERROR_NAMES.NeedleCheckpoint,
    })
  return cells.filter(
    (cell, index) =>
      cells.findIndex((item) => isSameNeedleCoordinate(item, cell)) === index,
  )
}
const checkpoints = createLongContextCheckpoints<Checkpoint>(
  WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS,
  (checkpoint) => {
    const result = coerceNeedleResult(checkpoint.result)
    if (!result) throw new Error("Invalid needle checkpoint")
    return {
      result,
      inFlightCells: outstanding(checkpoint, result),
    }
  },
)

export const discardInactiveNeedleCheckpoints = checkpoints.discardInactive

/** Recover before new work; an unknown provider outcome never authorizes a replay. */
export async function runDurableNeedleTest(
  params: RunNeedleParams,
  recoverOnly = false,
  target?: ApiVerificationHistoryTarget,
): Promise<NeedleResult> {
  // Keep the versioned mount through repeated execution boundaries. Reducing a
  // root again would consume a provider prefix that happens to end in /v1beta.
  const baseUrl = toVersionedProtocolMount(params.apiType, params.baseUrl)
  if (!baseUrl) throw new Error("Invalid base URL")
  params = { ...params, baseUrl }
  const scope = await getNeedleScopeKey(params)
  const release = checkpoints.claim(scope)
  let latestCheckpoint: Checkpoint | undefined
  let checkpointWriteFailed = false
  try {
    const checkpoint = await checkpoints.get(scope)
    if (checkpoint) {
      const result = coerceNeedleResult(checkpoint.result)
      if (!result)
        throw Object.assign(
          new Error(
            "Invalid needle checkpoint; discard it before starting again",
          ),
          { name: LONG_CONTEXT_ERROR_NAMES.NeedleCheckpoint },
        )
      const inFlightCells = outstanding(checkpoint, result)
      for (const coordinate of inFlightCells) {
        const { targetTokens, depth } = coordinate
        if (
          !result.plan.lengths.includes(targetTokens) ||
          !result.plan.depths.some((item) => item === depth)
        )
          throw Object.assign(new Error("Invalid needle checkpoint"), {
            name: LONG_CONTEXT_ERROR_NAMES.NeedleCheckpoint,
          })
        const interrupted = {
          targetTokens,
          depth,
          actualDepth: depth,
          localInputTokens: 0,
          outcome: NEEDLE_OUTCOMES.Interrupted,
        }
        const index = result.cells.findIndex((cell) =>
          isSameNeedleCoordinate(cell, coordinate),
        )
        if (index === -1) result.cells.push(interrupted)
        else result.cells[index] = interrupted
        if (result.processed !== undefined) result.processed++
      }
      const interrupted =
        inFlightCells.length > 0 || result.reason === NEEDLE_RUN_REASONS.Running
      if (interrupted) result.reason = NEEDLE_RUN_REASONS.Interrupted
      await needleHistory.save(params, result, target)
      await checkpoints.update(scope)
      // Recovery-only calls read back the old result. An explicit new run can
      // proceed after a terminal checkpoint's deferred history write succeeds.
      if (recoverOnly || interrupted) return result
      // The user requested a selection. Resume it from the now-durable recipe,
      // preserving measurements instead of treating recovery as a new test.
      if (params.selection && !params.resumeFrom) {
        const recoveredPlan = expandNeedlePlan(result.plan)
        const approvedCells = params.approvedPlan
          ? selectNeedleCells(params.approvedPlan, params.selection).cells
          : []
        if (
          selectNeedleCells(recoveredPlan, params.selection).cells.some(
            (cell) =>
              !approvedCells.some((approved) =>
                isSameNeedleCoordinate(cell, approved),
              ),
          )
        )
          throw new Error(
            "Recovered needle requests exceed the approved scope; review the saved result before retrying",
          )
        params = {
          ...params,
          resumeFrom: result,
          seed: result.seed,
          approvedPlan: recoveredPlan,
          approvedCounter: result.counter,
        }
      }
    }
    if (recoverOnly) throw new Error("No needle checkpoint is available")
    if (params.resumeFrom) {
      const saved = await needleHistory.get(params, target)
      if (
        !saved ||
        JSON.stringify(coerceNeedleResult(params.resumeFrom)) !==
          JSON.stringify(saved.result)
      )
        throw new Error(
          "Needle results changed or belong to a different connection; reload the saved result before continuing",
        )
    }
    const capacity = await contextCapacityHistory.get(
      { ...params, baseUrl: toProtocolRoot(params.apiType, baseUrl)! },
      target,
    )
    const result = await runNeedleTest({
      ...params,
      capacity: capacity?.counter
        ? {
            lowerBoundTokens: capacity.lowerBoundTokens,
            counter: capacity.counter,
          }
        : undefined,
      onCheckpoint: async (result, inFlightCells) => {
        try {
          await checkpoints.update(scope, { result, inFlightCells })
          latestCheckpoint = { result, inFlightCells }
        } catch (error) {
          checkpointWriteFailed = true
          throw error
        }
      },
    })
    await needleHistory.save(params, result, target)
    await checkpoints.update(scope)
    return result
  } catch (error) {
    if (
      !checkpointWriteFailed &&
      latestCheckpoint &&
      !latestCheckpoint.inFlightCells?.length
    ) {
      const result = {
        ...latestCheckpoint.result,
        reason:
          latestCheckpoint.result.reason === NEEDLE_RUN_REASONS.Running
            ? NEEDLE_RUN_REASONS.Error
            : latestCheckpoint.result.reason,
      }
      try {
        // Persist the terminal state before history so a failed history write
        // remains recoverable without inventing an interrupted provider call.
        await checkpoints.update(scope, { result })
        await needleHistory.save(params, result, target)
        await checkpoints.update(scope)
      } catch {
        // Retain checkpoint evidence and the original failure for recovery.
      }
    }
    throw error
  } finally {
    release()
  }
}
