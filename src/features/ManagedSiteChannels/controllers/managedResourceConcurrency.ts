/**
 * Maps every item with a bounded worker pool and returns settled outcomes in
 * the original input order.
 */
export async function mapSettledWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  limit: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
  const results = new Array<PromiseSettledResult<TResult>>(items.length)
  let nextIndex = 0

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1

      try {
        results[index] = {
          status: "fulfilled",
          value: await mapper(items[index], index),
        }
      } catch (reason) {
        results[index] = { status: "rejected", reason }
      }
    }
  }

  const workerCount = Math.min(items.length, Math.max(1, Math.floor(limit)))
  await Promise.all(Array.from({ length: workerCount }, runWorker))
  return results
}
