import { accountStorage } from "~/services/accounts/accountStorage"
import {
  apiCredentialProfilesStorage,
  coerceApiCredentialProfilesConfig,
} from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { channelConfigStorage } from "~/services/managedSites/channelConfigStorage"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import { userPreferences } from "~/services/preferences/userPreferences"
import { tagStorage } from "~/services/tags/tagStorage"
import { createDefaultTagStore } from "~/services/tags/tagStoreUtils"
import type { AccountStorageConfig, TagStore } from "~/types"
import type { ApiCredentialProfilesConfig } from "~/types/apiCredentialProfiles"
import type { ChannelConfigMap } from "~/types/channelConfig"
import { formatLocaleDateTime } from "~/utils/core/formatters"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to import/export helpers for backups and preferences.
 */
const logger = createLogger("ImportExportService")

type ImportExportErrorCode =
  | "FORMAT_NOT_CORRECT"
  | "IMPORT_FAILED"
  | "NO_IMPORTABLE_DATA"

export class ImportExportError extends Error {
  readonly code: ImportExportErrorCode

  constructor(code: ImportExportErrorCode) {
    super(code)
    this.name = "ImportExportError"
    this.code = code
  }
}

/**
 * Current backup schema version.
 *
 * V1: legacy backups, may use nested structures (e.g. accounts.accounts, data.accounts).
 * V2: flat structure with accounts / preferences / channelConfigs on the root object.
 *
 * When introducing V3+, prefer adding a dedicated import handler and updating
 * importFromBackupObject + normalizeBackupForMerge dispatch logic.
 */
export const BACKUP_VERSION = "2.0"

interface ParsedBackupSummary {
  valid: boolean
  hasAccounts: boolean
  hasPreferences: boolean
  hasChannelConfigs: boolean
  hasTagStore: boolean
  hasApiCredentialProfiles: boolean
  timestamp: string
}

/**
 * V2 full backup payload (used by "export all" and WebDAV sync uploads).
 * This is the primary canonical structure we write from the app.
 */
export interface BackupFullV2 {
  version: string
  timestamp: number
  accounts: AccountStorageConfig
  /**
   * Global tag store snapshot.
   *
   * Optional for backward compatibility with early V2 backups; new exports MUST
   * include this field so accounts with tagIds can resolve tag labels.
   */
  tagStore?: TagStore
  preferences: UserPreferences
  channelConfigs: ChannelConfigMap
  /**
   * Standalone API credential profiles snapshot (contains secrets).
   *
   * Optional for backward compatibility with early V2 backups.
   */
  apiCredentialProfiles?: ApiCredentialProfilesConfig
}

/**
 * V2 partial backup: accounts only.
 */
export interface BackupAccountsPartialV2 {
  version: string
  timestamp: number
  type: "accounts"
  accounts: AccountStorageConfig
  /**
   * Global tag store snapshot.
   *
   * Optional for backward compatibility with early V2 backups; new exports MUST
   * include this field so accounts with tagIds can resolve tag labels.
   */
  tagStore?: TagStore
}

/**
 * V2 partial backup: preferences only.
 */
export interface BackupPreferencesPartialV2 {
  version: string
  timestamp: number
  type: "preferences"
  preferences: UserPreferences
}

export type BackupV2 =
  | BackupFullV2
  | BackupAccountsPartialV2
  | BackupPreferencesPartialV2

/**
 * Legacy / tolerant backup payload (primarily for V1 and older shapes).
 * Kept broad on purpose to accept historical data from users.
 */
type LegacyBackupLike = {
  version?: string
  timestamp?: number | string
  type?: "accounts" | "preferences" | "channelConfigs" | string
  accounts?: any
  preferences?: any
  channelConfigs?: any
  tagStore?: any
  apiCredentialProfiles?: any
  data?: any
}

/**
 * Raw backup payload as stored in files / WebDAV.
 *
 * We keep this type deliberately tolerant (LegacyBackupLike) so that it can
 * accept both canonical V2 exports (BackupV2) and historical/unknown shapes.
 * The stricter V2 interfaces are still used at export call sites to guarantee
 * that what we write conforms to the latest schema.
 */
export type RawBackupData = LegacyBackupLike

