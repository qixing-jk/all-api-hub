/**
 * WebDAV configuration types
 */

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
  autoSync: false,
  syncInterval: 3600,
  syncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
}
