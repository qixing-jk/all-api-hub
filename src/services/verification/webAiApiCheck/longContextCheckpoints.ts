import { Storage } from "@plasmohq/storage"

import { STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { CONTEXT_CHECKPOINT_LIMIT_ERROR_NAME } from "~/services/verification/modelQuality/contextCapacityConstants"

import {
  LONG_CONTEXT_ERROR_NAMES,
  MAX_LONG_CONTEXT_CHECKPOINTS,
} from "./longContextConstants"

/** Shared bounded storage for long requests whose outcome can outlive the worker. */
export function createLongContextCheckpoints<T>(
  key: string,
  sanitize: (value: T) => T,
) {
  const storage = new Storage({ area: "local" })
  const active = new Set<string>()
  const readAll = async () => (await storage.get<Record<string, T>>(key)) ?? {}
  return {
    claim(scope: string) {
      if (active.has(scope))
        throw Object.assign(
          new Error("This connection already has a context test running"),
          { name: LONG_CONTEXT_ERROR_NAMES.Busy },
        )
      active.add(scope)
      return () => {
        active.delete(scope)
      }
    },
    async get(scope: string) {
      return (await readAll())[scope]
    },
    async update(scope: string, value?: T) {
      return withExtensionStorageWriteLock(
        STORAGE_LOCKS.WEB_AI_API_CHECK,
        async () => {
          const entries = await readAll()
          if (value !== undefined) {
            if (
              !entries[scope] &&
              Object.keys(entries).length >= MAX_LONG_CONTEXT_CHECKPOINTS
            )
              throw Object.assign(
                new Error("Too many interrupted context tests"),
                { name: CONTEXT_CHECKPOINT_LIMIT_ERROR_NAME },
              )
            entries[scope] = sanitize(value)
          } else delete entries[scope]
          await storage.set(key, entries)
        },
      )
    },
    async discardInactive() {
      return withExtensionStorageWriteLock(
        STORAGE_LOCKS.WEB_AI_API_CHECK,
        async () => {
          const entries = await readAll()
          const retained = Object.fromEntries(
            Object.entries(entries).filter(([scope]) => active.has(scope)),
          )
          const discarded =
            Object.keys(entries).length - Object.keys(retained).length
          if (discarded) await storage.set(key, retained)
          return discarded
        },
      )
    },
  }
}