export interface ImportResult {
  allImported: boolean
  sections: {
    accounts: boolean
    preferences: boolean
    channelConfigs: boolean
    apiCredentialProfiles: boolean
  }
}

export const IMPORT_SECTION_STRATEGIES = {
  Merge: "merge",
  Replace: "replace",
  Skip: "skip",
} as const

export type ImportSectionStrategy =
  (typeof IMPORT_SECTION_STRATEGIES)[keyof typeof IMPORT_SECTION_STRATEGIES]
export type ImportMergeStrategy = typeof IMPORT_SECTION_STRATEGIES.Merge
export type ImportReplaceStrategy = typeof IMPORT_SECTION_STRATEGIES.Replace
export type ImportSkipStrategy = typeof IMPORT_SECTION_STRATEGIES.Skip
export type ImportWriteStrategy = ImportMergeStrategy | ImportReplaceStrategy
export type ImportPreferenceStrategy =
  | ImportReplaceStrategy
  | ImportSkipStrategy

export interface ImportFromBackupOptions {
  mode?: ImportWriteStrategy
  plan?: ImportPlan
  preserveWebdav?: boolean
}

export interface ImportPlan {
  accounts?: ImportSectionStrategy
  preferences?: ImportPreferenceStrategy
  channelConfigs?: ImportSectionStrategy
  apiCredentialProfiles?: ImportSectionStrategy
}

/**
 * Returns whether a legacy import should write a section for the current plan.
 */
function shouldImportSection(
  plan: ImportPlan | undefined,
  section: keyof ImportPlan,
) {
  return !plan || plan[section] !== IMPORT_SECTION_STRATEGIES.Skip
}

/**
 * Narrows a selected import strategy to the strategies that write data.
 */
function hasWriteStrategy(
  strategy: ImportSectionStrategy | undefined,
): strategy is ImportWriteStrategy {
  return Boolean(strategy && strategy !== IMPORT_SECTION_STRATEGIES.Skip)
}

/**
 * Converts any non-skip section strategy into the storage write strategy.
 */
function toWriteStrategy(strategy: ImportSectionStrategy): ImportWriteStrategy {
  return strategy === IMPORT_SECTION_STRATEGIES.Replace
    ? IMPORT_SECTION_STRATEGIES.Replace
    : IMPORT_SECTION_STRATEGIES.Merge
}

/**
 * Parse a raw backup JSON string into a lightweight summary used by the
 * import UI. This is tolerant of both legacy (V1) and V2 payload shapes and
 * never throws: on invalid JSON it returns `{ valid: false }`.
 */
export function parseBackupSummary(
  importData: string,
  unknownLabel: string,
): ParsedBackupSummary | { valid: false } | null {
  if (!importData.trim()) return null

  try {
    const data = JSON.parse(importData) as RawBackupData

    const hasAccounts = Boolean(data.accounts || data.type === "accounts")
    const hasPreferences = Boolean(
      data.preferences || data.type === "preferences",
    )
    const hasChannelConfigs = Boolean(
      data.channelConfigs || data.type === "channelConfigs",
    )
    const hasTagStore = Boolean((data as any).tagStore)
    const hasApiCredentialProfiles = Boolean(
      (data as any).apiCredentialProfiles,
    )

    const ts = formatLocaleDateTime(data.timestamp, unknownLabel)

    return {
      valid: true,
      hasAccounts,
      hasPreferences,
      hasChannelConfigs,
      hasTagStore,
      hasApiCredentialProfiles,
      timestamp: ts,
    }
  } catch {
    return { valid: false }
  }
}

/**
 * Handles legacy (V1) backup payloads by importing accounts/preferences/channel configs when present.
 */
