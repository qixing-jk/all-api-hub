import { BACKUP_VERSION } from "~/constants/importExport"
import { accountStorage } from "~/services/accounts/accountStorage"
import { migrateAccountConfig } from "~/services/accounts/migrations/accountDataMigration"
import {
  apiCredentialProfilesStorage,
  assertSupportedApiCredentialProfilesConfigVersion,
  coerceApiCredentialProfilesConfig,
} from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import {
  channelConfigStorage,
  coerceChannelConfigSnapshot,
} from "~/services/managedSites/channelConfigStorage"
import { ensureLegacyChannelConfigMigrationReady } from "~/services/managedSites/legacyChannelConfigMigration"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import { userPreferences } from "~/services/preferences/userPreferences"
import { tagStorage } from "~/services/tags/tagStorage"
import { createDefaultTagStore } from "~/services/tags/tagStoreUtils"
import type { AccountStorageConfig, SiteAccount, TagStore } from "~/types"
import type { ApiCredentialProfilesConfig } from "~/types/apiCredentialProfiles"
import type { ChannelConfigSnapshot } from "~/types/channelConfig"
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
  | "VERSION_NOT_SUPPORTED"

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
 * V2: flat structure with numeric channelConfigs on the root object.
 * V3: keeps the flat structure and replaces channelConfigs with a scoped snapshot.
 * V4: keeps the V3 envelope and requires canonical V7 account check-in data.
 *
 * When introducing V5+, prefer adding a dedicated import handler and updating
 * importFromBackupObject + normalizeBackupForMerge dispatch logic.
 */
export { BACKUP_VERSION }
const LEGACY_BACKUP_V3_VERSION = "3.0"
const LEGACY_BACKUP_V2_VERSION = "2.0"
const LEGACY_BACKUP_V1_VERSION = "1.0"

type SupportedBackupVersion =
  | typeof LEGACY_BACKUP_V1_VERSION
  | typeof LEGACY_BACKUP_V2_VERSION
  | typeof LEGACY_BACKUP_V3_VERSION
  | typeof BACKUP_VERSION

/** Classifies the backup envelope version for every read/import boundary. */
function getSupportedBackupVersion(
  data: RawBackupData,
): SupportedBackupVersion {
  const version =
    data.version === undefined ? LEGACY_BACKUP_V1_VERSION : data.version
  if (
    version !== LEGACY_BACKUP_V1_VERSION &&
    version !== LEGACY_BACKUP_V2_VERSION &&
    version !== LEGACY_BACKUP_V3_VERSION &&
    version !== BACKUP_VERSION
  ) {
    throw new ImportExportError("VERSION_NOT_SUPPORTED")
  }
  return version
}

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
 * V4 activates the V7 account check-in schema for every WebDAV merge path.
 * Keep already-current accounts byte-for-byte intact while upgrading the only
 * account schema emitted by the immediately preceding app version.
 */
function canonicalizeV6Accounts(accounts: unknown[]): unknown[] {
  return accounts.map((account) => {
    if (
      !account ||
      typeof account !== "object" ||
      (account as { configVersion?: unknown }).configVersion !== 6
    ) {
      return account
    }

    return migrateAccountConfig(account as SiteAccount)
  })
}

/**
 * Current flat backup payload (used by "export all" and WebDAV sync uploads).
 * The V2 name is retained to avoid a broad public type rename; writers emit V4.
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
  channelConfigs: ChannelConfigSnapshot
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
 * accept both canonical flat exports (historically named BackupV2) and
 * historical/unknown shapes. The stricter interfaces are used at export call
 * sites to guarantee
 * that what we write conforms to the latest schema.
 */
export type RawBackupData = LegacyBackupLike

/** Finds a channel-config section without conflating absence with invalid data. */
function readRawChannelConfigSection(data: RawBackupData): {
  present: boolean
  value: unknown
} {
  if (Object.prototype.hasOwnProperty.call(data, "channelConfigs")) {
    return { present: true, value: data.channelConfigs }
  }

  const nestedData = data.data
  if (
    nestedData &&
    typeof nestedData === "object" &&
    Object.prototype.hasOwnProperty.call(nestedData, "channelConfigs")
  ) {
    return { present: true, value: nestedData.channelConfigs }
  }

  return { present: false, value: undefined }
}

/** Reads and validates the scoped channel-config snapshot from a backup envelope. */
function readChannelConfigSnapshot(
  data: RawBackupData,
): ChannelConfigSnapshot | null {
  const rawSection = readRawChannelConfigSection(data)
  if (!rawSection.present) return null

  const snapshot = coerceChannelConfigSnapshot(rawSection.value)
  if (snapshot) return snapshot

  const raw = rawSection.value
  const looksLikeScopedSnapshot =
    Boolean(raw) &&
    typeof raw === "object" &&
    ("schemaVersion" in (raw as object) || "configs" in (raw as object))
  if (data.version === BACKUP_VERSION || looksLikeScopedSnapshot) {
    throw new ImportExportError("FORMAT_NOT_CORRECT")
  }

  // V1/V2 numeric maps have no reliable scope identity and are intentionally ignored.
  return null
}

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

