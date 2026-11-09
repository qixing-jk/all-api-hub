import { WEB_AI_API_CHECK_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  CONTEXT_ATTEMPT_FAILURE_REASONS,
  CONTEXT_ATTEMPT_OUTCOMES,
  CONTEXT_CAPACITY_REASONS,
} from "~/services/verification/modelQuality/contextCapacityConstants"
import {
  runContextCapacity,
  type ContextCapacityCheckpoint,
  type RunContextCapacityParams,
} from "~/services/verification/modelQuality/contextCapacityRun"
import { contextCapacityHistory } from "~/services/verification/verificationResultHistory/contextCapacityHistory"
import { getVerificationScopeKey } from "~/services/verification/verificationResultHistory/requestIdentity"

import { createLongContextCheckpoints } from "./longContextCheckpoints"

const checkpoints = createLongContextCheckpoints<ContextCapacityCheckpoint>(
  WEB_AI_API_CHECK_STORAGE_KEYS.CONTEXT_CHECKPOINTS,
  (checkpoint) => ({
    ...checkpoint,
    result: {
      ...checkpoint.result,
      attempts: checkpoint.result.attempts.map(
        ({ message: _message, ...attempt }) => attempt,
      ),
    },
  }),
)
export const discardInactiveContextCheckpoints = checkpoints.discardInactive

/** Recover observations once, without replaying an attempt of unknown charge. */
export async function runDurableContextCapacity(
  params: RunContextCapacityParams,
  recoverOnly = false,
) {
  const scope = await getVerificationScopeKey(params)
  const release = checkpoints.claim(scope)
  try {
    const checkpoint = await checkpoints.get(scope)
    if (checkpoint) {
      const lastAttempt = checkpoint.result.attempts.at(-1)
      const completed =
        checkpoint.result.reason !== CONTEXT_CAPACITY_REASONS.TestLimit ||
        (lastAttempt?.outcome === CONTEXT_ATTEMPT_OUTCOMES.Accepted &&
          lastAttempt.targetTokens === checkpoint.result.inputLimit)
      const result =
        checkpoint.inFlightTarget === undefined
          ? {
              ...checkpoint.result,
              reason: completed
                ? checkpoint.result.reason
                : CONTEXT_CAPACITY_REASONS.Budget,
            }
          : {
              ...checkpoint.result,
              reason: CONTEXT_CAPACITY_REASONS.Inconclusive,
              attempts: [
                ...checkpoint.result.attempts,
                {
                  targetTokens: checkpoint.inFlightTarget,
                  outcome: CONTEXT_ATTEMPT_OUTCOMES.Inconclusive,
                  failureReason: CONTEXT_ATTEMPT_FAILURE_REASONS.Interrupted,
                  message:
                    "Request interrupted; provider charge is unknown. The request was not retried.",
                },
              ],
            }
      await contextCapacityHistory.save(params, result)
      await checkpoints.update(scope)
      return result
    }
    if (recoverOnly) throw new Error("No context test checkpoint is available")
    const result = await runContextCapacity({
      ...params,
      onCheckpoint: async (checkpoint) => {
        if (params.abortSignal.aborted) return
        await checkpoints.update(scope, checkpoint)
      },
    })
    if (params.abortSignal.aborted) return result
    await contextCapacityHistory.save(params, result)
    await checkpoints.update(scope)
    return result
  } finally {
    release()
  }
}
