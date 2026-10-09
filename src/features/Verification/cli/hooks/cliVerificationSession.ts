import type { CliToolId } from "~/services/verification/cliSupportVerification"

export type CliVerificationBatch = {
  signal: AbortSignal
  isCurrent: () => boolean
  isStopped: () => boolean
  finish: () => boolean
}

/** Owns source-bound tool runs and batches, including cancellation and result admission. */
export function createCliVerificationSession() {
  let generation = 0
  const toolRuns = new Map<CliToolId, AbortController>()
  let activeBatch: AbortController | null = null

  const reset = () => {
    generation += 1
    activeBatch?.abort()
    activeBatch = null
    for (const controller of toolRuns.values()) controller.abort()
    toolRuns.clear()
  }

  return {
    reset,
    beginBatch(): CliVerificationBatch {
      reset()
      const controller = new AbortController()
      const admittedGeneration = generation
      activeBatch = controller
      const isCurrent = () =>
        admittedGeneration === generation && activeBatch === controller
      return {
        signal: controller.signal,
        isCurrent,
        isStopped: () => controller.signal.aborted || !isCurrent(),
        finish: () => {
          if (!isCurrent()) return false
          activeBatch = null
          return true
        },
      }
    },
    beginTool(toolId: CliToolId, batch?: CliVerificationBatch) {
      toolRuns.get(toolId)?.abort()
      const controller = new AbortController()
      const admittedGeneration = generation
      const abortWithBatch = () => controller.abort()
      if (batch?.isStopped()) controller.abort()
      batch?.signal.addEventListener("abort", abortWithBatch, { once: true })
      toolRuns.set(toolId, controller)
      return {
        signal: controller.signal,
        isCurrent: () =>
          admittedGeneration === generation &&
          toolRuns.get(toolId) === controller,
        isCancelled: () => controller.signal.aborted || !!batch?.isStopped(),
        finish: () => {
          batch?.signal.removeEventListener("abort", abortWithBatch)
          if (toolRuns.get(toolId) === controller) toolRuns.delete(toolId)
        },
      }
    },
    stopBatch: () => activeBatch?.abort(),
    stopTool: (toolId: CliToolId) => toolRuns.get(toolId)?.abort(),
  }
}
