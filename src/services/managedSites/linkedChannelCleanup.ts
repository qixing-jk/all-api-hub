import { Storage } from "@plasmohq/storage"

import type { ManagedSiteType } from "~/constants/siteType"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import {
  AccountKeyResourceError,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  ManagedResourceError,
  type ManagedResourceRef,
  type ManagedResourceWorkspace,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { getManagedResourceRegistration } from "~/services/apiAdapters/managedResources/registry"
import {
  getManagedSiteCapabilities,
  getSiteTypeCapabilities,
} from "~/services/apiAdapters/registry"
import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import { LINKED_CHANNEL_CLEANUP_STORAGE_KEY } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { getManagedResourceRefKey } from "~/services/managedSites/managedResourceIdentity"
import { getCurrentManagedSiteType } from "~/services/managedSites/runtimeConfig"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import {
  getManagedSiteChannelKeyComparisonMode,
  normalizeManagedSiteChannelBaseUrl,
} from "~/services/managedSites/utils/channelMatching"

const storage = new Storage({ area: "local" })
const bounded = <T>(
  action: (options: { signal?: AbortSignal }) => Promise<T>,
) => runAbortableTask((signal) => action({ signal }), { timeoutMs: 30_000 })
type Source = {
  accountId: string
  ref?: AccountKeyResourceRef
  tokenId?: number
}
export type LinkedChannelCleanupTask = {
  id: string
  source: Source
  baseUrl: string
  keyHash: string
  siteType: ManagedSiteType
  targets: { ref: ManagedResourceRef; name: string }[]
  sourceDeleted: boolean
}

/** Persist fingerprints and pending work only; never keep deleted plaintext keys. */
export const getLinkedChannelCleanupTasks = async (): Promise<
  LinkedChannelCleanupTask[]
> =>
  (await storage.get<LinkedChannelCleanupTask[]>(
    LINKED_CHANNEL_CLEANUP_STORAGE_KEY,
  )) ?? []

const activeCleanupTasks = new Map<string, number>()
const activityLockPrefix = "linked-channel-cleanup-active:"

/** Activity locks disappear on context shutdown, leaving persisted work retryable. */
async function withCleanupActivity<T>(
  id: string,
  work: () => Promise<T>,
): Promise<T> {
  activeCleanupTasks.set(id, (activeCleanupTasks.get(id) ?? 0) + 1)
  try {
    return await work()
  } finally {
    const remaining = (activeCleanupTasks.get(id) ?? 1) - 1
    if (remaining) activeCleanupTasks.set(id, remaining)
    else activeCleanupTasks.delete(id)
  }
}

/** Only unfinished, idle work belongs in the retry warning. */
export async function getPendingLinkedChannelCleanupTasks() {
  const tasks = await getLinkedChannelCleanupTasks()
  if (!tasks.length) return []
  const locks =
    typeof navigator !== "undefined" && navigator.locks?.query
      ? await navigator.locks.query()
      : undefined
  const heldNames = new Set(locks?.held?.map((lock) => lock.name))
  const current = await getLinkedChannelCleanupTasks()
  return current.filter(
    (task) =>
      tasks.some((previous) => previous.id === task.id) &&
      !activeCleanupTasks.has(task.id) &&
      !heldNames.has(`${activityLockPrefix}${task.id}`) &&
      !heldNames.has(`linked-channel-cleanup:${task.id}`),
  )
}

/** Own activity across discovery, source deletion, and linked cleanup, including failures. */
export async function deleteWithLinkedChannelCleanup(
  input: Parameters<typeof prepareLinkedChannelCleanup>[0] | null,
  deleteSource: () => Promise<void>,
) {
  if (!input) return deleteSource()
  const id = crypto.randomUUID()
  return withExtensionStorageWriteLock(`${activityLockPrefix}${id}`, () =>
    withCleanupActivity(id, async () => {
      const task = await prepareLinkedChannelCleanup(input, id)
      await deleteSource()
      await finishLinkedChannelCleanup(task)
    }),
  )
}

/** Upsert one task without losing updates from another extension context. */
async function saveTask(task: LinkedChannelCleanupTask, remove = false) {
  await withExtensionStorageWriteLock(
    LINKED_CHANNEL_CLEANUP_STORAGE_KEY,
    async () => {
      const tasks = (await getLinkedChannelCleanupTasks()).filter(
        (item) => item.id !== task.id,
      )
      if (!remove) tasks.push(task)
      await storage.set(LINKED_CHANNEL_CLEANUP_STORAGE_KEY, tasks)
    },
  )
}

/** Hash provider-normalized key identity without storing the credential. */
async function hashLinkedChannelKey(key: string, siteType: ManagedSiteType) {
  let comparable = key.trim()
  if (
    getManagedSiteChannelKeyComparisonMode(siteType) === "optional-sk-prefix" &&
    comparable.startsWith("sk-")
  )
    comparable = comparable.slice(3)
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(comparable),
  )
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

/** Compare source endpoints with the same URL normalization used by key checks. */
function matchesUrl(urls: readonly string[], baseUrl: string) {
  return urls.some(
    (url) =>
      normalizeManagedSiteChannelBaseUrl(url) ===
      normalizeManagedSiteChannelBaseUrl(baseUrl),
  )
}

/** Find all matching credentials and reject unreadable inventory entries. */
async function matchingIndices(
  keys: readonly string[],
  keyHash: string,
  siteType: ManagedSiteType,
) {
  if (!keys.length || keys.some((key) => !hasUsableManagedSiteChannelKey(key)))
    throw new ManagedResourceError({ code: "unavailable" })
  const hashes = await Promise.all(
    keys.map((key) => hashLinkedChannelKey(key, siteType)),
  )
  return hashes.flatMap((hash, index) => (hash === keyHash ? [index] : []))
}

/** Collect every matching native channel before the source key is destroyed. */
export async function prepareLinkedChannelCleanup(
  input: {
    source: Source
    baseUrl: string
    key: string
  },
  id = crypto.randomUUID(),
): Promise<LinkedChannelCleanupTask | null> {
  const siteType = await getCurrentManagedSiteType()
  const config = await getManagedSiteCapabilities(siteType).config.get()
  if (!config) return null
  if (!hasUsableManagedSiteChannelKey(input.key))
    throw new ManagedResourceError({ code: "unavailable" })
  const registration = getManagedResourceRegistration(siteType, "channel")
  const workspace = registration
    ? await bounded((options) => registration.open(options))
    : null
  if (!workspace?.openKeyCleanup)
    throw new ManagedResourceError({ code: "unavailable" })
  const task: LinkedChannelCleanupTask = {
    id,
    source: input.source,
    baseUrl: input.baseUrl,
    keyHash: await hashLinkedChannelKey(input.key, siteType),
    siteType,
    targets: [],
    sourceDeleted: false,
  }
  let cursor: string | undefined
  const cursors = new Set<string>()
  const seen = new Set<string>()
  let received = 0
  do {
    const page = await bounded((options) => workspace.list({ cursor }, options))
    received += page.items.length
    for (const item of page.items) {
      const urls =
        item.keyCleanupBaseUrls ??
        item.fields.flatMap((field) =>
          field.kind === "text" &&
          (field.fieldId === "baseURL" || field.fieldId.endsWith(".baseUrl"))
            ? [field.value]
            : [],
        )
      if (urls.some((url) => url.trim()) && !matchesUrl(urls, input.baseUrl))
        continue
      const identity = getManagedResourceRefKey(item.ref)
      if (seen.has(identity)) continue
      seen.add(identity)
      const credentials = await bounded((options) =>
        workspace.openKeyCleanup!(item.ref, options),
      )
      if (
        matchesUrl(credentials.baseUrls, input.baseUrl) &&
        (await matchingIndices(credentials.keys, task.keyHash, siteType)).length
      )
        task.targets.push({ ref: item.ref, name: item.displayName })
    }
    cursor = page.nextCursor
    if (cursor && cursors.has(cursor))
      throw new ManagedResourceError({ code: "unavailable" })
    if (cursor) cursors.add(cursor)
    if (!cursor && page.total !== undefined && received < page.total)
      throw new ManagedResourceError({ code: "unavailable" })
  } while (cursor)
  if (!task.targets.length) return null
  await saveTask(task)
  return task
}

/** Reconcile an interrupted source deletion before retrying remote cleanup. */
async function sourceIsAbsent(
  task: LinkedChannelCleanupTask,
): Promise<boolean> {
  const account = (await accountQueries.getAllAccounts()).find(
    (item) => item.id === task.source.accountId,
  )
  if (!account || !matchesUrl([account.site_url], task.baseUrl)) return false
  const { request } = createAccountApiRequestFromStoredAccount(account)
  const capability = getSiteTypeCapabilities(account.site_type).account
  if (task.source.ref) {
    const ref = task.source.ref
    if (ref.siteType !== account.site_type || !capability?.keyResources)
      return false
    const session = await capability.keyResources.open({
      account: { id: account.id, siteType: account.site_type },
      request,
    })
    const collection = await session.openCollection(ref.scopeKey)
    try {
      await collection.get(ref)
      return false
    } catch (error) {
      if (
        error instanceof AccountKeyResourceError &&
        error.failure.code === "not_found"
      )
        return true
      throw error
    }
  }
  if (task.source.tokenId === undefined || !capability?.keyManagement)
    return false
  return !(await capability.keyManagement.fetchTokens(request)).some(
    (token) => token.id === task.source.tokenId,
  )
}

/** Re-read a target, remove only matching credentials, and confirm the resulting state. */
async function cleanTarget(
  workspace: ManagedResourceWorkspace,
  task: LinkedChannelCleanupTask,
  ref: ManagedResourceRef,
) {
  try {
    const current = await bounded((options) =>
      workspace.openKeyCleanup!(ref, options),
    )
    if (!matchesUrl(current.baseUrls, task.baseUrl))
      throw new ManagedResourceError({ code: "resource_changed" })
    const indices = await matchingIndices(
      current.keys,
      task.keyHash,
      task.siteType,
    )
    if (!indices.length) return
    const removeWholeChannel = indices.length === current.keys.length
    // Native adapters own success confirmation; only unresolved outcomes need readback.
    let failure: unknown
    try {
      const result = await bounded((options) =>
        removeWholeChannel
          ? workspace.delete(ref, options)
          : current.remove(indices, options),
      )
      if (result.outcome === "succeeded") return
      failure = new ManagedResourceError({ code: "mutation_state_uncertain" })
    } catch (error) {
      failure = error
    }
    try {
      const after = await bounded((options) =>
        workspace.openKeyCleanup!(ref, options),
      )
      if (
        !matchesUrl(after.baseUrls, task.baseUrl) ||
        (await matchingIndices(after.keys, task.keyHash, task.siteType)).length
      )
        throw (
          failure ??
          new ManagedResourceError({ code: "mutation_state_uncertain" })
        )
      const retained = current.keys.filter(
        (_, index) => !indices.includes(index),
      )
      if (retained.some((key) => !after.keys.includes(key)))
        throw new ManagedResourceError({ code: "resource_changed" })
    } catch (error) {
      if (
        error instanceof ManagedResourceError &&
        error.failure.code === "not_found"
      )
        return
      throw error
    }
  } catch (error) {
    if (
      error instanceof ManagedResourceError &&
      error.failure.code === "not_found"
    )
      return
    throw error
  }
}

/** Independent targets remain retryable after partial failure or extension restart. */
export async function runLinkedChannelCleanup(
  task: LinkedChannelCleanupTask,
  sourceDeleted = false,
) {
  return withExtensionStorageWriteLock(
    `linked-channel-cleanup:${task.id}`,
    () =>
      withCleanupActivity(task.id, async () => {
        const stored = (await getLinkedChannelCleanupTasks()).find(
          (item) => item.id === task.id,
        )
        if (!stored) return
        task = stored
        if (
          !task.sourceDeleted &&
          !sourceDeleted &&
          !(await sourceIsAbsent(task))
        )
          return
        task.sourceDeleted = true
        await saveTask(task)
        const workspace = await getManagedResourceRegistration(
          task.siteType,
          "channel",
        )?.open()
        if (!workspace?.openKeyCleanup) return
        for (const target of [...task.targets]) {
          try {
            await withExtensionStorageWriteLock(
              `linked-channel-cleanup-resource:${getManagedResourceRefKey(target.ref)}`,
              () => cleanTarget(workspace, task, target.ref),
            )
            task.targets = task.targets.filter(
              (item) =>
                getManagedResourceRefKey(item.ref) !==
                getManagedResourceRefKey(target.ref),
            )
            await saveTask(task, task.targets.length === 0)
          } catch {
            /* Keep the exact pending target for an explicit retry. */
          }
        }
      }),
  )
}

/** Finish source deletion successfully even when remote cleanup remains pending. */
export async function finishLinkedChannelCleanup(
  task: LinkedChannelCleanupTask | null,
) {
  if (!task) return
  try {
    await runLinkedChannelCleanup(task, true)
  } catch {
    /* Persisted work is visible in the key page. */
  }
}
