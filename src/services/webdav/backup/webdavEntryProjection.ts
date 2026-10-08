import type { BackupFullV2 } from "~/services/importExport/backupContracts"
import {
  DELETED_ENTRY_KIND,
  DELETED_ENTRY_KINDS,
  type AccountStorageConfig,
  type DeletedEntryKind,
  type DeletedEntryRecord,
} from "~/types"

/**
 * Normalizes a raw input into a list of unique, non-empty string IDs.
 */
function normalizeWebdavStringIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const ids: string[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    if (typeof item !== "string") continue
    if (!item) continue
    if (seen.has(item)) continue
    seen.add(item)
    ids.push(item)
  }

  return ids
}

/**
 * Filters a list of IDs to only include those present in the allowList, ensuring uniqueness and order.
 */
function filterWebdavIdList(ids: string[], allowList: Set<string>): string[] {
  const filtered: string[] = []
  const seen = new Set<string>()

  for (const id of ids) {
    if (!allowList.has(id)) continue
    if (seen.has(id)) continue
    seen.add(id)
    filtered.push(id)
  }

  return filtered
}

/**
 * Extracts string IDs from a list of entries, ignoring invalid entries and duplicates.
 */
function collectWebdavEntryIds(entries: unknown): string[] {
  if (!Array.isArray(entries)) return []

  return entries
    .map((entry: any) => entry?.id)
    .filter((id: unknown): id is string => typeof id === "string")
}

/**
 * Normalizes the ordered list of entry IDs for WebDAV selective sync:
 */
export function normalizeWebdavOrderedEntryIds(input: {
  baseOrderedIds: unknown
  entryIdSet: Set<string>
  accounts: Array<{ id: string; created_at?: number }>
  bookmarks: Array<{ id: string; created_at?: number }>
}): string[] {
  const rawIds = Array.isArray(input.baseOrderedIds) ? input.baseOrderedIds : []

  const ordered: string[] = []
  const seen = new Set<string>()

  for (const id of rawIds) {
    if (typeof id !== "string") continue
    if (!input.entryIdSet.has(id)) continue
    if (seen.has(id)) continue
    seen.add(id)
    ordered.push(id)
  }

  const entries = [
    ...input.accounts.map((account) => ({
      id: account.id,
      createdAt: account.created_at || 0,
    })),
    ...input.bookmarks.map((bookmark) => ({
      id: bookmark.id,
      createdAt: bookmark.created_at || 0,
    })),
  ].sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt
    }
    return a.id.localeCompare(b.id)
  })

  for (const entry of entries) {
    if (!input.entryIdSet.has(entry.id)) continue
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    ordered.push(entry.id)
  }

  const remaining = Array.from(input.entryIdSet)
    .filter((id) => !seen.has(id))
    .sort((a, b) => a.localeCompare(b))

  ordered.push(...remaining)

  return ordered
}

type WebdavBackupEntry = { id: string; created_at?: number }

type WebdavBackupAccountsSection = {
  accounts: WebdavBackupEntry[]
  bookmarks: WebdavBackupEntry[]
  pinnedAccountIds: string[]
  orderedAccountIds: string[]
  deletedEntryRecords: AccountStorageConfig["deletedEntryRecords"]
  lastUpdated: number
}

const isDeletedEntryKind = (kind: unknown): kind is DeletedEntryKind =>
  DELETED_ENTRY_KINDS.includes(kind as DeletedEntryKind)

/**
 * Normalizes deletion markers from WebDAV backup payloads.
 */
function normalizeWebdavDeletedEntryRecords(
  raw: unknown,
): NonNullable<AccountStorageConfig["deletedEntryRecords"]> {
  if (!raw || typeof raw !== "object") return {}

  const records: NonNullable<AccountStorageConfig["deletedEntryRecords"]> = {}

  for (const [id, value] of Object.entries(raw)) {
    if (!id || !value || typeof value !== "object") continue

    const candidate = value as Partial<DeletedEntryRecord>
    const kind = candidate.kind
    const deletedAt = Number(candidate.deletedAt)
    const entryUpdatedAt = Number(candidate.entryUpdatedAt)

    if (!isDeletedEntryKind(kind)) continue
    if (!Number.isFinite(deletedAt) || deletedAt <= 0) continue

    records[id] = {
      kind,
      deletedAt,
      entryUpdatedAt: Number.isFinite(entryUpdatedAt) ? entryUpdatedAt : 0,
    }
  }

  return records
}