export const IMPORT_SECTION_KEYS = {
  Accounts: "accounts",
  ApiCredentialProfiles: "apiCredentialProfiles",
  ChannelConfigs: "channelConfigs",
  Preferences: "preferences",
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
  [IMPORT_SECTION_KEYS.Accounts]?: ImportSectionStrategy
  [IMPORT_SECTION_KEYS.Preferences]?: ImportPreferenceStrategy
  [IMPORT_SECTION_KEYS.ChannelConfigs]?: ImportSectionStrategy
  [IMPORT_SECTION_KEYS.ApiCredentialProfiles]?: ImportSectionStrategy
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
 * import UI. This is tolerant of legacy and current flat payload shapes and
 * never throws: on invalid JSON it returns `{ valid: false }`.
 */
export function parseBackupSummary(
  importData: string,
  unknownLabel: string,
): ParsedBackupSummary | { valid: false } | null {
  if (!importData.trim()) return null

  try {
    const data = JSON.parse(importData) as RawBackupData
    getSupportedBackupVersion(data)

    const hasAccounts = Boolean(data.accounts || data.type === "accounts")
    const hasPreferences = Boolean(
      data.preferences || data.type === "preferences",
    )
    const hasChannelConfigs = readChannelConfigSnapshot(data) !== null
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
  const channelConfigSnapshot = readChannelConfigSnapshot(data)
  const channelConfigsRequested = channelConfigSnapshot !== null
  const plan = options?.plan

  // accounts: support both legacy partial exports and older full exports
  if (
    accountsRequested &&
    shouldImportSection(plan, IMPORT_SECTION_KEYS.Accounts)
  ) {
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
        accounts: canonicalizeV6Accounts(accountsData) as SiteAccount[],
      })
      // Ensure legacy imports (string tags) are migrated to tag ids.
      await tagStorage.ensureLegacyMigration()
      accountsImported = true
    }
  }

  // preferences
  if (
    preferencesRequested &&
    shouldImportSection(plan, IMPORT_SECTION_KEYS.Preferences)
  ) {
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
  if (
    channelConfigsRequested &&
    shouldImportSection(plan, IMPORT_SECTION_KEYS.ChannelConfigs)
  ) {
    await channelConfigStorage.importConfigs(channelConfigSnapshot)
    channelConfigsImported = true
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
 * Normalize a supported backup payload into the structure used by WebDAV merge.
 * Missing versions remain legacy V1; explicit unknown versions are rejected so
 * a newer schema cannot be interpreted using older semantics.
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
  channelConfigs: ChannelConfigSnapshot | null
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

  assertSupportedApiCredentialProfilesConfigVersion(
    (data as Record<string, unknown>).apiCredentialProfiles,
  )

  const version = getSupportedBackupVersion(data)

  if (
    version === BACKUP_VERSION ||
    version === LEGACY_BACKUP_V3_VERSION ||
    version === LEGACY_BACKUP_V2_VERSION
  ) {
    // V2-V4 share the flat backup envelope; V3 introduced scoped channelConfigs.
    return normalizeV2BackupForMerge(data as BackupFullV2, localPreferences)
  }

  // V1 uses tolerant legacy normalization.
  return normalizeV1BackupForMerge(data, localPreferences)
}

/**
 * Normalize flat V2-V4 backups into the shape WebDAV merge expects.
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
  channelConfigs: ChannelConfigSnapshot | null
  tagStore: TagStore | null
  apiCredentialProfiles: ApiCredentialProfilesConfig | null
} {
  const accountsField: any = data.accounts
  const accountsConfig = Array.isArray(accountsField)
    ? { accounts: accountsField }
    : accountsField || {}
  const accounts = Array.isArray(accountsConfig.accounts)
    ? canonicalizeV6Accounts(accountsConfig.accounts)
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

  const channelConfigs = readChannelConfigSnapshot(data)

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
 * Normalize legacy V1 backups into merge-friendly structure.
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
  channelConfigs: ChannelConfigSnapshot | null
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
    ? canonicalizeV6Accounts(accountsConfig.accounts)
    : Array.isArray(legacyAccounts)
      ? canonicalizeV6Accounts(legacyAccounts)
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

  const channelConfigs = readChannelConfigSnapshot(data)

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
 * Import a canonical flat V2-V4 backup (full or partial) into local storage.
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
  const channelConfigSnapshot = readChannelConfigSnapshot(data)
  const channelConfigsRequested = channelConfigSnapshot !== null
  const apiCredentialProfilesRequested =
    "apiCredentialProfiles" in data &&
    Boolean((data as BackupFullV2).apiCredentialProfiles)

  // V2-V4 use a flat structure with sections directly on the root.

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
    await channelConfigStorage.importConfigs(channelConfigSnapshot)
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
    accounts: canonicalizeV6Accounts(accounts) as SiteAccount[],
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
  const snapshot = readChannelConfigSnapshot(data)
  if (!snapshot) return
  await channelConfigStorage.importConfigs(snapshot)
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

/** Merges V2 accounts/bookmarks into the current account storage. */
async function importV2AccountsWithMerge(
  data: BackupV2,
  remoteApiCredentialProfiles: ApiCredentialProfilesConfig["profiles"] = [],
) {
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
    remoteTaggables: remoteApiCredentialProfiles,
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
  return {
    remoteApiCredentialProfiles: tagMerge.remoteTaggables,
  }
}

/** Merges V2 channel configuration into current channel configuration. */
async function importV2ChannelConfigsWithMerge(data: BackupV2) {
  const normalizedRemote = normalizeV2BackupForMerge(data as BackupFullV2, null)
  if (!normalizedRemote.channelConfigs) return
  await channelConfigStorage.mergeConfigs(normalizedRemote.channelConfigs)
}

/** Imports V2 API credential profiles using either merge or replace semantics. */
async function importV2ApiCredentialProfiles(
  data: BackupV2,
  strategy: ImportWriteStrategy,
  options: {
    reconcileTags: boolean
    remoteApiCredentialProfiles?: ApiCredentialProfilesConfig["profiles"]
  },
) {
  const incoming = coerceApiCredentialProfilesConfig(
    (data as BackupFullV2).apiCredentialProfiles,
  )

  if (options.remoteApiCredentialProfiles) {
    const config = {
      ...incoming,
      profiles: options.remoteApiCredentialProfiles,
    }

    if (strategy === IMPORT_SECTION_STRATEGIES.Replace) {
      await apiCredentialProfilesStorage.importConfig(config)
    } else {
      await apiCredentialProfilesStorage.mergeConfig(config)
    }
    return
  }

  if (
    options.reconcileTags &&
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
  const channelConfigsRequested = readChannelConfigSnapshot(data) !== null
  const apiCredentialProfilesRequested =
    "apiCredentialProfiles" in data &&
    Boolean((data as BackupFullV2).apiCredentialProfiles)
  const accountStrategy = plan.accounts
  const preferenceStrategy = plan.preferences
  const channelConfigStrategy = plan.channelConfigs
  const apiCredentialProfilesStrategy = plan.apiCredentialProfiles
  const apiCredentialProfilesConfig = apiCredentialProfilesRequested
    ? coerceApiCredentialProfilesConfig(
        (data as BackupFullV2).apiCredentialProfiles,
      )
    : null
  let remappedApiCredentialProfiles:
    | ApiCredentialProfilesConfig["profiles"]
    | undefined

  if (accountsRequested && hasWriteStrategy(accountStrategy)) {
    if (accountStrategy === IMPORT_SECTION_STRATEGIES.Replace) {
      await importV2AccountsWithReplace(data)
    } else {
      const mergeResult = await importV2AccountsWithMerge(
        data,
        apiCredentialProfilesConfig?.profiles ?? [],
      )
      remappedApiCredentialProfiles = mergeResult.remoteApiCredentialProfiles
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
      {
        reconcileTags:
          !accountsImported ||
          accountStrategy !== IMPORT_SECTION_STRATEGIES.Replace,
        remoteApiCredentialProfiles: remappedApiCredentialProfiles,
      },
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
 * - V2: imports flat account/preference sections and ignores numeric channel configs.
 * - V3: imports the same flat sections plus scoped channel configs.
 * - V4 (BACKUP_VERSION): keeps V3's envelope and writes canonical V7 accounts.
 * - Future or otherwise unknown explicit versions are rejected so their data is
 *   not interpreted through an older schema.
 */
export async function importFromBackupObject(
  data: RawBackupData,
  options?: ImportFromBackupOptions,
): Promise<ImportResult> {
  // timestamp is required for all versions; version is optional for backward compatibility
  if (!data.timestamp) {
    throw new ImportExportError("FORMAT_NOT_CORRECT")
  }

  const version = getSupportedBackupVersion(data)

  const incomingChannelConfigs = readChannelConfigSnapshot(data)
  const channelConfigStrategy =
    options?.plan?.channelConfigs ??
    (options?.mode === IMPORT_SECTION_STRATEGIES.Merge
      ? IMPORT_SECTION_STRATEGIES.Merge
      : IMPORT_SECTION_STRATEGIES.Replace)
  if (
    incomingChannelConfigs !== null &&
    channelConfigStrategy === IMPORT_SECTION_STRATEGIES.Merge
  ) {
    await ensureLegacyChannelConfigMigrationReady({ bypassBackoff: true })
  }

  if (version === LEGACY_BACKUP_V1_VERSION) {
    return importV1Backup(data, options)
  }

  if (
    version === BACKUP_VERSION ||
    version === LEGACY_BACKUP_V3_VERSION ||
    version === LEGACY_BACKUP_V2_VERSION
  ) {
    return importV2Backup(data as BackupV2, options)
  }

  // Compile-time exhaustiveness plus a defensive runtime guard for untyped data.
  const exhaustiveVersion: never = version
  throw new ImportExportError(exhaustiveVersion)
}
