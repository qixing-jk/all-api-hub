import {
  NEW_API_TOKEN_ISSUANCE_KEY_PREFIX,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import {
  CrossContextStorageLockUnavailableError,
  withExtensionStorageWriteLock,
} from "~/services/core/storageWriteLock"
import {
  getLocalStorageValues,
  removeLocalStorage,
  setLocalStorage,
} from "~/utils/browser/storage"

import { NEW_API_TOKEN_CREATION_ERRORS as CREATION_ERRORS } from "./protocol"

export interface TokenIssuanceMarker {
  attempt: string
  started: number
  uncertain: boolean
}

/** Store no credentials, proofs, passwords, or returned token plaintext. */
export function createTokenIssuanceJournal(origin: string, userId: string) {
  const key = `${NEW_API_TOKEN_ISSUANCE_KEY_PREFIX}${encodeURIComponent(origin)}:${encodeURIComponent(userId)}`
  const operationLock = `${STORAGE_LOCKS.NEW_API_TOKEN_ISSUANCE}:${key}`
  let attempt: string | undefined
  const locked = <T>(work: () => Promise<T>) =>
    withExtensionStorageWriteLock(STORAGE_LOCKS.NEW_API_TOKEN_ISSUANCE, work, {
      requireCrossContext: true,
    })
  const read = async () =>
    (await getLocalStorageValues(key))[key] as TokenIssuanceMarker | undefined
  const withOperationLock = async <T>(work: () => Promise<T>): Promise<T> => {
    const locks = globalThis.navigator?.locks
    if (typeof locks?.request !== "function")
      throw new CrossContextStorageLockUnavailableError()
    return locks.request(operationLock, { ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error(CREATION_ERRORS.BUSY)
      return await work()
    })
  }
  return {
    pending: read,
    whileIssuing: withOperationLock,
    async begin() {
      return locked(async () => {
        if (await read()) return false
        attempt = crypto.randomUUID()
        await setLocalStorage({
          [key]: {
            attempt,
            started: Date.now(),
            uncertain: false,
          },
        })
        return true
      })
    },
    async uncertain() {
      await locked(async () => {
        const marker = await read()
        if (marker && marker.attempt === attempt)
          await setLocalStorage({
            [key]: { ...marker, uncertain: true },
          })
      })
    },
    async resolved() {
      await locked(async () => {
        if (attempt && (await read())?.attempt === attempt)
          await removeLocalStorage(key)
      })
    },
    async acknowledge(review: TokenIssuanceMarker | undefined) {
      await withOperationLock(() =>
        locked(async () => {
          const marker = await read()
          if (!marker) return
          if (
            !review ||
            marker.attempt !== review.attempt ||
            marker.uncertain !== review.uncertain
          )
            throw new Error(CREATION_ERRORS.BUSY)
          await removeLocalStorage(key)
        }),
      )
    },
  }
}

export type TokenIssuanceJournal = ReturnType<typeof createTokenIssuanceJournal>
