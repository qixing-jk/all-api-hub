import type {
  BackupFullV2,
  RawBackupData,
} from "~/services/importExport/importExportService"
import { normalizeBackupForMerge } from "~/services/importExport/importExportService"
import {
  resolveWebdavSyncDataSelection,
  type WebDAVSyncDataSelection,
} from "~/types/webdav"

/**
 * Type guard for checking if a value is a non-null object (Record).
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

/**
 * Reads a section from the backup, checking both root and legacy `data` nesting for compatibility.
 */
function readBackupSection(raw: unknown, key: string): unknown {
  if (!isRecord(raw)) return undefined
  if (Object.prototype.hasOwnProperty.call(raw, key)) {
    return raw[key]
  }

  const legacyData = isRecord(raw.data) ? raw.data : null
  if (legacyData && Object.prototype.hasOwnProperty.call(legacyData, key)) {
    return legacyData[key]
  }

  return undefined
}

/**
 * Normalizes a raw input into a list of unique, non-empty string IDs.
 */
export function normalizeWebdavStringIdList(raw: unknown): string[] {
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
export function filterWebdavIdList(
  ids: string[],
  allowList: Set<string>,
): string[] {
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
export function collectWebdavEntryIds(entries: unknown): string[] {
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

export type WebdavBackupPresence = {
  hasAccounts: boolean
  hasAccountsList: boolean
  hasBookmarksList: boolean
  hasPreferences: boolean
  hasApiCredentialProfiles: boolean
  hasTagStore: boolean
  hasChannelConfigs: boolean
  hasPinnedAccountIds: boolean
  hasOrderedAccountIds: boolean
}

type WebdavBackupEntry = { id: string; created_at?: number }

type WebdavBackupAccountsSection = {
  accounts: WebdavBackupEntry[]
  bookmarks: WebdavBackupEntry[]
  pinnedAccountIds: string[]
  orderedAccountIds: string[]
  lastUpdated: number
}

/**
 * Creates the common root payload shape shared by all WebDAV backup writers.
 */
function createBaseWebdavPayload(backup: BackupFullV2): RawBackupData {
  return {
    version: backup.version,
    timestamp: backup.timestamp,
    channelConfigs: backup.channelConfigs,
  }
}

/**
 * Reads the local accounts/bookmarks section from a canonical backup.
 */
function readWebdavBackupAccountsSection(
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
 * Returns whether the selection requires tag-store data to participate in sync.
 */
function shouldIncludeWebdavTagStore(
  selection: WebDAVSyncDataSelection,
): boolean {
  return (
    selection.accounts || selection.bookmarks || selection.apiCredentialProfiles
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
    last_updated: input.lastUpdated,
  }
}

/**
 * Resolves whether an upload should keep the local section, preserve the remote section, or omit it.
 */
function resolveWebdavUploadSection(input: {
  selected: boolean
  selectedValue: unknown
  hasRemoteValue: boolean
  rawRemoteValue: unknown
  normalizedRemoteValue: unknown
}): unknown {
  if (input.selected) {
    return input.selectedValue
  }

  if (!input.hasRemoteValue) {
    return undefined
  }

  return input.rawRemoteValue !== undefined
    ? input.rawRemoteValue
    : input.normalizedRemoteValue
}

/**
 * Resolves tag-store upload behavior while preserving remote tag data when the local snapshot has none.
 */
function resolveWebdavTagStoreUploadSection(input: {
  selection: WebDAVSyncDataSelection
  localTagStore: BackupFullV2["tagStore"]
  hasRemoteTagStore: boolean
  rawRemoteTagStore: unknown
  normalizedRemoteTagStore: unknown
}): unknown {
  if (shouldIncludeWebdavTagStore(input.selection) && input.localTagStore) {
    return input.localTagStore
  }

  if (!input.hasRemoteTagStore) {
    return undefined
  }

  return input.rawRemoteTagStore !== undefined
    ? input.rawRemoteTagStore
    : input.normalizedRemoteTagStore
}

/**
 * Detects presence of backup sections from the raw JSON shape.
 *
 * This is used to distinguish "missing" (not provided) from "empty" (provided but empty),
 * which is important to prevent accidental wipes during selective sync.
 */
export function detectWebdavBackupPresence(raw: unknown): WebdavBackupPresence {
  if (!isRecord(raw)) {
    return {
      hasAccounts: false,
      hasAccountsList: false,
      hasBookmarksList: false,
      hasPreferences: false,
      hasApiCredentialProfiles: false,
      hasTagStore: false,
      hasChannelConfigs: false,
      hasPinnedAccountIds: false,
      hasOrderedAccountIds: false,
    }
  }

  const root = raw
  const legacyData = isRecord(root.data) ? root.data : null

  const accountsField = root.accounts
  const accountsConfig = isRecord(accountsField) ? accountsField : null

  const hasAccountsRoot = Object.prototype.hasOwnProperty.call(root, "accounts")
  const hasAccountsList =
    Array.isArray(accountsField) ||
    (accountsConfig
      ? Object.prototype.hasOwnProperty.call(accountsConfig, "accounts") &&
        Array.isArray(accountsConfig.accounts)
      : false) ||
    (legacyData
      ? Object.prototype.hasOwnProperty.call(legacyData, "accounts") &&
        Array.isArray(legacyData.accounts)
      : false)

  const hasBookmarksList =
    (accountsConfig
      ? Object.prototype.hasOwnProperty.call(accountsConfig, "bookmarks") &&
        Array.isArray(accountsConfig.bookmarks)
      : false) ||
    (legacyData
      ? Object.prototype.hasOwnProperty.call(legacyData, "bookmarks") &&
        Array.isArray(legacyData.bookmarks)
      : false)

  const hasPinnedAccountIds =
    (accountsConfig
      ? Object.prototype.hasOwnProperty.call(
          accountsConfig,
          "pinnedAccountIds",
        ) && Array.isArray(accountsConfig.pinnedAccountIds)
      : false) ||
    (legacyData
      ? Object.prototype.hasOwnProperty.call(legacyData, "pinnedAccountIds") &&
        Array.isArray(legacyData.pinnedAccountIds)
      : false)

  const hasOrderedAccountIds =
    (accountsConfig
      ? Object.prototype.hasOwnProperty.call(
          accountsConfig,
          "orderedAccountIds",
        ) && Array.isArray(accountsConfig.orderedAccountIds)
      : false) ||
    (legacyData
      ? Object.prototype.hasOwnProperty.call(legacyData, "orderedAccountIds") &&
        Array.isArray(legacyData.orderedAccountIds)
      : false)

  const hasPreferences =
    Object.prototype.hasOwnProperty.call(root, "preferences") ||
    (legacyData
      ? Object.prototype.hasOwnProperty.call(legacyData, "preferences")
      : false)

  const hasApiCredentialProfiles =
    Object.prototype.hasOwnProperty.call(root, "apiCredentialProfiles") ||
    (legacyData
      ? Object.prototype.hasOwnProperty.call(
          legacyData,
          "apiCredentialProfiles",
        )
      : false)

  const hasTagStore =
    Object.prototype.hasOwnProperty.call(root, "tagStore") ||
    (legacyData
      ? Object.prototype.hasOwnProperty.call(legacyData, "tagStore")
      : false)

  const hasChannelConfigs =
    Object.prototype.hasOwnProperty.call(root, "channelConfigs") ||
    (legacyData
      ? Object.prototype.hasOwnProperty.call(legacyData, "channelConfigs")
      : false)

  return {
    hasAccounts: hasAccountsRoot || hasAccountsList || hasBookmarksList,
    hasAccountsList,
    hasBookmarksList,
    hasPreferences,
    hasApiCredentialProfiles,
    hasTagStore,
    hasChannelConfigs,
    hasPinnedAccountIds,
    hasOrderedAccountIds,
  }
}

/**
 * Build a selective-sync WebDAV payload from a canonical full V2 backup.
 *
 * The returned payload:
 * - Always includes `version` and `timestamp`.
 * - Omits unselected sections.
 * - Keeps `channelConfigs` unchanged for compatibility.
 * - Filters pinned/ordered ids to only include ids present in the included accounts/bookmarks.
 */
export function createWebdavSelectiveBackupPayload(input: {
  backup: BackupFullV2
  syncData: unknown
}): RawBackupData {
  const selection = resolveWebdavSyncDataSelection(input.syncData)
  return filterWebdavBackupPayloadBySelection({
    backup: input.backup,
    selection,
  })
}

/**
 * Build the final WebDAV upload payload.
 *
 * WebDAV uploads replace the entire remote file, so when only part of the
 * data is selected we must preserve the remote sections that were not chosen.
 * This function overlays selected local sections onto the existing remote
 * backup while keeping unselected remote sections intact.
 */
export function mergeWebdavBackupPayloadBySelection(input: {
  backup: BackupFullV2
  selection: WebDAVSyncDataSelection
  remoteBackup?: RawBackupData | null
}): RawBackupData {
  const { backup, selection, remoteBackup } = input

  if (!remoteBackup) {
    return filterWebdavBackupPayloadBySelection({
      backup,
      selection,
    })
  }

  const remotePresence = detectWebdavBackupPresence(remoteBackup)
  const normalizedRemote = normalizeBackupForMerge(
    remoteBackup,
    backup.preferences,
  )
  const remotePreferences = readBackupSection(remoteBackup, "preferences")
  const remoteApiCredentialProfiles = readBackupSection(
    remoteBackup,
    "apiCredentialProfiles",
  )
  const remoteTagStore = readBackupSection(remoteBackup, "tagStore")

  const localAccountsSection = readWebdavBackupAccountsSection(backup)
  const incomingAccounts = localAccountsSection.accounts
  const incomingBookmarks = localAccountsSection.bookmarks

  const accounts = selection.accounts
    ? incomingAccounts
    : remotePresence.hasAccountsList
      ? normalizedRemote.accounts
      : []

  const bookmarks = selection.bookmarks
    ? incomingBookmarks
    : remotePresence.hasBookmarksList
      ? normalizedRemote.bookmarks
      : []

  const entryIdSet = createWebdavEntryIdSet({ accounts, bookmarks })

  const selectedIdSet = createWebdavEntryIdSet({
    accounts: selection.accounts ? incomingAccounts : [],
    bookmarks: selection.bookmarks ? incomingBookmarks : [],
  })

  const incomingPinnedAccountIds = localAccountsSection.pinnedAccountIds
  const incomingOrderedAccountIds = localAccountsSection.orderedAccountIds
  const remotePinnedAccountIds = remotePresence.hasPinnedAccountIds
    ? normalizeWebdavStringIdList(normalizedRemote.pinnedAccountIds)
    : []
  const remoteOrderedAccountIds = remotePresence.hasOrderedAccountIds
    ? normalizeWebdavStringIdList(normalizedRemote.orderedAccountIds)
    : []

  const shouldMergeAccountsSection = selection.accounts || selection.bookmarks
  const pinnedAccountIds = shouldMergeAccountsSection
    ? filterWebdavIdList(
        [
          ...incomingPinnedAccountIds.filter((id) => selectedIdSet.has(id)),
          ...remotePinnedAccountIds.filter((id) => !selectedIdSet.has(id)),
        ],
        entryIdSet,
      )
    : filterWebdavIdList(remotePinnedAccountIds, entryIdSet)

  const orderedAccountIds = shouldMergeAccountsSection
    ? normalizeWebdavOrderedEntryIds({
        baseOrderedIds: [
          ...incomingOrderedAccountIds.filter((id) => selectedIdSet.has(id)),
          ...remoteOrderedAccountIds.filter((id) => !selectedIdSet.has(id)),
        ],
        entryIdSet,
        accounts,
        bookmarks,
      })
    : normalizeWebdavOrderedEntryIds({
        baseOrderedIds: remoteOrderedAccountIds,
        entryIdSet,
        accounts,
        bookmarks,
      })

  const shouldIncludeAccounts =
    shouldMergeAccountsSection ||
    remotePresence.hasAccounts ||
    remotePresence.hasAccountsList ||
    remotePresence.hasBookmarksList

  const payload: RawBackupData = createBaseWebdavPayload(backup)
  const accountsSection = buildWebdavAccountsSection({
    shouldInclude: shouldIncludeAccounts,
    includeAccounts: selection.accounts || remotePresence.hasAccountsList,
    includeBookmarks: selection.bookmarks || remotePresence.hasBookmarksList,
    accounts,
    bookmarks,
    pinnedAccountIds,
    orderedAccountIds,
    lastUpdated: shouldMergeAccountsSection
      ? localAccountsSection.lastUpdated
      : normalizedRemote.accountsTimestamp || backup.timestamp,
  })

  if (accountsSection) {
    payload.accounts = accountsSection as any
  }

  const preferences = resolveWebdavUploadSection({
    selected: selection.preferences,
    selectedValue: backup.preferences,
    hasRemoteValue: remotePresence.hasPreferences,
    rawRemoteValue: remotePreferences,
    normalizedRemoteValue: normalizedRemote.preferences,
  })
  if (preferences !== undefined) {
    payload.preferences = preferences as any
  }

  if (selection.apiCredentialProfiles && backup.apiCredentialProfiles) {
    payload.apiCredentialProfiles = backup.apiCredentialProfiles
  } else if (remotePresence.hasApiCredentialProfiles) {
    payload.apiCredentialProfiles =
      remoteApiCredentialProfiles !== undefined
        ? (remoteApiCredentialProfiles as any)
        : normalizedRemote.apiCredentialProfiles
  }

  const tagStore = resolveWebdavTagStoreUploadSection({
    selection,
    localTagStore: backup.tagStore,
    hasRemoteTagStore: remotePresence.hasTagStore,
    rawRemoteTagStore: remoteTagStore,
    normalizedRemoteTagStore: normalizedRemote.tagStore,
  })
  if (tagStore !== undefined) {
    payload.tagStore = tagStore as any
  }

  return payload
}

/**
 * Build a filtered WebDAV backup payload based on the selected sections.
 */
export function filterWebdavBackupPayloadBySelection(input: {
  backup: BackupFullV2
  selection: WebDAVSyncDataSelection
}): RawBackupData {
  const { backup, selection } = input

  const localAccountsSection = readWebdavBackupAccountsSection(backup)
  const accounts = selection.accounts ? localAccountsSection.accounts : []
  const bookmarks = selection.bookmarks ? localAccountsSection.bookmarks : []

  const entryIdSet = createWebdavEntryIdSet({ accounts, bookmarks })

  const pinnedAccountIds = filterWebdavIdList(
    localAccountsSection.pinnedAccountIds,
    entryIdSet,
  )
  const orderedAccountIds = filterWebdavIdList(
    localAccountsSection.orderedAccountIds,
    entryIdSet,
  )

  const shouldIncludeAccounts = selection.accounts || selection.bookmarks

  const payload: RawBackupData = createBaseWebdavPayload(backup)
  const accountsSection = buildWebdavAccountsSection({
    shouldInclude: shouldIncludeAccounts,
    includeAccounts: selection.accounts,
    includeBookmarks: selection.bookmarks,
    accounts,
    bookmarks,
    pinnedAccountIds,
    orderedAccountIds,
    lastUpdated: localAccountsSection.lastUpdated,
  })

  if (accountsSection) {
    payload.accounts = accountsSection as any
  }

  if (selection.preferences) {
    payload.preferences = backup.preferences
  }

  if (selection.apiCredentialProfiles && backup.apiCredentialProfiles) {
    payload.apiCredentialProfiles = backup.apiCredentialProfiles
  }

  if (shouldIncludeWebdavTagStore(selection) && backup.tagStore) {
    payload.tagStore = backup.tagStore
  }

  return payload
}
