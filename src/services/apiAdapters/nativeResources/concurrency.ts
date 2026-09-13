import PQueue from "p-queue"

/** Maps every item with bounded concurrency and preserves original input order. */
export async function mapSettledWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  limit: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
  if (items.length === 0) return []
  const queue = new PQueue({
    concurrency: Math.min(items.length, Math.max(1, Math.floor(limit))),
  })
  return await Promise.allSettled(
    items.map((item, index) => queue.add(() => mapper(item, index))),
  )
}
