/**
 * Cache successful and in-flight locale loads while allowing failed loads to
 * be retried.
 */
export function createCachedLocaleLoader<Key, Value>(
  load: (key: Key) => Promise<Value>,
) {
  const cache = new Map<Key, Promise<Value>>()

  return (key: Key): Promise<Value> => {
    const cachedLoad = cache.get(key)
    if (cachedLoad) return cachedLoad

    const pendingLoad = load(key).catch((error) => {
      cache.delete(key)
      throw error
    })
    cache.set(key, pendingLoad)
    return pendingLoad
  }
}
