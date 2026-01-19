export const USAGE_HISTORY_SCHEDULE_MODE = {
  MANUAL: "manual",
  AFTER_REFRESH: "afterRefresh",
  ALARM: "alarm",
} as const

export type UsageHistoryScheduleMode =
  (typeof USAGE_HISTORY_SCHEDULE_MODE)[keyof typeof USAGE_HISTORY_SCHEDULE_MODE]

/**
 * User preferences controlling usage-history synchronization and retention.
 *
 * Notes:
 * - The feature is opt-in via `enabled`.
 * - `scheduleMode` controls when automatic sync is triggered.
 * - `syncIntervalMinutes` is used as the minimum interval between sync attempts
 *   for automatic modes, and as the Alarms API period when `scheduleMode=alarm`.
 */
export interface UsageHistoryPreferences {
  enabled: boolean
  /**
   * Number of days to retain usage history data (including aggregates and cursor).
   */
  retentionDays: number
  scheduleMode: UsageHistoryScheduleMode
  /**
   * Minimum interval between sync attempts, in minutes.
   */
  syncIntervalMinutes: number
}

export const DEFAULT_USAGE_HISTORY_PREFERENCES: UsageHistoryPreferences = {
  enabled: true,
  retentionDays: 7,
  scheduleMode: USAGE_HISTORY_SCHEDULE_MODE.AFTER_REFRESH,
  syncIntervalMinutes: 6 * 60,
}

export interface UsageHistoryAggregate {
  requests: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  quotaConsumed: number
}

/**
 * Privacy-safe bounded response-speed aggregates (no raw per-request timings).
 *
 * Notes:
 * - `sum/max` are stored in seconds as reported by New-API `/api/log/self` (`use_time`).
 * - `buckets` uses a fixed bucket configuration (defined in usage-history core),
 *   enabling histogram views and percentile approximation without raw logs.
 */
export interface UsageHistoryLatencyAggregate {
  count: number
  sum: number
  max: number
  slowCount: number
  unknownCount: number
  buckets: number[]
}

/**
 * Cursor state for incremental ingestion from `/api/log/self`.
 *
 * Notes:
 * - New-API masks log IDs, so the cursor is based on the highest ingested
 *   `created_at` (unix seconds) and a bounded set of privacy-safe fingerprints
 *   to dedupe items at the boundary timestamp.
 */
export interface UsageHistoryCursor {
  /**
   * Highest `created_at` (unix seconds) that has been ingested for this account.
   */
  lastSeenCreatedAt: number
  /**
   * Dedupe fingerprints for records at `lastSeenCreatedAt`.
   *
   * New-API masks log IDs on `/api/log/self`, so we cannot rely on `id` as a cursor.
   */
  fingerprintsAtLastSeenCreatedAt: string[]
}

export type UsageHistorySyncState =
  | "never"
  | "success"
  | "error"
  | "unsupported"

export interface UsageHistorySyncStatus {
  state: UsageHistorySyncState
  /**
   * Last time a sync attempt finished (success or failure).
   */
  lastSyncAt?: number
  /**
   * Last time a sync attempt succeeded.
   */
  lastSuccessAt?: number
  /**
   * Sanitized warning summary (non-fatal) from the last attempt.
   */
  lastWarning?: string
  /**
   * Sanitized error summary from the last failed attempt.
   */
  lastError?: string
  /**
   * When set, the account is considered unsupported until this timestamp (ms).
   */
  unsupportedUntil?: number
}

/**
 * Per-account usage-history store.
 */
