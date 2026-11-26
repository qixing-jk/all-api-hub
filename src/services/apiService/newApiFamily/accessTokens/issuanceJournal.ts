import {
  NEW_API_TOKEN_ISSUANCE_KEY_PREFIX,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  getLocalStorageValues,
  removeLocalStorage,
  setLocalStorage,
} from "~/utils/browser/storage"

import { NEW_API_TOKEN_CREATION_ERRORS as CREATION_ERRORS } from "./protocol"

const ACTIVE_ISSUANCE_AGE_MS = 300_000

interface TokenIssuanceMarker {
  attempt: string
  started: number
  uncertain: boolean
}

/** Store no credentials, proofs, passwords, or returned token plaintext. */
export function createTokenIssuanceJournal(origin: string, userId: string) {
  const key = `${NEW_API_TOKEN_ISSUANCE_KEY_PREFIX}${encodeURIComponent(origin)}:${encodeURIComponent(userId)}`
  const attempt = crypto.randomUUID()
  const locked = <T>(work: () => Promise<T>) =>
    withExtensionStorageWriteLock(STORAGE_LOCKS.NEW_API_TOKEN_ISSUANCE, work, {
      requireCrossContext: true,
    })
  const read = async () =>
    (await getLocalStorageValues(key))[key] as TokenIssuanceMarker | undefined
  return {
    async pending() {
      return Boolean(await read())
    },
    async begin() {
      return locked(async () => {
        if (await read()) return false
        await setLocalStorage({
          [key]: { attempt, started: Date.now(), uncertain: false },
        })
        return true
      })
    },
    async uncertain() {
      await locked(async () => {
        const marker = await read()
        if (marker?.attempt === attempt)
          await setLocalStorage({
            [key]: { ...marker, uncertain: true },
          })
      })
    },
    async resolved() {
      await locked(async () => {
        if ((await read())?.attempt === attempt) await removeLocalStorage(key)
      })
    },
    async acknowledge() {
      await locked(async () => {
        const marker = await read()
        if (
          marker &&
          !marker.uncertain &&
          Date.now() - marker.started < ACTIVE_ISSUANCE_AGE_MS
        )
          throw new Error(CREATION_ERRORS.BUSY)
        await removeLocalStorage(key)
      })
    },
  }
}

export type TokenIssuanceJournal = ReturnType<typeof createTokenIssuanceJournal>
