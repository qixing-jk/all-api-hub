import { Storage } from "@plasmohq/storage"

import { AIMLAPI_ONBOARDING_ERRORS as errors } from "~/services/apiService/aimlapi/constants"
import {
  AIMLAPI_ONBOARDING_STORAGE_KEY,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"

export const AIMLAPI_CONNECTION_KEY_KINDS = {
  Management: "management",
  Regular: "regular",
} as const
const CREDENTIAL_STATES = { Pending: "pending", Ready: "ready" } as const
type ConnectionKeyKind =
  (typeof AIMLAPI_CONNECTION_KEY_KINDS)[keyof typeof AIMLAPI_CONNECTION_KEY_KINDS]
type Credential =
  | { state: typeof CREDENTIAL_STATES.Pending }
  | {
      state: typeof CREDENTIAL_STATES.Ready
      key: string
      id: string
      prefix: string
    }
type Ledger = Record<string, Partial<Record<ConnectionKeyKind, Credential>>>
const storage = new Storage({ area: "local" })

/** Forget a proven invalid secret without discarding uncertain issuance. */
export async function forgetInvalidAimlApiConnectionKey(
  kind: ConnectionKeyKind,
  key: string,
): Promise<void> {
  await forgetReadyCredentials(
    (_userId, entryKind, entryKey) => entryKind === kind && entryKey === key,
  )
}

/** Pending markers survive deletion so an uncertain remote write cannot be replayed. */
export async function forgetDeletedAimlApiAccountCredentials(
  userId: string,
): Promise<void> {
  await forgetReadyCredentials((entryUserId) => entryUserId === userId)
}

/** Remove matching confirmed secrets in one ledger transaction. */
async function forgetReadyCredentials(
  matches: (userId: string, kind: ConnectionKeyKind, key: string) => boolean,
): Promise<void> {
  await withExtensionStorageWriteLock(
    STORAGE_LOCKS.AIMLAPI_ONBOARDING,
    async () => {
      const ledger = await storage.get<Ledger>(AIMLAPI_ONBOARDING_STORAGE_KEY)
      if (!ledger) return
      let changed = false
      for (const [userId, credentials] of Object.entries(ledger)) {
        for (const kind of Object.values(AIMLAPI_CONNECTION_KEY_KINDS)) {
          const entry = credentials[kind]
          if (
            entry?.state !== CREDENTIAL_STATES.Ready ||
            !matches(userId, kind, entry.key)
          )
            continue
          delete credentials[kind]
          changed = true
        }
        if (!Object.keys(credentials).length) delete ledger[userId]
      }
      if (changed) await storage.set(AIMLAPI_ONBOARDING_STORAGE_KEY, ledger)
    },
  )
}
/** Records dispatch before issuance; an uncertain result must never mint another key. */
export async function obtainAimlApiConnectionKey(
  userId: string,
  kind: ConnectionKeyKind,
  create: () => Promise<{ key: string; id: string; prefix: string }>,
) {
  const existing = await withExtensionStorageWriteLock(
    STORAGE_LOCKS.AIMLAPI_ONBOARDING,
    async () => {
      const ledger =
        (await storage.get<Ledger>(AIMLAPI_ONBOARDING_STORAGE_KEY)) || {}
      const entry = ledger[userId]?.[kind]
      if (entry) return entry
      ledger[userId] = {
        ...ledger[userId],
        [kind]: { state: CREDENTIAL_STATES.Pending },
      }
      await storage.set(AIMLAPI_ONBOARDING_STORAGE_KEY, ledger)
      return undefined
    },
  )
  if (existing?.state === CREDENTIAL_STATES.Ready) return existing
  if (existing) throw new Error(errors.IssuanceUnconfirmed)
  const created = await create()
  await withExtensionStorageWriteLock(
    STORAGE_LOCKS.AIMLAPI_ONBOARDING,
    async () => {
      const ledger = await storage.get<Ledger>(AIMLAPI_ONBOARDING_STORAGE_KEY)
      if (!ledger) throw new Error(errors.IssuanceUnconfirmed)
      ledger[userId] = {
        ...ledger[userId],
        [kind]: { state: CREDENTIAL_STATES.Ready, ...created },
      }
      await storage.set(AIMLAPI_ONBOARDING_STORAGE_KEY, ledger)
    },
  )
  return created
}