/**
 * Keeps only deletion markers for the selected account/bookmark domains.
 */
function filterWebdavDeletedEntryRecordsBySelection(input: {
  records: AccountStorageConfig["deletedEntryRecords"]
  includeAccounts: boolean
  includeBookmarks: boolean
}) {
  const filtered: NonNullable<AccountStorageConfig["deletedEntryRecords"]> = {}
  const includeKind = (kind: DeletedEntryKind) =>
    (kind === DELETED_ENTRY_KIND.ACCOUNT && input.includeAccounts) ||
    (kind === DELETED_ENTRY_KIND.BOOKMARK && input.includeBookmarks)

  for (const [id, record] of Object.entries(input.records || {})) {
    if (!includeKind(record.kind)) continue
    filtered[id] = record
  }

  return filtered
}

/**
 * Merges local and remote deletion markers, keeping the newest marker per id.
 */
function mergeWebdavDeletedEntryRecords(input: {
  localRecords: AccountStorageConfig["deletedEntryRecords"]
  remoteRecords: AccountStorageConfig["deletedEntryRecords"]
  includeLocalAccounts: boolean
  includeLocalBookmarks: boolean
  includeRemoteAccounts: boolean
  includeRemoteBookmarks: boolean
}) {
  const records: NonNullable<AccountStorageConfig["deletedEntryRecords"]> = {}

  for (const selected of [
    filterWebdavDeletedEntryRecordsBySelection({
      records: input.remoteRecords,
      includeAccounts: input.includeRemoteAccounts,
      includeBookmarks: input.includeRemoteBookmarks,
    }),
    filterWebdavDeletedEntryRecordsBySelection({
      records: input.localRecords,
      includeAccounts: input.includeLocalAccounts,
      includeBookmarks: input.includeLocalBookmarks,
    }),
  ]) {
    for (const [id, record] of Object.entries(selected)) {
      const current = records[id]
      if (!current || record.deletedAt > current.deletedAt) {
        records[id] = record
      }
    }
  }

  return records
}

/**
 * Reads the local accounts/bookmarks section from a canonical backup.
 */
export function readWebdavBackupAccountsSection(
  backup: BackupFullV2,
): WebdavBackupAccountsSection {
  const rawAccountsConfig = backup.accounts as any

  return {
    accounts: Array.isArray(rawAccountsConfig?.accounts)
      ? rawAccountsConfig.accounts
      : [],
    bookmarks: Array.isArray(rawAccountsConfig?.bookmarks)
      ? rawAccountsConfig.bookmarks
      : [],
    pinnedAccountIds: normalizeWebdavStringIdList(
      rawAccountsConfig?.pinnedAccountIds,
    ),
    orderedAccountIds: normalizeWebdavStringIdList(
      rawAccountsConfig?.orderedAccountIds,
    ),
    deletedEntryRecords: normalizeWebdavDeletedEntryRecords(
      rawAccountsConfig?.deletedEntryRecords,
    ),
    lastUpdated:
      typeof rawAccountsConfig?.last_updated === "number"
        ? rawAccountsConfig.last_updated
        : backup.timestamp,
  }
}

/**
 * Builds a combined entry-id set for the selected accounts and bookmarks.
 */
function createWebdavEntryIdSet(input: {
  accounts: WebdavBackupEntry[]
  bookmarks: WebdavBackupEntry[]
}): Set<string> {
  return new Set<string>([
    ...collectWebdavEntryIds(input.accounts),
    ...collectWebdavEntryIds(input.bookmarks),
  ])
}

/**
 * Merges two ID lists while giving the prioritized list precedence for the
 * selected entries and preserving the fallback list for everything else.
 */
