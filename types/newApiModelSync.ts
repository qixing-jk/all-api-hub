/**
 * Single channel execution result
 */
export interface ExecutionItemResult {
  channelId: number
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
export interface ExecutionResult {
  items: ExecutionItemResult[]
  statistics: ExecutionStatistics
}

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
export interface NewApiModelSyncPreferences {
  enableSync: boolean
  intervalMs: number
  concurrency: number
  maxRetries: number
  rateLimit: {
    requestsPerMinute: number
    burst: number
  }
  /**
   * Optional allow-list of models that can be synced.
   * Empty array = sync all upstream models.
   */
  allowedModels: string[]
}

/**
 * Batch execution options
 */
export interface BatchExecutionOptions {
  concurrency: number
  maxRetries: number
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
