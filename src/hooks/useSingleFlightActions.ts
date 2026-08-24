import { useRef, useState } from "react"

/**
 * Tracks independent async actions by key and reuses the promise for duplicate
 * triggers of the same action while it is still running.
 */
export function useSingleFlightActions<TKey>() {
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<TKey>>(
    () => new Set(),
  )
  const inFlightActionsRef = useRef(new Map<TKey, Promise<unknown>>())

  const run = <TResult>(
    key: TKey,
    action: () => Promise<TResult>,
  ): Promise<TResult> => {
    const inFlightAction = inFlightActionsRef.current.get(key)
    if (inFlightAction) {
      return inFlightAction as Promise<TResult>
    }

    setPendingKeys((current) => new Set(current).add(key))
    let actionPromise: Promise<TResult>
    try {
      actionPromise = action()
    } catch (error) {
      actionPromise = Promise.reject(error)
    }

    const trackedPromise = actionPromise.finally(() => {
      inFlightActionsRef.current.delete(key)
      setPendingKeys((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    })
    inFlightActionsRef.current.set(key, trackedPromise)
    return trackedPromise
  }

  return {
    run,
    isPending: (key: TKey) => pendingKeys.has(key),
  }
}