async function importV1Backup(
  data: RawBackupData,
  options?: ImportFromBackupOptions,
): Promise<ImportResult> {
  let accountsImported = false
  let preferencesImported = false
  let channelConfigsImported = false

  const accountsRequested = Boolean(data.accounts || data.type === "accounts")
  const preferencesRequested = Boolean(
    data.preferences || data.type === "preferences",
  )
  const channelConfigsRequested = Boolean(
    data.channelConfigs || data.type === "channelConfigs",
  )
  const plan = options?.plan

  // accounts: support both legacy partial exports and older full exports
  if (accountsRequested && shouldImportSection(plan, "accounts")) {
    const rawTagStore = (data as any).tagStore ?? (data.data as any)?.tagStore
    if (rawTagStore) {
      await tagStorage.importTagStore(rawTagStore)
    }

    const accountsData =
      (data.accounts as any)?.accounts ??
      (data.data as any)?.accounts ??
      data.accounts

    if (accountsData) {
      await accountStorage.importData({
        accounts: accountsData,
      })
      // Ensure legacy imports (string tags) are migrated to tag ids.
      await tagStorage.ensureLegacyMigration()
      accountsImported = true
    }
  }

  // preferences
  if (preferencesRequested && shouldImportSection(plan, "preferences")) {
    const preferencesData = data.preferences || data.data?.preferences
    if (preferencesData) {
      const writeResult = options?.preserveWebdav
        ? await userPreferences.importPreferences(preferencesData, {
            preserveWebdav: true,
          })
        : await userPreferences.importPreferences(preferencesData)
      if (writeResult.ok) {
        preferencesImported = true
      } else {
        logger.error("Failed to import user preferences from legacy backup")
        throw new ImportExportError("IMPORT_FAILED")
      }
    }
  }

  // channel configs: best-effort support if present in V1 backups
  if (channelConfigsRequested && shouldImportSection(plan, "channelConfigs")) {
    const channelConfigsData = data.channelConfigs || data.data?.channelConfigs
    if (channelConfigsData) {
      await channelConfigStorage.importConfigs(channelConfigsData)
      channelConfigsImported = true
    }
  }

  const anyImported =
    accountsImported || preferencesImported || channelConfigsImported

  if (!anyImported) {
    throw new ImportExportError("NO_IMPORTABLE_DATA")
  }

  const allImported =
    (!accountsRequested || accountsImported) &&
    (!preferencesRequested || preferencesImported) &&
    (!channelConfigsRequested || channelConfigsImported)

  return {
    allImported,
    sections: {
      accounts: accountsImported,
      preferences: preferencesImported,
      channelConfigs: channelConfigsImported,
      apiCredentialProfiles: false,
    },
  }
}

/**
 * Normalize an arbitrary backup payload (V1/V2/unknown) into a canonical
 * structure that `WebdavAutoSyncService` can merge. This is intentionally
 * tolerant so that older backups do not break newer clients.
 */
export function normalizeBackupForMerge(
  data: RawBackupData | null,
  localPreferences: any,
): {
  accounts: any[]
  bookmarks: any[]
  pinnedAccountIds: string[]
  orderedAccountIds: string[]
  deletedEntryRecords: AccountStorageConfig["deletedEntryRecords"]
  accountsTimestamp: number
  preferences: any | null
  channelConfigs: ChannelConfigMap | null
  tagStore: TagStore | null
  apiCredentialProfiles: ApiCredentialProfilesConfig | null
} {
  if (!data) {
    return {
      accounts: [],
      bookmarks: [],
      pinnedAccountIds: [],
      orderedAccountIds: [],
      deletedEntryRecords: {},
      accountsTimestamp: 0,
      preferences: null,
      channelConfigs: null,
      tagStore: null,
      apiCredentialProfiles: null,
    }
  }

  const version = data.version ?? "1.0"

  if (version === BACKUP_VERSION) {
    // For V2, we expect the canonical full-backup shape
    return normalizeV2BackupForMerge(data as BackupFullV2, localPreferences)
  }

  // V1 and unknown versions: use tolerant legacy-normalization
  return normalizeV1BackupForMerge(data, localPreferences)
}

/**
 * Normalize canonical V2 backups into the shape WebDAV merge expects.
 */
