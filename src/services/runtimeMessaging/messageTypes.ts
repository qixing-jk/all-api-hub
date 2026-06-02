export const AutoCheckinMessageTypes = {
  RunNow: "autoCheckin:runNow",
  DebugTriggerDailyAlarmNow: "autoCheckin:debugTriggerDailyAlarmNow",
  DebugTriggerRetryAlarmNow: "autoCheckin:debugTriggerRetryAlarmNow",
  DebugResetLastDailyRunDay: "autoCheckin:debugResetLastDailyRunDay",
  DebugScheduleDailyAlarmForToday:
    "autoCheckin:debugScheduleDailyAlarmForToday",
  PretriggerDailyOnUiOpen: "autoCheckin:pretriggerDailyOnUiOpen",
  RetryAccount: "autoCheckin:retryAccount",
  GetAccountInfo: "autoCheckin:getAccountInfo",
  GetStatus: "autoCheckin:getStatus",
  UpdateSettings: "autoCheckin:updateSettings",
} as const

export const BalanceHistoryMessageTypes = {
  UpdateSettings: "balanceHistory:updateSettings",
  RefreshNow: "balanceHistory:refreshNow",
  Prune: "balanceHistory:prune",
} as const

export const UsageHistoryMessageTypes = {
  UpdateSettings: "usageHistory:updateSettings",
  SyncNow: "usageHistory:syncNow",
  Prune: "usageHistory:prune",
} as const

export const ModelSyncMessageTypes = {
  GetNextRun: "modelSync:getNextRun",
  TriggerAll: "modelSync:triggerAll",
  TriggerSelected: "modelSync:triggerSelected",
  TriggerFailedOnly: "modelSync:triggerFailedOnly",
  GetLastExecution: "modelSync:getLastExecution",
  GetProgress: "modelSync:getProgress",
  UpdateSettings: "modelSync:updateSettings",
  GetPreferences: "modelSync:getPreferences",
  GetChannelUpstreamModelOptions: "modelSync:getChannelUpstreamModelOptions",
  ListChannels: "modelSync:listChannels",
} as const

export const SiteAnnouncementsMessageTypes = {
  GetStatus: "siteAnnouncements:getStatus",
  ListRecords: "siteAnnouncements:listRecords",
  CheckNow: "siteAnnouncements:checkNow",
  MarkRead: "siteAnnouncements:markRead",
  MarkAllRead: "siteAnnouncements:markAllRead",
  UpdatePreferences: "siteAnnouncements:updatePreferences",
} as const

export const WebdavAutoSyncMessageTypes = {
  Setup: "webdavAutoSync:setup",
  SyncNow: "webdavAutoSync:syncNow",
  Stop: "webdavAutoSync:stop",
  UpdateSettings: "webdavAutoSync:updateSettings",
  GetStatus: "webdavAutoSync:getStatus",
} as const
