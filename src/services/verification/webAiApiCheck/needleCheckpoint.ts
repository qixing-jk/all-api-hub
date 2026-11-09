import { WEB_AI_API_CHECK_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  NEEDLE_OUTCOMES,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import { isSameNeedleCoordinate } from "~/services/verification/modelQuality/needlePlan"
import { coerceNeedleResult } from "~/services/verification/modelQuality/needleResultCodec"
import {
  runNeedleTest,
  type NeedleResult,
  type RunNeedleParams,
} from "~/services/verification/modelQuality/needleRun"
import { contextCapacityHistory } from "~/services/verification/verificationResultHistory/contextCapacityHistory"
import { needleHistory } from "~/services/verification/verificationResultHistory/needleHistory"
import { getVerificationScopeKey } from "~/services/verification/verificationResultHistory/requestIdentity"
import type { ApiVerificationHistoryTarget } from "~/services/verification/verificationResultHistory/types"
import { LONG_CONTEXT_ERROR_NAMES } from "~/services/verification/webAiApiCheck/longContextConstants"

import { createLongContextCheckpoints } from "./longContextCheckpoints"

type Checkpoint = {
  result: NeedleResult
  inFlight?: { targetTokens: number; depth: number }
}
const checkpoints = createLongContextCheckpoints<Checkpoint>(
  WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS,
  (checkpoint) => {
    const result = coerceNeedleResult(checkpoint.result)
    if (!result) throw new Error("Invalid needle checkpoint")
    return {
      result,
      ...(checkpoint.inFlight ? { inFlight: checkpoint.inFlight } : {}),
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
  const scope = await getVerificationScopeKey(params)
  const release = checkpoints.claim(scope)
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
      if (checkpoint.inFlight) {
        const { targetTokens, depth } = checkpoint.inFlight
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
          isSameNeedleCoordinate(cell, checkpoint.inFlight),
        )
        if (index === -1) result.cells.push(interrupted)
        else result.cells[index] = interrupted
        if (result.processed !== undefined) result.processed++
      }
      if (checkpoint.inFlight || result.reason === NEEDLE_RUN_REASONS.Running)
        result.reason = NEEDLE_RUN_REASONS.Interrupted
      await needleHistory.save(params, result, target)
      await checkpoints.update(scope)
      return result
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
    const capacity = await contextCapacityHistory.get(params, target)
    const result = await runNeedleTest({
      ...params,
      capacity: capacity?.counter
        ? {
            lowerBoundTokens: capacity.lowerBoundTokens,
            counter: capacity.counter,
          }
        : undefined,
      onCheckpoint: async (result, inFlight) => {
        await checkpoints.update(scope, { result, inFlight })
      },
    })
    await needleHistory.save(params, result, target)
    await checkpoints.update(scope)
    return result
  } finally {
    release()
  }
}