function normalizeV2BackupForMerge(
  data: BackupFullV2,
  localPreferences: any,
): {
  accounts: any[]
  bookmarks: any[]
  pinnedAccountIds: string[]
  orderedAccountIds: string[]
  deletedEntryRecords: AccountStorageConfig["deletedEntryRecords"]
  accountsTimestamp: number
  preferences: any | null
  channelConfigs: ChannelConfigMap | null
  tagStore: TagStore | null
  apiCredentialProfiles: ApiCredentialProfilesConfig | null
} {
  const accountsField: any = data.accounts
  const accountsConfig = Array.isArray(accountsField)
    ? { accounts: accountsField }
    : accountsField || {}
  const accounts = Array.isArray(accountsConfig.accounts)
    ? accountsConfig.accounts
    : []
  const bookmarks = Array.isArray(accountsConfig.bookmarks)
    ? accountsConfig.bookmarks
    : []
  const pinnedAccountIds = Array.isArray(accountsConfig.pinnedAccountIds)
    ? accountsConfig.pinnedAccountIds
    : []
  const orderedAccountIds = Array.isArray(accountsConfig.orderedAccountIds)
    ? accountsConfig.orderedAccountIds
    : []
  const deletedEntryRecords =
    accountsConfig.deletedEntryRecords &&
    typeof accountsConfig.deletedEntryRecords === "object"
      ? (accountsConfig.deletedEntryRecords as AccountStorageConfig["deletedEntryRecords"])
      : {}
  const accountsTimestamp =
    typeof accountsConfig.last_updated === "number"
      ? accountsConfig.last_updated
      : (data.timestamp as number) || 0

  const rawChannelConfigs = data.channelConfigs
  const channelConfigs: ChannelConfigMap | null =
    rawChannelConfigs && typeof rawChannelConfigs === "object"
      ? (rawChannelConfigs as ChannelConfigMap)
      : null

  return {
    accounts,
    bookmarks,
    pinnedAccountIds,
    orderedAccountIds,
    deletedEntryRecords,
    accountsTimestamp,
    preferences: data.preferences || localPreferences,
    channelConfigs,
    tagStore: data.tagStore ?? null,
    apiCredentialProfiles: data.apiCredentialProfiles
      ? coerceApiCredentialProfilesConfig(data.apiCredentialProfiles)
      : null,
  }
}

/**
 * Normalize legacy (V1/unknown) backups into merge-friendly structure.
 */
function normalizeV1BackupForMerge(
  data: RawBackupData,
  localPreferences: any,
): {
  accounts: any[]
  bookmarks: any[]
  pinnedAccountIds: string[]
  orderedAccountIds: string[]
  deletedEntryRecords: AccountStorageConfig["deletedEntryRecords"]
  accountsTimestamp: number
  preferences: any | null
  channelConfigs: ChannelConfigMap | null
  tagStore: TagStore | null
  apiCredentialProfiles: ApiCredentialProfilesConfig | null
} {
  const accountsField: any = data.accounts
  const accountsConfig = Array.isArray(accountsField)
    ? { accounts: accountsField }
    : accountsField || {}
  const legacyAccounts = (data.data as any)?.accounts
  const legacyBookmarks = (data.data as any)?.bookmarks

  const accounts = Array.isArray(accountsConfig.accounts)
    ? accountsConfig.accounts
    : Array.isArray(legacyAccounts)
      ? legacyAccounts
      : []

  const bookmarks = Array.isArray(accountsConfig.bookmarks)
    ? accountsConfig.bookmarks
    : Array.isArray(legacyBookmarks)
      ? legacyBookmarks
      : []

  const pinnedAccountIds = Array.isArray(accountsConfig.pinnedAccountIds)
    ? accountsConfig.pinnedAccountIds
    : []

  const orderedAccountIds = Array.isArray(accountsConfig.orderedAccountIds)
    ? accountsConfig.orderedAccountIds
    : []
  const deletedEntryRecords =
    accountsConfig.deletedEntryRecords &&
    typeof accountsConfig.deletedEntryRecords === "object"
      ? (accountsConfig.deletedEntryRecords as AccountStorageConfig["deletedEntryRecords"])
      : {}

  const accountsTimestamp =
    typeof accountsConfig.last_updated === "number"
      ? accountsConfig.last_updated
      : (data.timestamp as number) || 0

  const preferences =
    data.preferences || (data.data as any)?.preferences || localPreferences

  const rawChannelConfigs =
    (data as any).channelConfigs || (data.data as any)?.channelConfigs
  const channelConfigs: ChannelConfigMap | null =
    rawChannelConfigs && typeof rawChannelConfigs === "object"
      ? (rawChannelConfigs as ChannelConfigMap)
      : null

  return {
    accounts,
    bookmarks,
    pinnedAccountIds,
    orderedAccountIds,
    deletedEntryRecords,
    accountsTimestamp,
    preferences,
    channelConfigs,
    tagStore: (data as any).tagStore ?? (data.data as any)?.tagStore ?? null,
    apiCredentialProfiles: null,
  }
}

