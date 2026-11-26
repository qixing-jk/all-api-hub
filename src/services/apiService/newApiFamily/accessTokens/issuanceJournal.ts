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

const ISSUANCE_REVIEW_DELAY_MS = 300_000

export interface TokenIssuanceMarker {
  attempt: string
  started: number
  uncertain: boolean
  uncertainAt?: number
  proofExpiresAt?: number
}

export interface TokenIssuanceReview {
  marker: TokenIssuanceMarker
  startedAt: number
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
  return {
    pending: read,
    whileIssuing<T>(work: () => Promise<T>) {
      return withExtensionStorageWriteLock(operationLock, work, {
        requireCrossContext: true,
      })
    },
    async begin(proofExpiresAt?: number) {
      return locked(async () => {
        if (await read()) return false
        attempt = crypto.randomUUID()
        await setLocalStorage({
          [key]: {
            attempt,
            started: Date.now(),
            uncertain: false,
            ...(proofExpiresAt === undefined ? {} : { proofExpiresAt }),
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
            [key]: { ...marker, uncertain: true, uncertainAt: Date.now() },
          })
      })
    },
    async resolved() {
      await locked(async () => {
        if (attempt && (await read())?.attempt === attempt)
          await removeLocalStorage(key)
      })
    },
    async acknowledge(review: TokenIssuanceReview | undefined) {
      await navigator.locks.request(
        operationLock,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) throw new Error(CREATION_ERRORS.BUSY)
          await locked(async () => {
            const marker = await read()
            if (!marker) return
            // A timed-out request can still commit on the server. Review a fresh
            // list after the waiting window and while no local issuer holds the lock.
            const readyAt = Math.max(
              (marker.uncertainAt ?? marker.started) + ISSUANCE_REVIEW_DELAY_MS,
              marker.proofExpiresAt ?? 0,
            )
            if (
              !review ||
              marker.attempt !== review.marker.attempt ||
              marker.uncertain !== review.marker.uncertain ||
              marker.uncertainAt !== review.marker.uncertainAt ||
              review.startedAt < readyAt ||
              review.startedAt > Date.now()
            )
              throw new Error(CREATION_ERRORS.BUSY)
            await removeLocalStorage(key)
          })
        },
      )
    },
  }
}

export type TokenIssuanceJournal = ReturnType<typeof createTokenIssuanceJournal>
