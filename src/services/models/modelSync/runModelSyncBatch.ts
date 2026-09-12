import type {
  BatchExecutionOptions,
  ExecutionItemResult,
  ExecutionResult,
} from "~/types/managedSiteModelSync"

/**
 * Shares model-sync ordering, progress and statistics across providers.
 * A rejected item or progress callback ends its worker and rejects the batch;
 * other workers retain their in-flight work and continue processing.
 */
export async function runModelSyncBatch<T>(
  channels: readonly T[],
  options: Pick<BatchExecutionOptions, "concurrency" | "onProgress">,
  execute: (channel: T) => Promise<ExecutionItemResult>,
): Promise<ExecutionResult> {
  const startedAt = Date.now()
  const total = channels.length
  const results = new Array<ExecutionItemResult>(total)
  let completed = 0
  let nextIndex = 0
  let progressTail = Promise.resolve()

  const worker = async () => {
    while (nextIndex < total) {
      const index = nextIndex++
      const result = await execute(channels[index])
      results[index] = result
      completed++
      const progress = { completed, total, lastResult: result }
      const persisted = progressTail.then(() => options.onProgress?.(progress))
      // Preserve completion order without letting one failed callback suppress
      // progress from other workers that are still finishing their items.
      progressTail = persisted.then(
        () => {},
        () => {},
      )
      await persisted
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(options.concurrency, total)) },
      worker,
    ),
  )

  const items = results.filter((item): item is ExecutionItemResult => !!item)
  const endedAt = Date.now()
  const successCount = items.filter((item) => item.ok).length
  return {
    items,
    statistics: {
      total,
      successCount,
      failureCount: total - successCount,
      durationMs: endedAt - startedAt,
      startedAt,
      endedAt,
    },
  }
}