/**
 * Import a canonical V2 backup (full or partial) into local storage.
 */
async function importV2Backup(
  data: BackupV2,
  options?: ImportFromBackupOptions,
): Promise<ImportResult> {
  if (options?.plan) {
    return importV2BackupWithPlan(data, options.plan, options)
  }

  if (options?.mode === IMPORT_SECTION_STRATEGIES.Merge) {
    return importV2BackupWithPlan(
      data,
      {
        accounts: IMPORT_SECTION_STRATEGIES.Merge,
        preferences: IMPORT_SECTION_STRATEGIES.Skip,
        channelConfigs: IMPORT_SECTION_STRATEGIES.Merge,
        apiCredentialProfiles: IMPORT_SECTION_STRATEGIES.Merge,
      },
      options,
    )
  }

  let accountsImported = false
  let preferencesImported = false
  let channelConfigsImported = false
  let apiCredentialProfilesImported = false

  const accountsRequested = "accounts" in data
  const preferencesRequested = "preferences" in data
  const channelConfigsRequested =
    "channelConfigs" in data && Boolean((data as BackupFullV2).channelConfigs)
  const apiCredentialProfilesRequested =
    "apiCredentialProfiles" in data &&
    Boolean((data as BackupFullV2).apiCredentialProfiles)

  // V2 assumes flat structure: accounts / preferences / channelConfigs directly on root

  if (accountsRequested) {
    await importV2AccountsWithReplace(data)
    accountsImported = true
  }

  if (preferencesRequested) {
    const { preferences } = data as BackupFullV2 | BackupPreferencesPartialV2
    const writeResult = options?.preserveWebdav
      ? await userPreferences.importPreferences(preferences, {
          preserveWebdav: true,
        })
      : await userPreferences.importPreferences(preferences)
    if (writeResult.ok) {
      preferencesImported = true
    } else {
      logger.error("Failed to import user preferences from V2 backup")
    }
  }

  if (channelConfigsRequested) {
    await channelConfigStorage.importConfigs(
      (data as BackupFullV2).channelConfigs,
    )
    channelConfigsImported = true
  }

  if (apiCredentialProfilesRequested) {
    const incoming = coerceApiCredentialProfilesConfig(
      (data as BackupFullV2).apiCredentialProfiles,
    )

    if (
      !accountsRequested &&
      "tagStore" in (data as any) &&
      (data as any).tagStore
    ) {
      const tagMerge = tagStorage.mergeTagStoresForSync({
        localTagStore: await tagStorage.exportTagStore(),
        remoteTagStore: (data as any).tagStore,
        localAccounts: [],
        remoteAccounts: [],
        localBookmarks: [],
        remoteBookmarks: [],
        localTaggables: [],
        remoteTaggables: incoming.profiles,
      })

      await tagStorage.importTagStore(tagMerge.tagStore)

      await apiCredentialProfilesStorage.mergeConfig({
        ...incoming,
        profiles: tagMerge.remoteTaggables,
      })
    } else {
      await apiCredentialProfilesStorage.mergeConfig(incoming)
    }
    apiCredentialProfilesImported = true
  }

  const anyImported =
    accountsImported ||
    preferencesImported ||
    channelConfigsImported ||
    apiCredentialProfilesImported

  if (!anyImported) {
    throw new ImportExportError("NO_IMPORTABLE_DATA")
  }

  const allImported =
    (!accountsRequested || accountsImported) &&
    (!preferencesRequested || preferencesImported) &&
    (!channelConfigsRequested || channelConfigsImported) &&
    (!apiCredentialProfilesRequested || apiCredentialProfilesImported)

  return {
    allImported,
    sections: {
      accounts: accountsImported,
      preferences: preferencesImported,
      channelConfigs: channelConfigsImported,
      apiCredentialProfiles: apiCredentialProfilesImported,
    },
  }
}

