import { Storage } from "@plasmohq/storage"

import {
  STORAGE_LOCKS,
  WEB_AI_API_CHECK_STORAGE_KEYS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
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
import {
  contextCapacityHistory,
  getContextCapacityScopeKey,
} from "~/services/verification/verificationResultHistory/contextCapacityHistory"

const storage = new Storage({ area: "local" })
const activeScopes = new Set<string>()
const storageKey = WEB_AI_API_CHECK_STORAGE_KEYS.CONTEXT_CHECKPOINTS
type Checkpoints = Record<string, ContextCapacityCheckpoint>

/** Only compact measurements cross worker restarts; request secrets never do. */
async function update(scope: string, checkpoint?: ContextCapacityCheckpoint) {
  return withExtensionStorageWriteLock(
    STORAGE_LOCKS.WEB_AI_API_CHECK,
    async () => {
      const entries = (await storage.get<Checkpoints>(storageKey)) ?? {}
      if (checkpoint) {
        // Never evict an unresolved request merely to start another paid request.
        if (!entries[scope] && Object.keys(entries).length >= 20)
          throw new Error(
            "Too many interrupted context tests; recover an earlier test first",
          )
        entries[scope] = {
          ...checkpoint,
          result: {
            ...checkpoint.result,
            attempts: checkpoint.result.attempts.map(
              ({ message: _message, ...attempt }) => attempt,
            ),
          },
        }
      } else delete entries[scope]
      await storage.set(storageKey, entries)
    },
  )
}

/** Recover observations once, without replaying an attempt of unknown charge. */
export async function runDurableContextCapacity(
  params: RunContextCapacityParams,
  recoverOnly = false,
) {
  const scope = await getContextCapacityScopeKey(params)
  if (activeScopes.has(scope))
    throw new Error("This connection already has a context test running")
  activeScopes.add(scope)
  try {
    const checkpoint = (await storage.get<Checkpoints>(storageKey))?.[scope]
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
      await update(scope)
      return result
    }
    if (recoverOnly) throw new Error("No context test checkpoint is available")
    const result = await runContextCapacity({
      ...params,
      onCheckpoint: async (checkpoint) => {
        if (params.abortSignal.aborted) return
        await update(scope, checkpoint)
      },
    })
    if (params.abortSignal.aborted) return result
    await contextCapacityHistory.save(params, result)
    await update(scope)
    return result
  } finally {
    activeScopes.delete(scope)
  }
}
