import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  getSessionStorageValues,
  onStorageChanged,
  removeSessionStorageValues,
  setSessionStorageValues,
} from "~/utils/browser/storage"
import { isRecord } from "~/utils/core/object"

const UI_HANDOFF_VERSION = 1
const VALID_ID = /^[\da-f-]{36}$/i

/** Session-only, window-scoped delivery of an intent or draft to another UI. */
export function createUiHandoffChannel<T>(config: {
  draftPrefix: string
  pendingPrefix: string
  lockName: string
  ttlMs: number
  normalize: (state: unknown) => T | null
}) {
  const draftKey = (id: string) => `${config.draftPrefix}${id}`
  const pendingKey = (windowId: number) => `${config.pendingPrefix}${windowId}`
  const locked = <R>(work: () => Promise<R>) =>
    withExtensionStorageWriteLock(config.lockName, work)
  const read = async (key: string): Promise<unknown> =>
    (await getSessionStorageValues(key))[key]

  const getPending = async (windowId: number): Promise<string | null> => {
    const id = await read(pendingKey(windowId))
    return typeof id === "string" && VALID_ID.test(id) ? id : null
  }
  const clearPending = async (id: string, windowId: number) => {
    const key = pendingKey(windowId)
    if ((await read(key)) === id) await removeSessionStorageValues(key)
  }
  const normalizeEnvelope = (
    envelope: unknown,
  ): { windowId: number; state: T } | null => {
    if (
      !isRecord(envelope) ||
      envelope.version !== UI_HANDOFF_VERSION ||
      typeof envelope.windowId !== "number" ||
      !Number.isInteger(envelope.windowId) ||
      typeof envelope.createdAt !== "number"
    )
      return null
    const age = Date.now() - envelope.createdAt
    if (!(age >= 0 && age <= config.ttlMs)) return null
    const state = config.normalize(envelope.state)
    return state === null ? null : { windowId: envelope.windowId, state }
  }

  return {
    /** Stages validated data before navigation; an existing ID updates its draft. */
    async prepare(
      state: T,
      windowId: number,
      previousId?: string,
    ): Promise<string> {
      const normalized = config.normalize(state)
      if (normalized === null || !Number.isInteger(windowId))
        throw new Error("Invalid UI handoff")
      const id = previousId ?? crypto.randomUUID()
      if (!VALID_ID.test(id)) throw new Error("Invalid UI handoff ID")
      await locked(async () => {
        if (
          !(await setSessionStorageValues({
            [draftKey(id)]: {
              version: UI_HANDOFF_VERSION,
              createdAt: Date.now(),
              windowId,
              state: normalized,
            },
          }))
        ) {
          throw new Error("UI handoff session storage unavailable")
        }
      })
      return id
    },
    /** Publishes without replacing an unclaimed request belonging to this window. */
    publish(id: string, windowId: number): Promise<boolean> {
      return locked(async () => {
        const pending = await getPending(windowId)
        if (pending && pending !== id) {
          if (normalizeEnvelope(await read(draftKey(pending))) !== null)
            return false
          await removeSessionStorageValues(draftKey(pending))
          await clearPending(pending, windowId)
        }
        if (!(await setSessionStorageValues({ [pendingKey(windowId)]: id })))
          throw new Error("UI handoff unavailable")
        return true
      })
    },
    getPending,
    watchPending(windowId: number, onPending: () => void): () => void {
      return onStorageChanged((changes, area) => {
        if (area === "session" && changes[pendingKey(windowId)]?.newValue)
          onPending()
      })
    },
    /** Accept first, then remove under one lock. Busy or stale receivers retain data. */
    receive(
      id: string,
      accept: (state: T) => boolean,
      expectedWindowId?: number,
    ): Promise<boolean> {
      if (!VALID_ID.test(id)) return Promise.resolve(false)
      return locked(async () => {
        const key = draftKey(id)
        const envelope = normalizeEnvelope(await read(key))
        if (envelope === null) {
          await removeSessionStorageValues(key)
          if (expectedWindowId !== undefined)
            await clearPending(id, expectedWindowId)
          return false
        }
        const { windowId, state } = envelope
        if (
          expectedWindowId !== undefined &&
          (windowId !== expectedWindowId ||
            (await getPending(expectedWindowId)) !== id)
        )
          return false
        if (!accept(state)) return false
        await removeSessionStorageValues(key)
        await clearPending(id, windowId)
        return true
      })
    },
    /** Removes a failed sidebar signal; false means a receiver already took the draft. */
    retract(id: string, windowId: number): Promise<boolean> {
      return locked(async () => {
        await clearPending(id, windowId)
        return Boolean(await read(draftKey(id)))
      })
    },
    async discard(id: string): Promise<void> {
      if (VALID_ID.test(id))
        await locked(() => removeSessionStorageValues(draftKey(id)))
    },
  }
}

export type UiHandoffChannel<T> = ReturnType<typeof createUiHandoffChannel<T>>