/** Imports V2 accounts by replacing the current account/bookmark collection. */
async function importV2AccountsWithReplace(data: BackupV2) {
  if ("tagStore" in (data as any) && (data as any).tagStore) {
    await tagStorage.importTagStore((data as any).tagStore)
  }

  const accountsConfig = (data as BackupFullV2 | BackupAccountsPartialV2)
    .accounts

  const accounts = Array.isArray(accountsConfig)
    ? accountsConfig
    : accountsConfig?.accounts || []

  const pinnedAccountIds =
    !Array.isArray(accountsConfig) &&
    Array.isArray((accountsConfig as AccountStorageConfig).pinnedAccountIds)
      ? (accountsConfig as AccountStorageConfig).pinnedAccountIds
      : []

  const bookmarks =
    !Array.isArray(accountsConfig) &&
    Array.isArray((accountsConfig as AccountStorageConfig).bookmarks)
      ? (accountsConfig as AccountStorageConfig).bookmarks
      : []

  const orderedAccountIds =
    !Array.isArray(accountsConfig) &&
    Array.isArray((accountsConfig as AccountStorageConfig).orderedAccountIds)
      ? (accountsConfig as AccountStorageConfig).orderedAccountIds
      : []

  await accountStorage.importData({
    accounts,
    bookmarks,
    pinnedAccountIds,
    orderedAccountIds,
    deletedEntryRecords: !Array.isArray(accountsConfig)
      ? (accountsConfig as AccountStorageConfig).deletedEntryRecords
      : undefined,
  })
  await tagStorage.ensureLegacyMigration()
}

/** Imports V2 preferences by replacing current user preferences. */
async function importV2PreferencesWithReplace(
  data: BackupV2,
  options?: ImportFromBackupOptions,
) {
  const { preferences } = data as BackupFullV2 | BackupPreferencesPartialV2
  const writeResult = options?.preserveWebdav
    ? await userPreferences.importPreferences(preferences, {
        preserveWebdav: true,
      })
    : await userPreferences.importPreferences(preferences)

  if (!writeResult.ok) {
    logger.error("Failed to import user preferences from V2 backup")
    throw new ImportExportError("IMPORT_FAILED")
  }
}

/** Imports V2 channel configuration by replacing current channel configuration. */
async function importV2ChannelConfigsWithReplace(data: BackupV2) {
  await channelConfigStorage.importConfigs(
    (data as BackupFullV2).channelConfigs,
  )
}

/** Merges local and backup order lists while dropping ids absent from imported entries. */
function mergeEntryIdList(input: {
  localIds: string[]
  remoteIds: string[]
  validIds: Set<string>
}) {
  const merged: string[] = []
  const seen = new Set<string>()

  for (const id of [...input.localIds, ...input.remoteIds]) {
    if (!input.validIds.has(id) || seen.has(id)) continue
    seen.add(id)
    merged.push(id)
  }

  return merged
}

/** Merges records by id, keeping the newer backup record only when its timestamp wins. */
function mergeByLatestUpdatedAt<T extends { id: string; updated_at?: number }>(
  localItems: T[],
  remoteItems: T[],
) {
  const merged = new Map<string, T>()

  for (const item of localItems) {
    merged.set(item.id, item)
  }

  for (const remoteItem of remoteItems) {
    const localItem = merged.get(remoteItem.id)
    if (!localItem) {
      merged.set(remoteItem.id, remoteItem)
      continue
    }

    if ((remoteItem.updated_at || 0) > (localItem.updated_at || 0)) {
      merged.set(remoteItem.id, remoteItem)
    }
  }

  return Array.from(merged.values())
}

/** Merges channel configuration by channel id, preferring the newest updatedAt value. */
function mergeChannelConfigs(
  localChannelConfigs: ChannelConfigMap,
  remoteChannelConfigs: ChannelConfigMap | null,
) {
  const merged: ChannelConfigMap = { ...localChannelConfigs }

  if (!remoteChannelConfigs) {
    return merged
  }

  for (const [key, value] of Object.entries(remoteChannelConfigs)) {
    const channelId = Number(key)
    if (!Number.isFinite(channelId) || channelId <= 0) continue

    const localConfig = merged[channelId]
    const remoteConfig = value as ChannelConfigMap[number]
    const localUpdatedAt =
      typeof localConfig?.updatedAt === "number" ? localConfig.updatedAt : 0
    const remoteUpdatedAt =
      typeof remoteConfig?.updatedAt === "number" ? remoteConfig.updatedAt : 0

    if (!localConfig || remoteUpdatedAt > localUpdatedAt) {
      merged[channelId] = remoteConfig
    }
  }

  return merged
}

