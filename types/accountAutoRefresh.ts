export interface AccountAutoRefresh {
  // 是否启用定时自动刷新
  enabled: boolean
  // 刷新间隔（秒）
  interval: number
  // 最小刷新间隔（秒）
  minInterval: number
  // 打开插件时自动刷新
  refreshOnOpen: boolean
}

/**
 * Lower bounds for user-configurable refresh cadences (seconds).
 *
 * - `interval`: background auto-refresh timer cadence.
 * - `minInterval`: per-account guard interval used when refresh isn't forced.
 */
export const ACCOUNT_AUTO_REFRESH_INTERVAL_MIN_SECONDS = 60
export const ACCOUNT_AUTO_REFRESH_MIN_INTERVAL_MIN_SECONDS = 30

export const DEFAULT_ACCOUNT_AUTO_REFRESH: AccountAutoRefresh = {
  enabled: false,
  interval: 900,
  minInterval: 120,
  refreshOnOpen: false,
}
