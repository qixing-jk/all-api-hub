/**
 * Process items sequentially per key while allowing different keys to run concurrently.
 *
 * This is used to apply per-site-origin rate limiting for bulk operations:
 * - Items with the same key are processed one at a time (no overlap).
 * - Items with different keys are not globally serialized.
 */
export async function runPerKeySequential<T>(params: {
  items: T[]
  getKey: (item: T) => string
  worker: (item: T) => Promise<void>
}): Promise<void> {
  const { items, getKey, worker } = params

  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = getKey(item)
    const group = groups.get(key)
    if (group) {
      group.push(item)
    } else {
      groups.set(key, [item])
    }
  }

  await Promise.all(
    Array.from(groups.values()).map(async (group) => {
      for (const item of group) {
        await worker(item)
      }
    }),
  )
}
