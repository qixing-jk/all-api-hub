/**
 * WebDAV configuration types
 */

export interface WebDAVSettings {
  url: string
  username: string
  password: string
  autoSync: boolean
  syncInterval: number // seconds
  syncStrategy: "merge" | "upload_only" | "download_only"
}

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
  syncStrategy: "merge"
}
