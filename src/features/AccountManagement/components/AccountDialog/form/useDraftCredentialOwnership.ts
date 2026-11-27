import { useCallback, useEffect, useLayoutEffect, useRef } from "react"

interface OwnedCredential {
  snapshotKey: string
  discard: () => Promise<void>
  pendingPersists: number
  abandoned: boolean
  discarded: boolean
  persisted: boolean
}

export interface DraftCredentialPersistenceLease {
  settle(success: boolean): Promise<void>
}

export const UNOWNED_DRAFT_CREDENTIAL_LEASE: DraftCredentialPersistenceLease = {
  async settle() {},
}

/** Keeps a newly issued draft credential alive until all admitted saves settle. */
export function useDraftCredentialOwnership({
  isOpen,
  snapshotKey,
  invalidSnapshot,
  onCleanupError,
}: {
  isOpen: boolean
  snapshotKey: string
  invalidSnapshot: () => Error
  onCleanupError: () => void
}) {
  const ownedRef = useRef<OwnedCredential | null>(null)
  const abandonedKeys = useRef(new Set<string>())
  const current = useRef({
    isOpen,
    snapshotKey,
    invalidSnapshot,
    onCleanupError,
  })
  useLayoutEffect(() => {
    current.current = { isOpen, snapshotKey, invalidSnapshot, onCleanupError }
  })
  const discardOwned = useCallback(async (owned: OwnedCredential) => {
    if (owned.persisted) return
    owned.abandoned = true
    abandonedKeys.current.add(owned.snapshotKey)
    if (owned.pendingPersists || owned.discarded) return
    // Retain this snapshot so a delayed save cannot persist a revoked credential.
    owned.discarded = true
    try {
      await owned.discard()
    } catch {
      current.current.onCleanupError()
    }
  }, [])
  const discard = useCallback(async () => {
    if (ownedRef.current) await discardOwned(ownedRef.current)
  }, [discardOwned])
  const adopt = useCallback((key: string, cleanup: () => Promise<void>) => {
    ownedRef.current = {
      snapshotKey: key,
      discard: cleanup,
      pendingPersists: 0,
      abandoned: false,
      discarded: false,
      persisted: false,
    }
  }, [])
  const beginPersistence = useCallback(
    (key: string): DraftCredentialPersistenceLease => {
      if (
        !current.current.isOpen ||
        key !== current.current.snapshotKey ||
        abandonedKeys.current.has(key)
      )
        throw current.current.invalidSnapshot()
      const owned = ownedRef.current
      if (!owned || owned.snapshotKey !== key)
        return UNOWNED_DRAFT_CREDENTIAL_LEASE
      if (owned.abandoned) throw current.current.invalidSnapshot()
      owned.pendingPersists += 1
      let settled = false
      return {
        async settle(success: boolean) {
          if (settled) return
          settled = true
          owned.pendingPersists -= 1
          if (success) {
            owned.persisted = true
            abandonedKeys.current.delete(owned.snapshotKey)
            if (ownedRef.current === owned) ownedRef.current = null
          } else if (owned.abandoned) await discardOwned(owned)
        },
      }
    },
    [discardOwned],
  )
  useLayoutEffect(() => {
    if (
      ownedRef.current &&
      (!isOpen || snapshotKey !== ownedRef.current.snapshotKey)
    )
      void discard()
  }, [isOpen, snapshotKey, discard])
  useEffect(
    () => () => {
      void discard()
    },
    [discard],
  )
  return { adopt, discard, beginPersistence }
}
