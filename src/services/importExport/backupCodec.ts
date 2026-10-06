import { BACKUP_VERSION } from "~/constants/importExport"
import { migrateAccountConfig } from "~/services/accounts/migrations/accountDataMigration"
import {
  assertSupportedApiCredentialProfilesConfigVersion,
  coerceApiCredentialProfilesConfig,
} from "~/services/apiCredentialProfiles/profileConfigCodec"
import {
  mergeFeatureGuidanceStates,
  type FeatureGuidanceState,
} from "~/services/featureGuidance/featureGuidanceState"
import {
  IMPORT_EXPORT_ERROR_CODES,
  ImportExportError,
  type BackupFullV2,
  type ParsedBackupSummary,
  type RawBackupData,
} from "~/services/importExport/backupContracts"
import { coerceChannelConfigSnapshot } from "~/services/managedSites/channelConfigStorage"
import type { AccountStorageConfig, SiteAccount, TagStore } from "~/types"
import type { ApiCredentialProfilesConfig } from "~/types/apiCredentialProfiles"
import type { ChannelConfigSnapshot } from "~/types/channelConfig"
import { formatLocaleDateTime } from "~/utils/core/formatters"

export const LEGACY_BACKUP_V3_VERSION = "3.0"

export const LEGACY_BACKUP_V2_VERSION = "2.0"

export const LEGACY_BACKUP_V1_VERSION = "1.0"

type SupportedBackupVersion =
  | typeof LEGACY_BACKUP_V1_VERSION
  | typeof LEGACY_BACKUP_V2_VERSION
  | typeof LEGACY_BACKUP_V3_VERSION
  | typeof BACKUP_VERSION

/** Classifies the backup envelope version for every read/import boundary. */
export function getSupportedBackupVersion(
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
    throw new ImportExportError(IMPORT_EXPORT_ERROR_CODES.VersionNotSupported)
  }
  return version
}

/**
 * V4 activates the V7 account check-in schema for every WebDAV merge path.
 * Keep already-current accounts byte-for-byte intact while upgrading the only
 * account schema emitted by the immediately preceding app version.
 */
export function canonicalizeV6Accounts(accounts: unknown[]): unknown[] {
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

/** Reads current guidance state plus released legacy gateway progress. */
export function readBackupFeatureGuidance(
  data: RawBackupData,
): FeatureGuidanceState | null {
  const nestedData =
    data.data && typeof data.data === "object" ? data.data : undefined
  const rootGuidance = data.featureGuidance ?? nestedData?.featureGuidance
  const preferences = data.preferences ?? nestedData?.preferences
  const legacyGatewayGuidance =
    preferences && typeof preferences === "object"
      ? preferences.gatewayGuidance
      : undefined

  if (rootGuidance === undefined && legacyGatewayGuidance === undefined) {
    return null
  }

  return mergeFeatureGuidanceStates(rootGuidance, {
    gatewayGuidance: legacyGatewayGuidance,
  })
}

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
export function readChannelConfigSnapshot(
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
    throw new ImportExportError(IMPORT_EXPORT_ERROR_CODES.FormatNotCorrect)
  }

  // V1/V2 numeric maps have no reliable scope identity and are intentionally ignored.
  return null
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
  featureGuidance: FeatureGuidanceState | null
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
      featureGuidance: null,
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
export function normalizeV2BackupForMerge(
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
  featureGuidance: FeatureGuidanceState | null
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
    featureGuidance: readBackupFeatureGuidance(data),
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
  featureGuidance: FeatureGuidanceState | null
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
    featureGuidance: readBackupFeatureGuidance(data),
    channelConfigs,
    tagStore: (data as any).tagStore ?? (data.data as any)?.tagStore ?? null,
    apiCredentialProfiles: null,
  }
}
