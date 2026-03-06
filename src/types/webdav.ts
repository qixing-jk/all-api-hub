/**
 * WebDAV configuration types
 */

export const WEBDAV_SYNC_DATA_KEYS = [
  "accounts",
  "bookmarks",
  "apiCredentialProfiles",
  "preferences",
] as const

export type WebDAVSyncDataKey = (typeof WEBDAV_SYNC_DATA_KEYS)[number]

export type WebDAVSyncDataSelection = Record<WebDAVSyncDataKey, boolean>

/**
 * Builds a normalized WebDAV sync selection object from the canonical key list.
 */
function createWebdavSyncDataSelection(
  resolver: (key: WebDAVSyncDataKey) => boolean,
): WebDAVSyncDataSelection {
  return Object.fromEntries(
    WEBDAV_SYNC_DATA_KEYS.map((key) => [key, resolver(key)]),
  ) as WebDAVSyncDataSelection
}

export const DEFAULT_WEBDAV_SYNC_DATA_SELECTION: WebDAVSyncDataSelection =
  createWebdavSyncDataSelection(() => true)

/**
 * Resolve the effective sync data selection:
 * - Missing values default to "all checked" (preserve legacy behavior).
 * - Invalid values are ignored.
 */
export function resolveWebdavSyncDataSelection(
  raw: unknown,
): WebDAVSyncDataSelection {
  const rawSelection =
    raw && typeof raw === "object"
      ? (raw as Partial<Record<WebDAVSyncDataKey, unknown>>)
      : {}

  return createWebdavSyncDataSelection((key) =>
    typeof rawSelection[key] === "boolean" ? rawSelection[key] : true,
  )
}

/**
 * Returns true when no WebDAV sync domain is enabled.
 */
export function isWebdavSyncDataSelectionEmpty(
  selection: WebDAVSyncDataSelection,
): boolean {
  return WEBDAV_SYNC_DATA_KEYS.every((key) => !selection[key])
}

export interface WebDAVSettings {
  url: string
  username: string
  password: string
  /**
   * Whether to encrypt backups before uploading them to WebDAV.
   *
   * When enabled, backups are uploaded as an encrypted envelope JSON.
   * Optional for backwards compatibility with older preferences.
   */
  backupEncryptionEnabled?: boolean
  /**
   * Password used to encrypt/decrypt WebDAV backup content.
   *
   * This is stored in user preferences for convenience and used by:
   * - upload: encrypt before PUT
   * - download: decrypt after GET when content is an envelope
   *
   * Optional for backwards compatibility with older preferences.
   */
  backupEncryptionPassword?: string
  /**
   * Controls which domains participate in WebDAV sync.
   *
   * Optional for backwards compatibility with older preferences.
   */
  syncData?: Partial<WebDAVSyncDataSelection>
  autoSync: boolean
  syncInterval: number // seconds
  syncStrategy: WebDAVSyncStrategy
}

export const WEBDAV_SYNC_STRATEGIES = {
  MERGE: "merge",
  UPLOAD_ONLY: "upload_only",
  DOWNLOAD_ONLY: "download_only",
} as const

export type WebDAVSyncStrategy =
  (typeof WEBDAV_SYNC_STRATEGIES)[keyof typeof WEBDAV_SYNC_STRATEGIES]

export interface WebDAVConfig {
  url: string
  username: string
  password: string
}

// Default WebDAV settings
export const DEFAULT_WEBDAV_SETTINGS: WebDAVSettings = {
  url: "",
  username: "",
  password: "",
  // Encryption is opt-in and defaults to disabled.
  backupEncryptionEnabled: false,
  backupEncryptionPassword: "",
  syncData: DEFAULT_WEBDAV_SYNC_DATA_SELECTION,
  autoSync: false,
  syncInterval: 3600,
  syncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
}
