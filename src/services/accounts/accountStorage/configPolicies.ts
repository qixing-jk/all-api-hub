import {
  DELETED_ENTRY_KIND,
  type AccountStorageConfig,
  type DeletedEntryKind,
  type DeletedEntryRecord,
  type SiteAccount,
  type SiteBookmark,
} from "~/types"
import { t } from "~/utils/i18n/core"

const normalizeStringIds = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? Array.from(
        new Set(
          raw
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      )
    : []

const createDeletedEntryRecord = (input: {
  kind: DeletedEntryKind
  entryUpdatedAt?: number
  now: number
}): DeletedEntryRecord => ({
  kind: input.kind,
  deletedAt: input.now,
  entryUpdatedAt:
    typeof input.entryUpdatedAt === "number" ? input.entryUpdatedAt : 0,
})

export const createAccountDeletedEntryRecord = (
  account: SiteAccount,
  now: number,
): DeletedEntryRecord =>
  createDeletedEntryRecord({
    kind: DELETED_ENTRY_KIND.ACCOUNT,
    entryUpdatedAt:
      typeof account.user_updated_at === "number"
        ? account.user_updated_at
        : account.updated_at,
    now,
  })

export const createBookmarkDeletedEntryRecord = (
  bookmark: SiteBookmark | undefined,
  now: number,
): DeletedEntryRecord =>
  createDeletedEntryRecord({
    kind: DELETED_ENTRY_KIND.BOOKMARK,
    entryUpdatedAt: bookmark?.updated_at,
    now,
  })

export const mergeDeletedEntryRecordMaps = (input: {
  existing?: AccountStorageConfig["deletedEntryRecords"]
  incoming?: AccountStorageConfig["deletedEntryRecords"]
}): NonNullable<AccountStorageConfig["deletedEntryRecords"]> => {
  const records: NonNullable<AccountStorageConfig["deletedEntryRecords"]> = {
    ...(input.existing || {}),
  }

  for (const [id, incoming] of Object.entries(input.incoming || {})) {
    const current = records[id]
    if (!current || incoming.deletedAt > current.deletedAt) {
      records[id] = incoming
    }
  }

  return records
}

export const normalizeBookmarkInput = (input: {
  name: string
  url: string
  tagIds?: unknown
  notes?: unknown
}): Pick<SiteBookmark, "name" | "url" | "tagIds" | "notes"> => {
  const name = input.name?.trim() ?? ""
  const url = input.url?.trim() ?? ""
  if (!name) {
    throw new Error(t("messages:errors.validation.bookmarkNameRequired"))
  }
  if (!url) {
    throw new Error(t("messages:errors.validation.bookmarkUrlRequired"))
  }

  const tagIds = normalizeStringIds(input.tagIds)
  const notes = typeof input.notes === "string" ? input.notes : ""
  return { name, url, tagIds, notes }
}

export const sanitizeBookmarks = (raw: unknown): SiteBookmark[] => {
  if (!Array.isArray(raw)) return []
  const byId = new Map<string, SiteBookmark>()

  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const candidate = item as Partial<Record<keyof SiteBookmark, unknown>>
    const id = typeof candidate.id === "string" ? candidate.id.trim() : ""
    const name = typeof candidate.name === "string" ? candidate.name.trim() : ""
    const url = typeof candidate.url === "string" ? candidate.url.trim() : ""
    if (!id || !name || !url) continue

    const tagIds = normalizeStringIds(candidate.tagIds)
    const notes = typeof candidate.notes === "string" ? candidate.notes : ""
    const created_at =
      typeof candidate.created_at === "number" ? candidate.created_at : 0
    const updated_at =
      typeof candidate.updated_at === "number"
        ? candidate.updated_at
        : created_at || 0
    const bookmark: SiteBookmark = {
      id,
      name,
      url,
      tagIds,
      notes,
      created_at,
      updated_at,
    }
    const existing = byId.get(id)
    if (!existing || bookmark.updated_at >= existing.updated_at) {
      byId.set(id, bookmark)
    }
  }

  return Array.from(byId.values())
}
