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
