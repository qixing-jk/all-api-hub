import { normalizeBackupForMerge } from "~/services/importExport/backupCodec"
import type { RawBackupData } from "~/services/importExport/backupContracts"
import { type UserPreferences } from "~/services/preferences/preferencesSchema"

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

type WebdavBackupPresence = {
  hasAccounts: boolean
  hasAccountsList: boolean
  hasBookmarksList: boolean
  hasPreferences: boolean
  hasFeatureGuidance: boolean
  hasApiCredentialProfiles: boolean
  hasTagStore: boolean
  hasChannelConfigs: boolean
  hasPinnedAccountIds: boolean
  hasOrderedAccountIds: boolean
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
      hasFeatureGuidance: false,
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

  const hasFeatureGuidance =
    Object.prototype.hasOwnProperty.call(root, "featureGuidance") ||
    (legacyData
      ? Object.prototype.hasOwnProperty.call(legacyData, "featureGuidance")
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
    hasFeatureGuidance,
    hasApiCredentialProfiles,
    hasTagStore,
    hasChannelConfigs,
    hasPinnedAccountIds,
    hasOrderedAccountIds,
  }
}

/** Reads raw presence and canonical content together, preserving explicit null sections. */
export function readWebdavBackupFacts(
  raw: RawBackupData,
  preferences: UserPreferences,
) {
  return {
    presence: detectWebdavBackupPresence(raw),
    normalized: normalizeBackupForMerge(raw, preferences),
    rawSections: {
      preferences: readBackupSection(raw, "preferences"),
      featureGuidance: readBackupSection(raw, "featureGuidance"),
      apiCredentialProfiles: readBackupSection(raw, "apiCredentialProfiles"),
      tagStore: readBackupSection(raw, "tagStore"),
    },
  }
}