/** Merges V2 accounts/bookmarks into the current account storage. */
async function importV2AccountsWithMerge(data: BackupV2) {
  const [localAccountsConfig, localTagStore] = await Promise.all([
    accountStorage.exportData(),
    tagStorage.exportTagStore(),
  ])
  const normalizedRemote = normalizeV2BackupForMerge(data as BackupFullV2, null)

  const tagMerge = tagStorage.mergeTagStoresForSync({
    localTagStore,
    remoteTagStore: normalizedRemote.tagStore ?? createDefaultTagStore(),
    localAccounts: localAccountsConfig.accounts,
    remoteAccounts: normalizedRemote.accounts,
    localBookmarks: localAccountsConfig.bookmarks,
    remoteBookmarks: normalizedRemote.bookmarks,
    localTaggables: [],
    remoteTaggables: [],
  })

  const accounts = mergeByLatestUpdatedAt(
    tagMerge.localAccounts,
    tagMerge.remoteAccounts,
  )
  const bookmarks = mergeByLatestUpdatedAt(
    tagMerge.localBookmarks,
    tagMerge.remoteBookmarks,
  )
  const entryIdSet = new Set([
    ...accounts.map((account) => account.id),
    ...bookmarks.map((bookmark) => bookmark.id),
  ])

  await tagStorage.importTagStore(tagMerge.tagStore)
  await accountStorage.importData({
    accounts,
    bookmarks,
    pinnedAccountIds: mergeEntryIdList({
      localIds: localAccountsConfig.pinnedAccountIds || [],
      remoteIds: normalizedRemote.pinnedAccountIds,
      validIds: entryIdSet,
    }),
    orderedAccountIds: mergeEntryIdList({
      localIds: localAccountsConfig.orderedAccountIds || [],
      remoteIds: normalizedRemote.orderedAccountIds,
      validIds: entryIdSet,
    }),
    deletedEntryRecords: {
      ...(localAccountsConfig.deletedEntryRecords || {}),
      ...(normalizedRemote.deletedEntryRecords || {}),
    },
  })
  await tagStorage.ensureLegacyMigration()
}

/** Merges V2 channel configuration into current channel configuration. */
async function importV2ChannelConfigsWithMerge(data: BackupV2) {
  const localChannelConfigs = await channelConfigStorage.exportConfigs()
  const normalizedRemote = normalizeV2BackupForMerge(data as BackupFullV2, null)
  await channelConfigStorage.importConfigs(
    mergeChannelConfigs(localChannelConfigs, normalizedRemote.channelConfigs),
  )
}

/** Imports V2 API credential profiles using either merge or replace semantics. */
async function importV2ApiCredentialProfiles(
  data: BackupV2,
  strategy: ImportWriteStrategy,
  accountsRequested: boolean,
) {
  const incoming = coerceApiCredentialProfilesConfig(
    (data as BackupFullV2).apiCredentialProfiles,
  )

  if (
    !accountsRequested &&
    "tagStore" in (data as any) &&
    (data as any).tagStore
  ) {
    const tagMerge = tagStorage.mergeTagStoresForSync({
      localTagStore: await tagStorage.exportTagStore(),
      remoteTagStore: (data as any).tagStore,
      localAccounts: [],
      remoteAccounts: [],
      localBookmarks: [],
      remoteBookmarks: [],
      localTaggables: [],
      remoteTaggables: incoming.profiles,
    })

    await tagStorage.importTagStore(tagMerge.tagStore)

    const config = {
      ...incoming,
      profiles: tagMerge.remoteTaggables,
    }

    if (strategy === IMPORT_SECTION_STRATEGIES.Replace) {
      await apiCredentialProfilesStorage.importConfig(config)
    } else {
      await apiCredentialProfilesStorage.mergeConfig(config)
    }
    return
  }

  if (strategy === IMPORT_SECTION_STRATEGIES.Replace) {
    await apiCredentialProfilesStorage.importConfig(incoming)
  } else {
    await apiCredentialProfilesStorage.mergeConfig(incoming)
  }
}

