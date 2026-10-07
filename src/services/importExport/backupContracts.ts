import { type FeatureGuidanceState } from "~/services/featureGuidance/featureGuidanceState"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import type { AccountStorageConfig, TagStore } from "~/types"
import type { ApiCredentialProfilesConfig } from "~/types/apiCredentialProfiles"
import type { ChannelConfigSnapshot } from "~/types/channelConfig"

export const IMPORT_EXPORT_ERROR_CODES = {
  FormatNotCorrect: "FORMAT_NOT_CORRECT",
  ImportFailed: "IMPORT_FAILED",
  NoImportableData: "NO_IMPORTABLE_DATA",
  VersionNotSupported: "VERSION_NOT_SUPPORTED",
} as const

export type ImportExportErrorCode =
  (typeof IMPORT_EXPORT_ERROR_CODES)[keyof typeof IMPORT_EXPORT_ERROR_CODES]

export class ImportExportError extends Error {
  readonly code: ImportExportErrorCode

  constructor(code: ImportExportErrorCode) {
    super(code)
    this.name = "ImportExportError"
    this.code = code
  }
}

export interface ParsedBackupSummary {
  valid: boolean
  hasAccounts: boolean
  hasPreferences: boolean
  hasChannelConfigs: boolean
  hasTagStore: boolean
  hasApiCredentialProfiles: boolean
  timestamp: string
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
  /** Feature-introduction progress synchronized with the preferences section. */
  featureGuidance?: FeatureGuidanceState
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
  featureGuidance?: FeatureGuidanceState
}

export type BackupV2 =
  | BackupFullV2
  | BackupAccountsPartialV2
  | BackupPreferencesPartialV2

/**
 * Legacy / tolerant backup payload (primarily for V1 and older shapes).
 * Kept broad on purpose to accept historical data from users.
 */
export type LegacyBackupLike = {
  version?: string
  timestamp?: number | string
  type?: "accounts" | "preferences" | "channelConfigs" | string
  accounts?: any
  preferences?: any
  featureGuidance?: any
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
