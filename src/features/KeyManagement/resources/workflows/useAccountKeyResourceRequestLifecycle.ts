import { useCallback, useRef, useState } from "react"

import type { ACCOUNT_KEY_RESOURCE_REQUEST_SLOTS } from "~/features/KeyManagement/constants"
import type {
  ActiveResourceBoundary,
  InFlightBoundaryMutation,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceControllerTypes"
import {
  boundariesMatch,
  boundaryIdentity,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceWorkflowSupport"

type RequestSlot =
  (typeof ACCOUNT_KEY_RESOURCE_REQUEST_SLOTS)[keyof typeof ACCOUNT_KEY_RESOURCE_REQUEST_SLOTS]

/** Shared request ownership; releasing an old request cannot release its replacement. */
function createRequestLifecycle() {
  let generation = 0
  let inventoryLoading = false
  const controllers = new Map<RequestSlot, AbortController>()
  const mutations = new Map<string, InFlightBoundaryMutation>()

  return {
    version: () => generation,
    advance: () => ++generation,
    isInventoryLoading: () => inventoryLoading,
    setInventoryLoading: (next: boolean) => {
      inventoryLoading = next
    },
    cancel: (slot: RequestSlot) => controllers.get(slot)?.abort(),
    assign: (slot: RequestSlot, controller: AbortController) => {
      controllers.set(slot, controller)
    },
    owns: (slot: RequestSlot, controller: AbortController) =>
      controllers.get(slot) === controller,
    release: (slot: RequestSlot, controller?: AbortController) => {
      if (!controller || controllers.get(slot) === controller)
        controllers.delete(slot)
    },
    getMutation: (identity: string) => mutations.get(identity),
    registerMutation: (
      identity: string,
      mutation: InFlightBoundaryMutation,
    ) => {
      mutations.set(identity, mutation)
    },
    releaseMutation: (identity: string, promise: Promise<unknown>) => {
      if (mutations.get(identity)?.promise === promise)
        mutations.delete(identity)
    },
    dispose: () => {
      generation += 1
      controllers.forEach((controller) => controller.abort())
      controllers.clear()
      mutations.forEach(({ controller }) => controller.abort())
      mutations.clear()
    },
  }
}

export type AccountKeyResourceRequestLifecycle = ReturnType<
  typeof createRequestLifecycle
>

/** Uncertain mutations keep their native collection locked until a fresh read succeeds. */
export function useAccountKeyResourceRequestLifecycle() {
  const [requests] = useState(createRequestLifecycle)
  const [locks, setLocks] = useState<Record<string, ActiveResourceBoundary>>({})
  const locksRef = useRef(locks)
  locksRef.current = locks
  const requireFreshRead = useCallback((boundary: ActiveResourceBoundary) => {
    setLocks((current) => ({
      ...current,
      [boundaryIdentity(boundary)]: boundary,
    }))
  }, [])
  const acceptFreshRead = useCallback((boundary: ActiveResourceBoundary) => {
    const identity = boundaryIdentity(boundary)
    setLocks((current) => {
      if (!(identity in current)) return current
      const next = { ...current }
      delete next[identity]
      return next
    })
  }, [])
  const isFreshReadRequiredForBoundary = useCallback(
    (boundary: ActiveResourceBoundary) =>
      Object.values(locksRef.current).some((locked) =>
        boundariesMatch(locked, boundary),
      ),
    [],
  )
  return {
    requests,
    requireFreshRead,
    acceptFreshRead,
    isFreshReadRequiredForBoundary,
  }
}
