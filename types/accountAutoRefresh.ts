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

export const DEFAULT_ACCOUNT_AUTO_REFRESH: AccountAutoRefresh = {
  enabled: true,
  interval: 360,
  minInterval: 60,
  refreshOnOpen: true,
}
