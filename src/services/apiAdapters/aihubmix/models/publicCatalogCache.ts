const PUBLIC_CATALOG_TTL_MS = 10 * 60 * 1000

/**
 * Reuses anonymous provider data across accounts in one extension page/runtime.
 * This is a disposable optimization; account pricing retains its existing
 * persistent cache. No timers or service-worker keepalive are needed.
 */
export function createAIHubMixPublicCatalogCache<T>(load: () => Promise<T>) {
  let cached: { value: T; expiresAt: number } | undefined
  let pending: Promise<T> | undefined

  return {
    get(): Promise<T> {
      if (cached && Date.now() < cached.expiresAt)
        return Promise.resolve(cached.value)
      if (pending) return pending
      const task: Promise<T> = Promise.resolve()
        .then(load)
        .then((value) => {
          // A refresh may have started a replacement while this request ran.
          if (pending === task)
            cached = { value, expiresAt: Date.now() + PUBLIC_CATALOG_TTL_MS }
          return value
        })
        .finally(() => {
          if (pending === task) pending = undefined
        })
      pending = task
      return task
    },
    invalidate() {
      cached = undefined
      pending = undefined
    },
  }
}
