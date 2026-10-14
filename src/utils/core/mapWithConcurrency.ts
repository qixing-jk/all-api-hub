/** Maps reads with bounded rolling workers; failures stop dispatch and drain active work. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  options: { signal?: AbortSignal } = {},
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new RangeError("Concurrency must be a positive integer")
  options.signal?.throwIfAborted()
  const results = new Array<R>(items.length)
  let next = 0
  let failed = false
  let failure: unknown
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (!failed && !options.signal?.aborted && next < items.length) {
        const index = next++
        try {
          results[index] = await mapper(items[index]!, index)
        } catch (error) {
          if (!failed) {
            failed = true
            failure = error
          }
          return
        }
      }
    }),
  )
  options.signal?.throwIfAborted()
  if (failed) throw failure
  return results
}

/** Keeps the names and result types of independent reads while sharing worker admission. */
export async function readObjectWithConcurrency<
  T extends Record<string, () => Promise<unknown>>,
>(
  reads: T,
  concurrency: number,
  options: { signal?: AbortSignal } = {},
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const entries = await mapWithConcurrency(
    Object.entries(reads),
    concurrency,
    async ([key, read]) => [key, await read()] as const,
    options,
  )
  // Each admitted own entry returns exactly its input key and awaited result.
  return Object.fromEntries(entries) as {
    [K in keyof T]: Awaited<ReturnType<T[K]>>
  }
}
