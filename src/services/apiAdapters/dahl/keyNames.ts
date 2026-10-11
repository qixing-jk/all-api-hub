import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { safeRandomUUID } from "~/utils/core/identifier"
import { isRecord } from "~/utils/core/object"

import { isValidDahlKeyName } from "./keyNameValue"

export type DahlKeyName = { name: string; pending: boolean; revision: string }
type NameStore = Record<string, Record<string, DahlKeyName>>
const storage = new Storage({ area: "local" })

/** Reject failed or malformed reads before any local metadata write. */
async function readStore(): Promise<NameStore> {
  const value = await storage.get<unknown>(STORAGE_KEYS.DAHL_KEY_NAMES)
  if (value === undefined) return {}
  if (
    !isRecord(value) ||
    Object.values(value).some(
      (names) =>
        !isRecord(names) ||
        Object.values(names).some(
          (entry) =>
            !isRecord(entry) ||
            typeof entry.name !== "string" ||
            !isValidDahlKeyName(entry.name) ||
            typeof entry.pending !== "boolean" ||
            typeof entry.revision !== "string",
        ),
    )
  )
    throw new Error("Invalid Dahl key name storage")
  return value as NameStore
}

/** Names are scoped to the verified Dahl UUID and browser profile, independently of account titles. */
export async function readDahlKeyNames(owner: string) {
  return (await readStore())[owner] ?? {}
}

/** One mutation owns each read-modify-write, including later sync acknowledgements. */
export async function mutateDahlKeyNames<T>(
  owner: string,
  mutate: (names: Record<string, DahlKeyName>) => T,
): Promise<T> {
  return withExtensionStorageWriteLock(
    STORAGE_LOCKS.DAHL_KEY_NAMES,
    async () => {
      const store = await readStore()
      const names = { ...(store[owner] ?? {}) }
      const before = JSON.stringify(names)
      const result = mutate(names)
      if (Object.keys(names).length) store[owner] = names
      else delete store[owner]
      if (JSON.stringify(names) !== before)
        await storage.set(STORAGE_KEYS.DAHL_KEY_NAMES, store)
      return result
    },
  )
}

/** Persist a rename and mark its revision for later website synchronization. */
export async function saveDahlKeyName(
  owner: string,
  keyId: number,
  name: string,
) {
  if (!isValidDahlKeyName(name)) throw new Error("Invalid Dahl key name")
  return mutateDahlKeyNames(owner, (names) => {
    const entry = {
      name: name.trim(),
      pending: true,
      revision: safeRandomUUID(),
    }
    names[String(keyId)] = entry
    return entry
  })
}

/** Forget the local metadata after its deletion has reached the website. */
export async function removeDahlKeyName(owner: string, keyId: string) {
  return mutateDahlKeyNames(owner, (names) => {
    delete names[keyId]
  })
}
