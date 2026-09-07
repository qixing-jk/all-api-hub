import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"

import type { ChannelModelFilterRule } from "./channelModelFilters"

/**
 * Single channel execution result
 */
export interface ExecutionItemResult {
  resourceRef: ManagedResourceRef
  channelName: string
  ok: boolean
  httpStatus?: number
  message?: string
  attempts: number
  finishedAt: number
  oldModels?: string[]
  newModels?: string[]
}

/**
 * Execution statistics
 */
export interface ExecutionStatistics {
  total: number
  successCount: number
  failureCount: number
  durationMs: number
  startedAt: number
  endedAt: number
}

/**
 * Complete execution result with items and stats
 */
export interface ExecutionResult<TItem = ExecutionItemResult> {
  items: TItem[]
  statistics: ExecutionStatistics
}

/** Older executions cannot safely be assigned to a deployment after the fact. */
export type ExecutionHistoryItemResult = Omit<
  ExecutionItemResult,
  "resourceRef"
> & {
  resourceRef: ManagedResourceRef | null
  legacyResourceId?: string
}

export type ExecutionHistoryResult = ExecutionResult<ExecutionHistoryItemResult>

/**
 * Execution filter options
 */
export interface ExecutionFilter {
  status?: "success" | "failure" | "all"
  httpStatus?: number
  searchKeyword?: string
}

/**
 * New API Model Sync Preferences
 */
export interface ManagedSiteModelSyncPreferences {
  enableSync: boolean
  intervalMs: number
  concurrency: number
  maxRetries: number
  /**
   * Maximum duration allowed for a single channel execution.
   * 0 = unlimited.
   */
  channelProcessingTimeout: number
  rateLimit: {
    requestsPerMinute: number
    burst: number
  }
  /**
   * Optional allow-list of models that can be synced.
   * Empty array = sync all upstream models.
   */
  allowedModels: string[]
  globalChannelModelFilters: ChannelModelFilterRule[]
}

/**
 * Batch execution options
 */
export interface BatchExecutionOptions {
  concurrency: number
  maxRetries: number
  /**
   * Maximum duration allowed for a single channel execution.
   * 0 or undefined = unlimited.
   */
  channelProcessingTimeout?: number
  onProgress?: (payload: {
    completed: number
    total: number
    lastResult: ExecutionItemResult
  }) => void | Promise<void>
}

/**
 * Current execution progress
 */
export interface ExecutionProgress {
  isRunning: boolean
  total: number
  completed: number
  failed: number
  lastResult?: ExecutionItemResult
  currentChannel?: string
}
