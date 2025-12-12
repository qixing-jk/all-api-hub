/**
 * WebDAV configuration types
 */

export interface WebDAVSettings {
  url: string
  username: string
  password: string
  autoSync: boolean
  syncInterval: number // seconds
  syncStrategy: WebDAVSyncStrategy
}

export const WEBDAV_SYNC_STRATEGIES = {
  MERGE: "merge",
  MAX_MERGE: "max_merge",
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
  autoSync: false,
  syncInterval: 3600,
  syncStrategy: WEBDAV_SYNC_STRATEGIES.MERGE,
}
