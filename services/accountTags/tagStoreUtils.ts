import type { SiteAccount, SiteBookmark, Tag, TagStore } from "~/types"
import { safeRandomUUID } from "~/utils/identifier"

/**
 * Collapses user input into a stable comparison key.
 *
 * Rules:
 * - trim surrounding whitespace
 * - collapse internal whitespace to a single space
 * - compare case-insensitively
 */
export function normalizeTagNameForUniqueness(rawName: string): {
  displayName: string
  normalizedKey: string
} | null {
  const displayName = String(rawName ?? "")
    .trim()
    .replace(/\s+/g, " ")

  if (!displayName) {
    return null
  }

  return {
    displayName,
    normalizedKey: displayName.toLowerCase(),
  }
}

export const TAG_STORE_VERSION = 1

/**
 * Creates a new empty tag store with the current schema version.
 */
export function createDefaultTagStore(): TagStore {
  return { version: TAG_STORE_VERSION, tagsById: {} }
}

/**
 * Best-effort sanitize for untrusted inputs (imports / remote sync).
 *
 * This function:
 * - preserves known tags
 * - drops malformed entries
 * - ensures the `version` field exists
 */
export function sanitizeTagStore(input: unknown): TagStore {
  const base = createDefaultTagStore()

  if (!input || typeof input !== "object") {
    return base
  }

  const maybe = input as Partial<TagStore>
  const tagsByIdRaw = maybe.tagsById

  if (!tagsByIdRaw || typeof tagsByIdRaw !== "object") {
    return {
      ...base,
      version: typeof maybe.version === "number" ? maybe.version : base.version,
    }
  }

  const sanitized: Record<string, Tag> = {}

  for (const [id, rawTag] of Object.entries(tagsByIdRaw as any)) {
    if (!id || typeof id !== "string") continue
    if (!rawTag || typeof rawTag !== "object") continue

    const name =
      typeof (rawTag as any).name === "string" ? (rawTag as any).name : ""
    const normalized = normalizeTagNameForUniqueness(name)
    if (!normalized) continue

    const createdAt =
      typeof (rawTag as any).createdAt === "number"
        ? (rawTag as any).createdAt
        : Date.now()
    const updatedAt =
      typeof (rawTag as any).updatedAt === "number"
        ? (rawTag as any).updatedAt
        : createdAt

    sanitized[id] = {
      id,
      name: normalized.displayName,
      createdAt,
      updatedAt,
    }
  }

  return {
    version: typeof maybe.version === "number" ? maybe.version : base.version,
    tagsById: sanitized,
  }
}

/**
 * Generates an opaque tag id for the global store.
 *
 * The format is intentionally simple and stable across environments.
 */
export function generateTagId(): string {
  return safeRandomUUID("tag")
}

/**
 * Lists all tags sorted by name (case-insensitive).
 */
export function listTagsSorted(store: TagStore): Tag[] {
  return Object.values(store.tagsById).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  )
}

/**
 * Builds an index of normalized tag names to tag ids for quick lookup.
 */
export function buildNormalizedNameIndex(store: TagStore): Map<string, string> {
  const index = new Map<string, string>()
  for (const tag of Object.values(store.tagsById)) {
    const normalized = normalizeTagNameForUniqueness(tag.name)
    if (!normalized) continue
    index.set(normalized.normalizedKey, tag.id)
  }
  return index
}

/**
 * Merges two tag stores by normalized name and returns remapped accounts so that
 * tag ids always point at tags present in the merged store.
 *
 * Strategy:
 * - If local and remote share the same normalized name, prefer the local id.
 * - If remote id collides with an unrelated local id, generate a fresh id and remap.
 */
export function mergeTagStoresAndRemapAccounts(input: {
  localTagStore: TagStore
  remoteTagStore: TagStore
  localAccounts: SiteAccount[]
  remoteAccounts: SiteAccount[]
  localBookmarks?: SiteBookmark[]
  remoteBookmarks?: SiteBookmark[]
}): {
  tagStore: TagStore
  localAccounts: SiteAccount[]
  remoteAccounts: SiteAccount[]
  localBookmarks: SiteBookmark[]
  remoteBookmarks: SiteBookmark[]
} {
  const localTagStore = sanitizeTagStore(input.localTagStore)
  const remoteTagStore = sanitizeTagStore(input.remoteTagStore)

  const merged = createDefaultTagStore()
  const mergedNameIndex = new Map<string, string>()
  const usedIds = new Set<string>()

  const localIdMap = new Map<string, string>()
  const remoteIdMap = new Map<string, string>()

  const upsertIntoMerged = (tag: Tag, origin: "local" | "remote") => {
    const normalized = normalizeTagNameForUniqueness(tag.name)
    if (!normalized) return

    const existingId = mergedNameIndex.get(normalized.normalizedKey)
    if (existingId) {
      const map = origin === "local" ? localIdMap : remoteIdMap
      map.set(tag.id, existingId)
      return
    }

    const desiredId = tag.id
    let nextId = desiredId

    if (usedIds.has(desiredId)) {
      nextId = generateTagId()
    }

    usedIds.add(nextId)
    mergedNameIndex.set(normalized.normalizedKey, nextId)
    merged.tagsById[nextId] = {
      id: nextId,
      name: normalized.displayName,
      createdAt: tag.createdAt,
      updatedAt: tag.updatedAt,
    }

    const map = origin === "local" ? localIdMap : remoteIdMap
    map.set(tag.id, nextId)
  }

  for (const tag of Object.values(localTagStore.tagsById)) {
    upsertIntoMerged(tag, "local")
  }
  for (const tag of Object.values(remoteTagStore.tagsById)) {
    upsertIntoMerged(tag, "remote")
  }

  const remapEntityTagIds = <T extends { tagIds?: string[] }>(
    entities: T[],
    map: Map<string, string>,
  ): T[] => {
    return entities.map((entity) => {
      if (!Array.isArray(entity.tagIds) || entity.tagIds.length === 0) {
        return entity
      }

      const nextTagIds: string[] = []
      const seen = new Set<string>()
      for (const rawId of entity.tagIds) {
        const remapped = map.get(rawId) ?? rawId
        if (!remapped) continue
        if (seen.has(remapped)) continue
        seen.add(remapped)
        nextTagIds.push(remapped)
      }
      return {
        ...entity,
        tagIds: nextTagIds,
      }
    })
  }

  return {
    tagStore: merged,
    localAccounts: remapEntityTagIds(input.localAccounts, localIdMap),
    remoteAccounts: remapEntityTagIds(input.remoteAccounts, remoteIdMap),
    localBookmarks: remapEntityTagIds(input.localBookmarks ?? [], localIdMap),
    remoteBookmarks: remapEntityTagIds(
      input.remoteBookmarks ?? [],
      remoteIdMap,
    ),
  }
}
