/**
 * Canonical runtime message action prefixes used for prefix-based routing.
 *
 * Values are part of the on-the-wire contract between extension contexts and MUST remain stable.
 */
export const RuntimeActionPrefixes = {
  AutoCheckin: "autoCheckin:",
  AutoRefresh: "autoRefresh",
  ChannelConfig: "channelConfig:",
  ExternalCheckIn: "externalCheckIn:",
  ModelSync: "modelSync:",
  RedemptionAssist: "redemptionAssist:",
  UsageHistory: "usageHistory:",
  WebdavAutoSync: "webdavAutoSync:",
} as const

export type RuntimeActionPrefix =
  (typeof RuntimeActionPrefixes)[keyof typeof RuntimeActionPrefixes]

/**
 * Canonical runtime message action IDs.
 *
 * Values are part of the on-the-wire contract between extension contexts and MUST remain stable.
 */
export const RuntimeActionIds = {
  AccountDialogImportCookieAuthSessionCookie:
    "accountDialog:importCookieAuthSessionCookie",

  PermissionsCheck: "permissions:check",
  CloudflareGuardLog: "cloudflareGuardLog",

  OpenTempWindow: "openTempWindow",
  CloseTempWindow: "closeTempWindow",
  AutoDetectSite: "autoDetectSite",
  TempWindowFetch: "tempWindowFetch",
  TempWindowGetRenderedTitle: "tempWindowGetRenderedTitle",

  CookieInterceptorTrackUrl: "cookieInterceptor:trackUrl",

  OpenSettingsCheckinRedeem: "openSettings:checkinRedeem",
  OpenSettingsShieldBypass: "openSettings:shieldBypass",

  PreferencesUpdateActionClickBehavior: "preferences:updateActionClickBehavior",

  AutoRefreshSetup: "setupAutoRefresh",
  AutoRefreshRefreshNow: "refreshNow",
  AutoRefreshStop: "stopAutoRefresh",
  AutoRefreshUpdateSettings: "updateAutoRefreshSettings",
  AutoRefreshGetStatus: "getAutoRefreshStatus",

  AutoCheckinRunNow: "autoCheckin:runNow",
  AutoCheckinDebugTriggerDailyAlarmNow: "autoCheckin:debugTriggerDailyAlarmNow",
  AutoCheckinDebugTriggerRetryAlarmNow: "autoCheckin:debugTriggerRetryAlarmNow",
  AutoCheckinDebugResetLastDailyRunDay: "autoCheckin:debugResetLastDailyRunDay",
  AutoCheckinDebugScheduleDailyAlarmForToday:
    "autoCheckin:debugScheduleDailyAlarmForToday",
  AutoCheckinPretriggerDailyOnUiOpen: "autoCheckin:pretriggerDailyOnUiOpen",
  AutoCheckinRetryAccount: "autoCheckin:retryAccount",
  AutoCheckinGetAccountInfo: "autoCheckin:getAccountInfo",
  AutoCheckinGetStatus: "autoCheckin:getStatus",
  AutoCheckinUpdateSettings: "autoCheckin:updateSettings",
  AutoCheckinPretriggerStarted: "autoCheckinPretrigger:started",

  ChannelConfigGet: "channelConfig:get",
  ChannelConfigUpsertFilters: "channelConfig:upsertFilters",

  ExternalCheckInOpenAndMark: "externalCheckIn:openAndMark",

  ModelSyncGetNextRun: "modelSync:getNextRun",
  ModelSyncTriggerAll: "modelSync:triggerAll",
  ModelSyncTriggerSelected: "modelSync:triggerSelected",
  ModelSyncTriggerFailedOnly: "modelSync:triggerFailedOnly",
  ModelSyncGetLastExecution: "modelSync:getLastExecution",
  ModelSyncGetProgress: "modelSync:getProgress",
  ModelSyncUpdateSettings: "modelSync:updateSettings",
  ModelSyncGetPreferences: "modelSync:getPreferences",
  ModelSyncGetChannelUpstreamModelOptions:
    "modelSync:getChannelUpstreamModelOptions",
  ModelSyncListChannels: "modelSync:listChannels",

  RedemptionAssistUpdateSettings: "redemptionAssist:updateSettings",
  RedemptionAssistShouldPrompt: "redemptionAssist:shouldPrompt",
  RedemptionAssistAutoRedeem: "redemptionAssist:autoRedeem",
  RedemptionAssistAutoRedeemByUrl: "redemptionAssist:autoRedeemByUrl",
  RedemptionAssistContextMenuTrigger: "redemptionAssist:contextMenuTrigger",

  UsageHistoryUpdateSettings: "usageHistory:updateSettings",
  UsageHistorySyncNow: "usageHistory:syncNow",
  UsageHistoryPrune: "usageHistory:prune",

  WebdavAutoSyncSetup: "webdavAutoSync:setup",
  WebdavAutoSyncSyncNow: "webdavAutoSync:syncNow",
  WebdavAutoSyncStop: "webdavAutoSync:stop",
  WebdavAutoSyncUpdateSettings: "webdavAutoSync:updateSettings",
  WebdavAutoSyncGetStatus: "webdavAutoSync:getStatus",

  ContentGetLocalStorage: "getLocalStorage",
  ContentGetUserFromLocalStorage: "getUserFromLocalStorage",
  ContentCheckCloudflareGuard: "checkCloudflareGuard",
  ContentWaitAndGetUserInfo: "waitAndGetUserInfo",
  ContentPerformTempWindowFetch: "performTempWindowFetch",
  ContentGetRenderedTitle: "getRenderedTitle",
  ContentShowShieldBypassUi: "showShieldBypassUi",
} as const

export type RuntimeActionId =
  (typeof RuntimeActionIds)[keyof typeof RuntimeActionIds]

/**
 * Null-safe prefix matcher for runtime action routing.
 * @param action Incoming runtime message action value.
 * @param prefix Canonical prefix to match against.
 */
export function hasRuntimeActionPrefix(
  action: unknown,
  prefix: RuntimeActionPrefix,
): boolean {
  return typeof action === "string" && action.startsWith(prefix)
}

/**
 * Compose a runtime action ID from a canonical prefix and a suffix.
 *
 * This is useful for feature routes that build actions dynamically while preserving
 * the shipped on-the-wire prefix conventions.
 */
export function composeRuntimeAction<
  P extends RuntimeActionPrefix,
  S extends string,
>(prefix: P, suffix: S): `${P}${S}` {
  return `${prefix}${suffix}`
}

/**
 * Legacy auto-refresh matcher.
 *
 * Auto-refresh routes are a mix of:
 * - a loose prefix match for names like `autoRefresh*`
 * - a small set of legacy un-namespaced actions (e.g., `setupAutoRefresh`)
 *
 * This helper keeps router code readable while avoiding inline magic strings.
 */
export function isAutoRefreshRuntimeAction(action: unknown): boolean {
  return (
    typeof action === "string" &&
    (hasRuntimeActionPrefix(action, RuntimeActionPrefixes.AutoRefresh) ||
      action === RuntimeActionIds.AutoRefreshSetup ||
      action === RuntimeActionIds.AutoRefreshRefreshNow ||
      action === RuntimeActionIds.AutoRefreshStop ||
      action === RuntimeActionIds.AutoRefreshUpdateSettings ||
      action === RuntimeActionIds.AutoRefreshGetStatus)
  )
}