export interface UsageHistoryAccountStore {
  /**
   * Cursor for incremental ingestion from New-API `/api/log/self`.
   */
  cursor: UsageHistoryCursor
  status: UsageHistorySyncStatus
  /**
   * Aggregates keyed by local day bucket (`YYYY-MM-DD`).
   */
  daily: Record<string, UsageHistoryAggregate>
  /**
   * Aggregates keyed by local day bucket (`YYYY-MM-DD`), then local hour bucket (`00`-`23`).
   */
  hourly: Record<string, Record<string, UsageHistoryAggregate>>
  /**
   * Per-model aggregates keyed by model name, then local day bucket (`YYYY-MM-DD`).
   */
  dailyByModel: Record<string, Record<string, UsageHistoryAggregate>>
  /**
   * Token labels keyed by token id (for display only; token secrets are never stored).
   */
  tokenNamesById: Record<string, string>
  /**
   * Per-token aggregates keyed by token id, then local day bucket (`YYYY-MM-DD`).
   */
  dailyByToken: Record<string, Record<string, UsageHistoryAggregate>>
  /**
   * Per-token aggregates keyed by token id, then local day bucket (`YYYY-MM-DD`), then hour bucket (`00`-`23`).
   */
  hourlyByToken: Record<
    string,
    Record<string, Record<string, UsageHistoryAggregate>>
  >
  /**
   * Per-token per-model aggregates keyed by token id, then model name, then day bucket.
   */
  dailyByTokenByModel: Record<
    string,
    Record<string, Record<string, UsageHistoryAggregate>>
  >
  /**
   * Response-speed aggregates keyed by local day bucket (`YYYY-MM-DD`).
   */
  latencyDaily: Record<string, UsageHistoryLatencyAggregate>
  /**
   * Per-model response-speed aggregates keyed by model name, then day bucket.
   */
  latencyDailyByModel: Record<
    string,
    Record<string, UsageHistoryLatencyAggregate>
  >
  /**
   * Per-token response-speed aggregates keyed by token id, then day bucket.
   */
  latencyDailyByToken: Record<
    string,
    Record<string, UsageHistoryLatencyAggregate>
  >
  /**
   * Per-token per-model response-speed aggregates keyed by token id, then model name, then day bucket.
   */
  latencyDailyByTokenByModel: Record<
    string,
    Record<string, Record<string, UsageHistoryLatencyAggregate>>
  >
}

/**
 * Persisted store schema version for usage-history aggregates.
 *
 * Backward-compatibility is intentionally not supported: older schemas are treated
 * as absent and the system starts with an empty store.
 */
export const USAGE_HISTORY_STORE_SCHEMA_VERSION = 1 as const

/**
 * Root usage-history store structure.
 */
export interface UsageHistoryStore {
  schemaVersion: typeof USAGE_HISTORY_STORE_SCHEMA_VERSION
  accounts: Record<string, UsageHistoryAccountStore>
}

export interface UsageHistoryExportSelection {
  accountIds: string[]
  startDay: string
  endDay: string
}

export const USAGE_HISTORY_EXPORT_SCHEMA_VERSION = 1 as const

/**
 * Exported usage-history data structure.
 */
export interface UsageHistoryExport {
  schemaVersion: typeof USAGE_HISTORY_EXPORT_SCHEMA_VERSION
  createdAt: number
  selection: UsageHistoryExportSelection
  /**
   * Filtered per-account aggregates for the selection window.
   */
  accounts: Record<
    string,
    Pick<
      UsageHistoryAccountStore,
      | "daily"
      | "hourly"
      | "dailyByModel"
      | "tokenNamesById"
      | "dailyByToken"
      | "hourlyByToken"
      | "dailyByTokenByModel"
      | "latencyDaily"
      | "latencyDailyByModel"
      | "latencyDailyByToken"
      | "latencyDailyByTokenByModel"
    >
  >
  /**
   * Fused aggregates across selected accounts for the selection window.
   */
  fused: {
    daily: Record<string, UsageHistoryAggregate>
    dailyByModel: Record<string, Record<string, UsageHistoryAggregate>>
    hourly: Record<string, Record<string, UsageHistoryAggregate>>
    byModel: Record<string, UsageHistoryAggregate>
    tokenNamesById: Record<string, string>
    dailyByToken: Record<string, Record<string, UsageHistoryAggregate>>
    hourlyByToken: Record<
      string,
      Record<string, Record<string, UsageHistoryAggregate>>
    >
    dailyByTokenByModel: Record<
      string,
      Record<string, Record<string, UsageHistoryAggregate>>
    >
    byToken: Record<string, UsageHistoryAggregate>
    byTokenByModel: Record<string, Record<string, UsageHistoryAggregate>>
    latencyDaily: Record<string, UsageHistoryLatencyAggregate>
    latencyDailyByToken: Record<
      string,
      Record<string, UsageHistoryLatencyAggregate>
    >
    latencyByModel: Record<string, UsageHistoryLatencyAggregate>
    latencyByToken: Record<string, UsageHistoryLatencyAggregate>
    latencyByTokenByModel: Record<
      string,
      Record<string, UsageHistoryLatencyAggregate>
    >
  }
}
