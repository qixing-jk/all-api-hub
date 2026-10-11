import { RuntimeActionIds } from "~/constants/runtimeActions"
import { DAHL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { sendTabMessageWithRetry } from "~/utils/browser/runtimeMessages"
import { queryTabs } from "~/utils/browser/tabs"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { isRecord } from "~/utils/core/object"

import { mutateDahlKeyNames, readDahlKeyNames } from "./keyNames"
import { dahlKeyNameOwner, isValidDahlKeyName } from "./keyNameValue"

/** Use an existing matching browser profile page; naming remains usable without one. */
export async function syncDahlKeyNames(
  request: ApiServiceRequest,
  keyIds: number[],
) {
  return withExtensionStorageWriteLock(
    `${STORAGE_LOCKS.DAHL_KEY_NAME_SYNC}:${dahlKeyNameOwner(request)}`,
    () => synchronize(request, keyIds),
  )
}

/** Persist first; the verified page sync can finish without keeping an editor busy. */
export function scheduleDahlKeyNameSync(
  request: ApiServiceRequest,
  keyId: number,
) {
  setTimeout(() => {
    void syncDahlKeyNames({ ...request, abortSignal: undefined }, [
      keyId,
    ]).catch((error) =>
      createLogger("DahlKeyNames").warn(
        "Name synchronization remains pending",
        error,
      ),
    )
  }, 0)
}

/** Runs one profile/account sync under its coordinator lock. */
async function synchronize(request: ApiServiceRequest, keyIds: number[]) {
  const userId = String(request.auth.userId)
  const owner = dahlKeyNameOwner(request)
  const snapshot = await readDahlKeyNames(owner)
  let response: unknown
  try {
    const tabs = await queryTabs({ url: `${DAHL_WEB_ORIGIN}/*` })
    const tab = tabs.find(
      (tab) =>
        typeof tab.id === "number" &&
        Boolean(tab.incognito) === Boolean(request.fetchContext?.incognito) &&
        (!request.fetchContext?.cookieStoreId ||
          tab.cookieStoreId === request.fetchContext.cookieStoreId),
    )
    if (typeof tab?.id !== "number")
      return { names: snapshot, connected: false }
    const tabId = tab.id
    const pendingLabels = Object.fromEntries(
      keyIds.flatMap((id) => {
        const entry = snapshot[String(id)]
        return entry?.pending ? [[String(id), entry.name]] : []
      }),
    )
    response = await runAbortableTask(
      () =>
        sendTabMessageWithRetry(
          tabId,
          {
            action: RuntimeActionIds.ContentSyncDahlKeyNames,
            expectedUserId: userId,
            keyIds,
            pendingLabels,
          },
          { maxAttempts: 1, frameId: 0 },
        ),
      { signals: [request.abortSignal], timeoutMs: 10000 },
    )
  } catch {
    return { names: snapshot, connected: false }
  }
  if (
    !isRecord(response) ||
    response.success !== true ||
    response.userId !== userId ||
    !isRecord(response.labels)
  )
    return { names: snapshot, connected: false }
  const labels = response.labels
  if (
    keyIds.some(
      (id) =>
        typeof labels[String(id)] !== "string" ||
        !isValidDahlKeyName(labels[String(id)]),
    )
  )
    return { names: snapshot, connected: false }
  const names = await mutateDahlKeyNames(owner, (names) => {
    for (const id of keyIds.map(String)) {
      // A late acknowledgement cannot erase a newer local rename.
      if (names[id]?.revision !== snapshot[id]?.revision) continue
      const name = typeof labels[id] === "string" ? labels[id].trim() : ""
      if (!name) delete names[id]
      else
        names[id] = {
          name,
          pending: false,
          revision: names[id]?.revision ?? safeRandomUUID(),
        }
    }
    return names
  })
  return { names, connected: true }
}
