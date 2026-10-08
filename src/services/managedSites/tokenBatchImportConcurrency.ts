/** Runs batch preparation or submissions with four workers, draining active work before reporting a failure. */
const BATCH_IMPORT_CONCURRENCY = 4

export const mapBatchImportWithConcurrency = async <TItem, TResult>(
  items: TItem[],
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> => {
  if (items.length === 0) {
    return []
  }

  const results = new Array<TResult>(items.length)
  let nextIndex = 0
  let hasFailure = false
  let firstFailure: unknown

  const workers = Array.from(
    { length: Math.min(BATCH_IMPORT_CONCURRENCY, items.length) },
    async () => {
      while (true) {
        if (hasFailure) return
        const index = nextIndex
        nextIndex += 1

        const item = items[index]
        if (item === undefined) {
          return
        }

        try {
          results[index] = await mapper(item, index)
        } catch (error) {
          if (!hasFailure) {
            hasFailure = true
            firstFailure = error
          }
          return
        }
      }
    },
  )

  await Promise.all(workers)
  if (hasFailure) throw firstFailure

  return results
}
