import { buildAccountKeyResourceRuntimeKeyId } from "~/services/accounts/accountRuntimeKeys"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import { isAccountKeyResourceRef } from "~/services/apiAdapters/accountKeyResources/ref"
import type { AccountKeyResourceRef } from "~/services/apiAdapters/contracts/accountKeyResource"
import { ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  getSessionStorageValues,
  setSessionStorageValues,
} from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"

const CACHE_VERSION = 1 as const
const CACHE_ENTRY_LIMIT = 500
const logger = createLogger("RepairCreatedRuntimeSecrets")

interface RepairCreatedRuntimeSecretEntry {
  ref: AccountKeyResourceRef
  secret: string
}

interface RepairCreatedRuntimeSecretCache {
  version: typeof CACHE_VERSION
  jobId: string
  entries: RepairCreatedRuntimeSecretEntry[]
}

const storageKey =
  ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_CREATED_RUNTIME_SECRETS

// Chrome documents storage.session as memory-only and cleared on browser exit.
// https://developer.chrome.com/docs/extensions/reference/api/storage#storage-areas

const isNonBlankJobId = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 512

const isCacheEntry = (
  value: unknown,
): value is RepairCreatedRuntimeSecretEntry =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  isAccountKeyResourceRef((value as RepairCreatedRuntimeSecretEntry).ref) &&
  typeof (value as RepairCreatedRuntimeSecretEntry).secret === "string" &&
  hasUsableApiTokenKey((value as RepairCreatedRuntimeSecretEntry).secret)

const parseCache = (value: unknown): RepairCreatedRuntimeSecretCache | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }
  const candidate = value as Partial<RepairCreatedRuntimeSecretCache>
  if (
    candidate.version !== CACHE_VERSION ||
    !isNonBlankJobId(candidate.jobId) ||
    !Array.isArray(candidate.entries) ||
    candidate.entries.length > CACHE_ENTRY_LIMIT ||
    !candidate.entries.every(isCacheEntry)
  ) {
    return null
  }
  const entriesByRef = new Map<string, RepairCreatedRuntimeSecretEntry>()
  for (const entry of candidate.entries) {
    const key = buildAccountKeyResourceRuntimeKeyId(entry.ref)
    if (entriesByRef.has(key)) return null
    entriesByRef.set(key, entry)
  }
  return {
    version: CACHE_VERSION,
    jobId: candidate.jobId,
    entries: Array.from(entriesByRef.values()),
  }
}

const readCache = async (): Promise<RepairCreatedRuntimeSecretCache | null> => {
  try {
    const values = await getSessionStorageValues(storageKey)
    return parseCache(values[storageKey])
  } catch {
    return null
  }
}

const writeCache = async (cache: RepairCreatedRuntimeSecretCache) => {
  try {
    return await setSessionStorageValues({ [storageKey]: cache })
  } catch (error) {
    logger.warn("Failed to write repair-created runtime secret cache", error)
    return false
  }
}

let updateQueue: Promise<void> = Promise.resolve()

const enqueueUpdate = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = updateQueue.then(operation)
  updateQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

/** Replaces any previous browser-session cache when a new repair job starts. */
export const resetRepairCreatedRuntimeSecrets = (jobId: string) =>
  enqueueUpdate(async () => {
    if (!isNonBlankJobId(jobId)) {
      logger.warn("Failed to reset repair-created runtime secret cache")
      return false
    }
    const reset = await writeCache({
      version: CACHE_VERSION,
      jobId,
      entries: [],
    })
    if (!reset) {
      logger.warn("Failed to reset repair-created runtime secret cache")
    }
    return reset
  })

/** Captures exact create-response-only secrets without writing them to local progress. */
export const captureRepairCreatedRuntimeSecrets = (
  jobId: string,
  entries: readonly RepairCreatedRuntimeSecretEntry[],
) =>
  enqueueUpdate(async () => {
    if (
      !isNonBlankJobId(jobId) ||
      entries.length > CACHE_ENTRY_LIMIT ||
      !entries.every(isCacheEntry)
    ) {
      return false
    }
    if (entries.length === 0) return true

    const current = await readCache()
    const entriesByRef = new Map<string, RepairCreatedRuntimeSecretEntry>()
    if (current?.jobId === jobId) {
      for (const entry of current.entries) {
        entriesByRef.set(buildAccountKeyResourceRuntimeKeyId(entry.ref), entry)
      }
    }
    for (const entry of entries) {
      const refId = buildAccountKeyResourceRuntimeKeyId(entry.ref)
      const existing = entriesByRef.get(refId)
      if (existing) {
        if (existing.secret !== entry.secret) return false
        continue
      }
      entriesByRef.set(refId, entry)
    }

    const mergedEntries = Array.from(entriesByRef.values())
    if (mergedEntries.length > CACHE_ENTRY_LIMIT) return false
    return writeCache({
      version: CACHE_VERSION,
      jobId,
      entries: mergedEntries,
    })
  })

/** Removes terminally imported refs while preserving failed/uncertain retry inputs. */
export const discardRepairCreatedRuntimeSecrets = (
  jobId: string,
  refs: readonly AccountKeyResourceRef[],
) =>
  enqueueUpdate(async () => {
    if (
      !isNonBlankJobId(jobId) ||
      refs.length > CACHE_ENTRY_LIMIT ||
      !refs.every(isAccountKeyResourceRef)
    ) {
      return false
    }
    if (refs.length === 0) return true

    const current = await readCache()
    if (current?.jobId !== jobId) return false
    const discardedRefIds = new Set(
      refs.map(buildAccountKeyResourceRuntimeKeyId),
    )
    return writeCache({
      ...current,
      entries: current.entries.filter(
        (entry) =>
          !discardedRefIds.has(buildAccountKeyResourceRuntimeKeyId(entry.ref)),
      ),
    })
  })

/** Resolves only an exact ref from the current browser-session repair cache. */
export const resolveRepairCreatedRuntimeSecret = async (
  jobId: string,
  ref: AccountKeyResourceRef,
): Promise<string | null> => {
  if (!isNonBlankJobId(jobId) || !isAccountKeyResourceRef(ref)) return null
  const cache = await readCache()
  if (cache?.jobId !== jobId) return null
  const refId = buildAccountKeyResourceRuntimeKeyId(ref)
  return (
    cache.entries.find(
      (entry) => buildAccountKeyResourceRuntimeKeyId(entry.ref) === refId,
    )?.secret ?? null
  )
}
