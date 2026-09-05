/** Provider-neutral cloud backup and sync types. */
export const CLOUD_SYNC_PROVIDERS = {
  WEBDAV: "webdav",
  GITHUB_GIST: "github_gist",
} as const

export type CloudSyncProvider =
  (typeof CLOUD_SYNC_PROVIDERS)[keyof typeof CLOUD_SYNC_PROVIDERS]

export interface GitHubGistSettings {
  /** GitHub personal access token. Stored locally and never exported. */
  token: string
  /** Existing Gist id. Empty until a user creates or connects a Gist. */
  gistId: string
  /** Last verified HTML link, safe to display but not included in backups. */
  gistUrl?: string
}

export const DEFAULT_GITHUB_GIST_SETTINGS: GitHubGistSettings = {
  token: "",
  gistId: "",
  gistUrl: "",
}

export const CLOUD_SYNC_ERROR_CODES = {
  CONFIG_INCOMPLETE: "CLOUD_SYNC_CONFIG_INCOMPLETE",
  INVALID_TOKEN: "CLOUD_SYNC_INVALID_TOKEN",
  PERMISSION_DENIED: "CLOUD_SYNC_PERMISSION_DENIED",
  RATE_LIMITED: "CLOUD_SYNC_RATE_LIMITED",
  NOT_FOUND: "CLOUD_SYNC_NOT_FOUND",
  PUBLIC_GIST: "CLOUD_SYNC_PUBLIC_GIST",
  UNINITIALIZED: "CLOUD_SYNC_UNINITIALIZED",
  REMOTE_EMPTY: "CLOUD_SYNC_REMOTE_EMPTY",
  REMOTE_CORRUPTED: "CLOUD_SYNC_REMOTE_CORRUPTED",
  REMOTE_SCHEMA_INVALID: "CLOUD_SYNC_SCHEMA_INVALID",
  CONFLICT: "CLOUD_SYNC_CONFLICT",
  NETWORK: "CLOUD_SYNC_NETWORK",
  REMOTE_UNAVAILABLE: "CLOUD_SYNC_REMOTE_UNAVAILABLE",
  ENCRYPTION_REQUIRED: "CLOUD_SYNC_ENCRYPTION_REQUIRED",
} as const

export type CloudSyncErrorCode =
  (typeof CLOUD_SYNC_ERROR_CODES)[keyof typeof CLOUD_SYNC_ERROR_CODES]

export interface CloudSyncStatus {
  provider: CloudSyncProvider
  status: "idle" | "running" | "success" | "error"
  lastSyncTime: number
  errorCode?: CloudSyncErrorCode
  retryAt?: number
  remoteRevision?: string
}