/** Imports V2 backups according to a per-section user import plan. */
async function importV2BackupWithPlan(
  data: BackupV2,
  plan: ImportPlan,
  options?: ImportFromBackupOptions,
): Promise<ImportResult> {
  let accountsImported = false
  let preferencesImported = false
  let channelConfigsImported = false
  let apiCredentialProfilesImported = false

  const accountsRequested = "accounts" in data
  const preferencesRequested = "preferences" in data
  const channelConfigsRequested =
    "channelConfigs" in data && Boolean((data as BackupFullV2).channelConfigs)
  const apiCredentialProfilesRequested =
    "apiCredentialProfiles" in data &&
    Boolean((data as BackupFullV2).apiCredentialProfiles)
  const accountStrategy = plan.accounts
  const preferenceStrategy = plan.preferences
  const channelConfigStrategy = plan.channelConfigs
  const apiCredentialProfilesStrategy = plan.apiCredentialProfiles

  if (accountsRequested && hasWriteStrategy(accountStrategy)) {
    if (accountStrategy === IMPORT_SECTION_STRATEGIES.Replace) {
      await importV2AccountsWithReplace(data)
    } else {
      await importV2AccountsWithMerge(data)
    }
    accountsImported = true
  }

  if (preferencesRequested && hasWriteStrategy(preferenceStrategy)) {
    await importV2PreferencesWithReplace(data, options)
    preferencesImported = true
  }

  if (channelConfigsRequested && hasWriteStrategy(channelConfigStrategy)) {
    if (channelConfigStrategy === IMPORT_SECTION_STRATEGIES.Replace) {
      await importV2ChannelConfigsWithReplace(data)
    } else {
      await importV2ChannelConfigsWithMerge(data)
    }
    channelConfigsImported = true
  }

  if (
    apiCredentialProfilesRequested &&
    hasWriteStrategy(apiCredentialProfilesStrategy)
  ) {
    await importV2ApiCredentialProfiles(
      data,
      toWriteStrategy(apiCredentialProfilesStrategy),
      accountsRequested,
    )
    apiCredentialProfilesImported = true
  }

  const anyImported =
    accountsImported ||
    preferencesImported ||
    channelConfigsImported ||
    apiCredentialProfilesImported

  if (!anyImported) {
    throw new ImportExportError("NO_IMPORTABLE_DATA")
  }

  const allImported =
    (!accountsRequested || accountsImported) &&
    (!preferencesRequested || preferencesImported) &&
    (!channelConfigsRequested || channelConfigsImported) &&
    (!apiCredentialProfilesRequested || apiCredentialProfilesImported)

  return {
    allImported,
    sections: {
      accounts: accountsImported,
      preferences: preferencesImported,
      channelConfigs: channelConfigsImported,
      apiCredentialProfiles: apiCredentialProfilesImported,
    },
  }
}

/**
 * Import a backup object into local storage in a version-aware way.
 *
 * Dispatches to specific handlers per version:
 * - V1 (or missing version): tolerant of legacy shapes and tries to import
 *   accounts, preferences and channelConfigs when present.
 * - V2 (BACKUP_VERSION): expects a flat structure with accounts / preferences /
 *   channelConfigs at root.
 * - Future versions: currently fall back to the tolerant V1-style import
 *   (importV1Backup). When adding V3+, define an importV3Backup and extend
 *   this dispatcher.
 */
export async function importFromBackupObject(
  data: RawBackupData,
  options?: ImportFromBackupOptions,
): Promise<ImportResult> {
  // timestamp is required for all versions; version is optional for backward compatibility
  if (!data.timestamp) {
    throw new ImportExportError("FORMAT_NOT_CORRECT")
  }

  const version = data.version ?? "1.0"

  if (version === "1.0") {
    return importV1Backup(data, options)
  }

  if (version === BACKUP_VERSION) {
    return importV2Backup(data as BackupV2, options)
  }

  // Unknown future version: fall back to tolerant V1-style import
  return importV1Backup(data, options)
}