function mergePrioritizedWebdavIdList(input: {
  prioritizedIds: string[]
  preservedIds: string[]
  prioritizedEntryIds: Set<string>
  entryIdSet: Set<string>
}): string[] {
  return filterWebdavIdList(
    [
      ...input.prioritizedIds.filter((id) => input.prioritizedEntryIds.has(id)),
      ...input.preservedIds.filter((id) => !input.prioritizedEntryIds.has(id)),
    ],
    input.entryIdSet,
  )
}

/**
 * Builds the serialized accounts section while preserving optional account/bookmark subsections.
 */
function buildWebdavAccountsSection(input: {
  shouldInclude: boolean
  includeAccounts: boolean
  includeBookmarks: boolean
  accounts: WebdavBackupEntry[]
  bookmarks: WebdavBackupEntry[]
  pinnedAccountIds: string[]
  orderedAccountIds: string[]
  deletedEntryRecords: AccountStorageConfig["deletedEntryRecords"]
  lastUpdated: number
}): Record<string, unknown> | undefined {
  if (!input.shouldInclude) {
    return undefined
  }

  return {
    ...(input.includeAccounts ? { accounts: input.accounts } : {}),
    ...(input.includeBookmarks ? { bookmarks: input.bookmarks } : {}),
    pinnedAccountIds: input.pinnedAccountIds,
    orderedAccountIds: input.orderedAccountIds,
    deletedEntryRecords: input.deletedEntryRecords || {},
    last_updated: input.lastUpdated,
  }
}

type EntrySource = {
  accounts: WebdavBackupEntry[]
  bookmarks: WebdavBackupEntry[]
  pinnedAccountIds?: unknown
  orderedAccountIds?: unknown
}
type EntryDomains = { accounts: boolean; bookmarks: boolean }
/** Keeps selected entities, ordering, and deletion markers coherent as one projection. */
export function projectWebdavEntries(input: {
  prioritized: EntrySource
  preserved: EntrySource
  domains: EntryDomains
  metadata: {
    usePrioritizedPinned: boolean
    usePrioritizedOrder: boolean
    completeOrder: boolean
  }
  tombstones: Parameters<typeof mergeWebdavDeletedEntryRecords>[0]
  include: { section: boolean; accounts: boolean; bookmarks: boolean }
  lastUpdated: number
}) {
  const accounts = input.domains.accounts
    ? input.prioritized.accounts
    : input.preserved.accounts
  const bookmarks = input.domains.bookmarks
    ? input.prioritized.bookmarks
    : input.preserved.bookmarks
  const entryIdSet = createWebdavEntryIdSet({ accounts, bookmarks })
  const prioritizedEntryIds = createWebdavEntryIdSet({
    accounts: input.domains.accounts ? accounts : [],
    bookmarks: input.domains.bookmarks ? bookmarks : [],
  })
  const metadataIds = (
    field: "pinnedAccountIds" | "orderedAccountIds",
    usePrioritized: boolean,
  ) =>
    usePrioritized
      ? mergePrioritizedWebdavIdList({
          prioritizedIds: normalizeWebdavStringIdList(input.prioritized[field]),
          preservedIds: normalizeWebdavStringIdList(input.preserved[field]),
          prioritizedEntryIds,
          entryIdSet,
        })
      : filterWebdavIdList(
          normalizeWebdavStringIdList(input.preserved[field]),
          entryIdSet,
        )
  const pinnedAccountIds = metadataIds(
    "pinnedAccountIds",
    input.metadata.usePrioritizedPinned,
  )
  const baseOrderedIds = metadataIds(
    "orderedAccountIds",
    input.metadata.usePrioritizedOrder,
  )
  const orderedAccountIds = input.metadata.completeOrder
    ? normalizeWebdavOrderedEntryIds({
        baseOrderedIds,
        entryIdSet,
        accounts,
        bookmarks,
      })
    : baseOrderedIds
  return buildWebdavAccountsSection({
    shouldInclude: input.include.section,
    includeAccounts: input.include.accounts,
    includeBookmarks: input.include.bookmarks,
    accounts,
    bookmarks,
    pinnedAccountIds,
    orderedAccountIds,
    deletedEntryRecords: mergeWebdavDeletedEntryRecords(input.tombstones),
    lastUpdated: input.lastUpdated,
  })
}
