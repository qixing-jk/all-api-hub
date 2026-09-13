import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react"

/** Serialize immediate field saves and let actions wait for pending writes. */
function useSaveQueue() {
  const tail = useRef<Promise<void>>(Promise.resolve())
  const failures = useRef(
    new Map<string, { save: () => Promise<void>; error: unknown }>(),
  )
  const pendingKeys = useRef(new Map<string, number>())
  const [pending, setPending] = useState(0)

  const enqueue = useCallback((save: () => Promise<void>, key: string) => {
    pendingKeys.current.set(key, (pendingKeys.current.get(key) ?? 0) + 1)
    setPending((count) => count + 1)
    const operation = tail.current
      .catch(() => {})
      .then(async () => {
        try {
          await save()
          failures.current.delete(key)
        } catch (error) {
          failures.current.set(key, { save, error })
          throw error
        }
      })
    tail.current = operation
    void operation
      .finally(() => {
        pendingKeys.current.set(key, (pendingKeys.current.get(key) ?? 1) - 1)
        setPending((count) => count - 1)
      })
      .catch(() => {})
    return operation
  }, [])

  const flush = useCallback(async () => {
    await tail.current
    const failure = failures.current.values().next().value
    if (failure) throw failure.error
  }, [])
  const retry = useCallback(async () => {
    await tail.current.catch(() => {})
    for (const [key, failure] of failures.current) {
      await enqueue(failure.save, key)
    }
  }, [enqueue])
  const needsSave = useCallback(
    (key: string) =>
      failures.current.has(key) || (pendingKeys.current.get(key) ?? 0) > 0,
    [],
  )
  return {
    enqueue,
    flush,
    retry,
    needsSave,
    saving: pending > 0,
    failedKeys: [...failures.current.keys()],
  }
}

const SaveQueueContext = createContext<ReturnType<typeof useSaveQueue> | null>(
  null,
)

/** Keep writes from both cloud settings cards in the same action order. */
export function CloudSyncSaveProvider({ children }: { children: ReactNode }) {
  const queue = useSaveQueue()
  return (
    <SaveQueueContext.Provider value={queue}>
      {children}
    </SaveQueueContext.Provider>
  )
}

/** Standalone settings cards get their own queue, composed cards share one. */
export function useCloudSyncSaveQueue() {
  const shared = useContext(SaveQueueContext)
  const local = useSaveQueue()
  return shared ?? local
}
